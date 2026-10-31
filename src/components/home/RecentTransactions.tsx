import React from 'react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, getTransactionDisplay } from '../../lib/formatters';
import { Utensils, Wallet, Car, ShoppingBag, Store, Film, Tag } from 'lucide-react';
import { TransactionCategory, Transaction } from '../../types';

interface RecentTransactionsProps {
  onOpenAll: () => void;
  onOpenQuickExpense: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  onOpenAll,
  onOpenQuickExpense,
  onEditTransaction,
}) => {
  const { transactions } = useFinance();
  const recentList = transactions.slice(0, 4);

  const getCategoryIcon = (category: TransactionCategory, isIncome: boolean) => {
    if (isIncome) {
      return { icon: Wallet, bg: 'bg-[#00D26A]', color: 'text-white' };
    }
    switch (category) {
      case 'Alimentação':
        return { icon: Utensils, bg: 'bg-[#EF4444]', color: 'text-white' };
      case 'Transporte':
        return { icon: Car, bg: 'bg-[#2563EB]', color: 'text-white' };
      case 'Contas':
      case 'Compras':
        return { icon: ShoppingBag, bg: 'bg-[#7C3AED]', color: 'text-white' };
      case 'Lazer':
        return { icon: Film, bg: 'bg-[#F43F5E]', color: 'text-white' };
      default:
        return { icon: Tag, bg: 'bg-slate-800', color: 'text-white' };
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
          Atividade Recente
        </h3>
        <button
          onClick={onOpenAll}
          className="text-sm font-bold text-[#00D26A] hover:opacity-80 transition-opacity"
        >
          Ver Tudo
        </button>
      </div>

      {/* List */}
      <div className="space-y-2.5">
        {recentList.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 border border-slate-100 text-center shadow-card">
            <p className="text-xs font-bold text-slate-700">Nenhum gasto ou receita recente</p>
            <p className="text-[11px] text-slate-400 mt-1 mb-2">
              Seus lançamentos aparecerão aqui automaticamente.
            </p>
            <button
              onClick={onOpenQuickExpense}
              className="px-3.5 py-1.5 rounded-full bg-[#00D26A] text-white text-xs font-bold cursor-pointer"
            >
              Registrar Lançamento
            </button>
          </div>
        ) : (
          recentList.map(tx => {
            const isIncome = tx.type === 'income';
            const display = getTransactionDisplay(tx);
            const { icon: Icon, bg, color } = getCategoryIcon(tx.category, isIncome);

            return (
              <div
                key={tx.id}
                onClick={() => onEditTransaction(tx)}
                className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card flex items-center justify-between cursor-pointer hover:border-slate-200 transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 shadow-sm`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-bold text-slate-900 truncate">
                        {display.title}
                      </h4>
                      {display.installmentBadge && (
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-extrabold font-mono shrink-0">
                          {display.installmentBadge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
                      <span>{display.subtitle}</span>
                      <span>•</span>
                      <span>
                        {new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
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
          })
        )}
      </div>
    </div>
  );
};
