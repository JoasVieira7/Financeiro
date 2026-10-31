import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PaymentModal } from './PaymentModal';
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal';
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal';
import { SupportModal } from '../legal/SupportModal';
import {
  Settings,
  Check,
  Award,
  User,
  Shield,
  Bell,
  ChevronRight,
  LogOut,
  Trash2,
  FileText,
  HelpCircle,
  X,
  AlertTriangle,
} from 'lucide-react';

interface ProfileViewProps {
  onOpenAuth: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onOpenAuth }) => {
  const {
    user,
    profile,
    signOut,
    updatePassword,
    deleteAccount,
  } = useAuth();

  // Modals
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Password & Delete modal states
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const name = profile?.full_name || 'Alex Rivera';
  const email = profile?.email || 'alex.rivera@email.com';
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || 'AR';

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordFeedback('A senha deve conter no mínimo 6 caracteres.');
      return;
    }
    const res = await updatePassword(newPassword);
    if (res.error) {
      setPasswordFeedback(res.error);
    } else {
      setPasswordFeedback('Senha alterada com sucesso!');
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordFeedback(null);
        setNewPassword('');
      }, 1500);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== 'EXCLUIR') return;
    setIsDeleting(true);
    await deleteAccount();
    setIsDeleting(false);
    setIsDeleteModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16 pt-1">
      {/* Top Header: "Meu Perfil" on left, Gear on right */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[22px] font-extrabold text-slate-900 tracking-tight">
          Meu Perfil
        </h2>
        <button
          onClick={() => setIsPasswordModalOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Configurações"
        >
          <Settings className="w-5 h-5 fill-slate-500 stroke-slate-600" />
        </button>
      </div>

      {/* Main Profile Card (Matching Reference Image) */}
      <div className="bg-white rounded-[36px] p-7 border border-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.06)] flex flex-col items-center relative">
        {/* Avatar with Verified Green Check to the right */}
        <div className="flex items-center justify-center relative w-full mb-3">
          <div className="w-[98px] h-[98px] rounded-full bg-[#00D26A] flex items-center justify-center text-white font-extrabold text-[28px] shadow-sm">
            {initials}
          </div>
          {/* Verified Check Badge to the right */}
          <div className="absolute right-[22%] top-6 w-6 h-6 rounded-full bg-[#00D26A] flex items-center justify-center shadow-sm">
            <Check className="w-3.5 h-3.5 text-white stroke-[3.5]" />
          </div>
        </div>

        {/* User Name */}
        <h3 className="text-[22px] font-extrabold text-slate-900 tracking-tight text-center">
          {name}
        </h3>

        {/* User Email */}
        <p className="text-xs font-medium text-slate-400 mt-1 text-center">
          {email}
        </p>

        {/* Pill Badge: Plano Premium Ativo */}
        <div className="mt-4 px-6 py-2 rounded-full bg-[#E8FBF0] border border-[#A7F3D0] text-[#4ADE80] text-xs font-bold flex items-center gap-1.5 shadow-xs">
          <Award className="w-4 h-4 stroke-[2.5]" />
          <span className="tracking-wide">Plano Premium Ativo</span>
        </div>
      </div>

      {/* Section: Assinatura e Pagamento */}
      <div className="space-y-3">
        <h4 className="text-base font-extrabold text-slate-900 text-center tracking-tight">
          Assinatura e Pagamento
        </h4>

        <div className="bg-white rounded-[28px] p-5 border border-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.04)] space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h5 className="text-sm font-extrabold text-slate-900">
                Mensal Antigravity
              </h5>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                Próxima cobrança: 12 Out
              </p>
            </div>
            <div className="text-base font-extrabold text-[#00D26A] font-mono">
              R$ 4,90/mês
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setIsPaymentOpen(true)}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors shadow-xs"
            >
              Gerenciar Plano
            </button>
            <button
              onClick={() => setIsPaymentOpen(true)}
              className="text-xs font-bold text-[#00D26A] hover:underline"
            >
              Ver Recibos
            </button>
          </div>
        </div>
      </div>

      {/* Section: Configurações da Conta */}
      <div className="space-y-3">
        <h4 className="text-base font-extrabold text-slate-900 text-center tracking-tight">
          Configurações da Conta
        </h4>

        <div className="space-y-2.5">
          {/* Dados Pessoais */}
          <div
            onClick={() => onOpenAuth()}
            className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-slate-200 transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#E8FBF0] flex items-center justify-center text-[#00D26A] shrink-0">
                <User className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="text-sm font-bold text-[#00D26A]">
                Dados Pessoais
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
              <span>42</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Segurança e Senha */}
          <div
            onClick={() => setIsPasswordModalOpen(true)}
            className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-slate-200 transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#E8FBF0] flex items-center justify-center text-[#00D26A] shrink-0">
                <Shield className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="text-sm font-bold text-[#00D26A]">
                Segurança e Senha
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
              <span>42</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Notificações */}
          <div className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-slate-200 transition-colors">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#E8FBF0] flex items-center justify-center text-[#00D26A] shrink-0">
                <Bell className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="text-sm font-bold text-[#00D26A]">
                Notificações
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
              <span>Ativadas</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Central de Ajuda & FAQ */}
          <div
            onClick={() => setIsSupportOpen(true)}
            className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-slate-200 transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <HelpCircle className="w-5 h-5 stroke-[2]" />
              </div>
              <span className="text-sm font-bold text-slate-800">
                Central de Ajuda & Suporte
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>

          {/* Termos de Uso */}
          <div
            onClick={() => setIsTermsOpen(true)}
            className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-slate-200 transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <FileText className="w-5 h-5 stroke-[2]" />
              </div>
              <span className="text-sm font-bold text-slate-800">
                Termos de Uso
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>

          {/* Política de Privacidade */}
          <div
            onClick={() => setIsPrivacyOpen(true)}
            className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-slate-200 transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <Shield className="w-5 h-5 stroke-[2]" />
              </div>
              <span className="text-sm font-bold text-slate-800">
                Política de Privacidade
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Danger Zone: Sair e Excluir */}
      <div className="pt-1 space-y-2.5">
        <button
          onClick={signOut}
          className="w-full py-3.5 px-4 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
        >
          Desconectar da Conta
        </button>

        <button
          onClick={() => setIsDeleteModalOpen(true)}
          className="w-full py-3.5 px-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-100 transition-colors"
        >
          Excluir Conta Permanentemente
        </button>
      </div>

      {/* Submodals */}
      <PaymentModal isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} />
      <TermsOfServiceModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

      {/* Modal Alterar Senha */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Alterar Senha</h3>
              <button
                onClick={() => setIsPasswordModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 font-semibold block mb-1">
                  Nova Senha (mínimo 6 caracteres)
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A]"
                />
              </div>

              {passwordFeedback && (
                <p className="text-xs text-[#00D26A] font-semibold">{passwordFeedback}</p>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#00D26A] text-white font-bold text-xs shadow-button-green"
              >
                Salvar Nova Senha
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Exclusão de Conta */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in">
            <div className="flex items-center gap-2 text-rose-600 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-slate-900 text-base">Excluir Conta</h3>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Esta ação é <strong>irreversível</strong>. Todos os seus dados, metas e transações serão apagados.
            </p>

            <p className="text-xs text-slate-500 mb-1">
              Digite <strong className="text-slate-900">EXCLUIR</strong> para confirmar:
            </p>

            <input
              type="text"
              value={deleteConfirmationText}
              onChange={e => setDeleteConfirmationText(e.target.value)}
              placeholder="Digite EXCLUIR"
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-rose-500 mb-4 font-mono"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                disabled={deleteConfirmationText !== 'EXCLUIR' || isDeleting}
                onClick={handleDeleteAccount}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs"
              >
                {isDeleting ? 'Excluindo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
