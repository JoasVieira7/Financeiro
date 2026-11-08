import React from 'react';
import { useFinance } from '../../context/FinanceContext';
import { AppNotification } from '../../types';
import {
  X,
  Bell,
  CheckCheck,
  Target,
  Clock,
  AlertTriangle,
  Sparkles,
  Info,
  Calendar,
  ExternalLink,
} from 'lucide-react';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTab,
}) => {
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  } = useFinance();

  if (!isOpen) return null;

  const getNotificationIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'goal_reached':
        return (
          <div className="w-9 h-9 rounded-full bg-[#E8FBF0] text-[#00D26A] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 stroke-[2.5]" />
          </div>
        );
      case 'goal_warning':
        return (
          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Target className="w-4 h-4 stroke-[2.2]" />
          </div>
        );
      case 'expense_due':
        return (
          <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 stroke-[2.2]" />
          </div>
        );
      case 'expense_overdue':
        return (
          <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 stroke-[2.2]" />
          </div>
        );
      case 'financial_alert':
        return (
          <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 stroke-[2.2]" />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Info className="w-4 h-4 stroke-[2.2]" />
          </div>
        );
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Agora mesmo';
      if (diffMins < 60) return `${diffMins} min atrás`;
      if (diffHours < 24) return `${diffHours}h atrás`;
      if (diffDays === 1) return 'Ontem';
      if (diffDays < 7) return `${diffDays} dias atrás`;

      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!notification.is_read) {
      await markNotificationAsRead(notification.id);
    }

    if (notification.link && onNavigateToTab) {
      if (notification.link === '/goals') {
        onNavigateToTab('goals');
        onClose();
      } else if (notification.link === '/commitments' || notification.link === '/transactions') {
        onNavigateToTab('transactions');
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full sm:max-w-md rounded-t-[32px] sm:rounded-[32px] border border-slate-100 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#E8FBF0] text-[#00D26A] flex items-center justify-center">
              <Bell className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                Notificações
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {unreadNotificationsCount > 0
                  ? `${unreadNotificationsCount} nova${unreadNotificationsCount > 1 ? 's' : ''}`
                  : 'Tudo atualizado'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadNotificationsCount > 0 && (
              <button
                type="button"
                onClick={() => markAllNotificationsAsRead()}
                className="text-xs font-bold text-[#00D26A] hover:underline flex items-center gap-1 cursor-pointer px-2 py-1"
                title="Marcar todas como lidas"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Ler todas</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content List */}
        <div className="overflow-y-auto p-4 space-y-2.5 flex-1 divide-y divide-slate-50">
          {notifications.length === 0 ? (
            <div className="py-12 text-center px-4">
              <div className="w-14 h-14 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center mx-auto mb-3">
                <Bell className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Nenhuma notificação no momento
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto leading-relaxed">
                Você receberá avisos importantes quando atingir metas ou tiver despesas próximas do vencimento.
              </p>
            </div>
          ) : (
            notifications.map(notification => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`pt-2.5 first:pt-0 p-3 rounded-2xl transition-all cursor-pointer flex items-start gap-3 relative ${
                  notification.is_read
                    ? 'hover:bg-slate-50 opacity-80'
                    : 'bg-emerald-50/40 hover:bg-emerald-50/70 border border-emerald-100/60'
                }`}
              >
                {getNotificationIcon(notification.type)}

                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <h4
                      className={`text-xs font-bold leading-tight truncate ${
                        notification.is_read ? 'text-slate-800' : 'text-slate-900 font-extrabold'
                      }`}
                    >
                      {notification.title}
                    </h4>
                    <span className="text-[10px] font-medium text-slate-400 shrink-0">
                      {formatRelativeTime(notification.created_at)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-normal">
                    {notification.message}
                  </p>

                  {notification.link && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-[#00D26A]">
                      <span>Ver detalhes</span>
                      <ExternalLink className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {!notification.is_read && (
                  <span
                    className="w-2 h-2 rounded-full bg-[#00D26A] shrink-0 mt-1.5"
                    title="Não lida"
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-center shrink-0">
          <p className="text-[11px] font-medium text-slate-400">
            Notificações sincronizadas em tempo real com o Supabase
          </p>
        </div>
      </div>
    </div>
  );
};

