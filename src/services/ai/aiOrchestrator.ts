import {
  AIFeatureType,
  AIResponse,
  SanitizedFinancialSnapshot,
  UserPlanTier,
} from './types';
import { AIUsageTracker } from './aiUsageTracker';
import { AIProviderFactory, IAIProvider } from './aiProviderInterface';
import { AIAnalyticsEngine, DeterministicFinancialInsight } from './aiAnalyticsEngine';

export class AIOrchestrator {
  private static provider: IAIProvider = AIProviderFactory.getProvider();

  /**
   * Executa uma requisição de análise inteligente coordenada:
   * Valida cota -> Sanitiza dados -> Fornece baseline determinística -> Standby/Provedor.
   */
  public static async requestFeatureAnalysis(
    userId: string,
    tier: UserPlanTier,
    feature: AIFeatureType,
    snapshot: SanitizedFinancialSnapshot
  ): Promise<{
    aiResponse: AIResponse;
    deterministicInsights: DeterministicFinancialInsight[];
  }> {
    // 1. Gera sempre insights determinísticos exatos e matemáticos
    const deterministicInsights = AIAnalyticsEngine.generateDeterministicInsights(snapshot);

    // 2. Valida se o usuário tem cota disponível para acionar IA
    const quotaCheck = AIUsageTracker.checkQuota(userId, tier, feature);
    if (!quotaCheck.allowed) {
      return {
        aiResponse: {
          success: false,
          errorCode: 'QUOTA_EXCEEDED',
          error: quotaCheck.reason || 'Limite de uso de IA atingido.',
          timestamp: new Date().toISOString(),
        },
        deterministicInsights,
      };
    }

    // 3. Encaminha para o provedor (nesta etapa: Standby seguro sem chamadas externas)
    let aiResponse: AIResponse;
    if (feature === 'spending_insights') {
      aiResponse = await this.provider.generateSpendingInsights(snapshot);
    } else if (feature === 'month_summary') {
      aiResponse = await this.provider.generateMonthSummary(snapshot);
    } else {
      aiResponse = {
        success: false,
        errorCode: 'AI_INTEGRATION_STANDBY',
        error: 'Funcionalidade em standby arquitetural.',
        timestamp: new Date().toISOString(),
      };
    }

    // 4. Registra log de uso apenas se houve resposta bem-sucedida
    if (aiResponse.success) {
      AIUsageTracker.recordUsage(
        userId,
        feature,
        this.provider.providerType,
        aiResponse.usage?.totalTokens || 0,
        aiResponse.usage?.estimatedCostUsd || 0
      );
    }

    return {
      aiResponse,
      deterministicInsights,
    };
  }
}

