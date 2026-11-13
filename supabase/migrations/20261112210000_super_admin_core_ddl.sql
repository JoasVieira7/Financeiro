-- ==============================================================================
-- MIGRATION: 20261112210000_super_admin_core_ddl.sql
-- ETAPA 35.1B — CONSOLIDAÇÃO DO DDL E BLINDAGEM DE SEGURANÇA DO SUPER ADMIN
-- ==============================================================================
-- Correções e Recursos Implementados:
-- 1. Schema privado `app_admin` com isolamento total de acesso público.
-- 2. Tabela `app_admin.super_admin_registry` restrita a 1 conta via CHECK (id = 1)
--    e vinculada estritamente ao UUID de `auth.users(id)`.
-- 3. Procedure de provisionamento seguro `app_admin.provision_super_admin(...)`.
-- 4. Função verificadora `public.is_super_admin()` com SECURITY DEFINER e search_path.
-- 5. Tabela de auditoria imutável `public.admin_audit_logs` (append-only) protegida
--    contra UPDATE, DELETE e TRUNCATE via triggers dedicados.
-- 6. Tabelas financeiras SaaS:
--    - `public.saas_subscriptions` com índice único parcial anti-duplicidade de planos ativos.
--    - `public.saas_payments` com validação de coerência de reembolsos e status.
--    - `public.saas_payment_events` com idempotência de eventos de gateway.
-- 7. Central de comunicados:
--    - `public.saas_announcements` e `public.saas_announcement_recipients`.
--    - RPC `public.mark_announcement_as_read` para atualização atômica e segura.
-- 8. Funções analíticas e operacionais no schema `app_admin`:
--    - `app_admin.execute_admin_mutation` (transação atômica + auditoria obrigatória).
--    - `app_admin.get_financial_metrics` (cálculo de MRR real, receitas e reembolsos).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SCHEMA PRIVADO app_admin E REGISTRO DA CONTA ÚNICA SUPER ADMIN
-- ------------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS app_admin;

REVOKE ALL ON SCHEMA app_admin FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA app_admin TO service_role;

CREATE TABLE IF NOT EXISTS app_admin.super_admin_registry (
    id integer PRIMARY KEY DEFAULT 1,
    user_id uuid NOT NULL UNIQUE,
    email text NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    last_admin_login timestamptz,
    CONSTRAINT single_admin_enforcement CHECK (id = 1),
    CONSTRAINT fk_super_admin_auth_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT
);

-- Isolamento estrito da tabela de registro
REVOKE ALL ON TABLE app_admin.super_admin_registry FROM public, anon, authenticated;
GRANT SELECT, UPDATE(last_admin_login) ON TABLE app_admin.super_admin_registry TO service_role;

-- Triggers de proteção contra exclusão e truncamento da conta Super Admin
CREATE OR REPLACE FUNCTION app_admin.prevent_super_admin_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_admin, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'A conta Super Admin é imutável e não pode ser excluída do sistema.'
        USING ERRCODE = 'restrict_violation';
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_super_admin_deletion ON app_admin.super_admin_registry;
CREATE TRIGGER trg_prevent_super_admin_deletion
    BEFORE DELETE ON app_admin.super_admin_registry
    FOR EACH ROW
    EXECUTE FUNCTION app_admin.prevent_super_admin_deletion();

CREATE OR REPLACE FUNCTION app_admin.prevent_super_admin_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_admin, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'A tabela app_admin.super_admin_registry não pode ser truncada.'
        USING ERRCODE = 'restrict_violation';
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_super_admin_truncate ON app_admin.super_admin_registry;
CREATE TRIGGER trg_prevent_super_admin_truncate
    BEFORE TRUNCATE ON app_admin.super_admin_registry
    FOR EACH STATEMENT
    EXECUTE FUNCTION app_admin.prevent_super_admin_truncate();

-- Procedimento seguro para provisionamento inicial do Super Admin
CREATE OR REPLACE FUNCTION app_admin.provision_super_admin(
    p_user_id uuid,
    p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_admin, auth, pg_temp
AS $$
DECLARE
    v_existing_count integer;
    v_user_exists boolean;
BEGIN
    -- 1. Garante que nenhuma outra conta administrativa exista
    SELECT count(*) INTO v_existing_count FROM app_admin.super_admin_registry;
    IF v_existing_count > 0 THEN
        RAISE EXCEPTION 'Já existe uma conta Super Admin provisionada no sistema.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Valida se o UUID existe em auth.users
    SELECT EXISTS (
        SELECT 1 FROM auth.users WHERE id = p_user_id
    ) INTO v_user_exists;

    IF NOT v_user_exists THEN
        RAISE EXCEPTION 'O UUID informado (%) não corresponde a nenhum usuário registrado no Supabase Auth.', p_user_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 3. Insere o registro definitivo com ID fixo 1
    INSERT INTO app_admin.super_admin_registry (id, user_id, email, is_active, created_at)
    VALUES (1, p_user_id, lower(trim(p_email)), true, timezone('utc'::text, now()));
END;
$$;

REVOKE ALL ON FUNCTION app_admin.provision_super_admin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_admin.provision_super_admin(uuid, text) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. FUNÇÃO VERIFICADORA is_super_admin()
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_admin, public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM app_admin.super_admin_registry
        WHERE user_id = auth.uid()
          AND is_active = true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. TABELA DE AUDITORIA IMUTÁVEL (admin_audit_logs)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL,
    action text NOT NULL,
    target_user_id uuid,
    target_resource text,
    old_values jsonb DEFAULT '{}'::jsonb,
    new_values jsonb DEFAULT '{}'::jsonb,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure')),
    error_message text,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_audit_target_user FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON public.admin_audit_logs (target_user_id) WHERE target_user_id IS NOT NULL;

-- Triggers anti-adulteração (Row e Statement)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_tampering_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Registros de auditoria são imutáveis (append-only). Operação % negada.', TG_OP
        USING ERRCODE = 'restrict_violation';
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_tampering_row ON public.admin_audit_logs;
CREATE TRIGGER trg_prevent_audit_log_tampering_row
    BEFORE UPDATE OR DELETE ON public.admin_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_audit_log_tampering_row();

CREATE OR REPLACE FUNCTION public.prevent_audit_log_tampering_stmt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'A tabela public.admin_audit_logs é estritamente append-only e não pode ser truncada.'
        USING ERRCODE = 'restrict_violation';
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_tampering_stmt ON public.admin_audit_logs;
CREATE TRIGGER trg_prevent_audit_log_tampering_stmt
    BEFORE TRUNCATE ON public.admin_audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prevent_audit_log_tampering_stmt();

-- RLS para admin_audit_logs
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin consulta logs de auditoria" ON public.admin_audit_logs;
CREATE POLICY "Super Admin consulta logs de auditoria"
    ON public.admin_audit_logs FOR SELECT
    TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS "Service Role insere logs de auditoria" ON public.admin_audit_logs;
CREATE POLICY "Service Role insere logs de auditoria"
    ON public.admin_audit_logs FOR INSERT
    TO service_role
    WITH CHECK (true);

REVOKE ALL ON public.admin_audit_logs FROM anon;
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;

-- ------------------------------------------------------------------------------
-- 4. TABELAS FINANCEIRAS SaaS: ASSINATURAS, PAGAMENTOS E EVENTOS
-- ------------------------------------------------------------------------------

-- A. Assinaturas SaaS
CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    plan_tier text NOT NULL CHECK (plan_tier IN ('free', 'premium')),
    billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly', 'lifetime', 'complimentary')),
    price numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    status text NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'paused', 'expired')),
    started_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    current_period_start timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    current_period_end timestamptz,
    canceled_at timestamptz,
    cancel_reason text,
    is_complimentary boolean NOT NULL DEFAULT false,
    gateway text NOT NULL DEFAULT 'manual_admin' CHECK (gateway IN ('manual_admin', 'stripe', 'asaas', 'pix_direct', 'apple_iap', 'google_play')),
    gateway_subscription_id text UNIQUE,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT
);

-- Índice único parcial: impede mais de 1 assinatura ativa simultânea por usuário
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_subscription_per_user
    ON public.saas_subscriptions (user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_user_status
    ON public.saas_subscriptions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_mrr_calc
    ON public.saas_subscriptions (status, billing_cycle, is_complimentary)
    WHERE status = 'active';

ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário consulta própria assinatura ou Admin consulta todas" ON public.saas_subscriptions;
CREATE POLICY "Usuário consulta própria assinatura ou Admin consulta todas"
    ON public.saas_subscriptions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_super_admin());

DROP POLICY IF EXISTS "Service Role gerencia assinaturas" ON public.saas_subscriptions;
CREATE POLICY "Service Role gerencia assinaturas"
    ON public.saas_subscriptions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.saas_subscriptions FROM anon;
GRANT SELECT ON public.saas_subscriptions TO authenticated;
GRANT ALL ON public.saas_subscriptions TO service_role;

-- B. Pagamentos e Reembolsos
CREATE TABLE IF NOT EXISTS public.saas_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid,
    user_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL CHECK (amount >= 0),
    refunded_amount numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (refunded_amount >= 0),
    currency text NOT NULL DEFAULT 'BRL',
    status text NOT NULL CHECK (status IN ('paid', 'pending', 'failed', 'refunded', 'partially_refunded', 'disputed')),
    payment_method text NOT NULL CHECK (payment_method IN ('pix', 'credit_card', 'boleto', 'apple_pay', 'google_pay', 'manual_admin')),
    gateway text NOT NULL DEFAULT 'manual_admin' CHECK (gateway IN ('manual_admin', 'stripe', 'asaas', 'pix_direct', 'apple_iap', 'google_play')),
    gateway_transaction_id text,
    gateway_event_id text UNIQUE,
    idempotency_key text UNIQUE,
    paid_at timestamptz,
    refunded_at timestamptz,
    disputed_at timestamptz,
    receipt_url text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT fk_payment_subscription FOREIGN KEY (subscription_id) REFERENCES public.saas_subscriptions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_refunded_lte_amount CHECK (refunded_amount <= amount),
    CONSTRAINT chk_paid_status_date CHECK ((status = 'paid' AND paid_at IS NOT NULL) OR (status != 'paid')),
    CONSTRAINT chk_refund_status_coherence CHECK (
        (status = 'refunded' AND refunded_amount = amount AND refunded_at IS NOT NULL) OR
        (status = 'partially_refunded' AND refunded_amount > 0 AND refunded_amount < amount AND refunded_at IS NOT NULL) OR
        (status NOT IN ('refunded', 'partially_refunded'))
    )
);

CREATE INDEX IF NOT EXISTS idx_saas_payments_status_paid_at ON public.saas_payments (status, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_payments_user_id ON public.saas_payments (user_id);

ALTER TABLE public.saas_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário consulta próprios pagamentos ou Admin consulta todos" ON public.saas_payments;
CREATE POLICY "Usuário consulta próprios pagamentos ou Admin consulta todos"
    ON public.saas_payments FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_super_admin());

DROP POLICY IF EXISTS "Service Role gerencia pagamentos" ON public.saas_payments;
CREATE POLICY "Service Role gerencia pagamentos"
    ON public.saas_payments FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.saas_payments FROM anon;
GRANT SELECT ON public.saas_payments TO authenticated;
GRANT ALL ON public.saas_payments TO service_role;

-- C. Eventos Financeiros (saas_payment_events)
CREATE TABLE IF NOT EXISTS public.saas_payment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('payment_confirmed', 'payment_failed', 'refund_partial', 'refund_full', 'chargeback_opened', 'chargeback_won', 'chargeback_lost', 'gateway_sync')),
    amount numeric(10,2) NOT NULL DEFAULT 0.00,
    external_event_id text UNIQUE,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT fk_payment_event_parent FOREIGN KEY (payment_id) REFERENCES public.saas_payments(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_saas_payment_events_payment_id ON public.saas_payment_events (payment_id, created_at DESC);

ALTER TABLE public.saas_payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin consulta eventos de pagamento" ON public.saas_payment_events;
CREATE POLICY "Super Admin consulta eventos de pagamento"
    ON public.saas_payment_events FOR SELECT
    TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS "Service Role gerencia eventos de pagamento" ON public.saas_payment_events;
CREATE POLICY "Service Role gerencia eventos de pagamento"
    ON public.saas_payment_events FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.saas_payment_events FROM anon;
GRANT SELECT ON public.saas_payment_events TO authenticated;
GRANT ALL ON public.saas_payment_events TO service_role;

-- ------------------------------------------------------------------------------
-- 5. CENTRAL DE COMUNICADOS: CAMPANHAS E LEDGER DE DESTINATÁRIOS
-- ------------------------------------------------------------------------------

-- A. Cabeçalho de Comunicados
CREATE TABLE IF NOT EXISTS public.saas_announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    target_audience text NOT NULL CHECK (target_audience IN ('all', 'free_only', 'premium_only', 'specific_users')),
    channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'processing', 'completed', 'canceled', 'failed')),
    total_recipients integer NOT NULL DEFAULT 0,
    delivered_count integer NOT NULL DEFAULT 0,
    read_count integer NOT NULL DEFAULT 0,
    failed_count integer NOT NULL DEFAULT 0,
    scheduled_for timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT fk_announcement_creator FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_saas_announcements_status ON public.saas_announcements (status, scheduled_for);

ALTER TABLE public.saas_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin visualiza campanhas" ON public.saas_announcements;
CREATE POLICY "Super Admin visualiza campanhas"
    ON public.saas_announcements FOR SELECT
    TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS "Service Role gerencia campanhas" ON public.saas_announcements;
CREATE POLICY "Service Role gerencia campanhas"
    ON public.saas_announcements FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.saas_announcements FROM anon;
GRANT SELECT ON public.saas_announcements TO authenticated;
GRANT ALL ON public.saas_announcements TO service_role;

-- B. Ledger Individual de Destinatários
CREATE TABLE IF NOT EXISTS public.saas_announcement_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL CHECK (channel IN ('in_app', 'web_push')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    last_attempt_at timestamptz,
    sent_at timestamptz,
    read_at timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_announcement_recipient_channel UNIQUE (announcement_id, user_id, channel),
    CONSTRAINT fk_recipient_announcement FOREIGN KEY (announcement_id) REFERENCES public.saas_announcements(id) ON DELETE CASCADE,
    CONSTRAINT fk_recipient_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_announcement_recipients_fetch ON public.saas_announcement_recipients (announcement_id, status);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_user_unread ON public.saas_announcement_recipients (user_id, status) WHERE status != 'read';

ALTER TABLE public.saas_announcement_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário consulta seus comunicados ou Admin consulta todos" ON public.saas_announcement_recipients;
CREATE POLICY "Usuário consulta seus comunicados ou Admin consulta todos"
    ON public.saas_announcement_recipients FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_super_admin());

-- NOTA: Atualizações de leitura por usuários autenticados são realizadas exclusivamente
-- via RPC controlada (mark_announcement_as_read) para impedir alteração indevida de outras colunas.
DROP POLICY IF EXISTS "Service Role gerencia destinatários" ON public.saas_announcement_recipients;
CREATE POLICY "Service Role gerencia destinatários"
    ON public.saas_announcement_recipients FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.saas_announcement_recipients FROM anon;
GRANT SELECT ON public.saas_announcement_recipients TO authenticated;
GRANT ALL ON public.saas_announcement_recipients TO service_role;

-- RPC Controlada para marcar leitura de comunicado
CREATE OR REPLACE FUNCTION public.mark_announcement_as_read(
    p_recipient_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_announcement_id uuid;
    v_rows_updated integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acesso não autenticado.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Atualiza apenas o status de leitura do destinatário proprietário
    UPDATE public.saas_announcement_recipients
    SET
        status = 'read',
        read_at = timezone('utc'::text, now())
    WHERE id = p_recipient_id
      AND user_id = v_user_id
      AND status != 'read'
    RETURNING announcement_id INTO v_announcement_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Se atualizou, incrementa o contador da campanha de forma atômica
    IF v_rows_updated > 0 AND v_announcement_id IS NOT NULL THEN
        UPDATE public.saas_announcements
        SET read_count = read_count + 1
        WHERE id = v_announcement_id;

        RETURN true;
    END IF;

    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_announcement_as_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_announcement_as_read(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. RPC TRANSAÇÃO ATÔMICA + AUDITORIA MANDATÓRIA (app_admin)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_admin.execute_admin_mutation(
    p_admin_id uuid,
    p_action text,
    p_target_user_id uuid,
    p_target_resource text,
    p_old_values jsonb,
    p_new_values jsonb,
    p_reason text,
    p_ip_address text DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_admin, public, auth, pg_temp
AS $$
DECLARE
    v_is_authorized boolean;
    v_audit_id uuid;
    v_target_profile public.profiles%ROWTYPE;
BEGIN
    -- 1. Validação estrita do administrador
    SELECT is_active INTO v_is_authorized
    FROM app_admin.super_admin_registry
    WHERE user_id = p_admin_id;

    IF v_is_authorized IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado: o UUID fornecido (%) não é o Super Admin ativo.', p_admin_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'A justificativa da ação administrativa é obrigatória e deve conter ao menos 5 caracteres.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Executa a ação administrativa solicitada dentro da mesma transação
    IF p_action = 'set_user_plan' THEN
        -- Alteração de plano com sincronização de perfil e assinatura
        IF p_target_user_id IS NULL THEN
            RAISE EXCEPTION 'Usuário alvo não especificado para a ação set_user_plan.' USING ERRCODE = 'invalid_parameter_value';
        END IF;

        -- Atualiza perfil
        UPDATE public.profiles
        SET
            plan_tier = (p_new_values->>'plan_tier'),
            subscription_status = coalesce(p_new_values->>'subscription_status', 'active'),
            current_period_end = CASE
                WHEN (p_new_values->>'plan_tier') = 'premium' THEN
                    timezone('utc'::text, now()) + ((coalesce((p_new_values->>'duration_days')::integer, 30)) || ' days')::interval
                ELSE NULL
            END,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_target_user_id;

        -- Se for upgrade manual para premium, fecha assinaturas ativas anteriores e insere nova
        IF (p_new_values->>'plan_tier') = 'premium' THEN
            UPDATE public.saas_subscriptions
            SET status = 'canceled', canceled_at = timezone('utc'::text, now()), cancel_reason = 'Substituída por alteração administrativa'
            WHERE user_id = p_target_user_id AND status = 'active';

            INSERT INTO public.saas_subscriptions (
                user_id,
                plan_tier,
                billing_cycle,
                price,
                status,
                started_at,
                current_period_start,
                current_period_end,
                is_complimentary,
                gateway,
                metadata
            ) VALUES (
                p_target_user_id,
                'premium',
                coalesce(p_new_values->>'billing_cycle', 'complimentary'),
                coalesce((p_new_values->>'price')::numeric, 0.00),
                'active',
                timezone('utc'::text, now()),
                timezone('utc'::text, now()),
                timezone('utc'::text, now()) + ((coalesce((p_new_values->>'duration_days')::integer, 30)) || ' days')::interval,
                coalesce((p_new_values->>'is_complimentary')::boolean, true),
                'manual_admin',
                jsonb_build_object('granted_by', p_admin_id, 'reason', p_reason)
            );
        ELSIF (p_new_values->>'plan_tier') = 'free' THEN
            UPDATE public.saas_subscriptions
            SET status = 'canceled', canceled_at = timezone('utc'::text, now()), cancel_reason = p_reason
            WHERE user_id = p_target_user_id AND status = 'active';
        END IF;

    ELSIF p_action = 'record_manual_payment' THEN
        -- Registro de pagamento administrativo
        INSERT INTO public.saas_payments (
            user_id,
            amount,
            currency,
            status,
            payment_method,
            gateway,
            paid_at,
            metadata
        ) VALUES (
            p_target_user_id,
            (p_new_values->>'amount')::numeric,
            coalesce(p_new_values->>'currency', 'BRL'),
            'paid',
            coalesce(p_new_values->>'payment_method', 'manual_admin'),
            'manual_admin',
            timezone('utc'::text, now()),
            jsonb_build_object('registered_by', p_admin_id, 'reason', p_reason)
        );

    ELSE
        RAISE EXCEPTION 'Ação administrativa não suportada: %', p_action USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 3. Inserção de auditoria mandante na mesma transação
    -- Se este INSERT falhar por qualquer razão, toda a transação acima é revertida
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_user_id,
        target_resource,
        old_values,
        new_values,
        reason,
        status,
        ip_address,
        user_agent,
        created_at
    ) VALUES (
        p_admin_id,
        p_action,
        p_target_user_id,
        p_target_resource,
        p_old_values,
        p_new_values,
        p_reason,
        'success',
        p_ip_address,
        p_user_agent,
        timezone('utc'::text, now())
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION app_admin.execute_admin_mutation(uuid, text, uuid, text, jsonb, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_admin.execute_admin_mutation(uuid, text, uuid, text, jsonb, jsonb, text, text, text) TO service_role;

-- ------------------------------------------------------------------------------
-- 7. FUNÇÃO ANALÍTICA DE MÉTRICAS FINANCEIRAS SaaS (app_admin)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_admin.get_financial_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app_admin, public, pg_temp
AS $$
DECLARE
    v_mrr numeric(10,2);
    v_monthly_realized numeric(10,2);
    v_yearly_realized numeric(10,2);
    v_pending_amount numeric(10,2);
    v_total_refunded numeric(10,2);
    v_active_subscriptions integer;
    v_canceled_this_month integer;
    v_complimentary_count integer;
    v_now timestamptz;
BEGIN
    v_now := timezone('utc'::text, now());

    -- 1. Cálculo rigoroso de MRR:
    -- - Apenas assinaturas ATIVAS
    -- - Exclui cortesias (is_complimentary = true ou price = 0)
    -- - Exclui assinaturas cujo período já encerrou (current_period_end < now)
    -- - Mensal: 100% do preço. Anual: preço / 12.
    SELECT coalesce(sum(
        CASE
            WHEN billing_cycle = 'monthly' THEN price
            WHEN billing_cycle = 'yearly' THEN (price / 12.0)
            ELSE 0.00
        END
    ), 0.00) INTO v_mrr
    FROM public.saas_subscriptions
    WHERE status = 'active'
      AND is_complimentary = false
      AND price > 0
      AND (current_period_end IS NULL OR current_period_end >= v_now);

    -- 2. Receita mensal realizada (caixa líquido no mês vigente)
    SELECT coalesce(sum(amount - refunded_amount), 0.00) INTO v_monthly_realized
    FROM public.saas_payments
    WHERE status IN ('paid', 'partially_refunded')
      AND paid_at >= date_trunc('month', v_now)
      AND paid_at < (date_trunc('month', v_now) + interval '1 month');

    -- 3. Receita anual realizada (caixa líquido no ano vigente)
    SELECT coalesce(sum(amount - refunded_amount), 0.00) INTO v_yearly_realized
    FROM public.saas_payments
    WHERE status IN ('paid', 'partially_refunded')
      AND paid_at >= date_trunc('year', v_now)
      AND paid_at < (date_trunc('year', v_now) + interval '1 year');

    -- 4. Valores pendentes em aberto
    SELECT coalesce(sum(amount), 0.00) INTO v_pending_amount
    FROM public.saas_payments
    WHERE status = 'pending';

    -- 5. Total acumulado de reembolsos
    SELECT coalesce(sum(refunded_amount), 0.00) INTO v_total_refunded
    FROM public.saas_payments
    WHERE refunded_amount > 0;

    -- 6. Contadores de assinaturas
    SELECT count(*) INTO v_active_subscriptions
    FROM public.saas_subscriptions
    WHERE status = 'active';

    SELECT count(*) INTO v_canceled_this_month
    FROM public.saas_subscriptions
    WHERE status = 'canceled'
      AND canceled_at >= date_trunc('month', v_now);

    SELECT count(*) INTO v_complimentary_count
    FROM public.saas_subscriptions
    WHERE status = 'active'
      AND (is_complimentary = true OR price = 0);

    RETURN jsonb_build_object(
        'calculated_at', v_now,
        'mrr', v_mrr,
        'monthly_realized', v_monthly_realized,
        'yearly_realized', v_yearly_realized,
        'pending_amount', v_pending_amount,
        'total_refunded', v_total_refunded,
        'active_subscriptions', v_active_subscriptions,
        'canceled_this_month', v_canceled_this_month,
        'complimentary_subscriptions', v_complimentary_count
    );
END;
$$;

REVOKE ALL ON FUNCTION app_admin.get_financial_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_admin.get_financial_metrics() TO service_role;

