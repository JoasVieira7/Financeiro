/**
 * Utilitários de Cartão de Crédito e Vencimento de Faturas (Etapa 34.4)
 * Permite associar compras no cartão ao mês correto de vencimento da fatura,
 * calculando automaticamente com base no dia de fechamento e vencimento,
 * com suporte a ajuste manual e persistência isolada por usuário.
 */

export interface CreditCardSettings {
  dueDay: number;      // Dia de vencimento da fatura (1 a 31, padrão: 10)
  closingDay: number;  // Dia de fechamento da fatura (1 a 31, padrão: 7 dias antes do vencimento)
}

export interface InvoicePeriodOption {
  year: number;
  month: number;       // 1 a 12
  dueDay: number;
  dueDate: string;     // YYYY-MM-DD
  label: string;       // ex: "Dezembro de 2026"
  isCurrentMonth: boolean;
  isNextMonth: boolean;
}

const STORAGE_PREFIX = 'fluxo_card_settings_';

/**
 * Obtém a configuração de cartão salva do usuário ou os valores padrão.
 */
export function getCreditCardSettings(userId?: string): CreditCardSettings {
  const key = `${STORAGE_PREFIX}${userId || 'default'}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const dueDay = Math.min(31, Math.max(1, parseInt(parsed.dueDay, 10) || 10));
      const closingDay = parsed.closingDay !== undefined
        ? Math.min(31, Math.max(1, parseInt(parsed.closingDay, 10)))
        : getDefaultClosingDay(dueDay);
      return { dueDay, closingDay };
    }
  } catch {
    // fallback
  }
  return { dueDay: 10, closingDay: 3 };
}

/**
 * Salva a configuração de cartão do usuário.
 */
export function saveCreditCardSettings(settings: CreditCardSettings, userId?: string): void {
  const key = `${STORAGE_PREFIX}${userId || 'default'}`;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // localstorage error
  }
}

/**
 * Dia padrão de fechamento: aproximadamente 7 dias antes do vencimento.
 */
export function getDefaultClosingDay(dueDay: number): number {
  if (dueDay > 7) {
    return dueDay - 7;
  }
  // Se o vencimento for nos primeiros dias do mês (ex: dia 5), fecha no mês anterior (dia 28)
  return 28 - (7 - dueDay);
}

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Calcula o mês/ano sugerido para a fatura de uma compra no cartão.
 * Se a compra foi feita APÓS o fechamento daquele mês, cai na fatura do mês seguinte.
 */
export function calculateSuggestedInvoicePeriod(
  purchaseDateStr: string,
  dueDay: number = 10,
  closingDay: number = 3
): { year: number; month: number; dueDay: number; dueDate: string } {
  const pDate = new Date(`${purchaseDateStr.split('T')[0]}T12:00:00`);
  if (isNaN(pDate.getTime())) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    return { year, month, dueDay, dueDate };
  }

  const pYear = pDate.getFullYear();
  const pMonth = pDate.getMonth() + 1; // 1-12
  const pDay = pDate.getDate();

  let invoiceYear = pYear;
  let invoiceMonth = pMonth;

  // Se a data da compra for maior ou igual ao dia de fechamento, a fatura desse mês já fechou,
  // portanto a despesa entra na fatura do mês subsequente.
  if (pDay >= closingDay) {
    invoiceMonth += 1;
    if (invoiceMonth > 12) {
      invoiceMonth = 1;
      invoiceYear += 1;
    }
  }

  // Ajusta o dia de vencimento para o limite do mês da fatura (ex: dia 31 em fevereiro vira 28)
  const maxDaysInMonth = new Date(invoiceYear, invoiceMonth, 0).getDate();
  const validDueDay = Math.min(dueDay, maxDaysInMonth);
  const dueDate = `${invoiceYear}-${String(invoiceMonth).padStart(2, '0')}-${String(validDueDay).padStart(2, '0')}`;

  return { year: invoiceYear, month: invoiceMonth, dueDay: validDueDay, dueDate };
}

/**
 * Gera lista de opções de meses de fatura para seleção pelo usuário (de 2 meses atrás até 12 meses à frente).
 */
export function generateInvoicePeriodOptions(
  referenceDate: Date = new Date(),
  dueDay: number = 10
): InvoicePeriodOption[] {
  const options: InvoicePeriodOption[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // De 2 meses atrás até 12 meses à frente
  for (let offset = -2; offset <= 12; offset++) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const maxDays = new Date(y, m, 0).getDate();
    const validDay = Math.min(dueDay, maxDays);
    const dueDate = `${y}-${String(m).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;
    const label = `${MONTH_NAMES_PT[m - 1]} de ${y}`;

    options.push({
      year: y,
      month: m,
      dueDay: validDay,
      dueDate,
      label,
      isCurrentMonth: y === currentYear && m === currentMonth,
      isNextMonth:
        (y === currentYear && m === currentMonth + 1) ||
        (y === currentYear + 1 && currentMonth === 12 && m === 1),
    });
  }

  return options;
}

/**
 * Formata um rótulo amigável para exibição do mês da fatura.
 */
export function formatInvoiceLabel(dueDateStr?: string): string {
  if (!dueDateStr) return 'Fatura Atual';
  const parts = dueDateStr.split('-');
  if (parts.length < 3) return 'Fatura';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (m >= 1 && m <= 12) {
    return `Fatura de ${MONTH_NAMES_PT[m - 1]}/${y} (Venc. ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')})`;
  }
  return `Venc. ${dueDateStr}`;
}

