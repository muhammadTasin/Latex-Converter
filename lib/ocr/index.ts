import { mockOcrProvider } from "@/lib/ocr/mock-provider";
import { tesseractOcrProvider } from "@/lib/ocr/tesseract-provider";
import type { OcrProvider } from "@/lib/ocr/types";

export function getOcrProvider(): OcrProvider {
  const provider = process.env.OCR_PROVIDER ?? "tesseract";

  if (provider === "mock") {
    return mockOcrProvider;
  }

  return tesseractOcrProvider;
}
