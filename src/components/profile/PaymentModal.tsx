import React, { useState } from 'react';
import { X, Sparkles, Check, Copy, QrCode, CreditCard, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import confetti from 'canvas-confetti';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose }) => {
  const { updateProfilePlan } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const pixCode = '00020126580014br.gov.bcb.pix0136finexpress-pay-99201928374252040000530398654044.905802BR5915FinExpress SaaS6009Sao Paulo62070503***6304E8A2';

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSimulatePayment = async () => {
    setIsProcessing(true);
    setTimeout(async () => {
      await updateProfilePlan('premium');
      setIsProcessing(false);
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00D26A', '#34D399', '#10B981'],
      });
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl border border-slate-100 animate-scale-in max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E8FBF0] flex items-center justify-center text-[#00D26A]">
              <Sparkles className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                Assinatura FinExpress Premium
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Preço popular para controle total
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Plan Selection Cards */}
        <div className="grid grid-cols-2 gap-3 my-4">
          <div
            onClick={() => setSelectedPlan('monthly')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              selectedPlan === 'monthly'
                ? 'bg-[#E8FBF0]/40 border-[#00D26A] shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Mensal
            </span>
            <div className="text-xl font-extrabold text-slate-900 font-mono mt-1">
              R$ 4,90 <span className="text-xs font-normal text-slate-400">/mês</span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1.5 font-medium">
              Cancele quando quiser
            </span>
          </div>

          <div
            onClick={() => setSelectedPlan('yearly')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all relative ${
              selectedPlan === 'yearly'
                ? 'bg-[#E8FBF0]/40 border-[#00D26A] shadow-xs'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="absolute -top-2.5 right-3 text-[10px] bg-[#00D26A] text-white font-extrabold px-2 py-0.5 rounded-full shadow-xs">
              32% OFF
            </span>
            <span className="text-[10px] uppercase font-bold text-[#00D26A] block tracking-wider">
              Anual (Mais Popular)
            </span>
            <div className="text-xl font-extrabold text-slate-900 font-mono mt-1">
              R$ 39,90 <span className="text-xs font-normal text-slate-400">/ano</span>
            </div>
            <span className="text-[11px] text-[#00D26A] block mt-1.5 font-bold">
              Apenas R$ 3,32/mês
            </span>
          </div>
        </div>

        {/* Payment Method Selector Pills */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl mb-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => setPaymentMethod('pix')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
              paymentMethod === 'pix'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4 text-[#00D26A]" />
            <span>Pix Instantâneo</span>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('card')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
              paymentMethod === 'card'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4 text-[#00D26A]" />
            <span>Cartão de Crédito</span>
          </button>
        </div>

        {/* Payment Body */}
        {paymentMethod === 'pix' ? (
          <div className="space-y-3 bg-[#FAFAFC] p-5 rounded-2xl border border-slate-100 text-center">
            {/* Simulated Clean QR Code */}
            <div className="w-36 h-36 mx-auto bg-white p-3 rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm">
              <div className="w-full h-full border-4 border-slate-900 p-1 flex flex-col justify-between rounded-lg">
                <div className="flex justify-between">
                  <div className="w-6 h-6 bg-slate-900 rounded-xs" />
                  <div className="w-6 h-6 bg-slate-900 rounded-xs" />
                </div>
                <div className="text-center font-mono font-bold text-[9px] text-slate-900 tracking-wider">
                  PIX EXPRESS
                </div>
                <div className="flex justify-between">
                  <div className="w-6 h-6 bg-slate-900 rounded-xs" />
                  <div className="w-6 h-6 bg-[#00D26A] rounded-xs" />
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Escaneie o QR Code ou use o Pix Copia e Cola abaixo
            </p>

            <button
              onClick={handleCopyPix}
              className="w-full py-3 px-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs active:scale-98"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-[#00D26A] stroke-[3]" />
                  <span className="text-[#00D26A]">Código Pix Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#00D26A]" />
                  <span>Copiar Código Pix</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3 bg-[#FAFAFC] p-4 rounded-2xl border border-slate-100">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Número do Cartão
              </label>
              <input
                type="text"
                placeholder="0000 0000 0000 0000"
                className="w-full text-xs px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-[#00D26A]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Validade
                </label>
                <input
                  type="text"
                  placeholder="MM/AA"
                  className="w-full text-xs px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-[#00D26A]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  CVV
                </label>
                <input
                  type="text"
                  placeholder="123"
                  className="w-full text-xs px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono focus:outline-none focus:border-[#00D26A]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mt-4 font-medium">
          <ShieldCheck className="w-4 h-4 text-[#00D26A]" />
          <span>Pagamento 100% Criptografado & Seguro</span>
        </div>

        {/* Giant Green Action Button */}
        <button
          onClick={handleSimulatePayment}
          disabled={isProcessing}
          className="w-full mt-4 py-4 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white font-extrabold text-sm shadow-button-green active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isProcessing ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Sparkles className="w-4 h-4 stroke-[2.5]" />
              <span>Confirmar e Ativar Premium</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
