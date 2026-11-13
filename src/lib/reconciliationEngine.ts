import { Transaction, TransactionCategory } from '../types';
import { normalizeDescription } from './categorizer';
import { roundToCents } from './budgetCalculations';

export type ReconciliationStatus =
  | 'new'
  | 'identical'
  | 'updated'
  | 'unmatched_existing'
  | 'conflict';

export interface ReconciliationDiff {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
}

export interface ReconciledItem {
  id: string; // ID único temporário para controle na UI
  status: ReconciliationStatus;
  statusLabel: string;
  existingTransactionId?: string;
  matchedTransaction?: Transaction;
  // Dados do item da nova importação
  description: string;
  cleanEstablishment: string;
  amount: number;
  purchaseDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  category: TransactionCategory;
  currentInstallment?: number;
  totalInstallments?: number;
  cardIdentifier?: string;
  isRefund?: boolean;
  type?: 'one_off' | 'installment' | 'refund' | 'payment' | 'fee';
  diffs: ReconciliationDiff[];
  // Decisão do usuário para a reconciliação
  decision: 'create' | 'update' | 'keep_existing' | 'ignore' | 'remove_existing';
  decisionReason?: string;
  // Flag se requer revisão manual
  needsReview: boolean;
  confidenceScore: number; // 0 a 100
}

export interface ReconciliationReport {
  newCount: number;
  identicalCount: number;
  updatedCount: number;
  unmatchedExistingCount: number;
  conflictCount: number;
  totalParsedItems: number;
  items: ReconciledItem[];
}

/**
 * Remove sufixos comuns de faturas como "01/10", "PARC 02", "SAO PAULO BRA", etc.
 */
export function extractCleanEstablishmentName(desc: string): string {
  if (!desc) return '';
  return desc
    // Remove padrões de parcela: "01/10", "(02/12)", "PARC 03/06", "- 1/5"
    .replace(/(\(?\s*\d{1,2}\s*[\/\-]\s*\d{1,2}\s*\)?)/gi, '')
    .replace(/\b(parc|parcela|parc\.)\s*\d{1,2}(\s*de\s*\d{1,2})?\b/gi, '')
    // Remove sufixos de cidade/país frequentes em faturas (ex: "SAO PAULO BRA", "SAO PAULO BR")
    .replace(/\b(sao paulo|rio de janeiro|curitiba|belo horizonte|porto alegre|brasilia|salvador|fortaleza|recife)\s*(bra?|br)?\b/gi, '')
    .replace(/\b(bra|br)\b/gi, '')
    // Remove sequências de dígitos soltos ou códigos de autorização
    .replace(/\b\d{6,}\b/g, '')
    .replace(/[*#_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula a similaridade entre duas strings normalizadas (0 a 1).
 */
function calculateTextSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  if (str1.includes(str2) || str2.includes(str1)) {
    const longer = Math.max(str1.length, str2.length);
    const shorter = Math.min(str1.length, str2.length);
    return shorter / longer;
  }
  return 0.0;
}

export interface ParsedItemCandidate {
  id: string;
  description: string;
  amount: number;
  purchaseDate: string;
  dueDate: string;
  category: TransactionCategory;
  currentInstallment?: number;
  totalInstallments?: number;
  cardIdentifier?: string;
  isRefund?: boolean;
  type?: 'one_off' | 'installment' | 'refund' | 'payment' | 'fee';
}

/**
 * Motor Inteligente de Reconciliação Multivariável de Faturas (Etapa 34.3)
 *
 * Compara compras importadas contra transações existentes no banco/estado:
 * - Não compara apenas valor ou apenas nome!
 * - Utiliza descrição normalizada, estabelecimento limpo, valor, data da compra,
 *   parcela atual/total e cartão/origem.
 * - Categoriza em:
 *   1. Novas (sem correspondente anterior)
 *   2. Idênticas (já existem e sem alterações)
 *   3. Atualizadas (mesma compra encontrada com dados divergentes/corrigidos)
 *   4. Não presentes no arquivo (compras existentes no período que não constam no novo arquivo — NUNCA excluídas automaticamente)
 *   5. Conflitos / Ambiguidade (requerem revisão manual)
 */
export function reconcileInvoicePurchases(
  incomingItems: ParsedItemCandidate[],
  existingTransactions: Transaction[],
  referencePeriod?: { year: number; month: number }
): ReconciliationReport {
  const matchedExistingIds = new Set<string>();
  const reconciledItems: ReconciledItem[] = [];

  for (const item of incomingItems) {
    const incomingCleanEst = extractCleanEstablishmentName(item.description);
    const incomingNormEst = normalizeDescription(incomingCleanEst);
    const incomingNormFull = normalizeDescription(item.description);
    const incomingAmount = roundToCents(Math.abs(item.amount));

    let bestMatch: Transaction | null = null;
    let bestScore = 0;
    let isAmbiguous = false;

    for (const existing of existingTransactions) {
      // Ignora receitas
      if (existing.type === 'income') continue;

      const existingAmount = roundToCents(Math.abs(existing.amount));
      const existingCleanEst = extractCleanEstablishmentName(existing.description);
      const existingNormEst = normalizeDescription(existingCleanEst);
      const existingNormFull = normalizeDescription(existing.description);

      let score = 0;

      // 1. Comparação de Valor (tolerância de R$ 0.02 para centavos)
      const amountDiff = Math.abs(incomingAmount - existingAmount);
      const isAmountExact = amountDiff < 0.02;
      if (isAmountExact) {
        score += 35;
      } else if (amountDiff < 1.0) {
        score += 15;
      }

      // 2. Comparação de Descrição / Estabelecimento
      const fullTextMatch = incomingNormFull === existingNormFull;
      const estTextMatch = incomingNormEst === existingNormEst && incomingNormEst.length >= 3;
      const similarity = calculateTextSimilarity(incomingNormEst, existingNormEst);

      if (fullTextMatch) {
        score += 35;
      } else if (estTextMatch) {
        score += 30;
      } else if (similarity > 0.7) {
        score += Math.round(similarity * 25);
      }

      // 3. Comparação de Data da Compra
      const existingPurchaseDate = existing.purchase_date || existing.created_at.slice(0, 10);
      const isPurchaseDateExact =
        Boolean(item.purchaseDate) &&
        Boolean(existingPurchaseDate) &&
        item.purchaseDate.slice(0, 10) === existingPurchaseDate.slice(0, 10);

      if (isPurchaseDateExact) {
        score += 20;
      } else if (item.dueDate && existing.due_date && item.dueDate === existing.due_date) {
        score += 10;
      }

      // 4. Comparação de Informações de Parcelamento
      const hasInstallmentInfo = Boolean(item.totalInstallments && item.totalInstallments > 1);
      const existingHasInstallment = Boolean(
        existing.installment_total && existing.installment_total > 1
      );

      if (hasInstallmentInfo && existingHasInstallment) {
        if (
          item.currentInstallment === existing.installment_number &&
          item.totalInstallments === existing.installment_total
        ) {
          score += 15;
        } else if (item.totalInstallments === existing.installment_total) {
          score += 5;
        }
      }

      // Candidato a correspondência forte (>= 60)
      if (score >= 60) {
        if (score === bestScore && bestMatch && bestMatch.id !== existing.id) {
          isAmbiguous = true;
        } else if (score > bestScore) {
          bestScore = score;
          bestMatch = existing;
          isAmbiguous = false;
        }
      }
    }

    // Classificação da correspondência do item
    if (bestMatch && bestScore >= 60) {
      matchedExistingIds.add(bestMatch.id);

      const diffs: ReconciliationDiff[] = [];
      const existingAmount = roundToCents(Math.abs(bestMatch.amount));
      if (Math.abs(incomingAmount - existingAmount) >= 0.02) {
        diffs.push({
          field: 'amount',
          label: 'Valor',
          oldValue: existingAmount,
          newValue: incomingAmount,
        });
      }

      const existingPurchaseDate = (bestMatch.purchase_date || bestMatch.created_at).slice(0, 10);
      if (item.purchaseDate && item.purchaseDate.slice(0, 10) !== existingPurchaseDate) {
        diffs.push({
          field: 'purchaseDate',
          label: 'Data da Compra',
          oldValue: existingPurchaseDate,
          newValue: item.purchaseDate.slice(0, 10),
        });
      }

      if (item.dueDate && bestMatch.due_date && item.dueDate !== bestMatch.due_date) {
        diffs.push({
          field: 'dueDate',
          label: 'Vencimento',
          oldValue: bestMatch.due_date,
          newValue: item.dueDate,
        });
      }

      if (bestMatch.category !== item.category) {
        diffs.push({
          field: 'category',
          label: 'Categoria',
          oldValue: bestMatch.category,
          newValue: item.category,
        });
      }

      if (isAmbiguous) {
        reconciledItems.push({
          id: item.id,
          status: 'conflict',
          statusLabel: 'Divergência / Ambiguidade',
          existingTransactionId: bestMatch.id,
          matchedTransaction: bestMatch,
          description: item.description,
          cleanEstablishment: incomingCleanEst,
          amount: item.amount,
          purchaseDate: item.purchaseDate,
          dueDate: item.dueDate,
          category: item.category,
          currentInstallment: item.currentInstallment,
          totalInstallments: item.totalInstallments,
          cardIdentifier: item.cardIdentifier,
          isRefund: item.isRefund,
          type: item.type,
          diffs,
          decision: 'keep_existing',
          decisionReason: 'Múltiplas transações semelhantes encontradas. Requer decisão manual.',
          needsReview: true,
          confidenceScore: bestScore,
        });
      } else if (diffs.length > 0) {
        reconciledItems.push({
          id: item.id,
          status: 'updated',
          statusLabel: 'Atualizada com novos dados',
          existingTransactionId: bestMatch.id,
          matchedTransaction: bestMatch,
          description: item.description,
          cleanEstablishment: incomingCleanEst,
          amount: item.amount,
          purchaseDate: item.purchaseDate,
          dueDate: item.dueDate,
          category: item.category,
          currentInstallment: item.currentInstallment,
          totalInstallments: item.totalInstallments,
          cardIdentifier: item.cardIdentifier,
          isRefund: item.isRefund,
          type: item.type,
          diffs,
          decision: 'update',
          decisionReason: `Compra correspondente identificada (${bestScore}% de confiança). Novos dados substituirão o registro anterior.`,
          needsReview: false,
          confidenceScore: bestScore,
        });
      } else {
        reconciledItems.push({
          id: item.id,
          status: 'identical',
          statusLabel: 'Idêntica / Sem alteração',
          existingTransactionId: bestMatch.id,
          matchedTransaction: bestMatch,
          description: item.description,
          cleanEstablishment: incomingCleanEst,
          amount: item.amount,
          purchaseDate: item.purchaseDate,
          dueDate: item.dueDate,
          category: item.category,
          currentInstallment: item.currentInstallment,
          totalInstallments: item.totalInstallments,
          cardIdentifier: item.cardIdentifier,
          isRefund: item.isRefund,
          type: item.type,
          diffs: [],
          decision: 'keep_existing',
          decisionReason: 'Registro idêntico já cadastrado no seu extrato.',
          needsReview: false,
          confidenceScore: bestScore,
        });
      }
    } else {
      // Compra Nova
      reconciledItems.push({
        id: item.id,
        status: 'new',
        statusLabel: 'Compra nova',
        description: item.description,
        cleanEstablishment: incomingCleanEst,
        amount: item.amount,
        purchaseDate: item.purchaseDate,
        dueDate: item.dueDate,
        category: item.category,
        currentInstallment: item.currentInstallment,
        totalInstallments: item.totalInstallments,
        cardIdentifier: item.cardIdentifier,
        isRefund: item.isRefund,
        type: item.type,
        diffs: [],
        decision: 'create',
        decisionReason: 'Nenhuma transação correspondente encontrada no histórico.',
        needsReview: false,
        confidenceScore: 100,
      });
    }
  }

  // 4. Identificar transações existentes no período que NÃO constam no novo arquivo
  // REGRA CRÍTICA (ETAPA 34.3):
  // NÃO excluir automaticamente! Podem ser de arquivo parcial ou de período ligeiramente diferente.
  if (referencePeriod) {
    for (const existing of existingTransactions) {
      if (existing.type === 'income') continue;
      if (matchedExistingIds.has(existing.id)) continue;

      const txDateStr = existing.due_date || existing.purchase_date || existing.created_at;
      const txDate = new Date(txDateStr);
      const isSameMonth =
        txDate.getFullYear() === referencePeriod.year &&
        txDate.getMonth() === referencePeriod.month;

      if (isSameMonth && existing.payment_method === 'cartao_credito') {
        reconciledItems.push({
          id: `unmatched_${existing.id}`,
          status: 'unmatched_existing',
          statusLabel: 'Não consta neste arquivo',
          existingTransactionId: existing.id,
          matchedTransaction: existing,
          description: existing.description,
          cleanEstablishment: extractCleanEstablishmentName(existing.description),
          amount: existing.amount,
          purchaseDate: existing.purchase_date || existing.created_at.slice(0, 10),
          dueDate: existing.due_date || '',
          category: existing.category,
          currentInstallment: existing.installment_number,
          totalInstallments: existing.installment_total,
          diffs: [],
          decision: 'keep_existing', // Por padrão, SEMPRE mantém!
          decisionReason:
            'Esta compra já estava cadastrada, mas não veio no arquivo importado. Será mantida com segurança.',
          needsReview: true,
          confidenceScore: 0,
        });
      }
    }
  }

  const newCount = reconciledItems.filter(i => i.status === 'new').length;
  const identicalCount = reconciledItems.filter(i => i.status === 'identical').length;
  const updatedCount = reconciledItems.filter(i => i.status === 'updated').length;
  const unmatchedExistingCount = reconciledItems.filter(
    i => i.status === 'unmatched_existing'
  ).length;
  const conflictCount = reconciledItems.filter(i => i.status === 'conflict').length;

  return {
    newCount,
    identicalCount,
    updatedCount,
    unmatchedExistingCount,
    conflictCount,
    totalParsedItems: incomingItems.length,
    items: reconciledItems,
  };
}

