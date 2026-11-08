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
          className="text-sm font-bold text-[#00D26A] hover:opacity-80 transition-opacity cursor-pointer"
        >
          Ver Histórico Completo
        </button>
      </div>

      {/* List */}
      <div className="space-y-2.5">
        {recentItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 border border-slate-100 text-center shadow-card">
            <p className="text-xs font-bold text-slate-700">Nenhum gasto ou receita recente</p>
            <p className="text-[11px] text-slate-400 mt-1 mb-2">
              Seus lançamentos aparecerão aqui automaticamente.
            </p>
            <button
              onClick={onOpenQuickExpense}
              className="px-4 py-2 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              Adicionar Despesa
            </button>
          </div>
        ) : (
          recentItems.map(item => {
            if (item.kind === 'group') {
              const { group } = item;
              const { icon: Icon, bg, color } = getCategoryIcon(group.category, false);

              return (
                <div
                  key={`group-${group.groupId}`}
                  onClick={() => setSelectedGroupId(group.groupId)}
                  className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card flex items-center justify-between cursor-pointer hover:border-emerald-200 transition-all active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 shadow-sm relative`}
                    >
                      <Icon className={`w-5 h-5 ${color}`} />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-bold">
                        <Layers className="w-2.5 h-2.5" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {group.description}
                        </h4>
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-extrabold font-mono shrink-0">
                          {group.totalInstallments}x de {formatCurrency(group.installmentAmount)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
                        <span className="text-slate-600 font-medium">
                          {group.paidInstallments}/{group.totalInstallments} pagas
                        </span>
                        <span>•</span>
                        <span>
                          Total: {formatCurrency(group.totalAmount)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3 flex items-center gap-1.5">
                    <div>
                      <span className="text-sm font-extrabold block font-mono text-slate-900">
                        - {formatCurrency(group.installmentAmount)}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 block">
                        por parcela
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                  </div>
                </div>
              );
            }

            // Transação normal avulsa
            const { tx } = item;
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
                  <div
                    className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 shadow-sm`}
                  >
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
