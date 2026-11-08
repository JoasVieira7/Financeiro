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
    <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onGoToGoals}
          className="text-sm font-bold text-slate-900 hover:text-[#00D26A] transition-colors text-left cursor-pointer"
        >
          Meta de Economia do Mês
        </button>

        <span className="text-sm font-extrabold text-[#00D26A] font-mono">{percentage}%</span>
      </div>

      {/* Thick Green Progress Bar */}
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#00D26A] rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(percentage > 0 ? 5 : 0, percentage))}%` }}
        />
      </div>

      {/* Subtitle */}
      <p className="text-xs font-medium text-slate-400 mt-3">
        Você economizou {formatCurrency(currentSaved)} da meta de {formatCurrency(target)}
      </p>
    </div>
  );
};

// Alias de retrocompatibilidade para importações existentes
export const WeeklyGoalCard = MonthlyGoalCard;
