import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Zap, Wallet, Target, TrendingUp, ArrowRight, Check, ChevronLeft } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    step: 1,
    title: 'Registre Gastos em Segundos',
    desc: 'Anote despesas via Pix, Cartão ou Dinheiro em menos de 3 segundos, direto no botão central sem burocracia.',
    icon: Zap,
  },
  {
    step: 2,
    title: 'Acompanhe seu Orçamento Mensal',
    desc: 'Veja na hora quanto ainda pode gastar por dia e monitore alertas discretos ao atingir 80%, 90% e 100% do seu teto.',
    icon: Wallet,
  },
  {
    step: 3,
    title: 'Crie Metas de Economia Reais',
    desc: 'Defina alvos para sua reserva ou sonhos e realize aportes e retiradas com histórico completo e saldo protegido.',
    icon: Target,
  },
  {
    step: 4,
    title: 'Evolua sua Saúde Financeira',
    desc: 'Visualize o resumo dinâmico de gastos por categoria, compare meses e assuma o controle definitivo do seu dinheiro.',
    icon: TrendingUp,
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const { completeOnboarding } = useAuth();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  if (!isOpen) return null;

  const current = STEPS[currentStepIndex];
  const Icon = current.icon;
  const isLast = currentStepIndex === STEPS.length - 1;
  const totalSteps = STEPS.length;

  const handleNext = () => {
    if (isLast) {
      completeOnboarding();
      onClose();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    onClose();
  };

  // Suporte a swipe touch nativo (mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;

    // Swipe para a esquerda -> avançar
    if (diff > 50) {
      handleNext();
    }
    // Swipe para a direita -> voltar
    else if (diff < -50 && currentStepIndex > 0) {
      handlePrev();
    }
    setTouchStartX(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full max-w-[380px] bg-white rounded-[32px] p-6 sm:p-7 shadow-[0_16px_40px_rgba(0,0,0,0.08)] border border-slate-100 flex flex-col justify-between relative max-h-[92vh] overflow-y-auto animate-scale-in"
      >
        {/* Cabeçalho superior: Indicador textual e Botão Pular */}
        <div className="flex items-center justify-between pb-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Passo {current.step} de {totalSteps}
          </span>

          <button
            onClick={handleSkip}
            type="button"
            className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer"
          >
            Pular
          </button>
        </div>

        {/* Bloco Central: Ícone Squircle, Textos e Dots */}
        <div className="flex flex-col items-center text-center my-4">
          {/* Squircle com ícone */}
          <div className="w-20 h-20 rounded-[28px] bg-[#E8FBF0] border border-[#A7F3D0]/60 flex items-center justify-center shadow-xs transition-transform duration-300">
            <Icon className="w-9 h-9 text-[#00D26A] stroke-[2.2]" />
          </div>

          {/* Título curto e impactante */}
          <h3
            id="onboarding-title"
            className="text-[20px] font-extrabold text-slate-900 tracking-tight leading-snug mt-5"
          >
            {current.title}
          </h3>

          {/* Descrição curta e legível */}
          <p className="text-[13px] font-medium text-slate-500 leading-relaxed mt-2 px-1 max-w-[310px]">
            {current.desc}
          </p>

          {/* Indicador visual de etapas (Pílulas / Dots) */}
          <div
            className="flex items-center justify-center gap-1.5 mt-6"
            aria-label={`Etapa ${current.step} de ${totalSteps}`}
          >
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStepIndex
                    ? 'w-7 bg-[#00D26A]'
                    : i < currentStepIndex
                    ? 'w-2 bg-[#A7F3D0]'
                    : 'w-2 bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Barra de Ações: Voltar e Próximo/Começar */}
        <div className="flex items-center gap-2.5 pt-2">
          {currentStepIndex > 0 && (
            <button
              onClick={handlePrev}
              type="button"
              className="h-[48px] px-4 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[13px] font-bold transition-all cursor-pointer shadow-xs active:scale-98 flex items-center justify-center gap-1 shrink-0"
              title="Voltar etapa anterior"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          )}

          <button
            onClick={handleNext}
            type="button"
            className="h-[48px] flex-1 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white text-[13.5px] font-bold transition-all shadow-[0_8px_20px_rgba(0,210,106,0.28)] active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>{isLast ? 'Começar a Usar' : 'Próximo'}</span>
            {isLast ? (
              <Check className="w-4 h-4 stroke-[3]" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
