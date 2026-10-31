import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  Transaction,
  SavingsGoal,
  RecurringExpense,
  GoalContribution,
  TransactionCategory,
  PaymentMethod,
  TransactionType,
  DashboardStats,
  CategorySummary,
  PLAN_LIMITS,
} from '../types';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  INITIAL_TRANSACTIONS,
  INITIAL_GOALS,
  INITIAL_RECURRING,
  INITIAL_CONTRIBUTIONS,
} from '../lib/demoStorage';
import { getInstallmentDates, calculateInstallmentAmounts } from '../lib/formatters';

export const CATEGORY_COLORS: Record<
  TransactionCategory,
  { color: string; bg: string; icon: string; defaultLimit: number }
> = {
  Alimentação: { color: '#F59E0B', bg: 'bg-amber-500/10', icon: '🍔', defaultLimit: 1200 },
  Transporte: { color: '#38BDF8', bg: 'bg-sky-500/10', icon: '🚗', defaultLimit: 500 },
  Moradia: { color: '#818CF8', bg: 'bg-indigo-500/10', icon: '🏠', defaultLimit: 1800 },
  Contas: { color: '#A855F7', bg: 'bg-purple-500/10', icon: '⚡', defaultLimit: 600 },
  Saúde: { color: '#FB7185', bg: 'bg-rose-500/10', icon: '🩺', defaultLimit: 400 },
  Lazer: { color: '#EC4899', bg: 'bg-pink-500/10', icon: '🍿', defaultLimit: 450 },
  Compras: { color: '#F97316', bg: 'bg-orange-500/10', icon: '🛍️', defaultLimit: 700 },
  Salário: { color: '#10B981', bg: 'bg-emerald-500/10', icon: '💰', defaultLimit: 0 },
  Outros: { color: '#00F59B', bg: 'bg-teal-500/10', icon: '🏷️', defaultLimit: 300 },
};

export interface AddInstallmentExpenseParams {
  totalAmount: number;
  installments: number;
  startDate: Date | string;
  category: TransactionCategory;
  paymentMethod: PaymentMethod;
  description?: string;
  notes?: string;
}

interface FinanceContextType {
  transactions: Transaction[];
  goals: SavingsGoal[];
  goalContributions: GoalContribution[];
  recurringExpenses: RecurringExpense[];
  stats: DashboardStats;
  loading: boolean;
  addTransaction: (
    amount: number,
    category: TransactionCategory,
    paymentMethod: PaymentMethod,
    description?: string,
    type?: TransactionType,
    isRecurring?: boolean,
    notes?: string
  ) => Promise<{ success: boolean; error?: string }>;
  addInstallmentExpense: (
    params: AddInstallmentExpenseParams
  ) => Promise<{ success: boolean; error?: string }>;
  updateTransaction: (
    id: string,
    updates: Partial<Omit<Transaction, 'id' | 'user_id' | 'created_at'>>,
    updateAllInstallments?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  deleteTransaction: (id: string, deleteAllInstallments?: boolean) => Promise<void>;
  addSavingsGoal: (
    title: string,
    targetAmount: number,
    deadline?: string,
    icon?: string,
    color?: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateSavingsGoal: (
    goalId: string,
    updates: Partial<Omit<SavingsGoal, 'id' | 'user_id' | 'created_at'>>
  ) => Promise<{ success: boolean; error?: string }>;
  contributeToGoal: (
    goalId: string,
    amount: number,
    type?: 'deposit' | 'withdraw',
    notes?: string
  ) => Promise<{ success: boolean; error?: string }>;
  deleteSavingsGoal: (goalId: string) => Promise<void>;
  getGoalContributions: (goalId: string) => GoalContribution[];
  updateCategoryLimit: (category: TransactionCategory, limit: number) => Promise<void>;
  toggleGoalCompleted: (goalId: string) => Promise<{ success: boolean; error?: string }>;
  addRecurringExpense: (
    description: string,
    amount: number,
    category: TransactionCategory,
    paymentMethod: PaymentMethod,
    dueDay: number
  ) => Promise<{ success: boolean; error?: string }>;
  deleteRecurringExpense: (id: string) => Promise<void>;
  toggleRecurringExpense: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

const LOCAL_STORAGE_TX_KEY = 'finexpress_transactions';
const LOCAL_STORAGE_GOALS_KEY = 'finexpress_goals';
const LOCAL_STORAGE_CONTRIB_KEY = 'finexpress_goal_contributions';
const LOCAL_STORAGE_RECURRING_KEY = 'finexpress_recurring';
const LOCAL_STORAGE_CAT_LIMITS_KEY = 'finexpress_cat_limits';

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isDemo } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [goalContributions, setGoalContributions] = useState<GoalContribution[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [customCatLimits, setCustomCatLimits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSubmissionTime, setLastSubmissionTime] = useState<number>(0);

  const loadData = async () => {
    if (!user) {
      setTransactions([]);
      setGoals([]);
      setGoalContributions([]);
      setRecurringExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (isSupabaseConfigured && !isDemo) {
      try {
        const [txRes, goalsRes, recRes, contribRes] = await Promise.all([
          supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('savings_goals')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('recurring_expenses')
            .select('*')
            .eq('user_id', user.id)
            .order('due_day', { ascending: true }),
          supabase
            .from('goal_contributions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

        if (txRes.data) setTransactions(txRes.data);
        if (goalsRes.data) setGoals(goalsRes.data);
        if (recRes.data) setRecurringExpenses(recRes.data);
        if (contribRes.data) setGoalContributions(contribRes.data);
      } catch (err) {
        console.error('Falha ao carregar do Supabase:', err);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Demo Mode Storage
    try {
      const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
      let allTx: Transaction[] = storedTx ? JSON.parse(storedTx) : [];
      if (allTx.length === 0) {
        allTx = INITIAL_TRANSACTIONS;
        localStorage.setItem(LOCAL_STORAGE_TX_KEY, JSON.stringify(allTx));
      }

      const storedGoals = localStorage.getItem(LOCAL_STORAGE_GOALS_KEY);
      let allGoals: SavingsGoal[] = storedGoals ? JSON.parse(storedGoals) : [];
      if (allGoals.length === 0) {
        allGoals = INITIAL_GOALS;
        localStorage.setItem(LOCAL_STORAGE_GOALS_KEY, JSON.stringify(allGoals));
      }

      const storedContrib = localStorage.getItem(LOCAL_STORAGE_CONTRIB_KEY);
      let allContrib: GoalContribution[] = storedContrib ? JSON.parse(storedContrib) : [];
      if (allContrib.length === 0) {
        allContrib = INITIAL_CONTRIBUTIONS;
        localStorage.setItem(LOCAL_STORAGE_CONTRIB_KEY, JSON.stringify(allContrib));
      }

      const storedRec = localStorage.getItem(LOCAL_STORAGE_RECURRING_KEY);
      let allRec: RecurringExpense[] = storedRec ? JSON.parse(storedRec) : [];
      if (allRec.length === 0) {
        allRec = INITIAL_RECURRING;
        localStorage.setItem(LOCAL_STORAGE_RECURRING_KEY, JSON.stringify(allRec));
      }

      const storedLimits = localStorage.getItem(LOCAL_STORAGE_CAT_LIMITS_KEY);
      if (storedLimits) {
        try {
          setCustomCatLimits(JSON.parse(storedLimits));
        } catch (e) {
          // ignore
        }
      }

      setTransactions(allTx.filter(t => t.user_id === user.id));
      setGoals(allGoals.filter(g => g.user_id === user.id));
      setGoalContributions(allContrib.filter(c => c.user_id === user.id));
      setRecurringExpenses(allRec.filter(r => r.user_id === user.id));
    } catch (e) {
      console.error('Erro ao ler armazenamento local:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id, isDemo]);

  // Add transaction (validates amount, guards against rapid duplicates)
  const addTransaction = async (
    amount: number,
    category: TransactionCategory,
    paymentMethod: PaymentMethod = 'pix',
    description?: string,
    type: TransactionType = 'expense',
    isRecurring: boolean = false,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    // Validation: prevent zero or negative or NaN
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, error: 'O valor do lançamento deve ser maior que zero (R$ 0,00).' };
    }

    // Guard duplicate submissions within 800ms
    const now = Date.now();
    if (now - lastSubmissionTime < 800) {
      return { success: false, error: 'Lançamento em processamento, aguarde um instante.' };
    }
    setLastSubmissionTime(now);

    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      user_id: user.id,
      amount: numAmount,
      category,
      payment_method: paymentMethod,
      description: description?.trim() || `${category}`,
      type,
      is_recurring: isRecurring,
      notes: notes?.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    setTransactions(prev => [newTx, ...prev]);

    if (isSupabaseConfigured && !isDemo) {
      try {
        const { error } = await supabase.from('transactions').insert([
          {
            user_id: user.id,
            amount: newTx.amount,
            category: newTx.category,
            payment_method: newTx.payment_method,
            description: newTx.description,
            type: newTx.type,
            is_recurring: newTx.is_recurring,
            notes: newTx.notes,
            created_at: newTx.created_at,
          },
        ]);

        if (error) {
          setTransactions(prev => prev.filter(t => t.id !== newTx.id));
          return { success: false, error: error.message };
        }
      } catch (err: any) {
        setTransactions(prev => prev.filter(t => t.id !== newTx.id));
        return { success: false, error: err.message };
      }
    } else {
      const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
      const allTx: Transaction[] = storedTx ? JSON.parse(storedTx) : [];
      allTx.unshift(newTx);
      localStorage.setItem(LOCAL_STORAGE_TX_KEY, JSON.stringify(allTx));
    }

    return { success: true };
  };

  // Registrar compra parcelada
  const addInstallmentExpense = async ({
    totalAmount,
    installments,
    startDate,
    category,
    paymentMethod,
    description,
    notes,
  }: AddInstallmentExpenseParams): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    const numTotal = Number(totalAmount);
    if (isNaN(numTotal) || numTotal <= 0) {
      return { success: false, error: 'O valor total deve ser maior que zero (R$ 0,00).' };
    }

    const numInstallments = parseInt(String(installments), 10);
    if (isNaN(numInstallments) || numInstallments < 2) {
      return { success: false, error: 'O parcelamento requer no mínimo 2 parcelas.' };
    }

    const parsedStartDate = typeof startDate === 'string' ? new Date(startDate) : startDate;
    if (isNaN(parsedStartDate.getTime())) {
      return { success: false, error: 'Data da primeira parcela inválida.' };
    }

    // Previne envios duplicados em menos de 800ms
    const now = Date.now();
    if (now - lastSubmissionTime < 800) {
      return { success: false, error: 'Lançamento em processamento, aguarde um instante.' };
    }
    setLastSubmissionTime(now);

    const groupId = `inst-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const dates = getInstallmentDates(parsedStartDate, numInstallments);
    const amounts = calculateInstallmentAmounts(numTotal, numInstallments);
    const finalDescription = description?.trim() || `${category}`;

    const newTxList: Transaction[] = [];
    for (let i = 0; i < numInstallments; i++) {
      newTxList.push({
        id: `tx-inst-${Date.now()}-${i + 1}-${Math.random().toString(36).substr(2, 4)}`,
        user_id: user.id,
        amount: amounts[i],
        category,
        payment_method: paymentMethod,
        description: finalDescription,
        type: 'expense',
        is_recurring: false,
        notes: notes?.trim() || undefined,
        created_at: dates[i].toISOString(),
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: numInstallments,
        installment_purchase_amount: numTotal,
      });
    }

    // Atualiza estado local mantendo ordenação decrescente por data
    setTransactions(prev => {
      const merged = [...newTxList, ...prev];
      return merged.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    if (isSupabaseConfigured && !isDemo) {
      try {
        const payload = newTxList.map(t => ({
          user_id: user.id,
          amount: t.amount,
          category: t.category,
          payment_method: t.payment_method,
          description: t.description,
          type: t.type,
          is_recurring: t.is_recurring,
          notes: t.notes,
          created_at: t.created_at,
          installment_group_id: t.installment_group_id,
          installment_number: t.installment_number,
          installment_total: t.installment_total,
          installment_purchase_amount: t.installment_purchase_amount,
        }));

        const { error } = await supabase.from('transactions').insert(payload);
        if (error) {
          setTransactions(prev => prev.filter(t => t.installment_group_id !== groupId));
          return { success: false, error: error.message };
        }
      } catch (err: any) {
        setTransactions(prev => prev.filter(t => t.installment_group_id !== groupId));
        return { success: false, error: err.message };
      }
    } else {
      const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
      const allTx: Transaction[] = storedTx ? JSON.parse(storedTx) : [];
      allTx.unshift(...newTxList);
      allTx.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      localStorage.setItem(LOCAL_STORAGE_TX_KEY, JSON.stringify(allTx));
    }

    return { success: true };
  };

  const updateTransaction = async (
    id: string,
    updates: Partial<Omit<Transaction, 'id' | 'user_id' | 'created_at'>>,
    updateAllInstallments: boolean = false
  ): Promise<{ success: boolean; error?: string }> => {
    if (updates.amount !== undefined) {
      const numAmount = Number(updates.amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return { success: false, error: 'O valor deve ser maior que zero.' };
      }
      updates.amount = numAmount;
    }

    const targetTx = transactions.find(t => t.id === id);
    const hasGroup = Boolean(targetTx?.installment_group_id);
    const shouldUpdateGroup = updateAllInstallments && hasGroup;
    const groupId = targetTx?.installment_group_id;

    // Se atualizar todo o grupo, remove amount dos campos propagados para não sobrescrever
    // parcelas que possam ter centavos diferentes
    const groupUpdates = { ...updates };
    if (shouldUpdateGroup) {
      delete groupUpdates.amount;
      delete groupUpdates.installment_number;
    }

    setTransactions(prev =>
      prev.map(t => {
        if (shouldUpdateGroup && t.installment_group_id === groupId) {
          return { ...t, ...groupUpdates };
        }
        if (t.id === id) {
          return { ...t, ...updates };
        }
        return t;
      })
    );

    if (isSupabaseConfigured && !isDemo) {
      if (shouldUpdateGroup && groupId) {
        const { error } = await supabase
          .from('transactions')
          .update(groupUpdates)
          .eq('installment_group_id', groupId);
        if (error) return { success: false, error: error.message };
      } else {
        const { error } = await supabase
          .from('transactions')
          .update(updates)
          .eq('id', id);
        if (error) return { success: false, error: error.message };
      }
    } else {
      const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
      if (storedTx) {
        const allTx: Transaction[] = JSON.parse(storedTx);
        const updated = allTx.map(t => {
          if (shouldUpdateGroup && t.installment_group_id === groupId) {
            return { ...t, ...groupUpdates };
          }
          if (t.id === id) {
            return { ...t, ...updates };
          }
          return t;
        });
        localStorage.setItem(LOCAL_STORAGE_TX_KEY, JSON.stringify(updated));
      }
    }

    return { success: true };
  };

  const deleteTransaction = async (id: string, deleteAllInstallments: boolean = false) => {
    const targetTx = transactions.find(t => t.id === id);
    const hasGroup = Boolean(targetTx?.installment_group_id);
    const shouldDeleteGroup = deleteAllInstallments && hasGroup;
    const groupId = targetTx?.installment_group_id;

    if (shouldDeleteGroup && groupId) {
      setTransactions(prev => prev.filter(t => t.installment_group_id !== groupId));

      if (isSupabaseConfigured && !isDemo) {
        await supabase.from('transactions').delete().eq('installment_group_id', groupId);
      } else {
        const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
        if (storedTx) {
          const allTx: Transaction[] = JSON.parse(storedTx);
          localStorage.setItem(
            LOCAL_STORAGE_TX_KEY,
            JSON.stringify(allTx.filter(t => t.installment_group_id !== groupId))
          );
        }
      }
    } else {
      setTransactions(prev => prev.filter(t => t.id !== id));

      if (isSupabaseConfigured && !isDemo) {
        await supabase.from('transactions').delete().eq('id', id);
      } else {
        const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
        if (storedTx) {
          const allTx: Transaction[] = JSON.parse(storedTx);
          localStorage.setItem(
            LOCAL_STORAGE_TX_KEY,
            JSON.stringify(allTx.filter(t => t.id !== id))
          );
        }
      }
    }
  };

  const addSavingsGoal = async (
    title: string,
    targetAmount: number,
    deadline?: string,
    icon: string = 'target',
    color: string = 'emerald'
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    const numTarget = Number(targetAmount);
    if (isNaN(numTarget) || numTarget <= 0) {
      return { success: false, error: 'O valor objetivo deve ser maior que zero.' };
    }

    // Check free plan limits (2 active goals max on free tier, completed goals don't count)
    const currentTier = profile?.plan_tier || 'free';
    const limit = PLAN_LIMITS[currentTier].maxGoals;
    const activeGoals = goals.filter(
      g => (g.current_amount || 0) < g.target_amount && !g.is_completed
    );
    if (activeGoals.length >= limit) {
      return {
        success: false,
        error: `O plano gratuito permite até ${limit} metas ativas simultâneas. Conclua uma meta existente ou faça upgrade para o Plano Premium.`,
      };
    }

    const newGoal: SavingsGoal = {
      id: `goal-${Date.now()}`,
      user_id: user.id,
      title: title.trim(),
      target_amount: numTarget,
      current_amount: 0,
      deadline,
      icon,
      color,
      is_completed: false,
      category: 'reserva',
      created_at: new Date().toISOString(),
    };

    setGoals(prev => [newGoal, ...prev]);

    if (isSupabaseConfigured && !isDemo) {
      const { error } = await supabase.from('savings_goals').insert([
        {
          user_id: user.id,
          title: newGoal.title,
          target_amount: newGoal.target_amount,
          current_amount: 0,
          deadline: newGoal.deadline,
          icon: newGoal.icon,
          color: newGoal.color,
          is_completed: false,
        },
      ]);
      if (error) {
        // Reverte estado local se o backend rejeitar
        setGoals(prev => prev.filter(g => g.id !== newGoal.id));
        return { success: false, error: error.message };
      }
    } else {
      const storedGoals = localStorage.getItem(LOCAL_STORAGE_GOALS_KEY);
      const allGoals: SavingsGoal[] = storedGoals ? JSON.parse(storedGoals) : [];
      allGoals.unshift(newGoal);
      localStorage.setItem(LOCAL_STORAGE_GOALS_KEY, JSON.stringify(allGoals));
    }

    return { success: true };
  };

  const toggleGoalCompleted = async (goalId: string): Promise<{ success: boolean; error?: string }> => {
    const targetGoal = goals.find(g => g.id === goalId);
    if (!targetGoal) return { success: false, error: 'Meta não encontrada.' };

    const nextCompleted = !targetGoal.is_completed;

    // Regra consistente: impede marcar como concluída meta sem saldo acumulado
    if (nextCompleted && (targetGoal.current_amount || 0) === 0) {
      return {
        success: false,
        error: 'Uma meta com saldo zero não pode ser marcada como concluída. Caso queira cancelá-la, exclua a meta.',
      };
    }

    // Se estiver reabrindo como ativa, valida o limite do plano Free
    if (!nextCompleted) {
      const currentTier = profile?.plan_tier || 'free';
      const limit = PLAN_LIMITS[currentTier].maxGoals;
      const otherActiveGoals = goals.filter(
        g => g.id !== goalId && (g.current_amount || 0) < g.target_amount && !g.is_completed
      );
      if (otherActiveGoals.length >= limit) {
        return {
          success: false,
          error: `Você já possui ${limit} metas ativas no plano Free. Conclua outra meta ou faça upgrade para reabrir esta.`,
        };
      }
    }

    setGoals(prev =>
      prev.map(g => (g.id === goalId ? { ...g, is_completed: nextCompleted } : g))
    );

    if (isSupabaseConfigured && !isDemo) {
      const { error } = await supabase
        .from('savings_goals')
        .update({ is_completed: nextCompleted })
        .eq('id', goalId);
      if (error) {
        // Reverte estado local em caso de erro
        setGoals(prev =>
          prev.map(g => (g.id === goalId ? { ...g, is_completed: targetGoal.is_completed } : g))
        );
        return { success: false, error: error.message };
      }
    } else {
      const storedGoals = localStorage.getItem(LOCAL_STORAGE_GOALS_KEY);
      if (storedGoals) {
        const allGoals: SavingsGoal[] = JSON.parse(storedGoals);
        const updated = allGoals.map(g =>
          g.id === goalId ? { ...g, is_completed: nextCompleted } : g
        );
        localStorage.setItem(LOCAL_STORAGE_GOALS_KEY, JSON.stringify(updated));
      }
    }

    return { success: true };
  };

  const updateSavingsGoal = async (
    goalId: string,
    updates: Partial<Omit<SavingsGoal, 'id' | 'user_id' | 'created_at'>>
  ): Promise<{ success: boolean; error?: string }> => {
    if (updates.target_amount !== undefined) {
      const numTarget = Number(updates.target_amount);
      if (isNaN(numTarget) || numTarget <= 0) {
        return { success: false, error: 'O valor objetivo deve ser maior que zero.' };
      }
      updates.target_amount = numTarget;
    }

    setGoals(prev => prev.map(g => (g.id === goalId ? { ...g, ...updates } : g)));

    if (isSupabaseConfigured && !isDemo) {
      const { error } = await supabase.from('savings_goals').update(updates).eq('id', goalId);
      if (error) return { success: false, error: error.message };
    } else {
      const storedGoals = localStorage.getItem(LOCAL_STORAGE_GOALS_KEY);
      if (storedGoals) {
        const allGoals: SavingsGoal[] = JSON.parse(storedGoals);
        const updated = allGoals.map(g => (g.id === goalId ? { ...g, ...updates } : g));
        localStorage.setItem(LOCAL_STORAGE_GOALS_KEY, JSON.stringify(updated));
      }
    }
    return { success: true };
  };

  // Contribute (adicionar) or withdraw (retirar) values from a goal
  const contributeToGoal = async (
    goalId: string,
    amount: number,
    type: 'deposit' | 'withdraw' = 'deposit',
    notes?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, error: 'O valor da operação deve ser maior que zero.' };
    }

    const targetGoal = goals.find(g => g.id === goalId);
    if (!targetGoal) {
      return { success: false, error: 'Meta não encontrada.' };
    }

    if (type === 'deposit' && targetGoal.is_completed && targetGoal.current_amount >= targetGoal.target_amount) {
      return {
        success: false,
        error: 'Esta meta já atingiu 100% e está concluída. Reabra ou crie uma nova meta para novos depósitos.',
      };
    }

    if (type === 'withdraw' && targetGoal.current_amount < numAmount) {
      return {
        success: false,
        error: `Saldo insuficiente na meta. Disponível para retirada: R$ ${targetGoal.current_amount.toFixed(2).replace('.', ',')}`,
      };
    }

    const nextAmount =
      type === 'deposit'
        ? targetGoal.current_amount + numAmount
        : targetGoal.current_amount - numAmount;
    const isNowCompleted = nextAmount >= targetGoal.target_amount ? true : targetGoal.is_completed;

    // Update goal amount and completion state
    setGoals(prev =>
      prev.map(g =>
        g.id === goalId ? { ...g, current_amount: nextAmount, is_completed: isNowCompleted } : g
      )
    );

    // Create contribution log
    const contribution: GoalContribution = {
      id: `contrib-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      goal_id: goalId,
      user_id: user.id,
      amount: numAmount,
      type,
      notes: notes?.trim(),
      created_at: new Date().toISOString(),
    };

    setGoalContributions(prev => [contribution, ...prev]);

    // Also register an explicit transaction for user visibility
    if (type === 'deposit') {
      await addTransaction(
        numAmount,
        'Outros',
        'pix',
        `Aporte na Meta: ${targetGoal.title}`,
        'expense',
        false,
        notes
      );
    } else {
      await addTransaction(
        numAmount,
        'Outros',
        'pix',
        `Resgate da Meta: ${targetGoal.title}`,
        'income',
        false,
        notes
      );
    }

    if (isSupabaseConfigured && !isDemo) {
      await supabase
        .from('savings_goals')
        .update({ current_amount: nextAmount })
        .eq('id', goalId);

      await supabase.from('goal_contributions').insert([
        {
          goal_id: goalId,
          user_id: user.id,
          amount: numAmount,
          type,
          created_at: contribution.created_at,
        },
      ]);
    } else {
      // Local Storage update
      const storedGoals = localStorage.getItem(LOCAL_STORAGE_GOALS_KEY);
      if (storedGoals) {
        const allGoals: SavingsGoal[] = JSON.parse(storedGoals);
        const updated = allGoals.map(g =>
          g.id === goalId ? { ...g, current_amount: nextAmount } : g
        );
        localStorage.setItem(LOCAL_STORAGE_GOALS_KEY, JSON.stringify(updated));
      }

      const storedContrib = localStorage.getItem(LOCAL_STORAGE_CONTRIB_KEY);
      const allContrib: GoalContribution[] = storedContrib ? JSON.parse(storedContrib) : [];
      allContrib.unshift(contribution);
      localStorage.setItem(LOCAL_STORAGE_CONTRIB_KEY, JSON.stringify(allContrib));
    }

    return { success: true };
  };

  const deleteSavingsGoal = async (goalId: string) => {
    setGoals(prev => prev.filter(g => g.id !== goalId));
    setGoalContributions(prev => prev.filter(c => c.goal_id !== goalId));

    if (isSupabaseConfigured && !isDemo) {
      await supabase.from('savings_goals').delete().eq('id', goalId);
    } else {
      const storedGoals = localStorage.getItem(LOCAL_STORAGE_GOALS_KEY);
      if (storedGoals) {
        const allGoals: SavingsGoal[] = JSON.parse(storedGoals);
        localStorage.setItem(
          LOCAL_STORAGE_GOALS_KEY,
          JSON.stringify(allGoals.filter(g => g.id !== goalId))
        );
      }
      const storedContrib = localStorage.getItem(LOCAL_STORAGE_CONTRIB_KEY);
      if (storedContrib) {
        const allContrib: GoalContribution[] = JSON.parse(storedContrib);
        localStorage.setItem(
          LOCAL_STORAGE_CONTRIB_KEY,
          JSON.stringify(allContrib.filter(c => c.goal_id !== goalId))
        );
      }
    }
  };

  const getGoalContributions = (goalId: string): GoalContribution[] => {
    return goalContributions.filter(c => c.goal_id === goalId);
  };

  const updateCategoryLimit = async (category: TransactionCategory, limit: number) => {
    const updated = { ...customCatLimits, [category]: limit };
    setCustomCatLimits(updated);
    localStorage.setItem(LOCAL_STORAGE_CAT_LIMITS_KEY, JSON.stringify(updated));
  };

  const addRecurringExpense = async (
    description: string,
    amount: number,
    category: TransactionCategory,
    paymentMethod: PaymentMethod,
    dueDay: number
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    // Enforcement do plano Premium no client-side
    const currentTier = profile?.plan_tier || 'free';
    if (currentTier !== 'premium') {
      return {
        success: false,
        error: 'Despesas recorrentes são exclusivas do Plano Premium. Faça upgrade para desbloquear.',
      };
    }

    const newRec: RecurringExpense = {
      id: `rec-${Date.now()}`,
      user_id: user.id,
      description: description.trim(),
      amount: Math.abs(amount),
      category,
      payment_method: paymentMethod,
      due_day: dueDay,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    setRecurringExpenses(prev => [...prev, newRec]);

    if (isSupabaseConfigured && !isDemo) {
      const { error } = await supabase.from('recurring_expenses').insert([
        {
          user_id: user.id,
          description: newRec.description,
          amount: newRec.amount,
          category: newRec.category,
          payment_method: newRec.payment_method,
          due_day: newRec.due_day,
          is_active: true,
        },
      ]);
      if (error) {
        // Reverte estado local se o backend rejeitar
        setRecurringExpenses(prev => prev.filter(r => r.id !== newRec.id));
        return { success: false, error: error.message };
      }
    } else {
      const stored = localStorage.getItem(LOCAL_STORAGE_RECURRING_KEY);
      const all: RecurringExpense[] = stored ? JSON.parse(stored) : [];
      all.push(newRec);
      localStorage.setItem(LOCAL_STORAGE_RECURRING_KEY, JSON.stringify(all));
    }

    return { success: true };
  };

  const deleteRecurringExpense = async (id: string) => {
    setRecurringExpenses(prev => prev.filter(r => r.id !== id));

    if (isSupabaseConfigured && !isDemo) {
      await supabase.from('recurring_expenses').delete().eq('id', id);
    } else {
      const stored = localStorage.getItem(LOCAL_STORAGE_RECURRING_KEY);
      if (stored) {
        const all: RecurringExpense[] = JSON.parse(stored);
        localStorage.setItem(
          LOCAL_STORAGE_RECURRING_KEY,
          JSON.stringify(all.filter(r => r.id !== id))
        );
      }
    }
  };

  const toggleRecurringExpense = async (id: string) => {
    const item = recurringExpenses.find(r => r.id === id);
    if (!item) return;

    const nextState = !item.is_active;
    setRecurringExpenses(prev =>
      prev.map(r => (r.id === id ? { ...r, is_active: nextState } : r))
    );

    if (isSupabaseConfigured && !isDemo) {
      await supabase.from('recurring_expenses').update({ is_active: nextState }).eq('id', id);
    } else {
      const stored = localStorage.getItem(LOCAL_STORAGE_RECURRING_KEY);
      if (stored) {
        const all: RecurringExpense[] = JSON.parse(stored);
        const updated = all.map(r => (r.id === id ? { ...r, is_active: nextState } : r));
        localStorage.setItem(LOCAL_STORAGE_RECURRING_KEY, JSON.stringify(updated));
      }
    }
  };

  // Computations for dashboard stats, daily limit & category breakdown
  const stats: DashboardStats = useMemo(() => {
    const monthlyBudget = profile?.monthly_budget || 3500;
    const weeklyTarget = profile?.weekly_saving_target || 250;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Previous month computation (handles January roll-over)
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const thisMonthTx = transactions.filter(t => {
      const d = new Date(t.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const prevMonthTx = transactions.filter(t => {
      const d = new Date(t.created_at);
      return d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear;
    });

    const monthlyExpense = thisMonthTx
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const monthlyIncome = thisMonthTx
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const previousMonthExpense = prevMonthTx
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const expenseComparisonPercentage =
      previousMonthExpense > 0
        ? Math.round(((monthlyExpense - previousMonthExpense) / previousMonthExpense) * 100)
        : 0;

    // Today expenses
    const todayStr = now.toISOString().split('T')[0];
    const todayTx = transactions.filter(t => t.created_at.startsWith(todayStr));
    const todayExpense = todayTx
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const todayTransactionsCount = todayTx.length;

    // Weekly metrics
    const dayOfWeek = now.getDay() || 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeekTx = transactions.filter(t => new Date(t.created_at) >= startOfWeek);
    const thisWeekExpense = thisWeekTx
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const thisWeekIncome = thisWeekTx
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const netWeeklySavings = Math.max(
      0,
      thisWeekIncome > 0
        ? thisWeekIncome - thisWeekExpense
        : weeklyTarget - thisWeekExpense * 0.25
    );
    const weeklySavedAmount = Math.min(weeklyTarget * 1.5, Math.max(0, netWeeklySavings));
    const weeklyGoalPercentage = Math.min(
      100,
      Math.round((weeklySavedAmount / (weeklyTarget || 1)) * 100)
    );

    // Remaining budget and percentage
    const remainingBudget = Math.max(0, monthlyBudget - monthlyExpense);
    const budgetUsedPercentage = Math.min(
      100,
      Math.round((monthlyExpense / (monthlyBudget || 1)) * 100)
    );

    // Budget alert levels: 80%, 90%, 100%
    let budgetAlertLevel: 'normal' | 'warning_80' | 'warning_90' | 'exceeded_100' = 'normal';
    if (budgetUsedPercentage >= 100) {
      budgetAlertLevel = 'exceeded_100';
    } else if (budgetUsedPercentage >= 90) {
      budgetAlertLevel = 'warning_90';
    } else if (budgetUsedPercentage >= 80) {
      budgetAlertLevel = 'warning_80';
    }

    // Daily allowance calculation
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = now.getDate();
    const remainingDaysInMonth = Math.max(1, daysInCurrentMonth - currentDay + 1);
    const dailyAllowance = remainingBudget > 0 ? remainingBudget / remainingDaysInMonth : 0;

    // Total accumulated in savings goals
    const totalSavedInGoals = goals.reduce((acc, g) => acc + Number(g.current_amount || 0), 0);

    // Resumo dos gastos por categoria com limites dinâmicos
    const categoryTotals: Record<string, { amount: number; count: number }> = {};
    thisMonthTx
      .filter(t => t.type === 'expense')
      .forEach(t => {
        if (!categoryTotals[t.category]) {
          categoryTotals[t.category] = { amount: 0, count: 0 };
        }
        categoryTotals[t.category].amount += Number(t.amount);
        categoryTotals[t.category].count += 1;
      });

    const categoryBreakdown: CategorySummary[] = Object.entries(categoryTotals)
      .map(([cat, val]) => {
        const categoryKey = cat as TransactionCategory;
        const conf = CATEGORY_COLORS[categoryKey] || {
          color: '#00F59B',
          bg: '',
          icon: '🏷️',
          defaultLimit: 400,
        };
        const pct = monthlyExpense > 0 ? Math.round((val.amount / monthlyExpense) * 100) : 0;
        const catLimit = customCatLimits[cat] || conf.defaultLimit;
        const limitPct = catLimit > 0 ? Math.min(100, Math.round((val.amount / catLimit) * 100)) : 0;

        let alertLevel: 'normal' | 'warning_80' | 'warning_90' | 'exceeded_100' = 'normal';
        if (limitPct >= 100) alertLevel = 'exceeded_100';
        else if (limitPct >= 90) alertLevel = 'warning_90';
        else if (limitPct >= 80) alertLevel = 'warning_80';

        return {
          category: categoryKey,
          amount: val.amount,
          percentage: pct,
          count: val.count,
          color: conf.color,
          icon: conf.icon,
          monthlyLimit: catLimit,
          limitPercentage: limitPct,
          alertLevel,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      monthlyIncome,
      monthlyExpense,
      remainingBudget,
      budgetUsedPercentage,
      weeklySavedAmount,
      weeklyGoalPercentage,
      todayExpense,
      todayTransactionsCount,
      totalTransactionsCount: transactions.length,
      dailyAllowance,
      remainingDaysInMonth,
      budgetAlertLevel,
      previousMonthExpense,
      expenseComparisonPercentage,
      totalSavedInGoals,
      categoryBreakdown,
    };
  }, [transactions, profile, goals, customCatLimits]);

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        goals,
        goalContributions,
        recurringExpenses,
        stats,
        loading,
        addTransaction,
        addInstallmentExpense,
        updateTransaction,
        deleteTransaction,
        addSavingsGoal,
        updateSavingsGoal,
        contributeToGoal,
        deleteSavingsGoal,
        toggleGoalCompleted,
        getGoalContributions,
        updateCategoryLimit,
        addRecurringExpense,
        deleteRecurringExpense,
        toggleRecurringExpense,
        refreshData: loadData,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance deve ser utilizado dentro de um FinanceProvider');
  }
  return context;
};
