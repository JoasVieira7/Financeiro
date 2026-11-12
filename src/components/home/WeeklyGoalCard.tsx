import React from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../lib/formatters';
import { weeklyToMonthly } from '../../lib/budgetCalculations';

interface MonthlyGoalCardProps {
  onGoToGoals: () => void;
}

export const MonthlyGoalCard: React.FC<MonthlyGoalCardProps> = ({ onGoToGoals }) => {
  const { stats } = useFinance();
  const { profile } = useAuth();

  const weeklyTarget = profile?.weekly_saving_target ?? 250;
  const monthlyTarget = weeklyToMonthly(weeklyTarget);

  const currentSaved = stats.monthlySavedAmount ?? 0;
  const target = monthlyTarget;

  const percentage =
    stats.monthlyGoalPercentage ??
    (monthlyTarget > 0 ? Math.min(100, Math.round((currentSaved / monthlyTarget) * 100)) : 0);

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/60 shadow-card hover:shadow-card-hover transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onGoToGoals}
          className="text-xs sm:text-sm font-semibold text-slate-800 hover:text-emerald-600 transition-colors text-left cursor-pointer flex items-center gap-1.5"
        >
          <span>Meta de economia mensal</span>
        </button>

        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 tnum">
          {percentage}%
        </span>
      </div>

      {/* Modern Rounded Progress Bar */}
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-100">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.min(100, Math.max(percentage > 0 ? 4 : 0, percentage))}%` }}
        />
      </div>

      {/* Subtitle */}
      <div className="flex items-center justify-between text-xs text-slate-500 mt-2.5">
        <span className="tnum font-medium">
          Economizado: <strong className="text-slate-800 font-semibold">{formatCurrency(currentSaved)}</strong>
        </span>
        <span className="tnum text-slate-400 font-medium">
          Meta: {formatCurrency(target)}
        </span>
      </div>
    </div>
  );
};

// Alias de retrocompatibilidade para importações existentes
export const WeeklyGoalCard = MonthlyGoalCard;
