import { PlanAILimits, UserPlanTier, AIFeatureType } from './types';

export const AI_TIER_LIMITS: Record<UserPlanTier, PlanAILimits> = {
  free: {
    tier: 'free',
    maxMonthlyRequests: 3,
    maxDailyRequests: 1,
    maxTokensPerRequest: 1000,
    allowedFeatures: ['spending_insights'],
  },
  premium: {
    tier: 'premium',
    maxMonthlyRequests: 100,
    maxDailyRequests: 20,
    maxTokensPerRequest: 4000,
    allowedFeatures: [
      'spending_insights',
      'chat_assistant',
      'financial_planning',
      'month_summary',
    ],
  },
};

export class AILimitValidator {
  public static canAccessFeature(tier: UserPlanTier, feature: AIFeatureType): boolean {
    const limits = AI_TIER_LIMITS[tier];
    return limits.allowedFeatures.includes(feature);
  }

  public static isWithinQuota(
    tier: UserPlanTier,
    currentDailyUsage: number,
    currentMonthlyUsage: number
  ): { allowed: boolean; reason?: string } {
    const limits = AI_TIER_LIMITS[tier];

    if (currentDailyUsage >= limits.maxDailyRequests) {
      return {
        allowed: false,
        reason: `Limite diário de requisições de IA atingido (${limits.maxDailyRequests}/dia).`,
      };
    }

    if (currentMonthlyUsage >= limits.maxMonthlyRequests) {
      return {
        allowed: false,
        reason: `Limite mensal de requisições de IA atingido (${limits.maxMonthlyRequests}/mês).`,
      };
    }

    return { allowed: true };
  }
}

