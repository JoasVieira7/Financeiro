import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { Bell } from 'lucide-react';

interface NavbarProps {
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenNotifications: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenProfile,
  onOpenNotifications,
}) => {
  const { profile } = useAuth();
  const { unreadNotificationsCount } = useFinance();

  const fullName = profile?.full_name || 'João Silva';
  const firstName = fullName.split(' ')[0] || 'João';
  const initials = fullName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || 'JS';

  return (
    <header className="sticky top-0 z-30 w-full bg-[#FAFAFC]/95 backdrop-blur-md px-4 pt-safe pb-2">
      <div className="max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto flex items-center justify-between">
        {/* Left: User Avatar & Name */}
        <div
          onClick={onOpenProfile}
          className="flex items-center gap-3 cursor-pointer select-none py-1 group"
          title="Ver perfil e configurações"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden bg-[#00D26A] flex items-center justify-center text-white font-extrabold text-sm shadow-sm border border-slate-100 shrink-0 group-hover:ring-2 group-hover:ring-emerald-300 transition-all">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={firstName} className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="leading-tight min-w-0">
            <h1 className="font-extrabold text-base text-slate-900 tracking-tight truncate flex items-center gap-1">
              Olá, {firstName}
            </h1>
            <p className="text-[11px] font-bold text-[#00D26A]">
              {profile?.plan_tier === 'premium' ? 'Premium Ativo' : 'Plano Gratuito'}
            </p>
          </div>
        </div>

        {/* Right: Notification Bell Button (Substituindo a engrenagem) */}
        <button
          onClick={onOpenNotifications}
          className="relative w-11 h-11 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Notificações"
          aria-label="Abrir notificações"
        >
          <Bell className="w-5 h-5 text-slate-700 stroke-[2.2]" />

          {unreadNotificationsCount > 0 && (
            <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#00D26A] text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs border-2 border-white animate-scale-in">
              {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
