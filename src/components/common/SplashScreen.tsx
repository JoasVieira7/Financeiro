import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // Verifica preferência de redução de movimento do sistema
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      onFinish();
      return;
    }

    // Duração rápida da apresentação: 1.1s de exibição + fade suave
    const timer = setTimeout(() => {
      setFadingOut(true);
      const closeTimer = setTimeout(() => {
        onFinish();
      }, 350);
      return () => clearTimeout(closeTimer);
    }, 1100);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-[#F0FDF4] via-[#FAFAFC] to-[#FFFFFF] transition-opacity duration-350 ease-out select-none ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="Carregando Fluxo Financeiro"
    >
      <div className="flex flex-col items-center justify-center animate-scale-in">
        {/* Brand Icon Squircle */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[28px] sm:rounded-[32px] bg-white shadow-[0_16px_36px_rgba(0,210,106,0.14)] border border-emerald-100/60 flex items-center justify-center relative">
          <svg
            width="48"
            height="48"
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-12 h-12 sm:w-14 sm:h-14"
          >
            {/* Sparkle Star 1 */}
            <path
              d="M21 9C21 11.2 19.8 12.8 17.5 13.5C19.8 14.2 21 15.8 21 18C21 15.8 22.2 14.2 24.5 13.5C22.2 12.8 21 11.2 21 9Z"
              fill="#00D26A"
            />
            {/* Sparkle Star 2 */}
            <path
              d="M30 7.5C30 8.8 29.3 9.8 28 10.2C29.3 10.6 30 11.6 30 13C30 11.6 30.7 10.6 32 10.2C30.7 9.8 30 8.8 30 7.5Z"
              fill="#00D26A"
            />
            {/* Dynamic Growth Line */}
            <path
              d="M11 29L18.5 21.5L24 27L33.5 15.5"
              stroke="#00D26A"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Arrowhead */}
            <path
              d="M27.5 15.5H33.5V21.5"
              stroke="#00D26A"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Brand Name & Tagline */}
        <div className="mt-5 text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Fluxo Financeiro
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-emerald-600 mt-1 tracking-wide">
            Gestão Inteligente & Metas Reais
          </p>
        </div>

        {/* Minimalist Progress Pulse */}
        <div className="mt-8 w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-[#00D26A] rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  );
};

