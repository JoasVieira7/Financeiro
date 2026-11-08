-- ==============================================================================
-- MIGRATION: 20261031130000_baseline_schema.sql
-- ETAPA 14 — MIGRATION INICIAL REPRODUZÍVEL (BASELINE SCHEMA)
-- ==============================================================================
-- Criação ordenada de extensões, tabelas base, RLS inicial, permissões,
-- triggers de integridade e índices para banco virgem.
-- As migrations subsequentes (140000, 150000, 160000, 170000) constroem
-- as regras de negócio incrementais sobre esta base sólida.
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABELAS BASE
-- ==============================================================================

-- 2.1 Perfis de Usuário
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

-- 2.2 Transações (Receitas e Despesas)
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

-- 2.3 Metas de Economia
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

-- 2.4 Despesas Recorrentes
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

-- 2.5 Contribuições e Resgates de Metas
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
-- 3. ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

-- 3.1 Políticas: profiles
CREATE POLICY "Usuários podem ver apenas o próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar apenas o próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3.2 Políticas: transactions
CREATE POLICY "Usuários gerenciam exclusivamente suas próprias transações"
  ON public.transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3.3 Políticas: savings_goals
CREATE POLICY "Usuários gerenciam exclusivamente suas próprias metas"
  ON public.savings_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3.4 Políticas: recurring_expenses (Base)
CREATE POLICY "Usuários podem ver suas despesas recorrentes"
  ON public.recurring_expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem excluir suas despesas recorrentes"
  ON public.recurring_expenses FOR DELETE
  USING (auth.uid() = user_id);

-- 3.5 Políticas: goal_contributions
CREATE POLICY "Usuários podem ver suas contribuições"
  ON public.goal_contributions FOR SELECT
  USING (auth.uid() = user_id);

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
-- 4. PERMISSÕES DE TABELAS E COLUNAS (LEAST PRIVILEGE)
-- ==============================================================================

-- 4.1 profiles:
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, DELETE, UPDATE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url, monthly_budget, weekly_saving_target) ON public.profiles TO authenticated;

-- 4.2 savings_goals:
REVOKE ALL ON public.savings_goals FROM anon;
GRANT SELECT, INSERT, DELETE ON public.savings_goals TO authenticated;
REVOKE UPDATE ON public.savings_goals FROM authenticated;
GRANT UPDATE (title, target_amount, icon, color, deadline) ON public.savings_goals TO authenticated;

-- 4.3 goal_contributions:
REVOKE ALL ON public.goal_contributions FROM anon;
REVOKE UPDATE, DELETE ON public.goal_contributions FROM authenticated;
GRANT SELECT, INSERT ON public.goal_contributions TO authenticated;

-- 4.4 transactions:
REVOKE ALL ON public.transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;

-- 4.5 recurring_expenses:
REVOKE ALL ON public.recurring_expenses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;

-- ==============================================================================
-- 5. ÍNDICES DE PERFORMANCE BASELINE
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
-- 6. FUNÇÕES E TRIGGERS BASELINE
-- ==============================================================================

-- 6.1 Inicialização segura de saldo de metas (Zero por padrão no client)
CREATE OR REPLACE FUNCTION public.initialize_goal_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
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

-- 6.2 Proteção contra UPDATE direto em current_amount
CREATE OR REPLACE FUNCTION public.protect_goal_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() <= 1 AND coalesce(auth.jwt() ->> 'role', auth.role()) IN ('authenticated', 'anon') THEN
    NEW.current_amount := OLD.current_amount;
  END IF;
  NEW.user_id := OLD.user_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_goal_balance_trigger ON public.savings_goals;
CREATE TRIGGER protect_goal_balance_trigger
  BEFORE UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.protect_goal_balance();

-- 6.3 Aplicação atômica de contribuições e resgates
CREATE OR REPLACE FUNCTION public.apply_goal_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current numeric(12,2);
  v_target numeric(12,2);
  v_goal_user_id uuid;
  v_new_balance numeric(12,2);
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

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

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'O valor da contribuição deve ser maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT current_amount, target_amount, user_id
    INTO STRICT v_current, v_target, v_goal_user_id
    FROM public.savings_goals
    WHERE id = NEW.goal_id
    FOR UPDATE;

  IF v_goal_user_id != NEW.user_id THEN
    RAISE EXCEPTION 'Operação negada: a meta informada não pertence ao usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.type = 'deposit' THEN
    v_new_balance := v_current + NEW.amount;
  ELSIF NEW.type = 'withdraw' THEN
    IF NEW.amount > v_current THEN
      RAISE EXCEPTION 'Saldo insuficiente na meta.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_new_balance := v_current - NEW.amount;
  ELSE
    RAISE EXCEPTION 'Tipo de contribuição inválido: %', NEW.type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

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

-- 6.4 Criação de perfil ao cadastrar no auth.users
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

-- 6.5 Exclusão completa de conta (Conformidade App Stores)
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado. Operação negada.';
  END IF;

  DELETE FROM public.goal_contributions WHERE user_id = v_user_id;
  DELETE FROM public.savings_goals WHERE user_id = v_user_id;
  DELETE FROM public.recurring_expenses WHERE user_id = v_user_id;
  DELETE FROM public.transactions WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

-- Permissões de funções
REVOKE ALL ON FUNCTION public.initialize_goal_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_goal_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_goal_contribution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

