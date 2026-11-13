import { Transaction, SavingsGoal, DashboardStats } from '../../types';
import { SanitizedFinancialSnapshot } from './types';

/**
 * Sanitizador de Dados Financeiros para IA
 * Garante que nenhum dado pessoal identificável (PII) seja exportado para provedores de IA.
 */
export class AIDataSanitizer {
  /**
   * Constrói um snapshot financeiro 100% anonimizado e estritamente numérico.
   */
  public static buildSanitizedSnapshot(
    stats: DashboardStats,
    transactions: Transaction[],
    goals: SavingsGoal[],
    periodLabel: string = 'Mês Atual'
  ): SanitizedFinancialSnapshot {
    const totalIncome = Math.max(0, stats.monthlyIncome || 0);
    const totalExpense = Math.max(0, stats.monthlyExpense || 0);
    const netSavings = Math.max(0, stats.monthlySavedAmount || 0);
    const monthlySavingTarget = Math.max(0, stats.effectiveSavingTarget || 0);
    const savingsGoalReachedPct = stats.monthlyGoalPercentage || 0;

    // Categorias ordenadas por consumo
    const topCategories = (stats.categoryBreakdown || []).slice(0, 5).map(cat => ({
      category: cat.category,
      amount: Number(cat.amount || 0),
      pctOfTotalExpense: Number(cat.percentage || 0),
      transactionCount: Number(cat.count || 0),
    }));

    // Parcelamentos e dívidas pendentes agregadas
    const pendingInstallments = transactions
      .filter(t => Boolean(t.installment_group_id) && !t.paid_at)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const highestExpenseCategory = topCategories.length > 0 ? topCategories[0].category : 'Nenhuma';

    return {
      periodMonthYear: periodLabel,
      currency: 'BRL',
      totalIncome,
      totalExpense,
      netSavings,
      monthlySavingTarget,
      savingsGoalReachedPct,
      totalPendingDebt: pendingInstallments,
      topCategories,
      recentTrends: {
        expenseChangeVsPreviousMonthPct: 0,
        highestExpenseCategory,
        recurringExpensesTotal: Number(stats.totalCommittedMonth || 0),
      },
    };
  }

  /**
   * Sanitiza a descrição de uma transação caso seja necessário referenciar uma linha de gasto.
   * Remove números de cartão, CPFs, CNPJs, chaves PIX, telefones, agências/contas bancárias e emails.
   */
  public static sanitizeDescription(rawDesc: string): string {
    if (!rawDesc) return '';
    return rawDesc
      .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ_OMITIDO]')
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_OMITIDO]')
      .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[CARTAO_OMITIDO]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[CHAVE_PIX_OMITIDA]')
      .replace(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}[ -]?\d{4}|\d{4}[ -]?\d{4})\b/g, '[TELEFONE_OMITIDO]')
      .replace(/\b(?:ag[eê]ncia|ag|conta|cc)[\s.:]*\d+[-0-9a-z]*\b/gi, '[DADO_BANCARIO_OMITIDO]')
      .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[EMAIL_OMITIDO]')
      .trim();
  }
}

