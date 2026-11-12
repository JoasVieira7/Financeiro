import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { X, Lock, Mail, User, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isFullScreen?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  isFullScreen = false,
}) => {
  const { signIn, signUp, signInWithOAuth, startDemoSession, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEmailConfirm, setPendingEmailConfirm] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        if (!email.trim() || !password) {
          setErrorMsg('Por favor, informe seu e-mail e senha.');
          setLoading(false);
          return;
        }
        const res = await signIn(email.trim(), password);
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          onClose?.();
        }
      } else if (mode === 'signup') {
        if (!email.trim() || !password) {
          setErrorMsg('Por favor, informe seu e-mail e crie uma senha.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMsg('A senha deve conter no mínimo 6 caracteres.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('As senhas digitadas não coincidem. Verifique a confirmação.');
          setLoading(false);
          return;
        }

        const res = await signUp(email.trim(), password, fullName.trim() || 'Usuário');
        if (res.error) {
          setErrorMsg(res.error);
        } else if (res.emailConfirmationRequired) {
          setPendingEmailConfirm(true);
          setSuccessMsg(
            'Cadastro realizado com sucesso! Enviamos um link de confirmação para o seu e-mail. Por favor, confirme seu e-mail antes de fazer o primeiro login.'
          );
        } else {
          onClose?.();
        }
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          setErrorMsg('Informe o e-mail cadastrado para enviarmos as instruções de recuperação.');
          setLoading(false);
          return;
        }
        const res = await resetPassword(email.trim());
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessMsg('Link de recuperação enviado com sucesso! Verifique sua caixa de entrada e pasta de spam.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocorreu um erro inesperado durante a autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await signInWithOAuth('google');
      if (res.error) {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao inicializar login com Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartDemo = () => {
    startDemoSession();
    onClose?.();
  };

  const content = (
    <div className="w-full max-w-[400px] mx-auto flex flex-col items-center justify-between min-h-[92vh] sm:min-h-0 sm:py-6 relative z-10">
      {/* Botão Fechar (apenas se não for tela cheia obrigatória) */}
      {onClose && !isFullScreen && (
        <button
          onClick={onClose}
          type="button"
          aria-label="Fechar"
          className="absolute top-0 right-1 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 shadow-xs flex items-center justify-center transition-colors cursor-pointer z-20"
        >
          <X className="w-4 h-4 stroke-[2.5]" />
        </button>
      )}

      {/* Identidade Visual Premium: Fluxo Financeiro */}
      <div className="flex flex-col items-center pt-4 sm:pt-2 pb-5">
        <div className="w-[84px] h-[84px] rounded-[28px] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] border border-slate-100/80 flex items-center justify-center relative">
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Sparkle Star 1 */}
            <path
              d="M21 9C21 11.2 19.8 12.8 17.5 13.5C19.8 14.2 21 15.8 21 18C21 15.8 22.2 14.2 24.5 13.5C22.2 12.8 21 11.2 21 9Z"
              fill="#00D26A"
            />
            {/* Sparkle Star 2 */}
            <path
              d="M30 7.5C30 8.8 29.3 9.8 28 10.2C29.3 10.6 30 11.6 30 13C30 11.6 30.7 10.6 32 10.2C30.7 9.8 30 8.8 30 7.5Z"
              fill="#00D26A"
            />
            {/* Green Zigzag Growth Line with Arrow */}
            <path
              d="M11 29L18.5 21.5L24 27L33.5 15.5"
              stroke="#00D26A"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Arrowhead */}
            <path
              d="M27.5 15.5H33.5V21.5"
              stroke="#00D26A"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight text-center mt-3.5">
          Fluxo Financeiro
        </h1>
        <p className="text-[13.5px] font-medium text-slate-500 mt-0.5 text-center">
          Gestão Inteligente & Metas Reais
        </p>
      </div>

      {/* Card Principal da Autenticação */}
      <div className="w-full bg-white rounded-[32px] p-6 sm:p-7 shadow-[0_12px_36px_rgba(0,0,0,0.04)] border border-slate-100">
        <h2 className="text-[21px] font-bold text-slate-900 tracking-tight mb-4">
          {pendingEmailConfirm
            ? 'Confirme seu E-mail'
            : mode === 'signin'
            ? 'Bem-vindo de volta'
            : mode === 'signup'
            ? 'Criar sua conta'
            : 'Recuperar senha'}
        </h2>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2.5 animate-fade-in">
            <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5 text-[#00D26A]" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {pendingEmailConfirm ? (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-slate-600 leading-relaxed">
              Para sua segurança, enviamos uma mensagem de ativação para <strong>{email}</strong>. Clique no link recebido para liberar seu acesso.
            </p>
            <button
              type="button"
              onClick={() => {
                setPendingEmailConfirm(false);
                setMode('signin');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="w-full h-[50px] rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white font-bold text-[14.5px] shadow-[0_8px_20px_rgba(0,210,106,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Ir para a tela de Login</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label className="text-[13px] font-bold text-slate-900 block mb-1">
                  Nome Completo
                </label>
                <div className="h-[52px] rounded-[18px] border border-slate-200 bg-white flex items-center px-4 gap-3 focus-within:border-[#00D26A] focus-within:ring-2 focus-within:ring-[#00D26A]/20 transition-all">
                  <User className="w-[18px] h-[18px] text-slate-500 stroke-[2] shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder="Seu nome completo"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full text-base sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[13px] font-bold text-slate-900 block mb-1">
                E-mail
              </label>
              <div className="h-[52px] rounded-[18px] border border-slate-200 bg-white flex items-center px-4 gap-3 focus-within:border-[#00D26A] focus-within:ring-2 focus-within:ring-[#00D26A]/20 transition-all">
                <Mail className="w-[18px] h-[18px] text-slate-500 stroke-[2] shrink-0" />
                <input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full text-base sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="text-[13px] font-bold text-slate-900 block mb-1">
                  Senha
                </label>
                <div className="h-[52px] rounded-[18px] border border-slate-200 bg-white flex items-center px-4 gap-3 focus-within:border-[#00D26A] focus-within:ring-2 focus-within:ring-[#00D26A]/20 transition-all">
                  <Lock className="w-[18px] h-[18px] text-slate-500 stroke-[2] shrink-0" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full text-base sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent tracking-widest"
                  />
                </div>

                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="text-[12.5px] font-semibold text-[#00D26A] hover:underline block text-right mt-2 cursor-pointer ml-auto"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label className="text-[13px] font-bold text-slate-900 block mb-1">
                  Confirmar Senha
                </label>
                <div className="h-[52px] rounded-[18px] border border-slate-200 bg-white flex items-center px-4 gap-3 focus-within:border-[#00D26A] focus-within:ring-2 focus-within:ring-[#00D26A]/20 transition-all">
                  <Lock className="w-[18px] h-[18px] text-slate-500 stroke-[2] shrink-0" />
                  <input
                    type="password"
                    required
                    placeholder="Repita sua senha"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full text-base sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent tracking-widest"
                  />
                </div>
              </div>
            )}

            {/* Botão de Ação Principal */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[52px] rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white font-bold text-[15px] shadow-[0_8px_20px_rgba(0,210,106,0.25)] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer mt-4.5"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>
                  {mode === 'signin'
                    ? 'Entrar na Conta'
                    : mode === 'signup'
                    ? 'Criar Conta'
                    : 'Enviar Link de Recuperação'}
                </span>
              )}
            </button>
          </form>
        )}

        {/* Provedores Sociais (Apenas no login e quando não está em confirmação) */}
        {mode === 'signin' && !pendingEmailConfirm && (
          <>
            <div className="relative flex items-center justify-center my-4.5">
              <div className="border-t border-slate-100 w-full" />
              <span className="bg-white px-3 text-[12px] font-medium text-slate-600 select-none">
                ou continue com
              </span>
            </div>

            {/* Google Ativo + Apple Desativado com "Em breve" */}
            <div className="grid grid-cols-2 gap-3">
              {/* Google Button - 100% Funcional */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="h-[48px] rounded-full border border-slate-200 hover:border-slate-300 bg-white flex items-center justify-center gap-2 transition-colors active:scale-98 shadow-2xs cursor-pointer"
                title="Entrar com Google"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="text-[13px] font-bold text-slate-700">Google</span>
              </button>

              {/* Apple Button - Visível, Desativado com "Em breve" */}
              <button
                type="button"
                disabled={true}
                className="h-[48px] rounded-full border border-slate-200/60 bg-slate-50/70 flex items-center justify-center gap-1.5 opacity-55 cursor-not-allowed select-none"
                title="Login com Apple estará disponível em breve"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#000000" className="opacity-70">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.66-.82 1.11-1.96.99-3.1-.96.04-2.17.65-2.85 1.45-.59.68-1.12 1.83-.98 2.95 1.08.08 2.18-.48 2.84-1.3" />
                </svg>
                <span className="text-[12.5px] font-bold text-slate-600">Apple</span>
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-200/60 px-1.5 py-0.2 rounded-full">
                  Em breve
                </span>
              </button>
            </div>

            {/* Opção Explícita de Demonstração */}
            <div className="pt-3">
              <button
                type="button"
                onClick={handleStartDemo}
                className="w-full h-[44px] rounded-full border border-emerald-200/80 hover:border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100/60 text-emerald-800 text-[12.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-98"
              >
                <span>✨ Experimentar Demonstração (Sem Cadastro)</span>
              </button>
            </div>
          </>
        )}

        {mode === 'signup' && !pendingEmailConfirm && (
          <div className="pt-2.5 text-center">
            <button
              type="button"
              onClick={handleStartDemo}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              Quer testar antes? Experimente a demonstração offline
            </button>
          </div>
        )}
      </div>

      {/* Rodapé Alternador de Modos (Sem o aviso do Supabase, conforme Requisito 3) */}
      <div className="mt-4 pb-2 flex flex-col items-center gap-2 w-full">
        <p className="text-[13px] text-slate-500 font-medium text-center">
          {mode === 'signin' ? (
            <>
              Não tem uma conta?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setPendingEmailConfirm(false);
                }}
                className="text-[#00D26A] font-bold hover:underline cursor-pointer"
              >
                Criar Conta Grátis
              </button>
            </>
          ) : (
            <>
              Já possui uma conta?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setPendingEmailConfirm(false);
                }}
                className="text-[#00D26A] font-bold hover:underline cursor-pointer"
              >
                Fazer Login
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );

  // If used as full screen standalone view
  if (isFullScreen) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-[#E8FAF0] via-[#F4FBF7] to-[#FFFFFF] flex flex-col items-center justify-between px-5 pt-8 pb-4 animate-fade-in">
        {content}
      </div>
    );
  }

  // If used as modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in overflow-y-auto">
      {content}
    </div>
  );
};
