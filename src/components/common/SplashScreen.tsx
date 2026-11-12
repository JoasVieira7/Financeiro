import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // 1. Respeita preferência do sistema operacional para redução de movimento
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      onFinish();
      return;
    }

    // 2. Tempo total preciso: 1150ms de exibição ativa + 300ms de transição suave = ~1.45s
    const timer = setTimeout(() => {
      setFadingOut(true);
      const closeTimer = setTimeout(() => {
        onFinish();
      }, 300);
      return () => clearTimeout(closeTimer);
    }, 1150);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-[#F8FCF9] via-[#FAFBFD] to-[#FFFFFF] select-none overflow-hidden transition-all duration-300 ease-out ${
        fadingOut
          ? 'opacity-0 scale-[1.02] pointer-events-none'
          : 'opacity-100 scale-100'
      }`}
      aria-label="Carregando Fluxo Financeiro"
    >
      {/* Estilos CSS Scoped para Animações Fluidas de Fintech */}
      <style>{`
        @keyframes splashSquircleEnter {
          0% {
            transform: scale(0.86);
            opacity: 0;
          }
          60% {
            transform: scale(1.02);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes splashRadarPulse {
          0% {
            transform: scale(0.92);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.36);
            opacity: 0;
          }
        }

        @keyframes splashDrawLine {
          0% {
            stroke-dashoffset: 60;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes splashDrawArrow {
          0% {
            stroke-dashoffset: 30;
            opacity: 0;
          }
          40% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }

        @keyframes splashSparklePop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          70% {
            transform: scale(1.25);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes splashFadeUp {
          0% {
            transform: translateY(12px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes splashBarGlow {
          0%, 100% {
            opacity: 0.55;
            transform: scaleX(0.96);
          }
          50% {
            opacity: 1;
            transform: scaleX(1.06);
          }
        }

        .splash-squircle {
          animation: splashSquircleEnter 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .splash-radar {
          animation: splashRadarPulse 0.85s cubic-bezier(0.16, 1, 0.3, 1) 0.18s forwards;
        }

        .splash-growth-line {
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          animation: splashDrawLine 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.18s forwards;
        }

        .splash-growth-arrow {
          stroke-dasharray: 30;
          stroke-dashoffset: 30;
          animation: splashDrawArrow 0.35s cubic-bezier(0.16, 1, 0.3, 1) 0.45s forwards;
        }

        .splash-sparkle-1 {
          animation: splashSparklePop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.52s forwards;
        }

        .splash-sparkle-2 {
          animation: splashSparklePop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.62s forwards;
        }

        .splash-text {
          animation: splashFadeUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.32s forwards;
        }

        .splash-footer {
          animation: splashFadeUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.45s forwards;
        }

        .splash-bar-1 {
          animation: splashBarGlow 1.2s ease-in-out infinite 0.1s;
        }
        .splash-bar-2 {
          animation: splashBarGlow 1.2s ease-in-out infinite 0.25s;
        }
        .splash-bar-3 {
          animation: splashBarGlow 1.2s ease-in-out infinite 0.4s;
        }

        @media (prefers-reduced-motion: reduce) {
          .splash-squircle,
          .splash-radar,
          .splash-growth-line,
          .splash-growth-arrow,
          .splash-sparkle-1,
          .splash-sparkle-2,
          .splash-text,
          .splash-footer,
          .splash-bar-1,
          .splash-bar-2,
          .splash-bar-3 {
            animation: none !important;
            stroke-dashoffset: 0 !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Sutil iluminação radial de fundo com toque de esmeralda */}
      <div
        className="absolute w-[440px] sm:w-[560px] h-[440px] sm:h-[560px] rounded-full bg-emerald-400/[0.07] blur-3xl pointer-events-none"
        style={{ transform: 'translate3d(0, -10%, 0)' }}
      />

      {/* Conteúdo Central da Marca */}
      <div className="relative flex flex-col items-center justify-center px-4">
        {/* Squircle do Ícone com Anel de Radar */}
        <div className="relative flex items-center justify-center">
          {/* Anel de Radar / Pulso Financeiro */}
          <div className="absolute -inset-2.5 rounded-[38px] sm:rounded-[42px] border border-emerald-500/25 splash-radar pointer-events-none" />

          {/* Squircle Principal da Marca */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-[32px] sm:rounded-[36px] bg-white shadow-[0_20px_50px_rgba(0,210,106,0.14),0_4px_16px_rgba(15,23,42,0.04)] border border-emerald-100/70 flex items-center justify-center splash-squircle overflow-hidden">
            {/* Gradiente interno sutil para efeito acetinado */}
            <div className="absolute inset-0 rounded-[32px] sm:rounded-[36px] bg-gradient-to-b from-white via-white/90 to-emerald-50/30 pointer-events-none" />

            {/* Vetor Oficial do Fluxo Financeiro com Animação Fluida */}
            <svg
              width="54"
              height="54"
              viewBox="0 0 44 44"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="relative z-10 w-13 h-13 sm:w-15 sm:h-15"
            >
              <defs>
                <linearGradient id="splashEmeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00D26A" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="splashSparkleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#34D399" />
                  <stop offset="100%" stopColor="#00D26A" />
                </linearGradient>
              </defs>

              {/* Sparkle Star 1 */}
              <path
                d="M21 9C21 11.2 19.8 12.8 17.5 13.5C19.8 14.2 21 15.8 21 18C21 15.8 22.2 14.2 24.5 13.5C22.2 12.8 21 11.2 21 9Z"
                fill="url(#splashSparkleGrad)"
                className="splash-sparkle-1"
                style={{ transformOrigin: '21px 13.5px' }}
              />

              {/* Sparkle Star 2 */}
              <path
                d="M30 7.5C30 8.8 29.3 9.8 28 10.2C29.3 10.6 30 11.6 30 13C30 11.6 30.7 10.6 32 10.2C30.7 9.8 30 8.8 30 7.5Z"
                fill="url(#splashSparkleGrad)"
                className="splash-sparkle-2"
                style={{ transformOrigin: '30px 10.2px' }}
              />

              {/* Linha Dinâmica de Crescimento Financeiro */}
              <path
                d="M11 29L18.5 21.5L24 27L33.5 15.5"
                stroke="url(#splashEmeraldGrad)"
                strokeWidth="3.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="splash-growth-line"
              />

              {/* Seta Ascendente */}
              <path
                d="M27.5 15.5H33.5V21.5"
                stroke="url(#splashEmeraldGrad)"
                strokeWidth="3.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="splash-growth-arrow"
              />
            </svg>
          </div>
        </div>

        {/* Tipografia da Marca & Assinatura */}
        <div className="mt-6 text-center splash-text opacity-0">
          <h1 className="text-2xl sm:text-[32px] font-extrabold text-slate-900 tracking-tight leading-tight">
            Fluxo Financeiro
          </h1>

          <p className="text-[11.5px] sm:text-[13px] font-semibold text-slate-400 tracking-wider uppercase mt-1.5 flex items-center justify-center gap-2">
            <span>Gestão Inteligente</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D26A]" />
            <span>Metas Reais</span>
          </p>

          {/* Detalhe Visual: 3 Barras Minimalistas de Equilíbrio Financeiro (Receitas, Despesas, Economia) */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            <div className="w-5 h-1 rounded-full bg-emerald-400/60 splash-bar-1" />
            <div className="w-8 h-1 rounded-full bg-[#00D26A] splash-bar-2" />
            <div className="w-4 h-1 rounded-full bg-emerald-300/50 splash-bar-3" />
          </div>
        </div>
      </div>

      {/* Rodapé Minimalista: Credibilidade Bancária e Segurança */}
      <div className="absolute bottom-6 sm:bottom-8 left-0 right-0 flex flex-col items-center justify-center gap-1 text-slate-400 select-none pb-safe splash-footer opacity-0">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400/90 tracking-tight">
          <Shield className="w-3.5 h-3.5 text-[#00D26A] stroke-[2.2]" />
          <span>Ambiente Seguro • Tecnologia Financeira</span>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
