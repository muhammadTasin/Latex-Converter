import path from "node:path";
import { pathToFileURL } from "node:url";

export type PdfTextExtractionResult = {
  text: string;
  pageCount: number;
  warnings?: string[];
};

type PdfParseConstructor = new (options: { data: Uint8Array }) => {
  getText: () => Promise<{ text: string; total: number }>;
  destroy: () => Promise<void>;
};

let pdfParseLoader: Promise<PdfParseConstructor | null> | null = null;

async function loadPdfParse(): Promise<PdfParseConstructor | null> {
  if (!pdfParseLoader) {
    pdfParseLoader = import("pdf-parse")
      .then((module) => {
        const PDFParse = module.PDFParse as PdfParseConstructor & { setWorker?: (worker: string) => void };
        const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
        PDFParse.setWorker?.(pathToFileURL(workerPath).href);
        return PDFParse;
      })
      .catch(() => null);
  }

  return pdfParseLoader;
}

export async function extractPdfTextFromBytes(bytes: ArrayBuffer | Uint8Array): Promise<PdfTextExtractionResult> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const PDFParse = await withTimeout(loadPdfParse(), 3000).catch(() => null);

  if (PDFParse) {
    const parser = new PDFParse({ data });

    try {
      const result = await withTimeout(parser.getText(), 5000);
      const text = result.text.trim();
      if (text) {
        return {
          text,
          pageCount: result.total
        };
      }
    } catch {
      // Fall back so an environment-sensitive pdf-parse runtime cannot hang conversion.
    } finally {
      await withTimeout(parser.destroy(), 1000).catch(() => undefined);
    }
  }

  return extractPdfTextFallback(data);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise.finally(() => {
      if (timeout) {
        clearTimeout(timeout);
      }
    }),
    new Promise<T>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms.`)), timeoutMs);
    })
  ]);
}

export function hasPdfHeader(bytes: Uint8Array): boolean {
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  return header === "%PDF-";
}

function extractPdfTextFallback(bytes: Uint8Array): PdfTextExtractionResult {
  const source = new TextDecoder("latin1").decode(bytes);
  const textParts: string[] = [];

  for (const match of source.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    textParts.push(decodePdfLiteralString(match[0].replace(/\)\s*Tj$/, "").replace(/^\(/, "")));
  }

  for (const arrayMatch of source.matchAll(/\[((?:\s*\((?:\\.|[^\\)])*\)\s*)+)\]\s*TJ/g)) {
    const arrayContent = arrayMatch[1];
    for (const stringMatch of arrayContent.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      textParts.push(decodePdfLiteralString(stringMatch[0].slice(1, -1)));
    }
  }

  const text = textParts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) {
    throw new Error("PDF text extraction unavailable or produced no readable text. This may be a scanned/image-only PDF.");
  }

  return {
    text,
    pageCount: Math.max(countMatches(source, /\/Type\s*\/Page\b(?!s)/g), 1),
    warnings: ["Used fallback PDF text extraction because the primary parser was unavailable."]
  };
}

function decodePdfLiteralString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}
