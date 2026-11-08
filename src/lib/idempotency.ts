import { EditablePdfItem, InvoiceMetadata } from './pdfAdapters/types';
import { roundToCents } from './budgetCalculations';

/**
 * Erro lançado quando SHA-256 não está disponível no ambiente.
 * A importação PDF deve ser interrompida com mensagem clara ao usuário.
 */
export class Sha256UnavailableError extends Error {
  constructor() {
    super(
      'SHA-256 não está disponível neste ambiente. ' +
      'A importação de faturas PDF requer um navegador moderno com suporte a Web Crypto API (crypto.subtle). ' +
      'Tente utilizar Chrome, Firefox, Edge ou Safari em versão atualizada.'
    );
    this.name = 'Sha256UnavailableError';
  }
}

/**
 * Calcula hash SHA-256 via Web Crypto API (crypto.subtle).
 *
 * Não possui fallback não-criptográfico: se crypto.subtle não estiver disponível,
 * lança Sha256UnavailableError e a importação é interrompida com mensagem clara.
 * Hash não criptográfico (FNV-1a etc.) não é aceito como substituto.
 */
export async function computeSha256(input: string): Promise<string> {
  if (
    typeof crypto === 'undefined' ||
    !crypto.subtle ||
    typeof crypto.subtle.digest !== 'function'
  ) {
    throw new Sha256UnavailableError();
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deriva um UUID RFC4122 v4 determinístico a partir de um hash SHA-256 hexadecimal
 * e um sufixo diferenciador (índice da transação, 'grp', 'tx', 'inst-N-M', etc.).
 *
 * ATENÇÃO: Estes são UUIDs determinísticos com formato UUID v4 compatível.
 * Não são UUIDs aleatórios convencionais. Dois inputs idênticos sempre
 * produzem o mesmo UUID — essa propriedade é intencional para garantir
 * idempotência em retries.
 *
 * Algoritmo:
 * 1. Concatena o SHA-256 (já seguro) com o sufixo diferenciador.
 * 2. Aplica FNV-1a sobre a concatenação para misturar os bits.
 *    FNV-1a aqui é derivação de identificador, não hash de segurança —
 *    a entropia já vem do SHA-256 do payload, que é criptograficamente seguro.
 * 3. Formata como UUID v4 (bits de versão 0100 e variante 10xx preservados).
 *
 * @param payloadHash - SHA-256 hex de 64 chars do payload (já calculado por computeSha256)
 * @param suffix - sufixo único por transação (ex: 'tx-0', 'grp-1', 'inst-2-3')
 */
export function generateDeterministicUuid(payloadHash: string, suffix: string): string {
  const seed = `${payloadHash}:${suffix}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x6c62272e;
  let h3 = 0x27d4eb2f;
  let h4 = 0x165667b1;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c * 31), 0x01000193);
    h3 = Math.imul(h3 ^ (c * 57), 0x01000193);
    h4 = Math.imul(h4 ^ (c * 97), 0x01000193);
  }
  const s1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const s2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const s3 = (h3 >>> 0).toString(16).padStart(8, '0');
  const s4 = (h4 >>> 0).toString(16).padStart(8, '0');
  const raw = `${s1}${s2}${s3}${s4}`;

  const p1 = raw.substring(0, 8);
  const p2 = raw.substring(8, 12);
  const p3 = '4' + raw.substring(13, 16);
  const p4Nibble = ((parseInt(raw.substring(16, 17), 16) & 0x3) | 0x8).toString(16);
  const p4 = p4Nibble + raw.substring(17, 20);
  const p5 = raw.substring(20, 32);

  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

export interface IdempotencyPlan {
  /**
   * Identifica a **operação/fatura**, não o conteúdo.
   * Derivada de: userId + emissor + últimos 4 dígitos do cartão (quando disponíveis) + mês de vencimento.
   *
   * Formato: `pdf_{userId8}_{issuerSlug}[-{card4}]_{dueDate|YYYY-MM}`
   *
   * Consequências:
   * - Retry idêntico: mesma chave, mesmo hash → retorno idempotente ✓
   * - Mesma fatura, conteúdo editado: mesma chave, hash diferente → rejeição ✓
   * - Fatura de outro mês: chave diferente → nova importação legítima ✓
   * - Usuários diferentes: chave diferente por userId ✓
   * - Dois cartões do mesmo banco no mesmo mês: chave diferente se card4 disponível ✓
   *
   * Limitações documentadas:
   * 1. Quando o emissor não for identificado com confiança ('low'), usa 'unknown'.
   * 2. Quando a data de vencimento não estiver disponível, usa 'sem-vencimento'.
   * 3. Quando os últimos 4 dígitos do cartão não estiverem disponíveis no PDF,
   *    dois cartões do mesmo banco no mesmo mês compartilham a mesma chave base.
   *    Nesse caso, a primeira importação grava; a segunda com payload diferente é
   *    **rejeitada** com mensagem de conflito — não inserida silenciosamente.
   *    O usuário deve confirmar explicitamente que é uma fatura diferente.
   * 4. Faturas genéricas ('unknown') sem vencimento compartilham chave — comportamento igual ao item 3.
   * 5. Nenhum identificador bancário é inventado. Apenas dados realmente extraídos do PDF são usados.
   */
  idempotencyKey: string;

  /**
   * Hash SHA-256 do payload normalizado completo (userId + emissor + vencimento + card4 + itens).
   * Identifica o **conteúdo exato** confirmado pelo usuário.
   * Sempre SHA-256 de 64 chars hex — nunca hash não criptográfico.
   */
  payloadHash: string;

  /** Número de itens normalizados no payload. */
  normalizedCount: number;
}

/**
 * Constrói o slug do emissor para uso na chave de idempotência.
 * Usa apenas caracteres seguros para compor a chave (a-z, 0-9, hífen).
 */
function buildIssuerSlug(issuer: string, confidence: 'high' | 'medium' | 'low'): string {
  if (!issuer || confidence === 'low') return 'unknown';
  return issuer
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 20) || 'unknown';
}

/**
 * Constrói o segmento de data para uso na chave de idempotência.
 * Usa apenas o mês de vencimento (YYYY-MM) para agrupar faturas do mesmo ciclo.
 * Se não houver data de vencimento confiável, usa 'sem-vencimento'.
 */
function buildDueDateSlug(dueDate: string | null | undefined): string {
  if (!dueDate) return 'sem-vencimento';
  // Aceita YYYY-MM-DD ou YYYY-MM
  const match = dueDate.match(/^(\d{4}-\d{2})/);
  return match ? match[1] : 'sem-vencimento';
}

/**
 * Constrói o slug do identificador do cartão para uso na chave de idempotência.
 * Usa apenas os últimos 4 dígitos quando realmente extraídos do documento.
 * Retorna string vazia (sem segmento na chave) quando não disponível.
 * Nunca inventa ou deduz números de cartão.
 */
function buildCardSlug(cardLastFourDigits: string | undefined): string {
  if (!cardLastFourDigits) return '';
  const digits = cardLastFourDigits.replace(/\D/g, '');
  if (digits.length !== 4) return '';
  return `-${digits}`;
}

/**
 * Gera o plano de idempotência para uma importação de fatura PDF.
 *
 * Separa explicitamente:
 * - `idempotencyKey`: identidade da operação (fatura, não conteúdo)
 * - `payloadHash`: hash SHA-256 do conteúdo exato confirmado
 *
 * Lança Sha256UnavailableError se crypto.subtle não estiver disponível.
 * Nenhum hash não-criptográfico é aceito como substituto.
 */
export async function generatePdfImportIdempotencyPlan(
  userId: string,
  metadata: InvoiceMetadata,
  selectedPurchases: EditablePdfItem[]
): Promise<IdempotencyPlan> {
  // Ordena os itens para garantir consistência determinística independente da ordem de seleção
  const normalizedItems = selectedPurchases.map(p => ({
    desc: p.description.trim().toLowerCase(),
    amount: roundToCents(p.amount),
    purchaseDate: p.purchaseDate || '',
    dueDate: p.dueDate || metadata.dueDate || '',
    cur: p.type === 'installment' ? Math.max(1, p.currentInstallment || 1) : 1,
    tot: p.type === 'installment' ? Math.max(1, p.totalInstallments || 1) : 1,
    card: (p.cardName || metadata.issuer || 'cartao').trim().toLowerCase(),
    type: p.type,
  })).sort((a, b) => {
    const dComp = a.purchaseDate.localeCompare(b.purchaseDate);
    if (dComp !== 0) return dComp;
    const descComp = a.desc.localeCompare(b.desc);
    if (descComp !== 0) return descComp;
    return a.amount - b.amount;
  });

  // payloadHash: SHA-256 do conteúdo completo confirmado (lança Sha256UnavailableError se indisponível)
  // Inclui cardLastFourDigits no payload para diferenciar cartões adicionais do mesmo banco
  const payloadString = JSON.stringify({
    userId,
    issuer: (metadata.issuer || '').toLowerCase(),
    invoiceDueDate: metadata.dueDate || '',
    totalInvoiceAmount: metadata.totalInvoiceAmount || 0,
    cardLastFourDigits: metadata.cardLastFourDigits || null,
    items: normalizedItems,
  });
  const payloadHash = await computeSha256(payloadString); // lança Sha256UnavailableError se necessário

  // idempotencyKey: identidade da operação (fatura), não do conteúdo
  // Inclui cardLastFourDigits quando disponível para diferenciar cartões do mesmo banco no mesmo mês.
  // Se não disponível, o payloadHash (diferente por conteúdo) ainda distingue faturas no nível de conflito.
  const issuerSlug = buildIssuerSlug(metadata.issuer, metadata.issuerConfidence);
  const cardSlug = buildCardSlug(metadata.cardLastFourDigits);
  const dueDateSlug = buildDueDateSlug(metadata.dueDate);
  const idempotencyKey = `pdf_${userId.substring(0, 8)}_${issuerSlug}${cardSlug}_${dueDateSlug}`;

  return {
    idempotencyKey,
    payloadHash,
    normalizedCount: normalizedItems.length,
  };
}

