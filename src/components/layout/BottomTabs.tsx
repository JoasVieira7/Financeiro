import React from 'react';
import { Home, Receipt, Target, User } from 'lucide-react';

export type TabType = 'home' | 'transactions' | 'goals' | 'profile';

interface BottomTabsProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onOpenQuickExpense: () => void;
}

export const BottomTabs: React.FC<BottomTabsProps> = ({
  activeTab,
  onChangeTab,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-6 pb-safe pt-2.5 shadow-sm">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Tab 1: Início */}
        <button
          onClick={() => onChangeTab('home')}
          className={`flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === 'home'
              ? 'text-[#00D26A] font-extrabold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Home className={`w-5 h-5 transition-transform ${activeTab === 'home' ? 'scale-110 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-1 font-semibold">Início</span>
        </button>

        {/* Tab 2: Histórico */}
        <button
          onClick={() => onChangeTab('transactions')}
          className={`flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === 'transactions'
              ? 'text-[#00D26A] font-extrabold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Receipt className={`w-5 h-5 transition-transform ${activeTab === 'transactions' ? 'scale-110 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-1 font-semibold">Histórico</span>
        </button>

        {/* Tab 3: Metas */}
        <button
          onClick={() => onChangeTab('goals')}
          className={`flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === 'goals'
              ? 'text-[#00D26A] font-extrabold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Target className={`w-5 h-5 transition-transform ${activeTab === 'goals' ? 'scale-110 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-1 font-semibold">Metas</span>
        </button>

        {/* Tab 4: Perfil */}
        <button
          onClick={() => onChangeTab('profile')}
          className={`flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === 'profile'
              ? 'text-[#00D26A] font-extrabold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className={`w-5 h-5 transition-transform ${activeTab === 'profile' ? 'scale-110 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] mt-1 font-semibold">Perfil</span>
        </button>
      </div>
    </nav>
  );
};
