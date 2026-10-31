import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../lib/formatters';
import { DonutChart } from '../common/DonutChart';
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
} from 'lucide-react';
import { SavingsGoal, TransactionCategory, PLAN_LIMITS } from '../../types';
import confetti from 'canvas-confetti';

export const GoalsView: React.FC = () => {
  const {
    stats,
    goals,
    addSavingsGoal,
    updateSavingsGoal,
    contributeToGoal,
    deleteSavingsGoal,
    getGoalContributions,
    updateCategoryLimit,
  } = useFinance();
  const { profile } = useAuth();

  // Create Goal Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Contribute/Withdraw Modal
  const [activeGoalForAction, setActiveGoalForAction] = useState<SavingsGoal | null>(null);
  const [actionType, setActionType] = useState<'deposit' | 'withdraw'>('deposit');
  const [actionAmount, setActionAmount] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // History Modal
  const [historyGoal, setHistoryGoal] = useState<SavingsGoal | null>(null);

  // Edit Category Limit Modal
  const [editingCategory, setEditingCategory] = useState<{
    category: TransactionCategory;
    currentLimit: number;
  } | null>(null);
  const [newLimitStr, setNewLimitStr] = useState('');

  const currentTier = profile?.plan_tier || 'free';
  const isFreePlan = currentTier === 'free';
  const maxGoals = PLAN_LIMITS[currentTier].maxGoals;
  const isAtGoalLimit = isFreePlan && goals.length >= maxGoals;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const val = parseFloat(targetAmount.replace(',', '.'));
    if (!title.trim() || isNaN(val) || val <= 0) {
      setErrorMsg('Preencha um título e um valor válido.');
      return;
    }

    const res = await addSavingsGoal(title.trim(), val, deadline || undefined);
    if (!res.success) {
      setErrorMsg(res.error || 'Erro ao criar meta.');
      return;
    }

    setTitle('');
    setTargetAmount('');
    setDeadline('');
    setIsAddOpen(false);

    confetti({
      particleCount: 30,
      spread: 60,
      origin: { y: 0.6 },
    });
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

        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Metas de Economia
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Gerencie seus objetivos e limites de gastos
        </p>
      </div>

      {/* Card 1: Meta da Semana (with Donut Chart - Matching Image 2) */}
      <div className="bg-white rounded-3xl p-6 border border-emerald-200/80 shadow-card flex flex-col items-center">
        <h3 className="text-sm font-bold text-slate-900 text-center mb-4">
          Meta da Semana
        </h3>

        {/* Donut Chart com dados reais da Meta da Semana */}
        <DonutChart
          progressPercentage={stats.weeklyGoalPercentage}
          centerLabel="Economizado"
          centerValue={formatCurrency(stats.weeklySavedAmount)}
          size={170}
          strokeWidth={34}
          showCenterTotal={true}
        />

        {/* Subtitle with Real User Data */}
        <p className="text-xs font-semibold text-slate-500 text-center mt-5">
          Você economizou {formatCurrency(stats.weeklySavedAmount)} da meta semanal de{' '}
          {formatCurrency(profile?.weekly_saving_target || 250)}
        </p>
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
                {goals.length}/{maxGoals} no Free
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

        {goals.length === 0 ? (
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-card text-center">
            <Target className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">Nenhuma meta criada ainda</p>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
              Defina um objetivo financeiro e acompanhe seu progresso real.
            </p>
            <button
              onClick={() => setIsAddOpen(true)}
              className="px-4 py-2 rounded-full bg-[#00D26A] text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              Criar Primeira Meta
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map(goal => {
              const current = Number(goal.current_amount || 0);
              const target = Number(goal.target_amount || 1);
              const pct = Math.min(100, Math.round((current / target) * 100));
              const remaining = Math.max(0, target - current);

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
                        {remaining > 0 ? `Falta ${formatCurrency(remaining)}` : 'Meta Concluída! 🎉'}
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

      {/* Modal 1: Adicionar Nova Meta */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in">
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
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                  <Lock className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-amber-900">
                    Limite do Plano Gratuito
                  </h4>
                  <p className="text-xs text-amber-700 mt-1">
                    Você já possui 2 metas de economia ativas. Assine o Plano Premium (R$ 4,90/mês) para metas ilimitadas.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="w-full py-3 rounded-full bg-slate-900 text-white font-bold text-xs"
                >
                  Entendi
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-3.5">
                {errorMsg && (
                  <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

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

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Prazo Estimado (Opcional)
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                    className="w-full text-xs px-3.5 py-3 rounded-2xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                  />
                </div>

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

      {/* Modal 2: Adicionar ou Retirar Valor da Meta */}
      {activeGoalForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in">
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
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in max-h-[85vh] flex flex-col">
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
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in">
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
    </div>
  );
};
