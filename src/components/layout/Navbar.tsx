import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Settings } from 'lucide-react';

interface NavbarProps {
  onOpenProfile: () => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenProfile, onOpenAuth }) => {
  const { user, profile } = useAuth();

  const fullName = profile?.full_name || 'João Silva';
  const firstName = fullName.split(' ')[0] || 'João';
  const initials = fullName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || 'JS';

  return (
    <header className="sticky top-0 z-30 w-full bg-[#FAFAFC]/95 backdrop-blur-md px-4 pt-3 pb-2">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Left: User Avatar & Name */}
        <div
          onClick={onOpenProfile}
          className="flex items-center gap-3 cursor-pointer select-none"
        >
          <div className="w-10 h-10 rounded-full bg-[#00D26A] flex items-center justify-center text-white font-extrabold text-sm shadow-sm">
            {initials}
          </div>
          <div className="leading-tight">
            <h1 className="font-extrabold text-base text-slate-900 tracking-tight flex items-center gap-1">
              Olá, {firstName}
            </h1>
            <p className="text-[11px] font-bold text-[#00D26A]">
              {profile?.plan_tier === 'premium' ? 'Premium Ativo' : 'Plano Gratuito'}
            </p>
          </div>
        </div>

        {/* Right: Settings Icon */}
        <button
          onClick={onOpenProfile}
          className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Configurações e Perfil"
        >
          <Settings className="w-5 h-5 text-slate-600" />
        </button>
      </div>
    </header>
  );
};
