"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Copy, Download, FileText, FileUp, ImagePlus, Info, Loader2, ScanText, Sparkles, Trash2 } from "lucide-react";
import { supportedLanguages } from "@/lib/languages";

type ValidationIssue = {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  suggestedFix?: string;
};

type ConversionMode = "display-source" | "recover-raw";

type ConversionMetadata = {
  filename?: string;
  fileSize?: number;
  inputLength: number;
  outputLength: number;
  inputType: "latex-document" | "latex-fragment" | "markdown-latex" | "markdown" | "plain-text";
  outputType: "latex-document";
  outputFilename: string;
  outputChecksum: string;
  status: "converted" | "preserved" | "failed";
  largeInput: boolean;
  conversionMode?: ConversionMode;
};

type ConvertResponse = {
  latex: string;
  warnings: string[];
  validationIssues?: ValidationIssue[];
  metadata?: ConversionMetadata;
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
};

const maxTextFileBytes = 2 * 1024 * 1024;
const outputPreviewCharacters = 120_000;
const supportedInputExtensions = new Set(["tex", "latex", "txt", "md", "pdf"]);

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
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [stats, setStats] = useState<ConvertResponse["stats"]>();
  const [resetKey, setResetKey] = useState(0);

  const enabledLanguages = useMemo(() => supportedLanguages.filter((item) => item.enabled), []);
  const directWarnings = useMemo(() => warnings.filter((warning) => !/^(ERROR|WARNING|INFO):/.test(warning)), [warnings]);
  const isLargeOutput = latex.length > outputPreviewCharacters;
  const hasFatalIssues = validationIssues.some((issue) => issue.severity === "error") || metadata?.status === "failed";
  const canDownloadTex = Boolean(latex) && !hasFatalIssues;
  const previewLatex = isLargeOutput
    ? `${latex.slice(0, outputPreviewCharacters)}\n\n% Preview truncated. Download the .tex file for the complete output.`
    : latex;
  const outputFilename = metadata?.outputFilename ?? "converted_output.tex";


  function clearWorkspace() {
    setSourceText("");
    setSourceFile(null);
    setLatex("");
    setStats(undefined);
    setWarnings([]);
    setValidationIssues([]);
    setMetadata(undefined);
    setCopied(false);
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

  async function copyLatex() {
    if (!latex || isLargeOutput || hasFatalIssues) {
      return;
    }

    await navigator.clipboard.writeText(latex);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function downloadTex() {
    if (!canDownloadTex) {
      const message = "Download blocked because validation found fatal LaTeX errors.";
      setStatus("Download blocked");
      setWarnings((currentWarnings) => (currentWarnings.includes(message) ? currentWarnings : [...currentWarnings, message]));
      return;
    }

    downloadBlob(latex, outputFilename, "text/x-tex;charset=utf-8");
  }

  function downloadLog() {
    const lines = [
      "LaTeX conversion log",
      "",
      `Status: ${metadata?.status ?? status}`,
      `Filename: ${metadata?.filename ?? "pasted text"}`,
      `Input size: ${metadata?.fileSize !== undefined ? formatBytes(metadata.fileSize) : formatBytes(new Blob([sourceText]).size)}`,
      `Input length: ${metadata?.inputLength ?? sourceText.length} characters`,
      `Output length: ${metadata?.outputLength ?? latex.length} characters`,
      `Output checksum: ${metadata?.outputChecksum ?? "00000000"}`,
      `Input type: ${metadata?.inputType ?? "plain-text"}`,
      `Output type: ${metadata?.outputType ?? "latex-document"}`,
      `Output file: ${outputFilename}`,
      "",
      "Warnings:",
      ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- None"]),
      "",
      "Validation:",
      ...(validationIssues.length ? validationIssues.map((issue) => `- ${formatIssue(issue)}`) : ["- None"])
    ];
    downloadBlob(lines.join("\n"), outputFilename.replace(/\.tex$/i, "_log.txt"), "text/plain;charset=utf-8");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Research LaTeX Studio</p>
          <h1>Text and image notes to academic LaTeX</h1>
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
            </div>
          </fieldset>

          <label className="text-upload-zone">
            <input key={`source-${resetKey}`} type="file" accept=".tex,.latex,.txt,.md,.pdf,text/plain,text/markdown,application/pdf" onChange={(event) => loadTextFile(event.target.files?.[0] ?? null)} />
            <FileUp size={22} />
            <span>{sourceFile ? sourceFile.name : "Upload .tex, .latex, .txt, .md, or PDF (max 2MB)"}</span>
          </label>

          <div className="notice neutral" style={{ marginTop: "4px", marginBottom: "4px" }}>
            <Info size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Accuracy Tip:</strong> For getting 100% accurate text, you should upload small chunks of your project (ideally under 2MB).
            </div>
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => handleSourceChange(event.target.value)}
            spellCheck="true"
            aria-label="Plain text input"
            placeholder="Paste research notes here or upload a .tex, .txt, .md, or PDF file (under 2MB for maximum accuracy)."
          />

          <button className="primary-action" onClick={() => convertText()} disabled={isConverting}>
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
              <h2>LaTeX Preview</h2>
            </div>
            <div className="toolbar">
              <button className="icon-button" onClick={copyLatex} disabled={!latex || isLargeOutput || hasFatalIssues} aria-label="Copy LaTeX">
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
              <button className="icon-button" onClick={downloadTex} disabled={!canDownloadTex} aria-label="Download .tex file">
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
            <button onClick={copyLatex} disabled={!latex || isLargeOutput || hasFatalIssues}>
              <Copy size={16} />
              Copy LaTeX
            </button>
            <button onClick={downloadTex} disabled={!canDownloadTex}>
              <Download size={16} />
              Download .tex
            </button>
            <button onClick={downloadLog} disabled={!warnings.length && !validationIssues.length && !metadata}>
              <Download size={16} />
              Download log
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
      <MetaItem label="Detected" value={metadata?.inputType ?? "pending"} />
      <MetaItem label="Output" value={metadata?.outputFilename ?? "converted_output.tex"} />
      <MetaItem label="Input chars" value={String(metadata?.inputLength ?? sourceText.length)} />
      <MetaItem label="Output chars" value={String(metadata?.outputLength ?? 0)} />
      <MetaItem label="Checksum" value={metadata?.outputChecksum ?? "00000000"} />
      <MetaItem label="Status" value={metadata?.status ?? "ready"} />
      <MetaItem label="Type" value={metadata?.outputType ?? "latex-document"} />
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

function formatIssue(issue: ValidationIssue) {
  const line = issue.line ? `line ${issue.line}: ` : "";
  const fix = issue.suggestedFix ? ` Fix: ${issue.suggestedFix}` : "";
  return `${issue.severity.toUpperCase()} ${line}${issue.message}${fix}`;
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
    suggestedFix: "Choose a .tex, .latex, .txt, or .md file."
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
