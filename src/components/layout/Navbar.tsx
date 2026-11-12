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

  const isPremium = profile?.plan_tier === 'premium';

  return (
    <header className="sticky top-0 z-30 w-full bg-[#F8FAFC]/85 backdrop-blur-xl border-b border-slate-200/50 px-4 pt-safe pb-2.5 transition-all">
      <div className="max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto flex items-center justify-between">
        {/* Left: User Avatar & Name */}
        <div
          onClick={onOpenProfile}
          className="flex items-center gap-3 cursor-pointer select-none py-1 group"
          title="Ver perfil e configurações"
        >
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold text-sm shadow-subtle border border-white ring-1 ring-slate-200/60 group-hover:ring-2 group-hover:ring-emerald-400/50 transition-all">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={firstName} className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="leading-tight min-w-0">
            <h1 className="font-bold text-base text-slate-900 tracking-tight truncate flex items-center gap-1 group-hover:text-emerald-700 transition-colors">
              Olá, {firstName}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                isPremium
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200/60'
              }`}>
                {isPremium ? 'Premium' : 'Free'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Notification Bell Button */}
        <button
          onClick={onOpenNotifications}
          className="relative w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white active:scale-95 transition-all cursor-pointer border border-transparent hover:border-slate-200/60 hover:shadow-subtle"
          title="Notificações"
          aria-label="Abrir notificações"
        >
          <Bell className="w-4.5 h-4.5 text-slate-700 stroke-[2.2]" />

          {unreadNotificationsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs border-2 border-white animate-scale-in">
              {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
