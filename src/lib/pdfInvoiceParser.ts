import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configura o Web Worker do PDF.js no navegador via Vite asset URL
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

export interface PdfLine {
  lineNumber: number;
  y: number;
  text: string;
  items: PdfTextItem[];
}

export interface PdfPageResult {
  pageNumber: number;
  width: number;
  height: number;
  hasTextContent: boolean;
  lines: PdfLine[];
  rawText: string;
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

export interface PdfDocumentResult {
  numPages: number;
  isEncrypted: boolean;
  requiresPassword: boolean;
  metadata: PdfMetadata;
  pages: PdfPageResult[];
  allLines: PdfLine[];
  fullText: string;
  hasTextLayer: boolean;
  error?: string;
}

export interface PdfExtractOptions {
  password?: string;
  lineYThreshold?: number; // Tolerância vertical em px para agrupar textos na mesma linha (padrão: 3.5)
  maxPages?: number;
}

/**
 * Agrupa itens de texto dispersos em linhas de leitura horizontais estruturadas,
 * ordenadas do topo para o rodapé e da esquerda para a direita.
 */
export function groupTextItemsIntoLines(
  items: PdfTextItem[],
  lineYThreshold: number = 3.5
): PdfLine[] {
  if (!items || items.length === 0) return [];

  // Ordena prioritariamente por Y descendente (topo da página tem Y maior)
  // Se Y estiver na mesma faixa de tolerância, ordena por X ascendente (esquerda para a direita)
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(b.y - a.y) > lineYThreshold) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const linesMap: { y: number; items: PdfTextItem[] }[] = [];

  for (const item of sorted) {
    const existingLine = linesMap.find(line => Math.abs(line.y - item.y) <= lineYThreshold);
    if (existingLine) {
      existingLine.items.push(item);
    } else {
      linesMap.push({ y: item.y, items: [item] });
    }
  }

  const resultLines: PdfLine[] = [];
  let lineNumber = 1;

  for (const line of linesMap) {
    line.items.sort((a, b) => a.x - b.x);

    let lineText = '';
    for (let i = 0; i < line.items.length; i++) {
      const cur = line.items[i];
      if (i === 0) {
        lineText = cur.text;
      } else {
        const prev = line.items[i - 1];
        const gap = cur.x - (prev.x + prev.width);
        if (gap > 1.5 && !lineText.endsWith(' ') && !cur.text.startsWith(' ')) {
          lineText += ' ' + cur.text;
        } else {
          lineText += cur.text;
        }
      }
    }

    const trimmed = lineText.trim();
    if (trimmed.length > 0) {
      resultLines.push({
        lineNumber: lineNumber++,
        y: line.y,
        text: trimmed,
        items: line.items,
      });
    }
  }

  return resultLines;
}

/**
 * Lê e extrai o texto de um arquivo PDF a partir de um ArrayBuffer ou Uint8Array.
 * Processamento 100% local em memória no cliente, com liberação limpa de recursos.
 */
export async function extractTextFromPdf(
  data: ArrayBuffer | Uint8Array,
  options: PdfExtractOptions = {}
): Promise<PdfDocumentResult> {
  const lineYThreshold = options.lineYThreshold ?? 3.5;
  const uint8Data = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (!uint8Data || uint8Data.length === 0) {
    return {
      numPages: 0,
      isEncrypted: false,
      requiresPassword: false,
      metadata: {},
      pages: [],
      allLines: [],
      fullText: '',
      hasTextLayer: false,
      error: 'Arquivo PDF vazio ou inválido.',
    };
  }

  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;

  try {
    loadingTask = pdfjsLib.getDocument({
      data: uint8Data,
      password: options.password,
      useSystemFonts: true,
    });

    pdfDoc = await loadingTask.promise;

    const numPages = pdfDoc.numPages || 0;
    const maxPagesToProcess = options.maxPages ? Math.min(numPages, options.maxPages) : numPages;

    // Extrai metadados do documento
    let metadata: PdfMetadata = {};
    try {
      const meta = await pdfDoc.getMetadata();
      const info = (meta?.info as Record<string, any>) || {};
      metadata = {
        title: typeof info.Title === 'string' ? info.Title : undefined,
        author: typeof info.Author === 'string' ? info.Author : undefined,
        creator: typeof info.Creator === 'string' ? info.Creator : undefined,
        producer: typeof info.Producer === 'string' ? info.Producer : undefined,
        creationDate: typeof info.CreationDate === 'string' ? info.CreationDate : undefined,
        modificationDate: typeof info.ModDate === 'string' ? info.ModDate : undefined,
      };
    } catch {
      metadata = {};
    }

    const pagesResult: PdfPageResult[] = [];
    const allLines: PdfLine[] = [];
    let globalLineCounter = 1;

    for (let pageNum = 1; pageNum <= maxPagesToProcess; pageNum++) {
      let page: pdfjsLib.PDFPageProxy | null = null;
      try {
        page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();

        const rawTextItems: PdfTextItem[] = [];

        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string' && item.str.length > 0) {
            const x = item.transform[4];
            const y = item.transform[5];
            rawTextItems.push({
              text: item.str,
              x: Math.round(x * 100) / 100,
              y: Math.round(y * 100) / 100,
              width: Math.round(item.width * 100) / 100,
              height: Math.round(item.height * 100) / 100,
              fontName: item.fontName,
            });
          }
        }

        const pageLines = groupTextItemsIntoLines(rawTextItems, lineYThreshold);
        const pageRawText = pageLines.map(l => l.text).join('\n');
        const hasTextContent = pageLines.length > 0 && pageRawText.trim().length > 0;

        pagesResult.push({
          pageNumber: pageNum,
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
          hasTextContent,
          lines: pageLines,
          rawText: pageRawText,
        });

        // Adiciona à lista global de linhas
        for (const line of pageLines) {
          allLines.push({
            lineNumber: globalLineCounter++,
            y: line.y,
            text: line.text,
            items: line.items,
          });
        }
      } finally {
        if (page) {
          try {
            page.cleanup();
          } catch {
            // ignore
          }
        }
      }
    }

    const fullText = pagesResult.map(p => p.rawText).join('\n\n');
    const hasTextLayer = pagesResult.some(p => p.hasTextContent);

    return {
      numPages,
      isEncrypted: false,
      requiresPassword: false,
      metadata,
      pages: pagesResult,
      allLines,
      fullText,
      hasTextLayer,
    };
  } catch (err: any) {
    const errorName = err?.name || '';
    const isPasswordError =
      errorName === 'PasswordException' ||
      /password/i.test(err?.message || '') ||
      err?.code === 1 ||
      err?.code === 2;

    if (isPasswordError) {
      return {
        numPages: 0,
        isEncrypted: true,
        requiresPassword: true,
        metadata: {},
        pages: [],
        allLines: [],
        fullText: '',
        hasTextLayer: false,
        error: 'O documento PDF está protegido por senha. Informe a senha para decodificar.',
      };
    }

    return {
      numPages: 0,
      isEncrypted: false,
      requiresPassword: false,
      metadata: {},
      pages: [],
      allLines: [],
      fullText: '',
      hasTextLayer: false,
      error: `Não foi possível ler o arquivo PDF: ${err?.message || 'formato inválido ou corrompido'}.`,
    };
  } finally {
    if (pdfDoc) {
      try {
        await pdfDoc.cleanup();
      } catch {
        // ignore
      }
    }
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        // ignore
      }
    }
  }
}
