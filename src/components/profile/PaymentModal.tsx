import React, { useState } from 'react';
import { X, Sparkles, Check, Crown, User, Shield, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface PlanComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlightedFeature?: string;
  featureDescription?: string;
}

export const PlanComparisonModal: React.FC<PlanComparisonModalProps> = ({
  isOpen,
  onClose,
  highlightedFeature,
  featureDescription,
}) => {
  const { profile } = useAuth();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  if (!isOpen) return null;

  const isCurrentPremium = profile?.plan_tier === 'premium';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl border border-slate-100 animate-scale-in max-h-[92vh] overflow-y-auto scroll-touch"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E8FBF0] flex items-center justify-center text-[#00D26A] shrink-0">
              <Sparkles className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                Planos Fluxo Financeiro
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Escolha a melhor experiência para suas finanças
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Highlighted Feature Alert (se aberto a partir de recurso bloqueado) */}
        {highlightedFeature && (
          <div className="mt-3.5 p-3.5 rounded-2xl bg-[#E8FBF0] border border-[#A7F3D0] text-xs space-y-1 animate-scale-in">
            <div className="flex items-center gap-1.5 font-bold text-[#00D26A]">
              <Crown className="w-4 h-4 shrink-0" />
              <span>Recurso Premium: {highlightedFeature}</span>
            </div>
            {featureDescription && (
              <p className="text-slate-700 leading-relaxed font-medium">
                {featureDescription}
              </p>
            )}
          </div>
        )}

        {/* Comparativo de Planos */}
        <div className="space-y-3.5 my-4">
          {/* Card: Plano Gratuito */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              !isCurrentPremium
                ? 'bg-slate-50/70 border-slate-200'
                : 'bg-white border-slate-100'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-600" />
                <h4 className="text-sm font-extrabold text-slate-900">
                  Plano Gratuito
                </h4>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                R$ 0,00
              </span>
            </div>
            <ul className="space-y-1.5 text-xs text-slate-600 font-medium">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span>Receitas e despesas ilimitadas</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span>Histórico completo das próprias transações</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span>Categorias e estabelecimentos/detalhes</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span>Despesas parceladas completas</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span>Até 2 metas de economia ativas</span>
              </li>
            </ul>
          </div>

          {/* Card: Fluxo Financeiro Premium */}
          <div className="p-4 rounded-2xl border-2 border-[#00D26A] bg-[#E8FBF0]/30 shadow-xs relative">
            <span className="absolute -top-2.5 right-4 text-[10px] bg-[#00D26A] text-white font-extrabold px-2.5 py-0.5 rounded-full shadow-2xs">
              COMPLETO
            </span>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-[#00D26A]" />
                <h4 className="text-sm font-extrabold text-slate-900">
                  Fluxo Financeiro Premium
                </h4>
              </div>
              <span className="text-[11px] font-extrabold text-[#00D26A]">
                {billingCycle === 'monthly' ? 'R$ 4,90/mês' : 'R$ 39,90/ano'}
              </span>
            </div>
            <ul className="space-y-1.5 text-xs text-slate-700 font-medium">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span><strong>Metas de economia ilimitadas</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span><strong>Despesas fixas e recorrentes</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span><strong>Relatórios avançados e comparativos</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span><strong>Exportação completa de dados em CSV</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
                <span><strong>Alertas financeiros avançados</strong></span>
              </li>
            </ul>
          </div>
        </div>

        {/* Proposta Comercial: Mensal vs Anual */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Proposta Comercial
          </span>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'border-[#00D26A] bg-[#E8FBF0]/50 shadow-2xs'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 block uppercase">
                Mensal
              </span>
              <div className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
                R$ 4,90 <span className="text-[11px] font-normal text-slate-500">/mês</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">
                Sem fidelidade
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative ${
                billingCycle === 'yearly'
                  ? 'border-[#00D26A] bg-[#E8FBF0]/50 shadow-2xs'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <span className="absolute -top-2 right-2 text-[9px] bg-[#00D26A] text-white font-extrabold px-1.5 py-0.2 rounded-full">
                32% OFF
              </span>
              <span className="text-[10px] font-bold text-slate-400 block uppercase">
                Anual
              </span>
              <div className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
                R$ 39,90 <span className="text-[11px] font-normal text-slate-500">/ano</span>
              </div>
              <span className="text-[10px] text-emerald-700 font-semibold block mt-1">
                R$ 3,32/mês equivalente
              </span>
            </button>
          </div>
        </div>

        {/* Aviso de Futura Integração de Pagamento */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 leading-relaxed text-center font-medium">
          Em breve: contratação integrada nas lojas de aplicativos (Apple App Store, Google Play) e Pix Oficial.
        </div>

        {/* Botão de Fechar */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer mt-3"
        >
          Entendido
        </button>
      </div>
    </div>
  );
};

// Exportação com ambos os nomes para retrocompatibilidade
export const PaymentModal = PlanComparisonModal;
