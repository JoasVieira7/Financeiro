-- ==============================================================================
-- ETAPA 28: HARDENING DA PERSISTÊNCIA PDF, ATOMICIDADE E IDEMPOTÊNCIA
-- Arquivo: 20261107202000_pdf_import_idempotency_rpc.sql
-- 
-- Objetivos:
-- 1. Criação da tabela de registro de operações de importação (import_operations)
--    para garantia de idempotência no banco de dados.
-- 2. Função RPC transacional atômica (import_pdf_invoice_batch) que executa a
--    validação, checagem de idempotência e inserção do lote em transação única PostgreSQL.
-- 3. Políticas RLS rigorosas de isolamento multi-tenant (auth.uid() = user_id).
-- 
-- RESTRIÇÃO OBRIGATÓRIA:
-- Este arquivo é uma migration local para versionamento do repositório.
-- NÃO deve ser executado remotamente sem homologação e autorização expressa.
-- ==============================================================================

-- 1. TABELA DE OPERAÇÕES DE IMPORTAÇÃO E IDEMPOTÊNCIA
CREATE TABLE IF NOT EXISTS public.import_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  source text NOT NULL DEFAULT 'pdf', -- 'pdf' | 'excel' | 'csv'
  payload_hash text NOT NULL,
  total_items integer NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  transaction_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_import_operations_user_key UNIQUE (user_id, idempotency_key)
);

-- Comentários descritivos de documentação
COMMENT ON TABLE public.import_operations IS 
  'Registro de operações de importação em lote para prevenção de duplicidades e garantia de idempotência.';
COMMENT ON COLUMN public.import_operations.idempotency_key IS 
  'Chave determinística única gerada a partir da identidade do usuário e do conteúdo da fatura.';
COMMENT ON COLUMN public.import_operations.transaction_ids IS 
  'Lista de IDs das transações criadas por esta operação, retornadas em tentativas idempotentes.';

-- 2. ÍNDICES DE PERFORMANCE E PESQUISA RÁPIDA
CREATE INDEX IF NOT EXISTS idx_import_operations_user_created 
  ON public.import_operations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_operations_lookup 
  ON public.import_operations(user_id, idempotency_key);

-- 3. SEGURANÇA EM NÍVEL DE LINHA (ROW LEVEL SECURITY - RLS)
ALTER TABLE public.import_operations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'import_operations' AND policyname = 'Users can view own import operations'
  ) THEN
    CREATE POLICY "Users can view own import operations"
      ON public.import_operations FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'import_operations' AND policyname = 'Users can insert own import operations'
  ) THEN
    CREATE POLICY "Users can insert own import operations"
      ON public.import_operations FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 4. FUNÇÃO RPC TRANSACIONAL ATÔMICA COM IDEMPOTÊNCIA
CREATE OR REPLACE FUNCTION public.import_pdf_invoice_batch(
  p_idempotency_key text,
  p_source text,
  p_payload_hash text,
  p_metadata jsonb,
  p_transactions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path vazio: elimina qualquer vetor de search_path hijacking.
-- Todos os objetos abaixo são completamente qualificados (public.xxx / auth.xxx).
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_op record;
  v_inserted_ids uuid[] := '{}';
  v_tx jsonb;
  v_tx_id uuid;
  v_amount numeric(12, 2);
  v_description text;
  v_category text;
  v_type text;
  v_payment_method text;
  v_created_at timestamptz;
  v_purchase_date timestamptz;
  v_due_date date;
  v_status text;
  v_notes text;
  v_installment_group_id text;
  v_installment_number integer;
  v_installment_total integer;
  v_installment_purchase_amount numeric(12, 2);
  v_total_amount numeric(12, 2) := 0;
  v_items_count integer := 0;
BEGIN
  -- 1. Validação de autenticação obrigatória
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: operação de importação requer usuário autenticado.';
  END IF;

  -- 2. Validação da chave de idempotência e payload
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Chave de idempotência inválida ou ausente.';
  END IF;

  -- Correção Etapa 30: valida p_payload_hash antes de qualquer consulta
  IF p_payload_hash IS NULL OR length(trim(p_payload_hash)) < 32 THEN
    RAISE EXCEPTION 'Hash do payload inválido ou ausente (mínimo 32 caracteres).';
  END IF;

  IF p_transactions IS NULL OR jsonb_array_length(p_transactions) = 0 THEN
    RAISE EXCEPTION 'Nenhuma transação informada para gravação no lote.';
  END IF;

  -- 3. Verificação de idempotência (operações já concluídas retornam imediatamente sem duplicar)
  SELECT * INTO v_existing_op 
  FROM public.import_operations
  WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Validação estrita de idempotência: a mesma chave com payload diferente deve ser categoricamente rejeitada
    IF v_existing_op.payload_hash IS DISTINCT FROM p_payload_hash THEN
      RAISE EXCEPTION 'Conflito de idempotência: a chave "%" já foi associada a um payload diferente.', p_idempotency_key;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'idempotency_key', p_idempotency_key,
      'total_transactions_created', COALESCE(array_length(v_existing_op.transaction_ids, 1), 0),
      'transaction_ids', v_existing_op.transaction_ids,
      'message', 'Operação já processada com sucesso anteriormente. Retorno idempotente.'
    );
  END IF;

  -- 4. Processamento atômico das transações
  -- No PostgreSQL, todo o corpo da função executa dentro de uma transação.
  -- Qualquer exceção (RAISE EXCEPTION ou erro de integridade) provoca ROLLBACK de 100% das linhas.
  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_tx_id := COALESCE((v_tx->>'id')::uuid, gen_random_uuid());
    v_amount := (v_tx->>'amount')::numeric;
    v_description := trim(COALESCE(v_tx->>'description', ''));
    v_category := COALESCE(v_tx->>'category', 'Compras');
    v_type := COALESCE(v_tx->>'type', 'expense');
    v_payment_method := COALESCE(v_tx->>'payment_method', 'cartao_credito');
    v_created_at := COALESCE((v_tx->>'created_at')::timestamptz, now());
    v_purchase_date := (v_tx->>'purchase_date')::timestamptz;
    v_due_date := (v_tx->>'due_date')::date;

    -- Correção Etapa 31: validação explícita de status com tratamento de NULL
    -- v_status pode ser NULL (campo ausente no JSON), 'pending', 'overdue' ou qualquer string inválida.
    -- Em todos os casos não permitidos, força 'pending' — importações NUNCA criam lançamentos pagos.
    v_status := v_tx->>'status';
    IF v_status IS NULL OR v_status NOT IN ('pending', 'overdue') THEN
      v_status := 'pending';
    END IF;

    v_notes := v_tx->>'notes';
    v_installment_group_id := v_tx->>'installment_group_id';
    v_installment_number := (v_tx->>'installment_number')::integer;
    v_installment_total := (v_tx->>'installment_total')::integer;
    v_installment_purchase_amount := (v_tx->>'installment_purchase_amount')::numeric;

    -- Validação de integridade financeira
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Valor financeiro inválido para a transação "%": %', v_description, v_amount;
    END IF;

    IF length(v_description) = 0 THEN
      RAISE EXCEPTION 'Descrição obrigatória não informada na transação.';
    END IF;

    -- Inserção na tabela transactions
    -- paid_at é sempre NULL: importações nunca criam lançamentos pagos,
    -- independentemente de qualquer campo vindo do JSON do cliente.
    -- is_recurring é sempre false: importações são avulsas.
    INSERT INTO public.transactions (
      id,
      user_id,
      amount,
      category,
      payment_method,
      description,
      type,
      is_recurring,
      notes,
      created_at,
      purchase_date,
      due_date,
      paid_at,
      status,
      installment_group_id,
      installment_number,
      installment_total,
      installment_purchase_amount
    ) VALUES (
      v_tx_id,
      v_user_id,       -- sempre auth.uid(), nunca do JSON
      v_amount,
      v_category,
      v_payment_method,
      v_description,
      v_type,
      false,           -- is_recurring: nunca verdadeiro em importações
      v_notes,
      v_created_at,
      v_purchase_date,
      v_due_date,
      NULL,            -- paid_at: NUNCA marcada como paga na importação
      v_status,        -- somente 'pending' ou 'overdue' (sanitizado acima)
      v_installment_group_id,
      v_installment_number,
      v_installment_total,
      v_installment_purchase_amount
    );

    v_inserted_ids := array_append(v_inserted_ids, v_tx_id);
    v_total_amount := v_total_amount + v_amount;
    v_items_count := v_items_count + 1;
  END LOOP;

  -- 5. Gravação da operação no histórico de idempotência
  INSERT INTO public.import_operations (
    user_id,
    idempotency_key,
    source,
    payload_hash,
    total_items,
    total_amount,
    transaction_ids
  ) VALUES (
    v_user_id,
    p_idempotency_key,
    COALESCE(p_source, 'pdf'),
    p_payload_hash,
    v_items_count,
    v_total_amount,
    v_inserted_ids
  );

  -- 6. Retorno com metadados e lista de IDs gerados
  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'idempotency_key', p_idempotency_key,
    'total_transactions_created', v_items_count,
    'total_amount', v_total_amount,
    'transaction_ids', v_inserted_ids,
    'message', 'Lote de compras gravado com sucesso com garantia de atomicidade.'
  );
END;
$$;

-- Permissões de execução: revoga de PUBLIC e restringe exclusivamente a authenticated
REVOKE ALL ON FUNCTION public.import_pdf_invoice_batch(text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.import_pdf_invoice_batch(text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_pdf_invoice_batch(text, text, text, jsonb, jsonb) TO authenticated;

