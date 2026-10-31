-- ==============================================================================
-- SCHEMA SUPABASE — FINANCEIRO EXPRESS SAAS (COMMERCIAL STORE-READY)
-- Versão: 2.1 — Validação Final de Segurança e Defesa em Profundidade
-- RLS ativo em 100% das tabelas
-- Proteção contra:
--   - Auto-upgrade para Premium via API / PostgREST
--   - Manipulação direta de current_amount nas metas (via UPDATE ou INSERT)
--   - Race conditions (double-spend / retiradas simultâneas via SELECT FOR UPDATE)
--   - Retirada com saldo insuficiente
--   - Contribuição em metas de terceiros
--   - Adulteração de histórico financeiro
--   - Chamada direta de triggers via RPC
-- ==============================================================================

-- Habilita extensão de UUID / criptografia
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABELAS (CREATE TABLE IF NOT EXISTS + MIGRAÇÃO SEGURA)
-- ==============================================================================

-- 1.1 Perfis de Usuário
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  plan_tier text NOT NULL DEFAULT 'free'
    CHECK (plan_tier IN ('free', 'premium')),
  subscription_status text NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'inactive')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  monthly_budget numeric(12,2) NOT NULL DEFAULT 3500.00,
  weekly_saving_target numeric(12,2) NOT NULL DEFAULT 250.00,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garante constraints não-negativas caso a tabela já existisse
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_monthly_budget_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_monthly_budget_check CHECK (monthly_budget >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_weekly_saving_target_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_weekly_saving_target_check CHECK (weekly_saving_target >= 0);
  END IF;
END $$;

-- 1.2 Transações (Receitas e Despesas)
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('expense', 'income')),
  category text NOT NULL CHECK (category IN (
    'Alimentação', 'Transporte', 'Moradia', 'Contas',
    'Saúde', 'Lazer', 'Compras', 'Salário', 'Outros'
  )),
  payment_method text NOT NULL DEFAULT 'pix' CHECK (payment_method IN (
    'pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'ted', 'outros'
  )),
  is_recurring boolean DEFAULT false,
  notes text,
  installment_group_id text,
  installment_number integer CHECK (installment_number IS NULL OR installment_number > 0),
  installment_total integer CHECK (installment_total IS NULL OR installment_total >= installment_number),
  installment_purchase_amount numeric(12,2) CHECK (installment_purchase_amount IS NULL OR installment_purchase_amount > 0),
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.3 Metas de Economia
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  target_amount numeric(12,2) NOT NULL CHECK (target_amount > 0),
  current_amount numeric(12,2) DEFAULT 0.00 NOT NULL CHECK (current_amount >= 0),
  icon text DEFAULT 'target',
  color text DEFAULT 'emerald',
  deadline date,
  is_completed boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.4 Despesas Recorrentes
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  category text NOT NULL CHECK (category IN (
    'Alimentação', 'Transporte', 'Moradia', 'Contas',
    'Saúde', 'Lazer', 'Compras', 'Salário', 'Outros'
  )),
  payment_method text NOT NULL DEFAULT 'cartao_credito' CHECK (payment_method IN (
    'pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'ted', 'outros'
  )),
  due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.5 Contribuições e Resgates de Metas
CREATE TABLE IF NOT EXISTS public.goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES public.savings_goals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('deposit', 'withdraw')),
  notes text,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 2. ROW LEVEL SECURITY (RLS) — ATIVAÇÃO E POLÍTICAS IDEMPOTENTES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

-- 2.1 Políticas: profiles
-- SELECT: apenas o próprio usuário
DROP POLICY IF EXISTS "Usuários podem ver apenas o próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem ver apenas o próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- UPDATE: apenas o próprio usuário (colunas restritas via GRANT)
DROP POLICY IF EXISTS "Usuários podem atualizar apenas o próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem atualizar apenas o próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Remove políticas legadas de INSERT/DELETE do cliente se existirem
DROP POLICY IF EXISTS "Usuários podem excluir o próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Inserção de perfil permitida apenas para o próprio usuário autenticado" ON public.profiles;

-- 2.2 Políticas: transactions
DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas próprias transações" ON public.transactions;
CREATE POLICY "Usuários gerenciam exclusivamente suas próprias transações"
  ON public.transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2.3 Políticas: savings_goals
DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas próprias metas" ON public.savings_goals;
CREATE POLICY "Usuários gerenciam exclusivamente suas próprias metas"
  ON public.savings_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2.4 Políticas: recurring_expenses (Exclusivo Premium para criação e edição)
DROP POLICY IF EXISTS "Usuários Premium gerenciam despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas despesas recorrentes" ON public.recurring_expenses;

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

-- 2.5 Políticas: goal_contributions (Imutável: somente SELECT e INSERT)
DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas contribuições de metas" ON public.goal_contributions;
DROP POLICY IF EXISTS "Usuários podem ver suas contribuições" ON public.goal_contributions;
CREATE POLICY "Usuários podem ver suas contribuições"
  ON public.goal_contributions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem inserir contribuições em suas próprias metas" ON public.goal_contributions;
CREATE POLICY "Usuários podem inserir contribuições em suas próprias metas"
  ON public.goal_contributions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.savings_goals sg
      WHERE sg.id = goal_id
        AND sg.user_id = auth.uid()
    )
  );

-- ==============================================================================
-- 3. PERMISSÕES DE TABELAS E COLUNAS (LEAST PRIVILEGE)
-- ==============================================================================

-- 3.1 profiles:
-- anon: bloqueado 100%
-- authenticated: SELECT permitido; INSERT e DELETE proibidos; UPDATE restrito às 4 colunas não-sensíveis
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url, monthly_budget, weekly_saving_target) ON public.profiles TO authenticated;

-- 3.2 savings_goals:
-- anon: bloqueado 100%
-- authenticated: SELECT, INSERT, DELETE permitidos; UPDATE restrito (current_amount NÃO pode ser atualizado pelo cliente)
REVOKE ALL ON public.savings_goals FROM anon;
GRANT SELECT, INSERT, DELETE ON public.savings_goals TO authenticated;
REVOKE UPDATE ON public.savings_goals FROM authenticated;
GRANT UPDATE (title, target_amount, icon, color, deadline, is_completed) ON public.savings_goals TO authenticated;

-- 3.3 goal_contributions:
-- anon: bloqueado 100%
-- authenticated: SELECT e INSERT permitidos; UPDATE e DELETE proibidos (histórico financeiro imutável)
REVOKE ALL ON public.goal_contributions FROM anon;
REVOKE UPDATE, DELETE ON public.goal_contributions FROM authenticated;
GRANT SELECT, INSERT ON public.goal_contributions TO authenticated;

-- 3.4 transactions:
REVOKE ALL ON public.transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;

-- 3.5 recurring_expenses:
REVOKE ALL ON public.recurring_expenses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;

-- ==============================================================================
-- 4. ÍNDICES DE PERFORMANCE
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category
  ON public.transactions (user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_installment_group
  ON public.transactions (installment_group_id)
  WHERE installment_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_savings_goals_user
  ON public.savings_goals (user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_user
  ON public.recurring_expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal
  ON public.goal_contributions (goal_id, user_id);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_user
  ON public.goal_contributions (user_id, created_at DESC);

-- ==============================================================================
-- 5. FUNÇÕES E TRIGGERS DE SEGURANÇA
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 5.1 Proteção de campos de plano no perfil (Premium, Status, Datas)
--
-- ANÁLISE TÉCNICA:
-- Esta função é propositalmente SECURITY INVOKER (padrão) para refletir a role
-- do chamador (auth.role() = 'authenticated').
-- Se a requisição vier via PostgREST/Supabase Auth de um usuário comum:
-- 1. O Column-Level GRANT já impede que ele envie `plan_tier` no UPDATE.
-- 2. COMO DEFESA ADICIONAL: este trigger reverte plan_tier, subscription_status,
--    trial_ends_at e current_period_end para o valor OLD caso o usuário não seja
--    um serviço administrativo ('service_role' ou superuser postgres).
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_plan_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  -- Obtém o role do JWT PostgREST do Supabase
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Se a requisição veio de um usuário comum (authenticated) ou anônimo,
  -- e tentou alterar o plano ou status de assinatura, rejeita estritamente:
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

  -- Protege campos estruturais imutáveis do perfil
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;

  -- Atualiza timestamp de modificação
  NEW.updated_at := timezone('utc'::text, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_plan_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_plan_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_plan_fields();

-- ------------------------------------------------------------------------------
-- 5.2 Inicialização segura de metas (Sem injeção de saldo inicial)
--
-- Garante que toda meta criada pelo cliente sempre inicie com current_amount = 0.00.
-- O saldo só pode ser acumulado via depósitos registrados em goal_contributions.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.initialize_goal_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Metas novas criadas pelo cliente sempre iniciam com saldo ZERO
  IF coalesce(auth.jwt() ->> 'role', auth.role()) IN ('authenticated', 'anon') THEN
    NEW.current_amount := 0.00;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_goal_balance_trigger ON public.savings_goals;
CREATE TRIGGER initialize_goal_balance_trigger
  BEFORE INSERT ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.initialize_goal_balance();

-- ------------------------------------------------------------------------------
-- 5.3 Proteção do saldo das metas contra UPDATE direto
--
-- Impede que o cliente altere current_amount diretamente via UPDATE.
-- Permite que a atualização ocorra legitimamente quando disparada por
-- apply_goal_contribution (onde pg_trigger_depth() > 1).
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_goal_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Se o UPDATE for direto (profundidade 1) por um usuário autenticado comum,
  -- preserva estritamente o current_amount original (não permite modificação)
  IF pg_trigger_depth() <= 1 AND coalesce(auth.jwt() ->> 'role', auth.role()) IN ('authenticated', 'anon') THEN
    NEW.current_amount := OLD.current_amount;
  END IF;

  -- Protege integridade de campos imutáveis
  NEW.user_id := OLD.user_id;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_goal_balance_trigger ON public.savings_goals;
CREATE TRIGGER protect_goal_balance_trigger
  BEFORE UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.protect_goal_balance();

-- ------------------------------------------------------------------------------
-- 5.4 Aplicação atômica e segura de contribuições e resgates
--
-- ATOMICIDADE E CONCORRÊNCIA:
-- 1. Executa com SECURITY DEFINER (para ter autorização de atualizar current_amount).
-- 2. Executa SELECT current_amount, user_id FROM savings_goals WHERE id = ... FOR UPDATE.
--    O "FOR UPDATE" adquire um lock exclusivo na linha da meta, serializando
--    todas as contribuições simultâneas e eliminando qualquer risco de race condition.
-- 3. Valida expressamente que a meta pertence ao mesmo user_id do autor da requisição.
-- 4. Rejeita qualquer retirada que supere o saldo atualizado em tempo real.
-- 5. Atualiza current_amount e conclui a transação de forma indivisível.
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

  -- Validação estrita de integridade e autenticação
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

  -- Validação estrita do valor
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'O valor da contribuição deve ser maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Trava a linha da meta com SELECT FOR UPDATE (garantia total contra race conditions)
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

  -- Lógica de cálculo com bloqueio absoluto de saldo negativo
  IF NEW.type = 'deposit' THEN
    -- Impede novos depósitos em meta que já atingiu 100% (concluída)
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

  -- Atualização atômica do saldo da meta e do status de conclusão caso tenha atingido o alvo
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
-- 5.5 Criação automática de perfil ao cadastrar no Supabase Auth
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    plan_tier,
    subscription_status,
    monthly_budget,
    weekly_saving_target
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'free',
    'trialing',
    3500.00,
    250.00
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 5.6 Exclusão completa de conta (Conformidade App Store / Play Store)
-- Valida autenticação antes de executar e opera exclusivamente no auth.uid()
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Garante que há um usuário autenticado na requisição
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado. Operação negada.';
  END IF;

  -- Exclui dependências financeiras do usuário de forma ordenada
  DELETE FROM public.goal_contributions WHERE user_id = v_user_id;
  DELETE FROM public.savings_goals WHERE user_id = v_user_id;
  DELETE FROM public.recurring_expenses WHERE user_id = v_user_id;
  DELETE FROM public.transactions WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Exclui o registro do auth.users (cascateamento completo)
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5.7 Enforcement de limite de metas (Máximo 2 ativas no Free, ilimitado no Premium)
-- Lock FOR UPDATE no perfil previne race conditions
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
  -- Se o trigger foi disparado internamente por outra função (ex: apply_goal_contribution), não bloqueia
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Obtém role do JWT
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Defesa em profundidade: validação estrita de autenticação e integridade do user_id
  IF v_jwt_role IN ('authenticated', 'anon') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
      -- Clientes SEMPRE iniciam meta com saldo zero
      NEW.current_amount := 0.00;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.user_id := OLD.user_id;
      NEW.current_amount := OLD.current_amount;
    END IF;
  END IF;

  -- Proibição estrita: não permite marcar is_completed = true em meta com saldo 0
  IF NEW.is_completed = true AND NEW.current_amount = 0 THEN
    RAISE EXCEPTION 'Uma meta com saldo zero não pode ser marcada como concluída. Caso deseje cancelá-la, exclua a meta.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Se atingiu o alvo, força conclusão automática
  IF NEW.current_amount >= NEW.target_amount THEN
    NEW.is_completed := true;
  END IF;

  -- Determina se a meta é ativa (não concluída e com saldo menor que o alvo)
  v_is_new_active := (COALESCE(NEW.is_completed, false) = false AND NEW.current_amount < NEW.target_amount);

  -- Se a meta não for ativa, não consome limite
  IF NOT v_is_new_active THEN
    RETURN NEW;
  END IF;

  -- Se for UPDATE e a meta já era ativa anteriormente, não está adicionando nova meta ativa
  IF TG_OP = 'UPDATE' THEN
    IF (COALESCE(OLD.is_completed, false) = false AND OLD.current_amount < OLD.target_amount) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Lock no perfil do usuário para serializar requisições concorrentes
  SELECT plan_tier INTO v_plan_tier
  FROM public.profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
  END IF;

  -- Usuários Premium têm metas ilimitadas
  IF v_plan_tier = 'premium' THEN
    RETURN NEW;
  END IF;

  -- Conta metas ativas existentes do usuário
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
-- 5.8 Enforcement de Despesas Recorrentes (Exclusivo Premium e ciclo pós-downgrade)
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

  -- Força autenticação e user_id pertencente ao usuário autenticado
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

  SELECT plan_tier INTO v_plan_tier
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
  END IF;

  -- Premium tem acesso total
  IF v_plan_tier = 'premium' THEN
    RETURN NEW;
  END IF;

  -- Usuário Free:
  -- 1. INSERT proibido
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Despesas recorrentes são exclusivas do Plano Premium. Faça upgrade para cadastrar contas fixas e assinaturas.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. UPDATE pós-downgrade: permite apenas desativação (is_active = false)
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
-- 5.9 RPC Administrativa para Alteração de Plano (Webhooks / Service Role)
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

  -- Validação estrita: somente service_role ou superusuário postgres
  IF v_jwt_role IN ('service_role', 'supabase_admin') THEN
    v_is_authorized := true;
  ELSIF current_user IN ('service_role', 'supabase_admin', 'postgres') AND v_jwt_role IS NULL THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Acesso negado: operação administrativa restrita à service_role oficial de pagamentos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

-- ==============================================================================
-- 6. PROTEÇÃO DE ACESSO ÀS FUNÇÕES (REVOKE EXECUTE DE TRIGGERS VIA RPC)
-- ==============================================================================

-- Funções de trigger NÃO devem ser invocáveis via RPC pelo PostgREST:
REVOKE ALL ON FUNCTION public.protect_profile_plan_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.initialize_goal_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_goal_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_goal_contribution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_savings_goal_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_recurring_expense_premium() FROM PUBLIC, anon, authenticated;

-- Apenas a RPC de exclusão pode ser executada por usuários autenticados:
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- Apenas service_role pode executar a RPC administrativa de alteração de plano:
REVOKE ALL ON FUNCTION public.admin_set_user_plan(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_plan(uuid, text, text, integer) TO service_role;

-- ==============================================================================
-- 7. ROTEIRO DE TESTES DE VALIDAÇÃO (NÃO EXECUTAR AUTOMATICAMENTE)
-- ==============================================================================

/*
-- TESTE 1: Tentativa de alteração direta de Premium via UPDATE
-- Executar autenticado como usuário comum:
UPDATE profiles SET plan_tier = 'premium', subscription_status = 'active' WHERE id = auth.uid();
-- Esperado: plan_tier e subscription_status permanecem inalterados.

-- TESTE 2: Tentativa de criação de meta com saldo inicial forjado
-- Executar autenticado:
INSERT INTO savings_goals (title, target_amount, current_amount) VALUES ('Meta Hack', 10000, 50000);
-- Esperado: Meta criada com current_amount = 0.00 (trigger initialize_goal_balance força zero).

-- TESTE 3: Tentativa de alteração direta do saldo da meta via UPDATE
UPDATE savings_goals SET current_amount = 999999 WHERE user_id = auth.uid();
-- Esperado: current_amount permanece inalterado.

-- TESTE 4: Tentativa de retirada com saldo insuficiente
INSERT INTO goal_contributions (goal_id, user_id, amount, type)
VALUES ('<id-meta-com-saldo-0>', auth.uid(), 100.00, 'withdraw');
-- Esperado: EXCEPTION 'Saldo insuficiente na meta...' (transação abortada).

-- TESTE 5: Tentativa de inserir contribuição em meta de outro usuário
INSERT INTO goal_contributions (goal_id, user_id, amount, type)
VALUES ('<id-meta-outro-usuario>', auth.uid(), 50.00, 'deposit');
-- Esperado: Bloqueio imediato pelo RLS e pelo trigger.

-- TESTE 6: Tentativa de chamar função de trigger via RPC
-- Chamar POST /rest/v1/rpc/protect_profile_plan_fields
-- Esperado: 403 Forbidden / Permission denied.
*/

-- ==============================================================================
-- FIM DO SCHEMA — Financeiro Express v2.1
-- ==============================================================================
