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

const { classifyLatexFile, convertLatexProject, convertTextToLatex, maxConvertibleBytes } = require("../lib/latex/converter.ts");
const { parseLatexCompileLog } = require("../lib/latex/compile.ts");
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

function hasDisplayDelimiterIssue(result, delimiter) {
  return result.validationIssues.some((issue) => issue.message.includes(`Unmatched ${delimiter} display math delimiter`));
}

function maskVerbatimLike(value) {
  return value.replace(/(\\begin\{(?:verbatim|lstlisting)\})([\s\S]*?)(\\end\{(?:verbatim|lstlisting)\})/g, (_match, begin, body, end) => {
    return `${begin}${body.replace(/[^\n]/g, " ")}${end}`;
  });
}

function countRealDocumentclass(value) {
  return count(maskVerbatimLike(value), /\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/g);
}

function findRawFenceOutsideVerbatim(value) {
  const lines = value.split("\n");
  let protectedDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/\\begin\{(?:verbatim|lstlisting)\}/.test(line)) {
      protectedDepth += 1;
    }

    if (protectedDepth === 0 && line.includes("```")) {
      return { line: index + 1, text: line };
    }

    if (/\\end\{(?:verbatim|lstlisting)\}/.test(line) && protectedDepth > 0) {
      protectedDepth -= 1;
    }
  }

  return null;
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

const displayDelimiterValid = convertTextToLatex({
  text: String.raw`\[
x + y = z
\]`,
  filename: "display-delimiter-valid.tex"
});
assert(!hasDisplayDelimiterIssue(displayDelimiterValid, "\\["), "Test D2: valid display math should not report unmatched opener");
assert(!hasDisplayDelimiterIssue(displayDelimiterValid, "\\]"), "Test D2: valid display math should not report unmatched closer");

const casesRowSpacing = convertTextToLatex({
  text: String.raw`\[
\begin{cases}
a, & \text{if } x > 0, \\[4pt]
b, & \text{otherwise}
\end{cases}
\]`,
  filename: "cases-row-spacing.tex"
});
assertIncludes(casesRowSpacing.latex, String.raw`\\[4pt]`, "Test D3: cases row spacing should be preserved");
assert(!hasDisplayDelimiterIssue(casesRowSpacing, "\\["), "Test D3: row spacing should not report unmatched display opener");
assert(!hasDisplayDelimiterIssue(casesRowSpacing, "\\]"), "Test D3: row spacing should not report unmatched display closer");

const alignedRowSpacing = convertTextToLatex({
  text: String.raw`\[
\begin{aligned}
a &= b \\[8pt]
c &= d \\[4pt]
d &= e \\*[6pt]
e &= f \\[-3pt]
\end{aligned}
\]`,
  filename: "aligned-row-spacing.tex"
});
assertIncludes(alignedRowSpacing.latex, String.raw`\\[8pt]`, "Test D4: aligned row spacing 8pt should be preserved");
assertIncludes(alignedRowSpacing.latex, String.raw`\\[4pt]`, "Test D4: aligned row spacing 4pt should be preserved");
assertIncludes(alignedRowSpacing.latex, String.raw`\\*[6pt]`, "Test D4: aligned starred row spacing should be preserved");
assertIncludes(alignedRowSpacing.latex, String.raw`\\[-3pt]`, "Test D4: aligned negative row spacing should be preserved");
assert(!hasDisplayDelimiterIssue(alignedRowSpacing, "\\["), "Test D4: multiple row spacing commands should not report unmatched display opener");
assert(!hasDisplayDelimiterIssue(alignedRowSpacing, "\\]"), "Test D4: multiple row spacing commands should not report unmatched display closer");

const unmatchedDisplayOpener = convertTextToLatex({
  text: String.raw`\[
x + y = z`,
  filename: "unmatched-display-opener.tex"
});
assert(hasDisplayDelimiterIssue(unmatchedDisplayOpener, "\\["), "Test D5: real unmatched display opener should still fail");

const unmatchedDisplayCloser = convertTextToLatex({
  text: String.raw`x + y = z
\]`,
  filename: "unmatched-display-closer.tex"
});
assert(hasDisplayDelimiterIssue(unmatchedDisplayCloser, "\\]"), "Test D6: real unmatched display closer should still fail");

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

const latexDocumentationEnvironments = convertTextToLatex({
  text: String.raw`\documentclass{article}
\begin{document}
\begin{verse}
|\usepackage{tikz-cd}|
\end{verse}
\begin{environment}{tikzcd}
Documentation for an environment.
\end{environment}
\begin{pgfmanualentry}
Manual entry text.
\end{pgfmanualentry}
\begin{codeexample}
\begin{tikzcd}
A \arrow[r] & B
\end{tikzcd}
\end{codeexample}
\begin{command}{\arrow}
Command documentation.
\end{command}
\begin{stylekey}{/tikz/commutative diagrams/row sep}
Style key documentation.
\end{stylekey}
\begin{key}{/tikz/commutative diagrams/column sep}
Key documentation.
\end{key}
\begin{plainenvironment}{tikzcd}
Plain TeX environment docs.
\end{plainenvironment}
\begin{contextenvironment}{tikzcd}
ConTeXt environment docs.
\end{contextenvironment}
\begin{shape}
Shape docs.
\end{shape}
\begin{math-function}{Hom}
Math function documentation.
\end{math-function}
\begin{arrowtipsimple}{Rightarrow}
Arrow tip documentation.
\end{arrowtipsimple}
\end{document}`,
  filename: "latex-documentation-environments.tex"
});
assert(latexDocumentationEnvironments.metadata.status !== "failed", "Test H2: known documentation environments should not fail validation");
assert(!latexDocumentationEnvironments.validationIssues.some((issue) => /not in the converter's known environment list/.test(issue.message)), "Test H2: known documentation environments should not produce unknown-environment info");

const balancedUnknownEnvironment = convertTextToLatex({
  text: String.raw`\documentclass{article}
\begin{document}
\begin{custommanualblock}
Balanced custom documentation content.
\end{custommanualblock}
\end{document}`,
  filename: "balanced-unknown-environment.tex"
});
assert(balancedUnknownEnvironment.metadata.status !== "failed", "Test H3: balanced unknown environments should not fail conversion");
assert(balancedUnknownEnvironment.validationIssues.some((issue) => issue.severity === "info" && /custommanualblock/.test(issue.message)), "Test H3: balanced unknown environments should remain informational");

const mismatchedUnknownEnvironment = convertTextToLatex({
  text: String.raw`\documentclass{article}
\begin{document}
\begin{customunknown}
Broken custom documentation content.
\end{differentname}
\end{document}`,
  filename: "mismatched-unknown-environment.tex"
});
assert(mismatchedUnknownEnvironment.metadata.status === "validation-warning", "Test H4: mismatched unknown environments should produce validation-warning status");
assert(mismatchedUnknownEnvironment.validationIssues.some((issue) => issue.severity === "error" && /Unbalanced environment/.test(issue.message)), "Test H4: mismatched unknown environments should produce an unbalanced-environment error");

const unclosedUnknownEnvironment = convertTextToLatex({
  text: String.raw`\documentclass{article}
\begin{document}
\begin{customunknown}
Unclosed custom documentation content.
\end{document}`,
  filename: "unclosed-unknown-environment.tex"
});
assert(unclosedUnknownEnvironment.metadata.status === "validation-warning", "Test H5: unclosed unknown environments should produce validation-warning status");
assert(unclosedUnknownEnvironment.validationIssues.some((issue) => issue.severity === "error" && /(Unbalanced environment|has no matching)/.test(issue.message)), "Test H5: unclosed unknown environments should produce a structural environment error");

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
assertIncludes(z7Res4.latex, "Text extraction & false It fails \\\\", "Test Z7.4");

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

const z7Input8 = `Expected Behavior Check Table
Check Pass condition
Download Downloaded output must match preview output exactly.`;
const z7Res8 = convertTextToLatex({ text: z7Input8, filename: "z7-8.txt" });
assertIncludes(z7Res8.latex, "Downloaded output must match", "Test Z7.8: Should not hang and should preserve the text");

const z7Input9 = `Expected Behavior Check Table
Check Pass condition
| PDF upload | App accepts the file or clearly says PDF input is unsupported. |
| Text extraction | Backslashes, braces, underscores, dollar signs, and vertical bars are not silently corrupted. |
| Inline math | Real inline math such as \\( a^2+b^2=c^2 \\) remains real math. |
| Code blocks | Commands inside fenced code blocks remain literal text. |
| Tables | Markdown tables and LaTeX tables with \\( |x| \\) are reconstructed without confusing separators. |
| Validation | Missing END_TEST_MARKER_OMEGA_999 must fail conversion. |
| Download | Downloaded output must match preview output exactly. |`;
const z7Res9 = convertTextToLatex({ text: z7Input9, filename: "z7-9.txt" });
assertIncludes(z7Res9.latex, "Code blocks", "Test Z7.9: Should include Code blocks row");
assertIncludes(z7Res9.latex, "Tables", "Test Z7.9: Should include Tables row");
assertIncludes(z7Res9.latex, "Missing END\\_TEST\\_MARKER\\_OMEGA\\_999", "Test Z7.9: Should include Validation row");
assertIncludes(z7Res9.latex, "\\begin{tabular}{ll}", "Test Z7.9: Should use two columns {ll}");
assertExcludes(z7Res9.latex, "& x &", "Test Z7.9: Should not split on | inside math");
assertIncludes(z7Res9.latex, "\\( |x| \\)", "Test Z7.9: Should preserve \\( |x| \\) intact");
assertExcludes(z7Res9.latex, "a\\textasciicircum{}2", "Test Z7.9: Should not escape inline math in table cells");
assertIncludes(z7Res9.latex, "\\( a^2+b^2=c^2 \\)", "Test Z7.9: Should preserve \\( a^2+b^2=c^2 \\) intact");

if (/^\|.*\|$/m.test(z7Res9.latex)) {
  throw new Error("Test Z7.9 Failed: Leftover raw pipe rows found outside the table");
}

const ultraHardInput = fs.readFileSync(path.join(workspaceRoot, "fixtures", "ultra-hard-output-consistency-input.txt"), "utf8");
const ultraHardResult = convertTextToLatex({
  text: ultraHardInput,
  filename: "ultra-hard-output-consistency-input.txt"
});
assert(ultraHardResult.metadata.outputLength === ultraHardResult.latex.length, "Test Z8: metadata output length must match canonical LaTeX");
assert(/^[0-9a-f]{8}$/.test(ultraHardResult.metadata.outputChecksum), "Test Z8: output checksum should be present");
assertIncludes(ultraHardResult.latex, "ULTRA\\_FINAL\\_MARKER\\_SIGMA\\_777", "Test Z8: ultra final marker should be preserved in escaped LaTeX form");
const ultraRawFence = findRawFenceOutsideVerbatim(ultraHardResult.latex);
assert(!ultraRawFence, `Test Z8: raw fence outside verbatim/listing on line ${ultraRawFence?.line}: ${ultraRawFence?.text}`);
assert(count(ultraHardResult.latex, /\\begin\{verbatim\}/g) >= 5, "Test Z8: all fenced code block types should become verbatim blocks");
assertIncludes(ultraHardResult.latex, "\\begin{tabular}{ll}", "Test Z8: Expected Behavior table should use {ll}");
for (const rowLabel of ["Text input", "Inline math", "Display math", "Code blocks", "Markdown tables", "Validation", "Unicode", "Security", "Download"]) {
  assertIncludes(ultraHardResult.latex, `${rowLabel} &`, `Test Z8: Expected Behavior table should include ${rowLabel} row`);
}
assertIncludes(ultraHardResult.latex, "\\( a^2+b^2=c^2 \\)", "Test Z8: inline equation should stay inline in table");
assertIncludes(ultraHardResult.latex, "\\( |x| \\)", "Test Z8: absolute-value inline math should stay intact");
assertIncludes(ultraHardResult.latex, "\\( \\|x\\|_2 \\)", "Test Z8: norm inline math should stay intact");
assertExcludes(ultraHardResult.latex, "EXPECTED BEHAVIOR CHECK TABLE:", "Test Z8: raw Expected Behavior prose should be converted");
assertExcludes(ultraHardResult.latex, "| Text input |", "Test Z8: raw pipe row should not remain");
assert(!ultraHardResult.validationIssues.some((issue) => /Raw Markdown code fence/.test(issue.message)), "Test Z8: canonical validation should not report raw fences");

const advancedInput = fs.readFileSync(path.join(workspaceRoot, "fixtures", "advanced-latex-conversion-input.txt"), "utf8");
const advancedResult = convertTextToLatex({
  text: advancedInput,
  filename: "advanced-latex-conversion-input.txt"
});
assert(!advancedResult.validationIssues.some((issue) => issue.severity === "error"), "Test Z9: advanced LaTeX sample should have no fatal validation errors");
assertIncludes(advancedResult.latex, "\\usepackage{mathtools}", "Test Z9: mathtools should be required for advanced math structures");
assertIncludes(advancedResult.latex, "\\usepackage{tikz-cd}", "Test Z9: tikz-cd should be required for commutative diagrams");
assertIncludes(advancedResult.latex, "\\usepackage[version=4]{mhchem}", "Test Z9: mhchem should be required for chemistry");
for (const rawSymbol of ["Ω", "∂", "∇", "ε", "α₁", "ℝⁿ", "²", "₁"]) {
  assertExcludes(advancedResult.latex, rawSymbol, `Test Z9: raw Unicode math symbol ${rawSymbol} should be converted`);
}
assertIncludes(advancedResult.latex, "\\Omega", "Test Z9: Omega should be converted");
assertIncludes(advancedResult.latex, "\\partial \\Omega", "Test Z9: partial boundary should be converted");
assertIncludes(advancedResult.latex, "\\nabla", "Test Z9: nabla should be converted");
assertIncludes(advancedResult.latex, "\\varepsilon^{2}", "Test Z9: epsilon squared should be converted");
assertIncludes(advancedResult.latex, "\\alpha_{1}", "Test Z9: alpha subscript should be converted");
assertIncludes(advancedResult.latex, "\\mathbb{R}^{n}", "Test Z9: R superscript n should be converted");
assertIncludes(advancedResult.latex, "\\begin{aligned}", "Test Z9: equation system should use aligned");
assertIncludes(advancedResult.latex, "a &= b + c", "Test Z9: first equation system row should be aligned");
assertIncludes(advancedResult.latex, "f(x) &= x^{2} + \\varepsilon^{2}", "Test Z9: second equation system row should be aligned");
assertIncludes(advancedResult.latex, "\\begin{bmatrix}", "Test Z9: matrix should use bmatrix");
assertIncludes(advancedResult.latex, "\\alpha_{1} & \\beta_{2}", "Test Z9: matrix entries should convert Unicode scripts");
assertIncludes(advancedResult.latex, "\\begin{vmatrix}", "Test Z9: determinant should use vmatrix");
assertIncludes(advancedResult.latex, "\\begin{cases}", "Test Z9: piecewise function should use cases");
assertIncludes(advancedResult.latex, "C \\geq 0.90", "Test Z9: piecewise condition should convert >= Unicode");
assertIncludes(advancedResult.latex, "\\ce{2H2 + O2 -> 2H2O}", "Test Z9: chemistry should use mhchem ce");
assertIncludes(advancedResult.latex, "\\begin{tikzcd}", "Test Z9: commutative diagram should use tikzcd");
assertExcludes(advancedResult.latex, "\\begin{itemize}", "Test Z9: leading minus math line should not become itemize");
assertIncludes(advancedResult.latex, "- x^{2} + y^{2} = z^{2}", "Test Z9: leading minus math line should remain math");

const latexCodeExamplePrompt = convertTextToLatex({
  text: String.raw`Use a preamble like:
\documentclass[12pt]{article}
\usepackage{amsmath}
\begin{document}
Hello
\end{document}`,
  filename: "latex-code-example-prompt.txt"
});
assert(!latexCodeExamplePrompt.validationIssues.some((issue) => /Duplicate \\documentclass|Duplicate \\begin\{document\}|Duplicate \\end\{document\}|Document-level LaTeX command/.test(issue.message)), "Test Z10: LaTeX code example should not create document-level validation errors");
assert(countRealDocumentclass(latexCodeExamplePrompt.latex) === 1, "Test Z10: generated output should contain exactly one real documentclass");
assert(latexCodeExamplePrompt.latex.includes("\\begin{verbatim}") || latexCodeExamplePrompt.latex.includes("\\textbackslash{}documentclass"), "Test Z10: example documentclass should be protected as code or escaped text");

const documentBodyOnlyExample = convertTextToLatex({
  text: String.raw`Example body:
\title{Demo}
\author{Name}
\date{May 2026}
\begin{document}
Hello
\end{document}`,
  filename: "document-body-only-example.txt"
});
assert(!documentBodyOnlyExample.validationIssues.some((issue) => /Duplicate \\begin\{document\}|Duplicate \\end\{document\}|Document-level LaTeX command/.test(issue.message)), "Test Z10b: document body example should be converted to literal code before validation");
assertIncludes(documentBodyOnlyExample.latex, "\\begin{verbatim}", "Test Z10b: document-level body commands should be protected as verbatim");
assert(countRealDocumentclass(documentBodyOnlyExample.latex) === 1, "Test Z10b: body-only example should keep only the generated real documentclass");

const hardMathSample = convertTextToLatex({
  text: String.raw`The almost-impossible test document

Let Ω ⊂ ℝⁿ be a bounded C²-domain and let x₁ ∈ Ω with ε² > 0.

Equation System:
a = b + c
f(x) = x² + ε²

Matrix Representation:
A = [ [α₁, β₂], [γ₃, δ₄] ]

Q(D) = 1 if C ≥ 0.90
Q(D) = 0 if C < 0.90

Chemistry:
2H2 + O2 -> 2H2O

Commutative Diagram:
A -> B
↓    ↓
C -> D

- x² + y² = z²`,
  filename: "almost-impossible-hard-math-sample.txt"
});
assert(!hardMathSample.validationIssues.some((issue) => issue.severity === "error"), "Test Z11: hard math sample should have no fatal validation errors");
assert(countRealDocumentclass(hardMathSample.latex) === 1, "Test Z11: hard math sample should contain exactly one real documentclass");
for (const rawSymbol of ["Ω", "⊂", "ℝⁿ", "x₁", "ε²", "α₁"]) {
  assertExcludes(hardMathSample.latex, rawSymbol, `Test Z11: raw Unicode math symbol ${rawSymbol} should be converted`);
}
assertIncludes(hardMathSample.latex, "\\Omega", "Test Z11: Omega should be converted");
assertIncludes(hardMathSample.latex, "\\mathbb{R}^{n}", "Test Z11: R^n should be converted");
assertIncludes(hardMathSample.latex, "\\begin{bmatrix}", "Test Z11: matrix should use bmatrix");
assertIncludes(hardMathSample.latex, "\\begin{cases}", "Test Z11: piecewise should use cases");
assertIncludes(hardMathSample.latex, "\\ce{2H2 + O2 -> 2H2O}", "Test Z11: chemistry should use mhchem ce");
assertIncludes(hardMathSample.latex, "\\begin{tikzcd}", "Test Z11: diagram should use tikzcd");
assertExcludes(hardMathSample.latex, "\\begin{itemize}", "Test Z11: minus math lines should not become itemize");

const almostImpossibleRowSpacing = convertTextToLatex({
  text: String.raw`\[
\begin{aligned}
\partial_t u &= \Delta u \\[8pt]
\nabla u \cdot n &= 0 \\[4pt]
\end{aligned}
\]

\[
\begin{cases}
u_0, & x \in \Omega, \\[4pt]
0, & x \notin \Omega.
\end{cases}
\]`,
  filename: "almost-impossible-row-spacing.tex"
});
assertIncludes(almostImpossibleRowSpacing.latex, "\\\\[8pt]", "Test Z11b: 8pt row spacing should be preserved");
assertIncludes(almostImpossibleRowSpacing.latex, "\\\\[4pt]", "Test Z11b: 4pt row spacing should be preserved");
assert(!hasDisplayDelimiterIssue(almostImpossibleRowSpacing, "\\["), "Test Z11b: row spacing should not create false unmatched display opener errors");
assert(!hasDisplayDelimiterIssue(almostImpossibleRowSpacing, "\\]"), "Test Z11b: row spacing should not create false unmatched display closer errors");

const fencedLatexCodeExample = convertTextToLatex({
  text: "Here is literal source:\n\n```latex\n\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHi\n\\end{document}\n```",
  filename: "fenced-latex-code-example.txt"
});
assert(!fencedLatexCodeExample.validationIssues.some((issue) => /Duplicate \\documentclass|Duplicate \\begin\{document\}|Duplicate \\end\{document\}|Document-level LaTeX command/.test(issue.message)), "Test Z12: fenced LaTeX code should not execute as structure");
assertIncludes(fencedLatexCodeExample.latex, "\\begin{verbatim}", "Test Z12: fenced LaTeX should become verbatim");
assert(countRealDocumentclass(fencedLatexCodeExample.latex) === 1, "Test Z12: fenced example should not add a second real documentclass");

const quantikzLibrarySource = fs.readFileSync(path.join("fixtures", "tikzlibraryquantikz2.code.tex"), "utf8");
const quantikzManualSource = fs.readFileSync(path.join("fixtures", "quantikz_manual_new.tex"), "utf8");
assert(classifyLatexFile(quantikzLibrarySource, "tikzlibraryquantikz2.code.tex").fileRole === "dependency-library", "Test AA0: classifier should recognize Quantikz library dependency");
assert(classifyLatexFile(quantikzManualSource, "quantikz_manual_new.tex").fileRole === "full-document", "Test AA0: classifier should recognize Quantikz manual main document");

const quantikzLibrary = convertTextToLatex({
  text: quantikzLibrarySource,
  filename: "tikzlibraryquantikz2.code.tex",
  conversionMode: "display-source"
});
assert(quantikzLibrary.metadata.fileRole === "dependency-library", "Test AA1: tikzlibrary*.code.tex should be classified as dependency-library");
assert(quantikzLibrary.metadata.outputType === "raw-source", "Test AA1: dependency library output should be raw source");
assert(quantikzLibrary.metadata.status === "preserved", "Test AA1: dependency library should be preserved, not failed");
assert(quantikzLibrary.latex === quantikzLibrarySource, "Test AA1: dependency library source should be preserved exactly");
assertExcludes(quantikzLibrary.latex, "\\documentclass", "Test AA1: dependency library should not receive documentclass");
assertExcludes(quantikzLibrary.latex, "\\maketitle", "Test AA1: dependency library should not receive maketitle");
assert(quantikzLibrary.validationIssues.some((issue) => /Dependency file detected/.test(issue.message)), "Test AA1: dependency library should explain how to use it");

const quantikzManual = convertTextToLatex({
  text: quantikzManualSource,
  filename: "quantikz_manual_new.tex",
  conversionMode: "recover-raw"
});
assert(quantikzManual.metadata.fileRole === "full-document", "Test AA2: quantikz manual should be classified as full-document");
assert(quantikzManual.metadata.inputType === "latex-document", "Test AA2: quantikz manual should remain a LaTeX document");
assertIncludes(quantikzManual.latex, "\\documentclass[aps,prx,reprint]{revtex4-2}", "Test AA2: revtex documentclass should be preserved");
assertIncludes(quantikzManual.latex, "%\\documentclass{article}", "Test AA2: commented documentclass should be preserved as source");
assertIncludes(quantikzManual.latex, "\\usetikzlibrary{quantikz2}", "Test AA2: quantikz tikz library import should be preserved");
assertIncludes(quantikzManual.latex, "\\newtcblisting{Code}", "Test AA2: custom Code/tcolorbox environment should be preserved");
assertIncludes(quantikzManual.latex, "\\NewTCBListing{FullCode}", "Test AA2: custom FullCode/tcolorbox environment should be preserved");
assertIncludes(quantikzManual.latex, "\\begin{quantikz}", "Test AA2: quantikz examples should be preserved");
assert(quantikzManual.metadata.status === "preserved", "Test AA2: skipped compile with clean static validation should remain preserved");
assert(!quantikzManual.validationIssues.some((issue) => /Duplicate \\documentclass/.test(issue.message)), "Test AA2: commented documentclass should not be counted as duplicate");
assert(!quantikzManual.validationIssues.some((issue) => /Environment \"(?:Code|FullCode|quantikz)\"/.test(issue.message)), "Test AA2: Code, FullCode, and quantikz should be treated as known");

for (const [filename, source, role] of [
  ["package-test.sty", "\\ProvidesPackage{package-test}\\NewDocumentCommand{\\foo}{}{bar}", "dependency-library"],
  ["class-test.cls", "\\ProvidesClass{class-test}\\RequirePackage{article}", "dependency-library"],
  ["biblatex-test.bbx", "\\ProvidesFile{biblatex-test.bbx}\\RequireBibliographyStyle{standard}", "dependency-library"],
  ["biblatex-test.cbx", "\\ProvidesFile{biblatex-test.cbx}\\RequireCitationStyle{numeric}", "dependency-library"],
  ["references.bib", "@article{key, title={A Paper}, author={A. Author}, year={2026}}", "bibliography"]
]) {
  const result = convertTextToLatex({ text: source, filename, conversionMode: "recover-raw" });
  assert(result.metadata.fileRole === role, `Test AA3: ${filename} should be classified as ${role}`);
  assert(result.latex === source, `Test AA3: ${filename} should be preserved as raw source`);
  assert(result.metadata.status === "preserved", `Test AA3: ${filename} should not fail`);
}

const fragmentSource = String.raw`\begin{quantikz}
\lstick{\ket{0}} & \gate{H}
\end{quantikz}`;
const rawFragment = convertTextToLatex({ text: fragmentSource, filename: "circuit.tex", conversionMode: "recover-raw" });
assert(rawFragment.metadata.fileRole === "fragment", "Test AA4: standalone quantikz should be classified as fragment");
assert(rawFragment.latex === fragmentSource, "Test AA4: recover-raw fragment should preserve exactly");
const compileReadyFragment = convertTextToLatex({ text: fragmentSource, filename: "circuit.tex", conversionMode: "compile-ready" });
assertIncludes(compileReadyFragment.latex, "\\documentclass[12pt]{article}", "Test AA4: compile-ready fragment should receive minimal preamble");
assertIncludes(compileReadyFragment.latex, fragmentSource, "Test AA4: compile-ready fragment should include original fragment body");

const quantikzProject = convertLatexProject({
  files: [
    { filename: "quantikz_manual_new.tex", text: quantikzManualSource },
    { filename: "tikzlibraryquantikz2.code.tex", text: quantikzLibrarySource }
  ],
  conversionMode: "compile-ready"
});
assert(quantikzProject.metadata.projectRole === "project", "Test AA5: multi-file upload should be marked as project");
assert(quantikzProject.projectFiles?.some((file) => file.filename === "quantikz_manual_new.tex" && file.projectRole === "main-document"), "Test AA5: project should identify main document");
assert(quantikzProject.projectFiles?.some((file) => file.filename === "tikzlibraryquantikz2.code.tex" && file.projectRole === "dependency"), "Test AA5: project should identify dependency file");
assertIncludes(quantikzProject.latex, "\\documentclass[aps,prx,reprint]{revtex4-2}", "Test AA5: project output should preview the main document");
assertExcludes(quantikzProject.latex, "\\ProvidesFile{tikzlibraryquantikz2.code.tex}", "Test AA5: dependency source should not be merged into main body");
assert(["success", "failed", "unavailable"].includes(quantikzProject.metadata.compileResult?.status ?? ""), "Test AA5: project should report compile validation state");

const missingQuantikzProject = convertLatexProject({
  files: [{ filename: "quantikz_manual_new.tex", text: quantikzManualSource }],
  conversionMode: "compile-ready"
});
assert(missingQuantikzProject.metadata.compileResult?.status === "failed", "Test AA6: missing tikz library dependency should be reported as compile failure");
assert(missingQuantikzProject.metadata.compileResult?.missingFile === "tikzlibraryquantikz2.code.tex", "Test AA6: missing dependency filename should be reported");

const parsedCompileError = parseLatexCompileLog("! LaTeX Error: File `tikzlibraryquantikz2.code.tex' not found.\nl.17 \\\\begin{document}");
assert(parsedCompileError.missingFile === "tikzlibraryquantikz2.code.tex", "Test AA7: compile log parser should extract missing file");
assert(parsedCompileError.line === 17, "Test AA7: compile log parser should extract line number");

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
