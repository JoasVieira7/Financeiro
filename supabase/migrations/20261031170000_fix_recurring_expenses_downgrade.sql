-- ==============================================================================
-- MIGRATION: 20261031170000_fix_recurring_expenses_downgrade.sql
-- ETAPA 14 — CORREÇÃO ESTRUTURAL: RLS E CICLO PÓS-DOWNGRADE DE REUTIZAÇÃO
-- ==============================================================================
-- 1. Corrige o conflito onde a policy RLS de UPDATE bloqueava usuários Free de
--    desativarem suas despesas recorrentes herdadas de assinaturas expiradas.
-- 2. Mantém defesa em profundidade: a policy RLS restringe a mutação para
--    is_active = false para usuários Free, enquanto o trigger impede estritamente
--    qualquer alteração em colunas de negócio (amount, category, description, due_day).
-- 3. Cria a RPC controlada `deactivate_recurring_expense` para operação atômica.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CORREÇÃO DA POLÍTICA RLS DE UPDATE EM recurring_expenses
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Usuários Premium podem atualizar suas despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários podem atualizar suas despesas recorrentes" ON public.recurring_expenses;
DROP POLICY IF EXISTS "Usuários podem atualizar despesas recorrentes com enforcement" ON public.recurring_expenses;

CREATE POLICY "Usuários podem atualizar despesas recorrentes com enforcement"
  ON public.recurring_expenses FOR UPDATE
  USING (
    auth.uid() = user_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.plan_tier = 'premium')
      OR (is_active = true)
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.plan_tier = 'premium')
      OR (is_active = false)
    )
  );

-- ------------------------------------------------------------------------------
-- 2. HARDENING DO TRIGGER check_recurring_expense_premium
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
  -- Obtém role do JWT PostgREST
  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', auth.role());
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- 2.1 Validação de Autenticação e Integridade de Identidade
  IF v_jwt_role IN ('authenticated', 'anon') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.user_id := auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
      -- Protege integridade de campos imutáveis
      NEW.id := OLD.id;
      NEW.user_id := OLD.user_id;
      NEW.created_at := OLD.created_at;
    END IF;
  END IF;

  -- Consulta plano atualizado do usuário
  SELECT plan_tier INTO v_plan_tier
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_plan_tier IS NULL THEN
    v_plan_tier := 'free';
  END IF;

  -- 2.2 Usuário Premium: acesso irrestrito para gerenciar suas despesas
  IF v_plan_tier = 'premium' THEN
    RETURN NEW;
  END IF;

  -- 2.3 Usuário Free:
  -- A. Bloqueio absoluto de novos cadastros (INSERT)
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Despesas recorrentes são exclusivas do Plano Premium. Faça upgrade para cadastrar contas fixas e assinaturas.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- B. Ciclo pós-downgrade no UPDATE:
  IF TG_OP = 'UPDATE' THEN
    -- Proíbe reativar ou tentar manter ativa
    IF NEW.is_active = true THEN
      RAISE EXCEPTION 'Não é permitido reativar despesas recorrentes no Plano Gratuito. Faça upgrade para o Plano Premium.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Proíbe alteração de qualquer propriedade protegida (valores, categorias, descrições, datas)
    IF (NEW.description IS DISTINCT FROM OLD.description)
       OR (NEW.amount IS DISTINCT FROM OLD.amount)
       OR (NEW.category IS DISTINCT FROM OLD.category)
       OR (NEW.payment_method IS DISTINCT FROM OLD.payment_method)
       OR (NEW.due_day IS DISTINCT FROM OLD.due_day) THEN
      RAISE EXCEPTION 'Usuários do Plano Gratuito só podem desativar despesas recorrentes existentes. A alteração de valores, descrições ou categorias requer o Plano Premium.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_recurring_expense_premium_trigger ON public.recurring_expenses;
CREATE TRIGGER check_recurring_expense_premium_trigger
  BEFORE INSERT OR UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.check_recurring_expense_premium();

REVOKE ALL ON FUNCTION public.check_recurring_expense_premium() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC CONTROLADA PARA DESATIVAÇÃO ATÔMICA
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.deactivate_recurring_expense(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.recurring_expenses
  SET is_active = false
  WHERE id = p_expense_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa recorrente não encontrada ou não pertence ao usuário.'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_recurring_expense(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_recurring_expense(uuid) TO authenticated;

