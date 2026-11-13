-- ============================================================================
-- ETAPA 38 — MIGRATION LOCAL: CLASSIFICAÇÃO ESTRUTURADA DE TRANSFERÊNCIAS
-- ============================================================================
-- ATENÇÃO: Este arquivo é SOMENTE PARA REFERÊNCIA LOCAL.
-- NÃO executar remotamente. NÃO aplicar via `supabase db push`.
-- NÃO rodar em produção sem autorização explícita.
-- ============================================================================
--
-- OBJETIVO:
-- Permitir identificação estruturada de transferências internas (aportes e
-- resgates em metas de economia) via campo `movement_type` na tabela
-- `transactions`, eliminando a dependência frágil de string matching em
-- `description` (ex: 'Aporte na Meta:', 'Resgate da Meta:').
--
-- CONTEXTO:
-- Atualmente o frontend identifica transferências internas usando:
--   - description.startsWith('Aporte na Meta:')
--   - description.startsWith('Resgate da Meta:')
--   - notes?.includes('[movement:goal_deposit]')
--   - notes?.includes('[movement:goal_withdraw]')
--   - notes?.includes('[goal_transfer]')
--
-- Essa abordagem funciona, mas é frágil porque o usuário poderia, em teoria,
-- editar a descrição de uma transação quebrando a identificação.
--
-- A solução abaixo adiciona um campo estruturado imutável.
--
-- ============================================================================
-- TABELAS E CAMPOS AFETADOS:
-- ============================================================================
-- Tabela: transactions
-- Novo campo: movement_type (TEXT, nullable, CHECK constraint)
-- Novo campo: related_goal_id (UUID, nullable, FK → savings_goals.id)
--
-- ============================================================================

-- 1. Tipo de movimentação estruturado
-- Valores possíveis:
--   'operational_expense'   → Despesa operacional real
--   'operational_income'    → Receita operacional real
--   'goal_deposit'          → Aporte em meta de economia
--   'goal_withdraw'         → Resgate/retirada de meta de economia
--   'account_transfer'      → Transferência interna entre contas
--   NULL                    → Legado (classificado por string matching)

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS movement_type TEXT DEFAULT NULL
CHECK (movement_type IS NULL OR movement_type IN (
  'operational_expense',
  'operational_income',
  'goal_deposit',
  'goal_withdraw',
  'account_transfer'
));

COMMENT ON COLUMN transactions.movement_type IS
  'Classificação estruturada da movimentação. NULL para registros legados (pré-Etapa 38).';

-- 2. Referência à meta de economia vinculada (quando aplicável)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS related_goal_id UUID DEFAULT NULL
REFERENCES savings_goals(id) ON DELETE SET NULL;

COMMENT ON COLUMN transactions.related_goal_id IS
  'FK opcional para a meta de economia associada. SET NULL quando a meta é excluída, preservando o histórico financeiro.';

-- 3. Índice parcial para consultas rápidas de transferências internas
CREATE INDEX IF NOT EXISTS idx_transactions_movement_type
ON transactions(movement_type)
WHERE movement_type IS NOT NULL;

-- 4. Retrocompatibilidade: Preencher registros existentes (OPCIONAL)
-- Este UPDATE pode ser executado manualmente após revisão:
--
-- UPDATE transactions
-- SET movement_type = 'goal_deposit',
--     related_goal_id = (
--       SELECT id FROM savings_goals
--       WHERE transactions.description LIKE 'Aporte na Meta: ' || savings_goals.title
--       LIMIT 1
--     )
-- WHERE description LIKE 'Aporte na Meta:%'
--   AND movement_type IS NULL;
--
-- UPDATE transactions
-- SET movement_type = 'goal_withdraw',
--     related_goal_id = (
--       SELECT id FROM savings_goals
--       WHERE transactions.description LIKE 'Resgate da Meta: ' || savings_goals.title
--       LIMIT 1
--     )
-- WHERE description LIKE 'Resgate da Meta:%'
--   AND movement_type IS NULL;

-- ============================================================================
-- NOTAS IMPORTANTES:
-- ============================================================================
-- 1. O campo movement_type é NULLABLE para manter compatibilidade total com
--    registros existentes. Registros legados continuam funcionando via
--    string matching no frontend (isInternalGoalTransfer).
--
-- 2. O campo related_goal_id usa ON DELETE SET NULL para que, quando uma meta
--    é excluída, o registro da transação seja preservado (o histórico financeiro
--    não é perdido), apenas a referência à meta é removida.
--
-- 3. O frontend (FinanceContext.tsx, ReportsView.tsx) já implementa
--    identificação dual: primeiro verifica tags estruturadas em `notes`
--    ([movement:goal_deposit], [movement:goal_withdraw]), depois faz
--    fallback para string matching em `description`.
--
-- 4. Quando esta migration for aplicada, o frontend pode ser atualizado para
--    priorizar `movement_type` sobre string matching, proporcionando
--    classificação mais robusta e imune a edições de descrição.
-- ============================================================================

