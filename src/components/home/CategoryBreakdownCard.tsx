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
        <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
          Resumo de Gastos
        </h3>
        <button
          onClick={onGoToReports}
          className="text-xs font-bold text-[#00D26A] hover:underline cursor-pointer"
        >
          Ver Metas & Tetos
        </button>
      </div>

      <div
        onClick={onGoToReports}
        className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card flex flex-col items-center justify-center cursor-pointer hover:border-slate-200 transition-colors"
      >
        <DonutChart
          data={stats.categoryBreakdown}
          totalAmount={stats.monthlyExpense}
          size={170}
          strokeWidth={34}
          showCenterTotal={true}
          centerLabel="Total Gasto"
        />

        {/* Real User Top Categories Legend */}
        {topCategories.length > 0 ? (
          <div className="w-full grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-slate-50 text-center">
            {topCategories.map(cat => (
              <div key={cat.category} className="space-y-0.5">
                <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-700">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate">{cat.category}</span>
                </div>
                <div className="text-xs font-extrabold text-slate-900 font-mono">
                  {formatCurrency(cat.amount)}
                </div>
                <span className="text-[10px] text-slate-400 block font-semibold">
                  {cat.percentage}% do total
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full mt-5 pt-4 border-t border-slate-50 text-center">
            <p className="text-xs font-semibold text-slate-400">
              Nenhuma despesa registrada este mês
            </p>
            <p className="text-[11px] font-medium text-slate-400 mt-0.5">
              Toque no botão verde abaixo para registrar seu primeiro gasto
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
