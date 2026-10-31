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
  monthlyIncome: number;
  monthlyExpense: number;
  remainingBudget: number;
  budgetUsedPercentage: number;
  weeklySavedAmount: number;
  weeklyGoalPercentage: number;
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
