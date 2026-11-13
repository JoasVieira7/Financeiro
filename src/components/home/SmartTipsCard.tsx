import React, { useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Info,
  CheckCircle2,
  Calendar,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { generateFinancialInsights, FinancialInsight } from '../../lib/financialInsightsEngine';

interface SmartTipsCardProps {
  onNavigateTab?: (tab: 'transactions' | 'reports' | 'goals' | 'home') => void;
}

export const SmartTipsCard: React.FC<SmartTipsCardProps> = ({ onNavigateTab }) => {
  const { transactions } = useFinance();
  const { profile } = useAuth();
  const [activeTipIndex, setActiveTipIndex] = useState(0);
  const [expandedDetails, setExpandedDetails] = useState(false);

  const insights = generateFinancialInsights(transactions, profile);

  if (insights.length === 0) return null;

  const currentTip = insights[Math.min(activeTipIndex, insights.length - 1)];

  const getBadgeStyle = (type: FinancialInsight['type']) => {
    switch (type) {
      case 'observation':
        return 'bg-blue-50 text-blue-700 border-blue-200/60';
      case 'estimate':
        return 'bg-purple-50 text-purple-700 border-purple-200/60';
      case 'suggestion':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
    }
  };

  const getImpactIcon = (type: FinancialInsight['type']) => {
    switch (type) {
      case 'observation':
        return <Lightbulb className="w-4 h-4 text-blue-600" />;
      case 'estimate':
        return <Layers className="w-4 h-4 text-purple-600" />;
      case 'suggestion':
        return <Sparkles className="w-4 h-4 text-emerald-600" />;
    }
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/60 shadow-card hover:shadow-card-hover transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            {getImpactIcon(currentTip.type)}
          </div>
          <span className="text-xs font-bold text-slate-800 tracking-tight">
            Inteligência Financeira
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBadgeStyle(
              currentTip.type
            )}`}
          >
            {currentTip.typeLabel}
          </span>

          {insights.length > 1 && (
            <div className="flex items-center gap-1 ml-1">
              {insights.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setActiveTipIndex(idx);
                    setExpandedDetails(false);
                  }}
                  className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                    activeTipIndex === idx ? 'bg-emerald-500 w-3.5' : 'bg-slate-200 hover:bg-slate-300'
                  }`}
                  aria-label={`Dica ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Title & Description */}
      <h4 className="text-sm font-bold text-slate-900 tracking-tight">
        {currentTip.title}
      </h4>
      <p className="text-xs text-slate-600 leading-relaxed mt-1">
        {currentTip.message}
      </p>

      {/* Calculation Detail Toggle */}
      {currentTip.calculationDetail && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setExpandedDetails(!expandedDetails)}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <HelpCircle className="w-3 h-3" />
            <span>{expandedDetails ? 'Ocultar detalhes do cálculo' : 'Como foi calculado?'}</span>
          </button>

          {expandedDetails && (
            <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-2.5 border border-slate-100 mt-1.5 animate-fade-in leading-relaxed">
              💡 {currentTip.calculationDetail}
            </p>
          )}
        </div>
      )}

      {/* Action CTA */}
      {currentTip.actionText && onNavigateTab && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (currentTip.actionTab) {
                onNavigateTab(currentTip.actionTab);
              }
            }}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
          >
            <span>{currentTip.actionText}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {insights.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setActiveTipIndex((activeTipIndex + 1) % insights.length);
                setExpandedDetails(false);
              }}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              Próxima dica ({activeTipIndex + 1}/{insights.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

