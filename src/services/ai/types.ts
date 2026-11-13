/**
 * Arquitetura Preparada para Inteligência Artificial — Fluxo Financeiro
 * ETAPA 36 — Camada de Tipos, Interfaces e Contratos de IA
 * 
 * DIRETRIZES FUNDAMENTAIS:
 * 1. Desacoplamento total de provedores (compatível com Gemini, OpenAI, Claude e modelos locais).
 * 2. Segurança e Privacidade: nenhum PII (Nome, CPF, Email, Conta) é enviado ao provedor.
 * 3. Governança de Custos: limites estritos de tokens e requisições por plano (Free vs Premium).
 * 4. Determinismo: análises financeiras são baseadas exclusivamente em números reais do usuário.
 */

export type AIProviderType = 'gemini' | 'openai' | 'anthropic' | 'local_edge';

export type AIFeatureType =
  | 'chat_assistant'
  | 'spending_insights'
  | 'financial_planning'
  | 'month_summary';

export type UserPlanTier = 'free' | 'premium';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: 'AI_INTEGRATION_STANDBY' | 'QUOTA_EXCEEDED' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'INVALID_RESPONSE';
  usage?: TokenUsage;
  provider?: AIProviderType;
  timestamp: string;
}

export interface PlanAILimits {
  tier: UserPlanTier;
  maxMonthlyRequests: number;
  maxDailyRequests: number;
  maxTokensPerRequest: number;
  allowedFeatures: AIFeatureType[];
}

/**
 * Snapshot financeiro estritamente anonimizado (sem PII).
 * Apenas números, categorias e datas agregadas para consumo seguro por modelos de linguagem.
 */
export interface SanitizedFinancialSnapshot {
  periodMonthYear: string;
  currency: string;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  monthlySavingTarget: number;
  savingsGoalReachedPct: number;
  totalPendingDebt: number;
  topCategories: Array<{
    category: string;
    amount: number;
    pctOfTotalExpense: number;
    transactionCount: number;
  }>;
  recentTrends: {
    expenseChangeVsPreviousMonthPct: number;
    highestExpenseCategory: string;
    recurringExpensesTotal: number;
  };
}

export interface AIProviderConfig {
  activeProvider: AIProviderType;
  apiEndpoint?: string;
  timeoutMs: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
}

export interface AIUsageLogEntry {
  id: string;
  userId: string;
  feature: AIFeatureType;
  provider: AIProviderType;
  tokensUsed: number;
  costUsd: number;
  createdAt: string;
}

