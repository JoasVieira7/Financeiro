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
      {/* 1. Discrete Budget Alert Banners (80%, 90%, 100%) */}
      {stats.budgetAlertLevel === 'warning_80' && (
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

      {stats.budgetAlertLevel === 'warning_90' && (
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

      {stats.budgetAlertLevel === 'exceeded_100' && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Limite atingido! O orçamento de {formatCurrency(currentMonthlyBudget)} foi 100% utilizado.</span>
          </div>
          <button
            onClick={handleOpenEdit}
            className="text-[11px] text-rose-950 underline font-bold whitespace-nowrap cursor-pointer"
          >
            Ajustar
          </button>
        </div>
      )}

      {/* 2. Top Side-by-Side Cards (Mês) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Card 1: Saldo Disponível */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-card flex flex-col justify-between relative group">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 block">
                Saldo Disponível (Mês)
              </span>
              <button
                onClick={handleOpenEdit}
                title="Ajustar Orçamento"
                className="text-slate-300 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5 font-mono">
              {formatCurrency(stats.remainingBudget)}
            </div>
          </div>
          <div className="mt-2 text-xs font-bold text-[#00D26A] flex items-center gap-1">
            <span>
              {stats.expenseComparisonPercentage <= 0 ? '✓ ' : '+ '}
              {Math.abs(stats.expenseComparisonPercentage || 12)}% vs mês ant.
            </span>
          </div>
        </div>

        {/* Card 2: Gastos Pagos (Mês) */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 block">
                Gastos Pagos (Mês)
              </span>
              {stats.monthlyPendingExpense > 0 && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">
                  +{formatCurrency(stats.monthlyPendingExpense)} prev.
                </span>
              )}
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5 font-mono">
              {formatCurrency(stats.monthlyExpense)}
            </div>
          </div>
          <div className="mt-2 text-xs font-bold text-[#2979FF] flex items-center justify-between">
            <span>
              {stats.budgetUsedPercentage}% comprometido
            </span>
          </div>
        </div>
      </div>

      {/* 3. Daily Allowance Widget */}
      <div className="bg-gradient-to-r from-emerald-50/70 to-teal-50/70 rounded-2xl px-4 py-2.5 border border-emerald-100 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#00D26A] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-600 truncate">
              Você pode gastar aproximadamente
            </p>
            <p className="text-sm font-extrabold text-slate-900 font-mono tracking-tight">
              {formatCurrency(stats.dailyAllowance)}{' '}
              <span className="text-xs font-semibold text-emerald-700">/ dia</span>
            </p>
          </div>
        </div>

        <div className="text-right shrink-0 pl-2">
          <span className="text-[11px] font-bold text-slate-500 block">
            {stats.remainingDaysInMonth} dias restantes
          </span>
          <button
            onClick={handleOpenEdit}
            className="text-[11px] font-bold text-[#00D26A] hover:underline cursor-pointer"
          >
            Editar Teto
          </button>
        </div>
      </div>

      {/* 4. Edit Budget Modal */}
      {isEditBudgetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#00D26A]" />
                Orçamento e Meta Mensal
              </h3>
              <button
                onClick={() => setIsEditBudgetOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              {/* Campo 1: Orçamento Mensal */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Orçamento Total do Mês (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 3500.00"
                  value={budgetInputStr}
                  onChange={e => setBudgetInputStr(e.target.value)}
                  className="w-full text-sm font-mono px-3.5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-[#00D26A]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Defina o limite total de gastos planejados para o mês.
                </span>
              </div>

              {/* Campo 2: Meta de Economia Mensal */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Meta de Economia Mensal (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 1000.00"
                  value={targetInputStr}
                  onChange={e => setTargetInputStr(e.target.value)}
                  className="w-full text-sm font-mono px-3.5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-[#00D26A]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Defina quanto você deseja poupar ou investir neste mês.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3.5 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white font-bold text-sm shadow-button-green transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
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
