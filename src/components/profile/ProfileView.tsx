import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../lib/formatters';
import {
  weeklyToMonthly,
  monthlyToWeekly,
  roundToCents,
  getPeriodEquivalenceNote,
} from '../../lib/budgetCalculations';
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal';
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal';
import { SupportModal } from '../legal/SupportModal';
import { PlanComparisonModal } from './PaymentModal';
import {
  isWebPushSupported,
  getNotificationPermission,
  requestPushPermission,
  type PushPermissionStatus,
} from '../../lib/pushNotifications';
import {
  Check,
  Award,
  User,
  Shield,
  Bell,
  BellOff,
  ChevronRight,
  FileText,
  HelpCircle,
  X,
  AlertTriangle,
  Sparkles,
  Camera,
  DollarSign,
  Target,
  Crown,
  Edit3,
  BellRing,
} from 'lucide-react';

interface ProfileViewProps {
  onOpenAuth: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = () => {
  const {
    user,
    profile,
    signOut,
    updatePassword,
    deleteAccount,
    replayOnboarding,
    updateProfileData,
    setBudgetPeriodPreference,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useAuth();

  const { stats } = useFinance();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Período principal preferido do usuário (semanal ou mensal)
  const activePeriod = profile?.budget_period_preference || 'monthly';

  // Push Notification permission state
  const [pushStatus, setPushStatus] = useState<PushPermissionStatus>(() =>
    getNotificationPermission()
  );
  const [isRequestingPush, setIsRequestingPush] = useState(false);

  useEffect(() => {
    setPushStatus(getNotificationPermission());
  }, []);

  // Modais de navegação
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isPremiumInfoOpen, setIsPremiumInfoOpen] = useState(false);

  // Modal Editar Perfil & Metas Financeiras (Exclusivamente Mensal)
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedBudget, setEditedBudget] = useState('');
  const [editedMonthlyTarget, setEditedMonthlyTarget] = useState('');
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Modal Alterar Senha
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);

  // Modal Exclusão de Conta
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const name = profile?.full_name || 'Alex Rivera';
  const email = profile?.email || user?.email || 'alex.rivera@email.com';
  const initials =
    name
      .split(' ')
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase() || 'AR';

  const isPremium = profile?.plan_tier === 'premium';
  const monthlyBudget = profile?.monthly_budget || 3500;
  const weeklyTarget = profile?.weekly_saving_target || 250;

  // Foto de Perfil: Seleção e Redimensionamento Local
  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        // Redimensiona para thumbnail de avatar (máximo 200x200) com alta fidelidade
        const canvas = document.createElement('canvas');
        const maxSize = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          updateProfileData({ avatar_url: compressedDataUrl });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveAvatar = async () => {
    await updateProfileData({ avatar_url: null });
  };

  // Abrir Modal de Edição de Perfil e Metas (Mensal)
  const handleOpenEditProfile = () => {
    setEditedName(profile?.full_name || '');
    setEditedBudget(String(monthlyBudget));
    setEditedMonthlyTarget(weeklyToMonthly(weeklyTarget).toString());
    setProfileFeedback(null);
    setIsEditProfileOpen(true);
  };

  const handleMonthlyTargetChange = (val: string) => {
    setEditedMonthlyTarget(val);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = editedName.trim();
    if (!trimmedName) {
      setProfileFeedback('O nome não pode estar em branco.');
      return;
    }

    const rawBudget = parseFloat(editedBudget.replace(',', '.'));
    if (isNaN(rawBudget) || rawBudget <= 0) {
      setProfileFeedback('Informe um valor de orçamento válido.');
      return;
    }

    const finalMonthlyBudget = roundToCents(rawBudget);

    const m = parseFloat(editedMonthlyTarget.replace(',', '.'));
    if (isNaN(m) || m < 0) {
      setProfileFeedback('Informe uma meta mensal válida.');
      return;
    }
    const finalWeeklyTarget = monthlyToWeekly(m);

    setIsSavingProfile(true);
    setProfileFeedback(null);

    const res = await updateProfileData({
      full_name: trimmedName,
      monthly_budget: finalMonthlyBudget,
      weekly_saving_target: finalWeeklyTarget,
      budget_period_preference: 'monthly',
    });

    setIsSavingProfile(false);

    if (res.error) {
      setProfileFeedback(res.error);
    } else {
      setProfileFeedback('Dados atualizados com sucesso!');
      setTimeout(() => {
        setIsEditProfileOpen(false);
        setProfileFeedback(null);
      }, 1000);
    }
  };

  // Alterar Senha
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

  // Exclusão de Conta
  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== 'EXCLUIR') return;
    setIsDeleting(true);
    await deleteAccount();
    setIsDeleting(false);
    setIsDeleteModalOpen(false);
  };

  const handleReplayTutorial = () => {
    replayOnboarding();
  };

  const handleRequestPushPermission = async () => {
    setIsRequestingPush(true);
    const result = await requestPushPermission();
    setPushStatus(result);
    setIsRequestingPush(false);
    if (result === 'granted') {
      setNotificationsEnabled(true);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-20 pt-1 max-w-md sm:max-w-xl md:max-w-2xl mx-auto">
      {/* Input de arquivo invisível para seleção de foto */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleAvatarFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Top Header: "Meu Perfil" */}
      <div className="px-1 pt-1">
        <h2 className="text-[22px] font-extrabold text-slate-900 tracking-tight">
          Meu Perfil
        </h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          Configurações da conta, segurança e preferências
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 1. FOTO + NOME + IDENTIFICAÇÃO DA CONTA                                   */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col items-center relative text-center">
        {/* Avatar com suporte à foto personalizada e fallback de iniciais */}
        <div className="relative mb-3.5">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[#00D26A] flex items-center justify-center text-white font-extrabold text-[28px] shadow-sm border-2 border-white">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          {/* Botão de câmera para alterar foto */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Alterar foto de perfil"
            aria-label="Alterar foto"
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md hover:bg-slate-800 transition-transform active:scale-95 cursor-pointer border-2 border-white"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* Botão sutil para remover foto se existir */}
        {profile?.avatar_url && (
          <button
            type="button"
            onClick={handleRemoveAvatar}
            className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition-colors mb-2 cursor-pointer"
          >
            Remover foto e usar iniciais
          </button>
        )}

        {/* Nome do Usuário */}
        <div className="flex items-center gap-1.5 justify-center">
          <h3 className="text-[20px] font-extrabold text-slate-900 tracking-tight">
            {name}
          </h3>
          <button
            onClick={handleOpenEditProfile}
            className="p-1 text-slate-400 hover:text-[#00D26A] transition-colors rounded-full cursor-pointer"
            title="Editar dados"
            aria-label="Editar dados pessoais"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>

        {/* E-mail da Conta */}
        <p className="text-xs font-medium text-slate-400 mt-0.5">
          {email}
        </p>

        {/* Badge do Plano Atual */}
        <div className="mt-3.5">
          {isPremium ? (
            <div className="px-4 py-1.5 rounded-full bg-[#E8FBF0] border border-[#A7F3D0] text-[#00D26A] text-xs font-bold flex items-center gap-1.5 shadow-2xs">
              <Award className="w-4 h-4 stroke-[2.5]" />
              <span>Plano Premium Ativo</span>
            </div>
          ) : (
            <div className="px-4 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
              <User className="w-3.5 h-3.5" />
              <span>Plano Gratuito</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SEU PLANO                                                             */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider px-1">
          Seu Plano
        </h4>

        <div className="bg-white rounded-[26px] p-5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  isPremium
                    ? 'bg-[#E8FBF0] text-[#00D26A]'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isPremium ? (
                  <Crown className="w-5 h-5 stroke-[2.2]" />
                ) : (
                  <Shield className="w-5 h-5 stroke-[2.2]" />
                )}
              </div>
              <div>
                <h5 className="text-sm font-extrabold text-slate-900 leading-tight">
                  {isPremium ? 'Financeiro Express Premium' : 'Plano Gratuito'}
                </h5>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {isPremium
                    ? 'Assinatura ativa e completa'
                    : 'Acesso essencial com recursos limitados'}
                </p>
              </div>
            </div>
          </div>

          {/* Benefícios Resumidos */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600 font-medium">
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
              <span>Registro de despesas à vista e parceladas</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
              <span>
                {isPremium
                  ? 'Metas de economia ilimitadas'
                  : 'Até 2 metas de economia ativas'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-[#00D26A] stroke-[3] shrink-0" />
              <span>
                {isPremium
                  ? 'Análise detalhada por categoria e relatórios completos'
                  : 'Visualização padrão de gastos mensais'}
              </span>
            </div>
          </div>

          {!isPremium && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsPremiumInfoOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#00D26A]" />
                <span>Conheça o Premium</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. DADOS FINANCEIROS                                                      */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
            Dados Financeiros
          </h4>
          <button
            type="button"
            onClick={handleOpenEditProfile}
            className="text-xs font-bold text-[#00D26A] hover:underline cursor-pointer"
          >
            Ajustar Valores
          </button>
        </div>

        <div className="bg-white rounded-[26px] p-4 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] space-y-3">
          {/* Orçamento Mensal */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100/80 space-y-1">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-[#00D26A]" />
              Orçamento Mensal
            </span>
            <div className="text-sm font-extrabold text-slate-900 font-mono">
              {formatCurrency(monthlyBudget)}
            </div>
            <span className="text-[10px] text-slate-400 block font-medium">
              Limite total de gastos planejados para o mês
            </span>
          </div>

          {/* Meta de Economia Mensal */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-[#00D26A]" />
                Meta de Economia Mensal
              </span>
              <span className="text-[11px] font-bold text-[#00D26A] font-mono">
                {stats.monthlyGoalPercentage}%
              </span>
            </div>

            {/* Valor alvo da meta */}
            <div className="text-sm font-extrabold text-slate-900 font-mono">
              {formatCurrency(weeklyToMonthly(weeklyTarget))}
            </div>

            {/* Progresso real do período mensal */}
            <div className="space-y-1">
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00D26A] rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.monthlyGoalPercentage}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                <span>
                  Economizado: {formatCurrency(stats.monthlySavedAmount)}
                </span>
                <span className="font-bold text-[#00D26A]">
                  {stats.monthlyGoalPercentage}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. PREFERÊNCIAS                                                          */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider px-1">
          Preferências
        </h4>

        <div className="space-y-2">
          {/* Notificações no App com Toggle */}
          <div className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
            <div className="flex items-center gap-3.5 min-w-0 pr-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  notificationsEnabled
                    ? 'bg-[#E8FBF0] text-[#00D26A]'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {notificationsEnabled ? (
                  <Bell className="w-5 h-5 stroke-[2.2]" />
                ) : (
                  <BellOff className="w-5 h-5 stroke-[2.2]" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-sm font-bold text-slate-900 block truncate">
                  Notificações no app
                </span>
                <span className="text-xs text-slate-400 block truncate leading-tight">
                  Alertas de metas, despesas e vencimentos
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                notificationsEnabled
                  ? 'bg-[#E8FBF0] text-[#00D26A] border border-[#A7F3D0]'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {notificationsEnabled ? 'Ativadas' : 'Desativadas'}
            </button>
          </div>

          {/* Notificações Push do Navegador */}
          {isWebPushSupported() && (
            <div className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
              <div className="flex items-center gap-3.5 min-w-0 pr-2">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    pushStatus === 'granted'
                      ? 'bg-[#E8FBF0] text-[#00D26A]'
                      : pushStatus === 'denied'
                      ? 'bg-rose-50 text-rose-400'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <BellRing className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-bold text-slate-900 block truncate">
                    Notificações push
                  </span>
                  <span className="text-xs text-slate-400 block leading-tight">
                    {pushStatus === 'granted'
                      ? 'Ativas no seu navegador'
                      : pushStatus === 'denied'
                      ? 'Bloqueadas — habilite nas configurações do navegador'
                      : 'Receba alertas mesmo com o app minimizado'}
                  </span>
                </div>
              </div>

              {pushStatus === 'granted' ? (
                <span className="px-3 py-1.5 rounded-full text-xs font-extrabold bg-[#E8FBF0] text-[#00D26A] border border-[#A7F3D0] whitespace-nowrap">
                  Ativas
                </span>
              ) : pushStatus === 'denied' ? (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-500 border border-rose-200 whitespace-nowrap">
                  Bloqueadas
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestPushPermission}
                  disabled={isRequestingPush}
                  className="px-3 py-1.5 rounded-full text-xs font-extrabold bg-slate-900 text-white hover:bg-slate-800 transition-all cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  {isRequestingPush ? 'Aguarde...' : 'Ativar'}
                </button>
              )}
            </div>
          )}

          {/* Rever Tutorial */}
          <div
            onClick={handleReplayTutorial}
            className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-slate-200 transition-colors active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[#E8FBF0] flex items-center justify-center text-[#00D26A] shrink-0">
                <Sparkles className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-bold text-slate-900 block truncate">
                  Rever tutorial
                </span>
                <span className="text-xs text-slate-400 block truncate leading-tight">
                  Veja novamente como usar o Financeiro Express
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. SEGURANÇA                                                             */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider px-1">
          Segurança
        </h4>

        <div
          onClick={() => setIsPasswordModalOpen(true)}
          className="bg-white rounded-[22px] px-4 py-3.5 border border-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-slate-200 transition-colors active:scale-[0.99]"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
              <Shield className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 block">
                Alterar Senha
              </span>
              <span className="text-xs text-slate-400 block leading-tight">
                Mantenha sua conta sempre protegida
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. SUPORTE & TERMOS                                                      */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider px-1">
          Ajuda & Legal
        </h4>

        <div className="space-y-2">
          {/* Central de Ajuda & Suporte */}
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

      {/* ========================================================================= */}
      {/* 7 & 8. EXCLUSÃO DA CONTA E LOGOUT                                         */}
      {/* ========================================================================= */}
      <div className="pt-2 space-y-2.5">
        <button
          type="button"
          onClick={signOut}
          className="w-full py-3.5 px-4 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer active:scale-[0.99]"
        >
          Desconectar da Conta
        </button>

        <button
          type="button"
          onClick={() => setIsDeleteModalOpen(true)}
          className="w-full py-3.5 px-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer active:scale-[0.99]"
        >
          Excluir Conta Permanentemente
        </button>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: EDITAR PERFIL E METAS FINANCEIRAS                                   */}
      {/* ========================================================================= */}
      {isEditProfileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsEditProfileOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-extrabold text-slate-900 text-base">
                Editar Dados do Perfil
              </h3>
              <button
                onClick={() => setIsEditProfileOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              {/* E-mail (Somente leitura) */}
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">
                  E-mail da Conta (não alterável)
                </label>
                <div className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 font-medium select-none truncate">
                  {email}
                </div>
              </div>

              {/* Nome completo */}
              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Seu nome"
                  value={editedName}
                  onChange={e => setEditedName(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A] transition-colors"
                />
              </div>

              {/* Orçamento Mensal */}
              <div>
                <label className="text-xs text-slate-700 font-bold block mb-1">
                  Orçamento Total do Mês (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="3500.00"
                  value={editedBudget}
                  onChange={e => setEditedBudget(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A] font-mono transition-colors"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Defina o limite de gastos para o planejamento mensal.
                </span>
              </div>

              {/* Meta de Economia Mensal */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Meta de Economia Mensal (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="1000.00"
                  value={editedMonthlyTarget}
                  onChange={e => handleMonthlyTargetChange(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:border-[#00D26A] font-mono transition-colors"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Defina o valor alvo que deseja poupar a cada mês.
                </span>
              </div>

              {profileFeedback && (
                <p
                  className={`text-xs font-semibold ${
                    profileFeedback.includes('sucesso')
                      ? 'text-[#00D26A]'
                      : 'text-rose-500'
                  }`}
                >
                  {profileFeedback}
                </p>
              )}

              <button
                type="submit"
                disabled={isSavingProfile}
                className="w-full py-3 rounded-full bg-[#00D26A] text-white font-bold text-xs shadow-button-green disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: COMPARAÇÃO DE PLANOS (PlanComparisonModal)                          */}
      {/* ========================================================================= */}
      <PlanComparisonModal
        isOpen={isPremiumInfoOpen}
        onClose={() => setIsPremiumInfoOpen(false)}
      />

      {/* ========================================================================= */}
      {/* MODAL: ALTERAR SENHA                                                      */}
      {/* ========================================================================= */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
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
                <p
                  className={`text-xs font-semibold ${
                    passwordFeedback.includes('sucesso')
                      ? 'text-[#00D26A]'
                      : 'text-rose-500'
                  }`}
                >
                  {passwordFeedback}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#00D26A] text-white font-bold text-xs shadow-button-green cursor-pointer"
              >
                Salvar Nova Senha
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EXCLUSÃO DE CONTA                                                  */}
      {/* ========================================================================= */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-scale-in">
            <div className="flex items-center gap-2 text-rose-600 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-slate-900 text-base">Excluir Conta</h3>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Esta ação é <strong>irreversível</strong>. Todos os seus dados, metas e transações serão apagados permanentemente.
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
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteConfirmationText !== 'EXCLUIR' || isDeleting}
                onClick={handleDeleteAccount}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer"
              >
                {isDeleting ? 'Excluindo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submodais Legais e Suporte */}
      <TermsOfServiceModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
};
