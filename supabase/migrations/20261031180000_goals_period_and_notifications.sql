-- ==============================================================================
-- MIGRATION: 20261031180000_goals_period_and_notifications.sql
-- ETAPA 15 — METAS SEMANAIS/MENSAIS E SISTEMA DE NOTIFICAÇÕES PERSISTENTES
-- ==============================================================================
-- 1. Expansão de savings_goals com suporte a periodicidade (weekly, monthly, custom)
--    e intervalo de vigência (start_date, end_date).
-- 2. Criação da tabela `notifications` com RLS, índices, garantia de idempotência
--    e triggers automáticos para eventos financeiros.
-- 3. RPCs controladas para leitura individual e em massa de notificações.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXPANSÃO DE savings_goals (PERIODICIDADE SEMANAL E MENSAL)
-- ------------------------------------------------------------------------------

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

-- Adiciona constraint CHECK segura para period_type se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'savings_goals_period_type_check'
  ) THEN
    ALTER TABLE public.savings_goals
      ADD CONSTRAINT savings_goals_period_type_check
      CHECK (period_type IN ('weekly', 'monthly', 'custom'));
  END IF;
END $$;

-- Atualiza permissões de UPDATE para incluir os novos campos
REVOKE UPDATE ON public.savings_goals FROM authenticated;
GRANT UPDATE (title, target_amount, icon, color, deadline, is_completed, period_type, start_date, end_date)
  ON public.savings_goals TO authenticated;

-- Índice para consultas filtradas por periodicidade e vigência
CREATE INDEX IF NOT EXISTS idx_savings_goals_user_period
  ON public.savings_goals (user_id, period_type, is_completed);

-- ------------------------------------------------------------------------------
-- 2. TABELA DE NOTIFICAÇÕES REAL E PERSISTENTE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'goal_reached',
    'goal_warning',
    'expense_due',
    'expense_overdue',
    'financial_alert',
    'system'
  )),
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  link text,
  metadata jsonb DEFAULT '{}'::jsonb,
  dedup_key text,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice único parcial para garantir idempotência absoluta (anti-duplicação)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedup
  ON public.notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Índice para busca rápida de notificações não lidas e ordenação cronológica
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

-- ------------------------------------------------------------------------------
-- 3. POLÍTICAS ROW LEVEL SECURITY (RLS) PARA NOTIFICAÇÕES
-- ------------------------------------------------------------------------------

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias notificações" ON public.notifications;
CREATE POLICY "Usuários podem ver suas próprias notificações"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem inserir notificações para si próprios" ON public.notifications;
CREATE POLICY "Usuários podem inserir notificações para si próprios"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias notificações" ON public.notifications;
CREATE POLICY "Usuários podem atualizar suas próprias notificações"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem excluir suas próprias notificações" ON public.notifications;
CREATE POLICY "Usuários podem excluir suas próprias notificações"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

REVOKE ALL ON public.notifications FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPCS CONTROLADAS PARA GERENCIAMENTO DE LEITURA
-- ------------------------------------------------------------------------------

-- Marcar notificação individual como lida
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.notifications
  SET
    is_read = true,
    read_at = timezone('utc'::text, now())
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND is_read = false;
END;
$$;

-- Marcar todas as notificações do usuário como lidas
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Operação negada: usuário não autenticado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.notifications
  SET
    is_read = true,
    read_at = timezone('utc'::text, now())
  WHERE user_id = auth.uid()
    AND is_read = false;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. ATUALIZAÇÃO DO TRIGGER apply_goal_contribution COM GERAÇÃO DE NOTIFICAÇÃO
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
  v_goal_title text;
  v_goal_user_id uuid;
  v_goal_period_type text;
  v_new_balance numeric(12,2);
  v_jwt_role text;
  -- Chave de período para garantir uma notificação por período (semana/mês)
  v_period_suffix text;
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

  -- Lock pessimista na linha da meta
  SELECT current_amount, target_amount, is_completed, title, user_id, COALESCE(period_type, 'custom')
    INTO STRICT v_current, v_target, v_is_completed, v_goal_title, v_goal_user_id, v_goal_period_type
    FROM public.savings_goals
    WHERE id = NEW.goal_id
    FOR UPDATE;

  IF v_goal_user_id != NEW.user_id THEN
    RAISE EXCEPTION 'Operação negada: a meta informada não pertence ao usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.type = 'deposit' THEN
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

  -- Calcula sufixo de período para a chave de deduplicação:
  -- - weekly: chave inclui o número ISO da semana (YYYY-WNN) → renotifica a cada nova semana
  -- - monthly: chave inclui o mês (YYYY-MM) → renotifica a cada novo mês
  -- - custom: chave é permanente → apenas uma notificação por meta
  v_period_suffix := CASE v_goal_period_type
    WHEN 'weekly'  THEN to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'IYYY"-W"IW')
    WHEN 'monthly' THEN to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY"-"MM')
    ELSE 'once'
  END;

  -- Atualiza meta atomicamente
  UPDATE public.savings_goals
    SET
      current_amount = v_new_balance,
      is_completed = CASE
        WHEN v_new_balance >= v_target THEN true
        ELSE is_completed
      END
    WHERE id = NEW.goal_id;

  -- Geração de notificação automática e idempotente quando a meta é concluída
  IF v_new_balance >= v_target THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      link,
      dedup_key
    ) VALUES (
      NEW.user_id,
      'Meta Atingida! 🎉',
      'Parabéns! Você atingiu 100% da meta "' || v_goal_title || '" acumulando R$ ' || to_char(v_new_balance, 'FM999G999G990D00') || '.',
      'goal_reached',
      '/goals',
      'goal_reached_' || NEW.goal_id::text || '_' || v_period_suffix
    ) ON CONFLICT (user_id, dedup_key) DO NOTHING;
  -- Geração de notificação de proximidade (>= 80%)
  ELSIF v_new_balance >= (v_target * 0.8) AND v_current < (v_target * 0.8) THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      link,
      dedup_key
    ) VALUES (
      NEW.user_id,
      'Meta Próxima do Objetivo! 🎯',
      'Excelente progresso! Sua meta "' || v_goal_title || '" já ultrapassou 80% do valor pretendido.',
      'goal_warning',
      '/goals',
      'goal_near_' || NEW.goal_id::text || '_80_' || v_period_suffix
    ) ON CONFLICT (user_id, dedup_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. RPC PARA DETECÇÃO DE DESPESAS PRÓXIMAS OU VENCIDAS (RODADA PELO CLIENTE OU CRON)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_financial_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_count integer := 0;
  r record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- 1. Alertas de despesas que vencem hoje ou nos próximos 2 dias
  FOR r IN
    SELECT id, description, amount, due_date
    FROM public.transactions
    WHERE user_id = v_user_id
      AND type = 'expense'
      AND status = 'pending'
      AND due_date IS NOT NULL
      AND due_date >= current_date
      AND due_date <= (current_date + interval '2 days')
  LOOP
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      link,
      dedup_key
    ) VALUES (
      v_user_id,
      'Despesa Próxima do Vencimento ⏰',
      'A despesa "' || r.description || '" no valor de R$ ' || to_char(r.amount, 'FM999G999G990D00') || ' vence em ' || to_char(r.due_date, 'DD/MM/YYYY') || '.',
      'expense_due',
      '/commitments',
      'due_' || r.id::text || '_' || r.due_date::text
    ) ON CONFLICT (user_id, dedup_key) DO NOTHING;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- 2. Alertas de despesas em atraso (vencidas e não pagas)
  FOR r IN
    SELECT id, description, amount, due_date
    FROM public.transactions
    WHERE user_id = v_user_id
      AND type = 'expense'
      AND status = 'pending'
      AND due_date IS NOT NULL
      AND due_date < current_date
  LOOP
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      link,
      dedup_key
    ) VALUES (
      v_user_id,
      'Atenção: Despesa Vencida ⚠️',
      'A despesa "' || r.description || '" (R$ ' || to_char(r.amount, 'FM999G999G990D00') || ') venceu em ' || to_char(r.due_date, 'DD/MM/YYYY') || ' e ainda não foi quitada.',
      'expense_overdue',
      '/commitments',
      'overdue_' || r.id::text || '_' || r.due_date::text
    ) ON CONFLICT (user_id, dedup_key) DO NOTHING;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.check_financial_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_financial_alerts() TO authenticated;

