import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Zap, Wallet, Target, TrendingUp, ArrowRight, Check } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    step: 1,
    title: 'Registre Gastos em Segundos',
    desc: 'Use o botão central para anotar despesas via Pix, Cartão ou Dinheiro em menos de 3 segundos, sem burocracia.',
    icon: Zap,
    color: 'from-brand-500 to-brand-accent',
    iconColor: 'text-brand-accent',
  },
  {
    step: 2,
    title: 'Acompanhe seu Orçamento Mensal',
    desc: 'Veja na hora quanto ainda pode gastar por dia e o percentual consumido do seu teto do mês.',
    icon: Wallet,
    color: 'from-emerald-500 to-teal-400',
    iconColor: 'text-emerald-400',
  },
  {
    step: 3,
    title: 'Crie Metas de Economia Reais',
    desc: 'Defina alvos para sua reserva de emergência, viagens ou compras e realize aportes rápidos com 1 toque.',
    icon: Target,
    color: 'from-cyan-500 to-blue-500',
    iconColor: 'text-cyan-400',
  },
  {
    step: 4,
    title: 'Evolua sua Saúde Financeira',
    desc: 'Visualize relatórios categorizados, contas fixas recorrentes e assuma o controle total do seu dinheiro.',
    icon: TrendingUp,
    color: 'from-purple-500 to-pink-500',
    iconColor: 'text-purple-400',
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const { completeOnboarding } = useAuth();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  if (!isOpen) return null;

  const current = STEPS[currentStepIndex];
  const Icon = current.icon;
  const isLast = currentStepIndex === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      completeOnboarding();
      onClose();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/90 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-dark-900 border border-slate-800 rounded-3xl p-6 shadow-2xl animate-scale-in text-center relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Skip button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={handleSkip}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Pular
          </button>
        </div>

        {/* Icon card */}
        <div className="w-16 h-16 rounded-3xl bg-dark-950 border border-slate-800 flex items-center justify-center mx-auto mb-4 shadow-xl">
          <Icon className={`w-8 h-8 ${current.iconColor}`} />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStepIndex
                  ? 'w-6 bg-brand-500'
                  : 'w-1.5 bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <h3 className="text-base font-extrabold text-white mb-2 leading-snug">
          {current.title}
        </h3>
        <p className="text-xs text-slate-300 mb-6 leading-relaxed">
          {current.desc}
        </p>

        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          {currentStepIndex > 0 && (
            <button
              onClick={() => setCurrentStepIndex(prev => prev - 1)}
              className="py-3 px-4 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
            >
              Voltar
            </button>
          )}

          <button
            onClick={handleNext}
            className="flex-1 py-3 px-4 rounded-xl bg-brand-500 hover:bg-brand-400 text-dark-950 text-xs font-extrabold shadow-lg shadow-brand-500/20 active:scale-98 transition-all flex items-center justify-center gap-1.5"
          >
            <span>{isLast ? 'Começar a Usar' : 'Próximo'}</span>
            {isLast ? <Check className="w-4 h-4 stroke-[3]" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

