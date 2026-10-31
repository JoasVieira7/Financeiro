import React, { useState, useMemo } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../lib/formatters';
import {
  ChevronLeft,
  SlidersHorizontal,
  Utensils,
  Wallet,
  Car,
  ShoppingCart,
  Store,
  Play,
  Check,
  Building,
  HeartPulse,
  Tag,
  DollarSign,
  Plus,
  Inbox,
} from 'lucide-react';
import { Transaction } from '../../types';

interface TransactionsViewProps {
  onBack?: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  onNewTransaction?: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  onBack,
  onEditTransaction,
  onNewTransaction,
}) => {
  const { transactions } = useFinance();
  const [activeFilter, setActiveFilter] = useState<'month' | 'week' | 'income' | 'expense'>('month');

  // Filtered transactions with verified date math
  const filteredList = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const dayOfWeek = now.getDay() || 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    return transactions.filter(tx => {
      const d = new Date(tx.created_at);

      if (activeFilter === 'month') {
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }
      if (activeFilter === 'week') {
        return d >= startOfWeek;
      }
      if (activeFilter === 'income') {
        return tx.type === 'income';
      }
      if (activeFilter === 'expense') {
        return tx.type === 'expense';
      }
      return true;
    });
  }, [transactions, activeFilter]);

  // Group transactions by date string (PT-BR)
  const grouped = useMemo(() => {
    const groups: { label: string; items: Transaction[] }[] = [];
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const map: Record<string, Transaction[]> = {};

    filteredList.forEach(tx => {
      const d = new Date(tx.created_at);
      let label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
      if (d.toDateString() === today) {
        label = `Hoje, ${label}`;
      } else if (d.toDateString() === yesterday) {
        label = `Ontem, ${label}`;
      }

      if (!map[label]) {
        map[label] = [];
        groups.push({ label, items: map[label] });
      }
      map[label].push(tx);
    });

    return groups;
  }, [filteredList]);

  // Totals for the current active filter view
  const filterTotal = useMemo(() => {
    return filteredList.reduce((acc, tx) => {
      return tx.type === 'income' ? acc + Number(tx.amount) : acc - Number(tx.amount);
    }, 0);
  }, [filteredList]);

  const getItemVisuals = (description: string, category: string, isIncome: boolean) => {
    const desc = description.toLowerCase();
    if (isIncome) {
      if (desc.includes('venda') || desc.includes('comércio')) {
        return { icon: Store, bg: 'bg-[#00D26A]', color: 'text-white' };
      }
      return { icon: Wallet, bg: 'bg-[#00D26A]', color: 'text-white' };
    }
    if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('cinema')) {
      return { icon: Play, bg: 'bg-[#EF4444]', color: 'text-white' };
    }
    if (category === 'Transporte' || desc.includes('uber') || desc.includes('combustível')) {
      return { icon: Car, bg: 'bg-[#2563EB]', color: 'text-white' };
    }
    if (category === 'Contas' || desc.includes('mercado') || desc.includes('supermercado')) {
      return { icon: ShoppingCart, bg: 'bg-[#7C3AED]', color: 'text-white' };
    }
    if (category === 'Moradia') {
      return { icon: Building, bg: 'bg-[#4F46E5]', color: 'text-white' };
    }
    if (category === 'Saúde') {
      return { icon: HeartPulse, bg: 'bg-[#E11D48]', color: 'text-white' };
    }
    if (category === 'Alimentação') {
      return { icon: Utensils, bg: 'bg-[#1E293B]', color: 'text-white' };
    }
    return { icon: Tag, bg: 'bg-[#00D26A]', color: 'text-white' };
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* Top Header (Matching Image 3) */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          type="button"
          aria-label="Voltar"
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Histórico
        </h2>

        {onNewTransaction ? (
          <button
            onClick={onNewTransaction}
            type="button"
            title="Novo Lançamento"
            className="w-9 h-9 rounded-full bg-emerald-50 text-[#00D26A] hover:bg-emerald-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {/* Filter Pills (Matching Image 3) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveFilter('month')}
          className={`flex items-center gap-1 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeFilter === 'month'
              ? 'bg-white border-2 border-slate-900 text-slate-900 shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          {activeFilter === 'month' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
          <span>Este Mês</span>
        </button>

        <button
          onClick={() => setActiveFilter('week')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeFilter === 'week'
              ? 'bg-white border-2 border-slate-900 text-slate-900 shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Semana
        </button>

        <button
          onClick={() => setActiveFilter('income')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeFilter === 'income'
              ? 'bg-white border-2 border-slate-900 text-slate-900 shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Entradas
        </button>

        <button
          onClick={() => setActiveFilter('expense')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeFilter === 'expense'
              ? 'bg-white border-2 border-slate-900 text-slate-900 shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Saídas
        </button>
      </div>

      {/* Date Groups (Matching Image 3) */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center shadow-card mt-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">
            Nenhum lançamento no período
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Utilize o botão "Registrar Pix" para adicionar sua primeira transação.
          </p>
        </div>
      ) : (
        <div className="space-y-5 pt-1">
          {grouped.map(grp => (
            <div key={grp.label} className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-500 px-1">
                {grp.label}
              </h4>

              <div className="space-y-2.5">
                {grp.items.map(tx => {
                  const isIncome = tx.type === 'income';
                  const {
                    icon: Icon,
                    bg,
                    color,
                  } = getItemVisuals(tx.description, tx.category, isIncome);

                  return (
                    <div
                      key={tx.id}
                      onClick={() => onEditTransaction?.(tx)}
                      className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card flex items-center justify-between cursor-pointer hover:border-slate-200 transition-all active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 shadow-sm`}
                        >
                          <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-sm font-bold text-slate-900 truncate">
                            {tx.description}
                          </h5>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {tx.category} •{' '}
                            {new Date(tx.created_at).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        <span
                          className={`text-sm font-extrabold block font-mono ${
                            isIncome ? 'text-[#00D26A]' : 'text-slate-900'
                          }`}
                        >
                          {isIncome ? '+ ' : '- '}
                          {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
