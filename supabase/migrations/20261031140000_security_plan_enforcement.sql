-- ==============================================================================
-- MIGRATION: 20261031140000_security_plan_enforcement.sql
-- ETAPA 9.1 — SEGURANÇA E ENFORCEMENT FREE/PREMIUM NO BACKEND (REVISADA)
-- ==============================================================================
-- Proteções implementadas:
-- 1. Coluna `is_completed` em `savings_goals` para ciclo de vida de metas
-- 2. Trigger `check_savings_goal_limit`: Máximo de 2 metas ativas no plano Free,
--    ilimitado no Premium.
--    - Força NEW.user_id := auth.uid() para prevenir DoS em perfis alheios
--    - Força NEW.current_amount := 0.00 no INSERT para evitar bypass de limite
--    - Lock pessimista (FOR UPDATE) no perfil do usuário contra race conditions
-- 3. Trigger `check_recurring_expense_premium`: Apenas usuários Premium podem criar
--    ou reativar despesas recorrentes no PostgreSQL (INSERT/UPDATE).
-- 4. Trigger `protect_profile_plan_fields`: Rejeição estrita com EXCEPTION caso
--    usuários anon ou authenticated tentem alterar `plan_tier` ou datas de assinatura.
-- 5. RPC `admin_set_user_plan`: Função segura com SECURITY DEFINER executável apenas
--    pela `service_role` (webhooks Stripe/RevenueCat/App Store/Play Store).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADICIONA COLUNA is_completed NA TABELA savings_goals (SE NÃO EXISTIR)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'savings_goals' 
      AND column_name = 'is_completed'
  ) THEN
    ALTER TABLE public.savings_goals ADD COLUMN is_completed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Índice para acelerar a contagem de metas ativas por usuário
CREATE INDEX IF NOT EXISTS idx_savings_goals_active_user
  ON public.savings_goals (user_id)
  WHERE is_completed = false;

-- Atualiza permissão de colunas em savings_goals para incluir is_completed
REVOKE UPDATE ON public.savings_goals FROM authenticated;
GRANT UPDATE (title, target_amount, icon, color, deadline, is_completed) 
  ON public.savings_goals TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. BLINDAGEM REFORÇADA CONTRA ALTERAÇÃO DE PLANO PELO CLIENTE (PROFILES)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_plan_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  -- Identifica a role no token JWT da requisição PostgREST
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Se o chamador for usuário comum (authenticated/anon) e tentar alterar campos sensíveis
  IF (NEW.plan_tier IS DISTINCT FROM OLD.plan_tier)
     OR (NEW.subscription_status IS DISTINCT FROM OLD.subscription_status)
     OR (NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at)
     OR (NEW.current_period_end IS DISTINCT FROM OLD.current_period_end) THEN

    IF v_jwt_role IN ('authenticated', 'anon')
       OR (current_user NOT IN ('service_role', 'supabase_admin', 'postgres') AND v_jwt_role IS NULL) THEN
      RAISE EXCEPTION 'Acesso negado: a alteração de plano ou status de assinatura só pode ser realizada pelo serviço administrativo oficial.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Protege integridade de campos imutáveis do perfil
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := timezone('utc'::text, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_plan_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_plan_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_plan_fields();

-- ------------------------------------------------------------------------------
-- 3. ENFORCEMENT DE METAS NO BANCO (MÁXIMO 2 ATIVAS NO FREE, ILIMITADO NO PREMIUM)
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
  -- Se o trigger foi disparado internamente por outra função confiável
  -- (ex: apply_goal_contribution), não bloqueia
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Obtém role do JWT
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Defesa em profundidade: força integridade do user_id
  IF v_jwt_role IN ('authenticated', 'anon') AND auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
      -- Clientes SEMPRE iniciam meta com saldo zero (elimina bypass de ordem de triggers)
      NEW.current_amount := 0.00;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.user_id := OLD.user_id;
    END IF;
  END IF;

  -- Determina se a meta sendo gravada é ativa
  -- (não concluída e ainda com saldo menor que o objetivo)
  v_is_new_active := (COALESCE(NEW.is_completed, false) = false AND NEW.current_amount < NEW.target_amount);

  -- Se a meta não for ativa (ex: já concluída), ela não consome vaga no limite
  IF NOT v_is_new_active THEN
    RETURN NEW;
  END IF;

  -- Se for UPDATE e a meta já era ativa anteriormente, não está adicionando nova meta ativa
  IF TG_OP = 'UPDATE' THEN
    IF (COALESCE(OLD.is_completed, false) = false AND OLD.current_amount < OLD.target_amount) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Trava a linha do perfil do usuário com SELECT ... FOR UPDATE
  -- Isso serializa requisições simultâneas e previne condição de corrida (race condition)
  SELECT plan_tier INTO v_plan_tier
  FROM public.profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  -- Fallback de segurança caso o perfil ainda esteja sendo provisionado
  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
  END IF;

  -- Usuários do plano Premium têm metas ativas ilimitadas
  IF v_plan_tier = 'premium' THEN
    RETURN NEW;
  END IF;

  -- Para usuários Free: conta quantas metas ativas o usuário já possui
  -- (exclui a própria linha se for operação de UPDATE)
  SELECT COUNT(*) INTO v_active_count
  FROM public.savings_goals
  WHERE user_id = NEW.user_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND is_completed = false
    AND current_amount < target_amount;

  -- Se já atingiu ou ultrapassou 2 metas ativas, bloqueia imediatamente com erro
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
-- 4. ENFORCEMENT DE DESPESAS RECORRENTES (EXCLUSIVO PREMIUM NO BANCO)
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

  -- Força user_id pertencente ao usuário autenticado
  IF v_jwt_role IN ('authenticated', 'anon') AND auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.user_id := OLD.user_id;
    END IF;
  END IF;

  -- Obtém o plano do usuário diretamente do perfil
  SELECT plan_tier INTO v_plan_tier
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_plan_tier IS DISTINCT FROM 'premium' THEN
    RAISE EXCEPTION 'Despesas recorrentes são exclusivas do Plano Premium. Faça upgrade para cadastrar contas fixas e assinaturas.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_recurring_expense_premium_trigger ON public.recurring_expenses;
CREATE TRIGGER check_recurring_expense_premium_trigger
  BEFORE INSERT OR UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.check_recurring_expense_premium();

-- Reforça RLS para recurring_expenses: INSERT e UPDATE apenas para Premium
DROP POLICY IF EXISTS "Usuários Premium gerenciam despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários podem ver suas despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários podem ver e excluir suas despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários Premium podem inserir despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários Premium podem atualizar suas despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários podem excluir suas despesas recorrentes" ON public.recurring_expenses;

CREATE POLICY "Usuários podem ver suas despesas recorrentes"
  ON public.recurring_expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários Premium podem inserir despesas recorrentes"
  ON public.recurring_expenses FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.plan_tier = 'premium'
    )
  );

CREATE POLICY "Usuários Premium podem atualizar suas despesas recorrentes"
  ON public.recurring_expenses FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.plan_tier = 'premium'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.plan_tier = 'premium'
    )
  );

CREATE POLICY "Usuários podem excluir suas despesas recorrentes"
  ON public.recurring_expenses FOR DELETE
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 5. RPC ADMINISTRATIVA PARA ALTERAÇÃO DE PLANO (WEBHOOKS / ADMIN)
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
BEGIN
  -- Identifica o papel da requisição
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Validação estrita: somente service_role ou postgres
  IF v_jwt_role NOT IN ('service_role', 'supabase_admin')
     AND current_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
    RAISE EXCEPTION 'Acesso negado: operação administrativa restrita ao webhook oficial de pagamentos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_plan_tier NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Plano inválido: %', p_plan_tier;
  END IF;

  UPDATE public.profiles
  SET
    plan_tier = p_plan_tier,
    subscription_status = p_subscription_status,
    current_period_end = CASE
      WHEN p_plan_tier = 'premium' THEN timezone('utc'::text, now()) + (p_duration_days || ' days')::interval
      ELSE NULL
    END,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_user_id;
END;
$$;

-- Revoga execução pública e concede apenas a service_role
REVOKE ALL ON FUNCTION public.admin_set_user_plan(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plan(uuid, text, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.check_savings_goal_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_recurring_expense_premium() FROM PUBLIC, anon, authenticated;
