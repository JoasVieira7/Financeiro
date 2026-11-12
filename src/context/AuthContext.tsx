import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, SubscriptionStatus } from '../types';
import { DEMO_USERS } from '../lib/demoStorage';
import { unsubscribeUserFromPush } from '../lib/pushNotifications';

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  isDemo: boolean;
  hasSeenOnboarding: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null; emailConfirmationRequired?: boolean }>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<{ error: string | null }>;
  startDemoSession: () => void;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfilePlan: (tier: 'free' | 'premium', status?: SubscriptionStatus) => Promise<void>;
  updateMonthlyBudget: (budget: number, weeklyTarget: number, periodPreference?: 'weekly' | 'monthly') => Promise<void>;
  setBudgetPeriodPreference: (period: 'weekly' | 'monthly') => Promise<void>;
  updateProfileData: (updates: {
    full_name?: string;
    avatar_url?: string | null;
    monthly_budget?: number;
    weekly_saving_target?: number;
    budget_period_preference?: 'weekly' | 'monthly';
  }) => Promise<{ error?: string }>;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  switchDemoUser: (userId: string) => void;
  toggleDemoMode: (enabled: boolean) => void;
  completeOnboarding: () => void;
  replayOnboarding: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_PROFILE_KEY = 'finexpress_profile';
const LOCAL_STORAGE_USERS_KEY = 'finexpress_custom_users';
const LOCAL_STORAGE_ONBOARDING_KEY = 'finexpress_onboarding_completed';
const LOCAL_STORAGE_NOTIFS_KEY = 'finexpress_notifications_enabled';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(!isSupabaseConfigured);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean>(() => {
    return localStorage.getItem(LOCAL_STORAGE_ONBOARDING_KEY) === 'true';
  });
  const [notificationsEnabled, setNotificationsEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_NOTIFS_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const setNotificationsEnabled = (enabled: boolean) => {
    setNotificationsEnabledState(enabled);
    localStorage.setItem(LOCAL_STORAGE_NOTIFS_KEY, String(enabled));
  };

  // Load session
  useEffect(() => {
    async function initAuth() {
      // 1. Verifica sessão real no Supabase caso configurado
      if (isSupabaseConfigured) {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) throw error;

          if (session?.user) {
            setUser({ id: session.user.id, email: session.user.email || '' });
            await fetchSupabaseProfile(session.user.id, session.user.email || '');
            setIsDemo(false);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Supabase auth session check failed:', err);
        }
      }

      // 2. Se não há sessão Supabase, verifica se há sessão demo voluntária salva no localStorage
      const savedProfile = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
      if (savedProfile) {
        try {
          const parsed = JSON.parse(savedProfile);
          if (parsed && parsed.id && parsed.email) {
            setProfile(parsed);
            setUser({ id: parsed.id, email: parsed.email });
            setIsDemo(true);
            setLoading(false);
            return;
          }
        } catch (e) {
          localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
        }
      }

      // 3. Sem sessão ativa: NUNCA loga automaticamente. Mantém user = null para exibir tela de login.
      setUser(null);
      setProfile(null);
      setIsDemo(!isSupabaseConfigured);
      setLoading(false);
    }

    initAuth();

    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email || '' });
          await fetchSupabaseProfile(session.user.id, session.user.email || '');
          setIsDemo(false);
        } else {
          // Se deslogou no Supabase, limpa estados
          setUser(null);
          setProfile(null);
          localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  // Inicia sessão de demonstração voluntária e explícita
  const startDemoSession = () => {
    const defaultUser = DEMO_USERS[0];
    setProfile(defaultUser);
    setUser({ id: defaultUser.id, email: defaultUser.email });
    localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(defaultUser));
    setIsDemo(true);
  };

  const fetchSupabaseProfile = async (userId: string, email: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile from Supabase:', error);
      }

      if (data) {
        const localPref = (localStorage.getItem('finexpress_budget_period_pref') as 'weekly' | 'monthly') || 'monthly';
        setProfile({
          ...data,
          budget_period_preference: data.budget_period_preference || localPref,
        });
      } else {
        const localPref = (localStorage.getItem('finexpress_budget_period_pref') as 'weekly' | 'monthly') || 'monthly';
        const newProfile: UserProfile = {
          id: userId,
          email,
          full_name: email.split('@')[0],
          plan_tier: 'free',
          subscription_status: 'trialing',
          monthly_budget: 3500.00,
          weekly_saving_target: 250.00,
          budget_period_preference: localPref,
          trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          created_at: new Date().toISOString(),
        };
        await supabase.from('profiles').upsert(newProfile);
        setProfile(newProfile);
      }
    } catch (e) {
      console.error('Error handling profile:', e);
    }
  };

  const translateAuthError = (message: string): string => {
    const lower = (message || '').toLowerCase();
    if (lower.includes('user already registered') || lower.includes('already exists')) {
      return 'Este e-mail já está cadastrado. Tente fazer login ou solicite a recuperação de senha.';
    }
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
      return 'E-mail ou senha incorretos. Verifique suas credenciais.';
    }
    if (lower.includes('email not confirmed')) {
      return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada e spam para ativar a conta.';
    }
    if (lower.includes('password should be at least') || lower.includes('password is too short')) {
      return 'A senha deve conter no mínimo 6 caracteres.';
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return 'Muitas tentativas em pouco tempo. Por segurança, aguarde alguns minutos e tente novamente.';
    }
    if (lower.includes('invalid email') || lower.includes('valid email')) {
      return 'Formato de e-mail inválido. Verifique o endereço digitado.';
    }
    return message || 'Ocorreu um erro na autenticação.';
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: translateAuthError(error.message) };
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email || '' });
        await fetchSupabaseProfile(data.user.id, data.user.email || '');
        setIsDemo(false);
      }
      return { error: null };
    }

    // Se o Supabase não estiver configurado, não cria sessão fictícia: orienta com clareza
    return {
      error: 'O Supabase não está configurado neste ambiente. Conecte sua instância ou clique em "Experimentar demonstração" para testar o aplicativo.',
    };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string
  ): Promise<{ error: string | null; emailConfirmationRequired?: boolean }> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) return { error: translateAuthError(error.message) };

      // Se o usuário já existia previamente, o Supabase retorna identities vazio
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return {
          error: 'Este e-mail já está cadastrado no sistema. Por favor, faça login ou recupere sua senha.',
        };
      }

      // Se a confirmação de e-mail estiver habilitada, data.session virá como null
      if (data.user && !data.session) {
        return {
          error: null,
          emailConfirmationRequired: true,
        };
      }

      // Se a sessão foi iniciada imediatamente (ex: auto-confirm ativado no Supabase)
      if (data.user && data.session) {
        setUser({ id: data.user.id, email: data.user.email || '' });
        await fetchSupabaseProfile(data.user.id, data.user.email || '');
        setIsDemo(false);
        return { error: null, emailConfirmationRequired: false };
      }

      return { error: null };
    }

    return {
      error: 'O cadastro em nuvem requer o Supabase configurado. Utilize a opção "Experimentar demonstração" para explorar as funcionalidades.',
    };
  };

  const signInWithOAuth = async (provider: 'google' | 'apple'): Promise<{ error: string | null }> => {
    if (!isSupabaseConfigured) {
      return {
        error: `O login com ${provider === 'google' ? 'Google' : 'Apple'} requer o Supabase configurado neste ambiente (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na Vercel). Use a opção "Experimentar demonstração" para testar o app.`,
      };
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) {
        return { error: `Erro no login com ${provider === 'google' ? 'Google' : 'Apple'}: ${error.message}` };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message || `Erro ao inicializar login com ${provider}.` };
    }
  };

  const resetPassword = async (email: string): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) return { error: error.message };
      return { error: null };
    }
    return {
      error: 'A recuperação de senha em nuvem requer conexão ativa com o Supabase.',
    };
  };

  const updatePassword = async (newPassword: string): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && !isDemo) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      return { error: null };
    }
    return { error: null };
  };

  const deleteAccount = async (): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && !isDemo) {
      try {
        // Call RPC function to delete account and cascade
        const { error } = await supabase.rpc('delete_user_account');
        if (error) {
          // Fallback delete profile
          await supabase.from('profiles').delete().eq('id', user?.id);
        }
        await supabase.auth.signOut();
      } catch (err: any) {
        return { error: err.message || 'Erro ao excluir conta' };
      }
    }

    // Clean local storage for this user
    setUser(null);
    setProfile(null);
    setIsDemo(false);
    localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
    return { error: null };
  };

  const signOut = async () => {
    if (user?.id) {
      // SEC-02: Desinscreve o endpoint push do dispositivo atual para não receber notificações de terceiros
      try {
        await unsubscribeUserFromPush(user.id);
      } catch (e) {
        console.warn('Erro ao desinscrever push no logout:', e);
      }
    }

    if (isSupabaseConfigured && !isDemo) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Erro ao deslogar do Supabase:', err);
      }
    }
    setUser(null);
    setProfile(null);
    setIsDemo(false);
    localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
  };

  const updateProfilePlan = async (_tier: 'free' | 'premium', _status: SubscriptionStatus = 'active') => {
    // A alteração de plano é estritamente gerenciada pelo backend/webhook oficial de pagamentos.
    // O cliente não pode alterar seu próprio plan_tier. Sincroniza o perfil legítimo:
    if (isSupabaseConfigured && !isDemo && user) {
      await fetchSupabaseProfile(user.id, user.email);
    }
  };

  const updateMonthlyBudget = async (
    budget: number,
    weeklyTarget: number,
    periodPreference?: 'weekly' | 'monthly'
  ) => {
    await updateProfileData({
      monthly_budget: budget,
      weekly_saving_target: weeklyTarget,
      ...(periodPreference ? { budget_period_preference: periodPreference } : {}),
    });
  };

  const setBudgetPeriodPreference = async (period: 'weekly' | 'monthly') => {
    localStorage.setItem('finexpress_budget_period_pref', period);
    if (profile) {
      await updateProfileData({ budget_period_preference: period });
    }
  };

  const updateProfileData = async (updates: {
    full_name?: string;
    avatar_url?: string | null;
    monthly_budget?: number;
    weekly_saving_target?: number;
    budget_period_preference?: 'weekly' | 'monthly';
  }): Promise<{ error?: string }> => {
    if (!profile) return { error: 'Perfil não encontrado' };

    if (updates.budget_period_preference) {
      localStorage.setItem('finexpress_budget_period_pref', updates.budget_period_preference);
    }

    const updated: UserProfile = {
      ...profile,
      ...(updates.full_name !== undefined ? { full_name: updates.full_name.trim() } : {}),
      ...(updates.avatar_url !== undefined ? { avatar_url: updates.avatar_url || undefined } : {}),
      ...(updates.monthly_budget !== undefined ? { monthly_budget: updates.monthly_budget } : {}),
      ...(updates.weekly_saving_target !== undefined ? { weekly_saving_target: updates.weekly_saving_target } : {}),
      ...(updates.budget_period_preference !== undefined ? { budget_period_preference: updates.budget_period_preference } : {}),
    };

    setProfile(updated);
    localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(updated));

    if (isSupabaseConfigured && !isDemo && user) {
      try {
        const payload: Record<string, any> = {};
        if (updates.full_name !== undefined) payload.full_name = updates.full_name.trim();
        if (updates.avatar_url !== undefined) payload.avatar_url = updates.avatar_url;
        if (updates.monthly_budget !== undefined) payload.monthly_budget = updates.monthly_budget;
        if (updates.weekly_saving_target !== undefined) payload.weekly_saving_target = updates.weekly_saving_target;
        if (updates.budget_period_preference !== undefined) payload.budget_period_preference = updates.budget_period_preference;

        const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
        if (error) {
          // Se falhou porque a coluna budget_period_preference não existe ainda no Supabase remoto
          if (payload.budget_period_preference && (error.code === '42703' || error.message.includes('budget_period_preference'))) {
            delete payload.budget_period_preference;
            if (Object.keys(payload).length > 0) {
              await supabase.from('profiles').update(payload).eq('id', user.id);
            }
          } else {
            return { error: error.message };
          }
        }
      } catch (err: any) {
        return { error: err.message || 'Erro ao sincronizar perfil com o banco' };
      }
    }

    return {};
  };

  const switchDemoUser = (userId: string) => {
    const selected = DEMO_USERS.find(u => u.id === userId);
    if (selected) {
      setProfile(selected);
      setUser({ id: selected.id, email: selected.email });
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(selected));
      setIsDemo(true);
    }
  };

  const toggleDemoMode = (enabled: boolean) => {
    setIsDemo(enabled);
    if (enabled) {
      startDemoSession();
    }
  };

  const completeOnboarding = () => {
    localStorage.setItem(LOCAL_STORAGE_ONBOARDING_KEY, 'true');
    setHasSeenOnboarding(true);
  };

  const replayOnboarding = () => {
    setHasSeenOnboarding(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isDemo,
        hasSeenOnboarding,
        signIn,
        signUp,
        signInWithOAuth,
        startDemoSession,
        resetPassword,
        updatePassword,
        deleteAccount,
        signOut,
        updateProfilePlan,
        updateMonthlyBudget,
        setBudgetPeriodPreference,
        updateProfileData,
        notificationsEnabled,
        setNotificationsEnabled,
        switchDemoUser,
        toggleDemoMode,
        completeOnboarding,
        replayOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
