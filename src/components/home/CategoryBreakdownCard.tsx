import React from 'react';
import { DonutChart } from '../common/DonutChart';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../lib/formatters';

interface CategoryBreakdownCardProps {
  onGoToReports: () => void;
}

export const CategoryBreakdownCard: React.FC<CategoryBreakdownCardProps> = ({ onGoToReports }) => {
  const { stats } = useFinance();
  const topCategories = stats.categoryBreakdown.slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-semibold text-slate-800 tracking-tight">
          Resumo de gastos por categoria
        </h3>
        <button
          onClick={onGoToReports}
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
        >
          Ver análise completa
        </button>
      </div>

      <div
        onClick={onGoToReports}
        className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200/60 shadow-card hover:shadow-card-hover transition-all flex flex-col items-center justify-center cursor-pointer group"
      >
        <DonutChart
          data={stats.categoryBreakdown}
          totalAmount={stats.monthlyExpense}
          size={170}
          strokeWidth={30}
          showCenterTotal={true}
          centerLabel="Total Gasto"
        />

        {/* Real User Top Categories Legend */}
        {topCategories.length > 0 ? (
          <div className="w-full grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-slate-100 text-center">
            {topCategories.map(cat => (
              <div key={cat.category} className="space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate">{cat.category}</span>
                </div>
                <div className="text-xs font-bold text-slate-900 tnum">
                  {formatCurrency(cat.amount)}
                </div>
                <span className="text-[10px] text-slate-400 block font-medium">
                  {cat.percentage}% do total
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full mt-5 pt-4 border-t border-slate-100 text-center">
            <p className="text-xs font-medium text-slate-400">
              Nenhuma despesa registrada este mês
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Toque no botão de registrar para adicionar sua primeira movimentação
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
