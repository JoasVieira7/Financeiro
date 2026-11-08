import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  FileText,
  UploadCloud,
  Check,
  AlertTriangle,
  AlertCircle,
  Calendar,
  CreditCard,
  Layers,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  Filter,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ShieldCheck,
  Tag,
  Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR } from '../../lib/formatters';
import {
  parseInstallmentFile,
  ParseResult,
  ParsedInstallmentPurchase,
} from '../../lib/installmentExcelParser';
import { extractTextFromPdf, PdfDocumentResult } from '../../lib/pdfInvoiceParser';
import {
  parseInvoicePdf,
  InvoiceParseResult,
  ParsedInvoiceItem,
  InvoiceMetadata,
  InvoiceItemType,
} from '../../lib/pdfAdapters';
import { roundToCents } from '../../lib/budgetCalculations';
import { TransactionCategory } from '../../types';

interface ImportSpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export interface EditablePdfItem extends ParsedInvoiceItem {
  isSelected: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  isPastDueDate: boolean;
}

export interface EditablePdfParseResult {
  fileName: string;
  fileSize?: number;
  metadata: InvoiceMetadata;
  items: EditablePdfItem[];
  rawFullText?: string;
  isScannedWithoutText?: boolean;
  parseError?: string;
}

export const ImportSpreadsheetModal: React.FC<ImportSpreadsheetModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const {
    transactions,
    futureCommitments,
    importInstallmentPurchases,
    importPdfInvoicePurchases,
  } = useFinance();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processando arquivo...');

  // Tipo de arquivo atualmente sob análise
  const [activeFormat, setActiveFormat] = useState<'excel' | 'pdf' | null>(null);

  // Estados específicos para Excel / CSV
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'duplicates' | 'pastDue' | 'invalid'>('all');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{
    success: boolean;
    message: string;
    importedCount?: number;
    totalInstallments?: number;
  } | null>(null);

  // Estados específicos para PDF
  const [pdfResult, setPdfResult] = useState<EditablePdfParseResult | null>(null);
  const [pdfFilterMode, setPdfFilterMode] = useState<
    'all_purchases' | 'installments' | 'one_off' | 'payments' | 'refunds' | 'fees' | 'duplicates' | 'needs_review'
  >('all_purchases');
  const [isConfirmingPdf, setIsConfirmingPdf] = useState(false);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [pdfImportFeedback, setPdfImportFeedback] = useState<{
    success: boolean;
    message: string;
    importedCount?: number;
    totalTransactions?: number;
    ignoredCount?: number;
  } | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [pdfPasswordError, setPdfPasswordError] = useState<string | null>(null);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [showPasswordText, setShowPasswordText] = useState(false);

  // Mês e Ano de Referência da Fatura (Etapa 33)
  const [referenceYear, setReferenceYear] = useState<number>(() => new Date().getFullYear());
  const [referenceMonth, setReferenceMonth] = useState<number>(() => new Date().getMonth() + 1); // 1 a 12
  const [referenceDueDay, setReferenceDueDay] = useState<number>(10);
  const [isReferenceManuallyEdited, setIsReferenceManuallyEdited] = useState<boolean>(false);

  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  if (!isOpen) return null;

  // Atualização manual do período e vencimento base da fatura
  const handleUpdateReferencePeriod = (newYear: number, newMonth: number, newDay: number) => {
    setIsReferenceManuallyEdited(true);
    setReferenceYear(newYear);
    setReferenceMonth(newMonth);
    setReferenceDueDay(newDay);

    const daysInMonth = new Date(newYear, newMonth, 0).getDate();
    const validDay = Math.min(newDay, daysInMonth);
    const newDueDate = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;

    if (pdfResult) {
      setPdfResult(prev => {
        if (!prev) return null;
        const updatedItems = prev.items.map(item => ({
          ...item,
          dueDate: newDueDate,
          isPastDueDate: Boolean(newDueDate < new Date().toISOString().split('T')[0]),
        }));
        return {
          ...prev,
          metadata: {
            ...prev.metadata,
            dueDate: newDueDate,
          },
          items: updatedItems,
        };
      });
    }

    if (parseResult) {
      setParseResult(prev => {
        if (!prev) return null;
        const updatedPurchases = prev.purchases.map(p => ({
          ...p,
          dueDate: newDueDate,
          isPastDueDate: Boolean(newDueDate < new Date().toISOString().split('T')[0]),
        }));
        return {
          ...prev,
          purchases: updatedPurchases,
        };
      });
    }
  };

  // Reseta todos os estados para carregar outro arquivo
  const handleReset = () => {
    setActiveFormat(null);
    setParseResult(null);
    setPdfResult(null);
    setImportFeedback(null);
    setPdfImportFeedback(null);
    setIsConfirming(false);
    setIsConfirmingPdf(false);
    setIsImportingPdf(false);
    setIsPasswordModalOpen(false);
    setPdfPassword('');
    setPdfPasswordError(null);
    setPendingPdfFile(null);
    setIsReferenceManuallyEdited(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -------------------------------------------------------------
  // ROTEAMENTO PRINCIPAL DE ARQUIVOS (PDF vs EXCEL / CSV)
  // -------------------------------------------------------------
  const handleFileProcess = async (file: File) => {
    setIsLoading(true);
    setParseResult(null);
    setPdfResult(null);
    setImportFeedback(null);
    setPdfImportFeedback(null);
    setIsConfirming(false);
    setIsConfirmingPdf(false);
    setIsImportingPdf(false);
    setPdfPasswordError(null);
    setIsPasswordModalOpen(false);

    const isPdf =
      file.name.toLowerCase().endsWith('.pdf') ||
      file.type === 'application/pdf';

    if (isPdf) {
      setActiveFormat('pdf');
      setLoadingMessage('Extraindo camadas de texto da fatura PDF...');
      await processPdfInvoiceFile(file);
    } else {
      setActiveFormat('excel');
      setLoadingMessage('Lendo dados da planilha Excel/CSV...');
      processExcelSpreadsheet(file);
    }
  };

  // -------------------------------------------------------------
  // MOTOR DE PROCESSAMENTO DE PDF
  // -------------------------------------------------------------
  const processPdfInvoiceFile = async (file: File, password?: string) => {
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const pdfDoc = await extractTextFromPdf(buffer, { password });

      // 1. PDF protegido por senha
      if (pdfDoc.requiresPassword) {
        setPendingPdfFile(file);
        setIsPasswordModalOpen(true);
        if (password) {
          setPdfPasswordError('Senha incorreta para este documento PDF. Verifique e tente novamente.');
        }
        setIsLoading(false);
        return;
      }

      // 2. PDF digitalizado / escaneado sem camada textual
      if (!pdfDoc.metadata || pdfDoc.allLines.length === 0 || pdfDoc.hasTextLayer === false) {
        setPdfResult({
          fileName: file.name,
          metadata: {
            issuer: 'Não identificado',
            issuerConfidence: 'low',
            dueDate: null,
            currency: 'BRL',
          },
          items: [],
          isScannedWithoutText: true,
          parseError:
            'Este documento PDF parece ser uma imagem ou arquivo digitalizado sem camada textual reconhecível. O reconhecimento via OCR ainda não está disponível no navegador. Por favor, utilize a fatura digital original exportada do aplicativo do banco ou uma planilha Excel/CSV.',
        });
        setIsLoading(false);
        return;
      }

      // 3. Erro de leitura do PDF
      if (pdfDoc.error) {
        setPdfResult({
          fileName: file.name,
          metadata: {
            issuer: 'Não identificado',
            issuerConfidence: 'low',
            dueDate: null,
            currency: 'BRL',
          },
          items: [],
          parseError: pdfDoc.error,
        });
        setIsLoading(false);
        return;
      }

      // 4. Extração bem sucedida: aplicar adaptadores bancários da Etapa 24
      const parsedInvoice = parseInvoicePdf(pdfDoc);
      const todayStr = new Date().toISOString().split('T')[0];

      // Determina o mês de referência inicial da fatura (Etapa 33)
      let initYear = new Date().getFullYear();
      let initMonth = new Date().getMonth() + 1;
      let initDay = 10;

      if (parsedInvoice.metadata.dueDate) {
        const match = parsedInvoice.metadata.dueDate.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
        if (match) {
          initYear = parseInt(match[1], 10);
          initMonth = parseInt(match[2], 10);
          if (match[3]) initDay = parseInt(match[3], 10);
        }
      } else {
        // Tenta derivar a partir da compra mais recente encontrada no documento
        const purchaseDates = parsedInvoice.items
          .map(i => i.purchaseDate)
          .filter((d): d is string => Boolean(d))
          .sort();
        if (purchaseDates.length > 0) {
          const latest = purchaseDates[purchaseDates.length - 1];
          const match = latest.match(/^(\d{4})-(\d{2})/);
          if (match) {
            initYear = parseInt(match[1], 10);
            initMonth = parseInt(match[2], 10);
          }
        }
      }

      const daysInInitMonth = new Date(initYear, initMonth, 0).getDate();
      initDay = Math.min(initDay, daysInInitMonth);
      const formattedInitialDueDate = `${initYear}-${String(initMonth).padStart(2, '0')}-${String(initDay).padStart(2, '0')}`;
      parsedInvoice.metadata.dueDate = formattedInitialDueDate;

      setReferenceYear(initYear);
      setReferenceMonth(initMonth);
      setReferenceDueDay(initDay);
      setIsReferenceManuallyEdited(false);

      // Mapear transações para itens editáveis com identificação de duplicidades
      const editableItems: EditablePdfItem[] = parsedInvoice.items.map((item, idx) => {
        // Se o item não tiver dueDate individual, herda o vencimento da fatura
        const itemDueDate = item.dueDate || formattedInitialDueDate;
        // Checar duplicata contra transações existentes no histórico
        const isDuplicateInTransactions = transactions.some(t => {
          const descMatch =
            t.description.toLowerCase().trim() === item.description.toLowerCase().trim();
          const amountMatch =
            Math.abs(t.amount - item.amount) < 0.05 ||
            (t.installment_purchase_amount &&
              Math.abs(t.installment_purchase_amount - (item.totalAmount || item.amount)) < 0.05);
          return descMatch && amountMatch;
        });

        // Checar duplicata contra compromissos futuros cadastrados
        const isDuplicateInCommitments = futureCommitments.activeGroups.some(g => {
          const descMatch =
            g.description.toLowerCase().trim() === item.description.toLowerCase().trim();
          const instMatch = g.totalInstallments === item.totalInstallments;
          return descMatch && (instMatch || Math.abs(g.installmentAmount - item.amount) < 0.05);
        });

        // Checar duplicata interna no próprio PDF
        const isDuplicateInFile = parsedInvoice.items.some(
          (other, oIdx) =>
            oIdx < idx &&
            other.description.toLowerCase().trim() === item.description.toLowerCase().trim() &&
            Math.abs(other.amount - item.amount) < 0.01 &&
            other.currentInstallment === item.currentInstallment &&
            other.totalInstallments === item.totalInstallments &&
            other.purchaseDate === item.purchaseDate
        );

        const isDuplicate =
          isDuplicateInTransactions || isDuplicateInCommitments || isDuplicateInFile;

        const duplicateReason = isDuplicateInTransactions
          ? 'Transação similar já existente no seu histórico'
          : isDuplicateInCommitments
          ? 'Compra parcelada similar já cadastrada nos compromissos'
          : isDuplicateInFile
          ? 'Lançamento repetido na mesma fatura'
          : undefined;

        const isPastDueDate = Boolean(itemDueDate && itemDueDate < todayStr);

        // Regra da Etapa 25:
        // Compras com informações financeiras essenciais ausentes ou inválidas não devem ser selecionadas automaticamente.
        // Não classificar pagamentos ou estornos como compras.
        const isNonPurchase =
          item.type === 'payment' ||
          item.type === 'refund' ||
          item.type === 'fee' ||
          item.type === 'other';

        const isSelected = !isNonPurchase && item.isValid && !isDuplicate;

        return {
          ...item,
          dueDate: itemDueDate,
          isSelected,
          isDuplicate,
          duplicateReason,
          isPastDueDate,
        };
      });

      setPdfResult({
        fileName: file.name,
        fileSize: file.size,
        metadata: parsedInvoice.metadata,
        items: editableItems,
        rawFullText: pdfDoc.fullText,
      });

      setIsPasswordModalOpen(false);
      setPdfPassword('');
      setPdfPasswordError(null);
    } catch (err: any) {
      setPdfResult({
        fileName: file.name,
        metadata: {
          issuer: 'Desconhecido',
          issuerConfidence: 'low',
          dueDate: null,
          currency: 'BRL',
        },
        items: [],
        parseError: `Falha ao processar a fatura PDF: ${err.message || 'formato ilegível'}.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Submissão da senha do PDF
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPdfFile || !pdfPassword.trim()) return;
    processPdfInvoiceFile(pendingPdfFile, pdfPassword.trim());
  };

  // Edição inline de item da fatura PDF
  const updatePdfItem = (id: string, field: keyof EditablePdfItem, value: any) => {
    if (!pdfResult) return;
    setPdfResult(prev => {
      if (!prev) return null;
      const updatedItems = prev.items.map(item => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        if (field === 'amount') {
          updated.amount = Math.max(0, parseFloat(value) || 0);
        }
        if (field === 'totalAmount') {
          updated.totalAmount =
            value === '' || value === undefined ? undefined : parseFloat(value) || 0;
        }
        if (field === 'currentInstallment' || field === 'totalInstallments') {
          const cur = Math.max(1, parseInt(String(updated.currentInstallment), 10) || 1);
          const tot = Math.max(1, parseInt(String(updated.totalInstallments), 10) || 1);
          updated.currentInstallment = cur;
          updated.totalInstallments = tot;
          updated.isIntermediateInstallment = cur > 1;
          if (tot > 1) {
            updated.type = 'installment';
          } else if (updated.type === 'installment') {
            updated.type = 'one_off';
          }
        }
        if (field === 'dueDate') {
          const todayStr = new Date().toISOString().split('T')[0];
          updated.isPastDueDate = Boolean(updated.dueDate && updated.dueDate < todayStr);
        }

        // Reavaliar validação
        const errors: string[] = [];
        if (!updated.description.trim()) errors.push('Descrição não informada');
        if (updated.amount <= 0) errors.push('Valor deve ser maior que zero');
        if (updated.currentInstallment > updated.totalInstallments) {
          errors.push('Parcela atual maior que total');
        }
        if (!updated.dueDate) errors.push('Vencimento ausente');

        updated.validationErrors = errors;
        updated.isValid = errors.length === 0;

        // Se ficou inválido, desmarca automaticamente
        if (!updated.isValid) {
          updated.isSelected = false;
        }

        return updated;
      });

      return {
        ...prev,
        items: updatedItems,
      };
    });
  };

  const togglePdfSelect = (id: string) => {
    if (!pdfResult) return;
    setPdfResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map(item => {
          if (item.id !== id) return item;
          // Não permitir selecionar itens não-compra ou incompletos
          if (item.isIgnoredFromImport || !item.isValid) return item;
          return { ...item, isSelected: !item.isSelected };
        }),
      };
    });
  };

  const selectAllValidPdf = () => {
    if (!pdfResult) return;
    setPdfResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map(item => {
          const isPurchase = item.type === 'installment' || item.type === 'one_off';
          if (isPurchase && item.isValid && !item.isDuplicate) {
            return { ...item, isSelected: true };
          }
          return item;
        }),
      };
    });
  };

  const deselectAllPdf = () => {
    if (!pdfResult) return;
    setPdfResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map(item => ({ ...item, isSelected: false })),
      };
    });
  };

  // -------------------------------------------------------------
  // MOTOR DE PROCESSAMENTO DE PLANILHAS EXCEL / CSV (PRESERVADO)
  // -------------------------------------------------------------
  const processExcelSpreadsheet = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const result = parseInstallmentFile(buffer, file.name, transactions);
        // Inicializa o mês de referência a partir das compras da planilha
        if (result.purchases.length > 0) {
          const firstDue = result.purchases.find(p => p.dueDate)?.dueDate;
          if (firstDue) {
            const match = firstDue.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
            if (match) {
              setReferenceYear(parseInt(match[1], 10));
              setReferenceMonth(parseInt(match[2], 10));
              if (match[3]) setReferenceDueDay(parseInt(match[3], 10));
            }
          }
        }
        setIsReferenceManuallyEdited(false);
        setParseResult(result);
      } catch (err: any) {
        setParseResult({
          fileName: file.name,
          sheetName: '',
          availableSheets: [],
          totalRowsFound: 0,
          validCount: 0,
          invalidCount: 0,
          duplicateCount: 0,
          pastDueCount: 0,
          totalPurchasesAmount: 0,
          totalPendingAmount: 0,
          identifiedCards: [],
          purchases: [],
          parseError: `Falha ao processar arquivo: ${err.message || 'formato ilegível'}.`,
        });
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      setIsLoading(false);
      setParseResult({
        fileName: file.name,
        sheetName: '',
        availableSheets: [],
        totalRowsFound: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        pastDueCount: 0,
        totalPurchasesAmount: 0,
        totalPendingAmount: 0,
        identifiedCards: [],
        purchases: [],
        parseError: 'Erro ao ler arquivo do dispositivo.',
      });
    };

    reader.readAsArrayBuffer(file);
  };

  const toggleSelect = (id: string) => {
    if (!parseResult) return;
    setParseResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        purchases: prev.purchases.map(p =>
          p.id === id ? { ...p, isSelected: !p.isSelected } : p
        ),
      };
    });
  };

  const selectAllValid = () => {
    if (!parseResult) return;
    setParseResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        purchases: prev.purchases.map(p => ({
          ...p,
          isSelected: p.isValid,
        })),
      };
    });
  };

  const deselectAll = () => {
    if (!parseResult) return;
    setParseResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        purchases: prev.purchases.map(p => ({
          ...p,
          isSelected: false,
        })),
      };
    });
  };

  const updatePurchaseRow = (
    id: string,
    field: keyof ParsedInstallmentPurchase,
    value: any
  ) => {
    if (!parseResult) return;
    setParseResult(prev => {
      if (!prev) return null;
      const updatedPurchases = prev.purchases.map(p => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: value };

        if (
          field === 'totalAmount' ||
          field === 'totalInstallments' ||
          field === 'currentInstallment'
        ) {
          const tot = Number(updated.totalAmount) || 0;
          const tInst = Math.max(1, parseInt(String(updated.totalInstallments), 10) || 1);
          const curInst = Math.max(1, parseInt(String(updated.currentInstallment), 10) || 1);
          updated.pendingInstallmentsCount = Math.max(0, tInst - curInst + 1);
          updated.installmentAmount = tInst > 0 ? Math.round((tot / tInst) * 100) / 100 : 0;
        }

        const expTot =
          Math.round(updated.installmentAmount * updated.totalInstallments * 100) / 100;
        const diff = Math.abs(updated.totalAmount - expTot);
        updated.hasDivergence =
          updated.installmentAmount > 0 &&
          updated.totalInstallments > 0 &&
          updated.totalAmount > 0 &&
          diff > 0.05 * updated.totalInstallments;
        updated.divergenceWarning = updated.hasDivergence
          ? `Divergência detectada: ${updated.totalInstallments}x de R$ ${updated.installmentAmount.toFixed(
              2
            )} = R$ ${expTot.toFixed(2)}, diferente do total informado (R$ ${updated.totalAmount.toFixed(
              2
            )}).`
          : undefined;

        const errors: string[] = [];
        if (!updated.description.trim()) errors.push('Descrição não informada');
        if (updated.totalAmount <= 0) errors.push('Valor total inválido');
        if (updated.currentInstallment > updated.totalInstallments) {
          errors.push('Parcela atual maior que total');
        }
        if (!updated.dueDate) errors.push('Vencimento inválido');

        updated.validationErrors = errors;
        updated.isValid = errors.length === 0;
        updated.isPastDueDate = Boolean(
          updated.dueDate && updated.dueDate < new Date().toISOString().split('T')[0]
        );

        return updated;
      });

      const valid = updatedPurchases.filter(p => p.isValid);
      return {
        ...prev,
        purchases: updatedPurchases,
        validCount: valid.length,
        invalidCount: updatedPurchases.filter(p => !p.isValid).length,
        totalPurchasesAmount:
          Math.round(valid.reduce((acc, p) => acc + p.totalAmount, 0) * 100) / 100,
        totalPendingAmount:
          Math.round(
            valid.reduce(
              (acc, p) =>
                acc + Math.round(p.installmentAmount * p.pendingInstallmentsCount * 100) / 100,
              0
            ) * 100
          ) / 100,
      };
    });
  };

  const handleExecuteImport = async () => {
    if (!parseResult) return;
    const selectedPurchases = parseResult.purchases.filter(p => p.isSelected && p.isValid);
    if (selectedPurchases.length === 0) return;

    setIsImporting(true);
    setImportFeedback(null);

    const res = await importInstallmentPurchases(selectedPurchases);
    setIsImporting(false);

    if (res.success) {
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00D26A', '#34D399', '#10B981'],
      });
      setImportFeedback({
        success: true,
        message: `${res.importedCount} compras parceladas (${res.totalInstallmentsCount} parcelas pendentes) foram importadas com sucesso!`,
        importedCount: res.importedCount,
        totalInstallments: res.totalInstallmentsCount,
      });
      if (onSuccess) onSuccess();
    } else {
      setImportFeedback({
        success: false,
        message: res.error || 'Erro ao importar compras parceladas.',
      });
    }
  };

  // Executa a importação das compras selecionadas da fatura PDF
  const handleExecutePdfImport = async () => {
    if (!pdfResult) return;
    const selectedPurchases = pdfResult.items.filter(
      p => p.isSelected && p.isValid && (p.type === 'one_off' || p.type === 'installment')
    );
    if (selectedPurchases.length === 0) return;

    setIsImportingPdf(true);
    setPdfImportFeedback(null);

    const res = await importPdfInvoicePurchases(pdfResult.items, pdfResult.metadata);
    setIsImportingPdf(false);

    if (res.success) {
      if (res.alreadyProcessed) {
        setPdfImportFeedback({
          success: true,
          message: `Esta fatura já havia sido importada anteriormente (${res.totalTransactionsCreated} lançamentos preservados). Operação idempotente: nenhum registro duplicado foi gerado.`,
          importedCount: res.importedPurchasesCount,
          totalTransactions: res.totalTransactionsCreated,
          ignoredCount: res.ignoredCount,
        });
      } else {
        confetti({
          particleCount: 55,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#00D26A', '#34D399', '#10B981'],
        });
        setPdfImportFeedback({
          success: true,
          message: `${res.importedPurchasesCount} compras importadas com sucesso (${res.totalTransactionsCreated} lançamentos/parcelas criadas)! ${res.ignoredCount} lançamentos não-compra foram desconsiderados e os compromissos futuros foram atualizados.`,
          importedCount: res.importedPurchasesCount,
          totalTransactions: res.totalTransactionsCreated,
          ignoredCount: res.ignoredCount,
        });
      }
      if (onSuccess) onSuccess();
    } else {
      setPdfImportFeedback({
        success: false,
        message: res.error || 'Erro ao gravar compras da fatura PDF.',
      });
    }
  };

  // Drag and Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  // -------------------------------------------------------------
  // CÁLCULOS E FILTRAGENS PARA EXIBIÇÃO
  // -------------------------------------------------------------

  // Excel
  const displayedPurchases = (parseResult?.purchases || []).filter(p => {
    if (filterMode === 'valid') return p.isValid;
    if (filterMode === 'duplicates') return p.isDuplicate;
    if (filterMode === 'pastDue') return p.isPastDueDate;
    if (filterMode === 'invalid') return !p.isValid;
    return true;
  });

  const selectedCount = (parseResult?.purchases || []).filter(p => p.isSelected && p.isValid).length;
  const selectedPendingSum = (parseResult?.purchases || [])
    .filter(p => p.isSelected && p.isValid)
    .reduce((acc, p) => acc + p.installmentAmount * p.pendingInstallmentsCount, 0);

  const selectedPastDueCount = (parseResult?.purchases || []).filter(
    p => p.isSelected && p.isValid && p.isPastDueDate
  ).length;

  // PDF
  const pdfItems = pdfResult?.items || [];
  const pdfOneOffCount = pdfItems.filter(i => i.type === 'one_off').length;
  const pdfInstallmentCount = pdfItems.filter(i => i.type === 'installment').length;
  const pdfPaymentsCount = pdfItems.filter(i => i.type === 'payment').length;
  const pdfRefundsCount = pdfItems.filter(i => i.type === 'refund').length;
  const pdfFeesCount = pdfItems.filter(i => i.type === 'fee').length;
  const pdfDuplicatesCount = pdfItems.filter(i => i.isDuplicate).length;
  const pdfNeedsReviewCount = pdfItems.filter(
    i =>
      (i.type === 'installment' || i.type === 'one_off') &&
      (!i.isValid || i.warnings.length > 0 || i.isDuplicate)
  ).length;

  // Soma estrita apenas das compras selecionadas (NÃO inclui pagamentos nem estornos)
  const pdfSelectedPurchases = pdfItems.filter(
    i => (i.type === 'installment' || i.type === 'one_off') && i.isSelected && i.isValid
  );
  const pdfSelectedCount = pdfSelectedPurchases.length;
  const pdfSelectedTotalAmount = roundToCents(
    pdfSelectedPurchases.reduce((acc, i) => acc + i.amount, 0)
  );
  const pdfSelectedOneOffCount = pdfSelectedPurchases.filter(i => i.type === 'one_off').length;
  const pdfSelectedInstallmentCount = pdfSelectedPurchases.filter(i => i.type === 'installment').length;
  const pdfSelectedPastDueCount = pdfSelectedPurchases.filter(i => i.isPastDueDate).length;
  const pdfSelectedDuplicatesCount = pdfSelectedPurchases.filter(i => i.isDuplicate).length;

  const displayedPdfItems = pdfItems.filter(item => {
    if (pdfFilterMode === 'all_purchases') {
      return item.type === 'installment' || item.type === 'one_off';
    }
    if (pdfFilterMode === 'installments') return item.type === 'installment';
    if (pdfFilterMode === 'one_off') return item.type === 'one_off';
    if (pdfFilterMode === 'payments') return item.type === 'payment';
    if (pdfFilterMode === 'refunds') return item.type === 'refund';
    if (pdfFilterMode === 'fees') return item.type === 'fee';
    if (pdfFilterMode === 'duplicates') return item.isDuplicate;
    if (pdfFilterMode === 'needs_review') {
      return (
        (item.type === 'installment' || item.type === 'one_off') &&
        (!item.isValid || item.warnings.length > 0 || item.isDuplicate)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl bg-white rounded-3xl p-4 sm:p-6 shadow-2xl animate-scale-in max-h-[92vh] flex flex-col">
        {/* Header Unificado */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#00D26A] flex items-center justify-center font-bold shrink-0">
              {activeFormat === 'pdf' ? (
                <FileText className="w-5 h-5 stroke-[2.5]" />
              ) : (
                <FileSpreadsheet className="w-5 h-5 stroke-[2.5]" />
              )}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Importação Inteligente</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  PDF • Excel • CSV
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Processamento local de faturas de cartão de crédito e planilhas financeiras
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
          {/* 1. Modal / Prompt de Senha para PDF Protegido */}
          {isPasswordModalOpen && (
            <div className="p-5 sm:p-6 rounded-3xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-3 animate-scale-in">
              <div className="flex items-center gap-2.5 font-bold text-sm text-amber-900">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">
                    Fatura PDF Protegida por Senha
                  </h4>
                  <p className="text-[11px] text-slate-500 font-normal">
                    Arquivo: <strong>{pendingPdfFile?.name}</strong>
                  </p>
                </div>
              </div>

              <p className="text-slate-600 text-xs leading-relaxed">
                Este arquivo PDF está criptografado pelo banco emissor. Digite a senha para decodificar
                (geralmente os primeiros dígitos do seu CPF ou a data de nascimento do titular). O
                processamento ocorre <strong>100% no seu navegador</strong> e a senha não é armazenada.
              </p>

              {pdfPasswordError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{pdfPasswordError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-3 pt-1">
                <div className="relative max-w-sm">
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={pdfPassword}
                    onChange={e => setPdfPassword(e.target.value)}
                    placeholder="Digite a senha do PDF"
                    autoFocus
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 text-slate-900 text-xs font-medium focus:outline-none focus:border-[#00D26A] focus:ring-2 focus:ring-[#00D26A]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswordText ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isLoading || !pdfPassword.trim()}
                    className="px-4 py-2 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white font-bold text-xs shadow-button-green transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? 'Desbloqueando...' : 'Desbloquear Fatura'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 rounded-full bg-white text-slate-600 font-bold text-xs border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Escolher Outro Arquivo
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 2. Área de Upload Unificado (quando nenhum arquivo foi carregado ou analisado) */}
          {!parseResult && !pdfResult && !isPasswordModalOpen && (
            <div
              onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-7 sm:p-11 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-[#00D26A] bg-emerald-50/50 scale-[0.99]'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv, .pdf, application/pdf"
                onChange={handleInputChange}
                className="hidden"
              />

              <div className="flex items-center justify-center gap-2 mx-auto mb-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-card text-[#00D26A] flex items-center justify-center">
                  <UploadCloud className="w-6 h-6" />
                </div>
              </div>

              <h4 className="text-sm font-extrabold text-slate-800">
                {isLoading ? loadingMessage : 'Selecione ou arraste sua fatura ou planilha aqui'}
              </h4>

              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                Suporte automático a <strong>Faturas PDF</strong> (Nubank, Itaú, Bradesco, Santander,
                Inter, C6 Bank e outros) e <strong>Planilhas Excel/CSV</strong>. Seus dados são
                processados <strong>100% no seu navegador</strong> com sigilo e segurança.
              </p>

              <div className="flex items-center justify-center gap-2 mt-3.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold">
                  <FileText className="w-3.5 h-3.5 text-rose-500" /> Fatura PDF (.pdf)
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel (.xlsx)
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold">
                  <Tag className="w-3.5 h-3.5 text-blue-500" /> Extrato CSV (.csv)
                </span>
              </div>

              <button
                type="button"
                disabled={isLoading}
                className="mt-5 px-6 py-2.5 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white text-xs font-bold shadow-button-green transition-all"
              >
                {isLoading ? 'Processando...' : 'Escolher Arquivo do Dispositivo'}
              </button>
            </div>
          )}

          {/* 3. Feedback de Erro de Leitura ou PDF Sem Camada Textual */}
          {(parseResult?.parseError || pdfResult?.parseError) && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold space-y-2">
              <div className="flex items-start gap-2.5 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span>{parseResult?.parseError || pdfResult?.parseError}</span>
                  {pdfResult?.isScannedWithoutText && (
                    <p className="text-[11px] text-rose-700 font-normal">
                      💡 <strong>Dica:</strong> Emita a 2ª via da fatura em formato PDF diretamente pelo
                      aplicativo do banco ou internet banking para obter a versão com texto digital legível.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] font-bold text-rose-900 underline cursor-pointer pt-1 block"
              >
                Tentar outro arquivo
              </button>
            </div>
          )}

          {/* 4. Feedback de Importação Concluída (Excel) */}
          {importFeedback && (
            <div
              className={`p-4 rounded-2xl border text-xs font-semibold space-y-2.5 animate-scale-in ${
                importFeedback.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {importFeedback.success ? (
                  <CheckCircle2 className="w-5 h-5 text-[#00D26A] shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <span>{importFeedback.message}</span>
              </div>

              {importFeedback.success && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-full bg-[#00D26A] text-white font-bold text-xs shadow-sm hover:bg-[#00C853] transition-colors cursor-pointer"
                  >
                    Fechar e Ver no App
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 rounded-full bg-white text-slate-700 font-bold text-xs border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Importar Outro Arquivo
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Feedback de Importação Concluída (Fatura PDF) */}
          {pdfImportFeedback && (
            <div
              className={`p-4 rounded-2xl border text-xs font-semibold space-y-2.5 animate-scale-in ${
                pdfImportFeedback.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {pdfImportFeedback.success ? (
                  <CheckCircle2 className="w-5 h-5 text-[#00D26A] shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <span>{pdfImportFeedback.message}</span>
              </div>

              {pdfImportFeedback.success && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-full bg-[#00D26A] text-white font-bold text-xs shadow-sm hover:bg-[#00C853] transition-colors cursor-pointer"
                  >
                    Fechar e Ver no App
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 rounded-full bg-white text-slate-700 font-bold text-xs border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Importar Outro Arquivo
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* 5. PRÉ-VISUALIZAÇÃO DE FATURA PDF (ETAPA 24, 25 & 26)         */}
          {/* ------------------------------------------------------------- */}
          {pdfResult && !pdfResult.parseError && !pdfImportFeedback?.success && (
            <div className="space-y-4">
              {/* Cabeçalho da Fatura PDF Identificada */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Emissor: {pdfResult.metadata.issuer}
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500 font-medium truncate max-w-xs sm:max-w-md">
                    Arquivo: <strong className="text-slate-800">{pdfResult.fileName}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-slate-600 font-medium">
                  {pdfResult.metadata.dueDate && (
                    <span className="flex items-center gap-1 text-[11px] bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Vencimento: {formatDateBR(pdfResult.metadata.dueDate)}
                    </span>
                  )}
                  {pdfResult.metadata.totalInvoiceAmount !== undefined && (
                    <span className="flex items-center gap-1 text-[11px] bg-white px-2 py-0.5 rounded-md border border-slate-200 font-mono font-bold text-slate-800">
                      Total: {formatCurrency(pdfResult.metadata.totalInvoiceAmount)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-700 underline ml-2 cursor-pointer"
                  >
                    Trocar arquivo
                  </button>
                </div>
              </div>

              {/* Painel: Mês e Ano de Referência da Fatura (Etapa 33) */}
              <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#00D26A] flex items-center justify-center font-bold shrink-0">
                      <Calendar className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-extrabold text-slate-900">
                          Mês de Referência da Fatura
                        </h5>
                        {isReferenceManuallyEdited && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                            Manual
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {isReferenceManuallyEdited
                          ? 'A escolha manual prevalece sobre a data estimada do arquivo.'
                          : 'Detectado automaticamente. Você pode alterar o mês ou o dia se desejar.'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">
                      Vencimento Base
                    </span>
                    <span className="text-xs font-mono font-extrabold text-[#00D26A] bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100">
                      {formatDateBR(pdfResult.metadata.dueDate || `${referenceYear}-${String(referenceMonth).padStart(2, '0')}-${String(referenceDueDay).padStart(2, '0')}`)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Mês de Competência
                    </label>
                    <select
                      value={referenceMonth}
                      onChange={e => handleUpdateReferencePeriod(referenceYear, parseInt(e.target.value, 10), referenceDueDay)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-[#00D26A] cursor-pointer"
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {name} ({String(idx + 1).padStart(2, '0')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Ano
                    </label>
                    <select
                      value={referenceYear}
                      onChange={e => handleUpdateReferencePeriod(parseInt(e.target.value, 10), referenceMonth, referenceDueDay)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-[#00D26A] cursor-pointer"
                    >
                      {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(yr => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Dia de Vencimento
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={referenceDueDay}
                      onChange={e => handleUpdateReferencePeriod(referenceYear, referenceMonth, parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-[#00D26A] font-mono"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Compras à vista e a 1ª parcela pendente serão organizadas em{' '}
                    <strong>{MONTH_NAMES[referenceMonth - 1]} / {referenceYear}</strong>.
                    As parcelas seguintes vencerão mês a mês.
                  </span>
                </p>
              </div>

              {/* Métricas do Resumo da Fatura (Resumo antes da importação) */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    Compras à Vista
                  </span>
                  <span className="text-lg font-mono font-extrabold text-slate-900">
                    {pdfOneOffCount}
                  </span>
                  <span className="text-[10px] text-slate-400 block">Lançamentos</span>
                </div>

                <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-100">
                  <span className="text-[10px] font-bold text-purple-800 block uppercase">
                    Parceladas
                  </span>
                  <span className="text-lg font-mono font-extrabold text-purple-950">
                    {pdfInstallmentCount}
                  </span>
                  <span className="text-[10px] text-purple-700 block">Compromissos</span>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold text-emerald-800 block uppercase">
                    Total Selecionado
                  </span>
                  <span className="text-lg font-mono font-extrabold text-emerald-950 truncate block">
                    {formatCurrency(pdfSelectedTotalAmount)}
                  </span>
                  <span className="text-[10px] text-emerald-700 block">
                    {pdfSelectedCount} compras válidas
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    Duplicidades
                  </span>
                  <span className="text-lg font-mono font-extrabold text-slate-900">
                    {pdfDuplicatesCount}
                  </span>
                  <span className="text-[10px] text-slate-400 block">Identificadas</span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    Revisão Necessária
                  </span>
                  <span
                    className={`text-lg font-mono font-extrabold ${
                      pdfNeedsReviewCount > 0 ? 'text-amber-600' : 'text-slate-900'
                    }`}
                  >
                    {pdfNeedsReviewCount}
                  </span>
                  <span className="text-[10px] text-slate-400 block">Alertas/Avisos</span>
                </div>
              </div>

              {/* Filtros e Abas de Visualização da Fatura PDF */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs overflow-x-auto max-w-full">
                  <button
                    type="button"
                    onClick={() => setPdfFilterMode('all_purchases')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                      pdfFilterMode === 'all_purchases'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Compras ({pdfOneOffCount + pdfInstallmentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfFilterMode('installments')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                      pdfFilterMode === 'installments'
                        ? 'bg-white text-purple-800 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Parceladas ({pdfInstallmentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfFilterMode('one_off')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                      pdfFilterMode === 'one_off'
                        ? 'bg-white text-sky-800 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    À Vista ({pdfOneOffCount})
                  </button>
                  {pdfPaymentsCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPdfFilterMode('payments')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                        pdfFilterMode === 'payments'
                          ? 'bg-white text-emerald-800 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                      title="Pagamentos identificados (ignorados do total de compras)"
                    >
                      Pagamentos ({pdfPaymentsCount})
                    </button>
                  )}
                  {pdfRefundsCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPdfFilterMode('refunds')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                        pdfFilterMode === 'refunds'
                          ? 'bg-white text-rose-800 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                      title="Estornos e reembolsos identificados"
                    >
                      Estornos ({pdfRefundsCount})
                    </button>
                  )}
                  {pdfFeesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPdfFilterMode('fees')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                        pdfFilterMode === 'fees'
                          ? 'bg-white text-amber-800 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                      title="IOF, encargos e anuidades identificadas"
                    >
                      Tarifas/IOF ({pdfFeesCount})
                    </button>
                  )}
                  {pdfDuplicatesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPdfFilterMode('duplicates')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                        pdfFilterMode === 'duplicates'
                          ? 'bg-white text-amber-700 shadow-2xs'
                          : 'text-amber-600'
                      }`}
                    >
                      Duplicatas ({pdfDuplicatesCount})
                    </button>
                  )}
                  {pdfNeedsReviewCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPdfFilterMode('needs_review')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                        pdfFilterMode === 'needs_review'
                          ? 'bg-white text-orange-700 shadow-2xs'
                          : 'text-orange-600'
                      }`}
                    >
                      Revisão ({pdfNeedsReviewCount})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllValidPdf}
                    className="font-bold text-[#00D26A] hover:underline cursor-pointer"
                  >
                    Selecionar válidas
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAllPdf}
                    className="font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Desmarcar todas
                  </button>
                </div>
              </div>

              {/* Visualização Responsiva da Lista de Itens do PDF */}
              {/* A. Versão Tabela (Telas sm e maiores) */}
              <div className="hidden sm:block border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-8">#</th>
                        <th className="py-2.5 px-3">Data</th>
                        <th className="py-2.5 px-3">Descrição</th>
                        <th className="py-2.5 px-3">Tipo</th>
                        <th className="py-2.5 px-3">Valor (R$)</th>
                        <th className="py-2.5 px-3">Parcelas</th>
                        <th className="py-2.5 px-3">Total Contratado</th>
                        <th className="py-2.5 px-3">Vencimento</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {displayedPdfItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400">
                            Nenhum lançamento encontrado nesta categoria.
                          </td>
                        </tr>
                      ) : (
                        displayedPdfItems.map(item => {
                          const isNonPurchase =
                            item.type === 'payment' ||
                            item.type === 'refund' ||
                            item.type === 'fee' ||
                            item.type === 'other';

                          return (
                            <tr
                              key={item.id}
                              className={`hover:bg-slate-50/70 transition-colors ${
                                isNonPurchase
                                  ? 'bg-slate-50/40 text-slate-400'
                                  : !item.isValid
                                  ? 'bg-rose-50/30'
                                  : item.isDuplicate
                                  ? 'bg-amber-50/30'
                                  : item.isPastDueDate
                                  ? 'bg-orange-50/20'
                                  : ''
                              }`}
                            >
                              <td className="py-2.5 px-3">
                                <input
                                  type="checkbox"
                                  checked={item.isSelected}
                                  disabled={isNonPurchase || !item.isValid}
                                  onChange={() => togglePdfSelect(item.id)}
                                  className="rounded border-slate-300 text-[#00D26A] focus:ring-[#00D26A] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </td>

                              <td className="py-2 px-3">
                                <input
                                  type="date"
                                  value={item.purchaseDate || ''}
                                  disabled={isNonPurchase}
                                  onChange={e =>
                                    updatePdfItem(item.id, 'purchaseDate', e.target.value)
                                  }
                                  className="w-28 px-1.5 py-1 rounded-lg border border-slate-200 text-slate-800 text-xs font-mono focus:outline-none focus:border-[#00D26A] disabled:bg-slate-100"
                                />
                              </td>

                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  value={item.description}
                                  disabled={isNonPurchase}
                                  onChange={e =>
                                    updatePdfItem(item.id, 'description', e.target.value)
                                  }
                                  className="w-36 sm:w-44 px-2 py-1 rounded-lg border border-slate-200 text-slate-900 font-bold text-xs focus:outline-none focus:border-[#00D26A] disabled:bg-slate-100"
                                />
                                {item.duplicateReason && (
                                  <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">
                                    ⚠️ {item.duplicateReason}
                                  </span>
                                )}
                                {item.validationErrors.length > 0 && (
                                  <span className="block text-[10px] text-rose-600 font-semibold mt-0.5">
                                    ❌ {item.validationErrors.join(', ')}
                                  </span>
                                )}
                              </td>

                              <td className="py-2 px-3 whitespace-nowrap">
                                {item.type === 'one_off' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                    À Vista
                                  </span>
                                )}
                                {item.type === 'installment' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                    Parcelada
                                  </span>
                                )}
                                {item.type === 'payment' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Pagamento (Ignorado)
                                  </span>
                                )}
                                {item.type === 'refund' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    Estorno (Ignorado)
                                  </span>
                                )}
                                {item.type === 'fee' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    Tarifa/IOF (Ignorado)
                                  </span>
                                )}
                              </td>

                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.amount}
                                  disabled={isNonPurchase}
                                  onChange={e =>
                                    updatePdfItem(
                                      item.id,
                                      'amount',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-[#00D26A] disabled:bg-slate-100"
                                />
                              </td>

                              <td className="py-2 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1 font-mono">
                                  <input
                                    type="number"
                                    min={1}
                                    max={item.totalInstallments}
                                    value={item.currentInstallment}
                                    disabled={isNonPurchase}
                                    onChange={e =>
                                      updatePdfItem(
                                        item.id,
                                        'currentInstallment',
                                        parseInt(e.target.value, 10) || 1
                                      )
                                    }
                                    className="w-9 px-1 py-1 rounded border border-slate-200 text-center text-xs disabled:bg-slate-100"
                                    title="Parcela atual pendente"
                                  />
                                  <span className="text-slate-400">/</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={item.totalInstallments}
                                    disabled={isNonPurchase}
                                    onChange={e =>
                                      updatePdfItem(
                                        item.id,
                                        'totalInstallments',
                                        parseInt(e.target.value, 10) || 1
                                      )
                                    }
                                    className="w-9 px-1 py-1 rounded border border-slate-200 text-center text-xs disabled:bg-slate-100"
                                    title="Total de parcelas contratadas"
                                  />
                                </div>
                              </td>

                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="Opcional"
                                  value={item.totalAmount ?? ''}
                                  disabled={isNonPurchase}
                                  onChange={e =>
                                    updatePdfItem(item.id, 'totalAmount', e.target.value)
                                  }
                                  className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-slate-700 font-mono text-xs focus:outline-none focus:border-[#00D26A] disabled:bg-slate-100"
                                  title="Valor total contratado original (quando expressamente informado)"
                                />
                              </td>

                              <td className="py-2 px-3">
                                <input
                                  type="date"
                                  value={item.dueDate || ''}
                                  disabled={isNonPurchase}
                                  onChange={e => updatePdfItem(item.id, 'dueDate', e.target.value)}
                                  className={`px-1.5 py-1 rounded-lg border text-xs focus:outline-none focus:border-[#00D26A] font-mono ${
                                    item.isPastDueDate
                                      ? 'border-orange-300 bg-orange-50/50 text-orange-900'
                                      : 'border-slate-200 text-slate-800'
                                  }`}
                                />
                              </td>

                              <td className="py-2 px-3 whitespace-nowrap">
                                {isNonPurchase ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                    Não importado
                                  </span>
                                ) : item.isDuplicate ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Duplicata
                                  </span>
                                ) : item.isPastDueDate ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">
                                    Vencida
                                  </span>
                                ) : item.isValid ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Auditada
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                    Incompleta
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* B. Versão Cards para Celulares (Telas pequenas < 640px) */}
              <div className="block sm:hidden space-y-2.5 max-h-80 overflow-y-auto">
                {displayedPdfItems.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl text-xs">
                    Nenhum lançamento encontrado nesta categoria.
                  </div>
                ) : (
                  displayedPdfItems.map(item => {
                    const isNonPurchase =
                      item.type === 'payment' ||
                      item.type === 'refund' ||
                      item.type === 'fee' ||
                      item.type === 'other';

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-2xl border text-xs space-y-2 transition-colors ${
                          isNonPurchase
                            ? 'bg-slate-50/60 border-slate-200 text-slate-400'
                            : !item.isValid
                            ? 'bg-rose-50/40 border-rose-200'
                            : item.isDuplicate
                            ? 'bg-amber-50/40 border-amber-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 font-bold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.isSelected}
                              disabled={isNonPurchase || !item.isValid}
                              onChange={() => togglePdfSelect(item.id)}
                              className="rounded border-slate-300 text-[#00D26A] focus:ring-[#00D26A]"
                            />
                            <span className="text-[11px] text-slate-400 font-mono">
                              {item.purchaseDate ? formatDateBR(item.purchaseDate) : 'Sem data'}
                            </span>
                          </label>

                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {item.type === 'one_off'
                              ? 'À Vista'
                              : item.type === 'installment'
                              ? `Parcela ${item.currentInstallment}/${item.totalInstallments}`
                              : item.type}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <input
                            type="text"
                            value={item.description}
                            disabled={isNonPurchase}
                            onChange={e => updatePdfItem(item.id, 'description', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900 text-xs focus:outline-none focus:border-[#00D26A]"
                          />
                          {item.duplicateReason && (
                            <span className="block text-[10px] text-amber-700 font-semibold">
                              ⚠️ {item.duplicateReason}
                            </span>
                          )}
                          {item.validationErrors.length > 0 && (
                            <span className="block text-[10px] text-rose-600 font-semibold">
                              ❌ {item.validationErrors.join(', ')}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 font-mono">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-sans">Valor</span>
                            <input
                              type="number"
                              step="0.01"
                              value={item.amount}
                              disabled={isNonPurchase}
                              onChange={e =>
                                updatePdfItem(
                                  item.id,
                                  'amount',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-full px-2 py-1 rounded border border-slate-200 text-slate-900 font-extrabold text-xs"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block font-sans">
                              Vencimento
                            </span>
                            <input
                              type="date"
                              value={item.dueDate || ''}
                              disabled={isNonPurchase}
                              onChange={e => updatePdfItem(item.id, 'dueDate', e.target.value)}
                              className="w-full px-2 py-1 rounded border border-slate-200 text-slate-800 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Alerta de Confirmação para Registros da Fatura PDF */}
              {isConfirmingPdf && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 space-y-2 animate-scale-in">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>Confirmação de Gravação da Fatura PDF</span>
                  </div>
                  <p>
                    Você está prestes a cadastrar <strong>{pdfSelectedCount} compras</strong>{' '}
                    ({pdfSelectedOneOffCount} à vista e {pdfSelectedInstallmentCount} parceladas),
                    totalizando <strong>{formatCurrency(pdfSelectedTotalAmount)}</strong> na fatura do
                    cartão <strong>{pdfResult.metadata.issuer}</strong>.
                  </p>
                  {pdfSelectedPastDueCount > 0 && (
                    <p className="text-orange-800 font-bold">
                      ⚠️ Atenção: {pdfSelectedPastDueCount} das compras selecionadas possuem data de
                      vencimento no passado. Essas parcelas serão importadas como pendentes/vencidas
                      conforme informado na fatura.
                    </p>
                  )}
                  {pdfSelectedDuplicatesCount > 0 && (
                    <p className="text-amber-800 font-bold">
                      ⚠️ Atenção: {pdfSelectedDuplicatesCount} compras selecionadas foram sinalizadas como
                      possíveis duplicatas de lançamentos existentes.
                    </p>
                  )}
                  <p className="text-slate-600 text-[11px]">
                    Nenhum valor será debitado do seu saldo bancário atual no momento da importação. Todos
                    os lançamentos iniciam como não pagos (paid_at = null).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* 6. PRÉ-VISUALIZAÇÃO DE PLANILHA EXCEL / CSV (PRESERVADA)       */}
          {/* ------------------------------------------------------------- */}
          {parseResult && !parseResult.parseError && !importFeedback?.success && (
            <div className="space-y-4">
              {/* Arquivo e Cartões Identificados */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Arquivo:</span>{' '}
                  <strong className="text-slate-800">{parseResult.fileName}</strong>{' '}
                  <span className="text-slate-400">({parseResult.sheetName})</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {parseResult.identifiedCards.map(c => (
                    <span
                      key={c}
                      className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-bold text-[10px] flex items-center gap-1"
                    >
                      <CreditCard className="w-3 h-3 text-slate-400" />
                      {c}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-700 underline ml-2 cursor-pointer"
                  >
                    Trocar arquivo
                  </button>
                </div>
              </div>

              {/* Painel: Mês e Ano de Referência da Planilha (Etapa 33) */}
              <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#00D26A] flex items-center justify-center font-bold shrink-0">
                      <Calendar className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-extrabold text-slate-900">
                          Mês de Referência dos Lançamentos
                        </h5>
                        {isReferenceManuallyEdited && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                            Manual
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {isReferenceManuallyEdited
                          ? 'A escolha manual prevalece sobre as datas da planilha.'
                          : 'Você pode ajustar o mês ou o dia de vencimento base das compras.'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">
                      Vencimento Base
                    </span>
                    <span className="text-xs font-mono font-extrabold text-[#00D26A] bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100">
                      {formatDateBR(`${referenceYear}-${String(referenceMonth).padStart(2, '0')}-${String(referenceDueDay).padStart(2, '0')}`)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Mês de Competência
                    </label>
                    <select
                      value={referenceMonth}
                      onChange={e => handleUpdateReferencePeriod(referenceYear, parseInt(e.target.value, 10), referenceDueDay)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-[#00D26A] cursor-pointer"
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {name} ({String(idx + 1).padStart(2, '0')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Ano
                    </label>
                    <select
                      value={referenceYear}
                      onChange={e => handleUpdateReferencePeriod(parseInt(e.target.value, 10), referenceMonth, referenceDueDay)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-[#00D26A] cursor-pointer"
                    >
                      {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(yr => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Dia de Vencimento
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={referenceDueDay}
                      onChange={e => handleUpdateReferencePeriod(referenceYear, referenceMonth, parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-[#00D26A] font-mono"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    A parcela atual será vinculada a <strong>{MONTH_NAMES[referenceMonth - 1]} / {referenceYear}</strong>.
                    As parcelas seguintes vencerão mês a mês consecutivamente.
                  </span>
                </p>
              </div>

              {/* Métricas do Arquivo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    Compras Encontradas
                  </span>
                  <span className="text-lg font-mono font-extrabold text-slate-900">
                    {parseResult.totalRowsFound}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {parseResult.validCount} válidas
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    Total das Compras
                  </span>
                  <span className="text-lg font-mono font-extrabold text-slate-900 truncate block">
                    {formatCurrency(parseResult.totalPurchasesAmount)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">Valor original</span>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-800 block uppercase">
                    Parcelas Pendentes
                  </span>
                  <span className="text-lg font-mono font-extrabold text-emerald-950 truncate block">
                    {formatCurrency(parseResult.totalPendingAmount)}
                  </span>
                  <span className="text-[10px] text-emerald-700 block">Ainda a pagar</span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    Alertas
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {parseResult.duplicateCount > 0 && (
                      <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
                        {parseResult.duplicateCount} dup.
                      </span>
                    )}
                    {parseResult.pastDueCount > 0 && (
                      <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-200">
                        {parseResult.pastDueCount} venc.
                      </span>
                    )}
                    {parseResult.duplicateCount === 0 && parseResult.pastDueCount === 0 && (
                      <span className="text-xs font-bold text-emerald-700">Tudo ok</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Filtros da Tabela & Botões de Seleção */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      filterMode === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Todas ({parseResult.totalRowsFound})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('valid')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      filterMode === 'valid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Válidas ({parseResult.validCount})
                  </button>
                  {parseResult.pastDueCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('pastDue')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        filterMode === 'pastDue'
                          ? 'bg-white text-orange-700 shadow-2xs'
                          : 'text-orange-600'
                      }`}
                    >
                      Vencidas ({parseResult.pastDueCount})
                    </button>
                  )}
                  {parseResult.duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('duplicates')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        filterMode === 'duplicates'
                          ? 'bg-white text-amber-700 shadow-2xs'
                          : 'text-amber-600'
                      }`}
                    >
                      Duplicatas ({parseResult.duplicateCount})
                    </button>
                  )}
                  {parseResult.invalidCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('invalid')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        filterMode === 'invalid'
                          ? 'bg-white text-rose-700 shadow-2xs'
                          : 'text-rose-600'
                      }`}
                    >
                      Inválidas ({parseResult.invalidCount})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllValid}
                    className="font-bold text-[#00D26A] hover:underline cursor-pointer"
                  >
                    Selecionar válidas
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Desmarcar todas
                  </button>
                </div>
              </div>

              {/* Tabela de Pré-visualização com Edição Direta (Excel) */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-8">#</th>
                        <th className="py-2.5 px-3">Descrição</th>
                        <th className="py-2.5 px-3">Cartão</th>
                        <th className="py-2.5 px-3">Total (R$)</th>
                        <th className="py-2.5 px-3">Parcela</th>
                        <th className="py-2.5 px-3">Venc. Fatura</th>
                        <th className="py-2.5 px-3">Pendentes</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {displayedPurchases.map(p => (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            !p.isValid
                              ? 'bg-rose-50/30'
                              : p.isDuplicate
                              ? 'bg-amber-50/30'
                              : p.isPastDueDate
                              ? 'bg-orange-50/20'
                              : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={p.isSelected}
                              disabled={!p.isValid}
                              onChange={() => toggleSelect(p.id)}
                              className="rounded border-slate-300 text-[#00D26A] focus:ring-[#00D26A] cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={p.description}
                              onChange={e => updatePurchaseRow(p.id, 'description', e.target.value)}
                              className="w-36 sm:w-44 px-2 py-1 rounded-lg border border-slate-200 text-slate-900 font-bold text-xs focus:outline-none focus:border-[#00D26A]"
                            />
                            {p.duplicateReason && (
                              <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">
                                ⚠️ {p.duplicateReason}
                              </span>
                            )}
                            {p.validationErrors.length > 0 && (
                              <span className="block text-[10px] text-rose-600 font-semibold mt-0.5">
                                ❌ {p.validationErrors.join(', ')}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={p.cardName}
                              onChange={e => updatePurchaseRow(p.id, 'cardName', e.target.value)}
                              className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-slate-700 text-xs focus:outline-none focus:border-[#00D26A]"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              step="0.01"
                              value={p.totalAmount}
                              onChange={e =>
                                updatePurchaseRow(
                                  p.id,
                                  'totalAmount',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-slate-900 font-mono text-xs focus:outline-none focus:border-[#00D26A]"
                            />
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1 font-mono">
                              <input
                                type="number"
                                min={1}
                                max={p.totalInstallments}
                                value={p.currentInstallment}
                                onChange={e =>
                                  updatePurchaseRow(
                                    p.id,
                                    'currentInstallment',
                                    parseInt(e.target.value, 10) || 1
                                  )
                                }
                                className="w-10 px-1 py-1 rounded border border-slate-200 text-center text-xs"
                                title="Parcela atual pendente"
                              />
                              <span className="text-slate-400">/</span>
                              <input
                                type="number"
                                min={1}
                                value={p.totalInstallments}
                                onChange={e =>
                                  updatePurchaseRow(
                                    p.id,
                                    'totalInstallments',
                                    parseInt(e.target.value, 10) || 1
                                  )
                                }
                                className="w-10 px-1 py-1 rounded border border-slate-200 text-center text-xs"
                                title="Total de parcelas"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="date"
                              value={p.dueDate}
                              onChange={e => updatePurchaseRow(p.id, 'dueDate', e.target.value)}
                              className={`px-2 py-1 rounded-lg border text-xs focus:outline-none focus:border-[#00D26A] font-mono ${
                                p.isPastDueDate
                                  ? 'border-orange-300 bg-orange-50/50 text-orange-900'
                                  : 'border-slate-200 text-slate-800'
                              }`}
                            />
                            {p.isPastDueDate && (
                              <span className="block text-[9px] text-orange-700 font-bold mt-0.5">
                                Venc. no passado
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap font-mono font-bold text-slate-900">
                            {p.pendingInstallmentsCount}x de {formatCurrency(p.installmentAmount)}
                            {p.hasDivergence && (
                              <span
                                className="block text-[10px] text-amber-700 font-semibold mt-0.5 cursor-help"
                                title={p.divergenceWarning}
                              >
                                ⚠️ Divergência
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {p.isDuplicate ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                Duplicata
                              </span>
                            ) : p.isPastDueDate ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">
                                Vencida
                              </span>
                            ) : p.isValid ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Pronta
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                Incompleta
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Alerta de Confirmação para Registros com Vencimento no Passado ou Duplicatas */}
              {isConfirming && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 space-y-2 animate-scale-in">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>Confirmação Explícita de Importação</span>
                  </div>
                  <p>
                    Você está prestes a cadastrar <strong>{selectedCount} compras parceladas</strong>,
                    totalizando <strong>{formatCurrency(selectedPendingSum)}</strong> em parcelas a vencer.
                  </p>
                  {selectedPastDueCount > 0 && (
                    <p className="text-orange-800 font-bold">
                      ⚠️ Atenção: {selectedPastDueCount} das compras selecionadas possuem data de
                      vencimento no passado. Essas parcelas serão importadas como pendentes/vencidas
                      conforme informado na planilha.
                    </p>
                  )}
                  <p className="text-slate-600 text-[11px]">
                    Nenhuma parcela será marcada como paga automaticamente e seu saldo bancário atual
                    não será alterado.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {/* A. Footer para Fatura PDF (Gravação Definitiva) */}
        {pdfResult && !pdfResult.parseError && !pdfImportFeedback?.success && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isConfirmingPdf) {
                  setIsConfirmingPdf(false);
                } else {
                  handleReset();
                }
              }}
              className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              {isConfirmingPdf ? 'Voltar para Revisão' : 'Cancelar / Trocar'}
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              {!isConfirmingPdf ? (
                <button
                  type="button"
                  disabled={pdfSelectedCount === 0}
                  onClick={() => setIsConfirmingPdf(true)}
                  className="px-5 py-2.5 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white text-xs font-bold shadow-button-green transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Revisar e Gravar ({pdfSelectedCount})</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isImportingPdf}
                  onClick={handleExecutePdfImport}
                  className="px-6 py-2.5 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white text-xs font-bold shadow-button-green transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isImportingPdf ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Cadastrando compras da fatura...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Confirmar e Gravar {pdfSelectedCount} Compras</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* B. Footer para Planilha Excel / CSV (Preservado com importação definitiva) */}
        {parseResult && !parseResult.parseError && !importFeedback?.success && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isConfirming) {
                  setIsConfirming(false);
                } else {
                  handleReset();
                }
              }}
              className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              {isConfirming ? 'Voltar para Revisão' : 'Cancelar / Trocar'}
            </button>

            <div className="flex items-center gap-2">
              {!isConfirming ? (
                <button
                  type="button"
                  disabled={selectedCount === 0}
                  onClick={() => setIsConfirming(true)}
                  className="px-5 py-2.5 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white text-xs font-bold shadow-button-green transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Revisar e Confirmar ({selectedCount})</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={handleExecuteImport}
                  className="px-6 py-2.5 rounded-full bg-[#00D26A] hover:bg-[#00C853] text-white text-xs font-bold shadow-button-green transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Cadastrando compras...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Confirmar e Cadastrar {selectedCount} Compras</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
