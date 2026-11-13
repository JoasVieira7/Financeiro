import React, { useState, useMemo } from 'react';
import { useFinance, CATEGORY_COLORS } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import {
  formatCurrency,
  getTransactionDueDate,
  isTransactionPaid,
  parseSafeDate,
  isInternalGoalTransfer,
} from '../../lib/formatters';
import { PlanComparisonModal } from '../profile/PaymentModal';
import {
  PieChart,
  Repeat,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Calendar,
  Lock,
  Plus,
  CheckCircle2,
  Trash2,
  Sliders,
  BarChart3,
  LineChart,
  FileText,
  CreditCard,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  HelpCircle,
  Clock,
  Printer,
  ChevronRight,
} from 'lucide-react';
import { TransactionCategory, PaymentMethod, Transaction } from '../../types';
import { scrollToTopOfCurrentScreen } from '../../lib/scrollUtils';
import {
  IncomeVsExpenseChart,
  NetCashflowChart,
  SavingsEvolutionChart,
  DebtProjectionChart,
  MonthlyDataPoint,
  CategoryDataPoint,
  DebtProjectionPoint,
} from './FinancialCharts';
import { PrintableReportPdf } from './PrintableReportPdf';

type ReportPeriodFilter = 'current' | '3m' | '6m' | '12m';
type ReportSubTab = 'resumo' | 'despesas' | 'receitas' | 'economia' | 'parcelamentos' | 'comparativo' | 'recorrentes';

export const ReportsView: React.FC = () => {
  const {
    stats,
    transactions,
    goals,
    goalContributions,
    recurringExpenses,
    addRecurringExpense,
    deleteRecurringExpense,
    toggleRecurringExpense,
  } = useFinance();
  const { profile } = useAuth();

  const [periodFilter, setPeriodFilter] = useState<ReportPeriodFilter>('current');
  const [activeSubTab, setActiveSubTab] = useState<ReportSubTab>('resumo');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Formulário de Despesa Recorrente
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [recDesc, setRecDesc] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recCat, setRecCat] = useState<TransactionCategory>('Contas');
  const [recMethod, setRecMethod] = useState<PaymentMethod>('pix');
  const [recDay, setRecDay] = useState('5');

  const isPremium = profile?.plan_tier === 'premium';

  // ---------------------------------------------------------------------------
  // Processamento e Agregação Temporal de Dados
  // ---------------------------------------------------------------------------
  const {
    filteredTransactions,
    periodLabel,
    totalIncome,
    totalExpense,
    netBalance,
    totalSaved,
    totalGoalDeposits,
    totalGoalWithdrawals,
    savingsGoalTarget,
    categoryBreakdown,
    monthlyHistory,
    debtProjections,
    debtStats,
  } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let monthsCount = 1;
    let label = 'Mês Atual';
    if (periodFilter === '3m') {
      monthsCount = 3;
      label = 'Últimos 3 Meses';
    } else if (periodFilter === '6m') {
      monthsCount = 6;
      label = 'Últimos 6 Meses';
    } else if (periodFilter === '12m') {
      monthsCount = 12;
      label = 'Ano Atual';
    }

    // Calcula a data de corte inicial
    const cutoffDate = new Date(currentYear, currentMonth - (monthsCount - 1), 1);
    cutoffDate.setHours(0, 0, 0, 0);

    const fTx = transactions.filter(t => {
      const d = (t.installment_group_id || t.due_date) ? getTransactionDueDate(t) : parseSafeDate(t.created_at);
      return d >= cutoffDate && d <= new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    });

    // 1. Receitas e Despesas consolidadas (excluindo transferências internas de aporte/resgate)
    const inc = fTx
      .filter(t => t.type === 'income' && !isInternalGoalTransfer(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const exp = fTx
      .filter(t => t.type === 'expense' && isTransactionPaid(t) && !isInternalGoalTransfer(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const bal = inc - exp;

    // 2. Histórico Mês a Mês para os gráficos (Auditoria Etapa 38: sem trava de Math.max(0, ...))
    const mHistory: MonthlyDataPoint[] = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      const mDate = new Date(currentYear, currentMonth - i, 1);
      const y = mDate.getFullYear();
      const m = mDate.getMonth();
      const mLabel = mDate.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      const ym = `${y}-${String(m + 1).padStart(2, '0')}`;

      const mTx = transactions.filter(t => {
        const d = (t.installment_group_id || t.due_date) ? getTransactionDueDate(t) : parseSafeDate(t.created_at);
        return d.getFullYear() === y && d.getMonth() === m;
      });

      const mInc = mTx
        .filter(t => t.type === 'income' && !isInternalGoalTransfer(t))
        .reduce((acc, t) => acc + Number(t.amount), 0);

      const mExp = mTx
        .filter(t => t.type === 'expense' && isTransactionPaid(t) && !isInternalGoalTransfer(t))
        .reduce((acc, t) => acc + Number(t.amount), 0);

      const mNet = mInc - mExp;

      // Aportes e retiradas em metas realizados no mês (usando parseSafeDate contra timezone drift)
      const mContribs = (goalContributions || []).filter(c => {
        if (!c.created_at) return false;
        const d = parseSafeDate(c.created_at);
        return d.getFullYear() === y && d.getMonth() === m;
      });
      const mDeposits = mContribs
        .filter(c => c.type === 'deposit')
        .reduce((acc, c) => acc + Number(c.amount || 0), 0);
      const mWithdrawals = mContribs
        .filter(c => c.type === 'withdraw')
        .reduce((acc, c) => acc + Number(c.amount || 0), 0);
      const mNetSavings = mDeposits - mWithdrawals;

      // Meta configurada proporcional para o mês
      const mTarget = stats.effectiveSavingTarget || 350;
      // Economia comprovada em metas do mês (suporta retiradas líquidas negativas)
      const mSaved = mNetSavings;
      const mCashSurplus = Math.max(0, mNet);

      mHistory.push({
        monthLabel: mLabel.charAt(0).toUpperCase() + mLabel.slice(1),
        yearMonth: ym,
        income: mInc,
        expense: mExp,
        saved: mSaved,
        cashSurplus: mCashSurplus,
        savingTarget: mTarget,
        netBalance: mNet,
      });
    }

    // 3. Distribuição por Categoria
    const catMap: Record<string, { amount: number; count: number }> = {};
    fTx
      .filter(t => t.type === 'expense' && isTransactionPaid(t))
      .forEach(t => {
        if (!catMap[t.category]) {
          catMap[t.category] = { amount: 0, count: 0 };
        }
        catMap[t.category].amount += Number(t.amount);
        catMap[t.category].count += 1;
      });

    const cBreakdown: CategoryDataPoint[] = Object.entries(catMap)
      .map(([cat, val]) => {
        const categoryKey = cat as TransactionCategory;
        const conf = CATEGORY_COLORS[categoryKey] || {
          color: '#00F59B',
          bg: '',
          icon: '🏷️',
          defaultLimit: 400,
        };
        const pct = exp > 0 ? Math.round((val.amount / exp) * 100) : 0;
        return {
          category: categoryKey,
          amount: val.amount,
          percentage: pct,
          count: val.count,
          color: conf.color,
          icon: conf.icon,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    // 4. Análise de Parcelamentos e Dívidas Futuras
    const installmentTx = transactions.filter(t => Boolean(t.installment_group_id));
    const totalInstallmentDebt = installmentTx.reduce((acc, t) => acc + Number(t.amount), 0);
    const paidInstallments = installmentTx
      .filter(t => isTransactionPaid(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const pendingInstallments = totalInstallmentDebt - paidInstallments;

    // Projeção futura mês a mês das faturas seguintes
    const dProj: DebtProjectionPoint[] = [];
    for (let f = 1; f <= 6; f++) {
      const fDate = new Date(currentYear, currentMonth + f, 1);
      const fy = fDate.getFullYear();
      const fm = fDate.getMonth();
      const fLabel = fDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');

      const futureMonthTx = installmentTx.filter(t => {
        const d = getTransactionDueDate(t);
        return d.getFullYear() === fy && d.getMonth() === fm && !isTransactionPaid(t);
      });

      const fAmount = futureMonthTx.reduce((acc, t) => acc + Number(t.amount), 0);
      if (fAmount > 0) {
        dProj.push({
          monthLabel: fLabel.charAt(0).toUpperCase() + fLabel.slice(1),
          pendingAmount: fAmount,
          paidAmount: 0,
          installmentCount: futureMonthTx.length,
        });
      }
    }

    const dStats = {
      totalDebt: totalInstallmentDebt,
      paid: paidInstallments,
      pending: pendingInstallments,
      activeCount: installmentTx.filter(t => !isTransactionPaid(t)).length,
      estimatedPayoffMonth: dProj.length > 0 ? dProj[dProj.length - 1].monthLabel : 'Nenhum',
    };

    const target = stats.effectiveSavingTarget || 350;
    // Aportes e retiradas em metas no período selecionado (usando parseSafeDate)
    const periodContribs = (goalContributions || []).filter(c => {
      if (!c.created_at) return false;
      const d = parseSafeDate(c.created_at);
      return d >= cutoffDate && d <= new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    });
    const periodGoalDeposits = periodContribs
      .filter(c => c.type === 'deposit')
      .reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const periodGoalWithdrawals = periodContribs
      .filter(c => c.type === 'withdraw')
      .reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const periodNetGoalSavings = periodGoalDeposits - periodGoalWithdrawals;

    return {
      filteredTransactions: fTx,
      periodLabel: label,
      totalIncome: inc,
      totalExpense: exp,
      netBalance: bal,
      totalSaved: periodNetGoalSavings,
      totalGoalDeposits: periodGoalDeposits,
      totalGoalWithdrawals: periodGoalWithdrawals,
      savingsGoalTarget: target,
      categoryBreakdown: cBreakdown,
      monthlyHistory: mHistory,
      debtProjections: dProj,
      debtStats: dStats,
    };
  }, [transactions, periodFilter, stats, goalContributions]);

  const totalRecurring = recurringExpenses
    .filter(r => r.is_active)
    .reduce((acc, r) => acc + Number(r.amount), 0);

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPremium) {
      setIsPlanModalOpen(true);
      return;
    }

    const val = parseFloat(recAmount.replace(',', '.'));
    const day = parseInt(recDay, 10);
    if (!recDesc.trim() || isNaN(val) || val <= 0 || isNaN(day)) return;

    const res = await addRecurringExpense(recDesc.trim(), val, recCat, recMethod, day);
    if (!res.success && res.error) {
      alert(res.error);
      return;
    }

    setRecDesc('');
    setRecAmount('');
    setIsAddingRecurring(false);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* 1. Header do Módulo & Ações */}
      <div className="flex items-center justify-between">
        <div
          onClick={() => scrollToTopOfCurrentScreen()}
          className="cursor-pointer select-none"
          title="Toque para voltar ao topo"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Relatórios Financeiros</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {isPremium ? 'Premium Ativo' : 'Plano Gratuito'}
            </span>
          </div>
          <p className="text-xs text-slate-400">Inteligência analítica &amp; fechamento contábil</p>
        </div>

        {/* Botão Exportar PDF */}
        <button
          type="button"
          onClick={() => {
            if (!isPremium) {
              setIsPlanModalOpen(true);
            } else {
              setIsPrintModalOpen(true);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border shadow-2xs bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
        >
          {!isPremium ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Printer className="w-3.5 h-3.5 text-emerald-600" />}
          <span>Exportar PDF</span>
        </button>
      </div>

      {/* 2. Filtro de Período Temporal */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(
          [
            { key: 'current', label: 'Este Mês' },
            { key: '3m', label: '3 Meses' },
            { key: '6m', label: '6 Meses' },
            { key: '12m', label: 'Ano Atual' },
          ] as { key: ReportPeriodFilter; label: string }[]
        ).map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              if (p.key !== 'current' && !isPremium) {
                setIsPlanModalOpen(true);
                return;
              }
              setPeriodFilter(p.key);
            }}
            className={`flex-1 py-1.5 px-3 rounded-full text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer text-center ${periodFilter === p.key
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
          >
            {p.label}
            {p.key !== 'current' && !isPremium && (
              <Lock className="w-2.5 h-2.5 inline-block ml-1 text-amber-500" />
            )}
          </button>
        ))}
      </div>

      {/* 3. Navegação das Sub-Áreas de Relatórios (Exclusivo Premium) */}
      {isPremium ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {(
            [
              { key: 'resumo', label: 'Resumo Geral', icon: BarChart3 },
              { key: 'despesas', label: 'Despesas', icon: TrendingDown },
              { key: 'receitas', label: 'Receitas', icon: TrendingUp },
              { key: 'economia', label: 'Economia', icon: Sparkles },
              { key: 'parcelamentos', label: 'Dívidas & Faturas', icon: CreditCard },
              { key: 'comparativo', label: 'Comparativo', icon: LineChart },
              { key: 'recorrentes', label: 'Contas Fixas', icon: Repeat },
            ] as { key: ReportSubTab; label: string; icon: any }[]
          ).map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSubTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${isActive
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200/70 hover:bg-slate-50'
                  }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        /* Preview Banner para Usuários Free */
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white rounded-3xl p-5 border border-emerald-200/80 shadow-card space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#00D26A] text-white flex items-center justify-center shrink-0 shadow-subtle">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Relatórios Financeiros Avançados
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Desbloqueie análises completas de receitas vs despesas, gráficos de evolução da economia, histórico temporal e exportação profissional em PDF.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700 pt-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00D26A]" />
              <span>Gráficos de evolução mensal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00D26A]" />
              <span>Projeção de parcelamentos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00D26A]" />
              <span>Comparativo de 3 a 12 meses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00D26A]" />
              <span>Exportação ilimitada em PDF</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPlanModalOpen(true)}
            className="w-full py-2.5 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white font-bold text-xs shadow-button-green transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Desbloquear Relatórios Premium</span>
          </button>
        </div>
      )}

      {/* 4. CONTEÚDO DAS SUB-ABAS (OU PREVIEW FREE) */}

      {/* A. SUB-ABA: RESUMO GERAL */}
      {(activeSubTab === 'resumo' || !isPremium) && (
        <div className="space-y-4">
          {/* Card Principal: Resumo Financeiro Consolidado */}
          <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Fechamento ({periodLabel})
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                {filteredTransactions.length} lançamentos
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100/80">
                <span className="text-[10px] text-slate-500 block mb-0.5">Receitas</span>
                <span className="text-sm sm:text-base font-extrabold text-emerald-600 font-mono block">
                  + {formatCurrency(totalIncome)}
                </span>
                <span className="text-[10px] text-slate-400">Total recebido</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100/80">
                <span className="text-[10px] text-slate-500 block mb-0.5">Despesas Pagas</span>
                <span className="text-sm sm:text-base font-extrabold text-rose-600 font-mono block">
                  - {formatCurrency(totalExpense)}
                </span>
                <span className="text-[10px] text-slate-400">Gastos consolidados</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 block">Saldo Líquido Gerado</span>
                <span
                  className={`text-base font-extrabold font-mono ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                >
                  {formatCurrency(netBalance)}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {netBalance >= 0 ? 'Superávit no período' : 'Déficit no período'}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">Renda Comprometida</span>
                <span className="text-sm font-bold text-slate-800 font-mono">
                  {totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0}%
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {totalIncome > 0 && Math.round((totalExpense / totalIncome) * 100) <= 70 ? 'Nível seguro' : 'Atenção ao limite'}
                </p>
              </div>
            </div>
          </div>

          {/* Gráfico 1: Receitas vs Despesas (Premium) */}
          {isPremium ? (
            <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-card space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Receitas versus Despesas</h4>
                  <p className="text-[11px] text-slate-400">Comparação mensal do fluxo de entradas e saídas</p>
                </div>
              </div>

              <IncomeVsExpenseChart data={monthlyHistory} />
            </div>
          ) : (
            /* Locked Chart Card for Free Users */
            <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-card text-center space-y-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                  <Lock className="w-5 h-5 text-amber-500" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">Gráfico de Receitas vs Despesas</h4>
                <p className="text-xs text-slate-500 max-w-xs mt-0.5">
                  Disponível exclusivamente para membros Premium com histórico de até 12 meses.
                </p>
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(true)}
                  className="mt-3 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-bold shadow-xs cursor-pointer hover:bg-slate-800"
                >
                  Liberar no Premium
                </button>
              </div>

              <div className="opacity-20 pointer-events-none filter blur-xs">
                <div className="h-32 bg-slate-100 rounded-2xl flex items-end justify-around p-4">
                  <div className="w-8 h-20 bg-emerald-500 rounded-t-md" />
                  <div className="w-8 h-16 bg-rose-500 rounded-t-md" />
                  <div className="w-8 h-24 bg-emerald-500 rounded-t-md" />
                  <div className="w-8 h-12 bg-rose-500 rounded-t-md" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* B. SUB-ABA: ANÁLISE DE DESPESAS */}
      {isPremium && activeSubTab === 'despesas' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Despesas por Categoria</h4>
                <p className="text-[11px] text-slate-400">Centros de custo com maior impacto no seu orçamento</p>
              </div>
            </div>

            {categoryBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Nenhuma despesa registrada no período.</p>
            ) : (
              <div className="space-y-3 pt-1">
                {categoryBreakdown.map(cat => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span className="font-semibold text-slate-800">{cat.category}</span>
                        <span className="text-[10px] text-slate-400">({cat.count} lançamentos)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-800 font-mono">
                          {formatCurrency(cat.amount)}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1.5 font-mono">
                          {cat.percentage}%
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(4, cat.percentage)}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* C. SUB-ABA: ANÁLISE DE RECEITAS */}
      {isPremium && activeSubTab === 'receitas' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Origem &amp; Evolução de Receitas</h4>
                <p className="text-[11px] text-slate-400">Histórico de entradas consolidadas por período</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
              <div>
                <span className="text-xs text-emerald-800 font-semibold block">Total Recebido no Período</span>
                <span className="text-xl font-extrabold text-emerald-600 font-mono mt-0.5 block">
                  {formatCurrency(totalIncome)}
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-white px-3 py-1 rounded-full shadow-2xs">
                Média: {formatCurrency(totalIncome / (monthlyHistory.length || 1))}/mês
              </span>
            </div>

            <NetCashflowChart data={monthlyHistory} />
          </div>
        </div>
      )}

      {/* D. SUB-ABA: ANÁLISE DE ECONOMIA */}
      {isPremium && activeSubTab === 'economia' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Evolução da Economia Real</h4>
                <p className="text-[11px] text-slate-400">Meta planejada versus valores efetivamente poupados</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block mb-0.5">Meta Planejada</span>
                <span className="text-sm sm:text-base font-extrabold text-indigo-600 font-mono block">
                  {formatCurrency(savingsGoalTarget)}
                </span>
                <span className="text-[10px] text-slate-400">Por ciclo mensal</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block mb-0.5">Total de Aportes</span>
                <span className="text-sm sm:text-base font-extrabold text-emerald-600 font-mono block">
                  {formatCurrency(totalGoalDeposits)}
                </span>
                <span className="text-[10px] text-slate-400">Entradas em metas no período</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block mb-0.5">Total de Retiradas</span>
                <span className="text-sm sm:text-base font-extrabold text-slate-700 font-mono block">
                  {formatCurrency(totalGoalWithdrawals)}
                </span>
                <span className="text-[10px] text-slate-400">Resgates de metas no período</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block mb-0.5">Saldo Líquido em Metas</span>
                <span className={`text-sm sm:text-base font-extrabold font-mono block ${totalSaved >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {formatCurrency(totalSaved)}
                </span>
                <span className="text-[10px] text-slate-400">{totalSaved < 0 ? 'Retiradas > Aportes' : 'Aportes − Retiradas'}</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block mb-0.5">Patrimônio Reservado</span>
                <span className="text-sm sm:text-base font-extrabold text-slate-800 font-mono block">
                  {formatCurrency(stats.totalSavedInGoals ?? 0)}
                </span>
                <span className="text-[10px] text-slate-400">Total acumulado em metas</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block mb-0.5">Superávit de Caixa</span>
                <span className={`text-sm sm:text-base font-extrabold font-mono block ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(netBalance)}
                </span>
                <span className="text-[10px] text-slate-400">Margem livre operacional</span>
              </div>
            </div>

            {totalSaved < 0 && (
              <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200/60 text-xs text-amber-800 font-medium">
                Atenção: No período selecionado, as retiradas ({formatCurrency(totalGoalWithdrawals)}) superaram os novos aportes ({formatCurrency(totalGoalDeposits)}), gerando variação líquida de {formatCurrency(totalSaved)}.
              </div>
            )}

            <SavingsEvolutionChart data={monthlyHistory} />
          </div>
        </div>
      )}

      {/* E. SUB-ABA: DÍVIDAS & PARCELAMENTOS */}
      {isPremium && activeSubTab === 'parcelamentos' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Dívidas, Faturas &amp; Parcelamentos</h4>
                <p className="text-[11px] text-slate-400">Projeção cronológica das parcelas a vencer</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-500 block">Total Financiado</span>
                <span className="text-xs sm:text-sm font-extrabold text-slate-800 font-mono block mt-0.5">
                  {formatCurrency(debtStats.totalDebt)}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                <span className="text-[10px] text-emerald-700 block">Já Quitado</span>
                <span className="text-xs sm:text-sm font-extrabold text-emerald-600 font-mono block mt-0.5">
                  {formatCurrency(debtStats.paid)}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-100">
                <span className="text-[10px] text-amber-800 block">A Pagar</span>
                <span className="text-xs sm:text-sm font-extrabold text-amber-600 font-mono block mt-0.5">
                  {formatCurrency(debtStats.pending)}
                </span>
              </div>
            </div>

            <DebtProjectionChart data={debtProjections} />
          </div>
        </div>
      )}

      {/* F. SUB-ABA: COMPARATIVO TEMPORAL */}
      {isPremium && activeSubTab === 'comparativo' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <LineChart className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Comparativo Temporal Mês a Mês</h4>
                <p className="text-[11px] text-slate-400">Análise de desempenho e indicadores comparados</p>
              </div>
            </div>

            <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Mês</th>
                    <th className="py-2.5 px-3 text-right">Receitas</th>
                    <th className="py-2.5 px-3 text-right">Despesas</th>
                    <th className="py-2.5 px-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {monthlyHistory.map(m => (
                    <tr key={m.yearMonth} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-sans font-bold text-slate-800">{m.monthLabel}</td>
                      <td className="py-2 px-3 text-right text-emerald-600">{formatCurrency(m.income)}</td>
                      <td className="py-2 px-3 text-right text-rose-600">{formatCurrency(m.expense)}</td>
                      <td className={`py-2 px-3 text-right font-bold ${m.netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(m.netBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* G. SUB-ABA: CONTAS FIXAS & DESPESAS RECORRENTES (Preservação Integral) */}
      {(activeSubTab === 'recorrentes' || !isPremium) && (
        <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-card space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
                <Repeat className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Despesas Recorrentes</h3>
                <p className="text-[11px] text-slate-500">
                  Fixas mensais: <strong className="text-slate-800">{formatCurrency(totalRecurring)}</strong>
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                if (!isPremium) {
                  setIsPlanModalOpen(true);
                } else {
                  setIsAddingRecurring(true);
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all border border-slate-200 min-h-[44px] cursor-pointer"
            >
              {!isPremium ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Adicionar</span>
            </button>
          </div>

          {/* Form Adicionar Despesa Fixa */}
          {isAddingRecurring && (
            <form onSubmit={handleCreateRecurring} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3 animate-fade-in">
              <h4 className="text-xs font-bold text-slate-800">Nova Despesa Recorrente</h4>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Descrição</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aluguel, Internet, Academia"
                  value={recDesc}
                  onChange={e => setRecDesc(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-[#00D26A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={recAmount}
                    onChange={e => setRecAmount(e.target.value)}
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-[#00D26A]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Dia do Vencimento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={recDay}
                    onChange={e => setRecDay(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-[#00D26A]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-[#00D26A] hover:bg-[#00C853] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingRecurring(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* Lista de Recorrentes */}
          <div className="space-y-2">
            {recurringExpenses.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Nenhuma despesa fixa cadastrada.</p>
            ) : (
              recurringExpenses.map(r => (
                <div
                  key={r.id}
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleRecurringExpense(r.id)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${r.is_active ? 'bg-emerald-50 text-[#00D26A]' : 'bg-slate-200 text-slate-400'
                        }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <div>
                      <span className={`text-xs font-bold block ${r.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                        {r.description}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Vence dia {r.due_day} · {r.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 font-mono">
                      {formatCurrency(r.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteRecurringExpense(r.id)}
                      className="p-1 rounded-full text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal de Comparativo de Planos */}
      <PlanComparisonModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
      />

      {/* Modal de Impressão e Exportação em PDF (Exclusivo Premium) */}
      {isPrintModalOpen && isPremium && (
        <PrintableReportPdf
          userName={profile?.full_name || 'Usuário Fluxo Financeiro'}
          periodLabel={periodLabel}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          totalSaved={totalSaved}
          totalGoalDeposits={totalGoalDeposits}
          totalGoalWithdrawals={totalGoalWithdrawals}
          netBalance={netBalance}
          savingsGoalTarget={savingsGoalTarget}
          categoryBreakdown={categoryBreakdown}
          monthlyHistory={monthlyHistory}
          debtProjections={debtProjections}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </div>
  );
};
