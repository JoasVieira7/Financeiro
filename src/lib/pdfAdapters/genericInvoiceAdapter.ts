import { PdfDocumentResult } from '../pdfInvoiceParser';
import {
  BankInvoiceAdapter,
  InvoiceParseResult,
  ParsedInvoiceItem,
  InvoiceItemType,
} from './types';
import {
  inferPurchaseDate,
  extractInstallmentInfo,
  classifyLine,
  extractDueDateFromText,
  extractTotalInvoiceAmount,
  extractCardNameFromSection,
  parsePdfMonetaryValue,
} from './adapterUtils';
import { inferCategory } from '../installmentExcelParser';
import { roundToCents } from '../budgetCalculations';

export const genericInvoiceAdapter: BankInvoiceAdapter = {
  id: 'generic',
  name: 'Fatura Genérica',

  canHandle(_document: PdfDocumentResult): boolean {
    return true; // Fallback universal para qualquer fatura
  },

  parse(document: PdfDocumentResult): InvoiceParseResult {
    const fullText = document.fullText;
    const dueDate = extractDueDateFromText(fullText);
    const totalInvoiceAmount = extractTotalInvoiceAmount(fullText);

    const items: ParsedInvoiceItem[] = [];
    const warnings: string[] = [];

    if (!dueDate) {
      warnings.push('Data de vencimento não localizada automaticamente. Verifique antes de confirmar.');
    }

    // Padrões genéricos de linhas de extrato:
    // Padrão A: [Data DD/MM ou DD/MM/AAAA ou DD MMM] [Descrição] [Valor]
    // Suporta valores com sinal no fim (1.235,11-) e indicadores C/CR/D
    const patternA = /^(\d{1,2}(?:[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?|\s+[a-zA-Z]{3,4}))\s+(.+?)\s+([R\$\s]*\(?-?[\d\.,]+(?:\s*[\-\)]|\s*[Cc][Rr]?|\s*[Dd])?)$/;

    // Padrão B: [Descrição com data no meio/início] [Valor no final]
    const patternB = /^(.+?)\s+(\d{1,2}[\/\-\.]\d{1,2})\s+(.+?)\s+([R\$\s]*\(?-?[\d\.,]+(?:\s*[\-\)]|\s*[Cc][Rr]?|\s*[Dd])?)$/;

    let currentCardName = 'Cartão de Crédito';

    for (const line of document.allLines) {
      const trimmed = line.text.trim();
      const detectedCard = extractCardNameFromSection(trimmed, 'Cartão');
      if (detectedCard) {
        currentCardName = detectedCard;
        continue;
      }

      // Ignora linhas que são resumos de totais ou rodapés bancários
      if (
        /^(?:total\s+da\s+fatura|total\s+a\s+pagar|saldo\s+anterior|pagamento\s+minimo|limite\s+de\s+credito|vencimento)/i.test(
          trimmed
        )
      ) {
        continue;
      }

      let rawDate = '';
      let rawDesc = '';
      let rawAmountStr = '';

      const matchA = trimmed.match(patternA);
      if (matchA) {
        rawDate = matchA[1].trim();
        rawDesc = matchA[2].trim();
        rawAmountStr = matchA[3].trim();
      } else {
        const matchB = trimmed.match(patternB);
        if (matchB) {
          rawDate = matchB[2].trim();
          rawDesc = `${matchB[1]} ${matchB[3]}`.trim();
          rawAmountStr = matchB[4].trim();
        }
      }

      if (!rawDate || !rawDesc || !rawAmountStr) continue;

      // Ignora se a descrição for apenas código de barras ou numeração de boleto
      if (/^\d{5}\.\d{5}\s+\d{5}/.test(trimmed)) continue;

      const parsed = parsePdfMonetaryValue(rawAmountStr);
      if (parsed.amount === 0) continue;

      const classification = classifyLine(rawDesc, parsed.amount, parsed.isCredit);
      const absAmount = roundToCents(Math.abs(parsed.amount));

      let itemType: InvoiceItemType = 'one_off';
      let isIgnored = false;

      if (classification === 'payment') {
        itemType = 'payment';
        isIgnored = true;
      } else if (classification === 'refund') {
        itemType = 'refund';
        isIgnored = true;
      } else if (classification === 'fee') {
        itemType = 'fee';
        isIgnored = true;
      } else if (classification === 'other') {
        itemType = 'other';
        isIgnored = true;
      } else {
        const installmentInfo = extractInstallmentInfo(rawDesc);
        if (installmentInfo.isInstallment) {
          itemType = 'installment';
        }
      }

      const installmentInfo = extractInstallmentInfo(rawDesc);
      const purchaseDate = inferPurchaseDate(rawDate, dueDate);

      const itemWarnings: string[] = [];
      const validationErrors: string[] = [];

      if (!purchaseDate) {
        itemWarnings.push('Data da compra não possui ano explícito.');
      }

      const cleanDesc = installmentInfo.isInstallment
        ? installmentInfo.cleanText.replace(/\s*-\s*$/, '').trim()
        : rawDesc;

      items.push({
        id: `generic-item-${line.lineNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: itemType,
        description: cleanDesc || 'Compra Cartão',
        purchaseDate,
        amount: absAmount,
        currentInstallment: installmentInfo.isInstallment ? installmentInfo.currentInstallment : 1,
        totalInstallments: installmentInfo.isInstallment ? installmentInfo.totalInstallments : 1,
        totalAmount: undefined,
        isIntermediateInstallment: installmentInfo.isInstallment && installmentInfo.currentInstallment > 1,
        category: inferCategory(cleanDesc),
        cardName: currentCardName,
        dueDate,
        rawText: line.text,
        lineNumber: line.lineNumber,
        isValid: validationErrors.length === 0,
        validationErrors,
        warnings: itemWarnings,
        isIgnoredFromImport: isIgnored,
      });
    }

    const purchases = items.filter(i => i.type === 'installment' || i.type === 'one_off');
    const payments = items.filter(i => i.type === 'payment');
    const refunds = items.filter(i => i.type === 'refund');
    const fees = items.filter(i => i.type === 'fee');

    const totalPurchasesAmount = roundToCents(
      purchases.reduce((acc, p) => acc + p.amount, 0)
    );

    return {
      metadata: {
        issuer: 'Genérico',
        issuerConfidence: 'low',
        dueDate,
        totalInvoiceAmount,
        currency: 'BRL',
      },
      items,
      purchases,
      payments,
      refunds,
      fees,
      totalPurchasesAmount,
      totalInstallmentsCount: purchases.filter(p => p.type === 'installment').length,
      totalOneOffCount: purchases.filter(p => p.type === 'one_off').length,
      hasWarnings: warnings.length > 0 || items.some(i => i.warnings.length > 0),
      warnings,
    };
  },
};

