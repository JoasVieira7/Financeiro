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

export interface TransactionDisplayInfo {
  title: string;
  subtitle: string;
  isCustomMerchant: boolean;
}

export function getTransactionDisplay(tx: {
  description?: string;
  category: string;
  payment_method?: string;
}): TransactionDisplayInfo {
  const cat = tx.category || 'Outros';
  const desc = (tx.description || '').trim();
  const methodLabel = formatPaymentMethod(tx.payment_method);

  // Detecta se a descrição é vazia, igual à categoria ou formato legado tipo "Categoria (METODO)"
  const isGeneric =
    !desc ||
    desc.toLowerCase() === cat.toLowerCase() ||
    desc.toLowerCase().startsWith(`${cat.toLowerCase()} (`);

  if (isGeneric) {
    return {
      title: cat,
      subtitle: methodLabel,
      isCustomMerchant: false,
    };
  }

  return {
    title: desc,
    subtitle: `${cat} · ${methodLabel}`,
    isCustomMerchant: true,
  };
}

