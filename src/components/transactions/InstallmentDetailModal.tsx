import React, { useState } from 'react';
import {
  X,
  Layers,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  Check,
  CreditCard,
  ShoppingBag,
} from 'lucide-react';
import { InstallmentGroupSummary, Transaction } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import {
  formatCurrency,
  formatDateBR,
  getTransactionDueDate,
  getTransactionStatus,
  getStatusBadge,
  formatPaymentMethod,
  isTransactionPaid,
} from '../../lib/formatters';

interface InstallmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string | null;
  onEditTransaction?: (tx: Transaction) => void;
}

export const InstallmentDetailModal: React.FC<InstallmentDetailModalProps> = ({
  isOpen,
  onClose,
  groupId,
  onEditTransaction,
}) => {
  const { getInstallmentGroup, toggleInstallmentPaid, deleteTransaction } = useFinance();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTxForDelete, setSelectedTxForDelete] = useState<Transaction | null>(null);

  if (!isOpen || !groupId) return null;

  const group = getInstallmentGroup(groupId);
  if (!group) return null;

  const firstTx = group.installments[0];
  const previousPaidCount = Math.max(0, (firstTx?.installment_number || 1) - 1);
  const pendingTotalAmount = group.installments
    .filter(t => !isTransactionPaid(t))
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const progressPct =
    group.totalInstallments > 0
      ? Math.round((group.paidInstallments / group.totalInstallments) * 100)
      : 0;

  const handleTogglePaid = async (txId: string) => {
    setIsUpdating(txId);
    try {
      await toggleInstallmentPaid(txId);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDelete = async (deleteAllGroup: boolean) => {
    const targetId = selectedTxForDelete?.id || group.installments[0]?.id;
    if (!targetId) return;
    await deleteTransaction(targetId, deleteAllGroup);
    setShowDeleteConfirm(false);
    if (deleteAllGroup) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-t-[36px] sm:rounded-[36px] p-5 sm:p-6 shadow-2xl animate-slide-up sm:animate-scale-in max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#00D26A] flex items-center justify-center font-bold">
              <Layers className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                Compra Parcelada
              </span>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight">
                {group.description}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Delete Confirmation Alert */}
        {showDeleteConfirm && (
          <div className="mt-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold space-y-3 shrink-0 animate-scale-in">
            <div className="flex items-center gap-2 text-rose-700 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Excluir Compra Parcelada</span>
            </div>
            <p className="text-slate-700 leading-relaxed">
              Deseja excluir toda a compra ({group.totalInstallments} parcelas) ou apenas uma parcela específica?
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDelete(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-center transition-colors cursor-pointer"
              >
                Excluir toda a compra ({group.totalInstallments} parcelas)
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold text-center transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="overflow-y-auto space-y-4 py-3 flex-1 pr-1">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 block">
                Valor Total da Compra
              </span>
              <span className="text-lg font-extrabold text-slate-900 font-mono tracking-tight mt-0.5 block">
                {formatCurrency(group.totalAmount)}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 mt-0.5 block">
                {group.totalInstallments}x de {formatCurrency(group.installmentAmount)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100">
              <span className="text-[11px] font-bold text-emerald-800 block">
                Total Pendente
              </span>
              <span className="text-lg font-extrabold text-emerald-900 font-mono tracking-tight mt-0.5 block">
                {formatCurrency(pendingTotalAmount)}
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 mt-0.5 block">
                {group.pendingInstallments} {group.pendingInstallments === 1 ? 'parcela restante' : 'parcelas restantes'}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="p-3 rounded-2xl bg-white border border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00D26A]" />
                Progresso: {group.paidInstallments} de {group.totalInstallments} pagas
                {previousPaidCount > 0 && (
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({previousPaidCount} anteriores)
                  </span>
                )}
              </span>
              <span className="font-mono text-[#00D26A] font-extrabold">
                {progressPct}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-[#00D26A] transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-0.5">
              <span>Compra em: {formatDateBR(group.purchaseDate)}</span>
              <span>
                {formatPaymentMethod(group.paymentMethod)} • {group.category}
              </span>
            </div>
          </div>

          {/* Schedule of Installments */}
          <div className="space-y-2">
            <h4 className="text-xs font-extrabold text-slate-800 tracking-tight px-1 flex items-center justify-between">
              <span>Cronograma de Vencimentos</span>
              <span className="text-[11px] font-semibold text-slate-400">
                Toque no botão para confirmar pagamento
              </span>
            </h4>

            <div className="space-y-2">
              {group.installments.map(tx => {
                const dueDate = getTransactionDueDate(tx);
                const status = getTransactionStatus({
                  status: tx.status,
                  due_date: tx.due_date,
                  paid_at: tx.paid_at,
                  installment_group_id: tx.installment_group_id,
                  created_at: tx.created_at,
                });
                const badge = getStatusBadge(status);
                const isPaid = status === 'paid';
                const isBusy = isUpdating === tx.id;

                return (
                  <div
                    key={tx.id}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isPaid
                        ? 'bg-slate-50/70 border-slate-100'
                        : 'bg-white border-slate-200/90 shadow-2xs hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                          isPaid
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {tx.installment_number}ª
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">
                            Parcela {tx.installment_number}/{tx.installment_total}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Vencimento: {formatDateBR(dueDate)}</span>
                          {tx.paid_at && (
                            <span className="text-emerald-600 font-medium">
                              (Paga em {formatDateBR(tx.paid_at)})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-extrabold text-slate-900 font-mono">
                        {formatCurrency(tx.amount)}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleTogglePaid(tx.id)}
                        disabled={isBusy}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          isPaid
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            : 'bg-[#00D26A] text-white hover:bg-[#00C853] shadow-xs active:scale-95'
                        }`}
                        title={isPaid ? 'Marcar como não paga' : 'Confirmar pagamento desta parcela'}
                      >
                        {isBusy ? (
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : isPaid ? (
                          <>
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>Paga</span>
                          </>
                        ) : (
                          <>
                            <span>Pagar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSelectedTxForDelete(null);
              setShowDeleteConfirm(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Excluir Compra</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

