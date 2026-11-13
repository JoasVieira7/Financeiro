import {
  AIProviderType,
  AIResponse,
  SanitizedFinancialSnapshot,
  AIProviderConfig,
} from './types';

/**
 * Contrato Oficial para Provedores de Inteligência Artificial
 * Qualquer integração futura (Gemini, OpenAI, Claude, Local Edge)
 * implementará esta mesma interface, sem alterar o frontend.
 */
export interface IAIProvider {
  readonly providerType: AIProviderType;

  /**
   * Verifica se o provedor está online e com credenciais válidas no backend.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Gera análises inteligentes de padrões e oportunidades de economia.
   */
  generateSpendingInsights(
    snapshot: SanitizedFinancialSnapshot
  ): Promise<AIResponse<string[]>>;

  /**
   * Gera um resumo textual executivo do mês.
   */
  generateMonthSummary(
    snapshot: SanitizedFinancialSnapshot
  ): Promise<AIResponse<string>>;

  /**
   * Responde perguntas do usuário sobre suas finanças.
   */
  answerFinancialQuestion(
    snapshot: SanitizedFinancialSnapshot,
    userQuestion: string
  ): Promise<AIResponse<string>>;
}

/**
 * Provedor em Modo Standby (Etapa Atual de Arquitetura)
 * Garante desacoplamento total, sem custos de API externos e sem simulação enganosa.
 */
export class StandbyAIProvider implements IAIProvider {
  public readonly providerType: AIProviderType = 'gemini';

  public async isAvailable(): Promise<boolean> {
    return false; // Standby: aguarda ativação de chave e Edge Function
  }

  public async generateSpendingInsights(
    _snapshot: SanitizedFinancialSnapshot
  ): Promise<AIResponse<string[]>> {
    return {
      success: false,
      errorCode: 'AI_INTEGRATION_STANDBY',
      error: 'Módulo de IA preparado na arquitetura. Ativação via Edge Function agendada para etapa posterior.',
      provider: this.providerType,
      timestamp: new Date().toISOString(),
    };
  }

  public async generateMonthSummary(
    _snapshot: SanitizedFinancialSnapshot
  ): Promise<AIResponse<string>> {
    return {
      success: false,
      errorCode: 'AI_INTEGRATION_STANDBY',
      error: 'Módulo de IA preparado na arquitetura. Ativação via Edge Function agendada para etapa posterior.',
      provider: this.providerType,
      timestamp: new Date().toISOString(),
    };
  }

  public async answerFinancialQuestion(
    _snapshot: SanitizedFinancialSnapshot,
    _userQuestion: string
  ): Promise<AIResponse<string>> {
    return {
      success: false,
      errorCode: 'AI_INTEGRATION_STANDBY',
      error: 'Módulo de IA preparado na arquitetura. Ativação via Edge Function agendada para etapa posterior.',
      provider: this.providerType,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Fábrica de Provedores de IA
 */
export class AIProviderFactory {
  public static getProvider(config?: Partial<AIProviderConfig>): IAIProvider {
    // Nesta etapa arquitetural, retorna o provedor standby seguro
    return new StandbyAIProvider();
  }
}

