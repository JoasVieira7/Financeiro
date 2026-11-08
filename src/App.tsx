import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { BottomTabs, TabType } from './components/layout/BottomTabs';
import { BalanceOverview } from './components/home/BalanceOverview';
import { MonthlyGoalCard } from './components/home/WeeklyGoalCard';
import { CategoryBreakdownCard } from './components/home/CategoryBreakdownCard';
import { RecentTransactions } from './components/home/RecentTransactions';
import { GoalsView } from './components/goals/GoalsView';
import { TransactionsView } from './components/transactions/TransactionsView';
import { ProfileView } from './components/profile/ProfileView';
import { ExpressPixModal } from './components/express/ExpressPixModal';
import { AuthModal } from './components/auth/AuthModal';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { NotificationsModal } from './components/notifications/NotificationsModal';
import { useAuth } from './context/AuthContext';
import { Transaction } from './types';

export const App: React.FC = () => {
  const { user, loading, hasSeenOnboarding } = useAuth();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#C4F4D8] via-[#E8FAF0] via-35% to-[#FFFFFF] flex items-center justify-center">
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
          onOpenProfile={() => setActiveTab('profile')}
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
            <MonthlyGoalCard onGoToGoals={() => setActiveTab('goals')} />

            {/* 3. BIG GREEN BUTTON: Registrar Gasto */}
            <button
              onClick={() => {
                setEditingTransaction(null);
                setIsExpressPixOpen(true);
              }}
              className="w-full py-4 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white font-extrabold text-base shadow-button-green active:scale-98 transition-all flex items-center justify-center cursor-pointer"
            >
              Registrar gasto
            </button>

            {/* 4. Resumo de Gastos (Donut Chart) */}
            <CategoryBreakdownCard onGoToReports={() => setActiveTab('goals')} />

            {/* 5. Atividade Recente */}
            <RecentTransactions
              onOpenAll={() => setActiveTab('transactions')}
              onOpenQuickExpense={() => setIsExpressPixOpen(true)}
              onEditTransaction={handleOpenEdit}
            />
          </div>
        )}

        {/* TAB 2: HISTÓRICO (Matching Image 3) */}
        {activeTab === 'transactions' && (
          <TransactionsView
            onBack={() => setActiveTab('home')}
            onEditTransaction={handleOpenEdit}
            onNewTransaction={() => {
              setEditingTransaction(null);
              setIsExpressPixOpen(true);
            }}
          />
        )}

        {/* TAB 3: METAS DE ECONOMIA (Matching Image 2) */}
        {activeTab === 'goals' && <GoalsView />}

        {/* TAB 4: MEU PERFIL (Matching Image 1) */}
        {activeTab === 'profile' && (
          <ProfileView onOpenAuth={() => setIsAuthOpen(true)} />
        )}
      </main>

      {/* Modern Bottom Navigation Bar */}
      <BottomTabs
        activeTab={activeTab}
        onChangeTab={tab => setActiveTab(tab)}
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
        onNavigateToTab={tab => setActiveTab(tab as any)}
      />
    </div>
  );
};

export default App;
