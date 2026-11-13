import React from 'react';
import { formatCurrency } from '../../lib/formatters';
import { MonthlyDataPoint, CategoryDataPoint, DebtProjectionPoint } from './FinancialCharts';
import { Printer, X } from 'lucide-react';

interface PrintableReportPdfProps {
  userName: string;
  periodLabel: string;
  totalIncome: number;
  totalExpense: number;
  totalSaved: number;
  totalGoalDeposits?: number;
  totalGoalWithdrawals?: number;
  netBalance: number;
  savingsGoalTarget: number;
  categoryBreakdown: CategoryDataPoint[];
  monthlyHistory: MonthlyDataPoint[];
  debtProjections: DebtProjectionPoint[];
  onClose: () => void;
}

export const PrintableReportPdf: React.FC<PrintableReportPdfProps> = ({
  userName,
  periodLabel,
  totalIncome,
  totalExpense,
  totalSaved,
  totalGoalDeposits,
  totalGoalWithdrawals,
  netBalance,
  savingsGoalTarget,
  categoryBreakdown,
  monthlyHistory,
  debtProjections,
  onClose,
}) => {
  const generationDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
  };

  const savingsPct = savingsGoalTarget > 0 ? Math.round((totalSaved / savingsGoalTarget) * 100) : 0;
  const committedIncomePct = totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm overflow-y-auto p-4 sm:p-6 flex justify-center animate-fade-in print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-3xl w-full max-w-4xl p-6 sm:p-10 shadow-2xl space-y-6 print:shadow-none print:p-6 print:rounded-none">
        {/* Actions Bar (hidden on print) */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#00D26A]" />
            <h3 className="text-sm font-bold text-slate-800">Visualização de Impressão / PDF</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white text-xs font-bold shadow-subtle flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar como PDF</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Official Header */}
        <div className="flex items-start justify-between pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <span className="text-emerald-600 font-extrabold text-sm">FF</span>
              </div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Fluxo Financeiro
              </h1>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              Relatório Executivo de Inteligência Financeira &amp; Fechamento
            </p>
          </div>

          <div className="text-right text-xs">
            <span className="font-bold text-slate-900 block">{userName || 'Usuário'}</span>
            <span className="text-slate-400 block mt-0.5">Período: {periodLabel}</span>
            <span className="text-[10px] text-slate-400 block font-mono mt-0.5">Emissão: {generationDate}</span>
          </div>
        </div>

        {/* Section 1: Resumo Executivo */}
        <div className="space-y-3 break-inside-avoid print:break-inside-avoid">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            1. Resumo Consolidado do Período
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] text-slate-500 block mb-0.5">Total de Receitas</span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-600 font-mono block">
                {formatCurrency(totalIncome)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] text-slate-500 block mb-0.5">Total de Despesas</span>
              <span className="text-sm sm:text-base font-extrabold text-rose-600 font-mono block">
                {formatCurrency(totalExpense)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] text-slate-500 block mb-0.5">Saldo Líquido</span>
              <span className={`text-sm sm:text-base font-extrabold font-mono block ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatCurrency(netBalance)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] text-slate-500 block mb-0.5">
                {totalSaved < 0 ? 'Resgate Líquido em Metas' : 'Saldo em Metas'}
              </span>
              <span className={`text-sm sm:text-base font-extrabold font-mono block ${totalSaved >= 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                {formatCurrency(totalSaved)}
              </span>
              {totalGoalDeposits !== undefined && totalGoalWithdrawals !== undefined && (
                <span className="text-[9.5px] text-slate-400 block mt-0.5">
                  +{formatCurrency(totalGoalDeposits)} / -{formatCurrency(totalGoalWithdrawals)}
                </span>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-900">
              Renda Comprometida: <strong>{committedIncomePct}%</strong>
            </span>
            <span className="font-semibold text-emerald-900">
              Meta de Economia: {formatCurrency(savingsGoalTarget)} ({savingsPct}%)
            </span>
          </div>
        </div>

        {/* Section 2: Despesas por Categoria */}
        <div className="space-y-3 pt-2 break-inside-avoid print:break-inside-avoid">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            2. Distribuição por Centros de Custo (Categorias)
          </h2>
          <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Categoria</th>
                  <th className="py-2.5 px-3 text-center">Lançamentos</th>
                  <th className="py-2.5 px-3 text-right">Valor Total</th>
                  <th className="py-2.5 px-3 text-right">% do Gasto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {categoryBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      Nenhuma despesa registrada para o período.
                    </td>
                  </tr>
                ) : (
                  categoryBreakdown.map(cat => (
                    <tr key={cat.category} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span className="font-semibold text-slate-800">{cat.category}</span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-500">{cat.count}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                        {formatCurrency(cat.amount)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">{cat.percentage}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Histórico Mensal */}
        {monthlyHistory.length > 1 && (
          <div className="space-y-3 pt-2 break-inside-avoid print:break-inside-avoid">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              3. Evolução Histórica Mês a Mês
            </h2>
            <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Mês</th>
                    <th className="py-2.5 px-3 text-right">Receitas</th>
                    <th className="py-2.5 px-3 text-right">Despesas</th>
                    <th className="py-2.5 px-3 text-right">Saldo Líquido</th>
                    <th className="py-2.5 px-3 text-right">Economizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {monthlyHistory.map(m => (
                    <tr key={m.yearMonth}>
                      <td className="py-2 px-3 font-sans font-bold text-slate-800">{m.monthLabel}</td>
                      <td className="py-2 px-3 text-right text-emerald-600">{formatCurrency(m.income)}</td>
                      <td className="py-2 px-3 text-right text-rose-600">{formatCurrency(m.expense)}</td>
                      <td className={`py-2 px-3 text-right font-bold ${m.netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(m.netBalance)}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-700">{formatCurrency(m.saved)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 4: Projeção de Parcelamentos */}
        {debtProjections.length > 0 && (
          <div className="space-y-3 pt-2 break-inside-avoid print:break-inside-avoid">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              4. Projeção de Dívidas &amp; Parcelas Futuras
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {debtProjections.slice(0, 4).map(d => (
                <div key={d.monthLabel} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-700 block">{d.monthLabel}</span>
                  <span className="text-xs font-mono font-bold text-amber-600 mt-1 block">
                    {formatCurrency(d.pendingAmount)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">{d.installmentCount} parcela(s)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Note */}
        <div className="pt-6 border-t border-slate-200 text-center text-[10px] text-slate-400 space-y-1">
          <p>Fluxo Financeiro — Gestão Inteligente &amp; Metas Reais · Sistema de Relatórios Avançados Premium</p>
          <p>Relatório emitido de forma automatizada e confidencial. Dados estritamente isolados do usuário autenticado.</p>
        </div>
      </div>
    </div>
  );
};

