-- ==============================================================================
-- ETAPA 10: INTELIGÊNCIA FINANCEIRA, PARCELAMENTOS E HISTÓRICO
-- Arquivo: 20261031160000_installment_intelligence.sql
-- Objetivo:
-- 1. Diferenciar data da compra, vencimento da parcela e data efetiva do pagamento.
-- 2. Diferenciar despesa prevista vs despesa paga individualmente por parcela.
-- 3. Prover retrocompatibilidade total com lançamentos históricos sem quebrar integridade.
-- ==============================================================================

-- 1. Adicionar colunas de suporte a inteligência financeira e ciclo de parcelamento
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS purchase_date timestamptz,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'paid';

-- Adicionar restrição CHECK segura para status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'transactions_status_check'
  ) THEN
    ALTER TABLE public.transactions 
      ADD CONSTRAINT transactions_status_check 
      CHECK (status IN ('paid', 'pending', 'overdue'));
  END IF;
END $$;

-- 2. Migração retroativa dos dados existentes (preservando histórico financeiro)
-- Transações normais (não parceladas): consideradas pagas na data da criação
UPDATE public.transactions
SET 
  purchase_date = COALESCE(purchase_date, created_at),
  due_date = COALESCE(due_date, created_at::date),
  paid_at = COALESCE(paid_at, created_at),
  status = COALESCE(status, 'paid')
WHERE installment_group_id IS NULL;

-- Transações parceladas legadas:
-- Se a data for passada ou hoje -> considerada paga
-- Se a data for futura -> considerada pendente de pagamento
UPDATE public.transactions
SET
  due_date = COALESCE(due_date, created_at::date),
  status = CASE 
    WHEN status IS NOT NULL THEN status
    WHEN created_at <= now() THEN 'paid' 
    ELSE 'pending' 
  END,
  paid_at = CASE 
    WHEN paid_at IS NOT NULL THEN paid_at
    WHEN created_at <= now() THEN created_at 
    ELSE NULL 
  END,
  purchase_date = COALESCE(purchase_date, created_at)
WHERE installment_group_id IS NOT NULL;

-- 3. Índices otimizados para consultas de compromissos futuros e filtros de histórico
CREATE INDEX IF NOT EXISTS idx_transactions_user_due_date 
  ON public.transactions (user_id, due_date ASC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_status 
  ON public.transactions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_transactions_user_purchase_date 
  ON public.transactions (user_id, purchase_date DESC);

