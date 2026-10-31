import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, SubscriptionStatus } from '../types';
import { DEMO_USERS } from '../lib/demoStorage';

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  isDemo: boolean;
  hasSeenOnboarding: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<{ error: string | null }>;
  startDemoSession: () => void;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfilePlan: (tier: 'free' | 'premium', status?: SubscriptionStatus) => Promise<void>;
  updateMonthlyBudget: (budget: number, weeklyTarget: number) => Promise<void>;
  updateProfileData: (updates: {
    full_name?: string;
    avatar_url?: string | null;
    monthly_budget?: number;
    weekly_saving_target?: number;
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
        setProfile(data);
      } else {
        const newProfile: UserProfile = {
          id: userId,
          email,
          full_name: email.split('@')[0],
          plan_tier: 'free',
          subscription_status: 'trialing',
          monthly_budget: 3500.00,
          weekly_saving_target: 250.00,
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

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
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

  const signUp = async (email: string, password: string, fullName: string): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      if (error) return { error: error.message };
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email || '' });
        await fetchSupabaseProfile(data.user.id, data.user.email || '');
        setIsDemo(false);
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
        error: `O login com ${provider === 'google' ? 'Google' : 'Apple'} requer o Supabase configurado com provedor OAuth ativo. Use a opção "Experimentar demonstração" para testar o app.`,
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

  const updateProfilePlan = async (tier: 'free' | 'premium', status: SubscriptionStatus = 'active') => {
    if (!profile) return;
    const updated: UserProfile = {
      ...profile,
      plan_tier: tier,
      subscription_status: tier === 'premium' ? status : 'inactive',
      current_period_end: tier === 'premium' ? new Date(Date.now() + 30 * 86400000).toISOString() : undefined,
    };
    setProfile(updated);
    localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(updated));

    if (isSupabaseConfigured && !isDemo && user) {
      await supabase.from('profiles').update({
        plan_tier: tier,
        subscription_status: updated.subscription_status,
        current_period_end: updated.current_period_end,
      }).eq('id', user.id);
    }
  };

  const updateMonthlyBudget = async (budget: number, weeklyTarget: number) => {
    await updateProfileData({ monthly_budget: budget, weekly_saving_target: weeklyTarget });
  };

  const updateProfileData = async (updates: {
    full_name?: string;
    avatar_url?: string | null;
    monthly_budget?: number;
    weekly_saving_target?: number;
  }): Promise<{ error?: string }> => {
    if (!profile) return { error: 'Perfil não encontrado' };

    const updated: UserProfile = {
      ...profile,
      ...(updates.full_name !== undefined ? { full_name: updates.full_name.trim() } : {}),
      ...(updates.avatar_url !== undefined ? { avatar_url: updates.avatar_url || undefined } : {}),
      ...(updates.monthly_budget !== undefined ? { monthly_budget: updates.monthly_budget } : {}),
      ...(updates.weekly_saving_target !== undefined ? { weekly_saving_target: updates.weekly_saving_target } : {}),
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

        const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
        if (error) return { error: error.message };
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
