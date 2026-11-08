export type TransactionCategory =
  | 'Alimentação'
  | 'Transporte'
  | 'Moradia'
  | 'Contas'
  | 'Saúde'
  | 'Lazer'
  | 'Compras'
  | 'Salário'
  | 'Outros';

export type PaymentMethod =
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'dinheiro'
  | 'ted'
  | 'outros';

export type TransactionType = 'expense' | 'income';

export type TransactionStatus = 'paid' | 'pending' | 'overdue';

export interface Transaction {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  payment_method: PaymentMethod;
  is_recurring?: boolean;
  notes?: string;
  created_at: string;
  purchase_date?: string;
  due_date?: string; // YYYY-MM-DD
  paid_at?: string | null;
  status?: TransactionStatus;
  installment_group_id?: string;
  installment_number?: number;
  installment_total?: number;
  installment_purchase_amount?: number;
}

export interface RecurringExpense {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  category: TransactionCategory;
  payment_method: PaymentMethod;
  due_day: number; // 1 to 31
  is_active: boolean;
  created_at: string;
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'inactive';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  plan_tier: 'free' | 'premium';
  subscription_status: SubscriptionStatus;
  trial_ends_at?: string;
  current_period_end?: string;
  monthly_budget: number;
  weekly_saving_target: number;
  budget_period_preference?: 'weekly' | 'monthly';
  category_limits?: Record<string, number>;
  created_at: string;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  user_id: string;
  amount: number;
  type: 'deposit' | 'withdraw';
  notes?: string;
  created_at: string;
}

export type GoalPeriodType = 'weekly' | 'monthly' | 'custom';

export interface SavingsGoal {
  id: string;
  user_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  deadline?: string;
  category: string;
  icon?: string;
  color?: string;
  is_completed?: boolean;
  period_type?: GoalPeriodType;
  start_date?: string;
  end_date?: string;
  created_at: string;
}

export type NotificationType =
  | 'goal_reached'
  | 'goal_warning'
  | 'expense_due'
  | 'expense_overdue'
  | 'financial_alert'
  | 'system';

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  read_at?: string | null;
  link?: string;
  metadata?: Record<string, any>;
  dedup_key?: string;
  created_at: string;
}

export interface CategorySummary {
  category: TransactionCategory;
  amount: number;
  percentage: number;
  count: number;
  color: string;
  icon: string;
  monthlyLimit?: number;
  limitPercentage?: number;
  alertLevel?: 'normal' | 'warning_80' | 'warning_90' | 'exceeded_100';
}

export interface DashboardStats {
  budgetPeriod: 'weekly' | 'monthly';
  monthlyIncome: number;
  monthlyExpense: number; // total de despesas efetivamente pagas no mês
  monthlyPendingExpense: number; // despesas previstas / pendentes no mês corrente
  totalCommittedMonth: number; // soma de pagas + pendentes no mês
  remainingBudget: number;
  budgetUsedPercentage: number;
  weeklyBudget: number;
  weeklyExpense: number;
  weeklyRemainingBudget: number;
  weeklyBudgetUsedPercentage: number;
  effectiveBudget: number;
  effectiveRemainingBudget: number;
  effectiveCommitted: number;
  effectiveBudgetUsedPercentage: number;
  effectiveSavedAmount: number;
  effectiveSavingTarget: number;
  effectiveGoalPercentage: number;
  weeklySavedAmount: number;
  weeklyGoalPercentage: number;
  monthlySavedAmount: number;
  monthlyGoalPercentage: number;
  todayExpense: number;
  todayTransactionsCount: number;
  totalTransactionsCount: number;
  dailyAllowance: number;
  remainingDaysInMonth: number;
  budgetAlertLevel: 'normal' | 'warning_80' | 'warning_90' | 'exceeded_100';
  previousMonthExpense: number;
  expenseComparisonPercentage: number;
  totalSavedInGoals: number;
  categoryBreakdown: CategorySummary[];
}

export interface InstallmentGroupSummary {
  groupId: string;
  description: string;
  category: TransactionCategory;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  paidInstallments: number;
  pendingInstallments: number;
  purchaseDate: string;
  nextDueDate?: string;
  status: 'fully_paid' | 'in_progress';
  installments: Transaction[];
}

export interface FutureCommitmentMonth {
  monthKey: string; // "YYYY-MM"
  monthLabel: string; // "Novembro 2026"
  year: number;
  monthIndex: number; // 0-11
  totalCommitted: number; // total previsto para o mês
  totalPending: number; // parcelas ainda pendentes
  totalPaid: number; // parcelas já pagas do mês
  installmentsCount: number;
  transactions: Transaction[];
}

export interface FutureCommitmentsSummary {
  totalCommittedInInstallments: number; // total valor de compras com parcelas pendentes
  totalPendingPayment: number; // total que falta pagar (somente parcelas pendentes)
  totalPaidPayment: number; // total já pago em parcelas
  remainingInstallmentsCount: number; // total de parcelas pendentes
  activePurchasesCount: number; // número de compras parceladas em andamento
  monthlyForecast: FutureCommitmentMonth[]; // próximos 12 meses
  activeGroups: InstallmentGroupSummary[]; // compras ativas detalhadas
}

export interface SaaSPlanFeatureLimits {
  maxGoals: number;
  allowRecurringExpenses: boolean;
  allowAdvancedReports: boolean;
  allowFullCsvExport: boolean;
  allowBudgetAlerts: boolean;
}

export const PLAN_LIMITS: Record<'free' | 'premium', SaaSPlanFeatureLimits> = {
  free: {
    maxGoals: 2,
    allowRecurringExpenses: false,
    allowAdvancedReports: false,
    allowFullCsvExport: false,
    allowBudgetAlerts: false,
  },
  premium: {
    maxGoals: 9999,
    allowRecurringExpenses: true,
    allowAdvancedReports: true,
    allowFullCsvExport: true,
    allowBudgetAlerts: true,
  },
};
