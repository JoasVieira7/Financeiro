import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../lib/formatters';
import { weeklyToMonthly, monthlyToWeekly } from '../../lib/budgetCalculations';
import {
  Calendar,
  Sparkles,
  Check,
  AlertTriangle,
  AlertCircle,
  X,
  Edit3,
} from 'lucide-react';

interface BalanceOverviewProps {
  onOpenQuickExpense: () => void;
}

export const BalanceOverview: React.FC<BalanceOverviewProps> = () => {
  const { stats } = useFinance();
  const { profile, updateMonthlyBudget } = useAuth();
  const [isEditBudgetOpen, setIsEditBudgetOpen] = useState(false);

  // Estados dos inputs de Orçamento e Meta Mensal
  const currentMonthlyBudget = profile?.monthly_budget || 3500;
  const currentWeeklyTarget = profile?.weekly_saving_target || 250;
  const currentMonthlyTarget = weeklyToMonthly(currentWeeklyTarget);

  const [budgetInputStr, setBudgetInputStr] = useState('');
  const [targetInputStr, setTargetInputStr] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = () => {
    setBudgetInputStr(currentMonthlyBudget.toString());
    setTargetInputStr(currentMonthlyTarget.toString());
    setIsEditBudgetOpen(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const budgetVal = parseFloat(budgetInputStr.replace(',', '.'));
    const targetVal = parseFloat(targetInputStr.replace(',', '.'));

    if (isNaN(budgetVal) || budgetVal <= 0) return;

    const finalMonthlyBudget = budgetVal;
    const finalWeeklyTarget = isNaN(targetVal) || targetVal <= 0 ? 250 : monthlyToWeekly(targetVal);

    setIsSaving(true);
    try {
      await updateMonthlyBudget(finalMonthlyBudget, finalWeeklyTarget, 'monthly');
      setIsEditBudgetOpen(false);
    } catch (e) {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 1. Discrete Budget Alert Banners */}
      {stats.isBudgetNegative && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Atenção: Sua meta mensal de {formatCurrency(currentMonthlyTarget)} está comprometida em{' '}
              <strong>{formatCurrency(stats.deficitAmount)}</strong>.
            </span>
          </div>
          <button
            onClick={handleOpenEdit}
            className="text-[11px] text-rose-950 underline font-bold whitespace-nowrap cursor-pointer"
          >
            Ajustar
          </button>
        </div>
      )}

      {!stats.isBudgetNegative && stats.budgetAlertLevel === 'warning_80' && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Atenção: Você atingiu <strong>{stats.budgetUsedPercentage}%</strong> do seu orçamento do mês.</span>
          </div>
          <button
            onClick={handleOpenEdit}
            className="text-[11px] text-amber-900 underline font-bold whitespace-nowrap cursor-pointer"
          >
            Ajustar
          </button>
        </div>
      )}

      {!stats.isBudgetNegative && stats.budgetAlertLevel === 'warning_90' && (
        <div className="p-3 rounded-2xl bg-orange-50 border border-orange-200 text-orange-900 text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
            <span>Alerta: <strong>{stats.budgetUsedPercentage}%</strong> do orçamento consumido ({formatCurrency(stats.remainingBudget)} restante).</span>
          </div>
          <button
            onClick={handleOpenEdit}
            className="text-[11px] text-orange-950 underline font-bold whitespace-nowrap cursor-pointer"
          >
            Ajustar
          </button>
        </div>
      )}

      {/* 2. Top Side-by-Side Cards (Mês) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Card 1: Saldo Disponível para Gastos */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/60 shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between relative group">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500 block">
                Disponível para gastos
              </span>
              <button
                onClick={handleOpenEdit}
                title="Ajustar Renda e Meta"
                className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className={`text-xl sm:text-2xl font-bold tracking-tight mt-1 tnum ${stats.isBudgetNegative ? 'text-rose-600' : 'text-slate-900'}`}>
              {stats.isBudgetNegative ? `- ${formatCurrency(stats.deficitAmount)}` : formatCurrency(stats.remainingBudget)}
            </div>
            <div className="text-[10.5px] text-slate-400 mt-1 truncate">
              Meta: {formatCurrency(currentMonthlyTarget)}
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            {stats.isBudgetNegative ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-full">
                Meta comprometida
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-2 py-0.5 rounded-full">
                {stats.expenseComparisonPercentage <= 0 ? '✓ ' : '+ '}
                {Math.abs(stats.expenseComparisonPercentage || 12)}% vs mês ant.
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Gastos Pagos e Comprometidos (Mês) */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/60 shadow-card hover:shadow-card-hover transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500 block">
                Gastos pagos
              </span>
              {stats.monthlyPendingExpense > 0 && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/50 px-1.5 py-0.5 rounded-md" title="Compromissos pendentes a vencer">
                  +{formatCurrency(stats.monthlyPendingExpense)}
                </span>
              )}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1 tnum">
              {formatCurrency(stats.monthlyExpense)}
            </div>
            <div className="text-[10.5px] text-slate-400 mt-1 truncate">
              Comprometido: {formatCurrency(stats.totalCommittedMonth)}
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-full">
              {stats.budgetUsedPercentage}% da renda
            </span>
          </div>
        </div>
      </div>

      {/* 3. Daily Allowance Widget */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/60 shadow-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <Calendar className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-medium truncate">
              Média recomendada para gastar
            </p>
            <p className="text-sm sm:text-base font-bold text-slate-900 tnum tracking-tight mt-0.5">
              {formatCurrency(stats.dailyAllowance)}{' '}
              <span className="text-xs font-medium text-slate-400">/ dia</span>
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[11px] font-medium text-slate-400 block">
            {stats.remainingDaysInMonth} dias restantes
          </span>
          <button
            onClick={handleOpenEdit}
            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer mt-0.5"
          >
            Editar limite
          </button>
        </div>
      </div>

      {/* 4. Edit Budget Modal */}
      {isEditBudgetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-elevated border border-slate-100 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
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
                  Renda Mensal (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 2000.00"
                  value={budgetInputStr}
                  onChange={e => setBudgetInputStr(e.target.value)}
                  className="w-full text-base sm:text-sm tnum px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Informe quanto você recebe ou dispõe no mês.
                </span>
              </div>

              {/* Campo 2: Meta de Economia Mensal */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Meta para Guardar neste Mês (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 400.00"
                  value={targetInputStr}
                  onChange={e => setTargetInputStr(e.target.value)}
                  className="w-full text-base sm:text-sm tnum px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Quanto deseja reservar/guardar exclusivamente neste mês.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-subtle hover:shadow-card transition-all flex items-center justify-center gap-2 cursor-pointer mt-3"
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
