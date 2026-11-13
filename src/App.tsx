import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { BottomTabs, TabType } from './components/layout/BottomTabs';
import { BalanceOverview } from './components/home/BalanceOverview';
import { MonthlyGoalCard } from './components/home/WeeklyGoalCard';
import { SmartTipsCard } from './components/home/SmartTipsCard';
import { CategoryBreakdownCard } from './components/home/CategoryBreakdownCard';
import { RecentTransactions } from './components/home/RecentTransactions';
import { GoalsView } from './components/goals/GoalsView';
import { TransactionsView } from './components/transactions/TransactionsView';
import { ProfileView } from './components/profile/ProfileView';
import { ReportsView } from './components/reports/ReportsView';
import { ExpressPixModal } from './components/express/ExpressPixModal';
import { AuthModal } from './components/auth/AuthModal';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { NotificationsModal } from './components/notifications/NotificationsModal';
import { SplashScreen } from './components/common/SplashScreen';
import { useAuth } from './context/AuthContext';
import { Transaction } from './types';
import { scrollToTopOfCurrentScreen } from './lib/scrollUtils';

export const App: React.FC = () => {
  const { user, loading, hasSeenOnboarding } = useAuth();
  const [isSplashVisible, setIsSplashVisible] = useState(() => {
    return typeof window !== 'undefined' ? !sessionStorage.getItem('fluxo_splash_shown') : false;
  });
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isExpressPixOpen, setIsExpressPixOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(!hasSeenOnboarding);

  useEffect(() => {
    setIsOnboardingOpen(!hasSeenOnboarding);
  }, [hasSeenOnboarding]);

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setIsExpressPixOpen(true);
  };

  const handleCloseModal = () => {
    setIsExpressPixOpen(false);
    setEditingTransaction(null);
  };

  const handleTabChange = (tab: TabType) => {
    if (activeTab === tab) {
      // Re-clique na mesma aba ativa: rola a tela atual suavemente até o topo
      scrollToTopOfCurrentScreen();
    } else {
      // Navegação para uma aba diferente
      setActiveTab(tab);
    }
  };

  const handleSplashFinish = () => {
    try {
      sessionStorage.setItem('fluxo_splash_shown', 'true');
    } catch {}
    setIsSplashVisible(false);
  };

  if (isSplashVisible) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#E8FAF0] via-[#F4FBF7] to-[#FFFFFF] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#00D26A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthModal isOpen={true} isFullScreen={true} />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFC] text-slate-900 flex flex-col selection:bg-[#00D26A] selection:text-white">
      {/* Top Fixed Header */}
      {activeTab === 'home' && (
        <Navbar
          onOpenProfile={() => handleTabChange('profile')}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto px-4 pt-3 pb-28">
        {/* TAB 1: INÍCIO (Matching Image 5) */}
        {activeTab === 'home' && (
          <div className="space-y-4 animate-fade-in">
            {/* 1. Saldo Disponível & Gastos do Mês */}
            <BalanceOverview onOpenQuickExpense={() => setIsExpressPixOpen(true)} />

            {/* 2. Meta de Economia do Mês */}
            <MonthlyGoalCard onGoToGoals={() => handleTabChange('goals')} />

            {/* 3. Botão Principal: Registrar Transação */}
            <button
              onClick={() => {
                setEditingTransaction(null);
                setIsExpressPixOpen(true);
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-sm sm:text-base shadow-button-green hover:shadow-button-hover active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/30"
            >
              <span>+ Registrar movimentação</span>
            </button>

            {/* 3.5. Dicas de Economia & Inteligência Financeira (Etapa 34.3) */}
            <SmartTipsCard onNavigateTab={handleTabChange} />

            {/* 4. Resumo de Gastos (Donut Chart) */}
            <CategoryBreakdownCard onGoToReports={() => handleTabChange('reports')} />

            {/* 5. Atividade Recente */}
            <RecentTransactions
              onOpenAll={() => handleTabChange('transactions')}
              onOpenQuickExpense={() => setIsExpressPixOpen(true)}
              onEditTransaction={handleOpenEdit}
            />
          </div>
        )}

        {/* TAB 2: EXTRATO / HISTÓRICO */}
        {activeTab === 'transactions' && (
          <TransactionsView
            onBack={() => handleTabChange('home')}
            onEditTransaction={handleOpenEdit}
            onNewTransaction={() => {
              setEditingTransaction(null);
              setIsExpressPixOpen(true);
            }}
          />
        )}

        {/* TAB 3: RELATÓRIOS & DESPESAS RECORRENTES */}
        {activeTab === 'reports' && <ReportsView />}

        {/* TAB 4: METAS DE ECONOMIA */}
        {activeTab === 'goals' && <GoalsView />}

        {/* TAB 5: MEU PERFIL */}
        {activeTab === 'profile' && (
          <ProfileView onOpenAuth={() => setIsAuthOpen(true)} />
        )}
      </main>

      {/* Modern Bottom Navigation Bar */}
      <BottomTabs
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        onOpenQuickExpense={() => {
          setEditingTransaction(null);
          setIsExpressPixOpen(true);
        }}
      />

      {/* Modal Lançamento Express (Matching Image 4) */}
      <ExpressPixModal
        isOpen={isExpressPixOpen}
        onClose={handleCloseModal}
        editingTransaction={editingTransaction}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />

      {/* Notifications Modal */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onNavigateToTab={tab => handleTabChange(tab as any)}
      />
    </div>
  );
};

export default App;
