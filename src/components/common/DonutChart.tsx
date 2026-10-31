import React from 'react';
import { formatCurrency } from '../../lib/formatters';

export interface DonutChartSegment {
  category: string;
  amount: number;
  percentage?: number;
  color: string;
}

interface DonutChartProps {
  /** Lista de categorias com gastos do usuário */
  data?: DonutChartSegment[];
  /** Valor total de despesas acumuladas no período */
  totalAmount?: number;
  /** Diâmetro total do SVG em pixels */
  size?: number;
  /** Espessura do anel em pixels */
  strokeWidth?: number;
  /** Se deve exibir o total e rótulo no centro do anel */
  showCenterTotal?: boolean;
  /** Rótulo exibido acima do valor central */
  centerLabel?: string;
  /** Valor customizado para o centro (opcional, padrão: formatCurrency) */
  centerValue?: string;
  /** Modo de progresso percentual único (ex: Meta Semanal) */
  progressPercentage?: number;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data = [],
  totalAmount,
  size = 170,
  strokeWidth = 34,
  showCenterTotal = true,
  centerLabel = 'Total Gasto',
  centerValue,
  progressPercentage,
}) => {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // ---------------------------------------------------------------------------
  // CASO 1: Modo Progresso Percentual Único (ex: Meta da Semana)
  // ---------------------------------------------------------------------------
  if (progressPercentage !== undefined) {
    const clampedPct = Math.max(0, Math.min(100, progressPercentage));
    const progressDash = (clampedPct / 100) * circumference;

    return (
      <div
        className="flex items-center justify-center relative select-none"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`Progresso da meta: ${clampedPct}%`}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Anel de fundo neutro */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
          {/* Anel de progresso verde */}
          {clampedPct > 0 && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#00D26A"
              strokeWidth={strokeWidth}
              strokeDasharray={`${progressDash} ${circumference - progressDash}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          )}
        </svg>

        {showCenterTotal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2 pointer-events-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {centerLabel}
            </span>
            <span className="text-[15px] font-extrabold text-slate-900 font-mono tracking-tight leading-tight mt-0.5 max-w-[100px] truncate">
              {centerValue || `${clampedPct}%`}
            </span>
            <span className="text-[10px] font-bold text-[#00D26A] mt-0.5">
              {clampedPct}% da meta
            </span>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // CASO 2: Modo Despesas por Categoria (Dados Reais)
  // ---------------------------------------------------------------------------
  // Filtra estritamente categorias com gastos maiores que zero
  const validSegments = data.filter(item => Number(item.amount) > 0);
  const total =
    totalAmount !== undefined
      ? totalAmount
      : validSegments.reduce((sum, item) => sum + Number(item.amount), 0);

  // ESTADO VAZIO: Sem despesas registradas
  if (total <= 0 || validSegments.length === 0) {
    return (
      <div
        className="flex items-center justify-center relative select-none"
        style={{ width: size, height: size }}
        role="img"
        aria-label="Nenhuma despesa registrada no período"
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
        </svg>

        {showCenterTotal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2 pointer-events-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {centerLabel}
            </span>
            <span className="text-[15px] font-extrabold text-slate-400 font-mono tracking-tight leading-tight mt-0.5">
              R$ 0,00
            </span>
            <span className="text-[10px] font-semibold text-slate-400 mt-0.5">
              Sem gastos
            </span>
          </div>
        )}
      </div>
    );
  }

  // ESTADO DE CATEGORIA ÚNICA (100% dos gastos em uma categoria)
  if (validSegments.length === 1) {
    const single = validSegments[0];
    return (
      <div
        className="flex items-center justify-center relative select-none"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`100% dos gastos em ${single.category}: ${formatCurrency(total)}`}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Fundo suave */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
          {/* Anel completo contínuo com a cor da categoria */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={single.color}
            strokeWidth={strokeWidth}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {showCenterTotal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2 pointer-events-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {centerLabel}
            </span>
            <span className="text-[15px] font-extrabold text-slate-900 font-mono tracking-tight leading-tight mt-0.5 max-w-[105px] truncate">
              {centerValue || formatCurrency(total)}
            </span>
            <span
              className="text-[10px] font-bold mt-0.5 truncate max-w-[100px]"
              style={{ color: single.color }}
            >
              100% {single.category}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ESTADO DE MÚLTIPLAS CATEGORIAS (Fatias Proporcionais Calculadas Dinamicamente)
  const gap = 3; // Separação estética entre as fatias
  let accumulatedLength = 0;

  return (
    <div
      className="flex items-center justify-center relative select-none"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Distribuição de despesas: ${validSegments.length} categorias, total de ${formatCurrency(total)}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Círculo de fundo base */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#F8FAFC"
          strokeWidth={strokeWidth}
        />

        {validSegments.map((segment) => {
          const ratio = Number(segment.amount) / total;
          const arcLength = ratio * circumference;
          const strokeDash = Math.max(0, arcLength - gap);
          const offset = -accumulatedLength;
          accumulatedLength += arcLength;

          return (
            <circle
              key={segment.category}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${strokeDash} ${circumference - strokeDash}`}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
          );
        })}
      </svg>

      {showCenterTotal && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2 pointer-events-none">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            {centerLabel}
          </span>
          <span className="text-[15px] font-extrabold text-slate-900 font-mono tracking-tight leading-tight mt-0.5 max-w-[105px] truncate">
            {centerValue || formatCurrency(total)}
          </span>
          <span className="text-[10px] font-bold text-slate-500 mt-0.5">
            {validSegments.length} categorias
          </span>
        </div>
      )}
    </div>
  );
};
