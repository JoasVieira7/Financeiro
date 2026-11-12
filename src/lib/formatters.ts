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
  statusBadge?: { label: string; bg: string; text: string; border: string };
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function getTransactionDueDate(tx: {
  due_date?: string;
  created_at: string;
}): Date {
  if (tx.due_date) {
    const d = new Date(`${tx.due_date}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(tx.created_at);
}

export function isTransactionPaid(tx: {
  status?: string;
  paid_at?: string | null;
  installment_group_id?: string;
  created_at: string;
}): boolean {
  if (tx.status === 'paid') return true;
  if (tx.status === 'pending' || tx.status === 'overdue' || tx.status === 'unknown') return false;
  if (tx.paid_at) return true;
  // Se for legado sem status explícito:
  if (!tx.installment_group_id) return true; // compras à vista antigas sempre pagas
  return new Date(tx.created_at) <= new Date(); // parcelas antigas com data passada
}

export function getTransactionStatus(tx: {
  status?: string;
  due_date?: string;
  paid_at?: string | null;
  installment_group_id?: string;
  created_at: string;
}): 'paid' | 'pending' | 'overdue' | 'unknown' {
  if (tx.status === 'paid' || tx.paid_at) return 'paid';
  if (tx.status === 'unknown') return 'unknown';
  const dueDate = getTransactionDueDate(tx);
  const now = new Date();
  // Se ainda não venceu (ou é hoje):
  if (dueDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    return 'pending';
  }
  // Se venceu e não está paga:
  return 'overdue';
}

export function getStatusBadge(status: 'paid' | 'pending' | 'overdue' | 'unknown') {
  switch (status) {
    case 'paid':
      return {
        label: 'Paga',
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200/80',
      };
    case 'overdue':
      return {
        label: 'Vencida',
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200/80',
      };
    case 'unknown':
      return {
        label: 'A revisar',
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-200/80',
      };
    case 'pending':
    default:
      return {
        label: 'Pendente',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200/80',
      };
  }
}

export function getTransactionDisplay(tx: {
  description?: string;
  category: string;
  payment_method?: string;
  installment_number?: number;
  installment_total?: number;
  status?: string;
  due_date?: string;
  paid_at?: string | null;
  installment_group_id?: string;
  created_at?: string;
}): TransactionDisplayInfo {
  const cat = tx.category || 'Outros';
  const desc = (tx.description || '').trim();
  const methodLabel = formatPaymentMethod(tx.payment_method);
  const installmentBadge =
    tx.installment_number && tx.installment_total
      ? `${tx.installment_number}/${tx.installment_total}`
      : undefined;

  let statusBadge: TransactionDisplayInfo['statusBadge'];
  if (tx.installment_group_id) {
    const computedStatus = getTransactionStatus({
      status: tx.status,
      due_date: tx.due_date,
      paid_at: tx.paid_at,
      installment_group_id: tx.installment_group_id,
      created_at: tx.created_at || new Date().toISOString(),
    });
    statusBadge = getStatusBadge(computedStatus);
  }

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
      statusBadge,
    };
  }

  return {
    title: desc,
    subtitle: `${cat} · ${methodLabel}${installmentSuffix}`,
    isCustomMerchant: true,
    installmentBadge,
    statusBadge,
  };
}

