import { PdfDocumentResult } from '../pdfInvoiceParser';
import {
  BankInvoiceAdapter,
  InvoiceParseResult,
  InvoiceItemType,
  ParsedInvoiceItem,
  InvoiceMetadata,
} from './types';
import { nubankAdapter } from './nubankAdapter';
import { itauAdapter } from './itauAdapter';
import { bradescoAdapter } from './bradescoAdapter';
import { santanderAdapter } from './santanderAdapter';
import { interAdapter } from './interAdapter';
import { c6Adapter } from './c6Adapter';
import { genericInvoiceAdapter } from './genericInvoiceAdapter';

export * from './types';
export * from './adapterUtils';
export {
  nubankAdapter,
  itauAdapter,
  bradescoAdapter,
  santanderAdapter,
  interAdapter,
  c6Adapter,
  genericInvoiceAdapter,
};

// Lista de adaptadores em ordem de prioridade de detecção
export const REGISTERED_ADAPTERS: BankInvoiceAdapter[] = [
  nubankAdapter,
  itauAdapter,
  bradescoAdapter,
  santanderAdapter,
  interAdapter,
  c6Adapter,
  genericInvoiceAdapter, // Fallback universal sempre no final
];

/**
 * Detecta o banco emissor da fatura através do conteúdo textual e metadados.
 */
export function detectInvoiceAdapter(document: PdfDocumentResult): BankInvoiceAdapter {
  for (const adapter of REGISTERED_ADAPTERS) {
    if (adapter.id === 'generic') continue;
    if (adapter.canHandle(document)) {
      return adapter;
    }
  }
  return genericInvoiceAdapter;
}

/**
 * Ponto de entrada central para interpretar faturas PDF:
 * 1. Identifica o emissor do cartão.
 * 2. Encaminha o documento para o adaptador especializado (ou genérico).
 * 3. Retorna os lançamentos classificados (compras, parceladas, pagamentos, estornos e encargos).
 */
export function parseInvoicePdf(document: PdfDocumentResult): InvoiceParseResult {
  const adapter = detectInvoiceAdapter(document);
  return adapter.parse(document);
}

