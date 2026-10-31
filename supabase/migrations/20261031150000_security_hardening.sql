-- ==============================================================================
-- MIGRATION: 20261031150000_security_hardening.sql
-- ETAPA 9.2 — HARDENING FINAL DO SUPABASE
-- ==============================================================================
-- Proteções incrementais implementadas:
-- 1. METAS:
--    - Proibição estrita de marcar `is_completed = true` em metas com saldo zero (elimina metas fantasmas para burlar limite).
--    - Bloqueio de depósitos em metas já concluídas (exige reativação explícita com validação de limite).
--    - Imutabilidade garantida de `user_id` em UPDATE e forçamento de `auth.uid()` em INSERT.
--    - Proteção contínua contra race conditions via `SELECT plan_tier ... FOR UPDATE`.
-- 2. IDENTIDADE:
--    - Rejeição explícita de operações de clientes sem autenticação válida (`auth.uid() IS NULL`).
--    - Proteção contra manipulação de `user_id` de terceiros em todas as tabelas e triggers.
-- 3. RPC ADMINISTRATIVA:
--    - `admin_set_user_plan` estritamente blindada contra identidades nulas, aceitando apenas `service_role`.
--    - Validação de integridade de parâmetros (status, duração > 0, existência de perfil).
-- 4. DESPESAS RECORRENTES (CICLO DE VIDA PÓS-DOWNGRADE):
--    - Preserva dados históricos sem exclusão forçada pós-expiração de assinatura.
--    - Permite visualização (SELECT), exclusão (DELETE) e desativação legítima (`is_active = false`).
--    - Bloqueia novas criações (INSERT) e reativações (`is_active = true`) por usuários Free.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDENING DE METAS DE ECONOMIA (savings_goals)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_savings_goal_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan_tier text;
  v_active_count integer;
  v_is_new_active boolean;
  v_jwt_role text;
BEGIN
  -- Se o trigger foi disparado internamente por apply_goal_contribution, não bloqueia
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Identifica o papel na requisição PostgREST
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- 1.1 Validação de Autenticação e Integridade de Identidade
  IF v_jwt_role IN ('authenticated', 'anon') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
      -- Clientes sempre iniciam com saldo 0.00
      NEW.current_amount := 0.00;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.user_id := OLD.user_id;
      -- Protege current_amount contra alteração direta no UPDATE
      NEW.current_amount := OLD.current_amount;
    END IF;
  END IF;

  -- 1.2 Regra de Conclusão Consistente: Proíbe marcar is_completed = true em meta com saldo 0
  IF NEW.is_completed = true AND NEW.current_amount = 0 THEN
    RAISE EXCEPTION 'Uma meta com saldo zero não pode ser marcada como concluída. Caso deseje cancelá-la, exclua a meta.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Se a meta atingiu o saldo alvo, força is_completed = true automaticamente
  IF NEW.current_amount >= NEW.target_amount THEN
    NEW.is_completed := true;
  END IF;

  -- 1.3 Determina se a meta é ativa (não concluída e com saldo menor que o alvo)
  v_is_new_active := (COALESCE(NEW.is_completed, false) = false AND NEW.current_amount < NEW.target_amount);

  -- Se a meta não for ativa, permite sem consumir limite
  IF NOT v_is_new_active THEN
    RETURN NEW;
  END IF;

  -- Se for UPDATE e a meta já era ativa anteriormente, não está aumentando o número de ativas
  IF TG_OP = 'UPDATE' THEN
    IF (COALESCE(OLD.is_completed, false) = false AND OLD.current_amount < OLD.target_amount) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- 1.4 Lock pessimista no perfil do usuário para prevenir race conditions
  SELECT plan_tier INTO v_plan_tier
  FROM public.profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
  END IF;

  -- Usuários Premium têm metas ativas ilimitadas
  IF v_plan_tier = 'premium' THEN
    RETURN NEW;
  END IF;

  -- 1.5 Valida o limite de até 2 metas ativas no plano Free
  SELECT COUNT(*) INTO v_active_count
  FROM public.savings_goals
  WHERE user_id = NEW.user_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND is_completed = false
    AND current_amount < target_amount;

  IF v_active_count >= 2 THEN
    RAISE EXCEPTION 'Limite de metas ativas excedido. O plano gratuito permite no máximo 2 metas ativas simultâneas. Conclua uma meta existente ou faça upgrade para o Plano Premium.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_savings_goal_limit_trigger ON public.savings_goals;
CREATE TRIGGER check_savings_goal_limit_trigger
  BEFORE INSERT OR UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.check_savings_goal_limit();

-- ------------------------------------------------------------------------------
-- 2. HARDENING DE CONTRIBUIÇÕES DE METAS (Bloqueio de depósito em meta concluída)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_goal_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current numeric(12,2);
  v_target numeric(12,2);
  v_is_completed boolean;
  v_goal_user_id uuid;
  v_new_balance numeric(12,2);
  v_jwt_role text;
BEGIN
  -- Obtém role do usuário chamador
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Validação estrita de autenticação e identidade
  IF v_jwt_role IN ('authenticated', 'anon') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.user_id != auth.uid() THEN
      RAISE EXCEPTION 'Operação negada: o user_id informado não corresponde ao usuário autenticado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Validação do valor da operação
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'O valor da contribuição deve ser maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Trava a linha da meta com SELECT FOR UPDATE (garantia contra race condition)
  SELECT current_amount, target_amount, is_completed, user_id
    INTO STRICT v_current, v_target, v_is_completed, v_goal_user_id
    FROM public.savings_goals
    WHERE id = NEW.goal_id
    FOR UPDATE;

  -- Validação de propriedade: a meta deve pertencer ao mesmo usuário
  IF v_goal_user_id != NEW.user_id THEN
    RAISE EXCEPTION 'Operação negada: a meta informada não pertence ao usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lógica de contribuição e resgate
  IF NEW.type = 'deposit' THEN
    -- Impede novos depósitos em meta que já foi concluída/arquivada (deve reabrir primeiro)
    IF v_is_completed = true AND v_current >= v_target THEN
      RAISE EXCEPTION 'Esta meta já atingiu o objetivo de 100%%. Reabra ou crie uma nova meta para novos depósitos.'
        USING ERRCODE = 'check_violation';
    END IF;

    v_new_balance := v_current + NEW.amount;
  ELSIF NEW.type = 'withdraw' THEN
    IF NEW.amount > v_current THEN
      RAISE EXCEPTION 'Saldo insuficiente na meta. Saldo atual: R$ %, tentativa de retirada: R$ %',
        to_char(v_current, 'FM999G999G990D00'),
        to_char(NEW.amount, 'FM999G999G990D00')
        USING ERRCODE = 'check_violation';
    END IF;
    v_new_balance := v_current - NEW.amount;
  ELSE
    RAISE EXCEPTION 'Tipo de contribuição inválido: %', NEW.type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Atualiza o saldo atômico e o status de conclusão caso tenha atingido a meta
  UPDATE public.savings_goals
    SET
      current_amount = v_new_balance,
      is_completed = CASE
        WHEN v_new_balance >= v_target THEN true
        ELSE is_completed
      END
    WHERE id = NEW.goal_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_goal_contribution_trigger ON public.goal_contributions;
CREATE TRIGGER apply_goal_contribution_trigger
  BEFORE INSERT ON public.goal_contributions
  FOR EACH ROW EXECUTE FUNCTION public.apply_goal_contribution();

-- ------------------------------------------------------------------------------
-- 3. HARDENING DE DESPESAS RECORRENTES (CICLO PÓS-DOWNGRADE)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_recurring_expense_premium()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan_tier text;
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Validação de autenticação e identidade
  IF v_jwt_role IN ('authenticated', 'anon') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.user_id := OLD.user_id;
    END IF;
  END IF;

  -- Consulta plano do usuário
  SELECT plan_tier INTO v_plan_tier
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
  END IF;

  -- Usuário Premium tem acesso total
  IF v_plan_tier = 'premium' THEN
    RETURN NEW;
  END IF;

  -- Usuário Free:
  -- Proibido cadastrar nova despesa recorrente
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Despesas recorrentes são exclusivas do Plano Premium. Faça upgrade para cadastrar contas fixas e assinaturas.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Pós-downgrade no UPDATE:
  -- Permite apenas desativação (is_active = false). Proíbe ativar despesa (is_active = true)
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_active = true THEN
      RAISE EXCEPTION 'Não é permitido reativar despesas recorrentes no Plano Gratuito. Faça upgrade para o Plano Premium.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_recurring_expense_premium_trigger ON public.recurring_expenses;
CREATE TRIGGER check_recurring_expense_premium_trigger
  BEFORE INSERT OR UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.check_recurring_expense_premium();

-- ------------------------------------------------------------------------------
-- 4. HARDENING DA RPC ADMINISTRATIVA (admin_set_user_plan)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
  p_user_id uuid,
  p_plan_tier text,
  p_subscription_status text DEFAULT 'active',
  p_duration_days integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role text;
  v_is_authorized boolean := false;
BEGIN
  -- Extrai role do JWT PostgREST
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Validação estrita: somente service_role ou postgres
  IF v_jwt_role IN ('service_role', 'supabase_admin') THEN
    v_is_authorized := true;
  ELSIF current_user IN ('service_role', 'supabase_admin', 'postgres') AND v_jwt_role IS NULL THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Acesso negado: operação administrativa restrita à service_role oficial de pagamentos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validação estrita de parâmetros
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetro p_user_id é obrigatório.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_plan_tier NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Plano inválido: %. Valores aceitos: free, premium.', p_plan_tier
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_subscription_status NOT IN ('active', 'trialing', 'past_due', 'canceled', 'inactive') THEN
    RAISE EXCEPTION 'Status de assinatura inválido: %.', p_subscription_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_duration_days IS NOT NULL AND p_duration_days <= 0 THEN
    RAISE EXCEPTION 'Duração da assinatura em dias deve ser maior que zero.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Atualiza o perfil do usuário
  UPDATE public.profiles
  SET
    plan_tier = p_plan_tier,
    subscription_status = p_subscription_status,
    current_period_end = CASE
      WHEN p_plan_tier = 'premium' THEN timezone('utc'::text, now()) + (COALESCE(p_duration_days, 30) || ' days')::interval
      ELSE NULL
    END,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de usuário não encontrado para o ID: %', p_user_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Permissões de execução da RPC administrativa
REVOKE ALL ON FUNCTION public.admin_set_user_plan(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plan(uuid, text, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.check_savings_goal_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_recurring_expense_premium() FROM PUBLIC, anon, authenticated;

