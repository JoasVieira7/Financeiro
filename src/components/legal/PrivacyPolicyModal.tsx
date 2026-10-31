import React from 'react';
import { X, Lock } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white rounded-[32px] p-6 shadow-2xl border border-slate-100 animate-scale-in max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8FBF0] flex items-center justify-center text-[#00D26A]">
              <Lock className="w-5 h-5 stroke-[2.5]" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">Política de Privacidade</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        <div className="overflow-y-auto p-2 space-y-3.5 text-xs text-slate-600 my-3 leading-relaxed">
          <p><strong>Conformidade:</strong> LGPD (Lei Geral de Proteção de Dados - Lei 13.709/2018) e GDPR.</p>

          <h4 className="font-bold text-slate-900 text-sm">1. Dados Coletados</h4>
          <p>
            Coletamos apenas as informações estritamente necessárias para a prestação do serviço: endereço de e-mail, nome de exibição e os registros de receitas, despesas e metas financeiras inseridos por você.
          </p>

          <h4 className="font-bold text-slate-900 text-sm">2. Não Armazenamento de Dados de Cartão</h4>
          <p>
            Em nenhuma hipótese armazenamos dados sensíveis de cartão de crédito em nossos servidores ou banco de dados. Qualquer transação de assinatura é processada diretamente pelas lojas de aplicativos oficiais (Google Play Billing / Apple In-App Purchase) ou gateways certificados PCI-DSS.
          </p>

          <h4 className="font-bold text-slate-900 text-sm">3. Isolamento Criptografado (RLS)</h4>
          <p>
            Suas finanças contam com isolamento lógico via Row Level Security (RLS) no PostgreSQL do Supabase. Nenhum outro cliente da plataforma tem permissão técnica de leitura ou escrita sobre seus registros.
          </p>

          <h4 className="font-bold text-slate-900 text-sm">4. Não Comercialização de Dados</h4>
          <p>
            Seus dados financeiros jamais serão vendidos, alugados ou compartilhados com terceiros para fins de publicidade.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-[#00D26A] text-white text-xs font-bold shadow-button-green"
        >
          Entendido
        </button>
      </div>
    </div>
  );
};
