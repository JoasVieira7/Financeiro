import { TransactionCategory } from '../types';

export type CategoryConfidence = 'high' | 'medium' | 'low';

export interface CategoryInferenceResult {
  category: TransactionCategory;
  confidence: CategoryConfidence;
  establishment?: string;
  matchedRule?: string;
}

const LOCAL_STORAGE_RULES_PREFIX = 'fluxo_user_category_rules_';

/**
 * Normaliza o texto de descrição para casamento uniforme de regras.
 */
export function normalizeDescription(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/g, ' ') // remove caracteres especiais
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Recupera as preferências de categorização aprendidas para o usuário autenticado.
 */
export function getUserCategoryRules(userId?: string): Record<string, TransactionCategory> {
  if (!userId || typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_RULES_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Salva uma preferência de categorização personalizada do usuário para reaproveitamento futuro.
 */
export function saveUserCategoryRule(
  userId: string,
  patternOrEstablishment: string,
  category: TransactionCategory
): void {
  if (!userId || !patternOrEstablishment || typeof window === 'undefined') return;
  const key = normalizeDescription(patternOrEstablishment);
  if (!key || key.length < 3) return;

  try {
    const rules = getUserCategoryRules(userId);
    rules[key] = category;
    localStorage.setItem(`${LOCAL_STORAGE_RULES_PREFIX}${userId}`, JSON.stringify(rules));
  } catch {
    // quota ou modo anônimo
  }
}

/**
 * Sistema Inteligente de Identificação de Estabelecimentos e Categorias.
 *
 * REGRA CRÍTICA (ETAPA 34.3):
 * - Mercado Livre / MercadoPago é um marketplace de compras, NUNCA classificar como Alimentação!
 * - Supermercados -> Alimentação.
 * - Farmácias -> Saúde.
 * - Postos de combustível -> Transporte.
 * - Restaurantes / Lanchonetes -> Alimentação.
 * - Serviços digitais / Streaming -> Lazer ou Contas.
 * - Vestuário -> Compras.
 * - Transporte por aplicativo -> Transporte.
 */
export function inferCategoryIntelligently(
  rawDescription: string,
  userId?: string
): CategoryInferenceResult {
  const norm = normalizeDescription(rawDescription);

  if (!norm) {
    return { category: 'Outros', confidence: 'low' };
  }

  // 1. Prioridade Máxima: Preferências aprendidas do próprio usuário autenticado
  if (userId) {
    const userRules = getUserCategoryRules(userId);
    for (const [savedPattern, savedCat] of Object.entries(userRules)) {
      if (norm.includes(savedPattern)) {
        return {
          category: savedCat,
          confidence: 'high',
          matchedRule: `Regra personalizada do usuário: "${savedPattern}"`,
        };
      }
    }
  }

  // 2. CORREÇÃO CRÍTICA MERCADO LIVRE & MARKETPLACES
  // Deve ser avaliado ANTES de qualquer regra genérica de "mercado"!
  if (
    /mercado\s*livre|mercadolivre|mercado\s*pago|mercadopago|merc\s*livre|mp\s*\*|merpago/i.test(
      norm
    )
  ) {
    return {
      category: 'Compras',
      confidence: 'high',
      establishment: 'Mercado Livre / Mercado Pago',
      matchedRule: 'Marketplace Mercado Livre',
    };
  }

  if (
    /amazon|shopee|aliexpress|ali\s*express|shein|magalu|magazine\s*luiza|americanas|casas\s*bahia|ponto\s*frio|submarino|enjoei|olx/i.test(
      norm
    )
  ) {
    return {
      category: 'Compras',
      confidence: 'high',
      establishment: 'Marketplace / Loja Online',
      matchedRule: 'Marketplace online',
    };
  }

  // 3. SUPERMERCADOS E MERCEARIAS (Alimentação - Mercado)
  if (
    /supermercado|hipermercado|hortifruti|sacolao|pao\s*de\s*acucar|carrefour|extra\s*mercado|assai|atacadao|atacadista|sam\s*s\s*club|st\s*marche|mambo|zaffari|dia\s*mercado|sendas|zona\s*sul\s*super|mercado\s+(?!livre|pago)|mercearia/i.test(
      norm
    )
  ) {
    return {
      category: 'Alimentação',
      confidence: 'high',
      establishment: 'Supermercado',
      matchedRule: 'Supermercado / Mercearia',
    };
  }

  // 4. RESTAURANTES, LANCHONETES E DELIVERY (Alimentação)
  if (
    /ifood|rappi|uber\s*eats|mcdonald|burger\s*king|subway|habib|outback|giraffas|restaurante|lanchonete|pizzaria|padaria|panificadora|churrascaria|hamburgueria|sorveteria|doceria|confeitaria|acougue|cafeteria|starbucks|cacau\s*show|kopenhagen|bar\s+|choperia|bistro|buffet|comida|lanche|pastelaria|rest\b/i.test(
      norm
    )
  ) {
    return {
      category: 'Alimentação',
      confidence: 'high',
      establishment: 'Restaurante / Delivery',
      matchedRule: 'Alimentação fora de casa',
    };
  }

  // 5. FARMÁCIAS, CLÍNICAS E SAÚDE
  if (
    /drogasil|droga\s*raia|drogaria\s*sao\s*paulo|drogarias\s*pacheco|pague\s*menos|panvel|farmacia|drogaria|droga\s+|hospital|laboratorio|fleury|lavoisier|delboni|clinica|medico|medica|dentista|odontolog|psicolog|psiquiat|fisioterapia|oftalmo|oftalmologia|exame|consulta|laboratorial|medicamento|remedio/i.test(
      norm
    )
  ) {
    return {
      category: 'Saúde',
      confidence: 'high',
      establishment: 'Farmácia / Saúde',
      matchedRule: 'Saúde e Farmácia',
    };
  }

  // 6. POSTOS DE COMBUSTÍVEL, TRANSPORTE POR APP E TRANSPORTE PÚBLICO
  if (
    /posto\s+|shell|ipiranga|petrobras|br\s*mania|auto\s*posto|gasolina|etanol|combustivel|gnv|lubrificante|troca\s*de\s*oleo|estacionamento|estapar|park|parking|pedagio|sem\s*parar|veloe|conectcar|tag\s*itau|auto\s*pass|top\s*sp|metro\s+|onibus|sptrans|bilhete\s*unico|passagem|uber|99app|99pop|99\s*corrida|99\s*tecnologia|indrive|cabify|taxi/i.test(
      norm
    )
  ) {
    return {
      category: 'Transporte',
      confidence: 'high',
      establishment: 'Transporte / Combustível',
      matchedRule: 'Transporte e Mobilidade',
    };
  }

  // 7. SERVIÇOS DIGITAIS, STREAMING E LAZER
  if (
    /netflix|spotify|prime\s*video|disney|hbo|max\s*streaming|paramount|globoplay|globo\s*play|youtube|apple\s*com\s*bill|google\s*storage|playstation|psn|xbox|microsoft\s*game|steam|nintendo|deezer|cinema|cinemark|cinepolis|ingresso\s*com|show|sympla|eventim|ticket360|academia|smart\s*fit|bluefit|viagem|hotel|airbnb|booking|decolar|voegol|latam|azul\s*linhas/i.test(
      norm
    )
  ) {
    return {
      category: 'Lazer',
      confidence: 'high',
      establishment: 'Lazer / Streaming',
      matchedRule: 'Streaming e Lazer',
    };
  }

  // 8. CONTAS, CONDOMÍNIO E MORADIA
  if (
    /aluguel|condominio|iptu|imobiliaria|quinto\s*andar|loft|energia|enel|copel|cemig|light|cpfl|elektro|luz|agua|sanepar|sabesp|copasa|embasa|gas\s*natural|comgas|ultragaz|supergasbras/i.test(
      norm
    )
  ) {
    return {
      category: 'Moradia',
      confidence: 'high',
      establishment: 'Contas da Casa',
      matchedRule: 'Moradia e Contas Fixas',
    };
  }

  // 9. TELEFONIA, INTERNET E SERVIÇOS
  if (
    /vivo|claro|tim|oi\s*fibra|telecom|internet|banda\s*larga|provedor|celular|recarga|seguro|porto\s*seguro|bradesco\s*seguros|tokio\s*marine|sulamerica|curso|faculdade|escola|colegio|educacao|udemy|alura|hotmart|livraria|saraiva/i.test(
      norm
    )
  ) {
    return {
      category: 'Contas',
      confidence: 'high',
      establishment: 'Serviços / Telecom',
      matchedRule: 'Telecom e Assinaturas Essenciais',
    };
  }

  // 10. VESTUÁRIO E LOJAS FÍSICAS DE ROUPAS/CALÇADOS
  if (
    /zara|renner|lojas\s*renner|c&a|cea|riachuelo|centauro|nike|adidas|netshoes|arezzo|anacapri|schutz|havaianas|vestuario|calcado|roupa|moda\b/i.test(
      norm
    )
  ) {
    return {
      category: 'Compras',
      confidence: 'high',
      establishment: 'Vestuário',
      matchedRule: 'Vestuário e Calçados',
    };
  }

  // 11. Palavras-chave secundárias com confiança Média
  if (/mercado|almoco|jantar|cafe|alimento|comida/.test(norm)) {
    return { category: 'Alimentação', confidence: 'medium', matchedRule: 'Alimentação genérica' };
  }
  if (/veiculo|carro|moto|oficina|mecanica|lavagem|estac/.test(norm)) {
    return { category: 'Transporte', confidence: 'medium', matchedRule: 'Transporte genérico' };
  }
  if (/saude|clinica|doutor|remedio/.test(norm)) {
    return { category: 'Saúde', confidence: 'medium', matchedRule: 'Saúde genérica' };
  }
  if (/livro|papelaria|curso|aula/.test(norm)) {
    return { category: 'Contas', confidence: 'medium', matchedRule: 'Educação' };
  }

  // 12. Fallback de Baixa Confiança: não inventar categorias arbitrárias!
  return {
    category: 'Compras',
    confidence: 'low',
    matchedRule: 'Sem correspondência específica (recomenda-se revisão)',
  };
}

