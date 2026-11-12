-- ==============================================================================
-- MIGRATION: 20261112200000_push_subscriptions_schema.sql
-- ETAPA 34.2 — Tabela de Inscrições Web Push & Hardening de Segurança
-- ==============================================================================
-- Correções de Segurança:
-- SEC-02: Constraint UNIQUE (endpoint) para prevenir que dispositivos compartilhados
--         mantenham inscrições vinculadas a contas anteriores.
-- SEC-04: CHECK constraint garantindo protocolo estrito HTTPS.
-- SEC-02: RPC register_push_subscription com SECURITY DEFINER e isolamento por auth.uid().
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT push_subscriptions_endpoint_uniq UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_endpoint_https_check CHECK (endpoint ~ '^https://')
);

-- Índices para busca rápida e limpeza por usuário
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON public.push_subscriptions (endpoint);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS rigorosas: Cada usuário só manipula seus próprios dispositivos
DROP POLICY IF EXISTS "Usuários podem ver suas próprias inscrições push" ON public.push_subscriptions;
CREATE POLICY "Usuários podem ver suas próprias inscrições push"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem registrar suas próprias inscrições push" ON public.push_subscriptions;
CREATE POLICY "Usuários podem registrar suas próprias inscrições push"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias inscrições push" ON public.push_subscriptions;
CREATE POLICY "Usuários podem atualizar suas próprias inscrições push"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem remover suas próprias inscrições push" ON public.push_subscriptions;
CREATE POLICY "Usuários podem remover suas próprias inscrições push"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Concessão de privilégios para usuários autenticados (acesso anônimo revogado)
REVOKE ALL ON public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- ==============================================================================
-- RPC CONTROLADA: Registro Seguro de Dispositivos Compartilhados (SEC-02)
-- ==============================================================================
-- Garante que se um endpoint já existia para outra conta neste navegador/aparelho,
-- ele seja reassociado com segurança ao novo usuário autenticado (auth.uid()).
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL
)
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
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  IF p_endpoint IS NULL OR p_endpoint !~ '^https://' THEN
    RAISE EXCEPTION 'Endpoint de notificação inválido (deve iniciar com https://).';
  END IF;

  IF p_p256dh IS NULL OR length(trim(p_p256dh)) < 10 THEN
    RAISE EXCEPTION 'Chave pública p256dh inválida.';
  END IF;

  IF p_auth IS NULL OR length(trim(p_auth)) < 10 THEN
    RAISE EXCEPTION 'Chave de autenticação auth inválida.';
  END IF;

  -- Se o endpoint já pertencia a outro usuário, o UPSERT sobrescreve o user_id
  -- para o usuário atual, garantindo desassociação imediata do usuário anterior.
  INSERT INTO public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    updated_at
  )
  VALUES (
    v_user_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_user_agent,
    now()
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = COALESCE(EXCLUDED.user_agent, public.push_subscriptions.user_agent),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text) TO authenticated;
