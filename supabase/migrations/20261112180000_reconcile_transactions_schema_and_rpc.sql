-- ==============================================================================
-- MIGRATION: 20261112180000_reconcile_transactions_schema_and_rpc.sql
-- ETAPA 32 — RECONCILIAÇÃO ESTRUTURAL DE TRANSACTIONS E IDEMPOTÊNCIA DA ETAPA 28
-- ==============================================================================
-- Objetivos:
-- 1. Adicionar com ADD COLUMN IF NOT EXISTS todos os campos necessários na tabela
--    public.transactions: purchase_date, due_date, paid_at, status, is_recurring,
--    installment_group_id, installment_number, installment_total, installment_purchase_amount.
-- 2. Definir constraints seguras de validação de valores financeiros e parcelamentos.
-- 3. Realizar backfill conservador para registros legados sem quitações artificiais.
-- 4. Garantir a existência de public.import_operations, RLS, índices e policies.
-- 5. Atualizar a RPC transacional import_pdf_invoice_batch com Advisory Lock para
--    idempotência rigorosa em concorrência simultânea, validações e isolamento.
-- 6. Notificar o PostgREST para recarregar o schema cache imediatamente.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADIÇÃO INCREMENTAL DE COLUNAS EM public.transactions (IF NOT EXISTS)
-- ------------------------------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS installment_group_id text,
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installment_total integer,
  ADD COLUMN IF NOT EXISTS installment_purchase_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS purchase_date timestamptz,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text; -- sem DEFAULT 'paid' para evitar preenchimento indevido

-- ------------------------------------------------------------------------------
-- 2. RECONCILIAÇÃO E CONSTRAINTS DE VALIDAÇÃO (DEFENSIVAS E IDEMPOTENTES)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  -- 2.1 Constraint de status: aceita 'paid', 'pending', 'overdue' e 'unknown'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_status_check'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    IF pg_get_constraintdef((
      SELECT oid FROM pg_constraint
      WHERE conname = 'transactions_status_check'
        AND conrelid = 'public.transactions'::regclass
    )) NOT LIKE '%unknown%' THEN
      ALTER TABLE public.transactions DROP CONSTRAINT transactions_status_check;
      ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_status_check
        CHECK (status IN ('paid', 'pending', 'overdue', 'unknown'));
    END IF;
  ELSE
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('paid', 'pending', 'overdue', 'unknown'));
  END IF;

  -- 2.2 Número da parcela (deve ser maior que zero quando informado)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_installment_number_check'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_installment_number_check
      CHECK (installment_number IS NULL OR installment_number > 0);
  END IF;

  -- 2.3 Total de parcelas (deve ser maior ou igual ao número da parcela quando informado)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_installment_total_check'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_installment_total_check
      CHECK (installment_total IS NULL OR installment_total >= COALESCE(installment_number, 1));
  END IF;

  -- 2.4 Valor da compra parcelada (deve ser maior que zero quando informado)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_installment_purchase_amount_check'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_installment_purchase_amount_check
      CHECK (installment_purchase_amount IS NULL OR installment_purchase_amount > 0);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. BACKFILL CONSERVADOR DOS REGISTROS LEGADOS (SEM QUITAÇÃO ARTIFICIAL)
-- ------------------------------------------------------------------------------

-- 3.1 Garantir is_recurring não nulo nos registros legados
UPDATE public.transactions
SET is_recurring = false
WHERE is_recurring IS NULL;

-- 3.2 Parcelas legadas sem status:
-- Preserva due_date e paid_at como NULL (não inventar vencimento ou pagamento)
-- Status definido como 'pending'
UPDATE public.transactions
SET
  purchase_date = COALESCE(purchase_date, created_at),
  due_date      = due_date,
  paid_at       = paid_at,
  status        = 'pending'
WHERE installment_group_id IS NOT NULL
  AND status IS NULL;

-- 3.3 Transações avulsas legadas sem status:
-- Preserva a incerteza contábil classificando como 'unknown'
-- due_date e paid_at permanecem NULL se não comprovados
UPDATE public.transactions
SET
  purchase_date = COALESCE(purchase_date, created_at),
  due_date      = due_date,
  paid_at       = paid_at,
  status        = 'unknown'
WHERE installment_group_id IS NULL
  AND status IS NULL;

-- ------------------------------------------------------------------------------
-- 4. ÍNDICES DE PERFORMANCE ESSENCIAIS (IF NOT EXISTS)
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_transactions_user_due_date
  ON public.transactions (user_id, due_date ASC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_status
  ON public.transactions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_transactions_installment_group
  ON public.transactions (installment_group_id)
  WHERE installment_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_purchase_date
  ON public.transactions (user_id, purchase_date DESC);

-- ------------------------------------------------------------------------------
-- 5. TABELA DE OPERAÇÕES DE IMPORTAÇÃO E IDEMPOTÊNCIA (ETAPA 28)
-- ------------------------------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_import_operations_user_created 
  ON public.import_operations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_operations_lookup 
  ON public.import_operations(user_id, idempotency_key);

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

-- ------------------------------------------------------------------------------
-- 6. FUNÇÃO RPC TRANSACIONAL ATÔMICA COM IDEMPOTÊNCIA E ADVISORY LOCK
-- ------------------------------------------------------------------------------

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
  -- 1. Validação estrita de autenticação
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: operação de importação requer usuário autenticado.';
  END IF;

  -- 2. Validação da chave de idempotência e payload
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Chave de idempotência inválida ou ausente.';
  END IF;

  IF p_payload_hash IS NULL OR length(trim(p_payload_hash)) < 32 THEN
    RAISE EXCEPTION 'Hash do payload inválido ou ausente (mínimo 32 caracteres).';
  END IF;

  IF p_transactions IS NULL OR jsonb_array_length(p_transactions) = 0 THEN
    RAISE EXCEPTION 'Nenhuma transação informada para gravação no lote.';
  END IF;

  -- 3. Advisory Lock Transacional por usuário + idempotency_key
  -- Garante serialização estrita em requisições simultâneas com a mesma chave:
  -- a segunda requisição aguarda a primeira concluir e retorna idempotentemente already_processed = true.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_idempotency_key));

  -- 4. Verificação de idempotência (operações já concluídas retornam imediatamente)
  SELECT * INTO v_existing_op 
  FROM public.import_operations
  WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- A mesma chave com payload hash diferente deve ser categoricamente rejeitada
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

  -- 5. Processamento atômico das transações
  -- Todo o corpo da função executa dentro da transação do PostgreSQL.
  -- Qualquer erro dispara ROLLBACK de 100% das inserções.
  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_tx_id := COALESCE((v_tx->>'id')::uuid, gen_random_uuid());
    v_amount := (v_tx->>'amount')::numeric;
    v_description := trim(COALESCE(v_tx->>'description', ''));
    v_category := COALESCE(v_tx->>'category', 'Compras');
    v_type := 'expense'; -- Importações de fatura são estritamente despesas
    v_payment_method := COALESCE(v_tx->>'payment_method', 'cartao_credito');
    v_created_at := COALESCE((v_tx->>'created_at')::timestamptz, now());
    v_purchase_date := COALESCE((v_tx->>'purchase_date')::timestamptz, v_created_at);
    
    -- Vencimento: usa o do item ou o vencimento global da fatura fornecido nos metadados
    v_due_date := (v_tx->>'due_date')::date;
    IF v_due_date IS NULL AND p_metadata IS NOT NULL AND p_metadata->>'dueDate' IS NOT NULL THEN
      BEGIN
        v_due_date := (p_metadata->>'dueDate')::date;
      EXCEPTION WHEN OTHERS THEN
        v_due_date := NULL;
      END;
    END IF;

    -- Validação de status contábil:
    -- NUNCA permite status 'paid' ou 'unknown' na importação. Força 'pending' ou 'overdue'.
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

    -- Validação de consistência do parcelamento
    IF v_installment_number IS NOT NULL OR v_installment_total IS NOT NULL THEN
      IF v_installment_number IS NULL OR v_installment_number < 1 THEN
        RAISE EXCEPTION 'Número de parcela inválido na transação "%": %', v_description, v_installment_number;
      END IF;
      IF v_installment_total IS NULL OR v_installment_total < v_installment_number THEN
        RAISE EXCEPTION 'Total de parcelas (%) menor que o número da parcela (%) na transação "%"', 
          v_installment_total, v_installment_number, v_description;
      END IF;
      IF v_installment_purchase_amount IS NOT NULL AND v_installment_purchase_amount <= 0 THEN
        RAISE EXCEPTION 'Valor total da compra parcelada deve ser positivo na transação "%"', v_description;
      END IF;
    END IF;

    -- Inserção na tabela transactions
    -- paid_at é estritamente NULL: compras de fatura nunca são dadas como pagas na importação.
    -- is_recurring é estritamente false: faturas importam despesas avulsas/parceladas.
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
      v_user_id,       -- sempre auth.uid(), nunca do JSON do cliente
      v_amount,
      v_category,
      v_payment_method,
      v_description,
      v_type,
      false,           -- is_recurring sempre false
      v_notes,
      v_created_at,
      v_purchase_date,
      v_due_date,
      NULL,            -- paid_at NUNCA marcado na importação
      v_status,        -- somente 'pending' ou 'overdue'
      v_installment_group_id,
      v_installment_number,
      v_installment_total,
      v_installment_purchase_amount
    );

    v_inserted_ids := array_append(v_inserted_ids, v_tx_id);
    v_total_amount := v_total_amount + v_amount;
    v_items_count := v_items_count + 1;
  END LOOP;

  -- 6. Gravação da operação no histórico de idempotência
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

  -- 7. Retorno com metadados e lista de IDs gerados
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

-- ------------------------------------------------------------------------------
-- 7. RECARREGAMENTO DO SCHEMA CACHE DO POSTGREST
-- ------------------------------------------------------------------------------
-- Instrui o PostgREST a recarregar imediatamente as colunas recém-adicionadas
-- eliminando o erro "Could not find the 'due_date' column of 'transactions' in the schema cache".
NOTIFY pgrst, 'reload schema';

