import React, { useState, useMemo } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, getTransactionDisplay } from '../../lib/formatters';
import {
  Utensils,
  Wallet,
  Car,
  ShoppingBag,
  Film,
  Tag,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { TransactionCategory, Transaction, InstallmentGroupSummary } from '../../types';
import { InstallmentDetailModal } from '../transactions/InstallmentDetailModal';

interface RecentTransactionsProps {
  onOpenAll: () => void;
  onOpenQuickExpense: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

type RecentItem =
  | { kind: 'single'; tx: Transaction }
  | { kind: 'group'; groupId: string; tx: Transaction; group: InstallmentGroupSummary };

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  onOpenAll,
  onOpenQuickExpense,
  onEditTransaction,
}) => {
  const { transactions, getInstallmentGroup } = useFinance();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Consolidação Inteligente: Exibe compras parceladas uma única vez nas atividades recentes
  const recentItems = useMemo<RecentItem[]>(() => {
    const items: RecentItem[] = [];
    const seenGroups = new Set<string>();

    for (const tx of transactions) {
      if (tx.installment_group_id) {
        if (!seenGroups.has(tx.installment_group_id)) {
          seenGroups.add(tx.installment_group_id);
          const group = getInstallmentGroup(tx.installment_group_id);
          if (group) {
            items.push({ kind: 'group', groupId: tx.installment_group_id, tx, group });
          } else {
            items.push({ kind: 'single', tx });
          }
        }
      } else {
        items.push({ kind: 'single', tx });
      }

      if (items.length >= 4) break;
    }

    return items;
  }, [transactions, getInstallmentGroup]);

  const getCategoryIcon = (category: TransactionCategory, isIncome: boolean) => {
    if (isIncome) {
      return { icon: Wallet, bg: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
    }
    switch (category) {
      case 'Alimentação':
        return { icon: Utensils, bg: 'bg-amber-50 text-amber-600 border-amber-100' };
      case 'Transporte':
        return { icon: Car, bg: 'bg-blue-50 text-blue-600 border-blue-100' };
      case 'Contas':
      case 'Compras':
        return { icon: ShoppingBag, bg: 'bg-purple-50 text-purple-600 border-purple-100' };
      case 'Lazer':
        return { icon: Film, bg: 'bg-rose-50 text-rose-600 border-rose-100' };
      default:
        return { icon: Tag, bg: 'bg-slate-50 text-slate-600 border-slate-200/60' };
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-semibold text-slate-800 tracking-tight">
          Atividades recentes
        </h3>
        <button
          onClick={onOpenAll}
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
        >
          Ver extrato completo
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {recentItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 border border-slate-200/60 text-center shadow-card">
            <div className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-400 border border-slate-100 flex items-center justify-center mx-auto mb-2.5">
              <Tag className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-700">Nenhum gasto ou receita recente</p>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
              Seus lançamentos aparecerão aqui automaticamente.
            </p>
            <button
              onClick={onOpenQuickExpense}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition-colors shadow-subtle"
            >
              Adicionar movimentação
            </button>
          </div>
        ) : (
          recentItems.map(item => {
            if (item.kind === 'group') {
              const { group } = item;
              const { icon: Icon, bg } = getCategoryIcon(group.category, false);

              return (
                <div
                  key={`group-${group.groupId}`}
                  onClick={() => setSelectedGroupId(group.groupId)}
                  className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/60 shadow-card flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-card-hover transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl ${bg} border flex items-center justify-center shrink-0 shadow-subtle relative`}
                    >
                      <Icon className="w-4.5 h-4.5" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-bold shadow-xs">
                        <Layers className="w-2.5 h-2.5" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-semibold text-slate-900 truncate">
                          {group.description}
                        </h4>
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium tnum shrink-0">
                          {group.totalInstallments}x de {formatCurrency(group.installmentAmount)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
                        <span className="text-slate-600 font-medium">
                          {group.paidInstallments}/{group.totalInstallments} pagas
                        </span>
                        <span>•</span>
                        <span className="tnum">
                          Total: {formatCurrency(group.totalAmount)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3 flex items-center gap-1.5">
                    <div>
                      <span className="text-sm font-bold block tnum text-slate-900">
                        - {formatCurrency(group.installmentAmount)}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400 block">
                        por parcela
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition-colors" />
                  </div>
                </div>
              );
            }

            // Transação normal avulsa
            const { tx } = item;
            const isIncome = tx.type === 'income';
            const display = getTransactionDisplay(tx);
            const { icon: Icon, bg } = getCategoryIcon(tx.category, isIncome);

            return (
              <div
                key={tx.id}
                onClick={() => onEditTransaction(tx)}
                className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/60 shadow-card flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-card-hover transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl ${bg} border flex items-center justify-center shrink-0 shadow-subtle`}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">
                        {display.title}
                      </h4>
                      {display.installmentBadge && (
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium tnum shrink-0">
                          {display.installmentBadge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
                      <span>{display.subtitle}</span>
                      <span>•</span>
                      <span className="tnum">
                        {new Date(tx.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-3">
                  <span
                    className={`text-sm font-bold block tnum ${
                      isIncome ? 'text-emerald-600' : 'text-slate-900'
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

      {/* Modal de Detalhes da Compra Parcelada */}
      <InstallmentDetailModal
        isOpen={Boolean(selectedGroupId)}
        groupId={selectedGroupId}
        onClose={() => setSelectedGroupId(null)}
        onEditTransaction={onEditTransaction}
      />
    </div>
  );
};
