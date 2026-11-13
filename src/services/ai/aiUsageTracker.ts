import { AIUsageLogEntry, AIFeatureType, AIProviderType, UserPlanTier } from './types';
import { AILimitValidator } from './aiTierLimits';

const USAGE_STORAGE_KEY = 'fluxo_ai_usage_history';

export class AIUsageTracker {
  private static getStoredLogs(): AIUsageLogEntry[] {
    try {
      const raw = localStorage.getItem(USAGE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private static saveLogs(logs: AIUsageLogEntry[]): void {
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(logs.slice(-200)));
    } catch {}
  }

  public static getUsageCounts(userId: string): { dailyCount: number; monthlyCount: number } {
    const logs = this.getStoredLogs().filter(l => l.userId === userId);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentMonthStr = now.toISOString().slice(0, 7);

    const dailyCount = logs.filter(l => l.createdAt.startsWith(todayStr)).length;
    const monthlyCount = logs.filter(l => l.createdAt.startsWith(currentMonthStr)).length;

    return { dailyCount, monthlyCount };
  }

  public static checkQuota(
    userId: string,
    tier: UserPlanTier,
    feature: AIFeatureType
  ): { allowed: boolean; reason?: string } {
    if (!AILimitValidator.canAccessFeature(tier, feature)) {
      return {
        allowed: false,
        reason: `Funcionalidade ${feature} exclusiva para assinantes Premium.`,
      };
    }

    const { dailyCount, monthlyCount } = this.getUsageCounts(userId);
    return AILimitValidator.isWithinQuota(tier, dailyCount, monthlyCount);
  }

  public static recordUsage(
    userId: string,
    feature: AIFeatureType,
    provider: AIProviderType,
    tokensUsed: number = 0,
    costUsd: number = 0
  ): void {
    const logs = this.getStoredLogs();
    const entry: AIUsageLogEntry = {
      id: `ai-use-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId,
      feature,
      provider,
      tokensUsed,
      costUsd,
      createdAt: new Date().toISOString(),
    };
    logs.push(entry);
    this.saveLogs(logs);
  }
}

