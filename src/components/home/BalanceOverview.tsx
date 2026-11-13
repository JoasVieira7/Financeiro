import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, getTransactionDueDate, isTransactionPaid } from '../../lib/formatters';
import { weeklyToMonthly, monthlyToWeekly } from '../../lib/budgetCalculations';
import {
  Sparkles,
  Check,
  AlertTriangle,
  AlertCircle,
  X,
  Edit3,
  ShieldCheck,
  Calendar,
  CreditCard,
  TrendingDown,
  Info,
} from 'lucide-react';

interface BalanceOverviewProps {
  onOpenQuickExpense: () => void;
}

export const BalanceOverview: React.FC<BalanceOverviewProps> = () => {
  const { stats, transactions } = useFinance();
  const { profile, updateMonthlyBudget } = useAuth();
  const [isEditBudgetOpen, setIsEditBudgetOpen] = useState(false);

  // Valores de Orçamento e Meta Mensal
  const currentMonthlyBudget = profile?.monthly_budget || 3500;
  const currentWeeklyTarget = profile?.weekly_saving_target ?? 250;
  const hasNoGoal = currentWeeklyTarget <= 0 || stats.hasNoGoal;
  const currentMonthlyTarget = hasNoGoal ? 0 : weeklyToMonthly(currentWeeklyTarget);

  const [budgetInputStr, setBudgetInputStr] = useState('');
  const [targetInputStr, setTargetInputStr] = useState('');
  const [noGoalChecked, setNoGoalChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = () => {
    setBudgetInputStr(currentMonthlyBudget.toString());
    setTargetInputStr(hasNoGoal ? '0' : currentMonthlyTarget.toString());
    setNoGoalChecked(Boolean(hasNoGoal));
    setIsEditBudgetOpen(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const budgetVal = parseFloat(budgetInputStr.replace(',', '.'));
    const targetVal = parseFloat(targetInputStr.replace(',', '.'));

    if (isNaN(budgetVal) || budgetVal <= 0) return;

    const finalMonthlyBudget = budgetVal;
    // Se marcou que não quer meta, ou informou valor <= 0, salva como 0
    const finalWeeklyTarget = (noGoalChecked || isNaN(targetVal) || targetVal <= 0)
      ? 0
      : monthlyToWeekly(targetVal);

    setIsSaving(true);
    try {
      await updateMonthlyBudget(finalMonthlyBudget, finalWeeklyTarget, 'monthly');
      setIsEditBudgetOpen(false);
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  // Cálculo de alertas preventivos baseados em dados reais
  const now = new Date();
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const monthElapsedPct = Math.round((currentDay / daysInCurrentMonth) * 100);

  // Faturas e parcelas próximas a vencer nos próximos 7 dias
  const sevenDaysAhead = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const upcomingInvoices = transactions.filter(t => {
    if (t.type !== 'expense' || isTransactionPaid(t)) return false;
    const dueDate = getTransactionDueDate(t);
    return dueDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && dueDate <= sevenDaysAhead;
  });
  const upcomingInvoicesTotal = upcomingInvoices.reduce((acc, t) => acc + Number(t.amount), 0);

  // Status visual geral
  const isDanger = stats.isBudgetNegative || stats.budgetUsedPercentage >= 95;
  const isWarning = !isDanger && (stats.budgetUsedPercentage >= 75 || stats.budgetAlertLevel === 'warning_80' || stats.budgetAlertLevel === 'warning_90');

  return (
    <div className="space-y-3">
      {/* CARD PRINCIPAL EM DESTAQUE: Quanto você pode gastar com segurança? */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all space-y-4">
        {/* Cabeçalho do Card */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isDanger
                    ? 'bg-rose-500 animate-pulse'
                    : isWarning
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-emerald-500'
                }`}
              />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Quanto você pode gastar com segurança?
              </h2>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Controle inteligente para evitar gastos excessivos e proteger suas contas
            </p>
          </div>

          <button
            onClick={handleOpenEdit}
            title="Ajustar Renda e Meta"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors cursor-pointer border border-slate-200/60 shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ajustar</span>
          </button>
        </div>

        {/* Nível 1 & 2: Valor Seguro Disponível & Limite Diário Recomendado */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-1">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">
              Valor seguro disponível no mês
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`text-3xl sm:text-4xl font-extrabold tracking-tight tnum ${
                  stats.isBudgetNegative ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {stats.isBudgetNegative ? `- ${formatCurrency(stats.deficitAmount)}` : formatCurrency(stats.remainingBudget)}
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  isDanger
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : isWarning
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {isDanger
                  ? 'Orçamento Excedido'
                  : isWarning
                  ? 'Atenção aos Gastos'
                  : 'Ritmo Seguro'}
              </span>
            </div>
          </div>

          {/* Limite Recomendado por Dia */}
          <div className="sm:text-right bg-slate-50/80 sm:bg-transparent p-3 sm:p-0 rounded-2xl border sm:border-0 border-slate-200/60">
            <span className="text-[11px] font-medium text-slate-500 block">
              Limite diário recomendado
            </span>
            <div className="text-lg sm:text-xl font-bold text-slate-900 tnum mt-0.5 flex items-center sm:justify-end gap-1.5">
              <span className="text-emerald-600 font-extrabold">{formatCurrency(stats.dailyAllowance)}</span>
              <span className="text-xs font-medium text-slate-400">/ dia</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
              {stats.remainingDaysInMonth} dias restantes no mês
            </span>
          </div>
        </div>

        {/* Nível 3 & 4: Gastos Realizados vs Contas e Faturas a Reservar */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Gastos Realizados no Mês (Pagos) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500">
                Gastos já realizados
              </span>
              <span className="text-[10px] font-bold text-slate-600 bg-white px-1.5 py-0.5 rounded-md border border-slate-200/60">
                {stats.budgetUsedPercentage}% da renda
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900 tnum">
              {formatCurrency(stats.monthlyExpense)}
            </p>
            <p className="text-[10.5px] text-slate-400 font-medium truncate">
              Débito já efetivado
            </p>
          </div>

          {/* Contas e Faturas a Reservar (Pendentes) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500">
                Faturas e contas a reservar
              </span>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200/60">
                A vencer
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900 tnum">
              {formatCurrency(stats.monthlyPendingExpense)}
            </p>
            <p className="text-[10.5px] text-slate-400 font-medium truncate">
              Compromissos deste mês
            </p>
          </div>
        </div>

        {/* Linha Informativa: Meta Mensal */}
        <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-slate-50/70 border border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-slate-600 font-medium">Meta mensal de economia:</span>
            <strong className="text-slate-900 font-semibold">
              {hasNoGoal ? 'Não definida (Opcional)' : formatCurrency(currentMonthlyTarget)}
            </strong>
          </div>
          {hasNoGoal ? (
            <button
              onClick={handleOpenEdit}
              className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Definir
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 font-medium">
              Protegida no cálculo
            </span>
          )}
        </div>

        {/* Nível 5: Alertas e Sugestões Preventivas Baseadas em Dados Reais */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          {/* Alerta 1: Orçamento comprometido ou negativo */}
          {stats.isBudgetNegative && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>
                  Atenção: Seus compromissos e despesas superaram sua renda mensal em{' '}
                  <strong>{formatCurrency(stats.deficitAmount)}</strong>. Evite gastos adicionais até o próximo período.
                </span>
              </div>
            </div>
          )}

          {/* Alerta 2: Ritmo de gastos elevado vs dias transcorridos */}
          {!stats.isBudgetNegative && stats.budgetUsedPercentage >= 70 && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>
                  Você já utilizou <strong>{stats.budgetUsedPercentage}%</strong> do seu orçamento mensal (dia {currentDay}/{daysInCurrentMonth}).
                  {stats.budgetUsedPercentage > monthElapsedPct + 15
                    ? ' Seus gastos estão acima do ritmo recomendado para este mês.'
                    : ' Mantenha o limite diário para fechar o mês no azul.'}
                </span>
              </div>
            </div>
          )}

          {/* Alerta 3: Fatura próxima do vencimento nos próximos 7 dias */}
          {upcomingInvoicesTotal > 0 && (
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 text-xs font-medium flex items-start gap-2 animate-fade-in">
              <CreditCard className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>
                  Você tem faturas/parcelas de <strong>{formatCurrency(upcomingInvoicesTotal)}</strong> vencendo nos próximos 7 dias. Reserve esse valor para não pagar juros.
                </span>
              </div>
            </div>
          )}

          {/* Sugestão Preventiva Positiva: Pequenas economias */}
          {!stats.isBudgetNegative && (
            <div className="p-2.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-emerald-900 text-[11px] font-medium flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                Reduzindo seus gastos diários em <strong>R$ 10,00</strong>, você poderá economizar <strong>R$ 300,00</strong> em 30 dias.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Modal para Ajustar Renda e Meta */}
      {isEditBudgetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-elevated border border-slate-100 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Orçamento e Meta Mensal
                </h3>
              </div>
              <button
                onClick={() => setIsEditBudgetOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              {/* Campo 1: Renda Mensal */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Renda Mensal Disponível (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 2000.00"
                  value={budgetInputStr}
                  onChange={e => setBudgetInputStr(e.target.value)}
                  className="w-full text-base sm:text-sm tnum px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900 font-semibold"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Informe sua renda ou orçamento total disponível para o mês.
                </span>
              </div>

              {/* Opção clara: Ativar ou Desativar Meta */}
              <div className="pt-1 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800 select-none">
                  <input
                    type="checkbox"
                    checked={noGoalChecked}
                    onChange={e => {
                      setNoGoalChecked(e.target.checked);
                      if (e.target.checked) {
                        setTargetInputStr('0');
                      }
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Não quero definir uma meta de economia no momento</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-1 pl-6 leading-relaxed">
                  Ao marcar esta opção, todo o seu saldo restante fica livre para gastos variáveis, sem alertas de meta não atingida.
                </p>
              </div>

              {/* Campo 2: Meta de Economia Mensal */}
              <div className={noGoalChecked ? 'opacity-40 pointer-events-none' : ''}>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Meta para Guardar neste Mês (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  disabled={noGoalChecked}
                  placeholder="Ex: 400.00 ou 0.00"
                  value={targetInputStr}
                  onChange={e => setTargetInputStr(e.target.value)}
                  className="w-full text-base sm:text-sm tnum px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900 font-semibold"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {noGoalChecked ? 'Meta desativada (R$ 0,00).' : 'Quanto deseja reservar exclusivamente neste mês.'}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-subtle hover:shadow-card transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Salvar Orçamento e Meta</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
