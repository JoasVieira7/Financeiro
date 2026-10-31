import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { TransactionCategory, PaymentMethod, TransactionType, Transaction } from '../../types';
import { useFinance } from '../../context/FinanceContext';
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
  const { addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const [amountStr, setAmountStr] = useState<string>('0,00');
  const [txType, setTxType] = useState<TransactionType>('expense');
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
      } else {
        setAmountStr('0,00');
        setSelectedCategory('Alimentação');
        setTxType('expense');
        setPaymentMethod('pix');
        setDescription('');
      }
    }
  }, [isOpen, editingTransaction]);

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
        const res = await updateTransaction(editingTransaction.id, {
          amount: val,
          category: selectedCategory,
          type: txType,
          payment_method: paymentMethod,
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

  const handleDelete = async () => {
    if (!editingTransaction) return;
    await deleteTransaction(editingTransaction.id);
    onClose();
  };

  const visibleCategories = showAllCategories ? ALL_CATEGORIES : PRIMARY_CATEGORIES;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-t-[36px] sm:rounded-[36px] p-5 sm:p-6 shadow-2xl animate-slide-up sm:animate-scale-in max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <button
            onClick={onClose}
            type="button"
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
            {editingTransaction ? 'Editar Lançamento' : 'Lançamento Express'}
          </h3>

          {editingTransaction ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              title="Excluir"
              className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>

        {/* Delete Confirmation Alert */}
        {showDeleteConfirm && (
          <div className="mt-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold space-y-2 animate-scale-in">
            <p>Deseja realmente excluir este lançamento permanentemente?</p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-xl bg-white border border-rose-200 text-slate-700 font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold"
              >
                Confirmar Exclusão
              </button>
            </div>
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
          <div className="p-1 rounded-full bg-slate-100 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTxType('expense')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                txType === 'expense'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => {
                setTxType('income');
                if (selectedCategory === 'Alimentação') setSelectedCategory('Salário');
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                txType === 'income'
                  ? 'bg-[#00D26A] text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Receita
            </button>
          </div>
        </div>

        {/* Display: Valor (Matching Image 4) */}
        <div className="text-center mt-3 mb-2">
          <span className="text-xs font-semibold text-slate-400 block">
            {txType === 'income' ? 'Valor da Receita' : 'Valor do Pix / Gasto'}
          </span>
          <div className="text-4xl font-extrabold text-slate-900 tracking-tight mt-1 font-mono flex items-center justify-center gap-1.5">
            <span className={txType === 'income' ? 'text-[#00D26A]' : 'text-[#00D26A]'}>
              R$
            </span>
            <span>{amountStr}</span>
          </div>
        </div>

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
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
              className="w-full h-11 px-4 text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal bg-slate-50 border border-slate-200/90 rounded-2xl focus:outline-none focus:border-[#00D26A] focus:bg-white transition-all shadow-2xs"
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

        {/* Section: Selecione a Categoria (Matching Image 4) */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 block text-center w-full">
              Selecione a Categoria
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {visibleCategories.map(cat => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.name;

              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#00D26A] text-white shadow-[0_6px_16px_rgba(0,210,106,0.25)] scale-[1.01]'
                      : 'bg-[#00D26A]/10 text-slate-700 hover:bg-[#00D26A]/20'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-[#00D26A]'}`} />
                  <span className="text-xs font-bold">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Toggle more categories */}
          <div className="text-center mt-2">
            <button
              type="button"
              onClick={() => setShowAllCategories(!showAllCategories)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              {showAllCategories ? 'Mostrar Menos Categorias' : '+ Ver Mais Categorias'}
            </button>
          </div>
        </div>

        {/* Numeric Keypad (Matching Image 4) */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-12 rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 text-xl font-bold text-slate-900 border border-slate-100 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
            >
              {d}
            </button>
          ))}

          <button
            type="button"
            onClick={() => handleDigit('00')}
            className="h-12 rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 text-sm font-bold text-slate-700 border border-slate-100 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
          >
            00
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 text-xl font-bold text-slate-900 border border-slate-100 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Apagar dígito"
            className="h-12 rounded-2xl bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-100 shadow-xs flex items-center justify-center transition-colors cursor-pointer"
          >
            <Delete className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Bottom Big Button (Matching Image 4) */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-4 rounded-full bg-[#00D26A] hover:bg-[#00C853] active:scale-98 text-white font-extrabold text-sm sm:text-base shadow-button-green transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>
              {editingTransaction
                ? 'Salvar Alterações'
                : txType === 'income'
                ? 'Registrar Receita'
                : paymentMethod === 'pix'
                ? 'Registrar Pix'
                : `Registrar ${selectedCategory}`}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
