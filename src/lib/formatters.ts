export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatShortDate(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Agora mesmo';
  }
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `Há ${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `Há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  const days = Math.floor(diffInSeconds / 86400);
  if (days === 1) return 'Ontem';
  if (days < 7) return `Há ${days} dias`;
  return formatShortDate(isoDate);
}

export function formatPaymentMethod(method?: string): string {
  switch (method) {
    case 'pix':
      return 'Pix';
    case 'cartao_credito':
      return 'Crédito';
    case 'cartao_debito':
      return 'Débito';
    case 'dinheiro':
      return 'Dinheiro';
    case 'ted':
      return 'TED';
    default:
      return 'Outros';
  }
}

export function formatDateBR(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Calcula a lista de datas mensais para cada parcela a partir da data inicial.
 * Preserva o dia do mês informado, ajustando para o último dia válido em meses mais curtos.
 */
export function getInstallmentDates(startDate: Date, totalInstallments: number): Date[] {
  const dates: Date[] = [];
  const baseDay = startDate.getDate();
  const baseHours = startDate.getHours();
  const baseMinutes = startDate.getMinutes();
  const baseSeconds = startDate.getSeconds();

  for (let i = 0; i < totalInstallments; i++) {
    const d = new Date(startDate);
    // Move para o dia 1 do mês de destino para evitar overflow automático
    d.setMonth(startDate.getMonth() + i, 1);
    const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(baseDay, daysInTargetMonth);
    d.setDate(targetDay);
    d.setHours(baseHours, baseMinutes, baseSeconds, 0);
    dates.push(d);
  }

  return dates;
}

/**
 * Divide o valor total pelo número de parcelas garantindo que a soma
 * de todas as parcelas seja exatamente igual ao total (distribuição precisa de centavos).
 */
export function calculateInstallmentAmounts(totalAmount: number, totalInstallments: number): number[] {
  if (totalInstallments <= 0) return [totalAmount];
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / totalInstallments);
  const remainderCents = totalCents - (baseCents * totalInstallments);

  const amounts: number[] = [];
  for (let i = 0; i < totalInstallments; i++) {
    // Adiciona o resto de centavos na primeira parcela
    const cents = i === 0 ? baseCents + remainderCents : baseCents;
    amounts.push(cents / 100);
  }
  return amounts;
}

export interface TransactionDisplayInfo {
  title: string;
  subtitle: string;
  isCustomMerchant: boolean;
  installmentBadge?: string; // Ex: "1/6"
}

export function getTransactionDisplay(tx: {
  description?: string;
  category: string;
  payment_method?: string;
  installment_number?: number;
  installment_total?: number;
}): TransactionDisplayInfo {
  const cat = tx.category || 'Outros';
  const desc = (tx.description || '').trim();
  const methodLabel = formatPaymentMethod(tx.payment_method);
  const installmentBadge =
    tx.installment_number && tx.installment_total
      ? `${tx.installment_number}/${tx.installment_total}`
      : undefined;

  // Detecta se a descrição é vazia, igual à categoria ou formato legado tipo "Categoria (METODO)"
  const isGeneric =
    !desc ||
    desc.toLowerCase() === cat.toLowerCase() ||
    desc.toLowerCase().startsWith(`${cat.toLowerCase()} (`);

  const installmentSuffix = installmentBadge ? ` · ${installmentBadge}` : '';

  if (isGeneric) {
    return {
      title: cat,
      subtitle: `${methodLabel}${installmentSuffix}`,
      isCustomMerchant: false,
      installmentBadge,
    };
  }

  return {
    title: desc,
    subtitle: `${cat} · ${methodLabel}${installmentSuffix}`,
    isCustomMerchant: true,
    installmentBadge,
  };
}

