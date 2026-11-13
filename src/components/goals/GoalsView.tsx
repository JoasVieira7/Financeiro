import React, { useState, useRef } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../lib/formatters';
import { weeklyToMonthly, monthlyToWeekly } from '../../lib/budgetCalculations';
import { DonutChart } from '../common/DonutChart';
import { PlanComparisonModal } from '../profile/PaymentModal';
import {
  Plus,
  ChevronRight,
  X,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Trash2,
  Edit2,
  History,
  AlertTriangle,
  Lock,
  Target,
  Check,
  Calendar,
} from 'lucide-react';
import { SavingsGoal, TransactionCategory, PLAN_LIMITS, GoalPeriodType } from '../../types';
import confetti from 'canvas-confetti';
import { scrollToTopOfCurrentScreen } from '../../lib/scrollUtils';

type GoalFilter = 'all' | 'monthly' | 'custom' | 'completed';

function getWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon ...
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function getMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function formatDeadlineDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return dateStr;
}

const periodTypeLabel: Record<GoalPeriodType, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  custom: 'Objetivo Geral',
};

const periodTypeBadgeClass: Record<GoalPeriodType, string> = {
  weekly: 'bg-blue-50 text-blue-600 border border-blue-200',
  monthly: 'bg-purple-50 text-purple-600 border border-purple-200',
  custom: 'bg-slate-100 text-slate-600 border border-slate-200',
};

export const GoalsView: React.FC = () => {
  const {
    stats,
    goals,
    addSavingsGoal,
    updateSavingsGoal,
    toggleGoalCompleted,
    contributeToGoal,
    deleteSavingsGoal,
    getGoalContributions,
    updateCategoryLimit,
  } = useFinance();
  const { profile, setBudgetPeriodPreference, updateMonthlyBudget } = useAuth();

  // Período ativo do card principal sincronizado com preferência do perfil
  const mainPeriodView = profile?.budget_period_preference || 'monthly';

  // Filter tabs
  const [goalFilter, setGoalFilter] = useState<GoalFilter>('all');

  // Modal para ativar/desativar/editar meta mensal do perfil (Etapa 34.4)
  const [isEditMonthlyTargetOpen, setIsEditMonthlyTargetOpen] = useState(false);
  const [monthlyTargetInputStr, setMonthlyTargetInputStr] = useState('');

  // Create Goal Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [newPeriodType, setNewPeriodType] = useState<GoalPeriodType>('custom');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const addDeadlineRef = useRef<HTMLInputElement>(null);

  // Contribute/Withdraw Modal
  const [activeGoalForAction, setActiveGoalForAction] = useState<SavingsGoal | null>(null);
  const [actionType, setActionType] = useState<'deposit' | 'withdraw'>('deposit');
  const [actionAmount, setActionAmount] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // History Modal
  const [historyGoal, setHistoryGoal] = useState<SavingsGoal | null>(null);

  // Edit Goal Modal
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTargetAmount, setEditTargetAmount] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editPeriodType, setEditPeriodType] = useState<GoalPeriodType>('custom');
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editDeadlineRef = useRef<HTMLInputElement>(null);

  // Edit Category Limit Modal
  const [editingCategory, setEditingCategory] = useState<{
    category: TransactionCategory;
    currentLimit: number;
  } | null>(null);
  const [newLimitStr, setNewLimitStr] = useState('');

  const currentTier = profile?.plan_tier || 'free';
  const isFreePlan = currentTier === 'free';
  const maxGoals = PLAN_LIMITS[currentTier].maxGoals;
  const activeGoalsCount = goals.filter(
    g => (g.current_amount || 0) < g.target_amount && !g.is_completed
  ).length;
  const isAtGoalLimit = isFreePlan && activeGoalsCount >= maxGoals;

  // Main period card values (exclusivamente mensal - Etapa 34.4)
  const weeklyTarget = profile?.weekly_saving_target ?? 250;
  const hasNoGoal = weeklyTarget <= 0 || stats.hasNoGoal;
  const monthlyTarget = hasNoGoal ? 0 : weeklyToMonthly(weeklyTarget);
  const mainTarget = monthlyTarget;
  const mainSaved = stats.monthlySavedAmount ?? 0;
  const mainPct =
    hasNoGoal || monthlyTarget <= 0
      ? 0
      : (stats.monthlyGoalPercentage ?? Math.round((mainSaved / monthlyTarget) * 100));

  const handleOpenEditMonthlyTarget = () => {
    setMonthlyTargetInputStr(hasNoGoal ? '400' : monthlyTarget.toString());
    setIsEditMonthlyTargetOpen(true);
  };

  const handleSaveMonthlyTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(monthlyTargetInputStr.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      await handleDeactivateMonthlyTarget();
      return;
    }
    const weekly = monthlyToWeekly(val);
    await updateMonthlyBudget(profile?.monthly_budget || 3500, weekly, 'monthly');
    setIsEditMonthlyTargetOpen(false);
  };

  const handleDeactivateMonthlyTarget = async () => {
    await updateMonthlyBudget(profile?.monthly_budget || 3500, 0, 'monthly');
    setIsEditMonthlyTargetOpen(false);
  };

  // Filtered goals list
  const filteredGoals = goals.filter(goal => {
    if (goalFilter === 'completed') return goal.is_completed;
    if (goalFilter === 'all') return !goal.is_completed;
    return !goal.is_completed && (goal.period_type ?? 'custom') === goalFilter;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const val = parseFloat(targetAmount.replace(',', '.'));
    if (!title.trim() || isNaN(val) || val <= 0) {
      setErrorMsg('Preencha um título e um valor válido.');
      return;
    }

    // Calculate start/end dates based on period_type
    let startDate: string | undefined;
    let endDate: string | undefined;
    let deadlineArg: string | undefined = deadline || undefined;

    if (newPeriodType === 'weekly') {
      const bounds = getWeekBounds();
      startDate = bounds.start;
      endDate = bounds.end;
      deadlineArg = bounds.end;
    } else if (newPeriodType === 'monthly') {
      const bounds = getMonthBounds();
      startDate = bounds.start;
      endDate = bounds.end;
      deadlineArg = bounds.end;
    }

    const res = await addSavingsGoal(
      title.trim(),
      val,
      deadlineArg,
      undefined,
      undefined,
      newPeriodType,
      startDate,
      endDate
    );
    if (!res.success) {
      setErrorMsg(res.error || 'Erro ao criar meta.');
      return;
    }

    setTitle('');
    setTargetAmount('');
    setDeadline('');
    setNewPeriodType('custom');
    setIsAddOpen(false);

    confetti({
      particleCount: 30,
      spread: 60,
      origin: { y: 0.6 },
    });
  };

  const handleOpenEditGoal = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setEditTitle(goal.title);
    setEditTargetAmount(goal.target_amount.toString());
    setEditDeadline(goal.deadline || '');
    setEditPeriodType(goal.period_type || 'custom');
    setEditErrorMsg(null);
  };

  const handleSaveEditGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal) return;
    setEditErrorMsg(null);

    const val = parseFloat(editTargetAmount.replace(',', '.'));
    if (!editTitle.trim() || isNaN(val) || val <= 0) {
      setEditErrorMsg('Preencha um título e um valor válido.');
      return;
    }

    let startDate: string | undefined;
    let endDate: string | undefined;
    let deadlineArg: string | undefined = editDeadline || undefined;

    if (editPeriodType === 'weekly') {
      const bounds = getWeekBounds();
      startDate = bounds.start;
      endDate = bounds.end;
      deadlineArg = bounds.end;
    } else if (editPeriodType === 'monthly') {
      const bounds = getMonthBounds();
      startDate = bounds.start;
      endDate = bounds.end;
      deadlineArg = bounds.end;
    }

    setIsSavingEdit(true);
    const res = await updateSavingsGoal(editingGoal.id, {
      title: editTitle.trim(),
      target_amount: val,
      period_type: editPeriodType,
      deadline: deadlineArg,
      start_date: startDate,
      end_date: endDate,
    });
    setIsSavingEdit(false);

    if (!res.success) {
      setEditErrorMsg(res.error || 'Erro ao atualizar meta.');
      return;
    }

    setEditingGoal(null);
  };

  const handleContributeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGoalForAction) return;

    setActionError(null);
    const val = parseFloat(actionAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      setActionError('Digite um valor maior que zero.');
      return;
    }

    const res = await contributeToGoal(
      activeGoalForAction.id,
      val,
      actionType,
      actionNotes.trim() || undefined
    );

    if (!res.success) {
      setActionError(res.error || 'Erro ao processar operação.');
      return;
    }

    if (actionType === 'deposit') {
      confetti({
        particleCount: 35,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#00D26A', '#34D399', '#10B981'],
      });
    }

    setActiveGoalForAction(null);
    setActionAmount('');
    setActionNotes('');
  };

  const handleSaveCategoryLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const val = parseFloat(newLimitStr.replace(',', '.'));
    if (isNaN(val) || val <= 0) return;

    await updateCategoryLimit(editingCategory.category, val);
    setEditingCategory(null);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* Top Header (Matching Image 2) */}
      <div className="relative pt-1 text-center">
        <button
          onClick={() => {
            setErrorMsg(null);
            setIsAddOpen(true);
          }}
          type="button"
          className="absolute left-1 top-1 w-9 h-9 rounded-full flex items-center justify-center text-[#00D26A] hover:bg-emerald-50 transition-colors cursor-pointer"
          title="Adicionar Meta"
        >
          <div className="w-7 h-7 rounded-full border-2 border-[#00D26A] flex items-center justify-center">
            <Plus className="w-4 h-4 stroke-[3]" />
          </div>
        </button>

        <div
          onClick={() => scrollToTopOfCurrentScreen()}
          className="cursor-pointer select-none"
          title="Toque para voltar ao topo"
        >
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Metas de Economia
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Gerencie seus objetivos e limites de gastos
          </p>
        </div>
      </div>

      {/* Card 1: Meta de Economia do Mês (Etapa 34.4: Opcional) */}
      {hasNoGoal ? (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-card flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <Target className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            Meta de Economia Mensal Desativada
          </h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-4">
            Você está gerenciando suas finanças sem uma meta fixa de economia. Seu saldo livre está disponível sem deduções.
          </p>
          <button
            type="button"
            onClick={handleOpenEditMonthlyTarget}
            className="px-4 py-2 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
          >
            Ativar Meta de Economia
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-6 border border-emerald-200/80 shadow-card flex flex-col items-center relative">
          <div className="flex items-center justify-between w-full mb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Meta de Economia do Mês
            </h3>
            <button
              onClick={handleOpenEditMonthlyTarget}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              Ajustar / Desativar
            </button>
          </div>

          {/* Donut Chart com dados reais */}
          <DonutChart
            progressPercentage={mainPct}
            centerLabel="Economizado"
            centerValue={formatCurrency(mainSaved)}
            size={170}
            strokeWidth={34}
            showCenterTotal={true}
          />

          {/* Subtitle */}
          <div className="text-center mt-5 space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tnum ${
                mainPct >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
              }`}>
                {mainPct}% da meta
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              Você economizou {formatCurrency(mainSaved)} da meta mensal de{' '}
              {formatCurrency(mainTarget)}
            </p>
            {mainPct > 100 && (
              <p className="text-[11px] font-bold text-emerald-600">
                Parabéns! Você superou sua meta de economia em {mainPct - 100}% 🎉
              </p>
            )}
          </div>

          {/* Micro-resumo estruturado de aportes e retiradas (Etapa 38) */}
          <div className="w-full grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 text-center">
            <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Aportes</span>
              <span className="text-xs font-bold text-emerald-600 tnum">
                {formatCurrency(stats.monthGoalDeposits ?? 0)}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Retiradas</span>
              <span className="text-xs font-bold text-slate-600 tnum">
                {formatCurrency(stats.monthGoalWithdrawals ?? 0)}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-100">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Líquido</span>
              <span className={`text-xs font-bold tnum ${mainSaved < 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                {formatCurrency(mainSaved)}
              </span>
            </div>
          </div>

          {mainSaved < 0 && (
            <div className="w-full mt-3 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/60 text-center">
              <p className="text-[11px] font-medium text-amber-800">
                Atenção: Os resgates no mês superaram os novos aportes em {formatCurrency(Math.abs(mainSaved))}.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Patrimônio Total Reservado em Metas (Etapa 38) */}
      <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200/60 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Patrimônio Total Reservado em Metas
          </span>
          <span className="text-sm font-extrabold text-slate-800 tnum">
            {formatCurrency(stats.totalSavedInGoals ?? 0)}
          </span>
        </div>
        <span className="text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-full">
          {activeGoalsCount} {activeGoalsCount === 1 ? 'meta ativa' : 'metas ativas'}
        </span>
      </div>

      {/* Section 2: Minhas Metas Ativas (Auditoria Núcleo Financeiro) */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Objetivos & Metas Pessoais
            </h3>
            {isFreePlan && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {activeGoalsCount}/{maxGoals} ativas no Free
              </span>
            )}
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="text-xs font-bold text-[#00D26A] hover:underline cursor-pointer"
          >
            + Nova Meta
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {(
            [
              { key: 'all', label: 'Ativas' },
              { key: 'monthly', label: 'Mensais' },
              { key: 'custom', label: 'Objetivos' },
              { key: 'completed', label: 'Concluídas' },
            ] as { key: GoalFilter; label: string }[]
          ).map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setGoalFilter(tab.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                goalFilter === tab.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredGoals.length === 0 ? (
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card text-center">
            <Target className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">
              {goalFilter === 'completed'
                ? 'Nenhuma meta concluída'
                : goalFilter === 'all' && goals.length === 0
                ? 'Nenhuma meta criada ainda'
                : 'Nenhuma meta nesta categoria'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
              {goalFilter === 'all' && goals.length === 0
                ? 'Defina um objetivo financeiro e acompanhe seu progresso real.'
                : 'Tente outro filtro ou crie uma nova meta.'}
            </p>
            {goalFilter === 'all' && goals.length === 0 && (
              <button
                onClick={() => setIsAddOpen(true)}
                className="px-4 py-2 rounded-full bg-[#00D26A] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Criar Primeira Meta
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGoals.map(goal => {
              const current = Number(goal.current_amount || 0);
              const target = Number(goal.target_amount || 1);
              const pct = Math.min(100, Math.round((current / target) * 100));
              const remaining = Math.max(0, target - current);
              const pType = (goal.period_type ?? 'custom') as GoalPeriodType;

              return (
                <div
                  key={goal.id}
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card space-y-3.5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#00D26A] flex items-center justify-center font-bold text-sm shrink-0">
                        <Target className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div>
                        {/* Period Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mb-1 ${periodTypeBadgeClass[pType]}`}
                        >
                          <Calendar className="w-3 h-3" />
                          {periodTypeLabel[pType]}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">{goal.title}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-extrabold text-[#00D26A] font-mono">
                            {formatCurrency(current)}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            de {formatCurrency(target)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          const res = await toggleGoalCompleted(goal.id);
                          if (!res.success && res.error) {
                            alert(res.error);
                          }
                        }}
                        title={goal.is_completed ? 'Reabrir meta como ativa' : 'Marcar meta como concluída'}
                        className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                          goal.is_completed
                            ? 'bg-[#E8FBF0] text-[#00D26A] hover:bg-emerald-100'
                            : 'hover:bg-slate-100 text-slate-400 hover:text-[#00D26A]'
                        }`}
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                      <button
                        onClick={() => handleOpenEditGoal(goal)}
                        title="Editar Meta"
                        className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setHistoryGoal(goal)}
                        title="Histórico de Contribuições"
                        className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteSavingsGoal(goal.id)}
                        title="Excluir Meta"
                        className="p-1.5 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-400">
                        {goal.is_completed
                          ? 'Meta Concluída! 🎉 (espaço liberado)'
                          : remaining > 0
                          ? `Falta ${formatCurrency(remaining)}`
                          : 'Meta Concluída! 🎉 (espaço liberado)'}
                      </span>
                      <span className="font-extrabold text-[#00D26A]">{pct}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00D26A] rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions: Aportar / Retirar */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
                    <button
                      onClick={() => {
                        setActiveGoalForAction(goal);
                        setActionType('deposit');
                        setActionAmount('');
                        setActionError(null);
                      }}
                      className="py-2.5 px-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-[#00D26A] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Adicionar Valor</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveGoalForAction(goal);
                        setActionType('withdraw');
                        setActionAmount('');
                        setActionError(null);
                      }}
                      className="py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Retirar Valor</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Limites por Categoria (Dynamic with Real User Spending - Matching Image 2) */}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-bold text-slate-900">Limites por Categoria</h3>

        <div className="space-y-3">
          {stats.categoryBreakdown.map(cat => {
            const limit = cat.monthlyLimit || 500;
            const pct = cat.limitPercentage || 0;
            const isExceeded = cat.alertLevel === 'exceeded_100';
            const isWarning = cat.alertLevel === 'warning_90' || cat.alertLevel === 'warning_80';

            return (
              <div
                key={cat.category}
                className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card space-y-3"
              >
                {/* Category Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm text-lg"
                      style={{ backgroundColor: `${cat.color}20` }}
                    >
                      <span>{cat.icon}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{cat.category}</h4>
                      <p className="text-xs text-slate-400">Teto Mensal</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setEditingCategory({ category: cat.category, currentLimit: limit });
                      setNewLimitStr(limit.toString());
                    }}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
                    title="Editar Teto da Categoria"
                  >
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                {/* Progress label & Alert Pills */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-400">Progresso</span>
                    {isExceeded && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                        Excedido
                      </span>
                    )}
                    {isWarning && !isExceeded && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                        Atenção {pct}%
                      </span>
                    )}
                  </div>
                  <span
                    className="font-extrabold"
                    style={{ color: isExceeded ? '#E11D48' : cat.color }}
                  >
                    {pct}%
                  </span>
                </div>

                {/* Visual Spending Area / Gray Track (Matching Image 2) */}
                <div className="w-full h-14 bg-[#CBD5E1]/40 rounded-2xl overflow-hidden relative">
                  <div
                    className="h-full rounded-2xl transition-all duration-700 opacity-90"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isExceeded ? '#E11D48' : cat.color,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-bold text-slate-800">
                    <span>{formatCurrency(cat.amount)} gastos</span>
                    <span className="text-slate-600 font-semibold">
                      Limite: {formatCurrency(limit)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal 0.5: Ajustar ou Desativar Meta Mensal (Etapa 34.4) */}
      {isEditMonthlyTargetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-600" />
                Meta de Economia Mensal
              </h3>
              <button
                onClick={() => setIsEditMonthlyTargetOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMonthlyTarget} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Valor da Meta Mensal (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 500.00"
                  value={monthlyTargetInputStr}
                  onChange={e => setMonthlyTargetInputStr(e.target.value)}
                  className="w-full text-base sm:text-sm tnum px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Valor a ser guardado exclusivamente neste mês.
                </span>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  className="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-button-green transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar Meta Mensal</span>
                </button>

                {!hasNoGoal && (
                  <button
                    type="button"
                    onClick={handleDeactivateMonthlyTarget}
                    className="w-full py-2.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Desativar Meta de Economia
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsEditMonthlyTargetOpen(false)}
                  className="w-full py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 1: Adicionar Nova Meta */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#00D26A]" />
                Nova Meta de Economia
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isAtGoalLimit ? (
              <div className="space-y-3.5">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                  <Lock className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-amber-900">
                    Limite do Plano Gratuito
                  </h4>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    Você já possui 2 metas de economia ativas. Conheça o Plano Premium para gerenciar metas ilimitadas.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddOpen(false);
                      setIsPlanModalOpen(true);
                    }}
                    className="w-full py-3 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white font-bold text-xs shadow-button-green transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Conhecer o Premium</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="w-full py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-3.5">
                {errorMsg && (
                  <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                {/* Tipo de período */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-2">
                    Tipo de Meta
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: 'monthly', label: 'Mensal', desc: 'Este mês' },
                        { value: 'custom', label: 'Objetivo', desc: 'Livre / Prazo' },
                      ] as { value: GoalPeriodType; label: string; desc: string }[]
                    ).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setNewPeriodType(opt.value)}
                        className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                          newPeriodType === opt.value
                            ? 'border-[#00D26A] bg-[#E8FBF0]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className={`text-xs font-bold block ${newPeriodType === opt.value ? 'text-[#00B85E]' : 'text-slate-800'}`}>
                          {opt.label}
                        </span>
                        <span className="text-[10px] text-slate-400">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nome do Objetivo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Viagem de Férias, Reserva, Carro"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full text-xs px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Valor Objetivo (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 5000.00"
                    value={targetAmount}
                    onChange={e => setTargetAmount(e.target.value)}
                    className="w-full text-sm font-mono px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                  />
                </div>

                {/* Prazo só aparece quando tipo é "custom" */}
                {newPeriodType === 'custom' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        Prazo Estimado (Opcional)
                      </label>
                      {deadline && (
                        <button
                          type="button"
                          onClick={() => setDeadline('')}
                          className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          Limpar data
                        </button>
                      )}
                    </div>
                    <div className="relative flex items-center">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none shrink-0 z-10" />
                      <input
                        ref={addDeadlineRef}
                        type="date"
                        value={deadline}
                        onChange={e => setDeadline(e.target.value)}
                        className="w-full text-xs pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-[#00D26A] transition-all cursor-pointer min-h-[46px]"
                        aria-label="Prazo Estimado (Opcional)"
                      />
                    </div>
                  </div>
                )}

                {newPeriodType === 'monthly' && (
                  <p className="text-[11px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                    Período: {getMonthBounds().start} → {getMonthBounds().end}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-full bg-[#00D26A] text-white font-bold text-sm shadow-button-green hover:bg-[#00C853] transition-colors mt-2 cursor-pointer"
                >
                  Salvar Meta
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal 1.5: Editar Meta Existente */}
      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#00D26A]" />
                Editar Meta de Economia
              </h3>
              <button
                onClick={() => setEditingGoal(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditGoal} className="space-y-3.5">
              {editErrorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold">
                  {editErrorMsg}
                </div>
              )}

              {/* Tipo de período */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">
                  Tipo de Meta
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'monthly', label: 'Mensal', desc: 'Este mês' },
                      { value: 'custom', label: 'Objetivo', desc: 'Livre / Prazo' },
                    ] as { value: GoalPeriodType; label: string; desc: string }[]
                  ).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditPeriodType(opt.value)}
                      className={`p-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                        editPeriodType === opt.value
                          ? 'border-[#00D26A] bg-[#E8FBF0]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span
                        className={`text-xs font-bold block ${
                          editPeriodType === opt.value ? 'text-[#00B85E]' : 'text-slate-800'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-slate-400">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome do Objetivo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Viagem de Férias, Reserva, Carro"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full text-xs px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Valor Objetivo (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 5000.00"
                  value={editTargetAmount}
                  onChange={e => setEditTargetAmount(e.target.value)}
                  className="w-full text-sm font-mono px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                />
              </div>

              {/* Prazo só aparece quando tipo é "custom" */}
              {editPeriodType === 'custom' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Prazo Estimado (Opcional)
                    </label>
                    {editDeadline && (
                      <button
                        type="button"
                        onClick={() => setEditDeadline('')}
                        className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        Limpar data
                      </button>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none shrink-0 z-10" />
                    <input
                      ref={editDeadlineRef}
                      type="date"
                      value={editDeadline}
                      onChange={e => setEditDeadline(e.target.value)}
                      className="w-full text-xs pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-[#00D26A] transition-all cursor-pointer min-h-[46px]"
                      aria-label="Prazo Estimado (Opcional)"
                    />
                  </div>
                </div>
              )}

              {editPeriodType === 'monthly' && (
                <p className="text-[11px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                  Período: {getMonthBounds().start} → {getMonthBounds().end}
                </p>
              )}

              <button
                type="submit"
                disabled={isSavingEdit}
                className="w-full py-3.5 rounded-full bg-[#00D26A] text-white font-bold text-sm shadow-button-green hover:bg-[#00C853] transition-colors mt-2 cursor-pointer disabled:opacity-60"
              >
                {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Adicionar ou Retirar Valor da Meta */}
      {activeGoalForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {actionType === 'deposit' ? (
                  <ArrowUpRight className="w-5 h-5 text-[#00D26A]" />
                ) : (
                  <ArrowDownLeft className="w-5 h-5 text-amber-500" />
                )}
                <span>
                  {actionType === 'deposit' ? 'Aportar na Meta' : 'Retirar da Meta'}
                </span>
              </h3>
              <button
                onClick={() => setActiveGoalForAction(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Meta: <strong>{activeGoalForAction.title}</strong>
              <br />
              Saldo acumulado atual: <strong>{formatCurrency(activeGoalForAction.current_amount)}</strong>
            </p>

            {actionError && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold">
                {actionError}
              </div>
            )}

            <form onSubmit={handleContributeSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Valor da Operação (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 150.00"
                  value={actionAmount}
                  onChange={e => setActionAmount(e.target.value)}
                  className="w-full text-base font-mono px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Observação (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Sobra do salário, resgate de emergência"
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  className="w-full text-xs px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                />
              </div>

              <button
                type="submit"
                className={`w-full py-3.5 rounded-full text-white font-bold text-sm shadow-md transition-colors mt-2 cursor-pointer ${
                  actionType === 'deposit'
                    ? 'bg-[#00D26A] hover:bg-[#00C853]'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {actionType === 'deposit' ? 'Confirmar Aporte' : 'Confirmar Retirada'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Histórico de Contribuições da Meta */}
      {historyGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-[#00D26A]" />
                Histórico de Aportes
              </h3>
              <button
                onClick={() => setHistoryGoal(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Meta: <strong>{historyGoal.title}</strong>
            </p>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {getGoalContributions(historyGoal.id).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  Nenhum registro de aporte ou retirada registrado para esta meta.
                </p>
              ) : (
                getGoalContributions(historyGoal.id).map(c => (
                  <div
                    key={c.id}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-800 block">
                        {c.type === 'deposit' ? 'Aporte Realizado' : 'Retirada'}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(c.created_at).toLocaleDateString('pt-BR')} •{' '}
                        {new Date(c.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {c.notes && (
                        <p className="text-[11px] text-slate-500 italic mt-0.5">{c.notes}</p>
                      )}
                    </div>
                    <span
                      className={`font-mono font-extrabold ${
                        c.type === 'deposit' ? 'text-[#00D26A]' : 'text-amber-600'
                      }`}
                    >
                      {c.type === 'deposit' ? '+ ' : '- '}
                      {formatCurrency(c.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Editar Teto da Categoria */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Teto para {editingCategory.category}
              </h3>
              <button
                onClick={() => setEditingCategory(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryLimit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Limite Mensal Desejado (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newLimitStr}
                  onChange={e => setNewLimitStr(e.target.value)}
                  className="w-full text-base font-mono px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-full bg-[#00D26A] text-white font-bold text-sm shadow-button-green hover:bg-[#00C853] transition-colors cursor-pointer"
              >
                Atualizar Teto
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Comparativo de Planos */}
      <PlanComparisonModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        highlightedFeature="Metas de Economia Ilimitadas"
        featureDescription="No Plano Premium você cria quantos objetivos financeiros desejar, sem o limite de 2 metas do plano gratuito."
      />
    </div>
  );
};
