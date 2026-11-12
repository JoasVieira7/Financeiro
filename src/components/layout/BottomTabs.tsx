import React from 'react';
import { Home, Receipt, BarChart3, Target, User } from 'lucide-react';
import { scrollToTopOfCurrentScreen } from '../../lib/scrollUtils';

export type TabType = 'home' | 'transactions' | 'reports' | 'goals' | 'profile';

interface BottomTabsProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onOpenQuickExpense: () => void;
}

export const BottomTabs: React.FC<BottomTabsProps> = ({
  activeTab,
  onChangeTab,
}) => {
  const tabs = [
    { id: 'home' as TabType, label: 'Início', icon: Home },
    { id: 'transactions' as TabType, label: 'Extrato', icon: Receipt },
    { id: 'reports' as TabType, label: 'Relatórios', icon: BarChart3 },
    { id: 'goals' as TabType, label: 'Metas', icon: Target },
    { id: 'profile' as TabType, label: 'Perfil', icon: User },
  ];

  const handleTabClick = (tabId: TabType) => {
    if (activeTab === tabId) {
      // Re-clique na mesma aba ativa: rola a tela atual suavemente até o topo
      scrollToTopOfCurrentScreen();
    } else {
      // Clique em aba diferente: navega normalmente
      onChangeTab(tabId);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 px-3 sm:px-6 pb-safe pt-2 shadow-[0_-2px_12px_rgba(15,23,42,0.03)] transition-all">
      <div className="max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto flex items-center justify-between gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`min-h-[44px] flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'text-emerald-600 bg-emerald-50/70'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50/60 active:scale-95'
              }`}
              aria-label={
                isActive
                  ? `${tab.label} (aba atual, toque para voltar ao topo)`
                  : `Ir para ${tab.label}`
              }
              title={isActive ? `Voltar ao topo de ${tab.label}` : tab.label}
            >
              <Icon
                className={`w-5 h-5 transition-transform ${
                  isActive ? 'scale-105 stroke-[2.4]' : 'stroke-[1.8]'
                }`}
              />
              <span
                className={`text-[10px] mt-1 tracking-tight leading-none ${
                  isActive ? 'font-bold text-emerald-700' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
