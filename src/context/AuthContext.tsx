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
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  deleteAccount: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfilePlan: (tier: 'free' | 'premium', status?: SubscriptionStatus) => Promise<void>;
  updateMonthlyBudget: (budget: number, weeklyTarget: number) => Promise<void>;
  switchDemoUser: (userId: string) => void;
  toggleDemoMode: (enabled: boolean) => void;
  completeOnboarding: () => void;
  replayOnboarding: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_PROFILE_KEY = 'finexpress_profile';
const LOCAL_STORAGE_USERS_KEY = 'finexpress_custom_users';
const LOCAL_STORAGE_ONBOARDING_KEY = 'finexpress_onboarding_completed';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(!isSupabaseConfigured);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean>(() => {
    return localStorage.getItem(LOCAL_STORAGE_ONBOARDING_KEY) === 'true';
  });

  // Load session
  useEffect(() => {
    async function initAuth() {
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
          console.warn('Supabase auth session check failed, using sandbox mode:', err);
        }
      }

      // Demo/Local session fallback
      const savedProfile = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
      if (savedProfile) {
        try {
          const parsed = JSON.parse(savedProfile);
          setProfile(parsed);
          setUser({ id: parsed.id, email: parsed.email });
        } catch (e) {
          useDefaultDemoUser();
        }
      } else {
        useDefaultDemoUser();
      }
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
          setUser(null);
          setProfile(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const useDefaultDemoUser = () => {
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
    if (isSupabaseConfigured && !isDemo) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email || '' });
        await fetchSupabaseProfile(data.user.id, data.user.email || '');
      }
      return { error: null };
    }

    // Demo Mode Sign In
    const knownUsers = [...DEMO_USERS];
    const customUsers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_USERS_KEY) || '[]');
    const allUsers = [...knownUsers, ...customUsers];

    const match = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (match) {
      setProfile(match);
      setUser({ id: match.id, email: match.email });
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(match));
      return { error: null };
    }

    const newDemoUser: UserProfile = {
      id: `user-${Date.now()}`,
      email,
      full_name: email.split('@')[0],
      plan_tier: 'free',
      subscription_status: 'trialing',
      monthly_budget: 3500.00,
      weekly_saving_target: 250.00,
      trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };
    customUsers.push(newDemoUser);
    localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(customUsers));
    setProfile(newDemoUser);
    setUser({ id: newDemoUser.id, email: newDemoUser.email });
    localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newDemoUser));
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && !isDemo) {
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
      }
      return { error: null };
    }

    const customUsers = JSON.parse(localStorage.getItem(LOCAL_STORAGE_USERS_KEY) || '[]');
    const newDemoUser: UserProfile = {
      id: `user-${Date.now()}`,
      email,
      full_name: fullName || email.split('@')[0],
      plan_tier: 'free',
      subscription_status: 'trialing',
      monthly_budget: 3500.00,
      weekly_saving_target: 250.00,
      trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };
    customUsers.push(newDemoUser);
    localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(customUsers));
    setProfile(newDemoUser);
    setUser({ id: newDemoUser.id, email: newDemoUser.email });
    localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newDemoUser));
    return { error: null };
  };

  const resetPassword = async (email: string): Promise<{ error: string | null }> => {
    if (isSupabaseConfigured && !isDemo) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) return { error: error.message };
      return { error: null };
    }
    // Sandbox simulated reset
    return { error: null };
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
    localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
    return { error: null };
  };

  const signOut = async () => {
    if (isSupabaseConfigured && !isDemo) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setProfile(null);
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
    if (!profile) return;
    const updated: UserProfile = { ...profile, monthly_budget: budget, weekly_saving_target: weeklyTarget };
    setProfile(updated);
    localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(updated));

    if (isSupabaseConfigured && !isDemo && user) {
      await supabase.from('profiles').update({
        monthly_budget: budget,
        weekly_saving_target: weeklyTarget,
      }).eq('id', user.id);
    }
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
      useDefaultDemoUser();
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
        resetPassword,
        updatePassword,
        deleteAccount,
        signOut,
        updateProfilePlan,
        updateMonthlyBudget,
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
