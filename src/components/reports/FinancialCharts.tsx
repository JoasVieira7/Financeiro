import React, { useState } from 'react';
import { formatCurrency } from '../../lib/formatters';

export interface MonthlyDataPoint {
  monthLabel: string;
  yearMonth: string;
  income: number;
  expense: number;
  saved: number;
  cashSurplus?: number;
  savingTarget: number;
  netBalance: number;
}

export interface CategoryDataPoint {
  category: string;
  amount: number;
  percentage: number;
  color: string;
  icon: string;
  count: number;
}

export interface DebtProjectionPoint {
  monthLabel: string;
  pendingAmount: number;
  paidAmount: number;
  installmentCount: number;
}

// ---------------------------------------------------------------------------
// 1. Gráfico de Barras: Receitas vs Despesas
// ---------------------------------------------------------------------------
export const IncomeVsExpenseChart: React.FC<{ data: MonthlyDataPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-400 bg-slate-50/60 rounded-2xl border border-slate-100">
        Nenhum dado financeiro registrado para o período selecionado.
      </div>
    );
  }

  const maxVal = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-[#00D26A]" />
            <span className="text-slate-600 font-semibold">Receitas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-rose-500" />
            <span className="text-slate-600 font-semibold">Despesas</span>
          </div>
        </div>
        <span className="text-[11px] text-slate-400">Escala: até {formatCurrency(maxVal)}</span>
      </div>

      <div className="pt-2 pb-1 flex items-end justify-between gap-2 h-44 border-b border-slate-100 relative">
        {data.map((item, idx) => {
          const incPct = Math.round((item.income / maxVal) * 100);
          const expPct = Math.round((item.expense / maxVal) * 100);
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={item.yearMonth}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute -top-16 z-30 bg-slate-900 text-white text-[10.5px] rounded-xl px-2.5 py-1.5 shadow-xl whitespace-nowrap pointer-events-none animate-fade-in font-mono">
                  <div className="font-bold text-white mb-0.5">{item.monthLabel}</div>
                  <div className="text-emerald-400">Rec: {formatCurrency(item.income)}</div>
                  <div className="text-rose-400">Desp: {formatCurrency(item.expense)}</div>
                </div>
              )}

              {/* Bars container */}
              <div className="w-full flex items-end justify-center gap-1 h-32">
                {/* Income Bar */}
                <div
                  className="w-1/2 max-w-[18px] bg-gradient-to-t from-emerald-600 to-[#00D26A] rounded-t-md transition-all duration-500 hover:brightness-110"
                  style={{ height: `${Math.max(item.income > 0 ? 4 : 0, incPct)}%` }}
                />
                {/* Expense Bar */}
                <div
                  className="w-1/2 max-w-[18px] bg-gradient-to-t from-rose-600 to-rose-400 rounded-t-md transition-all duration-500 hover:brightness-110"
                  style={{ height: `${Math.max(item.expense > 0 ? 4 : 0, expPct)}%` }}
                />
              </div>

              {/* Month Label */}
              <span className="text-[10.5px] font-semibold text-slate-500 mt-2 truncate max-w-full">
                {item.monthLabel}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
        <span className="text-slate-400">ℹ️</span>
        <span>Compara o total de receitas confirmadas contra despesas pagas em cada mês. Barras verdes representam entradas e barras rosas saídas.</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. Gráfico de Evolução do Saldo Líquido
// ---------------------------------------------------------------------------
export const NetCashflowChart: React.FC<{ data: MonthlyDataPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const maxAbs = Math.max(1, ...data.map(d => Math.abs(d.netBalance)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600 font-semibold">Saldo Operacional por Mês</span>
        <span className="text-[11px] text-slate-400 font-mono">Variação máx: {formatCurrency(maxAbs)}</span>
      </div>

      <div className="pt-2 pb-1 flex items-end justify-between gap-2 h-36 border-b border-slate-100">
        {data.map((item, idx) => {
          const isPositive = item.netBalance >= 0;
          const heightPct = Math.min(100, Math.round((Math.abs(item.netBalance) / maxAbs) * 100));
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={item.yearMonth}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer relative"
            >
              {isHovered && (
                <div className="absolute -top-10 z-30 bg-slate-900 text-white text-[10.5px] rounded-xl px-2.5 py-1 shadow-xl whitespace-nowrap pointer-events-none font-mono">
                  {item.monthLabel}: <span className={isPositive ? 'text-emerald-400' : 'text-rose-400 font-bold'}>{formatCurrency(item.netBalance)}</span>
                </div>
              )}

              <div className="w-full flex items-end justify-center h-28">
                <div
                  className={`w-full max-w-[24px] rounded-t-lg transition-all duration-500 ${
                    isPositive ? 'bg-gradient-to-t from-emerald-600 to-emerald-400' : 'bg-gradient-to-t from-rose-600 to-rose-400'
                  }`}
                  style={{ height: `${Math.max(item.netBalance !== 0 ? 6 : 0, heightPct)}%` }}
                />
              </div>

              <span className="text-[10px] font-semibold text-slate-500 mt-2 truncate">
                {item.monthLabel}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
        <span className="text-slate-400">ℹ️</span>
        <span>Saldo operacional líquido (Receitas − Despesas pagas). Barras verdes indicam superávit operacional e barras vermelhas indicam déficit no período.</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. Gráfico de Evolução da Economia (Meta vs Realizado)
// ---------------------------------------------------------------------------
export const SavingsEvolutionChart: React.FC<{ data: MonthlyDataPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const maxVal = Math.max(1, ...data.map(d => Math.max(d.saved, d.savingTarget)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-emerald-500" />
            <span className="text-slate-600 font-semibold">Economizado Real</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-indigo-400" />
            <span className="text-slate-600 font-semibold">Meta Planejada</span>
          </div>
        </div>
        <span className="text-[11px] text-slate-400">Escala: {formatCurrency(maxVal)}</span>
      </div>

      <div className="pt-2 pb-1 flex items-end justify-between gap-2 h-40 border-b border-slate-100">
        {data.map((item, idx) => {
          const savedPct = Math.round((item.saved / maxVal) * 100);
          const targetPct = Math.round((item.savingTarget / maxVal) * 100);
          const isHovered = hoveredIdx === idx;
          const pctOfTarget = item.savingTarget > 0 ? Math.round((item.saved / item.savingTarget) * 100) : 0;

          return (
            <div
              key={item.yearMonth}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer relative"
            >
              {isHovered && (
                <div className="absolute -top-16 z-30 bg-slate-900 text-white text-[10.5px] rounded-xl px-2.5 py-1.5 shadow-xl whitespace-nowrap pointer-events-none font-mono">
                  <div className="font-bold text-white mb-0.5">{item.monthLabel}</div>
                  <div className={item.saved < 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {item.saved < 0 ? 'Resgate Líquido: ' : 'Poupança: '}
                    {formatCurrency(item.saved)}
                  </div>
                  <div className="text-indigo-300">Meta: {formatCurrency(item.savingTarget)} ({pctOfTarget}%)</div>
                </div>
              )}

              <div className="w-full flex items-end justify-center gap-1 h-28">
                <div
                  className={`w-1/2 max-w-[16px] rounded-t-md transition-all duration-500 ${
                    item.saved < 0
                      ? 'bg-gradient-to-t from-amber-600 to-amber-400'
                      : 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                  }`}
                  style={{ height: `${Math.max(item.saved !== 0 ? 4 : 0, Math.abs(savedPct))}%` }}
                />
                <div
                  className="w-1/2 max-w-[16px] bg-gradient-to-t from-indigo-500 to-indigo-300 rounded-t-md transition-all duration-500"
                  style={{ height: `${Math.max(item.savingTarget > 0 ? 4 : 0, targetPct)}%` }}
                />
              </div>

              <span className="text-[10px] font-semibold text-slate-500 mt-2 truncate">
                {item.monthLabel}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
        <span className="text-slate-400">ℹ️</span>
        <span>Compara a economia comprovadamente guardada em metas com o objetivo planejado para cada mês.</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4. Gráfico de Comprometimento de Dívidas & Parcelas Futuras
// ---------------------------------------------------------------------------
export const DebtProjectionChart: React.FC<{ data: DebtProjectionPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-400 bg-slate-50/60 rounded-2xl border border-slate-100">
        Nenhum parcelamento ativo para os próximos meses. Suas finanças estão 100% livres de parcelas!
      </div>
    );
  }

  const maxVal = Math.max(1, ...data.map(d => d.pendingAmount));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600 font-semibold">Comprometimento por Fatura Futura</span>
        <span className="text-[11px] text-slate-400 font-mono">Pico: {formatCurrency(maxVal)}</span>
      </div>

      <div className="pt-2 pb-1 flex items-end justify-between gap-2 h-36 border-b border-slate-100">
        {data.map((item, idx) => {
          const heightPct = Math.round((item.pendingAmount / maxVal) * 100);
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={item.monthLabel}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer relative"
            >
              {isHovered && (
                <div className="absolute -top-14 z-30 bg-slate-900 text-white text-[10.5px] rounded-xl px-2.5 py-1.5 shadow-xl whitespace-nowrap pointer-events-none font-mono">
                  <div className="font-bold text-white">{item.monthLabel}</div>
                  <div className="text-amber-400">A pagar: {formatCurrency(item.pendingAmount)}</div>
                  <div className="text-slate-300">{item.installmentCount} parcela(s)</div>
                </div>
              )}

              <div className="w-full flex items-end justify-center h-28">
                <div
                  className="w-full max-w-[24px] bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-lg transition-all duration-500 hover:brightness-110"
                  style={{ height: `${Math.max(item.pendingAmount > 0 ? 6 : 0, heightPct)}%` }}
                />
              </div>

              <span className="text-[10px] font-semibold text-slate-500 mt-2 truncate">
                {item.monthLabel}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
        <span className="text-slate-400">ℹ️</span>
        <span>Projeção cronológica das parcelas e faturas futuras já contratadas. Não inclui parcelas já liquidadas.</span>
      </div>
    </div>
  );
};

