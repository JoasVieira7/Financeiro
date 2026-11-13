import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import {
  Transaction,
  SavingsGoal,
  RecurringExpense,
  GoalContribution,
  TransactionCategory,
  PaymentMethod,
  TransactionType,
  TransactionStatus,
  DashboardStats,
  CategorySummary,
  PLAN_LIMITS,
  FutureCommitmentsSummary,
  FutureCommitmentMonth,
  InstallmentGroupSummary,
  AppNotification,
  GoalPeriodType,
} from '../types';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dispatchSystemPushNotification } from '../lib/pushNotifications';
import {
  INITIAL_TRANSACTIONS,
  INITIAL_GOALS,
  INITIAL_RECURRING,
  INITIAL_CONTRIBUTIONS,
} from '../lib/demoStorage';
import {
  getInstallmentDates,
  calculateInstallmentAmounts,
  getTransactionDueDate,
  isTransactionPaid,
  getTransactionStatus,
  formatMonthYear,
  formatCurrency,
  parseSafeDate,
  isInternalGoalTransfer,
} from '../lib/formatters';
import { generateInvoiceAlerts } from '../lib/invoiceNotificationEngine';
import {
  monthlyToWeekly,
  weeklyToMonthly,
  roundToCents,
  getEffectiveBudget,
  getEffectiveSavingTarget,
} from '../lib/budgetCalculations';
import { ParsedInstallmentPurchase, inferCategory } from '../lib/installmentExcelParser';
import { calculateSuggestedInvoicePeriod } from '../lib/creditCardUtils';
import { EditablePdfItem, InvoiceMetadata } from '../lib/pdfAdapters';
import { generatePdfImportIdempotencyPlan, generateDeterministicUuid, Sha256UnavailableError } from '../lib/idempotency';

export function generateSecureUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

export interface ImportPdfResult {
  success: boolean;
  importedPurchasesCount: number;
  totalTransactionsCreated: number;
  oneOffCount: number;
  installmentPurchasesCount: number;
  ignoredCount: number;
  duplicatesCount: number;
  alreadyProcessed?: boolean;
  idempotencyKey?: string;
  error?: string;
}

interface FinanceContextType {
  transactions: Transaction[];
  goals: SavingsGoal[];
  goalContributions: GoalContribution[];
  recurringExpenses: RecurringExpense[];
  stats: DashboardStats;
  futureCommitments: FutureCommitmentsSummary;
  loading: boolean;
  addTransaction: (
    amount: number,
    category: TransactionCategory,
    paymentMethod: PaymentMethod,
    description?: string,
    type?: TransactionType,
    isRecurring?: boolean,
    notes?: string,
    dueDate?: string,
    purchaseDate?: string
  ) => Promise<{ success: boolean; error?: string }>;
  addInstallmentExpense: (
    params: AddInstallmentExpenseParams
  ) => Promise<{ success: boolean; error?: string }>;
  importInstallmentPurchases: (
    purchases: ParsedInstallmentPurchase[]
  ) => Promise<{
    success: boolean;
    importedCount: number;
    totalInstallmentsCount: number;
    error?: string;
  }>;
  importPdfInvoicePurchases: (
    items: EditablePdfItem[],
    metadata: InvoiceMetadata
  ) => Promise<ImportPdfResult>;
  updateTransaction: (
    id: string,
    updates: Partial<Omit<Transaction, 'id' | 'user_id' | 'created_at'>>,
    updateAllInstallments?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  deleteTransaction: (id: string, deleteAllInstallments?: boolean) => Promise<void>;
  deleteTransactionsBatch: (
    ids: string[],
    deleteAllInstallments?: boolean
  ) => Promise<{ success: boolean; count: number; error?: string }>;
  deleteAllTransactions: () => Promise<{ success: boolean; count: number; error?: string }>;
  toggleInstallmentPaid: (transactionId: string) => Promise<{ success: boolean; error?: string }>;
  getInstallmentGroup: (groupId: string) => InstallmentGroupSummary | undefined;
  addSavingsGoal: (
    title: string,
    targetAmount: number,
    deadline?: string,
    icon?: string,
    color?: string,
    periodType?: GoalPeriodType,
    startDate?: string,
    endDate?: string
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
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshData: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

const LOCAL_STORAGE_TX_KEY = 'finexpress_transactions';
const LOCAL_STORAGE_GOALS_KEY = 'finexpress_goals';
const LOCAL_STORAGE_CONTRIB_KEY = 'finexpress_goal_contributions';
const LOCAL_STORAGE_RECURRING_KEY = 'finexpress_recurring';
const LOCAL_STORAGE_CAT_LIMITS_KEY = 'finexpress_cat_limits';
const LOCAL_STORAGE_NOTIFS_LIST_KEY = 'finexpress_user_notifications';

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isDemo, notificationsEnabled } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [goalContributions, setGoalContributions] = useState<GoalContribution[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [customCatLimits, setCustomCatLimits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSubmissionTime, setLastSubmissionTime] = useState<number>(0);
  const isImportingPdfRef = useRef<boolean>(false);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter(n => !n.is_read).length,
    [notifications]
  );

  const loadData = async () => {
    if (!user) {
      setTransactions([]);
      setGoals([]);
      setGoalContributions([]);
      setRecurringExpenses([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (isSupabaseConfigured && !isDemo) {
      try {
        const [txRes, goalsRes, recRes, contribRes, notifRes] = await Promise.all([
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
          supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

        if (txRes.data) setTransactions(txRes.data);
        if (goalsRes.data) setGoals(goalsRes.data);
        if (recRes.data) setRecurringExpenses(recRes.data);
        if (contribRes.data) setGoalContributions(contribRes.data);
        if (notifRes.data) setNotifications(notifRes.data);

        // Checagem em background de alertas programados (vencimentos)
        supabase
          .rpc('check_financial_alerts')
          .then(
            () => {
              supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .then(({ data }) => {
                  if (data) setNotifications(data);
                });
            },
            () => {
              // RPC pode não estar criada no banco ainda, falha silenciosamente
            }
          );
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

      // Notificações Demo
      const storedNotifs = localStorage.getItem(LOCAL_STORAGE_NOTIFS_LIST_KEY);
      let allNotifs: AppNotification[] = storedNotifs ? JSON.parse(storedNotifs) : [];
      if (allNotifs.length === 0) {
        allNotifs = [
          {
            id: 'notif-welcome',
            user_id: user.id,
            title: 'Bem-vindo ao Fluxo Financeiro! 🎉',
            message: 'Acompanhe seus lançamentos, despesas e metas semanais ou mensais em tempo real.',
            type: 'system',
            is_read: false,
            link: '/goals',
            created_at: new Date().toISOString(),
          },
        ];
        localStorage.setItem(LOCAL_STORAGE_NOTIFS_LIST_KEY, JSON.stringify(allNotifs));
      }

      setTransactions(allTx.filter(t => t.user_id === user.id));
      setGoals(allGoals.filter(g => g.user_id === user.id));
      setGoalContributions(allContrib.filter(c => c.user_id === user.id));
      setRecurringExpenses(allRec.filter(r => r.user_id === user.id));
      setNotifications(allNotifs.filter(n => n.user_id === user.id));
    } catch (e) {
      console.error('Erro ao ler armazenamento local:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (isSupabaseConfigured && !isDemo && user?.id) {
      const channel = supabase
        .channel(`notifs:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          payload => {
            if (payload.eventType === 'INSERT') {
              setNotifications(prev => [payload.new as AppNotification, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setNotifications(prev =>
                prev.map(n => (n.id === payload.new.id ? (payload.new as AppNotification) : n))
              );
            } else if (payload.eventType === 'DELETE') {
              setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id, isDemo]);

  // ETAPA 34: Detecção ativa e inteligente de vencimentos de faturas/compromissos
  useEffect(() => {
    if (!user?.id || transactions.length === 0) return;

    const newAlerts = generateInvoiceAlerts(
      transactions,
      notifications,
      user.id,
      notificationsEnabled,
      formatCurrency
    );

    if (newAlerts.length === 0) return;

    // Dispara push do sistema para cada alerta novo
    newAlerts.forEach(alert => {
      if (alert.shouldPush) {
        dispatchSystemPushNotification(alert.notification.title, {
          body: alert.notification.message,
        });
      }
    });

    const notifsToAdd: AppNotification[] = newAlerts.map(a => ({
      ...a.notification,
      id: a.notification.id || `notif-due-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    }));

    // Se estiver no Supabase, persiste na tabela notifications
    if (isSupabaseConfigured && !isDemo) {
      supabase
        .from('notifications')
        .insert(notifsToAdd)
        .then(({ error }) => {
          if (error && !error.message?.includes('duplicate key')) {
            console.warn('Erro ao persistir alertas de fatura no Supabase:', error);
          }
        });
    }

    // Atualiza estado local
    setNotifications(prev => {
      const existingKeys = new Set(prev.map(p => p.dedup_key).filter(Boolean));
      const fresh = notifsToAdd.filter(n => !existingKeys.has(n.dedup_key));
      if (fresh.length === 0) return prev;
      const merged = [...fresh, ...prev];
      if (isDemo || !isSupabaseConfigured) {
        localStorage.setItem(LOCAL_STORAGE_NOTIFS_LIST_KEY, JSON.stringify(merged));
      }
      return merged;
    });
  }, [transactions, user?.id, notificationsEnabled, isDemo]);

  // Add transaction (validates amount, guards against rapid duplicates)
  const addTransaction = async (
    amount: number,
    category: TransactionCategory,
    paymentMethod: PaymentMethod = 'pix',
    description?: string,
    type: TransactionType = 'expense',
    isRecurring: boolean = false,
    notes?: string,
    dueDate?: string,
    purchaseDate?: string
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

    const isoNow = new Date().toISOString();
    const todayDateStr = isoNow.split('T')[0];

    const isCreditCard = paymentMethod === 'cartao_credito';
    const finalPurchaseDate = purchaseDate || isoNow;
    const finalDueDate = dueDate || (isCreditCard ? calculateSuggestedInvoicePeriod(finalPurchaseDate).dueDate : todayDateStr);

    // Etapa 34.4: Cartão de crédito não desconta do saldo à vista.
    // Se o vencimento for futuro ou hoje, status é 'pending' e paid_at é null.
    // Para outros métodos (Pix, dinheiro, débito): status 'paid' imediatamente.
    let status: TransactionStatus = 'paid';
    let paidAt: string | null = isoNow;

    if (isCreditCard && type === 'expense') {
      const isPastDue = finalDueDate < todayDateStr;
      status = isPastDue ? 'paid' : 'pending';
      paidAt = isPastDue ? `${finalDueDate}T12:00:00Z` : null;
    }

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
      created_at: finalPurchaseDate,
      purchase_date: finalPurchaseDate,
      due_date: finalDueDate,
      paid_at: paidAt,
      status,
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
            purchase_date: newTx.purchase_date,
            due_date: newTx.due_date,
            paid_at: newTx.paid_at,
            status: newTx.status,
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
    const purchaseDateIso = parsedStartDate.toISOString();
    const today = new Date();

    const newTxList: Transaction[] = [];
    for (let i = 0; i < numInstallments; i++) {
      const dueDate = dates[i];
      const dueDateStr = dueDate.toISOString().split('T')[0];
      
      // Etapa 34.4: Para cartão de crédito, parcelas com vencimento futuro (ou hoje)
      // nascem sempre como pendentes para não debitar indevidamente do saldo bancário à vista.
      const isPast = dueDate < today;
      const isFirstPaid = paymentMethod === 'cartao_credito'
        ? (i === 0 && isPast)
        : (i === 0 && dueDate <= today);
      const status: 'paid' | 'pending' = isFirstPaid ? 'paid' : 'pending';
      const paidAt = isFirstPaid ? dueDate.toISOString() : null;

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
        created_at: purchaseDateIso,
        purchase_date: purchaseDateIso,
        due_date: dueDateStr,
        paid_at: paidAt,
        status,
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
          purchase_date: t.purchase_date,
          due_date: t.due_date,
          paid_at: t.paid_at,
          status: t.status,
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

  // Importar compras parceladas em lote a partir de planilha Excel/CSV
  const importInstallmentPurchases = async (
    purchases: ParsedInstallmentPurchase[]
  ): Promise<{
    success: boolean;
    importedCount: number;
    totalInstallmentsCount: number;
    error?: string;
  }> => {
    if (!user) {
      return {
        success: false,
        importedCount: 0,
        totalInstallmentsCount: 0,
        error: 'Usuário não autenticado',
      };
    }

    if (!purchases || purchases.length === 0) {
      return {
        success: false,
        importedCount: 0,
        totalInstallmentsCount: 0,
        error: 'Nenhuma compra selecionada para importação.',
      };
    }

    const allNewTransactions: Transaction[] = [];
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let pIdx = 0; pIdx < purchases.length; pIdx++) {
      const p = purchases[pIdx];
      const groupId = `inst-imp-${Date.now()}-${pIdx}-${Math.random().toString(36).substr(2, 6)}`;

      // Distribuição contábil exata de centavos para todas as parcelas
      const amounts = calculateInstallmentAmounts(p.totalAmount, p.totalInstallments);

      // Data de vencimento base da parcela atual pendente
      const baseDueDate = new Date(`${p.dueDate}T12:00:00`);
      const validBaseDueDate = isNaN(baseDueDate.getTime()) ? now : baseDueDate;

      // Projeta datas mensais para as parcelas pendentes
      const dates = getInstallmentDates(validBaseDueDate, p.pendingInstallmentsCount);

      const purchaseIso = p.purchaseDate
        ? `${p.purchaseDate}T12:00:00.000Z`
        : now.toISOString();

      // Gera exclusivamente as parcelas pendentes (da parcelaAtual até totalInstallments)
      for (let i = 0; i < p.pendingInstallmentsCount; i++) {
        const installmentNum = p.currentInstallment + i;
        const dueDateObj = dates[i];
        const dueDateStr = dueDateObj.toISOString().split('T')[0];

        // Regra da Etapa 19: Todas as parcelas pendentes começam como NÃO PAGAS
        const isOverdue = dueDateObj < todayMidnight;
        const status: 'pending' | 'overdue' = isOverdue ? 'overdue' : 'pending';

        // Regra da Etapa 20: Utiliza o valor da parcela fornecido pela planilha como referência direta
        const installmentAmount =
          p.installmentAmount > 0
            ? p.installmentAmount
            : amounts[installmentNum - 1] !== undefined
            ? amounts[installmentNum - 1]
            : roundToCents(p.totalAmount / p.totalInstallments);

        const txId = `tx-inst-imp-${Date.now()}-${pIdx}-${installmentNum}-${Math.random().toString(36).substr(2, 4)}`;

        // Estornos e reembolsos são classificados contabilmente como créditos (income) para não inflar despesas indevidamente
        const txType: TransactionType = p.isRefund ? 'income' : 'expense';
        const txNotes = p.isRefund
          ? `Estorno / Reembolso · Cartão: ${p.cardName}${p.statusRaw ? ' · ' + p.statusRaw : ''}`
          : `Cartão: ${p.cardName}${p.statusRaw ? ' · ' + p.statusRaw : ''}`;

        allNewTransactions.push({
          id: txId,
          user_id: user.id,
          amount: installmentAmount,
          category: p.category || (p.isRefund ? 'Outros' : 'Compras'),
          payment_method: 'cartao_credito',
          description: p.description.trim(),
          type: txType,
          is_recurring: false,
          notes: txNotes,
          created_at: purchaseIso,
          purchase_date: purchaseIso,
          due_date: dueDateStr,
          paid_at: null, // NUNCA marcada como paga no momento da importação
          status,
          installment_group_id: p.totalInstallments > 1 ? groupId : undefined,
          installment_number: p.totalInstallments > 1 ? installmentNum : undefined,
          installment_total: p.totalInstallments > 1 ? p.totalInstallments : undefined,
          installment_purchase_amount: p.totalAmount,
        });
      }
    }

    if (allNewTransactions.length === 0) {
      return {
        success: false,
        importedCount: 0,
        totalInstallmentsCount: 0,
        error: 'Nenhuma parcela pendente gerada a partir dos registros.',
      };
    }

    // Atualiza estado local mantendo ordenação
    setTransactions(prev => {
      const merged = [...allNewTransactions, ...prev];
      return merged.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    if (isSupabaseConfigured && !isDemo) {
      try {
        const payload = allNewTransactions.map(t => ({
          user_id: user.id,
          amount: t.amount,
          category: t.category,
          payment_method: t.payment_method,
          description: t.description,
          type: t.type,
          is_recurring: t.is_recurring,
          notes: t.notes,
          created_at: t.created_at,
          purchase_date: t.purchase_date,
          due_date: t.due_date,
          paid_at: t.paid_at,
          status: t.status,
          installment_group_id: t.installment_group_id,
          installment_number: t.installment_number,
          installment_total: t.installment_total,
          installment_purchase_amount: t.installment_purchase_amount,
        }));

        const { error } = await supabase.from('transactions').insert(payload);
        if (error) {
          const insertedGroupIds = new Set(allNewTransactions.map(t => t.installment_group_id));
          setTransactions(prev => prev.filter(t => !insertedGroupIds.has(t.installment_group_id)));
          return {
            success: false,
            importedCount: 0,
            totalInstallmentsCount: 0,
            error: error.message,
          };
        }
      } catch (err: any) {
        const insertedGroupIds = new Set(allNewTransactions.map(t => t.installment_group_id));
        setTransactions(prev => prev.filter(t => !insertedGroupIds.has(t.installment_group_id)));
        return {
          success: false,
          importedCount: 0,
          totalInstallmentsCount: 0,
          error: err.message,
        };
      }
    } else {
      const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
      const allTx: Transaction[] = storedTx ? JSON.parse(storedTx) : [];
      allTx.unshift(...allNewTransactions);
      allTx.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      localStorage.setItem(LOCAL_STORAGE_TX_KEY, JSON.stringify(allTx));
    }

    return {
      success: true,
      importedCount: purchases.length,
      totalInstallmentsCount: allNewTransactions.length,
    };
  };

  // Importar compras de fatura PDF (à vista e parceladas pendentes) com persistência atômica
  const importPdfInvoicePurchases = async (
    items: EditablePdfItem[],
    metadata: InvoiceMetadata
  ): Promise<ImportPdfResult> => {
    if (!user) {
      return {
        success: false,
        importedPurchasesCount: 0,
        totalTransactionsCreated: 0,
        oneOffCount: 0,
        installmentPurchasesCount: 0,
        ignoredCount: 0,
        duplicatesCount: 0,
        error: 'Usuário não autenticado',
      };
    }

    if (isImportingPdfRef.current) {
      return {
        success: false,
        importedPurchasesCount: 0,
        totalTransactionsCreated: 0,
        oneOffCount: 0,
        installmentPurchasesCount: 0,
        ignoredCount: 0,
        duplicatesCount: 0,
        error: 'Uma importação já está em andamento. Aguarde.',
      };
    }

    isImportingPdfRef.current = true;

    try {
      // Filtrar apenas compras válidas e selecionadas (excluindo categoricamente pagamentos, estornos e taxas)
      const selectedPurchases = items.filter(
        item =>
          item.isSelected &&
          item.isValid &&
          (item.type === 'one_off' || item.type === 'installment')
      );

      const ignoredCount = items.filter(
        item =>
          item.type === 'payment' ||
          item.type === 'refund' ||
          item.type === 'fee' ||
          item.type === 'other' ||
          !item.isSelected
      ).length;

      const duplicatesCount = items.filter(item => item.isDuplicate).length;

      if (selectedPurchases.length === 0) {
        return {
          success: false,
          importedPurchasesCount: 0,
          totalTransactionsCreated: 0,
          oneOffCount: 0,
          installmentPurchasesCount: 0,
          ignoredCount,
          duplicatesCount,
          error: 'Nenhuma compra válida selecionada para importação.',
        };
      }

      let idempotencyPlan: Awaited<ReturnType<typeof generatePdfImportIdempotencyPlan>>;
      try {
        idempotencyPlan = await generatePdfImportIdempotencyPlan(
          user.id,
          metadata,
          selectedPurchases
        );
      } catch (err: unknown) {
        // Sha256UnavailableError: crypto.subtle indisponível (navegador antigo/restrito).
        // Nenhuma transação é enviada ao Supabase nesse cenário.
        if (err instanceof Sha256UnavailableError) {
          return {
            success: false,
            importedPurchasesCount: 0,
            totalTransactionsCreated: 0,
            oneOffCount: 0,
            installmentPurchasesCount: 0,
            ignoredCount,
            duplicatesCount,
            error: (err as Sha256UnavailableError).message,
          };
        }
        throw err; // outros erros inesperados: propaga para o try/finally externo
      }

      const allNewTransactions: Transaction[] = [];
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let oneOffCount = 0;
      let installmentPurchasesCount = 0;

      for (let pIdx = 0; pIdx < selectedPurchases.length; pIdx++) {
        const p = selectedPurchases[pIdx];
        const cardName = p.cardName?.trim() || metadata.issuer || 'Cartão de Crédito';
        const category: TransactionCategory =
          (p.category as TransactionCategory) || inferCategory(p.description) || 'Compras';

        const purchaseIso = p.purchaseDate
          ? `${p.purchaseDate}T12:00:00.000Z`
          : now.toISOString();

        // A data de vencimento da fatura/competência tem prevalência sobre estimativas locais
        const baseDueDate = metadata.dueDate
          ? new Date(`${metadata.dueDate}T12:00:00`)
          : p.dueDate
          ? new Date(`${p.dueDate}T12:00:00`)
          : now;
        const validBaseDueDate = isNaN(baseDueDate.getTime()) ? now : baseDueDate;

        if (p.type === 'one_off') {
          // COMPRA À VISTA: lançamento único, sem installment_group_id
          oneOffCount++;
          const dueDateStr =
            metadata.dueDate || p.dueDate || validBaseDueDate.toISOString().split('T')[0];
          const dueDateObj = new Date(`${dueDateStr}T12:00:00`);
          const isOverdue = !isNaN(dueDateObj.getTime()) && dueDateObj < todayMidnight;
          const status: 'pending' | 'overdue' = isOverdue ? 'overdue' : 'pending';
          const txId = generateDeterministicUuid(idempotencyPlan.payloadHash, `tx-${pIdx}`);

          allNewTransactions.push({
            id: txId,
            user_id: user.id,
            amount: roundToCents(p.amount),
            category,
            payment_method: 'cartao_credito',
            description: p.description.trim(),
            type: 'expense',
            is_recurring: false,
            notes: `Fatura ${metadata.issuer || 'PDF'} · Cartão: ${cardName} · Compra à vista`,
            created_at: purchaseIso,
            purchase_date: purchaseIso,
            due_date: dueDateStr,
            paid_at: null, // NUNCA marcada como paga no momento da importação
            status,
            installment_group_id: undefined,
            installment_number: undefined,
            installment_total: undefined,
            installment_purchase_amount: undefined,
          });
        } else {
          // COMPRA PARCELADA: cria exclusivamente as parcelas pendentes (currentInstallment até totalInstallments)
          installmentPurchasesCount++;
          const cur = Math.max(1, p.currentInstallment || 1);
          const tot = Math.max(cur, p.totalInstallments || cur);
          const pendingCount = Math.max(1, tot - cur + 1);

          const groupId =
            'inst-pdf-' +
            generateDeterministicUuid(idempotencyPlan.payloadHash, `grp-${pIdx}`).substring(0, 18);
          // Projeta datas mensais respeitando virada de ano e dia do mês
          const dates = getInstallmentDates(validBaseDueDate, pendingCount);

          // Valor total contratado apenas quando explicitamente informado
          const explicitTotalAmount =
            p.totalAmount && p.totalAmount > 0 ? roundToCents(p.totalAmount) : undefined;

          for (let i = 0; i < pendingCount; i++) {
            const installmentNum = cur + i;
            const dueDateObj = dates[i];
            const dueDateStr = dueDateObj.toISOString().split('T')[0];

            const isOverdue = dueDateObj < todayMidnight;
            const status: 'pending' | 'overdue' = isOverdue ? 'overdue' : 'pending';

            const txId = generateDeterministicUuid(
              idempotencyPlan.payloadHash, `inst-${pIdx}-${installmentNum}`
            );

            allNewTransactions.push({
              id: txId,
              user_id: user.id,
              amount: roundToCents(p.amount), // Valor individual identificado na fatura
              category,
              payment_method: 'cartao_credito',
              description: p.description.trim(),
              type: 'expense',
              is_recurring: false,
              notes: `Fatura ${metadata.issuer || 'PDF'} · Cartão: ${cardName} · Parcela ${installmentNum}/${tot}`,
              created_at: purchaseIso,
              purchase_date: purchaseIso,
              due_date: dueDateStr,
              paid_at: null, // NUNCA marcada como paga no momento da importação
              status,
              installment_group_id: groupId,
              installment_number: installmentNum,
              installment_total: tot,
              installment_purchase_amount: explicitTotalAmount,
            });
          }
        }
      }

      if (allNewTransactions.length === 0) {
        return {
          success: false,
          importedPurchasesCount: 0,
          totalTransactionsCreated: 0,
          oneOffCount: 0,
          installmentPurchasesCount: 0,
          ignoredCount,
          duplicatesCount,
          error: 'Nenhuma transação foi gerada a partir das compras selecionadas.',
        };
      }

      let alreadyProcessed = false;

      if (isSupabaseConfigured && !isDemo) {
        const createdTxIds = new Set(allNewTransactions.map(t => t.id));
        const payload = allNewTransactions.map(t => ({
          id: t.id,
          user_id: user.id,
          amount: t.amount,
          category: t.category,
          payment_method: t.payment_method,
          description: t.description,
          type: t.type,
          is_recurring: t.is_recurring,
          notes: t.notes,
          created_at: t.created_at,
          purchase_date: t.purchase_date,
          due_date: t.due_date,
          paid_at: t.paid_at,
          status: t.status,
          installment_group_id: t.installment_group_id || null,
          installment_number: t.installment_number || null,
          installment_total: t.installment_total || null,
          installment_purchase_amount: t.installment_purchase_amount || null,
        }));

        let rpcSuccess = false;

        // 1. TENTATIVA TRANSACIONAL ATÔMICA VIA RPC POSTGRESQL (ÚNICO MÉTODO SEGURO EM PRODUÇÃO)
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            'import_pdf_invoice_batch',
            {
              p_idempotency_key: idempotencyPlan.idempotencyKey,
              p_source: 'pdf',
              p_payload_hash: idempotencyPlan.payloadHash,
              p_metadata: {
                issuer: metadata.issuer || null,
                dueDate: metadata.dueDate || null,
                totalInvoiceAmount: metadata.totalInvoiceAmount || null,
              },
              p_transactions: payload,
            }
          );

          if (!rpcError && rpcData && rpcData.success) {
            rpcSuccess = true;
            alreadyProcessed = Boolean(rpcData.already_processed);
          } else if (rpcError) {
            const isFunctionNotFound =
              rpcError.code === '42883' ||
              rpcError.code === 'PGRST202' ||
              (rpcError.message && rpcError.message.toLowerCase().includes('could not find'));

            if (isFunctionNotFound) {
              // Por diretriz estrita de segurança e integridade financeira (Etapa 29),
              // não executamos inserções HTTP parciais sem garantias transacionais de banco.
              return {
                success: false,
                importedPurchasesCount: 0,
                totalTransactionsCreated: 0,
                oneOffCount: 0,
                installmentPurchasesCount: 0,
                ignoredCount,
                duplicatesCount,
                error:
                  'A gravação segura e atômica de faturas PDF requer a ativação da migration RPC "import_pdf_invoice_batch" no Supabase. Por integridade financeira, a operação foi suspensa para evitar lançamentos parciais ou descompasso de saldo.',
              };
            }

            return {
              success: false,
              importedPurchasesCount: 0,
              totalTransactionsCreated: 0,
              oneOffCount: 0,
              installmentPurchasesCount: 0,
              ignoredCount,
              duplicatesCount,
              error: rpcError.message,
            };
          }
        } catch (rpcErr: any) {
          return {
            success: false,
            importedPurchasesCount: 0,
            totalTransactionsCreated: 0,
            oneOffCount: 0,
            installmentPurchasesCount: 0,
            ignoredCount,
            duplicatesCount,
            error: rpcErr.message || 'Erro de comunicação ao executar a transação no banco de dados.',
          };
        }

        if (!rpcSuccess) {
          return {
            success: false,
            importedPurchasesCount: 0,
            totalTransactionsCreated: 0,
            oneOffCount: 0,
            installmentPurchasesCount: 0,
            ignoredCount,
            duplicatesCount,
            error: 'Falha na confirmação transacional da importação.',
          };
        }

        // Atualização pós-confirmação no React
        setTransactions(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const toAdd = allNewTransactions.filter(t => !existingIds.has(t.id));
          const merged = [...toAdd, ...prev];
          return merged.sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
      } else {
        // MODO DEMO / LOCAL STORAGE COM IDEMPOTÊNCIA PERSISTIDA
        const LOCAL_STORAGE_PDF_KEYS = 'finexpress_pdf_import_keys';
        const storedKeys = localStorage.getItem(LOCAL_STORAGE_PDF_KEYS);
        const knownKeys: string[] = storedKeys ? JSON.parse(storedKeys) : [];

        if (knownKeys.includes(idempotencyPlan.idempotencyKey)) {
          alreadyProcessed = true;
        } else {
          knownKeys.push(idempotencyPlan.idempotencyKey);
          localStorage.setItem(LOCAL_STORAGE_PDF_KEYS, JSON.stringify(knownKeys));

          const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
          const allTx: Transaction[] = storedTx ? JSON.parse(storedTx) : [];
          const existingIds = new Set(allTx.map(t => t.id));
          const toAdd = allNewTransactions.filter(t => !existingIds.has(t.id));
          allTx.unshift(...toAdd);
          allTx.sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          localStorage.setItem(LOCAL_STORAGE_TX_KEY, JSON.stringify(allTx));
        }

        setTransactions(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const toAdd = allNewTransactions.filter(t => !existingIds.has(t.id));
          const merged = [...toAdd, ...prev];
          return merged.sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
      }

      return {
        success: true,
        alreadyProcessed,
        idempotencyKey: idempotencyPlan.idempotencyKey,
        importedPurchasesCount: selectedPurchases.length,
        totalTransactionsCreated: allNewTransactions.length,
        oneOffCount,
        installmentPurchasesCount,
        ignoredCount,
        duplicatesCount,
      };
    } finally {
      isImportingPdfRef.current = false;
    }
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

  const deleteTransactionsBatch = async (
    ids: string[],
    deleteAllInstallments: boolean = false
  ): Promise<{ success: boolean; count: number; error?: string }> => {
    if (!ids || ids.length === 0) return { success: true, count: 0 };

    const idSet = new Set(ids);
    const affectedGroupIds = new Set<string>();

    if (deleteAllInstallments) {
      for (const t of transactions) {
        if (idSet.has(t.id) && t.installment_group_id) {
          affectedGroupIds.add(t.installment_group_id);
        }
      }
    }

    setTransactions(prev =>
      prev.filter(t => {
        if (idSet.has(t.id)) return false;
        if (deleteAllInstallments && t.installment_group_id && affectedGroupIds.has(t.installment_group_id)) {
          return false;
        }
        return true;
      })
    );

    if (isSupabaseConfigured && !isDemo && user) {
      try {
        if (affectedGroupIds.size > 0) {
          await supabase
            .from('transactions')
            .delete()
            .eq('user_id', user.id)
            .in('installment_group_id', Array.from(affectedGroupIds));
        }
        const remainingIds = ids.filter(id => {
          const tx = transactions.find(t => t.id === id);
          return !tx?.installment_group_id || !affectedGroupIds.has(tx.installment_group_id);
        });
        if (remainingIds.length > 0) {
          await supabase
            .from('transactions')
            .delete()
            .eq('user_id', user.id)
            .in('id', remainingIds);
        }
      } catch (err: any) {
        return { success: false, count: 0, error: err.message };
      }
    } else {
      const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
      if (storedTx) {
        const allTx: Transaction[] = JSON.parse(storedTx);
        const filtered = allTx.filter(t => {
          if (idSet.has(t.id)) return false;
          if (deleteAllInstallments && t.installment_group_id && affectedGroupIds.has(t.installment_group_id)) {
            return false;
          }
          return true;
        });
        localStorage.setItem(LOCAL_STORAGE_TX_KEY, JSON.stringify(filtered));
      }
    }

    return { success: true, count: ids.length };
  };

  const deleteAllTransactions = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    const totalCount = transactions.length;
    setTransactions([]);

    if (isSupabaseConfigured && !isDemo && user) {
      try {
        const { error } = await supabase
          .from('transactions')
          .delete()
          .eq('user_id', user.id);
        if (error) return { success: false, count: 0, error: error.message };
      } catch (err: any) {
        return { success: false, count: 0, error: err.message };
      }
    } else {
      localStorage.removeItem(LOCAL_STORAGE_TX_KEY);
    }

    return { success: true, count: totalCount };
  };

  const toggleInstallmentPaid = async (transactionId: string): Promise<{ success: boolean; error?: string }> => {
    const target = transactions.find(t => t.id === transactionId);
    if (!target) return { success: false, error: 'Lançamento não encontrado.' };

    const currentlyPaid = isTransactionPaid(target);
    const nextStatus: 'paid' | 'pending' = currentlyPaid ? 'pending' : 'paid';
    const nextPaidAt: string | null = currentlyPaid ? null : new Date().toISOString();

    const updates = {
      status: nextStatus,
      paid_at: nextPaidAt,
    };

    setTransactions(prev =>
      prev.map(t => (t.id === transactionId ? { ...t, ...updates } : t))
    );

    if (isSupabaseConfigured && !isDemo) {
      const { error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', transactionId);
      if (error) {
        setTransactions(prev =>
          prev.map(t => (t.id === transactionId ? target : t))
        );
        return { success: false, error: error.message };
      }
    } else {
      const storedTx = localStorage.getItem(LOCAL_STORAGE_TX_KEY);
      if (storedTx) {
        const allTx: Transaction[] = JSON.parse(storedTx);
        const updated = allTx.map(t => (t.id === transactionId ? { ...t, ...updates } : t));
        localStorage.setItem(LOCAL_STORAGE_TX_KEY, JSON.stringify(updated));
      }
    }

    return { success: true };
  };

  const getInstallmentGroup = (groupId: string): InstallmentGroupSummary | undefined => {
    const groupItems = transactions.filter(t => t.installment_group_id === groupId);
    if (groupItems.length === 0) return undefined;

    const sorted = [...groupItems].sort(
      (a, b) => (a.installment_number || 0) - (b.installment_number || 0)
    );
    const first = sorted[0];
    const totalAmount =
      first.installment_purchase_amount ||
      sorted.reduce((acc, t) => acc + Number(t.amount), 0);
    const totalInstallments = first.installment_total || sorted.length;
    const paidCount = sorted.filter(t => isTransactionPaid(t)).length;
    // Considera parcelas anteriores já quitadas quando o grupo foi importado a partir de uma parcela intermediária
    const previousPaidCount = Math.max(0, (first.installment_number || 1) - 1);
    const paidInstallments = paidCount + previousPaidCount;
    const pendingInstallments = sorted.filter(t => !isTransactionPaid(t)).length;

    const nextPending = sorted.find(t => !isTransactionPaid(t));
    const nextDueDate = nextPending ? (nextPending.due_date || nextPending.created_at) : undefined;

    return {
      groupId,
      description: first.description,
      category: first.category,
      paymentMethod: first.payment_method,
      totalAmount,
      installmentAmount: first.amount,
      totalInstallments,
      paidInstallments,
      pendingInstallments,
      purchaseDate: first.purchase_date || first.created_at,
      nextDueDate,
      status: pendingInstallments === 0 ? 'fully_paid' : 'in_progress',
      installments: sorted,
    };
  };

  const addSavingsGoal = async (
    title: string,
    targetAmount: number,
    deadline?: string,
    icon: string = 'target',
    color: string = 'emerald',
    periodType: GoalPeriodType = 'custom',
    startDate?: string,
    endDate?: string
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
      period_type: periodType,
      start_date: startDate,
      end_date: endDate,
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
          period_type: newGoal.period_type,
          start_date: newGoal.start_date,
          end_date: newGoal.end_date,
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
      if (error) {
        // Fallback seguro se as colunas da migration recente ainda não foram criadas no Supabase remoto
        if (
          error.code === '42703' ||
          error.message.includes('period_type') ||
          error.message.includes('start_date') ||
          error.message.includes('end_date')
        ) {
          const safeUpdates = { ...updates };
          delete safeUpdates.period_type;
          delete safeUpdates.start_date;
          delete safeUpdates.end_date;
          const retry = await supabase.from('savings_goals').update(safeUpdates).eq('id', goalId);
          if (retry.error) return { success: false, error: retry.error.message };
        } else {
          return { success: false, error: error.message };
        }
      }
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

    // Dispara notificação se atingiu a meta ou aproximou-se (>=80%)
    if (nextAmount >= targetGoal.target_amount && !targetGoal.is_completed) {
      dispatchSystemPushNotification('Meta Atingida! 🎉', {
        body: `Parabéns! Você alcançou 100% da meta "${targetGoal.title}".`,
      });
      if (isDemo || !isSupabaseConfigured) {
        const notif: AppNotification = {
          id: `notif-goal-${Date.now()}`,
          user_id: user.id,
          title: 'Meta Atingida! 🎉',
          message: `Parabéns! Você alcançou 100% da meta "${targetGoal.title}".`,
          type: 'goal_reached',
          is_read: false,
          link: '/goals',
          created_at: new Date().toISOString(),
        };
        setNotifications(prev => [notif, ...prev]);
      }
    } else if (
      nextAmount >= targetGoal.target_amount * 0.8 &&
      targetGoal.current_amount < targetGoal.target_amount * 0.8
    ) {
      dispatchSystemPushNotification('Meta Próxima do Alvo! 🎯', {
        body: `Você já ultrapassou 80% da meta "${targetGoal.title}".`,
      });
      if (isDemo || !isSupabaseConfigured) {
        const notif: AppNotification = {
          id: `notif-goal-near-${Date.now()}`,
          user_id: user.id,
          title: 'Meta Próxima do Alvo! 🎯',
          message: `Você já ultrapassou 80% da sua meta "${targetGoal.title}".`,
          type: 'goal_warning',
          is_read: false,
          link: '/goals',
          created_at: new Date().toISOString(),
        };
        setNotifications(prev => [notif, ...prev]);
      }
    }

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

    // Also register an explicit transaction for user visibility with structured movement tags
    const structuredTag = type === 'deposit'
      ? `[movement:goal_deposit][goal_id:${goalId}]`
      : `[movement:goal_withdraw][goal_id:${goalId}]`;
    const fullNotes = notes?.trim() ? `${structuredTag} ${notes.trim()}` : structuredTag;

    if (type === 'deposit') {
      await addTransaction(
        numAmount,
        'Outros',
        'pix',
        `Aporte na Meta: ${targetGoal.title}`,
        'expense',
        false,
        fullNotes
      );
    } else {
      await addTransaction(
        numAmount,
        'Outros',
        'pix',
        `Resgate da Meta: ${targetGoal.title}`,
        'income',
        false,
        fullNotes
      );
    }

    if (isSupabaseConfigured && !isDemo) {
      const { error: contribError } = await supabase.from('goal_contributions').insert([
        {
          goal_id: goalId,
          user_id: user.id,
          amount: numAmount,
          type,
          created_at: contribution.created_at,
        },
      ]);

      if (contribError) {
        // Reverte estado local se o backend rejeitar (ex: saldo insuficiente, meta já concluída)
        setGoals(prev =>
          prev.map(g =>
            g.id === goalId
              ? { ...g, current_amount: targetGoal.current_amount, is_completed: targetGoal.is_completed }
              : g
          )
        );
        setGoalContributions(prev => prev.filter(c => c.id !== contribution.id));
        return { success: false, error: contribError.message };
      }
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

    // Se estiver tentando reativar e não for Premium, bloqueia no client
    const currentTier = profile?.plan_tier || 'free';
    if (nextState && currentTier !== 'premium') {
      return;
    }

    setRecurringExpenses(prev =>
      prev.map(r => (r.id === id ? { ...r, is_active: nextState } : r))
    );

    if (isSupabaseConfigured && !isDemo) {
      const { error } = await supabase.from('recurring_expenses').update({ is_active: nextState }).eq('id', id);
      if (error) {
        // Reverte estado local se o backend rejeitar
        setRecurringExpenses(prev =>
          prev.map(r => (r.id === id ? { ...r, is_active: item.is_active } : r))
        );
      }
    } else {
      const stored = localStorage.getItem(LOCAL_STORAGE_RECURRING_KEY);
      if (stored) {
        const all: RecurringExpense[] = JSON.parse(stored);
        const updated = all.map(r => (r.id === id ? { ...r, is_active: nextState } : r));
        localStorage.setItem(LOCAL_STORAGE_RECURRING_KEY, JSON.stringify(updated));
      }
    }
  };

  // Gerenciamento de Notificações
  const markNotificationAsRead = async (id: string) => {
    const nowIso = new Date().toISOString();
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: nowIso } : n))
    );

    if (isSupabaseConfigured && !isDemo) {
      await supabase.rpc('mark_notification_read', { p_notification_id: id });
    } else {
      const stored = localStorage.getItem(LOCAL_STORAGE_NOTIFS_LIST_KEY);
      if (stored) {
        const list: AppNotification[] = JSON.parse(stored);
        const updated = list.map(n =>
          n.id === id ? { ...n, is_read: true, read_at: nowIso } : n
        );
        localStorage.setItem(LOCAL_STORAGE_NOTIFS_LIST_KEY, JSON.stringify(updated));
      }
    }
  };

  const markAllNotificationsAsRead = async () => {
    const nowIso = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: nowIso })));

    if (isSupabaseConfigured && !isDemo) {
      await supabase.rpc('mark_all_notifications_read');
    } else {
      const stored = localStorage.getItem(LOCAL_STORAGE_NOTIFS_LIST_KEY);
      if (stored) {
        const list: AppNotification[] = JSON.parse(stored);
        const updated = list.map(n => ({ ...n, is_read: true, read_at: nowIso }));
        localStorage.setItem(LOCAL_STORAGE_NOTIFS_LIST_KEY, JSON.stringify(updated));
      }
    }
  };

  const refreshNotifications = async () => {
    if (!user) return;
    if (isSupabaseConfigured && !isDemo) {
      await supabase.rpc('check_financial_alerts');
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setNotifications(data);
    }
  };

  // Computations for dashboard stats, daily limit & category breakdown
  const stats: DashboardStats = useMemo(() => {
    const monthlyBudget = profile?.monthly_budget || 3500;
    const hasExplicitWeeklyTarget =
      profile?.weekly_saving_target !== undefined && profile?.weekly_saving_target !== null;
    const weeklyTarget = hasExplicitWeeklyTarget ? Number(profile.weekly_saving_target) : 250;
    const hasNoGoal = weeklyTarget <= 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Previous month computation (handles January roll-over)
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const thisMonthTx = transactions.filter(t => {
      const d = (t.installment_group_id || t.due_date) ? getTransactionDueDate(t) : parseSafeDate(t.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const prevMonthTx = transactions.filter(t => {
      const d = (t.installment_group_id || t.due_date) ? getTransactionDueDate(t) : parseSafeDate(t.created_at);
      return d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear;
    });

    // Despesas do mês corrente: pagas vs pendentes (excluindo transferências internas de aporte/resgate)
    const thisMonthExpenses = thisMonthTx.filter(t => t.type === 'expense' && !isInternalGoalTransfer(t));
    const monthlyPaidExpense = thisMonthExpenses
      .filter(t => isTransactionPaid(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const monthlyPendingExpense = thisMonthExpenses
      .filter(t => !isTransactionPaid(t) && t.status !== 'unknown')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const totalCommittedMonth = monthlyPaidExpense + monthlyPendingExpense;
    // O monthlyExpense reflete o que já foi efetivamente pago no mês
    const monthlyExpense = monthlyPaidExpense;

    const monthlyIncome = thisMonthTx
      .filter(t => t.type === 'income' && !isInternalGoalTransfer(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const previousMonthExpense = prevMonthTx
      .filter(t => t.type === 'expense' && !isInternalGoalTransfer(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const expenseComparisonPercentage =
      previousMonthExpense > 0
        ? Math.round(((totalCommittedMonth - previousMonthExpense) / previousMonthExpense) * 100)
        : 0;

    // Today expenses
    const todayStr = now.toISOString().split('T')[0];
    const todayTx = transactions.filter(t => {
      if (t.installment_group_id) {
        return (t.due_date === todayStr || t.created_at.startsWith(todayStr)) && isTransactionPaid(t);
      }
      return t.created_at.startsWith(todayStr);
    });
    const todayExpense = todayTx
      .filter(t => t.type === 'expense' && !isInternalGoalTransfer(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const todayTransactionsCount = todayTx.length;

    // Weekly metrics
    const dayOfWeek = now.getDay() || 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeekTx = transactions.filter(t => {
      const d = (t.installment_group_id || t.due_date) ? getTransactionDueDate(t) : parseSafeDate(t.created_at);
      return d >= startOfWeek;
    });
    const thisWeekExpense = thisWeekTx
      .filter(t => t.type === 'expense' && !isInternalGoalTransfer(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const thisWeekIncome = thisWeekTx
      .filter(t => t.type === 'income' && !isInternalGoalTransfer(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    // -------------------------------------------------------------------------
    // ETAPA 38 — AUDITORIA FINANCEIRA: APORTES, RETIRADAS E SALDO LÍQUIDO
    // 1. Total de Aportes do Mês (monthGoalDeposits)
    // 2. Total de Retiradas do Mês (monthGoalWithdrawals)
    // 3. Saldo Líquido dos Aportes (netGoalContributionsMonth, permitindo negativo)
    // 4. Patrimônio Atualmente Reservado (totalSavedInGoals)
    // 5. Meta Mensal Planejada (monthlySavingTarget)
    // 6. Superávit Operacional de Caixa (cashSurplusThisMonth)
    // -------------------------------------------------------------------------

    // 1. Aportes e retiradas em metas de economia no mês corrente (usando parseSafeDate contra timezone drift)
    const currentMonthGoalContributions = goalContributions.filter(c => {
      if (!c.created_at) return false;
      const d = parseSafeDate(c.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const monthGoalDeposits = currentMonthGoalContributions
      .filter(c => c.type === 'deposit')
      .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

    const monthGoalWithdrawals = currentMonthGoalContributions
      .filter(c => c.type === 'withdraw')
      .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

    // Saldo líquido dos aportes (SEM trava artificial Math.max(0, ...); suporta retiradas líquidas negativas)
    const netGoalContributionsMonth = roundToCents(monthGoalDeposits - monthGoalWithdrawals);

    // 2. Superávit operacional real de caixa (Receitas reais recebidas − Despesas pagas)
    const cashSurplusThisMonth = Math.max(0, monthlyIncome - monthlyPaidExpense);

    // 3. Economia comprovada em metas no mês:
    // Se o usuário não tem meta ativa configurada (hasNoGoal), o valor é 0.
    // Caso tenha meta, reflete exatamente o saldo líquido de aportes no mês (netGoalContributionsMonth).
    const realMonthlySaved = hasNoGoal ? 0 : netGoalContributionsMonth;

    const monthlyTarget = hasNoGoal ? 0 : weeklyToMonthly(weeklyTarget);
    const monthlySavedAmount = hasNoGoal ? 0 : roundToCents(realMonthlySaved);

    // Percentual real: (Economizado em Metas / Meta) * 100
    const monthlyGoalPercentage = (hasNoGoal || monthlyTarget <= 0)
      ? 0
      : Math.round((monthlySavedAmount / monthlyTarget) * 100);

    // Métricas semanais baseadas exclusivamente em registros reais da semana
    const cashSurplusThisWeek = Math.max(0, thisWeekIncome - thisWeekExpense);
    const weeklySavedAmount = hasNoGoal ? 0 : roundToCents(cashSurplusThisWeek);
    const weeklyGoalPercentage = (hasNoGoal || weeklyTarget <= 0)
      ? 0
      : Math.round((weeklySavedAmount / weeklyTarget) * 100);

    // ETAPA 34 & 34.3: Fórmula Oficial do Orçamento e Meta Mensal:
    // Se tem meta: Renda − meta − compromissos do mês
    // Se NÃO tem meta: Renda − compromissos do mês
    const rawRemainingBudget = roundToCents(
      hasNoGoal
        ? monthlyBudget - totalCommittedMonth
        : monthlyBudget - monthlyTarget - totalCommittedMonth
    );
    const remainingBudget = rawRemainingBudget;
    const isBudgetNegative = remainingBudget < 0;
    const deficitAmount = isBudgetNegative ? Math.abs(remainingBudget) : 0;

    // Percentual consumido: (despesas + meta) / renda mensal
    const budgetUsedPercentage = monthlyBudget > 0
      ? Math.round(((totalCommittedMonth + (hasNoGoal ? 0 : monthlyTarget)) / monthlyBudget) * 100)
      : 100;

    // Métricas para o período semanal do orçamento
    const budgetPeriod: 'weekly' | 'monthly' = profile?.budget_period_preference || 'monthly';
    const weeklyBudget = monthlyToWeekly(monthlyBudget);
    const weeklyExpense = thisWeekExpense;
    const weeklyTargetAmount = hasNoGoal ? 0 : weeklyTarget;
    const weeklyRemainingBudget = roundToCents(
      hasNoGoal
        ? weeklyBudget - weeklyExpense
        : weeklyBudget - weeklyTargetAmount - weeklyExpense
    );
    const weeklyBudgetUsedPercentage = weeklyBudget > 0
      ? Math.round(((weeklyExpense + (hasNoGoal ? 0 : weeklyTargetAmount)) / weeklyBudget) * 100)
      : 100;

    // Projeções efetivas sincronizadas com o período principal selecionado
    const effectiveBudget = budgetPeriod === 'weekly' ? weeklyBudget : monthlyBudget;
    const effectiveRemainingBudget = budgetPeriod === 'weekly' ? weeklyRemainingBudget : remainingBudget;
    const effectiveCommitted = budgetPeriod === 'weekly' ? weeklyExpense : totalCommittedMonth;
    const effectiveBudgetUsedPercentage = budgetPeriod === 'weekly' ? weeklyBudgetUsedPercentage : budgetUsedPercentage;

    const effectiveSavedAmount = budgetPeriod === 'weekly' ? weeklySavedAmount : monthlySavedAmount;
    const effectiveSavingTarget = budgetPeriod === 'weekly' ? weeklyTarget : monthlyTarget;
    const effectiveGoalPercentage = budgetPeriod === 'weekly' ? weeklyGoalPercentage : monthlyGoalPercentage;

    // Budget alert levels: normal, 80%, 90%, 100% (ou deficit/estouro)
    let budgetAlertLevel: 'normal' | 'warning_80' | 'warning_90' | 'exceeded_100' = 'normal';
    if (isBudgetNegative || budgetUsedPercentage >= 100) {
      budgetAlertLevel = 'exceeded_100';
    } else if (budgetUsedPercentage >= 90) {
      budgetAlertLevel = 'warning_90';
    } else if (budgetUsedPercentage >= 80) {
      budgetAlertLevel = 'warning_80';
    }

    // Gasto diário recomendado: Orçamento ainda disponível ÷ dias restantes do mês
    // Se não houver dias restantes, não divide por zero. Se saldo for <= 0, diário é 0.
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = now.getDate();
    const remainingDaysInMonth = Math.max(0, daysInCurrentMonth - currentDay + 1);
    const dailyAllowance = (remainingBudget > 0 && remainingDaysInMonth > 0)
      ? roundToCents(remainingBudget / remainingDaysInMonth)
      : 0;

    // Total accumulated in savings goals
    const totalSavedInGoals = goals.reduce((acc, g) => acc + Number(g.current_amount || 0), 0);

    // Resumo dos gastos por categoria com limites dinâmicos
    const categoryTotals: Record<string, { amount: number; count: number }> = {};
    thisMonthExpenses.forEach(t => {
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
        const pct = totalCommittedMonth > 0 ? Math.round((val.amount / totalCommittedMonth) * 100) : 0;
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
      budgetPeriod,
      monthlyIncome,
      monthlyExpense,
      monthlyPendingExpense,
      totalCommittedMonth,
      remainingBudget,
      budgetUsedPercentage,
      weeklyBudget,
      weeklyExpense,
      weeklyRemainingBudget,
      weeklyBudgetUsedPercentage,
      effectiveBudget,
      effectiveRemainingBudget,
      effectiveCommitted,
      effectiveBudgetUsedPercentage,
      effectiveSavedAmount,
      effectiveSavingTarget,
      effectiveGoalPercentage,
      weeklySavedAmount,
      weeklyGoalPercentage,
      monthlySavedAmount,
      monthlyGoalPercentage,
      todayExpense,
      todayTransactionsCount,
      totalTransactionsCount: transactions.length,
      dailyAllowance,
      remainingDaysInMonth,
      budgetAlertLevel,
      previousMonthExpense,
      expenseComparisonPercentage,
      totalSavedInGoals,
      monthlySavingTarget: monthlyTarget,
      monthlyCashSurplus: roundToCents(cashSurplusThisMonth),
      monthGoalDeposits: roundToCents(monthGoalDeposits),
      monthGoalWithdrawals: roundToCents(monthGoalWithdrawals),
      netGoalContributionsMonth: roundToCents(netGoalContributionsMonth),
      hasNoGoal: hasNoGoal,
      isBudgetNegative,
      deficitAmount,
      categoryBreakdown,
    };
  }, [transactions, profile, goals, goalContributions, customCatLimits]);

  // Inteligência Financeira: Compromissos Futuros (próximos 12 meses)
  const futureCommitments: FutureCommitmentsSummary = useMemo(() => {
    // 1. Grupos únicos de parcelas
    const groupIds = Array.from(
      new Set(
        transactions
          .filter(t => Boolean(t.installment_group_id))
          .map(t => t.installment_group_id as string)
      )
    );

    const groups: InstallmentGroupSummary[] = groupIds
      .map(id => getInstallmentGroup(id))
      .filter((g): g is InstallmentGroupSummary => Boolean(g));

    const activeGroups = groups.filter(g => g.status === 'in_progress');

    // 2. Projeção dos próximos 12 meses
    const now = new Date();
    const monthlyForecast: FutureCommitmentMonth[] = [];

    for (let i = 0; i < 12; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const targetYear = forecastDate.getFullYear();
      const targetMonth = forecastDate.getMonth();
      const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
      const monthLabel = formatMonthYear(forecastDate);

      // Todas as transações cujo vencimento cai neste mês (compras parceladas ou cartão de crédito)
      const monthInstallments = transactions.filter(t => {
        if (t.type !== 'expense') return false;
        if (!t.installment_group_id && t.payment_method !== 'cartao_credito') return false;
        const dueDate = getTransactionDueDate(t);
        return dueDate.getFullYear() === targetYear && dueDate.getMonth() === targetMonth;
      });

      const totalCommitted = monthInstallments.reduce((acc, t) => acc + Number(t.amount), 0);
      const totalPaid = monthInstallments
        .filter(t => isTransactionPaid(t))
        .reduce((acc, t) => acc + Number(t.amount), 0);
      const totalPending = monthInstallments
        .filter(t => !isTransactionPaid(t) && t.status !== 'unknown')
        .reduce((acc, t) => acc + Number(t.amount), 0);

      monthlyForecast.push({
        monthKey,
        monthLabel,
        year: targetYear,
        monthIndex: targetMonth,
        totalCommitted,
        totalPaid,
        totalPending,
        installmentsCount: monthInstallments.length,
        transactions: monthInstallments.sort((a, b) => {
          const da = getTransactionDueDate(a).getTime();
          const db = getTransactionDueDate(b).getTime();
          return da - db;
        }),
      });
    }

    // 3. Totais globais
    const allInstallmentExpenses = transactions.filter(
      t => Boolean(t.installment_group_id) && t.type === 'expense'
    );

    const totalPendingPayment = allInstallmentExpenses
      .filter(t => !isTransactionPaid(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const totalPaidPayment = allInstallmentExpenses
      .filter(t => isTransactionPaid(t))
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const remainingInstallmentsCount = allInstallmentExpenses.filter(
      t => !isTransactionPaid(t)
    ).length;

    const totalCommittedInInstallments = activeGroups.reduce(
      (acc, g) => acc + g.totalAmount,
      0
    );

    return {
      totalCommittedInInstallments,
      totalPendingPayment,
      totalPaidPayment,
      remainingInstallmentsCount,
      activePurchasesCount: activeGroups.length,
      monthlyForecast,
      activeGroups,
    };
  }, [transactions]);

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        goals,
        goalContributions,
        recurringExpenses,
        stats,
        futureCommitments,
        loading,
        addTransaction,
        addInstallmentExpense,
        importInstallmentPurchases,
        importPdfInvoicePurchases,
        updateTransaction,
        deleteTransaction,
        deleteTransactionsBatch,
        deleteAllTransactions,
        toggleInstallmentPaid,
        getInstallmentGroup,
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
        notifications,
        unreadNotificationsCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        refreshNotifications,
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
