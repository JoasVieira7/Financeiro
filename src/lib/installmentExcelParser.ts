import * as XLSX from 'xlsx';
import { Transaction, TransactionCategory } from '../types';
import { calculateInstallmentAmounts, getInstallmentDates } from './formatters';
import { roundToCents } from './budgetCalculations';

export interface ParsedInstallmentPurchase {
  id: string; // ID temporário para controle de seleção e edição na UI
  rowNumber: number;
  description: string;
  totalAmount: number;
  cardName: string;
  totalInstallments: number;
  currentInstallment: number; // Parcela atual pendente informada na planilha
  pendingInstallmentsCount: number; // total - atual + 1
  installmentAmount: number;
  dueDate: string; // YYYY-MM-DD da parcela atual
  purchaseDate: string; // YYYY-MM-DD
  statusRaw: string;
  category: TransactionCategory;
  isValid: boolean;
  validationErrors: string[];
  isPastDueDate: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  hasDivergence?: boolean;
  divergenceWarning?: string;
  isSelected: boolean;
}

export interface ParseResult {
  fileName: string;
  sheetName: string;
  availableSheets: string[];
  totalRowsFound: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  pastDueCount: number;
  totalPurchasesAmount: number;
  totalPendingAmount: number;
  identifiedCards: string[];
  purchases: ParsedInstallmentPurchase[];
  parseError?: string;
}

// Mapeamento flexível de categorias comuns por palavras-chave
export function inferCategory(description: string): TransactionCategory {
  const d = description.toLowerCase();
  if (/mercado|supermercado|restaurante|lanchonete|ifood|padaria|almoço|jantar|café|açougue|bar|pizza|hambúrguer/.test(d)) {
    return 'Alimentação';
  }
  if (/uber|99|combustível|posto|gasolina|estacionamento|pedágio|metrô|ônibus|passagem|voo|aérea|oficina|ipva/.test(d)) {
    return 'Transporte';
  }
  if (/farmácia|drogaria|médico|hospital|laboratório|consulta|dentista|exame|psicólog|remédio|saúde/.test(d)) {
    return 'Saúde';
  }
  if (/aluguel|condomínio|iptu|imobiliária|energia|enel|copel|cemig|luz|água|sanepar|sabesp|gás/.test(d)) {
    return 'Moradia';
  }
  if (/internet|celular|vivo|claro|tim|fibra|netflix|spotify|streaming|amazon prime|disney|academia|cinema|show|viagem|hotel/.test(d)) {
    return 'Lazer';
  }
  if (/curso|faculdade|escola|livro|livraria|educação/.test(d)) {
    return 'Contas';
  }
  return 'Compras';
}

// Mapeamento de categorias de extratos e faturas de bancos (ex: Nubank, Inter, Itaú, etc.)
export function mapBankCategory(cat: string): TransactionCategory {
  const c = cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (/alimenta|restaurante|mercado|supermercado|comida|lanche|padaria|ifood|acougue|cafe/.test(c)) return 'Alimentação';
  if (/transporte|uber|99|taxi|combustivel|posto|estacionamento|pedagio|viagem|passagem|metro|onibus|aerea/.test(c)) return 'Transporte';
  if (/saude|farmacia|drogaria|hospital|consulta|exame|dentista|medico|remedio/.test(c)) return 'Saúde';
  if (/casa|moradia|habitacao|luz|agua|energia|gas|aluguel|condominio|iptu/.test(c)) return 'Moradia';
  if (/lazer|entretenimento|streaming|netflix|spotify|cinema|show|hotel|academia|viagem/.test(c)) return 'Lazer';
  if (/educacao|curso|escola|faculdade|livros|livraria/.test(c)) return 'Contas';
  if (/servicos|contas|pagamento|telecom|internet|celular|vivo|claro|tim/.test(c)) return 'Contas';
  return 'Compras';
}

export interface ExtractedInstallment {
  isInstallment: boolean;
  currentInstallment: number;
  totalInstallments: number;
  cleanText: string;
}

// Extrai informações de parcelamento a partir do texto da descrição (ex: Nubank "Item - Parcela 1/5", "Item (02/10)")
export function extractInstallmentInfoFromText(text: string): ExtractedInstallment {
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

      if (total > 1 && cur >= 1 && cur <= total) {
        const cleanText = text
          .replace(match[0], ' ')
          .replace(/\s+/g, ' ')
          .replace(/[\s\-_]+$/, '')
          .trim();
        return {
          isInstallment: true,
          currentInstallment: cur,
          totalInstallments: total,
          cleanText: cleanText || text,
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

// Normaliza strings para comparação flexível de cabeçalhos
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Identifica coluna pelo nome (priorizando correspondência exata antes de substring)
function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map(h => normalizeHeader(h || ''));
  const normalizedCandidates = candidates.map(normalizeHeader);

  // 1. Prioridade para match exato
  for (const cand of normalizedCandidates) {
    const exactIdx = normalizedHeaders.findIndex(h => h === cand);
    if (exactIdx !== -1) return exactIdx;
  }

  // 2. Fallback para substring
  for (const cand of normalizedCandidates) {
    const subIdx = normalizedHeaders.findIndex(h => h.includes(cand) || cand.includes(h));
    if (subIdx !== -1) return subIdx;
  }

  return -1;
}

// Converte valores monetários BRL ("R$ 1.500,00", "1500,00", " R$ 1,078.38 ", 1500)
export function parseMonetaryValue(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;

  let str = String(val).trim();
  // Preserva sinal negativo se houver
  const isNegative = str.startsWith('-') || (str.startsWith('(') && str.endsWith(')'));

  // Remove R$, espaços e qualquer caractere exceto dígitos, pontos e vírgulas
  str = str.replace(/[^\d,\.]/g, '');
  if (!str) return 0;

  let result = 0;
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Padrão brasileiro: 1.234,56 (último separador é a vírgula)
      result = parseFloat(str.replace(/\./g, '').replace(',', '.'));
    } else {
      // Padrão internacional / US / Excel com formato monetário: 1,234.56 (último separador é o ponto)
      result = parseFloat(str.replace(/,/g, ''));
    }
  } else if (hasComma) {
    // Apenas vírgula: se tiver mais de uma (ex: 1,000,000), são milhares
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) {
      result = parseFloat(str.replace(/,/g, ''));
    } else {
      // Ex: "134,80" ou "1250,50" -> vírgula decimal
      result = parseFloat(str.replace(',', '.'));
    }
  } else if (hasDot) {
    // Apenas ponto: se tiver mais de um ponto (ex: 1.000.000), são milhares
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) {
      result = parseFloat(str.replace(/\./g, ''));
    } else {
      // Ponto único decimal: ex: "134.80", "1078.38", "1200.00"
      result = parseFloat(str);
    }
  } else {
    result = parseFloat(str);
  }

  if (isNaN(result)) return 0;
  return isNegative ? -result : result;
}

// Converte datas diversas (Excel Date object, serial number, ISO, DD/MM/YYYY, MM/DD/YY) para YYYY-MM-DD
export function parseDateToIsoDate(val: any): string | null {
  if (!val) return null;

  // Se já for Date (SheetJS com cellDates: true)
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Se for número serial do Excel (geralmente > 20000 e < 60000)
  if (typeof val === 'number' && val > 20000 && val < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const millis = excelEpoch.getTime() + val * 86400000;
    const d = new Date(millis);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  const str = String(val).trim();

  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // Formato DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Formato MM/DD/YY ou M/D/YY (ex: "12/21/25", "2/9/26")
  const usShortMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (usShortMatch) {
    const m = usShortMatch[1].padStart(2, '0');
    const d = usShortMatch[2].padStart(2, '0');
    const y = '20' + usShortMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Tenta parse genérico
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

export function parseInstallmentFile(
  fileBuffer: ArrayBuffer,
  fileName: string,
  existingTransactions: Transaction[] = []
): ParseResult {
  const isCsv = fileName.toLowerCase().endsWith('.csv');
  let workbook: XLSX.WorkBook;

  try {
    if (isCsv) {
      // Lê CSV como string decodificada UTF-8 com raw: true para preservar strings e formatos originais
      const decoder = new TextDecoder('utf-8');
      const csvText = decoder.decode(fileBuffer);
      workbook = XLSX.read(csvText, { type: 'string', raw: true });
    } else {
      workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array', cellDates: true });
    }
  } catch (err: any) {
    return {
      fileName,
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
      parseError: `Não foi possível ler o arquivo: ${err.message || 'formato inválido'}.`,
    };
  }

  const availableSheets = workbook.SheetNames || [];
  if (availableSheets.length === 0) {
    return {
      fileName,
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
      parseError: 'A planilha está vazia ou não contém abas válidas.',
    };
  }

  // Identifica a aba prioritária "Gastos com Cartão", ignorando "Análises" e "@ExcelenteJoao"
  let targetSheetName = availableSheets[0];
  const preferredSheet = availableSheets.find(s => {
    const norm = normalizeHeader(s);
    return norm.includes('gastoscomcartao') || norm.includes('gastos') || norm.includes('cartao');
  });

  if (preferredSheet) {
    targetSheetName = preferredSheet;
  } else {
    // Escolhe a primeira aba que não seja análise ou apresentação
    const nonAnalysis = availableSheets.find(s => {
      const norm = normalizeHeader(s);
      return !norm.includes('analise') && !norm.includes('apresentacao') && !s.startsWith('@');
    });
    if (nonAnalysis) {
      targetSheetName = nonAnalysis;
    }
  }

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    return {
      fileName,
      sheetName: targetSheetName,
      availableSheets,
      totalRowsFound: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      pastDueCount: 0,
      totalPurchasesAmount: 0,
      totalPendingAmount: 0,
      identifiedCards: [],
      purchases: [],
      parseError: `Aba "${targetSheetName}" não pôde ser lida.`,
    };
  }

  // Converte a aba para matriz de células (linhas x colunas) mantendo valores brutos
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  if (!rows || rows.length === 0) {
    return {
      fileName,
      sheetName: targetSheetName,
      availableSheets,
      totalRowsFound: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      pastDueCount: 0,
      totalPurchasesAmount: 0,
      totalPendingAmount: 0,
      identifiedCards: [],
      purchases: [],
      parseError: 'A aba selecionada não possui linhas de dados.',
    };
  }

  // Localiza a linha do cabeçalho (suporta planilhas tradicionais e CSVs bancários como Nubank)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] || [];
    const joined = row.map((c: any) => normalizeHeader(String(c))).join(' ');
    if (
      (joined.includes('descricao') || joined.includes('compra') || joined.includes('title') || joined.includes('historico') || joined.includes('item')) &&
      (joined.includes('parcela') || joined.includes('valor') || joined.includes('amount') || joined.includes('total'))
    ) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    // Fallback: assume primeira linha como cabeçalho
    headerRowIndex = 0;
  }

  const headers = (rows[headerRowIndex] || []).map((c: any) => String(c).trim());

  // Mapeamento flexível das colunas (compatível com planilhas de parcelamento e extratos bancários / faturas CSV Nubank, Inter, Itaú, etc.):
  const colDateCompra = findColumnIndex(headers, [
    'data compra', 'data da compra', 'datacompra', 'dt compra', 'data', 'date', 'dt'
  ]);
  const colDescricao = findColumnIndex(headers, [
    'descricao', 'descrição', 'title', 'titulo', 'título', 'estabelecimento', 'item', 'historico', 'histórico', 'detalhe', 'loja', 'memo', 'name'
  ]);
  const colValorTotal = findColumnIndex(headers, [
    'valor total', 'valortotal', 'total', 'amount', 'valor', 'vlr'
  ]);
  const colCartao = findColumnIndex(headers, [
    'cartao utilizado', 'cartão utilizado', 'cartao', 'cartão', 'card', 'conta', 'banco'
  ]);
  const colTotalParcelas = findColumnIndex(headers, [
    'total parcelas', 'totalparcelas', 'qtd parcelas', 'quantidade de parcelas', 'total de parcelas', 'parcelas'
  ]);
  const colParcelaAtual = findColumnIndex(headers, [
    'parcela atual', 'parcelaatual', 'parcela pendente'
  ]);
  const colValorParcela = findColumnIndex(headers, [
    'valor parcela', 'valorparcela', 'valor da parcela'
  ]);
  const colDataPagamento = findColumnIndex(headers, [
    'data pagamento', 'datapagamento', 'data de pagamento', 'vencimento', 'data vencimento', 'dt pagamento', 'due date', 'duedate'
  ]);
  const colStatus = findColumnIndex(headers, [
    'status', 'situacao', 'situação'
  ]);
  const colCategoria = findColumnIndex(headers, [
    'category', 'categoria'
  ]);

  const isNubank = fileName.toLowerCase().includes('nubank') ||
    (headers.includes('title') && headers.includes('amount')) ||
    (headers.includes('category') && headers.includes('title'));

  const todayStr = new Date().toISOString().split('T')[0];
  const parsedPurchases: ParsedInstallmentPurchase[] = [];
  const cardsSet = new Set<string>();

  // Processa as linhas de dados após o cabeçalho
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    // Se toda a linha for vazia, ignora
    const hasAnyContent = row.some((c: any) => String(c).trim().length > 0);
    if (!hasAnyContent) continue;

    const validationErrors: string[] = [];

    // 1. Descrição e verificação de pagamentos de fatura
    const rawDesc = colDescricao !== -1 ? String(row[colDescricao] || '').trim() : '';
    const parsedAmount = colValorTotal !== -1 ? parseMonetaryValue(row[colValorTotal]) : 0;

    // Ignora pagamentos de fatura (ex: "Pagamento recebido" no Nubank com valor negativo):
    // Não devem ser importados como compras para evitar inflar custos indevidamente
    const isInvoicePayment =
      /pagamento\s+recebido|pagamento\s+de\s+fatura|pagto\s+fatura|pgto\s+fatura|pagamento\s+efetuado/i.test(rawDesc) ||
      (isNubank && /pagamento/i.test(rawDesc) && parsedAmount < 0);
    if (isInvoicePayment) {
      continue;
    }

    if (!rawDesc) {
      validationErrors.push('Descrição não informada');
    }

    // 2. Valor Total (arredondado para centavos)
    let rawTotal = roundToCents(Math.abs(parsedAmount));
    if (rawTotal <= 0) {
      validationErrors.push('Valor total deve ser maior que zero');
    }

    // 3. Cartão (reconhece Nubank automaticamente se ausente na coluna)
    let rawCard = colCartao !== -1 ? String(row[colCartao] || '').trim() : '';
    if (!rawCard) {
      rawCard = isNubank ? 'Nubank' : 'Cartão de Crédito';
    }
    cardsSet.add(rawCard);

    // 4 e 5. Parcelas (com extração inteligente de "Parcela X/Y" do título se não houver coluna própria)
    let totalParcelas = colTotalParcelas !== -1 ? parseInt(String(row[colTotalParcelas]), 10) : 1;
    let parcelaAtual = colParcelaAtual !== -1 ? parseInt(String(row[colParcelaAtual]), 10) : 1;
    let cleanDesc = rawDesc;

    if (colTotalParcelas === -1) {
      const instInfo = extractInstallmentInfoFromText(rawDesc);
      if (instInfo.isInstallment) {
        totalParcelas = instInfo.totalInstallments;
        parcelaAtual = instInfo.currentInstallment;
        cleanDesc = instInfo.cleanText;
      }
    }

    if (isNaN(totalParcelas) || totalParcelas < 1) {
      validationErrors.push('Quantidade total de parcelas inválida');
      totalParcelas = 1;
    }

    if (isNaN(parcelaAtual) || parcelaAtual < 1) {
      validationErrors.push('Parcela atual inválida');
      parcelaAtual = 1;
    } else if (parcelaAtual > totalParcelas) {
      validationErrors.push(`Parcela atual (${parcelaAtual}) é maior que o total de parcelas (${totalParcelas})`);
    }

    // 6. Cálculo das parcelas pendentes: totalParcelas - parcelaAtual + 1
    const pendingInstallmentsCount = Math.max(0, totalParcelas - parcelaAtual + 1);

    // 7. Valor da parcela
    let valorParcela = colValorParcela !== -1 ? roundToCents(parseMonetaryValue(row[colValorParcela])) : 0;
    if (colTotalParcelas === -1 && totalParcelas > 1) {
      // No CSV do Nubank, o valor informado na linha é o valor da parcela mensal
      valorParcela = rawTotal;
      rawTotal = roundToCents(valorParcela * totalParcelas);
    } else if (valorParcela <= 0 && rawTotal > 0 && totalParcelas > 0) {
      valorParcela = roundToCents(rawTotal / totalParcelas);
    }

    // Auditoria de divergência entre valor total e parcelas
    const expectedTotalFromParcelas = roundToCents(valorParcela * totalParcelas);
    const diff = Math.abs(rawTotal - expectedTotalFromParcelas);
    const hasDivergence = valorParcela > 0 && totalParcelas > 0 && rawTotal > 0 && diff > (0.05 * totalParcelas);
    const divergenceWarning = hasDivergence
      ? `Divergência detectada: ${totalParcelas}x de R$ ${valorParcela.toFixed(2)} = R$ ${expectedTotalFromParcelas.toFixed(2)}, diferente do total informado (R$ ${rawTotal.toFixed(2)}).`
      : undefined;

    // 8. Data da Compra
    let purchaseDate = colDateCompra !== -1 ? parseDateToIsoDate(row[colDateCompra]) : null;
    if (!purchaseDate) {
      purchaseDate = todayStr;
    }

    // 9. Data de Pagamento / Vencimento da fatura
    let dueDate = colDataPagamento !== -1 ? parseDateToIsoDate(row[colDataPagamento]) : null;
    if (!dueDate) {
      // Se o arquivo não tiver coluna de vencimento separada (como o CSV do Nubank),
      // assume a data da compra como data de referência e NÃO dispara erro de validação
      if (colDataPagamento === -1 && purchaseDate) {
        dueDate = purchaseDate;
      } else {
        validationErrors.push('Data de vencimento da fatura inválida ou não informada');
        dueDate = todayStr;
      }
    }

    // 10. Status da planilha
    const statusRaw = colStatus !== -1 ? String(row[colStatus] || '').trim() : 'Em aberto';

    // 11. Detecção de vencimento no passado
    const isPastDueDate = Boolean(dueDate && dueDate < todayStr);

    // Categoria: mapeamento inteligente a partir da coluna ou inferência por palavra-chave
    let category: TransactionCategory;
    if (colCategoria !== -1 && row[colCategoria]) {
      category = mapBankCategory(String(row[colCategoria]));
    } else {
      category = inferCategory(cleanDesc || rawDesc);
    }

    // 12. Detecção de possíveis duplicidades
    let isDuplicate = false;
    let duplicateReason: string | undefined;

    // A. Contra compras já cadastradas no sistema
    const existingMatch = existingTransactions.find(t => {
      if (!t.installment_group_id) return false;
      const descMatch =
        t.description.toLowerCase().trim() === (cleanDesc || rawDesc).toLowerCase().trim();
      const amountMatch =
        t.installment_purchase_amount &&
        Math.abs(t.installment_purchase_amount - rawTotal) < 0.05;
      const totalMatch = t.installment_total === totalParcelas;
      return descMatch && (amountMatch || totalMatch);
    });

    if (existingMatch) {
      isDuplicate = true;
      duplicateReason = `Possível duplicata de compra já cadastrada ("${existingMatch.description}", ${existingMatch.installment_total}x).`;
    }

    // B. Contra itens já processados na mesma planilha
    const duplicateInFile = parsedPurchases.find(
      p =>
        p.description.toLowerCase().trim() === (cleanDesc || rawDesc).toLowerCase().trim() &&
        Math.abs(p.totalAmount - rawTotal) < 0.05 &&
        p.totalInstallments === totalParcelas &&
        p.cardName.toLowerCase().trim() === rawCard.toLowerCase().trim()
    );

    if (duplicateInFile && !isDuplicate) {
      isDuplicate = true;
      duplicateReason = `Item idêntico encontrado na linha ${duplicateInFile.rowNumber} desta mesma planilha.`;
    }

    const isValid = validationErrors.length === 0;

    parsedPurchases.push({
      id: `row-${r}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      rowNumber: r + 1,
      description: cleanDesc || rawDesc || `Compra linha ${r + 1}`,
      totalAmount: rawTotal,
      cardName: rawCard || 'Cartão de Crédito',
      totalInstallments: totalParcelas,
      currentInstallment: parcelaAtual,
      pendingInstallmentsCount,
      installmentAmount: valorParcela,
      dueDate,
      purchaseDate,
      statusRaw,
      category,
      isValid,
      validationErrors,
      isPastDueDate,
      isDuplicate,
      duplicateReason,
      hasDivergence,
      divergenceWarning,
      // Se for válido e não for duplicata, selecionado por padrão; duplicata fica desmarcada para revisão explícita
      isSelected: isValid && !isDuplicate,
    });
  }

  const validPurchases = parsedPurchases.filter(p => p.isValid);
  const totalPurchasesAmount = roundToCents(validPurchases.reduce((acc, p) => acc + p.totalAmount, 0));
  const totalPendingAmount = roundToCents(
    validPurchases.reduce(
      (acc, p) => acc + roundToCents(p.installmentAmount * p.pendingInstallmentsCount),
      0
    )
  );

  return {
    fileName,
    sheetName: targetSheetName,
    availableSheets,
    totalRowsFound: parsedPurchases.length,
    validCount: validPurchases.length,
    invalidCount: parsedPurchases.filter(p => !p.isValid).length,
    duplicateCount: parsedPurchases.filter(p => p.isDuplicate).length,
    pastDueCount: parsedPurchases.filter(p => p.isPastDueDate).length,
    totalPurchasesAmount,
    totalPendingAmount,
    identifiedCards: Array.from(cardsSet),
    purchases: parsedPurchases,
  };
}
