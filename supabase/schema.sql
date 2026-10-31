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

-- 2.4 Políticas: recurring_expenses
DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas despesas recorrentes" ON public.recurring_expenses;
CREATE POLICY "Usuários gerenciam exclusivamente suas despesas recorrentes"
  ON public.recurring_expenses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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
GRANT UPDATE (title, target_amount, icon, color, deadline) ON public.savings_goals TO authenticated;

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
  -- ou se a role do banco não for admin/service_role:
  IF v_jwt_role IN ('authenticated', 'anon')
     OR (current_user NOT IN ('service_role', 'supabase_admin', 'postgres') AND v_jwt_role IS NULL) THEN
    NEW.plan_tier := OLD.plan_tier;
    NEW.subscription_status := OLD.subscription_status;
    NEW.trial_ends_at := OLD.trial_ends_at;
    NEW.current_period_end := OLD.current_period_end;
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

  -- Validação de integridade do usuário chamador contra impersonação
  IF v_jwt_role = 'authenticated' AND auth.uid() IS NOT NULL THEN
    IF NEW.user_id != auth.uid() THEN
      RAISE EXCEPTION 'Operação negada: o user_id informado não corresponde ao usuário autenticado.';
    END IF;
  END IF;

  -- Validação estrita do valor
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'O valor da contribuição deve ser maior que zero.';
  END IF;

  -- Trava a linha da meta com SELECT FOR UPDATE (garantia total contra race conditions)
  SELECT current_amount, user_id INTO STRICT v_current, v_goal_user_id
    FROM public.savings_goals
    WHERE id = NEW.goal_id
    FOR UPDATE;

  -- Validação de propriedade: a meta deve pertencer ao mesmo usuário
  IF v_goal_user_id != NEW.user_id THEN
    RAISE EXCEPTION 'Operação negada: a meta informada não pertence ao usuário.';
  END IF;

  -- Lógica de cálculo com bloqueio absoluto de saldo negativo
  IF NEW.type = 'deposit' THEN
    v_new_balance := v_current + NEW.amount;
  ELSIF NEW.type = 'withdraw' THEN
    IF NEW.amount > v_current THEN
      RAISE EXCEPTION 'Saldo insuficiente na meta. Saldo atual: R$ %, tentativa de retirada: R$ %',
        to_char(v_current, 'FM999G999G990D00'),
        to_char(NEW.amount, 'FM999G999G990D00');
    END IF;
    v_new_balance := v_current - NEW.amount;
  ELSE
    RAISE EXCEPTION 'Tipo de contribuição inválido: %', NEW.type;
  END IF;

  -- Atualização atômica do saldo da meta (dispara protect_goal_balance_trigger com pg_trigger_depth > 1)
  UPDATE public.savings_goals
    SET current_amount = v_new_balance
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

-- ==============================================================================
-- 6. PROTEÇÃO DE ACESSO ÀS FUNÇÕES (REVOKE EXECUTE DE TRIGGERS VIA RPC)
-- ==============================================================================

-- Funções de trigger NÃO devem ser invocáveis via RPC pelo PostgREST:
REVOKE ALL ON FUNCTION public.protect_profile_plan_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.initialize_goal_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_goal_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_goal_contribution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Apenas a RPC de exclusão pode ser executada por usuários autenticados:
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

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
