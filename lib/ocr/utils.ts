export function cleanOcrText(value: string, handwritingMode: boolean): string {
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
