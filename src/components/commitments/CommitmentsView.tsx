import React, { useState } from 'react';
import { useFinance } from '../../context/FinanceContext';
import {
  formatCurrency,
  formatDateBR,
  getTransactionDueDate,
  getTransactionStatus,
  getStatusBadge,
  formatPaymentMethod,
} from '../../lib/formatters';
import {
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  Check,
  Inbox,
  ArrowRight,
  FileSpreadsheet,
} from 'lucide-react';
import { Transaction } from '../../types';
import { InstallmentDetailModal } from '../transactions/InstallmentDetailModal';
import { ImportSpreadsheetModal } from '../transactions/ImportSpreadsheetModal';

interface CommitmentsViewProps {
  onBack?: () => void;
  onNewExpense?: () => void;
}

export const CommitmentsView: React.FC<CommitmentsViewProps> = ({
  onBack,
  onNewExpense,
}) => {
  const { futureCommitments, toggleInstallmentPaid } = useFinance();
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(0);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const months = futureCommitments.monthlyForecast;
  const currentMonthData = months[selectedMonthIndex] || months[0];

  const handleTogglePaid = async (txId: string) => {
    setIsUpdating(txId);
    try {
      await toggleInstallmentPaid(txId);
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        {onBack ? (
          <button
            onClick={onBack}
            type="button"
            aria-label="Voltar"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-9" />
        )}

        <div className="text-center">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Compromissos Futuros
          </h2>
          <p className="text-[11px] font-semibold text-slate-400">
            Inteligência financeira para os próximos 12 meses
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsImportModalOpen(true)}
          className="w-9 h-9 rounded-full bg-emerald-50 text-[#00D26A] hover:bg-emerald-100 flex items-center justify-center transition-colors cursor-pointer"
          title="Importar faturas PDF ou planilhas Excel/CSV"
        >
          <FileSpreadsheet className="w-5 h-5 stroke-[2.2]" />
        </button>
      </div>

      {/* Top 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-2xl bg-white border border-slate-100 shadow-card flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total em Parcelas
          </span>
          <span className="text-sm sm:text-base font-extrabold text-slate-900 font-mono tracking-tight mt-1 block">
            {formatCurrency(futureCommitments.totalCommittedInInstallments)}
          </span>
          <span className="text-[10px] font-semibold text-slate-400 mt-1 block truncate">
            {futureCommitments.activePurchasesCount}{' '}
            {futureCommitments.activePurchasesCount === 1 ? 'compra ativa' : 'compras ativas'}
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-slate-100 shadow-card flex flex-col justify-between">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
            Total Pendente
          </span>
          <span className="text-sm sm:text-base font-extrabold text-amber-600 font-mono tracking-tight mt-1 block">
            {formatCurrency(futureCommitments.totalPendingPayment)}
          </span>
          <span className="text-[10px] font-semibold text-slate-400 mt-1 block truncate">
            a pagar no futuro
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-slate-100 shadow-card flex flex-col justify-between">
          <span className="text-[10px] font-bold text-[#00D26A] uppercase tracking-wider block">
            Parcelas a Vencer
          </span>
          <span className="text-sm sm:text-base font-extrabold text-[#00D26A] font-mono tracking-tight mt-1 block">
            {futureCommitments.remainingInstallmentsCount}
          </span>
          <span className="text-[10px] font-semibold text-slate-400 mt-1 block truncate">
            nos próx. 12 meses
          </span>
        </div>
      </div>

      {/* 12 Months Horizontal Navigator */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-700">Previsão por Mês</span>
          <span className="text-[11px] font-semibold text-slate-400">
            Próximos 12 meses
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {months.map((m, idx) => {
            const isSelected = selectedMonthIndex === idx;
            const shortLabel = new Intl.DateTimeFormat('pt-BR', {
              month: 'short',
              year: '2-digit',
            }).format(new Date(m.year, m.monthIndex, 1));

            return (
              <button
                key={m.monthKey}
                type="button"
                onClick={() => setSelectedMonthIndex(idx)}
                className={`px-3 py-2 rounded-2xl transition-all cursor-pointer shrink-0 text-left flex flex-col min-w-[84px] ${
                  isSelected
                    ? 'bg-[#00D26A] text-white shadow-button-green scale-[1.02]'
                    : 'bg-white border border-slate-200/90 text-slate-700 hover:border-slate-300'
                }`}
              >
                <span
                  className={`text-[11px] font-extrabold capitalize ${
                    isSelected ? 'text-white' : 'text-slate-800'
                  }`}
                >
                  {shortLabel}
                </span>
                <span
                  className={`text-[11px] font-extrabold font-mono mt-0.5 ${
                    isSelected ? 'text-white' : m.totalPending > 0 ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {formatCurrency(m.totalCommitted)}
                </span>
                {m.installmentsCount > 0 && (
                  <span
                    className={`text-[9px] font-semibold mt-0.5 ${
                      isSelected ? 'text-emerald-100' : 'text-slate-400'
                    }`}
                  >
                    {m.installmentsCount} {m.installmentsCount === 1 ? 'parc.' : 'parc.'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Month Financial Summary Card */}
      {currentMonthData && (
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-card space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Resumo do Período
              </span>
              <h3 className="text-base font-extrabold text-slate-900 capitalize tracking-tight">
                {currentMonthData.monthLabel}
              </h3>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Previsão de Gastos
              </span>
              <span className="text-lg font-extrabold text-slate-900 font-mono tracking-tight block">
                {formatCurrency(currentMonthData.totalCommitted)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
            <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
              <span className="font-semibold text-emerald-800">Já Pago:</span>
              <span className="font-extrabold font-mono text-emerald-900">
                {formatCurrency(currentMonthData.totalPaid)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 flex items-center justify-between">
              <span className="font-semibold text-amber-800">A Pagar:</span>
              <span className="font-extrabold font-mono text-amber-900">
                {formatCurrency(currentMonthData.totalPending)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* List of Commitments in Selected Month */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-extrabold text-slate-900 tracking-tight">
            Parcelas e Vencimentos ({currentMonthData?.transactions.length || 0})
          </h4>
          <span className="text-[11px] font-semibold text-slate-400">
            Toque na compra para ver o plano completo
          </span>
        </div>

        {!currentMonthData || currentMonthData.transactions.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center shadow-card">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#00D26A] flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 stroke-[2]" />
            </div>
            <h5 className="text-sm font-bold text-slate-800">
              Nenhum compromisso parcelado neste mês
            </h5>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Você não possui parcelas previstas para {currentMonthData?.monthLabel}.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {currentMonthData.transactions.map(tx => {
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
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isPaid
                      ? 'bg-slate-50/70 border-slate-100'
                      : 'bg-white border-slate-200 shadow-card hover:border-emerald-200'
                  }`}
                >
                  <div
                    onClick={() => tx.installment_group_id && setSelectedGroupId(tx.installment_group_id)}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-extrabold text-xs shrink-0 ${
                        isPaid
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {tx.installment_number}/{tx.installment_total}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h5 className="text-sm font-bold text-slate-900 truncate">
                          {tx.description}
                        </h5>
                        <span
                          className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                        <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>Vencimento: {formatDateBR(dueDate)}</span>
                        <span>•</span>
                        <span>{formatPaymentMethod(tx.payment_method)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <span className="text-sm font-extrabold block font-mono text-slate-900">
                        {formatCurrency(tx.amount)}
                      </span>
                      {tx.installment_purchase_amount && (
                        <span className="text-[10px] font-semibold text-slate-400 block font-mono">
                          Total: {formatCurrency(tx.installment_purchase_amount)}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTogglePaid(tx.id)}
                      disabled={isBusy}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        isPaid
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-[#00D26A] text-white hover:bg-[#00C853] shadow-xs active:scale-95'
                      }`}
                      title={isPaid ? 'Desmarcar parcela' : 'Confirmar pagamento desta parcela'}
                    >
                      {isBusy ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : isPaid ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
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
        )}
      </div>

      {/* Modal de Detalhes da Compra */}
      <InstallmentDetailModal
        isOpen={Boolean(selectedGroupId)}
        groupId={selectedGroupId}
        onClose={() => setSelectedGroupId(null)}
      />

      {/* Modal de Importação de Planilhas Excel / CSV */}
      <ImportSpreadsheetModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
};

