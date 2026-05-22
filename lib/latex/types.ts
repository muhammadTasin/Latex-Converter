export type LatexSnippetMode = "display-source" | "recover-raw";



export type LatexConversionInput = {
  text: string;
  language?: string;
  title?: string;
  author?: string;
  filename?: string;
  fileSize?: number;
  /**
   * Controls how embedded LaTeX source snippets inside plain/PDF-extracted text are handled.
   * display-source: escape source snippets so they print as text inside the generated document.
   * recover-raw: when a complete embedded LaTeX document is found, return it as editable raw .tex.
   */
  conversionMode?: LatexSnippetMode;
};

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssue = {
  severity: ValidationSeverity;
  message: string;
  line?: number;
  suggestedFix?: string;
};

export type DetectedInputType = "latex-document" | "latex-fragment" | "markdown-latex" | "markdown" | "plain-text";

export type ConversionMetadata = {
  filename?: string;
  fileSize?: number;
  inputLength: number;
  outputLength: number;
  inputType: DetectedInputType;
  outputType: "latex-document";
  outputFilename: string;
  outputChecksum: string;
  status: "converted" | "preserved" | "failed";
  largeInput: boolean;
  conversionMode?: LatexSnippetMode;
};

export type LatexConversionResult = {
  latex: string;
  warnings: string[];
  validationIssues: ValidationIssue[];
  metadata: ConversionMetadata;
  stats: {
    wordCount: number;
    equationCount: number;
    tableCount: number;
    citationCount: number;
  };
};
