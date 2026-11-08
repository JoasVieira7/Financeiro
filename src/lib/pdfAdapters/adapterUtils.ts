import { parseMonetaryValue, inferCategory } from '../installmentExcelParser';
import { roundToCents } from '../budgetCalculations';

export const PORTUGUESE_MONTHS: Record<string, string> = {
  jan: '01',
  fev: '02',
  mar: '03',
  abr: '04',
  mai: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  set: '09',
  out: '10',
  nov: '11',
  dez: '12',
};

/**
 * Infere a data da compra em formato ISO YYYY-MM-DD tratando viradas de ano.
 * Exemplo: Fatura com vencimento em 10/01/2027 com compra em 18/12 -> 2026-12-18.
 */
export function inferPurchaseDate(
  dateStr: string,
  invoiceDueDate: string | null
): string | null {
  if (!dateStr) return null;
  const raw = dateStr.trim();

  // 1. Se já contém ano completo (DD/MM/AAAA ou AAAA-MM-DD)
  const fullBrMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (fullBrMatch) {
    const d = fullBrMatch[1].padStart(2, '0');
    const m = fullBrMatch[2].padStart(2, '0');
    const y = fullBrMatch[3];
    return `${y}-${m}-${d}`;
  }

  const isoMatch = raw.match(/^(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 2. Extrai dia e mês numérico ou textual
  let day = '';
  let month = '';

  // Formato DD/MM
  const brShortMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})$/);
  if (brShortMatch) {
    day = brShortMatch[1].padStart(2, '0');
    month = brShortMatch[2].padStart(2, '0');
  } else {
    // Formato DD MMM (ex: "15 OUT", "08 DEZ", "12/OUT")
    const textMonthMatch = raw.match(/^(\d{1,2})[\/\-\s]+([a-zA-Z]{3,4})/);
    if (textMonthMatch) {
      day = textMonthMatch[1].padStart(2, '0');
      const monthPrefix = textMonthMatch[2].toLowerCase().substring(0, 3);
      month = PORTUGUESE_MONTHS[monthPrefix] || '';
    }
  }

  if (!day || !month) return null;

  // 3. Determina o ano considerando a data de vencimento da fatura
  let targetYear = new Date().getFullYear();
  let dueMonth = 1;

  if (invoiceDueDate && /^\d{4}-\d{2}-\d{2}/.test(invoiceDueDate)) {
    targetYear = parseInt(invoiceDueDate.substring(0, 4), 10);
    dueMonth = parseInt(invoiceDueDate.substring(5, 7), 10);
  }

  const purchaseMonthNum = parseInt(month, 10);

  // Regra de virada de ano:
  // Se a fatura vence em Janeiro ou Fevereiro (mês 1 ou 2) e a compra foi em Novembro ou Dezembro (mês 11 ou 12),
  // a compra pertence ao ano anterior!
  if (dueMonth <= 2 && purchaseMonthNum >= 11) {
    targetYear -= 1;
  }

  return `${targetYear}-${month}-${day}`;
}

export interface ExtractedInstallment {
  isInstallment: boolean;
  currentInstallment: number;
  totalInstallments: number;
  cleanText: string;
}

/**
 * Detecta indicadores de parcelamento em linhas de extrato.
 * Regra obrigatória: '01/01' NÃO é considerado parcelamento! Total de parcelas deve ser > 1.
 */
export function extractInstallmentInfo(text: string): ExtractedInstallment {
  const patterns: RegExp[] = [
    // 1. "Parcela X/Y" ou "Parcela X de Y"
    /\b(?:parcela|parc\.?)\s*(\d{1,2})\s*(?:\/|\s*de\s*|\-)\s*(\d{1,2})\b/i,
    // 2. Formato entre parênteses: "(02/10)" ou "(2/8)"
    /\((\d{1,2})\s*[\/\-]\s*(\d{1,2})\)/,
    // 3. Formato com prefixo P: "P02/10" ou "P2/8"
    /\bP(\d{1,2})\s*[\/\-]\s*(\d{1,2})\b/i,
    // 4. Formato PARC XX/YY
    /\bPARC\s*(\d{1,2})\s*[\/\-]\s*(\d{1,2})\b/i,
    // 5. Formato com hífen ou espaço: " - 02/08 " ou " 02/10 "
    /(?:[\-\s])(\d{1,2})\s*[\/]\s*(\d{1,2})(?:[\s]|$)/,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) {
      const cur = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);

      // Validação financeira: total deve ser > 1 e atual deve ser <= total
      // '01/01' NÃO é compra parcelada
      if (total > 1 && cur >= 1 && cur <= total) {
        const cleanText = text.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
        return {
          isInstallment: true,
          currentInstallment: cur,
          totalInstallments: total,
          cleanText,
        };
      }
    }
  }

  return {
    isInstallment: false,
    currentInstallment: 1,
    totalInstallments: 1,
    cleanText: text.trim(),
  };
}

export type LineClassification = 'payment' | 'refund' | 'fee' | 'purchase' | 'other';

export interface ParsedPdfAmount {
  amount: number;
  isCredit: boolean;
}

/**
 * Interpreta valores monetários específicos de faturas PDF bancárias.
 * Reconhece sinais negativos no início (-1.235,11), no fim (1.235,11-),
 * parênteses (1.235,11), e indicadores bancários de crédito (C, CR) e débito (D).
 * NÃO altera o parseMonetaryValue geral usado pela importação Excel/CSV.
 */
export function parsePdfMonetaryValue(val: any): ParsedPdfAmount {
  if (typeof val === 'number') {
    return { amount: val, isCredit: val < 0 };
  }
  if (!val) {
    return { amount: 0, isCredit: false };
  }

  const raw = String(val).trim();

  // 1. Identifica créditos por sinal negativo no início, no fim, parênteses ou indicador C/CR
  const hasLeadingMinus = raw.startsWith('-');
  const hasTrailingMinus = /-$/.test(raw) || /-\s*$/.test(raw);
  const hasParentheses = (raw.startsWith('(') && raw.endsWith(')')) || /^\([^\)]+\)$/.test(raw);
  const hasCreditIndicator = /\s*C[Rr]?$/i.test(raw);
  const hasDebitIndicator = /\s*D$/i.test(raw);

  const isCredit = (hasLeadingMinus || hasTrailingMinus || hasParentheses || hasCreditIndicator) && !hasDebitIndicator;

  // 2. Extrai valor numérico respeitando pontuação brasileira (milhar com ponto, decimal com vírgula)
  const str = raw.replace(/[^\d,\.]/g, '');
  if (!str) {
    return { amount: 0, isCredit: false };
  }

  let num = 0;
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      num = parseFloat(str.replace(/\./g, '').replace(',', '.'));
    } else {
      num = parseFloat(str.replace(/,/g, ''));
    }
  } else if (hasComma) {
    const commaCount = (str.match(/,/g) || []).length;
    num = commaCount > 1 ? parseFloat(str.replace(/,/g, '')) : parseFloat(str.replace(',', '.'));
  } else if (hasDot) {
    const dotCount = (str.match(/\./g) || []).length;
    num = dotCount > 1 ? parseFloat(str.replace(/\./g, '')) : parseFloat(str);
  } else {
    num = parseFloat(str);
  }

  if (isNaN(num)) {
    return { amount: 0, isCredit: false };
  }

  const absAmount = roundToCents(num);
  return {
    amount: isCredit ? -absAmount : absAmount,
    isCredit,
  };
}

/**
 * Classifica uma linha de extrato entre pagamento, estorno, encargo, saldo anterior ou compra regular.
 * Prioriza itens informativos e pagamentos antes da regra genérica que retorna 'purchase'.
 */
export function classifyLine(text: string, amount: number, isCredit?: boolean): LineClassification {
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Saldos anteriores, faturas anteriores e resumos informativos (não devem ser importados como compras)
  if (
    /\b(?:saldo|fatura|total|valor)\s+(?:da\s+)?(?:fatura\s+)?anterior\b/i.test(lower) ||
    /\bsaldo\s+remanescente\b/i.test(lower) ||
    /\bresumo\s+(?:da\s+)?fatura\b/i.test(lower) ||
    /\b(?:saldo|total)\s+a\s+pagar\b/i.test(lower) ||
    /\b(?:limite|saldo)\s+de\s+credito\b/i.test(lower)
  ) {
    return 'other';
  }

  // 2. Pagamentos de fatura (PAGTO, PAGAMENTO, PGTO, PAGTO TITULO, PAGTO ELETRONICO, LIQUIDACAO DE TITULO, etc.)
  if (
    /\b(?:pagamento|pagto|pgto)\b/i.test(lower) ||
    /\bcredito\s+(?:de\s+)?pag(?:amento|to)?\b/i.test(lower) ||
    /\brecebimento\s+(?:de\s+)?pag(?:amento|to)?\b/i.test(lower) ||
    /\bliq(?:uidacao)?\.?\s*(?:de\s*)?(?:titulo|fatura|cobranca|bloqueto|boleto)\b/i.test(lower) ||
    /\bliq\.?\s*titulo\b/i.test(lower) ||
    /\bficha\s*(?:de\s*)?compensac/i.test(lower) ||
    /\bautocredito\b/i.test(lower)
  ) {
    return 'payment';
  }

  // 3. Estornos e reembolsos (ou crédito bancário explícito não classificado como pagamento)
  if (
    /estorno|reembolso|devolucao|cancelamento\s+de\s+compra/i.test(lower) ||
    amount < 0 ||
    isCredit === true
  ) {
    return 'refund';
  }

  // 4. Encargos, juros, multas e tributos
  if (
    /\biof\b|juros\s+de\s+mora|multa\s+por\s+atraso|encargos\s+de\s+financiamento|anuidade|tarifa/i.test(
      lower
    )
  ) {
    return 'fee';
  }

  return 'purchase';
}

/**
 * Tenta extrair a data de vencimento da fatura a partir do texto global.
 */
export function extractDueDateFromText(fullText: string): string | null {
  const patterns: RegExp[] = [
    /(?:vencimento|vence\s+em|data\s+de\s+vencimento|data\s+vencimento|vencimento\s+da\s+fatura)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(?:pague\s+ate|pagar\s+ate)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})\s*(?:vencimento)/i,
  ];

  for (const regex of patterns) {
    const match = fullText.match(regex);
    if (match) {
      const rawDate = match[1];
      const parsed = inferPurchaseDate(rawDate, null);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Tenta extrair o valor total da fatura a partir do texto global.
 */
export function extractTotalInvoiceAmount(fullText: string): number | undefined {
  const patterns: RegExp[] = [
    /(?:total\s+da\s+fatura|total\s+a\s+pagar|valor\s+total|saldo\s+atual|total\s+desta\s+fatura)[:\s]+(?:R\$\s*)?([\d\.,]+)/i,
    /(?:fatura\s+fechada\s+em)[:\s]+(?:R\$\s*)?([\d\.,]+)/i,
  ];

  for (const regex of patterns) {
    const match = fullText.match(regex);
    if (match) {
      const val = parseMonetaryValue(match[1]);
      if (val > 0) return roundToCents(val);
    }
  }

  return undefined;
}

/**
 * Detecta cabeçalhos de seção de cartão (titular ou adicionais) para atribuir
 * corretamente o cartão a cada lançamento.
 */
export function extractCardNameFromSection(lineText: string, defaultBank: string): string | null {
  const trimmed = lineText.trim();
  if (!trimmed || trimmed.length < 5) return null;

  // 1. Padrão "Lançamentos no cartão final 1234 - NOME" ou "Cartão final 1234"
  const m1 = trimmed.match(/(?:lançamentos\s+no\s+)?cart[aã]o\s+(?:final\s+)?(\d{4})(?:\s*[-–—]\s*([a-zA-Z\s]+))?/i);
  if (m1) {
    const digits = m1[1];
    const holder = m1[2]?.trim();
    return holder ? `${defaultBank} final ${digits} (${holder})` : `${defaultBank} final ${digits}`;
  }

  // 2. Padrão "NOME DO TITULAR / ADICIONAL (final 1234)"
  const m2 = trimmed.match(/^([A-Z\s]{3,30})\s+[\(\[]final\s*(\d{4})[\)\]]/i);
  if (m2) {
    const holder = m2[1].trim();
    const digits = m2[2];
    return `${defaultBank} final ${digits} (${holder})`;
  }

  // 3. Padrão "Cartão: **** **** **** 1234"
  const m3 = trimmed.match(/cart[aã]o[:\s]+[xX\*\.\s]+(\d{4})(?:\s*[-–—]\s*([a-zA-Z\s]+))?/i);
  if (m3) {
    const digits = m3[1];
    const holder = m3[2]?.trim();
    return holder ? `${defaultBank} final ${digits} (${holder})` : `${defaultBank} final ${digits}`;
  }

  return null;
}
