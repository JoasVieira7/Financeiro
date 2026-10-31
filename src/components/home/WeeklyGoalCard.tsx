import React from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../lib/formatters';

interface WeeklyGoalCardProps {
  onGoToGoals: () => void;
}

export const WeeklyGoalCard: React.FC<WeeklyGoalCardProps> = ({ onGoToGoals }) => {
  const { stats } = useFinance();
  const { profile } = useAuth();

  const weeklyTarget = profile?.weekly_saving_target || 600;
  const currentSaved = stats.weeklySavedAmount || 450;
  const percentage = stats.weeklyGoalPercentage || 75;

  return (
    <div
      onClick={onGoToGoals}
      className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card cursor-pointer hover:border-emerald-200 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">
          Meta de Economia da Semana
        </h3>
        <span className="text-sm font-bold text-[#00D26A]">
          {percentage}%
        </span>
      </div>

      {/* Thick Green Progress Bar */}
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#00D26A] rounded-full transition-all duration-500"
          style={{ width: `${Math.max(5, percentage)}%` }}
        />
      </div>

      {/* Subtitle */}
      <p className="text-xs font-medium text-slate-400 mt-3">
        Você economizou {formatCurrency(currentSaved)} de {formatCurrency(weeklyTarget)}
      </p>
    </div>
  );
};
