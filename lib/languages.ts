export type SupportedLanguage = {
  code: string;
  label: string;
  tesseractCode: string;
  enabled: boolean;
};

// Language metadata is intentionally central so future OCR/conversion rules can
// be added without touching UI controls or API route contracts.
export const supportedLanguages: SupportedLanguage[] = [
  { code: "en", label: "English", tesseractCode: "eng", enabled: true },
  { code: "bn", label: "Bangla", tesseractCode: "ben", enabled: false },
  { code: "hi", label: "Hindi", tesseractCode: "hin", enabled: false },
  { code: "ar", label: "Arabic", tesseractCode: "ara", enabled: false },
  { code: "fr", label: "French", tesseractCode: "fra", enabled: false },
  { code: "de", label: "German", tesseractCode: "deu", enabled: false },
  { code: "es", label: "Spanish", tesseractCode: "spa", enabled: false }
];

export function getLanguage(code: string | null | undefined): SupportedLanguage {
  return supportedLanguages.find((language) => language.code === code) ?? supportedLanguages[0];
}
