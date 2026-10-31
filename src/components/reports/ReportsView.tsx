import React, { useState } from 'react';
import { useFinance, CATEGORY_COLORS } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../lib/formatters';
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
  const { stats, recurringExpenses, addRecurringExpense, deleteRecurringExpense, toggleRecurringExpense } = useFinance();
  const { profile, updateProfilePlan } = useAuth();
  const [period, setPeriod] = useState<'current' | 'previous'>('current');
  const [isAddingRecurring, setIsAddingRecurring] = useState(false);
  const [recDesc, setRecDesc] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recCat, setRecCat] = useState<TransactionCategory>('Contas');
  const [recMethod, setRecMethod] = useState<PaymentMethod>('pix');
  const [recDay, setRecDay] = useState('5');

  const isPremium = profile?.plan_tier === 'premium';

  const totalRecurring = recurringExpenses
    .filter(r => r.is_active)
    .reduce((acc, r) => acc + Number(r.amount), 0);

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(recAmount.replace(',', '.'));
    const day = parseInt(recDay, 10);
    if (!recDesc.trim() || isNaN(val) || val <= 0 || isNaN(day)) return;

    await addRecurringExpense(recDesc.trim(), val, recCat, recMethod, day);
    setRecDesc('');
    setRecAmount('');
    setIsAddingRecurring(false);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* Title & Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Relatórios & Planejamento</h2>
          <p className="text-xs text-slate-400">Resumo financeiro e despesas fixas</p>
        </div>

        <div className="flex items-center gap-1 bg-dark-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setPeriod('current')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
              period === 'current'
                ? 'bg-brand-500 text-dark-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Este Mês
          </button>
          <button
            onClick={() => setPeriod('previous')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
              period === 'previous'
                ? 'bg-brand-500 text-dark-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mês Anterior
          </button>
        </div>
      </div>

      {/* Resumo Mensal Card */}
      <div className="rounded-3xl bg-dark-900 border border-slate-800 p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Resumo do Fechamento
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-dark-950 p-3 rounded-2xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block mb-1">Receitas Consolidadas</span>
            <span className="text-sm font-extrabold text-emerald-400 font-mono block">
              + {formatCurrency(stats.monthlyIncome)}
            </span>
          </div>

          <div className="bg-dark-950 p-3 rounded-2xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block mb-1">Despesas Consolidadas</span>
            <span className="text-sm font-extrabold text-rose-400 font-mono block">
              - {formatCurrency(stats.monthlyExpense)}
            </span>
          </div>
        </div>

        <div className="bg-dark-950 p-3.5 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block">Saldo Líquido Gerado</span>
            <span
              className={`text-base font-extrabold font-mono ${
                stats.monthlyIncome >= stats.monthlyExpense ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatCurrency(stats.monthlyIncome - stats.monthlyExpense)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Comprometimento de Renda</span>
            <span className="text-xs font-bold text-slate-200 font-mono">
              {stats.monthlyIncome > 0
                ? Math.round((stats.monthlyExpense / stats.monthlyIncome) * 100)
                : 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Gastos por Categoria - Distribuição Completa */}
      <div className="rounded-3xl bg-dark-900 border border-slate-800 p-5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <PieChart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Distribuição por Categoria</h3>
              <p className="text-[11px] text-slate-400">Detalhamento dos seus centros de custo</p>
            </div>
          </div>
        </div>

        {stats.categoryBreakdown.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">Nenhum gasto lançado neste período.</p>
        ) : (
          <div className="space-y-3 pt-1">
            {stats.categoryBreakdown.map(cat => (
              <div key={cat.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <span className="font-semibold text-slate-200">{cat.category}</span>
                    <span className="text-[10px] text-slate-500">({cat.count} lançamentos)</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-200 font-mono">
                      {formatCurrency(cat.amount)}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1.5 font-mono">
                      {cat.percentage}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-slate-800">
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
      <div className="rounded-3xl bg-dark-900 border border-slate-800 p-5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Repeat className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Despesas Recorrentes</h3>
              <p className="text-[11px] text-slate-400">
                Fixas mensais: <strong className="text-slate-200">{formatCurrency(totalRecurring)}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsAddingRecurring(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
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
                  ? 'bg-dark-950/80 border-slate-800/80'
                  : 'bg-dark-950/40 border-slate-900 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleRecurringExpense(item.id)}
                  className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                    item.is_active
                      ? 'bg-brand-500 border-brand-500 text-dark-950'
                      : 'border-slate-700 bg-dark-900'
                  }`}
                  title="Ativar/Desativar"
                >
                  {item.is_active && <CheckCircle2 className="w-4 h-4 stroke-[3]" />}
                </button>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{item.description}</h4>
                  <p className="text-[10px] text-slate-400">
                    Vencimento dia {item.due_day} • {item.category} • {item.payment_method}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-slate-200">
                  {formatCurrency(item.amount)}
                </span>
                <button
                  onClick={() => deleteRecurringExpense(item.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
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
            className="p-3.5 rounded-2xl bg-dark-950 border border-brand-500/30 space-y-3 animate-slide-up"
          >
            <h4 className="text-xs font-bold text-white">Cadastrar Despesa Fixa</h4>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="Descrição (ex: Aluguel, Netflix)"
                value={recDesc}
                onChange={e => setRecDesc(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl bg-dark-900 border border-slate-800 text-white focus:outline-none focus:border-brand-500"
              />
              <input
                type="number"
                step="0.01"
                required
                placeholder="Valor (R$)"
                value={recAmount}
                onChange={e => setRecAmount(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl bg-dark-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={recCat}
                onChange={e => setRecCat(e.target.value as TransactionCategory)}
                className="text-xs px-2.5 py-2 rounded-xl bg-dark-900 border border-slate-800 text-white focus:outline-none"
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
                placeholder="Dia do Vencimento (1 a 31)"
                value={recDay}
                onChange={e => setRecDay(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl bg-dark-900 border border-slate-800 text-white font-mono focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-dark-950 font-bold text-xs transition-colors"
              >
                Salvar Despesa Fixa
              </button>
              <button
                type="button"
                onClick={() => setIsAddingRecurring(false)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Projections & SaaS Paywall note */}
      {!isPremium && (
        <div className="rounded-3xl bg-gradient-to-br from-dark-900 to-dark-950 border border-amber-500/30 p-4 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Relatórios Avançados & IA</h4>
              <p className="text-[10px] text-slate-400">Disponível no Plano Premium por R$ 4,90/mês</p>
            </div>
          </div>
          <button
            onClick={() => updateProfilePlan('premium')}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-dark-950 font-bold text-xs shrink-0 transition-colors"
          >
            Ver Detalhes
          </button>
        </div>
      )}
    </div>
  );
};

