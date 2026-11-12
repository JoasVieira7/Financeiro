import React, { useState, useMemo } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import {
  formatCurrency,
  getTransactionDisplay,
  getTransactionDueDate,
  getTransactionStatus,
  getStatusBadge,
} from '../../lib/formatters';
import { PlanComparisonModal } from '../profile/PaymentModal';
import { InstallmentDetailModal } from './InstallmentDetailModal';
import { ImportSpreadsheetModal } from './ImportSpreadsheetModal';
import { CommitmentsView } from '../commitments/CommitmentsView';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
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
  Plus,
  Inbox,
  Download,
  Lock,
  Layers,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';
import { Transaction } from '../../types';

interface TransactionsViewProps {
  onBack?: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  onNewTransaction?: () => void;
}

export function exportTransactionsToCSV(transactions: Transaction[]): void {
  const headers = [
    'Data da Compra',
    'Vencimento',
    'Data de Pagamento',
    'Situacao',
    'Tipo',
    'Categoria',
    'Descricao',
    'Metodo de Pagamento',
    'Parcela',
    'Valor (R$)',
  ];

  const rows = transactions.map(t => {
    const dPurchase = new Date(t.purchase_date || t.created_at);
    const dDue = getTransactionDueDate(t);
    const dPaid = t.paid_at ? new Date(t.paid_at).toLocaleDateString('pt-BR') : 'Pendente';
    const status = getTransactionStatus({
      status: t.status,
      due_date: t.due_date,
      paid_at: t.paid_at,
      installment_group_id: t.installment_group_id,
      created_at: t.created_at,
    });

    const typeStr = t.type === 'income' ? 'Receita' : 'Despesa';
    const parcelStr =
      t.installment_number && t.installment_total
        ? `${t.installment_number}/${t.installment_total}`
        : 'À vista';
    const amountStr = t.amount.toFixed(2).replace('.', ',');

    return [
      dPurchase.toLocaleDateString('pt-BR'),
      dDue.toLocaleDateString('pt-BR'),
      dPaid,
      status === 'paid' ? 'Paga' : status === 'overdue' ? 'Vencida' : status === 'unknown' ? 'A revisar' : 'Pendente',
      typeStr,
      `"${t.category.replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.payment_method || 'pix',
      parcelStr,
      amountStr,
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico-financeiro-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  onBack,
  onEditTransaction,
  onNewTransaction,
}) => {
  const { transactions } = useFinance();
  const { profile } = useAuth();
  const [viewMode, setViewMode] = useState<'history' | 'commitments'>('history');
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0 a 11
  const [activeFilter, setActiveFilter] = useState<'month' | 'income' | 'expense' | 'credit' | 'all'>('month');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const isPremium = profile?.plan_tier === 'premium';

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
  };

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  const selectedDate = new Date(selectedYear, selectedMonth, 1);
  const selectedMonthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(selectedDate);
  const capitalizedMonthLabel = selectedMonthLabel.charAt(0).toUpperCase() + selectedMonthLabel.slice(1);

  // Totais do mês selecionado (Etapa 33)
  const monthSummary = useMemo(() => {
    const monthTxs = transactions.filter(tx => {
      const d = (tx.installment_group_id || tx.due_date) ? getTransactionDueDate(tx) : new Date(tx.created_at);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    const income = monthTxs
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const expense = monthTxs
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const creditPurchases = monthTxs.filter(t => Boolean(t.installment_group_id || t.payment_method === 'cartao_credito')).length;

    return {
      income,
      expense,
      balance: income - expense,
      count: monthTxs.length,
      creditPurchases,
    };
  }, [transactions, selectedMonth, selectedYear]);

  // Transações filtradas respeitando data contábil de vencimento para faturas e parcelas
  const filteredList = useMemo(() => {
    return transactions.filter(tx => {
      // Data contábil: fatura e compras parceladas usam due_date; compras comuns usam created_at
      const d = (tx.installment_group_id || tx.due_date) ? getTransactionDueDate(tx) : new Date(tx.created_at);
      const matchesMonth = d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;

      if (activeFilter === 'month') {
        return matchesMonth;
      }
      if (activeFilter === 'income') {
        return matchesMonth && tx.type === 'income';
      }
      if (activeFilter === 'expense') {
        return matchesMonth && tx.type === 'expense';
      }
      if (activeFilter === 'credit') {
        return matchesMonth && Boolean(tx.installment_group_id || tx.payment_method === 'cartao_credito');
      }
      if (activeFilter === 'all') {
        return true;
      }
      return true;
    });
  }, [transactions, activeFilter, selectedMonth, selectedYear]);

  // Agrupamento por data (PT-BR)
  const grouped = useMemo(() => {
    const groups: { label: string; items: Transaction[] }[] = [];
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const map: Record<string, Transaction[]> = {};

    filteredList.forEach(tx => {
      const d = (tx.installment_group_id || tx.due_date) ? getTransactionDueDate(tx) : new Date(tx.created_at);
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

  const getItemVisuals = (description: string, category: string, isIncome: boolean) => {
    const desc = description.toLowerCase();
    if (isIncome) {
      if (desc.includes('venda') || desc.includes('comércio')) {
        return { icon: Store, bg: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
      }
      return { icon: Wallet, bg: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
    }
    if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('cinema') || category === 'Lazer') {
      return { icon: Play, bg: 'bg-rose-50 text-rose-600 border-rose-100' };
    }
    if (category === 'Transporte' || desc.includes('uber') || desc.includes('combustível')) {
      return { icon: Car, bg: 'bg-blue-50 text-blue-600 border-blue-100' };
    }
    if (category === 'Contas' || desc.includes('mercado') || desc.includes('supermercado')) {
      return { icon: ShoppingCart, bg: 'bg-purple-50 text-purple-600 border-purple-100' };
    }
    if (category === 'Moradia') {
      return { icon: Building, bg: 'bg-indigo-50 text-indigo-600 border-indigo-100' };
    }
    if (category === 'Saúde') {
      return { icon: HeartPulse, bg: 'bg-rose-50 text-rose-600 border-rose-100' };
    }
    if (category === 'Alimentação') {
      return { icon: Utensils, bg: 'bg-amber-50 text-amber-600 border-amber-100' };
    }
    return { icon: Tag, bg: 'bg-slate-50 text-slate-600 border-slate-200/60' };
  };

  // Se o usuário selecionou o modo "Compromissos Futuros"
  if (viewMode === 'commitments') {
    return (
      <div className="space-y-4">
        {/* Toggle Switcher Header */}
        <div className="flex items-center justify-center p-1 rounded-full bg-slate-100 border border-slate-200/60 max-w-xs mx-auto mb-2">
          <button
            type="button"
            onClick={() => setViewMode('history')}
            className="flex-1 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-900 transition-all cursor-pointer"
          >
            Extrato Geral
          </button>
          <button
            type="button"
            onClick={() => setViewMode('commitments')}
            className="flex-1 py-1.5 rounded-full text-xs font-semibold bg-white text-slate-900 shadow-subtle transition-all cursor-pointer"
          >
            Compromissos
          </button>
        </div>

        <CommitmentsView onBack={() => setViewMode('history')} onNewExpense={onNewTransaction} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-1">
        {onBack ? (
          <button
            onClick={onBack}
            type="button"
            aria-label="Voltar"
            className="w-8 h-8 rounded-full bg-white border border-slate-200/70 shadow-subtle text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-8" />
        )}

        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          Extrato Financeiro
        </h2>

        {onNewTransaction ? (
          <button
            onClick={onNewTransaction}
            type="button"
            title="Adicionar Despesa ou Receita"
            className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200/60 flex items-center justify-center transition-colors cursor-pointer shadow-subtle"
          >
            <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
          </button>
        ) : (
          <div className="w-8" />
        )}
      </div>

      {/* View Switcher Pill: Histórico vs Compromissos Futuros */}
      <div className="flex items-center justify-center p-1 rounded-full bg-slate-100 border border-slate-200/60 max-w-xs mx-auto">
        <button
          type="button"
          onClick={() => setViewMode('history')}
          className="flex-1 py-1.5 rounded-full text-xs font-semibold bg-white text-slate-900 shadow-subtle transition-all cursor-pointer"
        >
          Extrato Geral
        </button>
        <button
          type="button"
          onClick={() => setViewMode('commitments')}
          className="flex-1 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:text-slate-900 transition-all cursor-pointer"
        >
          Compromissos
        </button>
      </div>

      {/* Navegador de Mês e Ano de Consulta */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 border border-slate-200/60 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Mês anterior"
            className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/50 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 capitalize">
                {capitalizedMonthLabel}
              </h3>
            </div>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={handleCurrentMonth}
                className="text-[11px] font-semibold text-emerald-600 hover:underline mt-0.5 cursor-pointer block mx-auto"
              >
                Voltar para o mês atual
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Próximo mês"
            className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/50 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Resumo Contábil do Mês Selecionado */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
          <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
              Receitas
            </span>
            <span className="text-xs font-bold text-emerald-600 block mt-0.5 tnum">
              +{formatCurrency(monthSummary.income)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
              Despesas
            </span>
            <span className="text-xs font-bold text-rose-600 block mt-0.5 tnum">
              -{formatCurrency(monthSummary.expense)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
              Saldo
            </span>
            <span
              className={`text-xs font-bold block mt-0.5 tnum ${
                monthSummary.balance >= 0 ? 'text-slate-900' : 'text-rose-600'
              }`}
            >
              {formatCurrency(monthSummary.balance)}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveFilter('month')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer border ${
            activeFilter === 'month'
              ? 'bg-slate-900 border-slate-900 text-white shadow-subtle'
              : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {activeFilter === 'month' && <Check className="w-3 h-3 stroke-[3]" />}
          <span>Mês ({monthSummary.count})</span>
        </button>

        <button
          onClick={() => setActiveFilter('expense')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer border ${
            activeFilter === 'expense'
              ? 'bg-slate-900 border-slate-900 text-white shadow-subtle'
              : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Despesas
        </button>

        <button
          onClick={() => setActiveFilter('income')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer border ${
            activeFilter === 'income'
              ? 'bg-slate-900 border-slate-900 text-white shadow-subtle'
              : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Receitas
        </button>

        <button
          onClick={() => setActiveFilter('credit')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer border ${
            activeFilter === 'credit'
              ? 'bg-slate-900 border-slate-900 text-white shadow-subtle'
              : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Cartão ({monthSummary.creditPurchases})</span>
        </button>

        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer border ${
            activeFilter === 'all'
              ? 'bg-slate-900 border-slate-900 text-white shadow-subtle'
              : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Histórico Geral
        </button>
      </div>

      {/* Subheader: Contador, Importar e Exportar Planilha */}
      <div className="flex items-center justify-between px-1 gap-2">
        <span className="text-xs font-medium text-slate-400 whitespace-nowrap tnum">
          {filteredList.length} {filteredList.length === 1 ? 'registro' : 'registros'}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/70 text-emerald-700 text-xs font-semibold transition-all shadow-subtle cursor-pointer active:scale-95"
            title="Importar faturas PDF ou planilhas Excel/CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Importar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isPremium) {
                setIsPlanModalOpen(true);
              } else {
                exportTransactionsToCSV(filteredList);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-semibold transition-all shadow-subtle cursor-pointer active:scale-95"
            title={isPremium ? 'Baixar planilha CSV' : 'Recurso Premium: Exportação CSV'}
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Exportar</span>
            {!isPremium && <Lock className="w-3 h-3 text-amber-500" />}
          </button>
        </div>
      </div>

      {/* Date Groups */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-slate-200/60 text-center shadow-card mt-2">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 border border-slate-100 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-800">
            Nenhum lançamento no período
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Utilize o botão de registrar movimentação para criar seu primeiro lançamento.
          </p>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {grouped.map(grp => (
            <div key={grp.label} className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                {grp.label}
              </h4>

              <div className="space-y-2">
                {grp.items.map(tx => {
                  const isIncome = tx.type === 'income';
                  const display = getTransactionDisplay(tx);
                  const {
                    icon: Icon,
                    bg,
                  } = getItemVisuals(tx.description, tx.category, isIncome);

                  const handleClick = () => {
                    if (tx.installment_group_id) {
                      setSelectedGroupId(tx.installment_group_id);
                    } else if (onEditTransaction) {
                      onEditTransaction(tx);
                    }
                  };

                  return (
                    <div
                      key={tx.id}
                      onClick={handleClick}
                      className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/60 shadow-card flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-card-hover transition-all active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl ${bg} border flex items-center justify-center shrink-0 shadow-subtle`}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="text-sm font-semibold text-slate-900 truncate">
                              {display.title}
                            </h5>
                            {display.installmentBadge && (
                              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium tnum shrink-0">
                                {display.installmentBadge}
                              </span>
                            )}
                            {display.statusBadge && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${display.statusBadge.bg} ${display.statusBadge.text} ${display.statusBadge.border}`}
                              >
                                {display.statusBadge.label}
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
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Detalhes da Compra Parcelada */}
      <InstallmentDetailModal
        isOpen={Boolean(selectedGroupId)}
        groupId={selectedGroupId}
        onClose={() => setSelectedGroupId(null)}
        onEditTransaction={onEditTransaction}
      />

      {/* Modal de Importação de Planilhas Excel / CSV */}
      <ImportSpreadsheetModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Modal de Apresentação dos Planos (Exportação CSV) */}
      <PlanComparisonModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        highlightedFeature="Exportação CSV"
        featureDescription="Exporte todo o seu histórico financeiro detalhado em formato de planilha CSV compatível com Microsoft Excel e Google Planilhas."
      />
    </div>
  );
};
