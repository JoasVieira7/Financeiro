import { PdfDocumentResult } from '../pdfInvoiceParser';

export type InvoiceItemType =
  | 'installment' // Compra parcelada
  | 'one_off'     // Compra à vista
  | 'payment'     // Pagamento de fatura efetuado
  | 'refund'      // Estorno ou reembolso
  | 'fee'         // Encargos, juros, IOF, anuidade
  | 'other';      // Outros lançamentos informativos

export interface ParsedInvoiceItem {
  id: string;
  type: InvoiceItemType;
  description: string;
  purchaseDate: string | null; // Formato ISO YYYY-MM-DD
  amount: number; // Valor da transação / parcela na fatura (positivo e arredondado em centavos)
  currentInstallment: number; // 1 para à vista, N para parcelada
  totalInstallments: number; // 1 para à vista, M para parcelada
  totalAmount?: number; // Valor total original contratado (quando informado expressamente)
  isIntermediateInstallment: boolean; // true se currentInstallment > 1
  category?: string;
  cardName: string;
  dueDate: string | null; // Data de vencimento da fatura (YYYY-MM-DD)
  rawText: string;
  lineNumber?: number;
  isValid: boolean;
  validationErrors: string[];
  warnings: string[];
  isIgnoredFromImport: boolean; // true para pagamentos, estornos e encargos
}

export interface InvoiceMetadata {
  issuer: string; // 'Nubank' | 'Itaú' | 'Bradesco' | 'Santander' | 'Inter' | 'C6 Bank' | 'Genérico'
  issuerConfidence: 'high' | 'medium' | 'low';
  accountHolder?: string;
  cardLastFourDigits?: string;
  dueDate: string | null; // YYYY-MM-DD
  closingDate?: string | null; // YYYY-MM-DD
  totalInvoiceAmount?: number;
  minimumPayment?: number;
  currency: string;
}

export interface InvoiceParseResult {
  metadata: InvoiceMetadata;
  items: ParsedInvoiceItem[];
  purchases: ParsedInvoiceItem[]; // Apenas compras (type === 'installment' ou 'one_off')
  payments: ParsedInvoiceItem[];  // Pagamentos (type === 'payment')
  refunds: ParsedInvoiceItem[];   // Estornos (type === 'refund')
  fees: ParsedInvoiceItem[];      // Encargos (type === 'fee')
  totalPurchasesAmount: number;   // Soma dos lançamentos de compras nesta fatura
  totalInstallmentsCount: number; // Quantidade de compras parceladas
  totalOneOffCount: number;       // Quantidade de compras à vista
  hasWarnings: boolean;
  warnings: string[];
}

export interface EditablePdfItem extends ParsedInvoiceItem {
  isSelected: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  isPastDueDate: boolean;
}

export interface BankInvoiceAdapter {
  id: string;
  name: string;
  canHandle(document: PdfDocumentResult): boolean;
  parse(document: PdfDocumentResult): InvoiceParseResult;
}

