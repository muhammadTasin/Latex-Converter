import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Module = require("node:module");
const workspaceRoot = process.cwd();
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return path.join(workspaceRoot, request.slice(2)) + ".ts";
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  module._compile(output, filename);
};

const { convertTextToLatex, maxConvertibleBytes } = require("../lib/latex/converter.ts");
const { extractPdfTextFromBytes } = require("../lib/pdf/extract.ts");

function convert(input) {
  const result = convertTextToLatex({ text: input, title: "Regression Test" });
  if (result.warnings.length) {
    throw new Error(`Unexpected warnings:\n${result.warnings.join("\n")}\n\nOutput:\n${result.latex}`);
  }

  return result.latex;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function count(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function assertIncludes(value, snippet, label) {
  assert(value.includes(snippet), `${label}: expected output to include ${snippet}`);
}

function assertExcludes(value, snippet, label) {
  assert(!value.includes(snippet), `${label}: expected output not to include ${snippet}`);
}

const testA = convert(String.raw`\section{Finite Element Formulation}
Let $\Omega \subset \mathbb{R}^2$.
\[
-\nabla \cdot (k\nabla u)=f
\]`);
assertIncludes(testA, String.raw`\section{Finite Element Formulation}`, "Test A");
assertIncludes(testA, String.raw`$\Omega \subset \mathbb{R}^2$`, "Test A");
assertIncludes(testA, String.raw`\[
-\nabla \cdot (k\nabla u)=f
\]`, "Test A");
assertExcludes(testA, String.raw`\textbackslash{}section`, "Test A");
assertExcludes(testA, String.raw`\begin{equation}`, "Test A");

const testB = convert(String.raw`\begin{align}
a(u,v) &= \int_{\Omega} k \nabla u \cdot \nabla v \, d\Omega, \\
\ell(v) &= \int_{\Omega} fv \, d\Omega
+ \int_{\Gamma_N} g_N v \, d\Gamma.
\end{align}`);
assert(count(testB, /\\begin\{align\}/g) === 1, "Test B: expected one align environment");
assertExcludes(testB, String.raw`\begin{equation}`, "Test B");
assertExcludes(testB, String.raw`\begin{itemize}`, "Test B");
assertExcludes(testB, String.raw`\textbackslash{}`, "Test B");

const testC = convert(String.raw`\[
\|u-u_h\|_{H^1(\Omega)}
\leq
C h^p \|u\|_{H^{p+1}(\Omega)}.
\]`);
assertExcludes(testC, String.raw`\begin{table}`, "Test C");
assertExcludes(testC, String.raw`\begin{tabular}`, "Test C");
assertExcludes(testC, String.raw`\begin{itemize}`, "Test C");
assertIncludes(testC, String.raw`\|u-u_h\|_{H^1(\Omega)}`, "Test C");

const testD = convert(String.raw`\[
\partial |x_i|
=
\begin{cases}
\{1\}, & x_i > 0, \\
[-1,1], & x_i = 0, \\
\{-1\}, & x_i < 0.
\end{cases}
\]`);
assert(count(testD, /\\begin\{cases\}/g) === 1, "Test D: expected one cases environment");
assertExcludes(testD, String.raw`\begin{table}`, "Test D");
assertExcludes(testD, String.raw`\begin{equation}`, "Test D");

const testE = convert(String.raw`\[
\begin{bmatrix}
A & B \\
C & D
\end{bmatrix}
\begin{bmatrix}
x \\
y
\end{bmatrix}
=
\begin{bmatrix}
f \\
g
\end{bmatrix}
\]`);
assert(count(testE, /\\begin\{bmatrix\}/g) === 3, "Test E: expected three bmatrix blocks");
assertExcludes(testE, String.raw`\begin{equation}`, "Test E");

const testF = convert(String.raw`\begin{table}[h]
\centering
\caption{Convergence study.}
\begin{tabular}{c c c}
\hline
$h$ & DOFs & Error \\
\hline
$1/8$ & $81$ & $2.31\times 10^{-2}$ \\
$1/16$ & $289$ & $5.74\times 10^{-3}$ \\
\hline
\end{tabular}
\end{table}`);
assertIncludes(testF, String.raw`\begin{tabular}{c c c}`, "Test F");
assertIncludes(testF, String.raw`$1/8$ & $81$ & $2.31\times 10^{-2}$ \\`, "Test F");
assertExcludes(testF, String.raw`\begin{equation}`, "Test F");

const testG = convert(String.raw`\begin{algorithm}
\caption{Newton Method}
\begin{algorithmic}[1]
\State Initialize $\mathbf{u}^{(0)}$
\For{$k=0,1,\ldots,k_{\max}$}
\State Solve $\mathbf{K}\Delta\mathbf{u}=-\mathbf{R}$
\If{$\|\mathbf{R}\|_2 < \varepsilon$}
\State Stop
\EndIf
\EndFor
\end{algorithmic}
\end{algorithm}`);
assertIncludes(testG, String.raw`\usepackage{algorithm}`, "Test G");
assertIncludes(testG, String.raw`\usepackage{algpseudocode}`, "Test G");
assertExcludes(testG, String.raw`\usepackage{algorithmic}`, "Test G");
assertIncludes(testG, String.raw`\For{$k=0,1,\ldots,k_{\max}$}`, "Test G");
assertExcludes(testG, String.raw`\begin{equation}`, "Test G");
assertExcludes(testG, String.raw`\begin{table}`, "Test G");

const testH = convert(String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{Test}
\[
x = y + z
\]
\end{document}`);
assert(count(testH, /\\documentclass/g) === 1, "Test H: duplicate documentclass");
assert(count(testH, /\\begin\{document\}/g) === 1, "Test H: duplicate begin document");
assert(count(testH, /\\end\{document\}/g) === 1, "Test H: duplicate end document");
assertExcludes(testH, String.raw`\textbackslash{}section`, "Test H");

const mixedMarkdown = convertTextToLatex({
  text: String.raw`# Research Notes
This keeps inline math $\alpha + \beta$ intact.

$$
E = mc^2
$$

| A | B |
|---|---|
| 1 | 2 |

` + "```latex\n" + String.raw`\section{Do not convert inside code fence unless requested}` + "\n```",
  title: "Regression Test",
  filename: "notes.md",
  fileSize: 180
});
assert(!mixedMarkdown.validationIssues.some((issue) => issue.severity === "error"), "Test I: mixed Markdown should not produce validation errors");
assertIncludes(mixedMarkdown.latex, String.raw`\section{Research Notes}`, "Test I");
assertIncludes(mixedMarkdown.latex, String.raw`$\alpha + \beta$`, "Test I");
assertIncludes(mixedMarkdown.latex, String.raw`\[
E = mc^2
\]`, "Test I");
assertIncludes(mixedMarkdown.latex, String.raw`\toprule`, "Test I");
assertIncludes(mixedMarkdown.latex, String.raw`\begin{verbatim}`, "Test I");
assertExcludes(mixedMarkdown.latex, String.raw`\textbackslash{}alpha`, "Test I");

const fileMetadata = convertTextToLatex({
  text: String.raw`\section{Existing Fragment}`,
  title: "Regression Test",
  filename: "paper.tex",
  fileSize: 512
});
assert(fileMetadata.metadata.inputType === "latex-fragment", "Test J: expected latex-fragment detection");
assert(fileMetadata.metadata.status === "preserved", "Test J: expected LaTeX fragment preservation");
assert(fileMetadata.metadata.outputFilename === "paper_converted.tex", "Test J: expected filename-based output");

const oversized = convertTextToLatex({
  text: "",
  title: "Regression Test",
  filename: "huge.tex",
  fileSize: maxConvertibleBytes + 1
});
assert(oversized.metadata.status === "failed", "Test K: oversized file should fail gracefully");
assert(oversized.validationIssues.some((issue) => issue.severity === "error"), "Test K: oversized file should include an error issue");

const duplicateDocument = convertTextToLatex({
  text: String.raw`\documentclass{article}
\documentclass{article}
\begin{document}
Test
\end{document}`,
  title: "Regression Test",
  filename: "duplicate.tex"
});
assert(duplicateDocument.validationIssues.some((issue) => /Duplicate \\documentclass/.test(issue.message)), "Test L: duplicate documentclass should be reported");

const verbatimContent = [
  String.raw`\begin{verbatim}
| A | B |
|---|---|
| \|u-u_h\|_{H^1(\Omega)} | |x_i| |
`,
  "```latex",
  String.raw`\section{Raw LaTeX That Must Not Be Parsed}
\[
\|x\|_1 = |x_1| + |x_2|
\]
\begin{tabular}{c c}
$1/8$ & $2.31\times 10^{-2}$ \\
\end{tabular}`,
  "```",
  String.raw`\end{verbatim}`
].join("\n");

const verbatimDocumentInput = String.raw`\documentclass{article}
\usepackage{algorithm}
\usepackage{algpseudocode}
\begin{document}
\section{Verbatim Preservation}
` + verbatimContent + String.raw`
\begin{algorithm}
\caption{Check}
\begin{algorithmic}[1]
\State Initialize $x$
\If{$x > 0$}
\State Stop
\EndIf
\end{algorithmic}
\end{algorithm}
\end{document}`;

const verbatimDocument = convertTextToLatex({
  text: verbatimDocumentInput,
  filename: "verbatim-gate.tex",
  fileSize: Buffer.byteLength(verbatimDocumentInput, "utf8")
});
assert(!verbatimDocument.validationIssues.some((issue) => issue.severity === "error"), "Test M: verbatim document should not have fatal validation errors");
assert(verbatimDocument.metadata.status === "preserved", "Test M: valid full document should remain preserved");
assert(verbatimDocument.metadata.inputLength === verbatimDocumentInput.length, "Test M: input length should be recorded");
assert(verbatimDocument.metadata.outputLength === verbatimDocument.latex.length, "Test M: output length should be recorded");
assert(verbatimDocument.latex.includes(verbatimContent), "Test M: verbatim block must be preserved exactly");
assert(verbatimDocument.latex.trim().endsWith(String.raw`\end{document}`), "Test M: output must end with end document");
assertExcludes(verbatimDocument.latex, String.raw`\usepackage{algorithmic}`, "Test M");

const brokenVerbatim = convertTextToLatex({
  text: String.raw`\documentclass{article}
\begin{document}
\begin{verbatim}
| A | B |
|---|---|
`,
  filename: "broken-verbatim.tex"
});
assert(brokenVerbatim.metadata.status === "failed", "Test N: unclosed verbatim should fail the production gate");
assert(brokenVerbatim.validationIssues.some((issue) => /verbatim/.test(issue.message)), "Test N: should report unclosed verbatim");
assert(brokenVerbatim.validationIssues.some((issue) => /end\{document\}/.test(issue.message)), "Test N: should report missing end document");

const conflictingAlgorithmPackages = convertTextToLatex({
  text: String.raw`\documentclass{article}
\usepackage{algorithm}
\usepackage{algpseudocode}
\usepackage{algorithmic}
\begin{document}
\begin{algorithm}
\begin{algorithmic}
\State Stop
\end{algorithmic}
\end{algorithm}
\end{document}`,
  filename: "algorithm-conflict.tex"
});
assert(!conflictingAlgorithmPackages.validationIssues.some((issue) => issue.severity === "error"), "Test O: algorithm package cleanup should not create fatal errors");
assertIncludes(conflictingAlgorithmPackages.latex, String.raw`\usepackage{algorithm}`, "Test O");
assertIncludes(conflictingAlgorithmPackages.latex, String.raw`\usepackage{algpseudocode}`, "Test O");
assertExcludes(conflictingAlgorithmPackages.latex, String.raw`\usepackage{algorithmic}`, "Test O");

const pdfRejected = convertTextToLatex({
  text: "",
  filename: "paper.pdf",
  fileSize: 1024
});
assert(pdfRejected.metadata.status === "failed", "Test P: PDF input should fail clearly");
assert(pdfRejected.validationIssues.some((issue) => /PDF input cannot reliably preserve original LaTeX source/.test(issue.message)), "Test P: PDF warning should explain the limitation");

const rawPdfInternals = convertTextToLatex({
  text: `%PDF-1.4
1 0 obj
<< /Type /Catalog >>
stream
raw bytes
endstream
xref
trailer
startxref
0
%%EOF`,
  filename: "renamed.txt"
});
assert(rawPdfInternals.metadata.status === "failed", "Test Q: raw PDF internals must fail even when renamed as text");
assert(rawPdfInternals.latex === "", "Test Q: raw PDF internals must not be wrapped into LaTeX");
assert(rawPdfInternals.validationIssues.some((issue) => /Raw PDF internals/.test(issue.message)), "Test Q: raw PDF internals should be reported");

const pdfText = "PDF extraction success";
const extractedPdf = await extractPdfTextFromBytes(createMinimalPdf(pdfText));
assert(extractedPdf.text.includes(pdfText), "Test R: PDF parser should extract rendered text");
const convertedExtractedPdf = convertTextToLatex({
  text: extractedPdf.text,
  filename: "pdf-extracted.txt"
});
assert(!/%PDF-|xref|trailer|startxref|%%EOF|^\d+\s+\d+\s+obj\b/m.test(convertedExtractedPdf.latex), "Test R: converted PDF text must not contain raw PDF internals");
assert(convertedExtractedPdf.metadata.status === "converted", "Test R: extracted PDF text should convert through the normal text path");

const researchNotesInput = String.raw`Title: Research-Quality LaTeX Conversion
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
Q(D) = 1 if C > = 0.90
Q(D) = 0.5 if 0.70 < = C < 0.90
Q(D) = 0 if C < 0.70

Matrix Representation:
X = [ [x_11, x_12], [x_21, x_22] ]

Theorem:
If C >= 0.70, the generated document is acceptable.

Proof:
Assume C >= 0.70 and the generated LaTeX compiles.

Algorithm: Step 1: Upload an image. Step 2: Preprocess the input. Step 3: Convert structure to LaTeX.

Optimization:
minimize E_total
subject to C >= 0.70
and L must compile successfully

References
[1] D. Knuth, The TeXbook, Addison-Wesley, 1984.`;

const researchNotes = convertTextToLatex({
  text: researchNotesInput,
  filename: "ocr-notes.txt",
  fileSize: Buffer.byteLength(researchNotesInput, "utf8")
});
assert(!researchNotes.validationIssues.some((issue) => issue.severity === "error"), "Test S: research notes should compile without fatal validation errors");
assertIncludes(researchNotes.latex, String.raw`\title{Research-Quality LaTeX Conversion}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\author{Muhammad Tasin\\Department of Computer Science, Independent Research Project}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\date{May 2026}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\begin{abstract}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\noindent\textbf{Keywords:} OCR, LaTeX generation, handwriting recognition`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\section{Introduction}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\section{Problem Statement}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\text{Input Image} \rightarrow \text{Preprocessing} \rightarrow \operatorname{OCR} \rightarrow \text{Structure Detection}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`J(\theta) = \frac{1}{n} \sum_{i=1}^{n}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\begin{cases}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`C \geq 0.90`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\begin{bmatrix}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`x_{11} & x_{12}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\begin{theorem}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\begin{proof}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\begin{enumerate}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\item Upload an image.`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\begin{align}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`E_{\text{total}}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\section*{References}`, "Test S");
assertIncludes(researchNotes.latex, String.raw`\textit{The TeXbook}`, "Test S");
assertExcludes(researchNotes.latex, "Title:", "Test S");
assertExcludes(researchNotes.latex, "Author:", "Test S");
assertExcludes(researchNotes.latex, "Institution:", "Test S");
assertExcludes(researchNotes.latex, "Step 1:", "Test S");
assert(!researchNotes.validationIssues.some((issue) => /Structured label/.test(issue.message)), "Test S: no structured labels should remain as plain text");

const structuredNotesWithMarkdownTable = convertTextToLatex({
  text: String.raw`Title: OCR Routing Test Author: Muhammad Tasin Institution: Lab Date: May 2026 Abstract: This collapsed OCR text still has structure. Keywords: OCR, tables

1. Introduction:
Structured notes may include Markdown tables.

| Method | Accuracy |
| --- | --- |
| OCR | 92% |

Theorem:
If the labels are detected, this should not be routed as plain Markdown.

Proof:
The generated output contains metadata, a table, and theorem environments.

References
[1] D. Knuth, The TeXbook, Addison-Wesley, 1984.`,
  filename: "structured-notes.md"
});
assert(!structuredNotesWithMarkdownTable.validationIssues.some((issue) => issue.severity === "error"), "Test T: structured Markdown notes should not have fatal validation errors");
assert(structuredNotesWithMarkdownTable.metadata.inputType === "plain-text", "Test T: research structure should outrank Markdown detection");
assertIncludes(structuredNotesWithMarkdownTable.latex, String.raw`\title{OCR Routing Test}`, "Test T");
assertIncludes(structuredNotesWithMarkdownTable.latex, String.raw`\author{Muhammad Tasin\\Lab}`, "Test T");
assertIncludes(structuredNotesWithMarkdownTable.latex, String.raw`\begin{abstract}`, "Test T");
assertIncludes(structuredNotesWithMarkdownTable.latex, String.raw`\section{Introduction}`, "Test T");
assertIncludes(structuredNotesWithMarkdownTable.latex, String.raw`\toprule`, "Test T");
assertIncludes(structuredNotesWithMarkdownTable.latex, String.raw`\begin{theorem}`, "Test T");
assertIncludes(structuredNotesWithMarkdownTable.latex, String.raw`\begin{proof}`, "Test T");
assertIncludes(structuredNotesWithMarkdownTable.latex, String.raw`\section*{References}`, "Test T");
assertExcludes(structuredNotesWithMarkdownTable.latex, "Title:", "Test T");
assertExcludes(structuredNotesWithMarkdownTable.latex, "Abstract:", "Test T");
assert(!structuredNotesWithMarkdownTable.validationIssues.some((issue) => /Structured label/.test(issue.message)), "Test T: structured labels should not remain as plain text");

const embeddedLatexSnippetText = convertTextToLatex({
  text: String.raw`PDF Input Gate Test for LaTeX Converter
Purpose: this is extracted PDF/text content, not a standalone LaTeX document.
LaTeX source block:
\documentclass[11pt]{article}
\usepackage{amsmath}
\begin{document}
\section{Inline Math and Norm Trap}
Let $\Omega \subset \mathbb{R}^d$ and $u_h \in V_h$.
\[
e_h = \frac{\|u-u_h\|_{L^2(\Omega)}}{\|u\|_{L^2(\Omega)}}.
\]
\end{document}
Nested environments: should remain structurally recognizable after extraction.`,
  filename: "latex_converter_pdf_input_gate_test.txt"
});
assert(!embeddedLatexSnippetText.validationIssues.some((issue) => /Output does not end with \\end\{document\}/.test(issue.message)), "Test U: embedded LaTeX snippet text should not be treated as a full document");
assert(embeddedLatexSnippetText.metadata.inputType === "plain-text", "Test U: embedded full LaTeX snippet inside prose should route to plain-text");
assert(embeddedLatexSnippetText.metadata.status === "converted", "Test U: embedded LaTeX snippet text should convert instead of failing as a truncated document");
assertIncludes(embeddedLatexSnippetText.latex, String.raw`\textbackslash{}documentclass`, "Test U");
assert(embeddedLatexSnippetText.latex.trim().endsWith(String.raw`\end{document}`), "Test U: generated wrapper should end cleanly");

const realLatexWithLeadingComment = convertTextToLatex({
  text: String.raw`% leading comment is allowed before documentclass
\documentclass{article}
\begin{document}
Real document.
\end{document}`,
  filename: "real-document.tex"
});
assert(realLatexWithLeadingComment.metadata.inputType === "latex-document", "Test V: real LaTeX document with leading comments should remain latex-document");
assert(realLatexWithLeadingComment.metadata.status === "preserved", "Test V: real LaTeX document should be preserved");


const pdfExtractedLatexBlocks = convertTextToLatex({
  text: String.raw`PDF Input Gate Test for LaTeX Converter
Purpose: this is extracted PDF/text content, not a standalone LaTeX document.
LaTeX source block: should extract as text
\documentclass[11pt]{article}
\usepackage{amsmath}
\begin{document}
\section{Inline Math and Norm Trap}
Let $\Omega \subset \mathbb{R}^d$ and $u_h \in V_h$.
\[
e_h = \frac{\|u-u_h\|_{L^2(\Omega)}}{\|u\|_{L^2(\Omega)}}.
\]
\end{document}

Nested environments: should remain structurally recognizable
\begin{equation}
\begin{aligned}
D(u) &= D_0(1+\beta u^2), \\
r(u) &= \frac{\alpha u}{1+\gamma u^2}.
\end{aligned}
\end{equation}

Tables and matrix traps
\[
\begin{bmatrix}
A & B \\
C & D
\end{bmatrix}
\]
\begin{table}[h]
\centering
\begin{tabular}{cc}
\toprule
$h$ & Error \\
\midrule
$1/8$ & $2.31\times 10^{-2}$ \\
\bottomrule
\end{tabular}
\end{table}

Minimal pass criteria for this PDF
1. PDF upload succeeds or PDF is rejected with a clear unsupported-file message.
2. Extracted text remains recognizable.
3. Validator must not create nested math errors from the extracted snippets.`,
  filename: "latex_converter_pdf_input_gate_test.txt"
});
assert(!pdfExtractedLatexBlocks.validationIssues.some((issue) => issue.severity === "error"), "Test W: PDF-extracted LaTeX-like blocks should not create nested math validation errors");
assert(pdfExtractedLatexBlocks.metadata.inputType === "plain-text", "Test W: PDF-extracted text with embedded snippets should route to plain-text");
assert(pdfExtractedLatexBlocks.metadata.status === "converted", "Test W: PDF-extracted text should convert without fatal validation errors");
assertIncludes(pdfExtractedLatexBlocks.latex, String.raw`\begin{quote}`, "Test W");
assertIncludes(pdfExtractedLatexBlocks.latex, String.raw`\textbackslash{}documentclass`, "Test W");
assertIncludes(pdfExtractedLatexBlocks.latex, String.raw`\begin{equation}`, "Test W");
assertIncludes(pdfExtractedLatexBlocks.latex, String.raw`\begin{bmatrix}`, "Test W");
assertIncludes(pdfExtractedLatexBlocks.latex, String.raw`\begin{table}`, "Test W");
assertIncludes(pdfExtractedLatexBlocks.latex, String.raw`\begin{enumerate}`, "Test W");
assert(!pdfExtractedLatexBlocks.validationIssues.some((issue) => /inside existing math mode|inside math mode|Unbalanced environment/.test(issue.message)), "Test W: no nested math or environment-balance errors should be produced");


const pdfPageMarkerAndExtractedTable = convertTextToLatex({
  text: String.raw`PDF Input Gate Test for LaTeX Converter
Expected behavior
Check

Pass condition

PDF upload
App accepts the file or clearly says PDF input is unsupported.

Text extraction
Backslashes, braces, underscores, dollar signs, and vertical bars are not silently corrupted.

-- 1 of 3 --

Minimal pass criteria for this PDF
1. PDF upload succeeds or PDF is rejected with a clear unsupported-file message.
2. Extracted text remains recognizable.
3. Validator must not wrap page markers in equations.

Checklist
[ ] Keep prose outside math.
[x] Preserve verbatim blocks.
`,
  filename: "pdf-extracted.txt"
});
assert(!pdfPageMarkerAndExtractedTable.validationIssues.some((issue) => issue.severity === "error"), "Test X: PDF-extracted prose/table/checklist content should not have fatal validation errors");
assert(pdfPageMarkerAndExtractedTable.metadata.status === "converted", "Test X: PDF-extracted prose/table/checklist content should convert");
assertIncludes(pdfPageMarkerAndExtractedTable.latex, String.raw`\section{Expected Behavior}`, "Test X");
assertIncludes(pdfPageMarkerAndExtractedTable.latex, String.raw`PDF upload & App accepts the file or clearly says PDF input is unsupported. \\`, "Test X");
assertIncludes(pdfPageMarkerAndExtractedTable.latex, String.raw`% Page marker: -- 1 of 3 --`, "Test X");
assertIncludes(pdfPageMarkerAndExtractedTable.latex, String.raw`\begin{enumerate}`, "Test X");
assertIncludes(pdfPageMarkerAndExtractedTable.latex, String.raw`\begin{itemize}`, "Test X");
assertExcludes(pdfPageMarkerAndExtractedTable.latex, String.raw`\begin{equation}
-- 1 of 3 --
\end{equation}`, "Test X");
assert(!pdfPageMarkerAndExtractedTable.validationIssues.some((issue) => /inside existing math mode|inside math mode|Unbalanced environment/.test(issue.message)), "Test X: extracted tables/checklists/page markers should not create nested math or balance errors");


const flattenedExpectedBehaviorTable = convertTextToLatex({
  text: "PDF Input Gate Test for LaTeX Converter\nExpected Behavior Check Pass condition PDF upload App accepts the file or clearly says PDF input is unsupported. Text extraction Backslashes, braces, underscores, dollar signs, and vertical bars are not silently corrupted. Math/code blocks Raw LaTeX snippets remain recognizable after extraction. Validation Warnings are shown clearly; no false successful status if output is incomplete. Download Result can be downloaded as a .tex or .txt file. Minimal pass criteria for this PDF\n1. PDF upload succeeds.\n2. Extracted text remains recognizable.",
  filename: "flattened-pdf-extracted.txt"
});
assert(!flattenedExpectedBehaviorTable.validationIssues.some((issue) => issue.severity === "error"), "Test Y: flattened expected behavior content should not have fatal validation errors");
assert(flattenedExpectedBehaviorTable.metadata.status === "converted", "Test Y: flattened expected behavior content should convert");
assertIncludes(flattenedExpectedBehaviorTable.latex, String.raw`\section{Expected Behavior}`, "Test Y");
assertIncludes(flattenedExpectedBehaviorTable.latex, String.raw`Check & Pass condition \\`, "Test Y");
assertIncludes(flattenedExpectedBehaviorTable.latex, String.raw`PDF upload & App accepts the file or clearly says PDF input is unsupported. \\`, "Test Y");
assertIncludes(flattenedExpectedBehaviorTable.latex, String.raw`Text extraction & Backslashes, braces, underscores, dollar signs, and vertical bars are not silently corrupted. \\`, "Test Y");
assertIncludes(flattenedExpectedBehaviorTable.latex, String.raw`Math/code blocks & Raw LaTeX snippets remain recognizable after extraction. \\`, "Test Y");
assertIncludes(flattenedExpectedBehaviorTable.latex, String.raw`Validation & Warnings are shown clearly; no false successful status if output is incomplete. \\`, "Test Y");
assertIncludes(flattenedExpectedBehaviorTable.latex, String.raw`Download & Result can be downloaded as a .tex or .txt file. \\`, "Test Y");
assertExcludes(flattenedExpectedBehaviorTable.latex, "Expected Behavior Check Pass condition PDF upload", "Test Y");



const embeddedLatexSnippetDisplayMode = convertTextToLatex({
  text: String.raw`PDF extracted prose before source.
\documentclass{article}
\begin{document}
\section{Recovered Source}
\[
x = y + z
\]
\end{document}
PDF extracted prose after source.`,
  filename: "pdf-extracted.txt",
  conversionMode: "display-source"
});
assert(embeddedLatexSnippetDisplayMode.metadata.conversionMode === "display-source", "Test Z1: display-source mode should be recorded");
assert(embeddedLatexSnippetDisplayMode.metadata.status === "converted", "Test Z1: display source mode should stay converted");
assertIncludes(embeddedLatexSnippetDisplayMode.latex, String.raw`\textbackslash{}documentclass`, "Test Z1");
assertIncludes(embeddedLatexSnippetDisplayMode.latex, String.raw`\begin{quote}`, "Test Z1");
assert(!embeddedLatexSnippetDisplayMode.validationIssues.some((issue) => issue.severity === "error"), "Test Z1: display source should not create fatal validation errors");

const embeddedLatexSnippetRecoverMode = convertTextToLatex({
  text: embeddedLatexSnippetDisplayMode.latex.includes("PDF extracted prose")
    ? String.raw`PDF extracted prose before source.
\documentclass{article}
\begin{document}
\section{Recovered Source}
\[
x = y + z
\]
\end{document}
PDF extracted prose after source.`
    : "",
  filename: "pdf-extracted.txt",
  conversionMode: "recover-raw"
});
assert(embeddedLatexSnippetRecoverMode.metadata.conversionMode === "recover-raw", "Test Z2: recover-raw mode should be recorded");
assert(embeddedLatexSnippetRecoverMode.metadata.status === "preserved", "Test Z2: recover raw mode should preserve the recovered source");
assert(embeddedLatexSnippetRecoverMode.metadata.inputType === "latex-document", "Test Z2: recover raw mode should report recovered latex-document");
assertIncludes(embeddedLatexSnippetRecoverMode.latex, String.raw`\documentclass{article}`, "Test Z2");
assertIncludes(embeddedLatexSnippetRecoverMode.latex, String.raw`\section{Recovered Source}`, "Test Z2");
assertExcludes(embeddedLatexSnippetRecoverMode.latex, String.raw`\textbackslash{}documentclass`, "Test Z2");
assertExcludes(embeddedLatexSnippetRecoverMode.latex, "PDF extracted prose before source", "Test Z2");

const plainTextCodeFenceGateInput = String.raw`Title: Hard Mixed Gate
Abstract: Check fenced code protection and inline math.

1. Introduction
Inline math \( \Omega \subset \mathbb{R}^d \) must remain math.

2. Algorithm
For k = 0, 1, 2, ..., Kmax:
1. Solve forward PDE: \( \mathcal{R}(u_k;\theta_k)=0 \)
2. Compute gradient: \( g_k = \nabla_\theta J(\theta_k) \)

` + "```latex\n" + String.raw`\section{This is inside a code block}
\begin{equation}
Let \( x \in \mathbb{R}^n \)
\end{equation}
\end{document}` + "\n```\n\n" + String.raw`END_TEST_MARKER_OMEGA_999`;

const plainTextCodeFenceGate = convertTextToLatex({
  text: plainTextCodeFenceGateInput,
  filename: "hard-mixture.txt"
});
assert(!plainTextCodeFenceGate.validationIssues.some((issue) => issue.severity === "error"), "Test Z3: fenced code in plain-text path should not produce fatal errors");
assert(plainTextCodeFenceGate.metadata.status === "converted", "Test Z3: fenced code gate should convert");
assertIncludes(plainTextCodeFenceGate.latex, String.raw`\begin{verbatim}`, "Test Z3");
assertIncludes(plainTextCodeFenceGate.latex, String.raw`\( \Omega \subset \mathbb{R}^d \)`, "Test Z3");
assertExcludes(plainTextCodeFenceGate.latex, String.raw`\textbackslash{}( \textbackslash{}Omega`, "Test Z3");
assertIncludes(plainTextCodeFenceGate.latex, String.raw`\section{This is inside a code block}`, "Test Z3");
assertIncludes(plainTextCodeFenceGate.latex, String.raw`END\_TEST\_MARKER\_OMEGA\_999`, "Test Z3");
const maskedPlainTextCodeFenceGate = plainTextCodeFenceGate.latex.replace(/(\\begin\{verbatim\})([\s\S]*?)(\\end\{verbatim\})/g, (_match, begin, body, end) => `${begin}${body.replace(/[^\n]/g, " ")}${end}`);
assertExcludes(maskedPlainTextCodeFenceGate, "```latex", "Test Z3");
assert(count(maskedPlainTextCodeFenceGate, /\\section\{This is inside a code block\}/g) === 0, "Test Z3: code-block section must not be real document structure");
assert(count(maskedPlainTextCodeFenceGate, /\\end\{document\}/g) === 1, "Test Z3: fake end document inside code must not count as structure");
assert(/^[0-9a-f]{8}$/.test(plainTextCodeFenceGate.metadata.outputChecksum), "Test Z3: output checksum should be recorded");
assert(plainTextCodeFenceGate.metadata.outputLength === plainTextCodeFenceGate.latex.length, "Test Z3: output length should match actual LaTeX length");

const markerOnly = convertTextToLatex({
  text: "END_TEST_MARKER_OMEGA_999",
  filename: "marker-only.txt"
});
assert(markerOnly.metadata.status === "converted", "Test Z4: escaped final marker should count as preserved in generated LaTeX");
assert(!markerOnly.validationIssues.some((issue) => /Missing final integrity marker/.test(issue.message)), "Test Z4: escaped final marker must not create a false truncation error");

const numberedChecklistShouldStayList = convertTextToLatex({
  text: String.raw`Minimal pass criteria for this PDF
1. PDF upload succeeds or PDF is rejected with a clear unsupported-file message.
2. Extracted text remains recognizable.
3. Validator must not wrap page markers in equations.`,
  filename: "numbered-checklist.txt"
});
assertIncludes(numberedChecklistShouldStayList.latex, String.raw`\begin{enumerate}`, "Test Z5");
assertExcludes(numberedChecklistShouldStayList.latex, String.raw`\section{PDF Upload Succeeds`, "Test Z5");
assertExcludes(numberedChecklistShouldStayList.latex, String.raw`\begin{equation}
For k = 0`, "Test Z5");

const finalHardFixtureInput = fs.readFileSync(path.join(workspaceRoot, "fixtures", "hard-research-mixture-input.txt"), "utf8");
const finalHardFixture = convertTextToLatex({
  text: finalHardFixtureInput,
  filename: "hard-research-mixture-input.txt"
});
assert(!finalHardFixture.validationIssues.some((issue) => issue.severity === "error"), "Test Z6: full hard fixture should have no fatal errors");
assert(finalHardFixture.metadata.status === "converted", "Test Z6: full hard fixture should convert successfully");
assertIncludes(finalHardFixture.latex, String.raw`\title{Hard Research Mixture Gate}`, "Test Z6");
assertIncludes(finalHardFixture.latex, String.raw`\section{Expected Behavior}`, "Test Z6");
assertIncludes(finalHardFixture.latex, String.raw`PDF upload & App accepts the file or clearly says PDF input is unsupported. \\`, "Test Z6");
assertIncludes(finalHardFixture.latex, String.raw`\section{Introduction}`, "Test Z6");
assertIncludes(finalHardFixture.latex, String.raw`\section{Algorithm}`, "Test Z6");
assertIncludes(finalHardFixture.latex, String.raw`\begin{verbatim}`, "Test Z6");
assertIncludes(finalHardFixture.latex, String.raw`\section{This is inside a code block}`, "Test Z6");
const maskedFinalHardFixture = finalHardFixture.latex.replace(/(\\begin\{verbatim\})([\s\S]*?)(\\end\{verbatim\})/g, (_match, begin, body, end) => `${begin}${body.replace(/[^\n]/g, " ")}${end}`);
assertExcludes(maskedFinalHardFixture, "```latex", "Test Z6");
assert(count(maskedFinalHardFixture, /\\section\{This is inside a code block\}/g) === 0, "Test Z6: code-block section must not be real structure");
assertIncludes(finalHardFixture.latex, String.raw`END\_TEST\_MARKER\_OMEGA\_999`, "Test Z6");
assert(finalHardFixture.metadata.outputLength === finalHardFixture.latex.length, "Test Z6: final fixture output length must match actual output");
assert(/^[0-9a-f]{8}$/.test(finalHardFixture.metadata.outputChecksum), "Test Z6: final fixture checksum must be available");

const z7Input1 = `Equation:\nTable:\nEQUATION\nTABLE`;
const z7Res1 = convertTextToLatex({ text: z7Input1, filename: "z7-1.txt" });
assertExcludes(z7Res1.latex, "\\section{Equation}", "Test Z7.1: Equation should not be a section");
assertExcludes(z7Res1.latex, "\\section{Table}", "Test Z7.2: Table should not be a section");

const z7Input3 = `For k = 0 to 10, compute the values.`;
const z7Res3 = convertTextToLatex({ text: z7Input3, filename: "z7-3.txt" });
assertExcludes(z7Res3.latex, "\\begin{equation}", "Test Z7.3: Prose should not be wrapped in equation");
assertIncludes(z7Res3.latex, "For k = 0 to 10", "Test Z7.3: Prose should be preserved");

const z7Input4 = `Expected Behavior Check Table
Check Pass condition
PDF upload true, App accepts the file or clearly says PDF input is unsupported.
Text extraction false It fails
Verbatim`;
const z7Res4 = convertTextToLatex({ text: z7Input4, filename: "z7-4.txt" });
assertIncludes(z7Res4.latex, "\\begin{tabular}{ll}", "Test Z7.4: Expected Behavior Check Table should be a tabular");
assertIncludes(z7Res4.latex, "PDF upload & true, App accepts the file or clearly says PDF input is unsupported. \\\\", "Test Z7.4");
assertIncludes(z7Res4.latex, "Text extraction & false, It fails \\\\", "Test Z7.4");

const z7Input5 = `Some text. \\_ \\% END_TEST_MARKER_OMEGA_999`;
const z7Res5 = convertTextToLatex({ text: z7Input5, filename: "z7-5.txt" });
assert(!z7Res5.validationIssues.some((issue) => /Missing final integrity marker/.test(issue.message)), "Test Z7.5: END_TEST_MARKER_OMEGA_999 validation should handle escaped characters");

const z7Input6 = `1. Theorem.
2. Lemma.
Proof.
Remark.`;
const z7Res6 = convertTextToLatex({ text: z7Input6, filename: "z7-6.txt" });
assertIncludes(z7Res6.latex, "\\section{Theorem}", "Test Z7.6: Theorem should be a section");
assertIncludes(z7Res6.latex, "\\section{Lemma}", "Test Z7.6: Lemma should be a section");
assertIncludes(z7Res6.latex, "\\section{Proof}", "Test Z7.6: Proof should be a section");
assertIncludes(z7Res6.latex, "\\section{Remark}", "Test Z7.6: Remark should be a section");
assertExcludes(z7Res6.latex, "\\begin{enumerate}", "Test Z7.6: Should not be enumerate");

const z7Input7 = `[1] Citations and References
This is an ordinary sentence about citations.`;
const z7Res7 = convertTextToLatex({ text: z7Input7, filename: "z7-7.txt" });
assertExcludes(z7Res7.latex, "\\section*{References}", "Test Z7.7: Should not split Citations and References");
assertExcludes(z7Res7.latex, "\\bibitem", "Test Z7.7: Should not turn ordinary citation prose into bibitem");

console.log("LaTeX converter regression tests passed");

function createMinimalPdf(text) {
  const stream = `BT
/F1 24 Tf
72 720 Td
(${escapePdfString(text)}) Tj
ET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

function escapePdfString(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
