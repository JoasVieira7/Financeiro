import { SanitizedFinancialSnapshot } from './types';
import { formatCurrency } from '../../lib/formatters';

export interface DeterministicFinancialInsight {
  id: string;
  type: 'alert' | 'positive' | 'opportunity' | 'neutral';
  title: string;
  description: string;
  metric?: string;
}

/**
 * Motor de Análise Financeira Determinística (Regras Matemáticas Sem Custo de IA)
 * Fornece insights exatos, auditáveis e livres de alucinações.
 */
export class AIAnalyticsEngine {
  public static generateDeterministicInsights(
    snapshot: SanitizedFinancialSnapshot
  ): DeterministicFinancialInsight[] {
    const insights: DeterministicFinancialInsight[] = [];

    // 1. Análise de Comprometimento de Renda
    if (snapshot.totalIncome > 0) {
      const expenseRate = Math.round((snapshot.totalExpense / snapshot.totalIncome) * 100);
      if (expenseRate > 85) {
        insights.push({
          id: 'insight-income-strain',
          type: 'alert',
          title: 'Alto Comprometimento de Renda',
          description: `Suas despesas consomem ${expenseRate}% das receitas deste ciclo. Mantenha os gastos variáveis contidos até a próxima receita.`,
          metric: `${expenseRate}% comprometido`,
        });
      } else if (expenseRate <= 60 && snapshot.totalExpense > 0) {
        insights.push({
          id: 'insight-income-healthy',
          type: 'positive',
          title: 'Margem Financeira Saudável',
          description: `Excelente controle: você gastou apenas ${expenseRate}% do que recebeu, mantendo uma folga confortável.`,
          metric: `${100 - expenseRate}% livre`,
        });
      }
    }

    // 2. Análise da Categoria Dominante
    if (snapshot.topCategories.length > 0) {
      const dominant = snapshot.topCategories[0];
      if (dominant.pctOfTotalExpense >= 35 && dominant.amount > 0) {
        insights.push({
          id: 'insight-dominant-category',
          type: 'opportunity',
          title: `Concentração em ${dominant.category}`,
          description: `A categoria "${dominant.category}" representa ${dominant.pctOfTotalExpense}% de todas as suas despesas (${formatCurrency(dominant.amount)}). Pequenos cortes nesta categoria geram o maior alívio financeiro.`,
          metric: `${dominant.pctOfTotalExpense}% do total`,
        });
      }
    }

    // 3. Análise da Meta de Economia
    if (snapshot.monthlySavingTarget > 0) {
      if (snapshot.savingsGoalReachedPct >= 100) {
        insights.push({
          id: 'insight-goal-achieved',
          type: 'positive',
          title: 'Meta de Economia Conquistada! 🎉',
          description: `Você atingiu ${snapshot.savingsGoalReachedPct}% da sua meta mensal. Seu esforço de poupança está gerando resultados concretos.`,
          metric: `${snapshot.savingsGoalReachedPct}% atingido`,
        });
      } else if (snapshot.netSavings > 0) {
        const remaining = Math.max(0, snapshot.monthlySavingTarget - snapshot.netSavings);
        insights.push({
          id: 'insight-goal-in-progress',
          type: 'neutral',
          title: 'Progresso da Meta de Economia',
          description: `Você já acumulou ${formatCurrency(snapshot.netSavings)}. Faltam ${formatCurrency(remaining)} para atingir seu objetivo do mês.`,
          metric: `${snapshot.savingsGoalReachedPct}% concluído`,
        });
      }
    }

    // 4. Análise de Parcelamentos Futuros
    if (snapshot.totalPendingDebt > 0) {
      insights.push({
        id: 'insight-debt-load',
        type: 'neutral',
        title: 'Controle de Parcelamentos Futuros',
        description: `Você possui ${formatCurrency(snapshot.totalPendingDebt)} em faturas/parcelas futuras programadas. Evite novas compras parceladas até liquidar as atuais.`,
        metric: formatCurrency(snapshot.totalPendingDebt),
      });
    }

    return insights;
  }
}

