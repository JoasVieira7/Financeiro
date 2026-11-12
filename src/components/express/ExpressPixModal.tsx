import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Utensils,
  Car,
  Gamepad2,
  FileText,
  Delete,
  Trash2,
  Check,
  Building,
  HeartPulse,
  ShoppingBag,
  DollarSign,
  Tag,
  CreditCard,
  Banknote,
  Smartphone,
  Layers,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { TransactionCategory, PaymentMethod, TransactionType, Transaction } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getInstallmentDates } from '../../lib/formatters';
import confetti from 'canvas-confetti';

interface ExpressPixModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction?: Transaction | null;
}

const PRIMARY_CATEGORIES: { name: TransactionCategory; label: string; icon: any }[] = [
  { name: 'Alimentação', label: 'Alimentação', icon: Utensils },
  { name: 'Transporte', label: 'Transporte', icon: Car },
  { name: 'Lazer', label: 'Lazer', icon: Gamepad2 },
  { name: 'Contas', label: 'Contas', icon: FileText },
];

const ALL_CATEGORIES: { name: TransactionCategory; label: string; icon: any }[] = [
  ...PRIMARY_CATEGORIES,
  { name: 'Moradia', label: 'Moradia', icon: Building },
  { name: 'Saúde', label: 'Saúde', icon: HeartPulse },
  { name: 'Compras', label: 'Compras', icon: ShoppingBag },
  { name: 'Salário', label: 'Salário', icon: DollarSign },
  { name: 'Outros', label: 'Outros', icon: Tag },
];

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: any }[] = [
  { id: 'pix', label: 'Pix', icon: Smartphone },
  { id: 'cartao_credito', label: 'Crédito', icon: CreditCard },
  { id: 'cartao_debito', label: 'Débito', icon: CreditCard },
  { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { id: 'outros', label: 'Outros', icon: Tag },
];

export const ExpressPixModal: React.FC<ExpressPixModalProps> = ({
  isOpen,
  onClose,
  editingTransaction,
}) => {
  const { addTransaction, addInstallmentExpense, updateTransaction, deleteTransaction } = useFinance();
  const [amountStr, setAmountStr] = useState<string>('0,00');
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [paymentType, setPaymentType] = useState<'spot' | 'installment'>('spot');
  const [installments, setInstallments] = useState<number>(6);
  const [firstInstallmentDate, setFirstInstallmentDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [applyToAllGroup, setApplyToAllGroup] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<TransactionCategory>('Alimentação');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [description, setDescription] = useState<string>('');
  const [showAllCategories, setShowAllCategories] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setShowDeleteConfirm(false);
      if (editingTransaction) {
        setAmountStr(editingTransaction.amount.toFixed(2).replace('.', ','));
        setSelectedCategory(editingTransaction.category);
        setTxType(editingTransaction.type || 'expense');
        setPaymentMethod(editingTransaction.payment_method || 'pix');
        const rawDesc = (editingTransaction.description || '').trim();
        const isGeneric =
          !rawDesc ||
          rawDesc.toLowerCase() === editingTransaction.category.toLowerCase() ||
          rawDesc.toLowerCase().startsWith(`${editingTransaction.category.toLowerCase()} (`);
        setDescription(isGeneric ? '' : rawDesc);
        if (editingTransaction.installment_group_id) {
          setPaymentType('installment');
          setInstallments(editingTransaction.installment_total || 2);
          setFirstInstallmentDate(editingTransaction.created_at.split('T')[0]);
          setApplyToAllGroup(true);
        } else {
          setPaymentType('spot');
        }
      } else {
        setAmountStr('0,00');
        setSelectedCategory('Alimentação');
        setTxType('expense');
        setPaymentType('spot');
        setInstallments(6);
        setFirstInstallmentDate(new Date().toISOString().split('T')[0]);
        setPaymentMethod('pix');
        setDescription('');
      }
    }
  }, [isOpen, editingTransaction]);

  // Cálculos de parcelamento
  const totalVal = parseFloat(amountStr.replace(',', '.')) || 0;
  const numInstallments = Math.max(2, installments);
  const installmentVal = totalVal > 0 ? totalVal / numInstallments : 0;

  const installmentDates = useMemo(() => {
    try {
      const start = new Date(`${firstInstallmentDate}T12:00:00`);
      if (isNaN(start.getTime())) return [];
      return getInstallmentDates(start, numInstallments);
    } catch {
      return [];
    }
  }, [firstInstallmentDate, numInstallments]);

  const startDateFormatted = installmentDates.length > 0 ? formatDateBR(installmentDates[0]) : '';
  const endDateFormatted =
    installmentDates.length > 0 ? formatDateBR(installmentDates[installmentDates.length - 1]) : '';

  if (!isOpen) return null;

  // Keypad actions
  const handleDigit = (digit: string) => {
    let rawDigits = amountStr.replace(/[^0-9]/g, '');
    if (rawDigits.length >= 8) return; // limit
    rawDigits = rawDigits + digit;
    const num = parseInt(rawDigits, 10) / 100;
    setAmountStr(num.toFixed(2).replace('.', ','));
  };

  const handleBackspace = () => {
    let rawDigits = amountStr.replace(/[^0-9]/g, '');
    if (rawDigits.length <= 1) {
      setAmountStr('0,00');
      return;
    }
    rawDigits = rawDigits.slice(0, -1);
    const num = parseInt(rawDigits, 10) / 100;
    setAmountStr(num.toFixed(2).replace('.', ','));
  };

  const handleSubmit = async () => {
    const val = parseFloat(amountStr.replace(',', '.'));
    if (!val || isNaN(val) || val <= 0) {
      setErrorMessage('Digite um valor maior que R$ 0,00.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const finalDescription = description.trim() || selectedCategory;

      if (editingTransaction) {
        const res = await updateTransaction(
          editingTransaction.id,
          {
            amount: val,
            category: selectedCategory,
            type: txType,
            payment_method: paymentMethod,
            description: finalDescription,
          },
          applyToAllGroup
        );

        if (res.error) {
          setErrorMessage(res.error);
          setIsSubmitting(false);
          return;
        }
      } else if (paymentType === 'installment' && txType === 'expense') {
        confetti({
          particleCount: 35,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#00D26A', '#34D399', '#10B981'],
        });

        const res = await addInstallmentExpense({
          totalAmount: val,
          installments: numInstallments,
          startDate: `${firstInstallmentDate}T12:00:00`,
          category: selectedCategory,
          paymentMethod,
          description: finalDescription,
        });

        if (res.error) {
          setErrorMessage(res.error);
          setIsSubmitting(false);
          return;
        }
      } else {
        confetti({
          particleCount: 35,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#00D26A', '#34D399', '#10B981'],
        });

        const res = await addTransaction(
          val,
          selectedCategory,
          paymentMethod,
          finalDescription,
          txType
        );

        if (res.error) {
          setErrorMessage(res.error);
          setIsSubmitting(false);
          return;
        }
      }

      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 200);
    } catch (e: any) {
      setIsSubmitting(false);
      setErrorMessage(e.message || 'Erro ao processar lançamento.');
    }
  };

  const handleDelete = async (deleteAllGroup: boolean = false) => {
    if (!editingTransaction) return;
    await deleteTransaction(editingTransaction.id, deleteAllGroup);
    onClose();
  };

  const visibleCategories = showAllCategories ? ALL_CATEGORIES : PRIMARY_CATEGORIES;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-elevated border border-slate-100 animate-slide-up sm:animate-scale-in max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
            {editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento'}
          </h3>

          {editingTransaction ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              title="Excluir"
              className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>

        {/* Delete Confirmation Alert */}
        {showDeleteConfirm && (
          <div className="mt-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold space-y-3 animate-scale-in">
            {editingTransaction?.installment_group_id ? (
              <>
                <div className="flex items-center gap-2 text-rose-700 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Excluir Compra Parcelada</span>
                </div>
                <p className="text-slate-700 text-xs leading-relaxed">
                  Esta transação faz parte de uma compra parcelada em{' '}
                  <strong className="text-slate-900">{editingTransaction.installment_total}x</strong>{' '}
                  (parcela atual:{' '}
                  <strong className="text-slate-900">
                    {editingTransaction.installment_number}/{editingTransaction.installment_total}
                  </strong>
                  ). Como deseja proceder?
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDelete(false)}
                    className="w-full py-2.5 px-3 rounded-xl bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 font-bold text-center transition-colors cursor-pointer"
                  >
                    Excluir apenas esta parcela ({editingTransaction.installment_number}/
                    {editingTransaction.installment_total})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-center transition-colors cursor-pointer"
                  >
                    Excluir todas as {editingTransaction.installment_total} parcelas da compra
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold text-center transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Deseja realmente excluir este lançamento permanentemente?</p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-rose-200 text-slate-700 font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(false)}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold"
                  >
                    Confirmar Exclusão
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Informações da Parcela em Modo de Edição */}
        {editingTransaction?.installment_group_id && (
          <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#00D26A]" />
                Parcela {editingTransaction.installment_number} de{' '}
                {editingTransaction.installment_total}
              </span>
              {editingTransaction.installment_purchase_amount && (
                <span className="font-mono text-slate-500 font-semibold text-[11px]">
                  Total: {formatCurrency(editingTransaction.installment_purchase_amount)}
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-slate-600 pt-1.5 border-t border-slate-200/80">
              <input
                type="checkbox"
                checked={applyToAllGroup}
                onChange={e => setApplyToAllGroup(e.target.checked)}
                className="rounded accent-[#00D26A] cursor-pointer"
              />
              <span className="text-[11px] font-medium leading-tight">
                Sincronizar categoria e estabelecimento em todas as{' '}
                {editingTransaction.installment_total} parcelas
              </span>
            </label>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold text-center">
            {errorMessage}
          </div>
        )}

        {/* Income / Expense Switcher Pill */}
        <div className="flex items-center justify-center gap-2 mt-3">
          <div className="p-1 rounded-full bg-slate-100 border border-slate-200/60 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTxType('expense')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                txType === 'expense'
                  ? 'bg-white text-slate-900 shadow-subtle'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => {
                setTxType('income');
                setPaymentType('spot');
                if (selectedCategory === 'Alimentação') setSelectedCategory('Salário');
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                txType === 'income'
                  ? 'bg-emerald-600 text-white shadow-subtle'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Receita
            </button>
          </div>
        </div>

        {/* Seletor: À Vista / Parcelado (Apenas para despesas novas) */}
        {txType === 'expense' && !editingTransaction && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="p-0.5 rounded-full bg-slate-100/90 border border-slate-200/60 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPaymentType('spot')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  paymentType === 'spot'
                    ? 'bg-white text-slate-900 shadow-subtle'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Compra à vista
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentType('installment');
                  if (paymentMethod === 'pix') setPaymentMethod('cartao_credito');
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  paymentType === 'installment'
                    ? 'bg-emerald-600 text-white shadow-subtle'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Compra parcelada
              </button>
            </div>
          </div>
        )}

        {/* Display: Valor */}
        <div className="text-center mt-3 mb-2">
          <span className="text-xs font-medium text-slate-400 block">
            {txType === 'income'
              ? 'Valor da receita'
              : paymentType === 'installment' && !editingTransaction
              ? 'Valor total da compra'
              : editingTransaction?.installment_group_id
              ? `Valor desta parcela (${editingTransaction.installment_number}/${editingTransaction.installment_total})`
              : 'Valor do gasto'}
          </span>
          <div className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mt-1 tnum flex items-center justify-center gap-1.5">
            <span className={txType === 'income' ? 'text-emerald-600' : 'text-slate-400'}>R$</span>
            <span>{amountStr}</span>
          </div>
          {paymentType === 'installment' && !editingTransaction && totalVal > 0 && (
            <span className="text-xs font-semibold text-emerald-600 mt-1 block tnum">
              {numInstallments}x de {formatCurrency(installmentVal)}
            </span>
          )}
        </div>

        {/* Configuração de Parcelamento (Aparece somente quando "Parcelado") */}
        {paymentType === 'installment' && txType === 'expense' && !editingTransaction && (
          <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            {/* Número de parcelas */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  Número de parcelas
                </label>
                <span className="text-xs font-bold text-emerald-600 tnum">
                  {numInstallments}x de {formatCurrency(installmentVal)}
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {[2, 3, 4, 5, 6, 10, 12].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setInstallments(n)}
                    className={`py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      installments === n
                        ? 'bg-emerald-600 text-white shadow-subtle'
                        : 'bg-white border border-slate-200/70 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            </div>

            {/* Data da 1ª Parcela */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/70">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                1ª parcela:
              </label>
              <input
                type="date"
                value={firstInstallmentDate}
                onChange={e => setFirstInstallmentDate(e.target.value)}
                className="text-base sm:text-xs font-medium px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            {/* Resumo do Parcelamento */}
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 tnum">
                  {numInstallments}x de {formatCurrency(installmentVal)}
                </span>
                <span className="text-[11px] font-semibold text-slate-500 tnum">
                  Total: {formatCurrency(totalVal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-0.5">
                <span>Início: {startDateFormatted || '—'}</span>
                <span>Término: {endDateFormatted || '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Payment Method Selector */}
        <div className="flex items-center justify-center gap-1.5 overflow-x-auto pb-1 mt-2">
          {PAYMENT_METHODS.map(pm => {
            const Icon = pm.icon;
            const isSelected = paymentMethod === pm.id;
            return (
              <button
                key={pm.id}
                type="button"
                onClick={() => setPaymentMethod(pm.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-subtle'
                    : 'bg-white border-slate-200/70 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{pm.label}</span>
              </button>
            );
          })}
        </div>

        {/* Campo Opcional: Estabelecimento / Detalhe */}
        <div className="mt-3">
          <div className="relative flex items-center">
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Estabelecimento ou detalhe (ex: Atacadão, Uber, Padaria)"
              className="w-full h-11 px-3.5 text-base sm:text-xs font-medium text-slate-800 placeholder:text-slate-400 bg-slate-50/60 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition-all shadow-subtle"
              maxLength={60}
            />
            {description && (
              <button
                type="button"
                onClick={() => setDescription('')}
                className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer transition-colors"
                title="Limpar campo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Section: Selecione a Categoria */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 block text-center w-full">
              Selecione a categoria
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {visibleCategories.map(cat => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.name;

              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-subtle scale-[1.01]'
                      : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200/50 text-slate-700'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
                  <span className="text-xs font-medium">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Toggle more categories */}
          <div className="text-center mt-2">
            <button
              type="button"
              onClick={() => setShowAllCategories(!showAllCategories)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              {showAllCategories ? 'Mostrar menos categorias' : '+ Ver mais categorias'}
            </button>
          </div>
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-lg font-semibold text-slate-900 border border-slate-200/50 shadow-subtle flex items-center justify-center transition-colors cursor-pointer"
            >
              {d}
            </button>
          ))}

          <button
            type="button"
            onClick={() => handleDigit('00')}
            className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-sm font-semibold text-slate-700 border border-slate-200/50 shadow-subtle flex items-center justify-center transition-colors cursor-pointer"
          >
            00
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-lg font-semibold text-slate-900 border border-slate-200/50 shadow-subtle flex items-center justify-center transition-colors cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Apagar dígito"
            className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-200/50 shadow-subtle flex items-center justify-center transition-colors cursor-pointer"
          >
            <Delete className="w-4.5 h-4.5 stroke-[2]" />
          </button>
        </div>

        {/* Bottom Big Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-button-green hover:shadow-button-hover transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>
              {editingTransaction
                ? 'Salvar alterações'
                : txType === 'income'
                ? 'Registrar receita'
                : paymentType === 'installment'
                ? `Registrar compra (${numInstallments}x de ${formatCurrency(installmentVal)})`
                : 'Registrar movimentação'}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
