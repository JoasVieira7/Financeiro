/**
 * Utilitários matemáticos padronizados para conversão de Orçamento e Metas de Economia
 * ETAPA 18 — Consistência matemática sem drift cumulativo de centavos
 */

export type BudgetPeriod = 'weekly' | 'monthly';

export const WEEKS_PER_MONTH = 4;

/**
 * Arredonda um valor numérico para exatamente 2 casas decimais (centavos).
 * Evita resíduos binários de ponto flutuante (ex: 0.1 + 0.2 = 0.30000000000000004).
 */
export function roundToCents(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

/**
 * Converte valor semanal para mensal (semanal * 4).
 */
export function weeklyToMonthly(weeklyAmount: number): number {
  return roundToCents(weeklyAmount * WEEKS_PER_MONTH);
}

/**
 * Converte valor mensal para semanal (mensal / 4).
 */
export function monthlyToWeekly(monthlyAmount: number): number {
  return roundToCents(monthlyAmount / WEEKS_PER_MONTH);
}

/**
 * Retorna o orçamento efetivo do período ativo:
 * - Se mensal: retorna o próprio monthly_budget.
 * - Se semanal: retorna monthly_budget / 4.
 */
export function getEffectiveBudget(monthlyBudget: number, period: BudgetPeriod): number {
  const safeMonthly = Math.max(0, monthlyBudget || 0);
  return period === 'weekly' ? monthlyToWeekly(safeMonthly) : roundToCents(safeMonthly);
}

/**
 * Retorna a meta de economia efetiva do período ativo:
 * - Se semanal: retorna o próprio weekly_saving_target.
 * - Se mensal: retorna weekly_saving_target * 4.
 */
export function getEffectiveSavingTarget(weeklyTarget: number, period: BudgetPeriod): number {
  const safeWeekly = Math.max(0, weeklyTarget || 0);
  return period === 'monthly' ? weeklyToMonthly(safeWeekly) : roundToCents(safeWeekly);
}

/**
 * Retorna texto explicativo de equivalência entre períodos.
 */
export function getPeriodEquivalenceNote(
  amount: number,
  period: BudgetPeriod,
  formatCurrencyFn: (val: number) => string
): string {
  const val = Math.max(0, Number(amount) || 0);
  if (period === 'weekly') {
    const monthlyEquivalent = weeklyToMonthly(val);
    return `Equivale a ${formatCurrencyFn(monthlyEquivalent)} no mês (base: 4 semanas).`;
  } else {
    const weeklyEquivalent = monthlyToWeekly(val);
    return `Equivale a ${formatCurrencyFn(weeklyEquivalent)} por semana (base: 4 semanas).`;
  }
}

