import { getLanguage } from "@/lib/languages";
import type { OcrProvider, OcrRequest } from "@/lib/ocr/types";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export const tesseractOcrProvider: OcrProvider = {
  name: "tesseract",
  async recognize(request: OcrRequest) {
    const language = getLanguage(request.language);
    const tesseractLanguage = process.env.OCR_DEFAULT_LANGUAGE || language.tesseractCode;
    const cachePath = process.env.OCR_CACHE_PATH || path.join(process.cwd(), ".ocr-cache");
    await mkdir(cachePath, { recursive: true });

    // Dynamic import keeps server startup light and makes it easy to replace
    // this provider with a hosted OCR engine in production.
    const { createWorker, PSM } = await import("tesseract.js");
    const buffer = Buffer.from(request.image);
    const warnings: string[] = [];
    const worker = await createWorker(tesseractLanguage, 1, {
      cachePath,
      langPath: process.env.OCR_LANG_PATH,
      cacheMethod: "write",
      logger: process.env.OCR_DEBUG === "true" ? (message) => console.log(message) : undefined
    });

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });

      const result = await worker.recognize(buffer);
      const text = cleanOcrText(result.data.text, request.handwritingMode);
      const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : null;

      if (!text.trim()) {
        warnings.push("No readable text was detected in the image. Try a sharper, higher-contrast image.");
      }

      if (confidence !== null && confidence < 55) {
        warnings.push("OCR confidence is low. Review the extracted text before converting it to LaTeX.");
      }

      if (request.handwritingMode) {
        warnings.push("Handwriting recognition with Tesseract is limited. For difficult handwritten equations, use Mathpix, Google Vision, Azure AI Vision, or a multimodal OCR provider.");
      }

      return {
        provider: "tesseract",
        text,
        confidence,
        warnings
      };
    } catch (error) {
      throw new Error(formatOcrError(error));
    } finally {
      await worker.terminate();
    }
  }
};

function cleanOcrText(value: string, handwritingMode: boolean): string {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!handwritingMode) {
    return normalized;
  }

  // Handwriting OCR often loses punctuation and equation symbols; these simple
  // repairs are intentionally conservative so the user can review the result.
  return normalized
    .replace(/\f/g, "")
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\bequals\b/gi, "=")
    .replace(/\bover\b/gi, "/")
    .replace(/\bsquared\b/gi, "^2");
}

function formatOcrError(error: unknown): string {
  const message = error instanceof Error ? error.message : "OCR failed.";

  if (/fetch|network|getaddrinfo|ENOTFOUND|ECONNREFUSED|traineddata|lang/i.test(message)) {
    return `Tesseract could not load OCR language data. Check your internet connection or set OCR_LANG_PATH/OCR_CACHE_PATH. Original error: ${message}`;
  }

  return message;
}
