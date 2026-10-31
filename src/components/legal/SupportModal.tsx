import React, { useState } from 'react';
import { X, HelpCircle, MessageCircle, Mail, ChevronDown, ChevronUp } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FAQS = [
  {
    q: 'Como funciona o lançamento rápido em menos de 3 segundos?',
    a: 'Basta tocar no botão central "Registrar Pix", digitar o valor no teclado numérico, selecionar a categoria correspondente e pronto! O registro é salvo instantaneamente.',
  },
  {
    q: 'Meus dados bancários estão seguros?',
    a: 'Sim, 100% seguros. O aplicativo não solicita suas senhas bancárias e utiliza Row Level Security (RLS) criptografado pelo Supabase, garantindo que somente a sua conta consiga ler suas transações.',
  },
  {
    q: 'Como cancelar minha assinatura Premium?',
    a: 'Você pode gerenciar ou cancelar sua assinatura a qualquer momento na aba de Perfil sem burocracia ou taxas de cancelamento.',
  },
  {
    q: 'Como excluir minha conta permanentemente?',
    a: 'No menu Perfil > Zona de Perigo, selecione "Excluir Conta Permanentemente". Todos os seus dados, metas e transações serão imediatamente apagados de nossos servidores.',
  },
];

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl border border-slate-100 animate-scale-in max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8FBF0] flex items-center justify-center text-[#00D26A]">
              <HelpCircle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">Central de Ajuda & Suporte</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        <div className="overflow-y-auto p-1 space-y-3 my-3">
          {/* Contact Cards */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href="mailto:suporte@financeiroexpress.com.br"
              className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-center hover:border-[#00D26A] transition-colors"
            >
              <Mail className="w-5 h-5 text-[#00D26A] mb-1" />
              <span className="text-xs font-bold text-slate-800">E-mail Suporte</span>
              <span className="text-[10px] text-slate-400">Resposta em até 24h</span>
            </a>

            <div className="p-3.5 rounded-2xl bg-[#E8FBF0]/40 border border-[#A7F3D0] flex flex-col items-center justify-center text-center">
              <MessageCircle className="w-5 h-5 text-[#00D26A] mb-1" />
              <span className="text-xs font-bold text-slate-800">Suporte Premium</span>
              <span className="text-[10px] text-[#00D26A] font-semibold">Canal Exclusivo</span>
            </div>
          </div>

          <h4 className="text-xs font-bold text-slate-700 pt-2">Dúvidas Frequentes (FAQ)</h4>

          <div className="space-y-2">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-slate-50 border border-slate-200/80 overflow-hidden"
              >
                <button
                  onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                  className="w-full p-3.5 text-left flex items-center justify-between text-xs font-bold text-slate-800"
                >
                  <span>{faq.q}</span>
                  {openIndex === idx ? (
                    <ChevronUp className="w-4 h-4 text-[#00D26A] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
                {openIndex === idx && (
                  <p className="px-3.5 pb-3.5 text-xs text-slate-500 leading-relaxed border-t border-slate-200/60 pt-2">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};
