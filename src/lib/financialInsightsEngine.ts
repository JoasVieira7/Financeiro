import { Transaction, TransactionCategory, UserProfile } from '../types';
import { roundToCents } from './budgetCalculations';
import { formatCurrency } from './formatters';

export type InsightType = 'observation' | 'estimate' | 'suggestion';

export interface FinancialInsight {
  id: string;
  type: InsightType;
  typeLabel: 'Observação' | 'Estimativa' | 'Sugestão';
  title: string;
  message: string;
  actionText?: string;
  actionTab?: 'transactions' | 'reports' | 'goals' | 'home';
  calculationDetail?: string;
  category?: TransactionCategory;
  impactLevel: 'info' | 'positive' | 'warning';
}

/**
 * Motor de Inteligência Financeira e Dicas Baseadas em Dados Reais (Etapa 34.3)
 */
export function generateFinancialInsights(
  transactions: Transaction[],
  profile: UserProfile | null,
  referenceDate = new Date()
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth();

  // Mês anterior
  const prevDate = new Date(currentYear, currentMonth - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth();

  // Filtra despesas do mês atual e do mês anterior
  const currentMonthExpenses = transactions.filter(t => {
    if (t.type !== 'expense') return false;
    const d = new Date(t.purchase_date || t.created_at);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });

  const prevMonthExpenses = transactions.filter(t => {
    if (t.type !== 'expense') return false;
    const d = new Date(t.purchase_date || t.created_at);
    return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
  });

  // Regra 1: Dados Insuficientes (< 3 despesas no histórico)
  if (currentMonthExpenses.length < 3 && prevMonthExpenses.length === 0) {
    insights.push({
      id: 'insufficient_data',
      type: 'observation',
      typeLabel: 'Observação',
      title: 'Comece a registrar seus gastos',
      message:
        'Conforme você adiciona suas compras ou importa suas faturas, o Fluxo Financeiro identificará automaticamente padrões de gastos, assinaturas e oportunidades de economia.',
      impactLevel: 'info',
      actionText: 'Registrar movimentação',
      actionTab: 'home',
      calculationDetail: 'Análises avançadas exigem ao menos 3 lançamentos no histórico.',
    });
    return insights;
  }

  // 1. Identificação de Gastos Elevados por Categoria vs Mês Anterior
  const currentCatTotals: Record<string, number> = {};
  for (const t of currentMonthExpenses) {
    currentCatTotals[t.category] = (currentCatTotals[t.category] || 0) + Number(t.amount);
  }

  const prevCatTotals: Record<string, number> = {};
  for (const t of prevMonthExpenses) {
    prevCatTotals[t.category] = (prevCatTotals[t.category] || 0) + Number(t.amount);
  }

  let topGrowthCat: { cat: TransactionCategory; diff: number; pct: number } | null = null;
  for (const [cat, currentVal] of Object.entries(currentCatTotals)) {
    const prevVal = prevCatTotals[cat] || 0;
    if (prevVal >= 40 && currentVal > prevVal) {
      const diff = roundToCents(currentVal - prevVal);
      const pct = Math.round((diff / prevVal) * 100);
      if (pct >= 20 && diff >= 50) {
        if (!topGrowthCat || diff > topGrowthCat.diff) {
          topGrowthCat = { cat: cat as TransactionCategory, diff, pct };
        }
      }
    }
  }

  if (topGrowthCat) {
    insights.push({
      id: `growth_${topGrowthCat.cat}`,
      type: 'observation',
      typeLabel: 'Observação',
      title: `Aumento em ${topGrowthCat.cat}`,
      message: `Seus gastos em ${topGrowthCat.cat} estão ${formatCurrency(topGrowthCat.diff)} (+${topGrowthCat.pct}%) maiores do que no mês anterior.`,
      calculationDetail: `Mês anterior: ${formatCurrency(prevCatTotals[topGrowthCat.cat])} • Mês atual: ${formatCurrency(currentCatTotals[topGrowthCat.cat])}`,
      impactLevel: 'warning',
      actionText: 'Ver categoria',
      actionTab: 'reports',
    });
  }

  // 2. Identificação de Assinaturas e Recorrências Digitais
  const subscriptionKeywords =
    /netflix|spotify|prime|disney|hbo|max|apple|google\s*storage|playstation|xbox|steam|globo|deezer|smart\s*fit|gympass|clube|recarga/i;

  const foundSubs = transactions.filter(t => {
    if (t.type !== 'expense') return false;
    return subscriptionKeywords.test(t.description) || t.is_recurring;
  });

  // Agrupa assinaturas únicas pela descrição normalizada
  const uniqueSubs = new Map<string, number>();
  for (const s of foundSubs) {
    const norm = s.description.toLowerCase().trim();
    if (!uniqueSubs.has(norm)) {
      uniqueSubs.set(norm, Number(s.amount));
    }
  }

  if (uniqueSubs.size >= 2) {
    let monthlySubTotal = 0;
    for (const val of uniqueSubs.values()) {
      monthlySubTotal += val;
    }
    monthlySubTotal = roundToCents(monthlySubTotal);
    const annualEstimated = roundToCents(monthlySubTotal * 12);

    insights.push({
      id: 'subscriptions_review',
      type: 'estimate',
      typeLabel: 'Estimativa',
      title: 'Assinaturas e Serviços Digitais',
      message: `Identificamos ${uniqueSubs.size} serviços recorrentes somando aproximadamente ${formatCurrency(monthlySubTotal)}/mês. Em um ano, isso representa cerca de ${formatCurrency(annualEstimated)}.`,
      calculationDetail: `Cálculo baseado em ${uniqueSubs.size} serviços identificados: ${Array.from(uniqueSubs.keys()).slice(0, 3).join(', ')}...`,
      impactLevel: 'info',
      actionText: 'Revisar despesas',
      actionTab: 'reports',
    });
  }

  // 3. Compras Parceladas e Renda Futura Comprometida
  const activeInstallments = transactions.filter(
    t => Boolean(t.installment_group_id) && t.status !== 'paid' && Number(t.installment_total) > 1
  );

  const futureInstallmentSum = roundToCents(
    activeInstallments.reduce((acc, t) => acc + Number(t.amount), 0)
  );

  const monthlyBudget = profile?.monthly_budget || 0;

  if (activeInstallments.length >= 2 && futureInstallmentSum > 0) {
    const committedPct =
      monthlyBudget > 0 ? Math.round((futureInstallmentSum / monthlyBudget) * 100) : 0;

    insights.push({
      id: 'installments_commitment',
      type: 'estimate',
      typeLabel: 'Estimativa',
      title: 'Compromissos em Parcelas Futuras',
      message: `Você possui ${activeInstallments.length} parcelas ativas a vencer, somando ${formatCurrency(futureInstallmentSum)}${
        committedPct > 0 ? ` (${committedPct}% da sua renda mensal)` : ''
      }.`,
      calculationDetail: `Soma das parcelas ainda não quitadas distribuídas nos próximos vencimentos.`,
      impactLevel: committedPct >= 50 ? 'warning' : 'info',
      actionText: 'Ver compromissos',
      actionTab: 'transactions',
    });
  }

  // 4. Despesas Frequentes de Pequeno Valor (Micro-gastos)
  const smallExpenses = currentMonthExpenses.filter(t => t.amount <= 30 && t.amount > 0);
  if (smallExpenses.length >= 5) {
    const smallTotal = roundToCents(smallExpenses.reduce((acc, t) => acc + Number(t.amount), 0));
    insights.push({
      id: 'frequent_small_expenses',
      type: 'observation',
      typeLabel: 'Observação',
      title: 'Pequenos Gastos Frequentes',
      message: `Identificamos ${smallExpenses.length} compras de até R$ 30,00 que já totalizam ${formatCurrency(smallTotal)} neste mês.`,
      calculationDetail: `Gastos diários menores acumulados costumam representar uma fatia considerável do orçamento.`,
      impactLevel: 'info',
      actionText: 'Ver extrato',
      actionTab: 'transactions',
    });
  }

  // 5. Planejamento Financeiro Realista e Metas
  const currentTotalExpense = roundToCents(
    currentMonthExpenses.reduce((acc, t) => acc + Number(t.amount), 0)
  );
  const netSurplus = monthlyBudget > 0 ? roundToCents(monthlyBudget - currentTotalExpense) : 0;
  const currentWeeklyTarget = profile?.weekly_saving_target ?? 250;

  if (currentWeeklyTarget <= 0) {
    // Usuário optou por NÃO ter meta
    if (netSurplus > 200) {
      insights.push({
        id: 'no_goal_opportunity',
        type: 'suggestion',
        typeLabel: 'Sugestão',
        title: 'Saldo Positivo no Mês',
        message: `Você está sem meta definida e possui ${formatCurrency(netSurplus)} disponíveis. Se desejar guardar uma parte para uma viagem ou reserva, você pode definir uma meta a qualquer momento.`,
        calculationDetail: `Renda de ${formatCurrency(monthlyBudget)} menos gastos de ${formatCurrency(currentTotalExpense)}.`,
        impactLevel: 'positive',
        actionText: 'Definir meta opcional',
        actionTab: 'goals',
      });
    }
  } else if (netSurplus > 0) {
    const realisticSave = roundToCents(netSurplus * 0.2);
    if (realisticSave >= 50) {
      insights.push({
        id: 'realistic_savings_suggestion',
        type: 'suggestion',
        typeLabel: 'Sugestão',
        title: 'Oportunidade de Reserva',
        message: `Com base nas suas despesas e renda atuais, reservar ${formatCurrency(realisticSave)} (20% do saldo restante) é uma meta confortável sem comprometer seus pagamentos.`,
        calculationDetail: `Sugestão de 20% sobre o saldo livre de ${formatCurrency(netSurplus)}.`,
        impactLevel: 'positive',
        actionText: 'Ajustar meta',
        actionTab: 'goals',
      });
    }
  }

  return insights;
}

