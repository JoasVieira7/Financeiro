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
      status === 'paid' ? 'Paga' : status === 'overdue' ? 'Vencida' : 'Pendente',
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

  // Se o usuário selecionou o modo "Compromissos Futuros"
  if (viewMode === 'commitments') {
    return (
      <div className="space-y-4">
        {/* Toggle Switcher Header */}
        <div className="flex items-center justify-center p-1 rounded-full bg-slate-100 max-w-xs mx-auto mb-2">
          <button
            type="button"
            onClick={() => setViewMode('history')}
            className="flex-1 py-1.5 rounded-full text-xs font-bold text-slate-500 hover:text-slate-900 transition-all cursor-pointer"
          >
            Histórico Financeiro
          </button>
          <button
            type="button"
            onClick={() => setViewMode('commitments')}
            className="flex-1 py-1.5 rounded-full text-xs font-bold bg-white text-slate-900 shadow-xs transition-all cursor-pointer"
          >
            Compromissos Futuros
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
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-9" />
        )}

        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Histórico Financeiro
        </h2>

        {onNewTransaction ? (
          <button
            onClick={onNewTransaction}
            type="button"
            title="Adicionar Despesa ou Receita"
            className="w-9 h-9 rounded-full bg-emerald-50 text-[#00D26A] hover:bg-emerald-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {/* View Switcher Pill: Histórico vs Compromissos Futuros */}
      <div className="flex items-center justify-center p-1 rounded-full bg-slate-100 max-w-xs mx-auto">
        <button
          type="button"
          onClick={() => setViewMode('history')}
          className="flex-1 py-1.5 rounded-full text-xs font-bold bg-white text-slate-900 shadow-xs transition-all cursor-pointer"
        >
          Histórico Financeiro
        </button>
        <button
          type="button"
          onClick={() => setViewMode('commitments')}
          className="flex-1 py-1.5 rounded-full text-xs font-bold text-slate-500 hover:text-slate-900 transition-all cursor-pointer"
        >
          Compromissos Futuros
        </button>
      </div>

      {/* Navegador de Mês e Ano de Consulta (Etapa 33) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Mês anterior"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4 text-[#00D26A]" />
              <h3 className="text-sm font-extrabold text-slate-900 capitalize">
                {capitalizedMonthLabel}
              </h3>
            </div>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={handleCurrentMonth}
                className="text-[11px] font-bold text-[#00D26A] hover:underline mt-0.5 cursor-pointer block mx-auto"
              >
                Voltar para o mês atual
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Próximo mês"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Resumo Contábil do Mês Selecionado */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 text-center">
          <div className="p-2 rounded-xl bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 block uppercase">
              Receitas
            </span>
            <span className="text-xs font-mono font-extrabold text-[#00D26A] block mt-0.5">
              +{formatCurrency(monthSummary.income)}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 block uppercase">
              Despesas
            </span>
            <span className="text-xs font-mono font-extrabold text-rose-600 block mt-0.5">
              -{formatCurrency(monthSummary.expense)}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 block uppercase">
              Saldo
            </span>
            <span
              className={`text-xs font-mono font-extrabold block mt-0.5 ${
                monthSummary.balance >= 0 ? 'text-slate-900' : 'text-rose-600'
              }`}
            >
              {formatCurrency(monthSummary.balance)}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Pills (Sem pílula 'Semana') */}
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
          <span>Mês Selecionado ({monthSummary.count})</span>
        </button>

        <button
          onClick={() => setActiveFilter('expense')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeFilter === 'expense'
              ? 'bg-white border-2 border-slate-900 text-slate-900 shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Despesas
        </button>

        <button
          onClick={() => setActiveFilter('income')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeFilter === 'income'
              ? 'bg-white border-2 border-slate-900 text-slate-900 shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Receitas
        </button>

        <button
          onClick={() => setActiveFilter('credit')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeFilter === 'credit'
              ? 'bg-white border-2 border-slate-900 text-slate-900 shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Faturas / Cartão ({monthSummary.creditPurchases})</span>
        </button>

        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-white border-2 border-slate-900 text-slate-900 shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Todo o Histórico
        </button>
      </div>

      {/* Subheader: Contador, Importar e Exportar Planilha */}
      <div className="flex items-center justify-between px-1 gap-2">
        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          {filteredList.length} {filteredList.length === 1 ? 'lançamento' : 'lançamentos'}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[#00A855] text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
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
        <div className="bg-white rounded-3xl p-8 border border-slate-100 text-center shadow-card mt-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">
            Nenhum lançamento no período
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Utilize o botão "Adicionar Despesa" ou "Adicionar Receita" para registrar seu primeiro lançamento.
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
                  const display = getTransactionDisplay(tx);
                  const {
                    icon: Icon,
                    bg,
                    color,
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
                      className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card flex items-center justify-between cursor-pointer hover:border-slate-200 transition-all active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 shadow-sm`}
                        >
                          <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="text-sm font-bold text-slate-900 truncate">
                              {display.title}
                            </h5>
                            {display.installmentBadge && (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-extrabold font-mono shrink-0">
                                {display.installmentBadge}
                              </span>
                            )}
                            {display.statusBadge && (
                              <span
                                className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold border ${display.statusBadge.bg} ${display.statusBadge.text} ${display.statusBadge.border}`}
                              >
                                {display.statusBadge.label}
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
