import React, { useState, useMemo } from 'react';
import { useFinance, CATEGORY_COLORS } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, getTransactionDueDate, isTransactionPaid } from '../../lib/formatters';
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
} from 'lucide-react';
import { TransactionCategory, PaymentMethod } from '../../types';

export const ReportsView: React.FC = () => {
  const {
    stats,
    transactions,
    recurringExpenses,
    addRecurringExpense,
    deleteRecurringExpense,
    toggleRecurringExpense,
  } = useFinance();
  const { profile } = useAuth();
  const [period, setPeriod] = useState<'current' | 'previous'>('current');
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [recDesc, setRecDesc] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recCat, setRecCat] = useState<TransactionCategory>('Contas');
  const [recMethod, setRecMethod] = useState<PaymentMethod>('pix');
  const [recDay, setRecDay] = useState('5');

  const isPremium = profile?.plan_tier === 'premium';

  // Cálculos do período selecionado (Este Mês vs Mês Anterior)
  const reportData = useMemo(() => {
    if (period === 'current') {
      return {
        income: stats.monthlyIncome,
        expense: stats.monthlyExpense,
        categoryBreakdown: stats.categoryBreakdown,
      };
    }

    // Mês Anterior com cálculo temporal preciso
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const prevMonthTx = transactions.filter(t => {
      const d = t.installment_group_id ? getTransactionDueDate(t) : new Date(t.created_at);
      return d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear;
    });

    const prevExpenses = prevMonthTx.filter(t => t.type === 'expense');
    const expense = prevExpenses
      .filter(t => isTransactionPaid(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const income = prevMonthTx
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    // Distribuição por categoria do mês anterior
    const categoryTotals: Record<string, { amount: number; count: number }> = {};
    prevExpenses
      .filter(t => isTransactionPaid(t))
      .forEach(t => {
        if (!categoryTotals[t.category]) {
          categoryTotals[t.category] = { amount: 0, count: 0 };
        }
        categoryTotals[t.category].amount += Number(t.amount);
        categoryTotals[t.category].count += 1;
      });

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([cat, val]) => {
        const categoryKey = cat as TransactionCategory;
        const conf = CATEGORY_COLORS[categoryKey] || {
          color: '#00F59B',
          bg: '',
          icon: '🏷️',
          defaultLimit: 400,
        };
        const pct = expense > 0 ? Math.round((val.amount / expense) * 100) : 0;
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

    return {
      income,
      expense,
      categoryBreakdown,
    };
  }, [period, stats, transactions]);

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
      {/* Title & Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Relatórios & Planejamento</h2>
          <p className="text-xs text-slate-500">Resumo financeiro e despesas fixas</p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setPeriod('current')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
              period === 'current'
                ? 'bg-[#00D26A] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Este Mês
          </button>
          <button
            onClick={() => setPeriod('previous')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
              period === 'previous'
                ? 'bg-[#00D26A] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Mês Anterior
          </button>
        </div>
      </div>

      {/* Resumo Mensal Card */}
      <div className="rounded-3xl bg-white border border-slate-100 p-5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Resumo do Fechamento
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/80">
            <span className="text-[10px] text-slate-500 block mb-1">Receitas Consolidadas</span>
            <span className="text-sm font-extrabold text-emerald-500 font-mono block">
              + {formatCurrency(reportData.income)}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100/80">
            <span className="text-[10px] text-slate-500 block mb-1">Despesas Consolidadas</span>
            <span className="text-sm font-extrabold text-rose-500 font-mono block">
              - {formatCurrency(reportData.expense)}
            </span>
          </div>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100/80 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 block">Saldo Líquido Gerado</span>
            <span
              className={`text-base font-extrabold font-mono ${
                reportData.income >= reportData.expense ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              {formatCurrency(reportData.income - reportData.expense)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-500 block">Comprometimento de Renda</span>
            <span className="text-xs font-bold text-slate-700 font-mono">
              {reportData.income > 0
                ? Math.round((reportData.expense / reportData.income) * 100)
                : 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Gastos por Categoria - Distribuição Completa */}
      <div className="rounded-3xl bg-white border border-slate-100 p-5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-500">
              <PieChart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Distribuição por Categoria</h3>
              <p className="text-[11px] text-slate-500">Detalhamento dos seus centros de custo</p>
            </div>
          </div>
        </div>

        {reportData.categoryBreakdown.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Nenhum gasto lançado neste período.</p>
        ) : (
          <div className="space-y-3 pt-1">
            {reportData.categoryBreakdown.map(cat => (
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

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
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

      {/* Despesas Recorrentes (Contas Fixas e Assinaturas) */}
      <div className="rounded-3xl bg-white border border-slate-100 p-5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] space-y-3.5">
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

        {/* Recurring List */}
        <div className="space-y-2">
          {recurringExpenses.map(item => (
            <div
              key={item.id}
              className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                item.is_active
                  ? 'bg-slate-50/80 border-slate-100'
                  : 'bg-slate-50/40 border-slate-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleRecurringExpense(item.id)}
                  className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors min-w-[44px] min-h-[44px] cursor-pointer ${
                    item.is_active
                      ? 'bg-[#00D26A] border-[#00D26A] text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                  title="Ativar/Desativar"
                  aria-label={item.is_active ? 'Desativar despesa recorrente' : 'Ativar despesa recorrente'}
                >
                  {item.is_active && <CheckCircle2 className="w-4 h-4 stroke-[3]" />}
                </button>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">{item.description}</h4>
                  <p className="text-[10px] text-slate-500">
                    Vencimento dia {item.due_day} • {item.category} • {item.payment_method}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-slate-800">
                  {formatCurrency(item.amount)}
                </span>
                <button
                  onClick={() => deleteRecurringExpense(item.id)}
                  className="p-1 text-slate-400 hover:text-rose-500 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                  aria-label="Excluir despesa recorrente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Recurring Form */}
        {isAddingRecurring && (
          <form
            onSubmit={handleCreateRecurring}
            className="p-3.5 rounded-2xl bg-slate-50 border border-[#00D26A]/30 space-y-3 animate-slide-up"
          >
            <h4 className="text-xs font-bold text-slate-900">Cadastrar Despesa Fixa</h4>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="Descrição (ex: Aluguel, Netflix)"
                value={recDesc}
                onChange={e => setRecDesc(e.target.value)}
                className="text-xs px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
              />
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                required
                placeholder="Valor (R$)"
                value={recAmount}
                onChange={e => setRecAmount(e.target.value)}
                className="text-xs px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-[#00D26A]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={recCat}
                onChange={e => setRecCat(e.target.value as TransactionCategory)}
                className="text-xs px-2.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
              >
                <option value="Moradia">Moradia</option>
                <option value="Contas">Contas</option>
                <option value="Alimentação">Alimentação</option>
                <option value="Transporte">Transporte</option>
                <option value="Saúde">Saúde</option>
                <option value="Lazer">Lazer</option>
                <option value="Outros">Outros</option>
              </select>

              <input
                type="number"
                min="1"
                max="31"
                inputMode="numeric"
                placeholder="Dia do Vencimento (1 a 31)"
                value={recDay}
                onChange={e => setRecDay(e.target.value)}
                className="text-xs px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-[#00D26A]"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#00D26A] hover:bg-[#00B85C] text-white font-bold text-xs transition-colors min-h-[44px] cursor-pointer"
              >
                Salvar Despesa Fixa
              </button>
              <button
                type="button"
                onClick={() => setIsAddingRecurring(false)}
                className="px-3 py-2.5 rounded-xl bg-slate-200 text-slate-700 text-xs min-h-[44px] cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Projections & SaaS Paywall note */}
      {!isPremium && (
        <div className="rounded-3xl bg-white border border-amber-200 p-4 flex items-center justify-between shadow-[0_6px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Relatórios Avançados & IA</h4>
              <p className="text-[10px] text-slate-500">Disponível no Plano Premium por R$ 4,90/mês</p>
            </div>
          </div>
          <button
            onClick={() => setIsPlanModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shrink-0 transition-colors min-h-[44px] cursor-pointer"
          >
            Ver Detalhes
          </button>
        </div>
      )}

      {/* Modal de Comparação de Planos */}
      <PlanComparisonModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        highlightedFeature="Relatórios Avançados & IA"
        featureDescription="Acesse projeções financeiras, comparação entre períodos e relatórios visuais completos."
      />
    </div>
  );
};
