export type LatexSnippetMode = "display-source" | "recover-raw" | "compile-ready";

export type LatexFileRole =
  | "full-document"
  | "dependency-library"
  | "fragment"
  | "bibliography"
  | "markdown"
  | "plain-text"
  | "ocr-text";

export type LatexProjectRole = "single-file" | "main-document" | "dependency" | "bibliography" | "fragment" | "project";

export type LatexOutputType = "latex-document" | "raw-source" | "latex-fragment" | "bibliography" | "latex-project";

export type CompileStatus = "success" | "failed" | "unavailable" | "skipped";

export type CompileResult = {
  status: CompileStatus;
  engine?: string;
  command?: string;
  message: string;
  firstError?: string;
  missingFile?: string;
  line?: number;
  suggestedFix?: string;
};



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
  sourceKind?: "text" | "ocr" | "pdf";
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
  outputType: LatexOutputType;
  outputFilename: string;
  outputChecksum: string;
  status: "converted" | "preserved" | "failed";
  largeInput: boolean;
  conversionMode?: LatexSnippetMode;
  fileRole?: LatexFileRole;
  projectRole?: LatexProjectRole;
  rawSourceConfidence?: number;
  compileConfidence?: number;
  visualFidelityConfidence?: number;
  compileResult?: CompileResult;
};

export type LatexConversionResult = {
  latex: string;
  warnings: string[];
  validationIssues: ValidationIssue[];
  metadata: ConversionMetadata;
  projectFiles?: Array<{
    filename: string;
    fileRole: LatexFileRole;
    projectRole: LatexProjectRole;
    outputFilename: string;
    status: ConversionMetadata["status"];
  }>;
  stats: {
    wordCount: number;
    equationCount: number;
    tableCount: number;
    citationCount: number;
  };
};

export type LatexProjectFile = {
  filename: string;
  text: string;
  fileSize?: number;
};

export type LatexProjectConversionInput = {
  files: LatexProjectFile[];
  language?: string;
  conversionMode?: LatexSnippetMode;
};
