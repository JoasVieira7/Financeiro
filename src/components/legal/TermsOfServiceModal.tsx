import React from 'react';
import { X, Shield } from 'lucide-react';

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white rounded-[32px] p-6 shadow-2xl border border-slate-100 animate-scale-in max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8FBF0] flex items-center justify-center text-[#00D26A]">
              <Shield className="w-5 h-5 stroke-[2.5]" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">Termos de Uso - Financeiro Express</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        <div className="overflow-y-auto p-2 space-y-3.5 text-xs text-slate-600 my-3 leading-relaxed">
          <p><strong>Última atualização:</strong> 30 de Outubro de 2026</p>

          <h4 className="font-bold text-slate-900 text-sm">1. Aceitação dos Termos</h4>
          <p>
            Ao criar uma conta ou utilizar o aplicativo Financeiro Express, você concorda expressamente com estes Termos de Uso e com nossa Política de Privacidade.
          </p>

          <h4 className="font-bold text-slate-900 text-sm">2. Objeto e Serviços</h4>
          <p>
            O Financeiro Express é uma ferramenta SaaS de gestão financeira pessoal e acompanhamento de metas de economia. O aplicativo não é uma instituição financeira e não realiza movimentações bancárias diretamente sem sua autorização explícita.
          </p>

          <h4 className="font-bold text-slate-900 text-sm">3. Planos e Assinaturas (SaaS)</h4>
          <p>
            O aplicativo oferece uma versão gratuita e o Plano Premium por assinatura (R$ 4,90/mês ou R$ 39,90/ano). O cancelamento pode ser efetuado a qualquer momento sem fidelidade ou taxas adicionais.
          </p>

          <h4 className="font-bold text-slate-900 text-sm">4. Segurança e Row Level Security (RLS)</h4>
          <p>
            Seus dados são protegidos por arquitetura de isolamento estrito por usuário. Você é o único responsável pela confidencialidade de sua senha de acesso.
          </p>

          <h4 className="font-bold text-slate-900 text-sm">5. Exclusão de Conta</h4>
          <p>
            Em conformidade com as diretrizes da Apple App Store e Google Play Store, o usuário tem o direito inalienável de excluir sua conta e todos os dados associados a qualquer momento pelo menu de configurações.
          </p>
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
