-- ==============================================================================
-- SCHEMA SUPABASE — FINANCEIRO EXPRESS SAAS (COMMERCIAL STORE-READY)
-- Versão: 2.0 — Segurança Reforçada
-- RLS ativo em 100% das tabelas
-- Proteção contra: alteração de Premium, manipulação de saldo, retirada
-- excessiva, concorrência, acesso cruzado entre usuários
-- Idempotente: pode ser executado múltiplas vezes sem erro
-- ==============================================================================

-- Habilita extensão de UUID caso necessário
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABELAS
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
  monthly_budget numeric(12,2) NOT NULL DEFAULT 3500.00
    CHECK (monthly_budget >= 0),
  weekly_saving_target numeric(12,2) NOT NULL DEFAULT 250.00
    CHECK (weekly_saving_target >= 0),
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
-- 2. ROW LEVEL SECURITY — ISOLAMENTO ESTRITO POR USUÁRIO
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2.1 Políticas: profiles
-- Perfil é criado SOMENTE pelo trigger (sem INSERT do cliente)
-- Perfil é excluído SOMENTE via RPC delete_user_account (sem DELETE do cliente)
-- Usuário pode ver e editar apenas o próprio perfil (colunas restritas via GRANT)
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Usuários podem ver apenas o próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem ver apenas o próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuários podem atualizar apenas o próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem atualizar apenas o próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Remove políticas antigas que permitiam INSERT/DELETE direto do cliente
DROP POLICY IF EXISTS "Usuários podem excluir o próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Inserção de perfil permitida apenas para o próprio usuário autenticado" ON public.profiles;

-- ------------------------------------------------------------------------------
-- 2.2 Políticas: transactions
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas próprias transações" ON public.transactions;
CREATE POLICY "Usuários gerenciam exclusivamente suas próprias transações"
  ON public.transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2.3 Políticas: savings_goals
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas próprias metas" ON public.savings_goals;
CREATE POLICY "Usuários gerenciam exclusivamente suas próprias metas"
  ON public.savings_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2.4 Políticas: recurring_expenses
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Usuários gerenciam exclusivamente suas despesas recorrentes" ON public.recurring_expenses;
CREATE POLICY "Usuários gerenciam exclusivamente suas despesas recorrentes"
  ON public.recurring_expenses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2.5 Políticas: goal_contributions
-- Imutável do cliente: SELECT + INSERT apenas, sem UPDATE/DELETE
-- INSERT valida que goal_id pertence ao mesmo user_id
-- ------------------------------------------------------------------------------

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
-- 3. PERMISSÕES DE COLUNA (COLUMN-LEVEL GRANTS)
-- ==============================================================================

-- 3.1 profiles: bloqueia anon completamente; authenticated não pode INSERT/DELETE
-- Authenticated pode UPDATE apenas: full_name, avatar_url, monthly_budget, weekly_saving_target
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url, monthly_budget, weekly_saving_target) ON public.profiles TO authenticated;

-- 3.2 savings_goals: authenticated pode SELECT, INSERT, DELETE
-- UPDATE restrito: title, target_amount, icon, color, deadline (NÃO current_amount)
REVOKE ALL ON public.savings_goals FROM anon;
GRANT SELECT, INSERT, DELETE ON public.savings_goals TO authenticated;
REVOKE UPDATE ON public.savings_goals FROM authenticated;
GRANT UPDATE (title, target_amount, icon, color, deadline) ON public.savings_goals TO authenticated;

-- 3.3 goal_contributions: imutável — SELECT + INSERT apenas
REVOKE ALL ON public.goal_contributions FROM anon;
REVOKE UPDATE, DELETE ON public.goal_contributions FROM authenticated;
GRANT SELECT, INSERT ON public.goal_contributions TO authenticated;

-- 3.4 transactions: acesso completo para authenticated, bloqueado para anon
REVOKE ALL ON public.transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;

-- 3.5 recurring_expenses: acesso completo para authenticated, bloqueado para anon
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
-- 5. FUNÇÕES E TRIGGERS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 5.1 Proteção de campos Premium no perfil
-- Impede que usuários comuns alterem plan_tier, subscription_status,
-- trial_ends_at, current_period_end. Somente service_role/postgres pode.
-- Também atualiza updated_at automaticamente.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_plan_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Somente roles administrativos podem alterar campos de plano
  IF current_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
    NEW.plan_tier := OLD.plan_tier;
    NEW.subscription_status := OLD.subscription_status;
    NEW.trial_ends_at := OLD.trial_ends_at;
    NEW.current_period_end := OLD.current_period_end;
  END IF;

  -- Protege campos imutáveis do perfil
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;

  -- Atualiza timestamp de modificação
  NEW.updated_at := timezone('utc'::text, now());

  RETURN NEW;
END;
$$;

-- Trigger idempotente (CREATE OR REPLACE TRIGGER requer PG 14+, Supabase usa PG 15)
DROP TRIGGER IF EXISTS protect_profile_plan_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_plan_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_plan_fields();

-- ------------------------------------------------------------------------------
-- 5.2 Proteção do saldo das metas
-- Impede que usuários alterem current_amount diretamente.
-- Somente o trigger apply_goal_contribution pode alterar (via service_role-like
-- SECURITY DEFINER). Para UPDATE direto do cliente, reverte current_amount.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_goal_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Somente roles administrativos podem alterar current_amount diretamente
  IF current_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
    NEW.current_amount := OLD.current_amount;
  END IF;

  -- Protege campos imutáveis
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
-- 5.3 Aplicação atômica de contribuição/resgate
-- Ao inserir em goal_contributions, automaticamente atualiza current_amount
-- na meta correspondente. Usa SELECT FOR UPDATE para evitar corrida.
-- Rejeita retirada que exceda o saldo.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_goal_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current numeric(12,2);
  v_new_balance numeric(12,2);
BEGIN
  -- Trava a linha da meta para evitar corrida de concorrência
  SELECT current_amount INTO STRICT v_current
    FROM public.savings_goals
    WHERE id = NEW.goal_id
    FOR UPDATE;

  -- Calcula o novo saldo
  IF NEW.type = 'deposit' THEN
    v_new_balance := v_current + NEW.amount;
  ELSIF NEW.type = 'withdraw' THEN
    -- Verifica se há saldo suficiente para retirada
    IF NEW.amount > v_current THEN
      RAISE EXCEPTION 'Saldo insuficiente na meta. Saldo atual: R$ %, tentativa de retirada: R$ %',
        v_current, NEW.amount;
    END IF;
    v_new_balance := v_current - NEW.amount;
  ELSE
    RAISE EXCEPTION 'Tipo de contribuição inválido: %', NEW.type;
  END IF;

  -- Atualiza o saldo da meta atomicamente
  -- Usa UPDATE direto sem passar pelo trigger protect_goal_balance
  -- pois esta função roda como SECURITY DEFINER (current_user = 'postgres')
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
-- 5.4 Criação automática de perfil ao cadastrar no Auth
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
-- 5.5 Exclusão completa de conta (conformidade App Store / Play Store)
-- Valida autenticação antes de executar.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Garante que há um usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado. Operação negada.';
  END IF;

  -- Exclui todas as contribuições de metas do usuário
  DELETE FROM public.goal_contributions WHERE user_id = v_user_id;

  -- Exclui todas as metas do usuário
  DELETE FROM public.savings_goals WHERE user_id = v_user_id;

  -- Exclui todas as despesas recorrentes
  DELETE FROM public.recurring_expenses WHERE user_id = v_user_id;

  -- Exclui todas as transações
  DELETE FROM public.transactions WHERE user_id = v_user_id;

  -- Exclui o perfil
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Exclui o usuário do Auth (cascade já limpa, mas explícito é mais seguro)
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

-- Permissões da RPC: somente authenticated pode chamar
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- ==============================================================================
-- 6. VERIFICAÇÕES DE SEGURANÇA (executar como queries de teste, NÃO automatizar)
-- ==============================================================================

/*
-- TESTE 1: Verificar que usuário comum NÃO consegue alterar Premium
-- (executar logado como um usuário comum via Supabase client)
UPDATE profiles SET plan_tier = 'premium' WHERE id = auth.uid();
-- Resultado esperado: plan_tier permanece 'free' (trigger reverte)

-- TESTE 2: Verificar que usuário NÃO consegue alterar current_amount
UPDATE savings_goals SET current_amount = 999999 WHERE user_id = auth.uid();
-- Resultado esperado: current_amount permanece inalterado (trigger reverte)

-- TESTE 3: Verificar que retirada excessiva é bloqueada
-- (com meta que tem R$100 de saldo)
INSERT INTO goal_contributions (goal_id, user_id, amount, type)
VALUES ('id-da-meta', auth.uid(), 500.00, 'withdraw');
-- Resultado esperado: ERRO "Saldo insuficiente na meta..."

-- TESTE 4: Verificar que usuário NÃO pode inserir perfil diretamente
INSERT INTO profiles (id, email) VALUES (auth.uid(), 'hack@test.com');
-- Resultado esperado: ERRO (permissão negada / INSERT revogado)

-- TESTE 5: Verificar que usuário NÃO pode deletar perfil diretamente
DELETE FROM profiles WHERE id = auth.uid();
-- Resultado esperado: ERRO (permissão negada / DELETE revogado)

-- TESTE 6: Verificar que contribuição em meta de outro usuário é bloqueada
INSERT INTO goal_contributions (goal_id, user_id, amount, type)
VALUES ('id-meta-de-outro-user', auth.uid(), 100.00, 'deposit');
-- Resultado esperado: ERRO (policy bloqueia, EXISTS falha)

-- TESTE 7: Verificar que anon não acessa nenhuma tabela
-- (executar sem autenticação)
SELECT * FROM profiles;
SELECT * FROM transactions;
SELECT * FROM savings_goals;
-- Resultado esperado: 0 linhas ou ERRO de permissão

-- TESTE 8: Verificar isolamento entre usuários
-- (logado como user A, tentar acessar dados do user B)
SELECT * FROM transactions WHERE user_id = 'uuid-do-user-B';
-- Resultado esperado: 0 linhas
*/

-- ==============================================================================
-- FIM DO SCHEMA — Financeiro Express v2.0
-- ==============================================================================
