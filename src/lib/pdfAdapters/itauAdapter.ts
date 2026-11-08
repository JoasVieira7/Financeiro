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

export const itauAdapter: BankInvoiceAdapter = {
  id: 'itau',
  name: 'Itaú / Credicard',

  canHandle(document: PdfDocumentResult): boolean {
    const text = document.fullText.toLowerCase();
    return (
      text.includes('itau') ||
      text.includes('itaú') ||
      text.includes('credicard') ||
      text.includes('hipercard') ||
      text.includes('itaucard')
    );
  },

  parse(document: PdfDocumentResult): InvoiceParseResult {
    const fullText = document.fullText;
    const dueDate = extractDueDateFromText(fullText);
    const totalInvoiceAmount = extractTotalInvoiceAmount(fullText);

    const items: ParsedInvoiceItem[] = [];
    const warnings: string[] = [];

    if (!dueDate) {
      warnings.push('Data de vencimento da fatura não foi identificada no cabeçalho Itaú.');
    }

    // Padrão Itaú:
    // [DD/MM] [DESCRIÇÃO] [PARC XX/YY] [VALOR]
    // Ex: "10/10 MAGAZINE LUIZA PARC 03/10 149,90"
    // Ex: "12/10 POSTO IPIRANGA 180,00"
    // Suporta valores com sinal no fim (1.235,11-) e indicadores C/CR/D
    const lineRegex = /^(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)\s+(.+?)\s+([R\$\s]*\(?-?[\d\.,]+(?:\s*[\-\)]|\s*[Cc][Rr]?|\s*[Dd])?)$/;

    let currentCardName = 'Cartão Itaú';

    for (const line of document.allLines) {
      const trimmed = line.text.trim();

      // Ignora linhas de cabeçalho, resumo de saldo ou rodapés bancários
      if (
        /^(?:total\s+da\s+fatura|total\s+a\s+pagar|saldo\s+anterior|pagamento\s+minimo|limite\s+de\s+credito|vencimento)/i.test(
          trimmed
        )
      ) {
        continue;
      }

      const detectedCard = extractCardNameFromSection(trimmed, 'Itaú');
      if (detectedCard) {
        currentCardName = detectedCard;
        continue;
      }

      const match = trimmed.match(lineRegex);
      if (!match) continue;

      const rawDate = match[1].trim();
      const rawDescAndParc = match[2].trim();
      const rawAmountStr = match[3].trim();

      const parsed = parsePdfMonetaryValue(rawAmountStr);
      if (parsed.amount === 0) continue;

      const classification = classifyLine(rawDescAndParc, parsed.amount, parsed.isCredit);
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
        const installmentInfo = extractInstallmentInfo(rawDescAndParc);
        if (installmentInfo.isInstallment) {
          itemType = 'installment';
        }
      }

      const installmentInfo = extractInstallmentInfo(rawDescAndParc);
      const purchaseDate = inferPurchaseDate(rawDate, dueDate);

      const itemWarnings: string[] = [];
      const validationErrors: string[] = [];

      if (!purchaseDate) {
        itemWarnings.push('Ano inferido a partir da data de vencimento da fatura.');
      }

      const cleanDesc = installmentInfo.isInstallment
        ? installmentInfo.cleanText.replace(/\s*-\s*$/, '').trim()
        : rawDescAndParc;

      items.push({
        id: `itau-item-${line.lineNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: itemType,
        description: cleanDesc || 'Compra Itaú',
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
        issuer: 'Itaú',
        issuerConfidence: 'high',
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

