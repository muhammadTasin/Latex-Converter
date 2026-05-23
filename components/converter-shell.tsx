"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Copy, Download, FileText, FileUp, ImagePlus, Info, Loader2, ScanText, Sparkles, Trash2 } from "lucide-react";
import { supportedLanguages } from "@/lib/languages";
import {
  getDetectedDisplayValue,
  getOutputHeading,
  getSourceTip,
  isCompileReadyDisabled,
  isStandaloneDependency,
  shouldShowDocumentMetadataFields
} from "@/lib/latex/display";

type ValidationIssue = {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  suggestedFix?: string;
};

type ConversionMode = "display-source" | "recover-raw" | "compile-ready";

type ConversionMetadata = {
  filename?: string;
  fileSize?: number;
  inputLength: number;
  outputLength: number;
  inputType: "latex-document" | "latex-fragment" | "markdown-latex" | "markdown" | "plain-text";
  outputType: "latex-document" | "raw-source" | "latex-fragment" | "bibliography" | "latex-project";
  outputFilename: string;
  outputChecksum: string;
  status: "converted" | "preserved" | "preserved-with-warnings" | "validation-warning" | "compile-failed" | "failed";
  largeInput: boolean;
  conversionMode?: ConversionMode;
  fileRole?: "full-document" | "dependency-library" | "fragment" | "bibliography" | "markdown" | "plain-text" | "ocr-text";
  projectRole?: "single-file" | "main-document" | "dependency" | "bibliography" | "fragment" | "project";
  rawSourceConfidence?: number;
  compileConfidence?: number;
  visualFidelityConfidence?: number;
  compileResult?: {
    status: "success" | "failed" | "unavailable" | "skipped";
    engine?: string;
    message: string;
    firstError?: string;
    missingFile?: string;
    line?: number;
    suggestedFix?: string;
  };
};

type ConvertResponse = {
  latex: string;
  warnings: string[];
  validationIssues?: ValidationIssue[];
  metadata?: ConversionMetadata;
  projectFiles?: Array<{
    filename: string;
    fileRole: NonNullable<ConversionMetadata["fileRole"]>;
    projectRole: NonNullable<ConversionMetadata["projectRole"]>;
    outputFilename: string;
    status: ConversionMetadata["status"];
  }>;
  stats?: {
    wordCount: number;
    equationCount: number;
    tableCount: number;
    citationCount: number;
  };
};

type OcrResponse = {
  text?: string;
  confidence?: number | null;
  provider?: string;
  warnings?: string[];
  error?: string;
};

type PdfExtractResponse = {
  text?: string;
  warnings?: string[];
  validationIssues?: ValidationIssue[];
  metadata?: {
    filename: string;
    fileSize: number;
    pageCount?: number;
    extractedLength?: number;
  };
};

type SourceFile = {
  name: string;
  size: number;
  text?: string;
};

const maxTextFileBytes = 2 * 1024 * 1024;
const outputPreviewCharacters = 120_000;
const supportedInputExtensions = new Set(["tex", "latex", "txt", "md", "pdf", "sty", "cls", "bbx", "cbx", "bib"]);

const sampleText = `Title: Research-Quality LaTeX Conversion
Author: Muhammad Tasin
Institution: Department of Computer Science, Independent Research Project
Date: May 2026
Abstract:
This study examines how structured notes can be converted into valid LaTeX for academic writing.

Keywords:
OCR, LaTeX generation, handwriting recognition

1. Introduction:
Plain text can include paragraphs, citations [Smith, 2024], and lists.

2. Problem Statement:
Research notes often mix prose, equations, references, and OCR artifacts in one document.

3. System Architecture:
Input Image -> Preprocessing -> OCR -> Structure Detection

Loss Function:
J(theta) = 1/n sum from i=1 to n [-y_i log(h_theta(x_i)) - (1-y_i) log(1-h_theta(x_i))]

Mathematical Model:
Q(D) = 1 if C >= 0.90
Q(D) = 0.5 if 0.70 <= C < 0.90
Q(D) = 0 if C < 0.70

Matrix Representation:
X = [ [x_11, x_12, x_13],
      [x_21, x_22, x_23],
      [x_31, x_32, x_33] ]

Optimization:
minimize E_total
subject to C >= 0.70
and L must compile successfully

11. Theorem:
Every cleanly parsed structural label should map to a valid LaTeX block.

Proof:
The parser removes metadata from the body, detects academic labels, and renders each block with the matching LaTeX environment.

Algorithm:
Step 1: Upload an image or enter plain text.
Step 2: Apply OCR to extract raw text from the image.
Step 3: Convert the cleaned text into LaTeX.

Table:
| Method | Accuracy |
| --- | --- |
| OCR | 92% |
| Manual review | 99% |

Conclusion:
Generated LaTeX should keep explanations as prose and reserve equation environments for math.

Appendix A: Sample Raw Equation Inputs:
x equals negative b plus or minus square root of b squared minus 4ac over 2a
e to the power i pi plus 1 equals 0

References
- [1] I. Goodfellow, Y. Bengio, and A. Courville, Deep Learning, MIT Press, 2016.`;
const initialSampleText = sampleText.trim();

export function ConverterShell() {
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<SourceFile | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [latex, setLatex] = useState("");
  const [language, setLanguage] = useState("en");
  const [conversionMode, setConversionMode] = useState<ConversionMode>("display-source");
  const [title, setTitle] = useState("Generated Research Draft");
  const [author, setAuthor] = useState("Author Name");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [metadata, setMetadata] = useState<ConversionMetadata>();
  const [isConverting, setIsConverting] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [handwritingMode, setHandwritingMode] = useState(false);
  const [copiedAction, setCopiedAction] = useState<"latex" | "log" | "validation" | null>(null);
  const [status, setStatus] = useState("Ready");
  const [stats, setStats] = useState<ConvertResponse["stats"]>();
  const [resetKey, setResetKey] = useState(0);

  const enabledLanguages = useMemo(() => supportedLanguages.filter((item) => item.enabled), []);
  const directWarnings = useMemo(() => warnings.filter((warning) => !/^(ERROR|WARNING|INFO):/.test(warning)), [warnings]);
  const isLargeOutput = latex.length > outputPreviewCharacters;
  const hasLogContent = Boolean(metadata || warnings.length || validationIssues.length);
  const canDownloadTex = Boolean(latex);
  const standaloneDependency = isStandaloneDependency(metadata);
  const outputHeading = getOutputHeading(metadata);
  const previewLatex = isLargeOutput
    ? `${latex.slice(0, outputPreviewCharacters)}\n\n% Preview truncated. Download the .tex file for the complete output.`
    : latex;
  const outputFilename = metadata?.outputFilename ?? "converted_output.tex";


  function clearWorkspace() {
    setSourceText("");
    setSourceFile(null);
    setSourceFiles([]);
    setLatex("");
    setStats(undefined);
    setWarnings([]);
    setValidationIssues([]);
    setMetadata(undefined);
    setCopiedAction(null);
    setStatus("Ready");
    setResetKey((value) => value + 1);
  }

  async function convertText(nextText = sourceText, fileInfo = sourceFile, preservedWarnings: string[] = []) {
    setIsConverting(true);
    setStatus("Converting");
    setWarnings([]);
    setValidationIssues([]);

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: nextText,
          language,
          title,
          author,
          filename: fileInfo?.name,
          fileSize: fileInfo?.size,
          conversionMode
        })
      });
      const data = (await response.json()) as ConvertResponse;

      setLatex(data.latex ?? "");
      setStats(data.stats);
      setWarnings([...preservedWarnings, ...(data.warnings ?? [])]);
      setValidationIssues(data.validationIssues ?? []);
      setMetadata(data.metadata);
      if (isStandaloneDependency(data.metadata) && conversionMode === "compile-ready") {
        setConversionMode("recover-raw");
      }

      if (!response.ok || data.metadata?.status === "failed") {
        setStatus(response.status === 413 ? "File too large" : "Conversion failed");
        return;
      }

      setStatus(data.metadata?.status === "preserved" ? "Preserved" : "Converted");
    } catch (error) {
      setStatus("Conversion failed");
      setWarnings([error instanceof Error ? error.message : "Conversion failed."]);
      setValidationIssues([]);
    } finally {
      setIsConverting(false);
    }
  }

  async function convertProject(files = sourceFiles) {
    if (!files.length) {
      return;
    }

    setIsConverting(true);
    setStatus("Converting project");
    setWarnings([]);
    setValidationIssues([]);

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((file) => ({ filename: file.name, text: file.text ?? "", fileSize: file.size })),
          language,
          conversionMode
        })
      });
      const data = (await response.json()) as ConvertResponse;

      setLatex(data.latex ?? "");
      setStats(data.stats);
      setWarnings(data.warnings ?? []);
      setValidationIssues(data.validationIssues ?? []);
      setMetadata(data.metadata);

      if (!response.ok || data.metadata?.status === "failed") {
        setStatus("Project conversion needs review");
        return;
      }

      setStatus(data.metadata?.compileResult?.status === "success" ? "Project converted and compiled" : "Project converted");
    } catch (error) {
      setStatus("Project conversion failed");
      setWarnings([error instanceof Error ? error.message : "Project conversion failed."]);
      setValidationIssues([]);
    } finally {
      setIsConverting(false);
    }
  }

  async function loadTextFile(file: File | null) {
    if (!file) {
      return;
    }

    const extension = getExtension(file.name);
    const fileInfo = { name: file.name, size: file.size };
    setSourceFile(fileInfo);
    setWarnings([]);
    setValidationIssues([]);
    setMetadata(undefined);

    if (!supportedInputExtensions.has(extension) && !(await hasPdfHeader(file))) {
      const issue = getUnsupportedFileIssue(file.name);
      setStatus("Unsupported file");
      setLatex("");
      setWarnings([issue.message]);
      setValidationIssues([issue]);
      setMetadata({
        filename: file.name,
        fileSize: file.size,
        inputType: "plain-text",
        outputType: "latex-document",
        outputFilename: toOutputFilename(file.name),
        outputChecksum: "00000000",
        status: "failed",
        largeInput: file.size > maxTextFileBytes,
        inputLength: 0,
        outputLength: 0
      });
      return;
    }

    if (file.size > maxTextFileBytes) {
      const issue: ValidationIssue = {
        severity: "error",
        message: `${file.name} is ${formatBytes(file.size)}, which exceeds the ${formatBytes(maxTextFileBytes)} limit.`,
        suggestedFix: "Split the file into smaller source files before conversion."
      };
      setStatus("File too large");
      setLatex("");
      setWarnings([issue.message]);
      setValidationIssues([issue]);
      setMetadata({
        filename: file.name,
        fileSize: file.size,
        inputType: "plain-text",
        outputType: "latex-document",
        outputFilename: toOutputFilename(file.name),
        outputChecksum: "00000000",
        status: "failed",
        largeInput: true,
        inputLength: 0,
        outputLength: 0
      });
      return;
    }

    if (extension === "pdf" || file.type === "application/pdf" || (await hasPdfHeader(file))) {
      await extractPdfFile(file);
      return;
    }

    setStatus("Reading file");
    const fileText = await file.text();
    setSourceText(fileText);
    await convertText(fileText, fileInfo);
  }

  async function loadTextFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) {
      return;
    }

    if (files.length === 1) {
      await loadTextFile(files[0]);
      return;
    }

    setStatus("Reading project files");
    setWarnings([]);
    setValidationIssues([]);
    setMetadata(undefined);
    setLatex("");

    const unsupported = files.find((file) => !supportedInputExtensions.has(getExtension(file.name)) || getExtension(file.name) === "pdf");
    if (unsupported) {
      const issue: ValidationIssue = {
        severity: "error",
        message: `Unsupported project file "${unsupported.name}".`,
        suggestedFix: "Project uploads support .tex, .latex, .sty, .cls, .bbx, .cbx, .bib, .txt, and .md. Convert PDFs one at a time first."
      };
      setStatus("Unsupported project file");
      setWarnings([issue.message]);
      setValidationIssues([issue]);
      return;
    }

    const oversized = files.find((file) => file.size > maxTextFileBytes);
    if (oversized) {
      const issue: ValidationIssue = {
        severity: "error",
        message: `${oversized.name} is ${formatBytes(oversized.size)}, which exceeds the ${formatBytes(maxTextFileBytes)} limit.`,
        suggestedFix: "Split the project or remove generated artifacts before upload."
      };
      setStatus("File too large");
      setWarnings([issue.message]);
      setValidationIssues([issue]);
      return;
    }

    const loadedFiles = await Promise.all(files.map(async (file) => ({ name: file.name, size: file.size, text: await file.text() })));
    setSourceFiles(loadedFiles);
    setSourceFile({ name: `${loadedFiles.length} project files`, size: loadedFiles.reduce((total, file) => total + file.size, 0) });
    setSourceText(loadedFiles.map((file) => `% ===== ${file.name} =====\n${file.text}`).join("\n\n"));
    await convertProject(loadedFiles);
  }

  async function extractPdfFile(file: File) {
    setStatus("Extracting PDF text");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/pdf-extract", {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as PdfExtractResponse;

      if (!response.ok || !data.text?.trim()) {
        const issues = data.validationIssues?.length
          ? data.validationIssues
          : [
              {
                severity: "error" as const,
                message: "PDF text could not be extracted. Please upload a .tex file for exact LaTeX preservation.",
                suggestedFix: "Use the original .tex source, or OCR the PDF if it is scanned/image-only."
              }
            ];
        setStatus("PDF extraction failed");
        setLatex("");
        setWarnings(data.warnings ?? issues.map((issue) => issue.message));
        setValidationIssues(issues);
        setMetadata({
          filename: file.name,
          fileSize: file.size,
          inputType: "plain-text",
          outputType: "latex-document",
          outputFilename: toOutputFilename(file.name),
          outputChecksum: "00000000",
          status: "failed",
          largeInput: file.size > maxTextFileBytes,
          inputLength: 0,
          outputLength: 0
        });
        return;
      }

      const extractedText = data.text.trim();
      const extractedFileInfo = {
        name: toExtractedTextFilename(file.name),
        size: new Blob([extractedText]).size
      };
      const pdfWarnings = data.warnings ?? ["PDF-to-LaTeX cannot perfectly recover original LaTeX source. For exact preservation, upload .tex."];
      setSourceText(extractedText);
      setSourceFile({ name: file.name, size: file.size });
      await convertText(extractedText, extractedFileInfo, pdfWarnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF text could not be extracted.";
      setStatus("PDF extraction failed");
      setLatex("");
      setWarnings([message]);
      setValidationIssues([
        {
          severity: "error",
          message: "PDF text could not be extracted. Please upload a .tex file for exact LaTeX preservation.",
          suggestedFix: message
        }
      ]);
    }
  }

  function handleSourceChange(value: string) {
    setSourceText(value);
    setSourceFile(null);
    setSourceFiles([]);
    setLatex("");
    setStats(undefined);
    setStatus("Ready");
    setWarnings([]);
    setMetadata(undefined);
    setValidationIssues([]);
  }

  async function runOcr(file: File | null) {
    if (!file) {
      return;
    }

    setIsOcrRunning(true);
    setStatus("Reading image");
    setWarnings([]);
    setValidationIssues([]);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("language", language);
      formData.append("handwritingMode", String(handwritingMode));

      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as OcrResponse;

      if (!response.ok || data.error) {
        setWarnings(data.warnings ?? []);
        throw new Error(data.error ?? "OCR failed.");
      }

      const extractedText = (data.text ?? "").trim();
      if (!extractedText) {
        setWarnings(data.warnings?.length ? data.warnings : ["No readable text was detected in the image."]);
        setStatus("OCR empty");
        return;
      }

      const currentText = sourceText.trim();
      const shouldReplaceText = !currentText || currentText === initialSampleText;
      const mergedText = shouldReplaceText ? extractedText : `${currentText}\n\n${extractedText}`;
      setSourceFile(null);
      setSourceText(mergedText);
      setWarnings(data.warnings ?? []);
      setStatus(data.confidence ? `OCR ${Math.round(data.confidence)}%` : `OCR via ${data.provider ?? "provider"}`);
      await convertText(mergedText, null);
    } catch (error) {
      setStatus("OCR failed");
      const message = error instanceof Error ? error.message : "Image could not be processed.";
      setWarnings((currentWarnings) => (currentWarnings.length ? [...currentWarnings, message] : [message]));
    } finally {
      setIsOcrRunning(false);
    }
  }

  async function copyText(content: string, action: "latex" | "log" | "validation", emptyMessage: string) {
    if (!content) {
      setStatus(emptyMessage);
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedAction(action);
      setStatus("Copied");
      window.setTimeout(() => setCopiedAction(null), 1400);
    } catch {
      const message = "Clipboard copy failed. Use the download button or select the text manually.";
      setStatus("Copy failed");
      setWarnings((currentWarnings) => (currentWarnings.includes(message) ? currentWarnings : [...currentWarnings, message]));
    }
  }

  async function copyLatex() {
    await copyText(latex, "latex", "No LaTeX output to copy");
  }

  async function copyLog() {
    await copyText(getConversionLog(), "log", "No conversion log to copy");
  }

  async function copyValidation() {
    await copyText(getValidationText(validationIssues), "validation", "No validation messages to copy");
  }

  function downloadTex() {
    if (!canDownloadTex) {
      const message = "No LaTeX output is available to download.";
      setStatus("Download blocked");
      setWarnings((currentWarnings) => (currentWarnings.includes(message) ? currentWarnings : [...currentWarnings, message]));
      return;
    }

    downloadBlob(latex, outputFilename, "text/x-tex;charset=utf-8");
  }

  function getConversionLog() {
    return buildConversionLog({
      status: metadata?.status ?? status,
      filename: metadata?.filename ?? "pasted text",
      inputSize: metadata?.fileSize !== undefined ? formatBytes(metadata.fileSize) : formatBytes(new Blob([sourceText]).size),
      inputLength: metadata?.inputLength ?? sourceText.length,
      outputLength: metadata?.outputLength ?? latex.length,
      outputChecksum: metadata?.outputChecksum ?? "00000000",
      inputType: metadata?.inputType ?? "plain-text",
      outputType: metadata?.outputType ?? "latex-document",
      outputFilename,
      conversionMode: metadata?.conversionMode ?? conversionMode,
      fileRole: metadata?.fileRole ?? "plain-text",
      projectRole: metadata?.projectRole ?? "single-file",
      rawSourceConfidence: formatConfidence(metadata?.rawSourceConfidence),
      compileConfidence: formatConfidence(metadata?.compileConfidence),
      visualFidelityConfidence: formatConfidence(metadata?.visualFidelityConfidence),
      compileResult: metadata?.compileResult,
      warnings,
      validationIssues
    });
  }

  function downloadLog() {
    downloadBlob(getConversionLog(), outputFilename.replace(/\.tex$/i, "_log.txt"), "text/plain;charset=utf-8");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Research LaTeX Studio Beta</p>
          <h1>High-fidelity LaTeX recovery and conversion for academic documents</h1>
        </div>
        <div className="status-pill" aria-live="polite">
          <Sparkles size={16} />
          {status}
        </div>
      </header>

      <section className="workspace-grid">
        <div className="panel source-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Source</p>
              <h2>Draft Input</h2>
            </div>
            <div className="toolbar">
              <button className="icon-button" onClick={() => convertText()} disabled={isConverting} aria-label="Convert text" title="Convert text">
                {isConverting ? <Loader2 className="spin" size={18} /> : <ScanText size={18} />}
              </button>
              <button className="icon-button danger-button" onClick={clearWorkspace} aria-label="Clear input and output" title="Clear input and output">
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          {shouldShowDocumentMetadataFields(metadata) ? (
            <div className="field-grid">
              <label>
                Title
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>
                Author
                <input value={author} onChange={(event) => setAuthor(event.target.value)} />
              </label>
            </div>
          ) : null}

          <label>
            Language
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {enabledLanguages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="mode-fieldset">
            <legend>Conversion Mode</legend>
            <div className="mode-toggle">
              <button
                type="button"
                className={conversionMode === "display-source" ? "mode-option active" : "mode-option"}
                onClick={() => setConversionMode("display-source")}
                aria-pressed={conversionMode === "display-source"}
                title="Escape embedded LaTeX so it displays as readable text in the generated document"
              >
                <FileText size={14} />
                Display as Text
              </button>
              <button
                type="button"
                className={conversionMode === "recover-raw" ? "mode-option active" : "mode-option"}
                onClick={() => setConversionMode("recover-raw")}
                aria-pressed={conversionMode === "recover-raw"}
                title="When a complete LaTeX document is found, recover it as editable raw .tex source"
              >
                <ScanText size={14} />
                Recover Raw LaTeX
              </button>
              <button
                type="button"
                className={conversionMode === "compile-ready" ? "mode-option active" : "mode-option"}
                onClick={() => setConversionMode("compile-ready")}
                aria-pressed={conversionMode === "compile-ready"}
                disabled={isCompileReadyDisabled(metadata)}
                title={
                  standaloneDependency
                    ? "Dependency files need a main .tex document for compile-ready validation"
                    : "Preserve full documents and wrap fragments for compile validation when a compiler is available"
                }
              >
                <Sparkles size={14} />
                Compile-ready
              </button>
            </div>
          </fieldset>

          <label className="text-upload-zone">
            <input
              key={`source-${resetKey}`}
              type="file"
              multiple
              accept=".tex,.latex,.sty,.cls,.bbx,.cbx,.bib,.txt,.md,.pdf,text/plain,text/markdown,application/pdf"
              onChange={(event) => loadTextFiles(event.target.files)}
            />
            <FileUp size={22} />
            <span>{sourceFile ? sourceFile.name : "Upload .tex project files, .txt, .md, or PDF (max 2MB each)"}</span>
          </label>

          <div className="notice neutral" style={{ marginTop: "4px", marginBottom: "4px" }}>
            <Info size={18} style={{ flexShrink: 0 }} />
            <div>
              {standaloneDependency ? (
                getSourceTip(metadata)
              ) : (
                <>
                  <strong>Accuracy Tip:</strong> {getSourceTip(metadata)}
                </>
              )}
            </div>
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => handleSourceChange(event.target.value)}
            spellCheck="true"
            aria-label="Plain text input"
            placeholder="Paste research notes here or upload a .tex, .txt, .md, or PDF file (under 2MB for maximum accuracy)."
          />

          <button className="primary-action" onClick={() => (sourceFiles.length > 1 ? convertProject() : convertText())} disabled={isConverting}>
            {isConverting ? <Loader2 className="spin" size={18} /> : <FileText size={18} />}
            Convert to LaTeX
          </button>
        </div>

        <div className="panel upload-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">OCR</p>
              <h2>Image Input</h2>
            </div>
            <ImagePlus size={20} />
          </div>

          <label className="upload-zone">
            <input key={`image-${resetKey}`} type="file" accept="image/*" capture="environment" onChange={(event) => runOcr(event.target.files?.[0] ?? null)} />
            <ImagePlus size={32} />
            <span>Upload image</span>
          </label>

          <label className="toggle-row">
            <input type="checkbox" checked={handwritingMode} onChange={(event) => setHandwritingMode(event.target.checked)} />
            Handwriting mode
          </label>

          <MetadataPanel metadata={metadata} sourceFile={sourceFile} sourceText={sourceText} />

          <div className="stats-grid">
            <Stat label="Words" value={stats?.wordCount ?? 0} />
            <Stat label="Equations" value={stats?.equationCount ?? 0} />
            <Stat label="Tables" value={stats?.tableCount ?? 0} />
            <Stat label="Cites" value={stats?.citationCount ?? 0} />
          </div>

          {isOcrRunning ? (
            <div className="notice neutral">
              <Loader2 className="spin" size={18} />
              OCR in progress
            </div>
          ) : null}

          {directWarnings.length ? (
            <div className="notice warning">
              <AlertCircle size={18} />
              <div>
                {directWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          ) : null}

          {standaloneDependency ? (
            <div className="notice neutral">
              <Info size={18} />
              Dependency file detected. Use with a main .tex document.
            </div>
          ) : null}

          {metadata?.compileResult ? (
            <div className={metadata.compileResult.status === "failed" ? "notice warning" : "notice neutral"}>
              <Info size={18} />
              {metadata.compileResult.message}
            </div>
          ) : null}

          {validationIssues.length ? (
            <div className="issue-list">
              <div className="issue-heading">
                <Info size={16} />
                Validation
              </div>
              {validationIssues.slice(0, 8).map((issue) => (
                <p key={`${issue.severity}-${issue.line ?? "x"}-${issue.message}`} className={`issue ${issue.severity}`}>
                  {formatIssue(issue)}
                </p>
              ))}
              {validationIssues.length > 8 ? <p className="issue info">Download the log for {validationIssues.length - 8} more issues.</p> : null}
            </div>
          ) : null}
        </div>

        <div className="panel output-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Output</p>
              <h2>{outputHeading}</h2>
            </div>
            <div className="toolbar">
              <button className="icon-button" onClick={copyLatex} disabled={!latex} aria-label="Copy LaTeX output" title="Copy full LaTeX output">
                {copiedAction === "latex" ? <Check size={18} /> : <Copy size={18} />}
              </button>
              <button className="icon-button" onClick={downloadTex} disabled={!canDownloadTex} aria-label="Download .tex file" title="Download full LaTeX output">
                <Download size={18} />
              </button>
            </div>
          </div>

          {isLargeOutput ? (
            <div className="notice neutral">
              <Info size={18} />
              Preview is truncated for browser performance. The download contains the complete UTF-8 .tex output.
            </div>
          ) : null}

          <pre className="latex-output">{previewLatex}</pre>

          <div className="output-actions">
            <button onClick={copyLatex} disabled={!latex}>
              {copiedAction === "latex" ? <Check size={16} /> : <Copy size={16} />}
              {copiedAction === "latex" ? "Copied LaTeX" : "Copy LaTeX"}
            </button>
            <button onClick={downloadTex} disabled={!canDownloadTex}>
              <Download size={16} />
              Download .tex
            </button>
            <button onClick={copyLog} disabled={!hasLogContent}>
              {copiedAction === "log" ? <Check size={16} /> : <Copy size={16} />}
              {copiedAction === "log" ? "Copied Log" : "Copy Log"}
            </button>
            <button onClick={copyValidation} disabled={!validationIssues.length}>
              {copiedAction === "validation" ? <Check size={16} /> : <Copy size={16} />}
              {copiedAction === "validation" ? "Copied Validation" : "Copy Validation"}
            </button>
            <button onClick={downloadLog} disabled={!hasLogContent}>
              <Download size={16} />
              Download Log
            </button>
            <button disabled title="Add a LaTeX compiler service or tectonic backend to enable PDF export.">
              PDF export
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function MetadataPanel({ metadata, sourceFile, sourceText }: { metadata?: ConversionMetadata; sourceFile: SourceFile | null; sourceText: string }) {
  const fileSize = metadata?.fileSize ?? sourceFile?.size ?? new Blob([sourceText]).size;
  const filename = metadata?.filename ?? sourceFile?.name ?? "pasted text";

  return (
    <div className="metadata-grid">
      <MetaItem label="Filename" value={filename} />
      <MetaItem label="Size" value={formatBytes(fileSize)} />
      <MetaItem label="Detected" value={getDetectedDisplayValue(metadata)} />
      <MetaItem label="Output" value={metadata?.outputFilename ?? "converted_output.tex"} />
      <MetaItem label="Input chars" value={String(metadata?.inputLength ?? sourceText.length)} />
      <MetaItem label="Output chars" value={String(metadata?.outputLength ?? 0)} />
      <MetaItem label="Checksum" value={metadata?.outputChecksum ?? "00000000"} />
      <MetaItem label="Status" value={metadata?.status ?? "ready"} />
      <MetaItem label="Type" value={metadata?.outputType ?? "latex-document"} />
      <MetaItem label="Role" value={metadata?.fileRole ?? "pending"} />
      <MetaItem label="Project" value={metadata?.projectRole ?? "single-file"} />
      <MetaItem label="Raw confidence" value={formatConfidence(metadata?.rawSourceConfidence)} />
      <MetaItem label="Compile" value={metadata?.compileResult?.status ?? "not run"} />
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(2)} MB`;
}

function formatConfidence(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "pending";
  }

  return `${Math.round(value * 100)}%`;
}

function formatIssue(issue: ValidationIssue) {
  const line = issue.line ? `line ${issue.line}: ` : "";
  const fix = issue.suggestedFix ? ` Fix: ${issue.suggestedFix}` : "";
  return `${issue.severity.toUpperCase()} ${line}${issue.message}${fix}`;
}

function getValidationText(validationIssues: ValidationIssue[]) {
  return validationIssues.map(formatIssue).join("\n");
}

function buildConversionLog({
  status,
  filename,
  inputSize,
  inputLength,
  outputLength,
  outputChecksum,
  inputType,
  outputType,
  outputFilename,
  conversionMode,
  fileRole,
  projectRole,
  rawSourceConfidence,
  compileConfidence,
  visualFidelityConfidence,
  compileResult,
  warnings,
  validationIssues
}: {
  status: string;
  filename: string;
  inputSize: string;
  inputLength: number;
  outputLength: number;
  outputChecksum: string;
  inputType: string;
  outputType: string;
  outputFilename: string;
  conversionMode: string;
  fileRole: string;
  projectRole: string;
  rawSourceConfidence: string;
  compileConfidence: string;
  visualFidelityConfidence: string;
  compileResult?: ConversionMetadata["compileResult"];
  warnings: string[];
  validationIssues: ValidationIssue[];
}) {
  const lines = [
    "LaTeX conversion log",
    "",
    `Status: ${status}`,
    `Filename: ${filename}`,
    `Input size: ${inputSize}`,
    `Input length: ${inputLength} characters`,
    `Output length: ${outputLength} characters`,
    `Output checksum: ${outputChecksum}`,
    `Input type: ${inputType}`,
    `Output type: ${outputType}`,
    `Output file: ${outputFilename}`,
    `Conversion mode: ${conversionMode}`,
    `File role: ${fileRole}`,
    `Project role: ${projectRole}`,
    `Raw source confidence: ${rawSourceConfidence}`,
    `Compile confidence: ${compileConfidence}`,
    `Visual fidelity confidence: ${visualFidelityConfidence}`,
    `Compile status: ${compileResult?.status ?? "not run"}`,
    `Compile message: ${compileResult?.message ?? "No compile validation was run."}`,
    ...(compileResult?.firstError ? [`Compile error: ${compileResult.firstError}`] : []),
    ...(compileResult?.missingFile ? [`Missing file: ${compileResult.missingFile}`] : []),
    "",
    "Warnings:",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "Validation:",
    ...(validationIssues.length ? validationIssues.map((issue) => `- ${formatIssue(issue)}`) : ["- None"])
  ];

  return lines.join("\n");
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

async function hasPdfHeader(file: File) {
  const header = await file.slice(0, 5).text();
  return header === "%PDF-";
}

function getUnsupportedFileIssue(filename: string): ValidationIssue {
  if (getExtension(filename) === "pdf") {
    return {
      severity: "error",
      message: "PDF input cannot reliably preserve original LaTeX source; upload .tex for exact preservation.",
      suggestedFix: "Use the original .tex file for exact preservation. PDF-to-LaTeX should be handled as a separate reconstruction workflow."
    };
  }

  return {
    severity: "error",
    message: `Unsupported file type for "${filename}".`,
    suggestedFix: "Choose a .tex, .latex, .sty, .cls, .bbx, .cbx, .bib, .txt, or .md file."
  };
}

function toOutputFilename(filename: string) {
  const safeName = filename
    .split(/[/\\]/)
    .pop()
    ?.replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/\.[^.]+$/, "");
  return `${safeName || "converted_output"}_converted.tex`;
}

function toExtractedTextFilename(filename: string) {
  const safeName = filename
    .split(/[/\\]/)
    .pop()
    ?.replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/\.[^.]+$/, "");
  return `${safeName || "pdf"}_extracted.txt`;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
