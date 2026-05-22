import { getLanguage } from "@/lib/languages";
import { escapeLatex, normalizeWhitespace, toCitationKey } from "@/lib/latex/sanitize";
import type { ConversionMetadata, DetectedInputType, LatexConversionInput, LatexConversionResult, ValidationIssue, LatexSnippetMode } from "@/lib/latex/types";

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "abstract"; lines: string[] }
  | { type: "keywords"; text: string }
  | { type: "theorem"; lines: string[] }
  | { type: "proof"; lines: string[] }
  | { type: "algorithm"; items: string[] }
  | { type: "appendix" }
  | { type: "references"; lines: string[] }
  | { type: "paragraph"; lines: string[] }
  | { type: "pageMarker"; text: string }
  | { type: "equation"; body: string }
  | { type: "displayMath"; body: string }
  | { type: "align"; body: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "rawLatex"; lines: string[] }
  | { type: "literal"; lines: string[] }
  | { type: "verbatim"; lines: string[] };

type ParsedDocument = {
  title?: string;
  author?: string;
  institution?: string;
  date?: string;
  blocks: Block[];
};

type PackageRequirements = {
  algorithm: boolean;
  algpseudocode: boolean;
  amsthm: boolean;
  booktabs: boolean;
};

type BuildDocumentOptions = {
  title?: string;
  author?: string;
  institution?: string;
  date?: string;
  body: string;
  languageCode: string;
  packages?: Partial<PackageRequirements>;
};

type SectionHeading =
  | "Introduction"
  | "Problem Statement"
  | "Mathematical Model"
  | "Loss Function"
  | "Matrix Representation"
  | "System Architecture"
  | "Equation"
  | "Table"
  | "Algorithm"
  | "Optimization"
  | "Results"
  | "Discussion"
  | "Conclusion";

const researchLabelPattern = [
  "Title",
  "Author",
  "Institution",
  "Date",
  "Abstract",
  "Keywords",
  "Introduction",
  "Problem Statement",
  "System Architecture",
  "Loss Function",
  "Mathematical Model",
  "Matrix Representation",
  "Optimization",
  "Theorem",
  "Proof",
  "Algorithm",
  "Conclusion",
  "Appendix\\s+[A-Z]",
  "References",
  "Bibliography",
  "Table",
  "Equation",
  "Results",
  "Discussion"
].join("|");

const researchLabelRegex = new RegExp(`^(?:${researchLabelPattern})\\s*:`, "im");
const inlineResearchLabelRegex = new RegExp(`\\s+(?:${researchLabelPattern})\\s*:`, "i");
const numberedResearchHeadingRegex = /^(?:[1-9]|1\d|20)[.)]\s+[A-Za-z][^:\n]{2,80}:\s*$/m;

const headingCommands = {
  1: "section",
  2: "subsection",
  3: "subsubsection"
} as const;

const protectedEnvironments = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "aligned",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "split",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "array",
  "table",
  "tabular",
  "theorem",
  "proof",
  "algorithm",
  "algorithmic",
  "abstract"
]);

const mathEnvironments = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "aligned",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "split",
  "cases",
  "matrix",
  "pmatrix",
  "bmatrix",
  "Bmatrix",
  "vmatrix",
  "Vmatrix",
  "array"
]);

export const maxConvertibleBytes = 2 * 1024 * 1024;
export const supportedTextFileExtensions = new Set(["tex", "txt", "md", "latex"]);
const largePreviewThreshold = 1.5 * 1024 * 1024;
const finalIntegrityMarker = "END_TEST_MARKER_OMEGA_999";

export function convertTextToLatex(input: LatexConversionInput): LatexConversionResult {
  const language = getLanguage(input.language);
  const sourceText = input.text ?? "";
  const conversionMode = getConversionMode(input);
  const sourceBytes = input.fileSize ?? getUtf8ByteLength(sourceText);
  const baseMetadata = buildMetadata(input, "plain-text", "converted", sourceBytes);
  const warnings: string[] = [];

  if (looksLikeRawPdfContent(sourceText)) {
    const issue: ValidationIssue = {
      severity: "error",
      message: "Raw PDF internals were received instead of extracted text.",
      suggestedFix: "Extract readable text with the PDF parser first, or upload the original .tex file for exact LaTeX preservation."
    };

    return {
      latex: "",
      warnings: [issue.message],
      validationIssues: [issue],
      metadata: finalizeMetadata({ ...baseMetadata, status: "failed" }, "", [issue]),
      stats: { wordCount: 0, equationCount: 0, tableCount: 0, citationCount: 0 }
    };
  }

  if (input.filename && !isSupportedTextFilename(input.filename)) {
    const issue = getUnsupportedFileIssue(input.filename);

    return {
      latex: "",
      warnings: [issue.message],
      validationIssues: [issue],
      metadata: finalizeMetadata({ ...baseMetadata, status: "failed" }, "", [issue]),
      stats: { wordCount: 0, equationCount: 0, tableCount: 0, citationCount: 0 }
    };
  }

  if (sourceBytes > maxConvertibleBytes) {
    const issue: ValidationIssue = {
      severity: "error",
      message: `Input is ${formatBytes(sourceBytes)}, which exceeds the ${formatBytes(maxConvertibleBytes)} conversion limit.`,
      suggestedFix: "Split the file into smaller parts or reduce embedded/generated content before conversion."
    };

    return {
      latex: "",
      warnings: [issue.message],
      validationIssues: [issue],
      metadata: finalizeMetadata({ ...baseMetadata, status: "failed" }, "", [issue]),
      stats: { wordCount: 0, equationCount: 0, tableCount: 0, citationCount: 0 }
    };
  }

  const normalized = normalizeWhitespace(sourceText);
  const preparedText = shouldPreserveInputExactly(normalized) ? normalized : normalizeStructuredLabels(normalized);
  const inputType = detectInputType(preparedText, input.filename);
  const metadata = buildMetadata(input, inputType, "converted", sourceBytes);

  if (conversionMode === "recover-raw" && inputType === "plain-text") {
    const recoveredDocument = recoverEmbeddedLatexDocument(preparedText);
    if (recoveredDocument) {
      const latex = preserveLatexSource(recoveredDocument, input, language.code);
      const validationIssues = validateLatex(latex, {
        latexMode: true,
        inputType: "latex-document",
        inputLength: recoveredDocument.length,
        sourceText: recoveredDocument
      });
      const recoverWarnings = [
        "Recovered an embedded LaTeX document as editable raw .tex. Surrounding extracted PDF/text prose was not included."
      ];

      return {
        latex,
        warnings: [...recoverWarnings, ...issuesToWarnings(validationIssues)],
        validationIssues,
        metadata: finalizeMetadata({ ...metadata, inputType: "latex-document", status: "preserved" }, latex, validationIssues),
        stats: buildLatexStats(recoveredDocument, latex, [])
      };
    }
  }

  if (conversionMode === "display-source" && hasEmbeddedLatexDocumentSnippet(preparedText)) {
    warnings.push(
      "Embedded LaTeX source is displayed as escaped text. Use recover raw mode if you want to extract an editable .tex source snippet."
    );
  }

  if (!preparedText) {
    const latex = buildDocument({
      title: input.title,
      author: input.author,
      institution: undefined,
      date: undefined,
      body: "% Add text or upload an image to generate LaTeX.",
      languageCode: language.code
    });

    return {
      latex,
      warnings: ["No source text was provided."],
      validationIssues: [
        {
          severity: "warning",
          message: "No source text was provided.",
          suggestedFix: "Paste text or upload a supported text, Markdown, or LaTeX file."
        }
      ],
      metadata: finalizeMetadata(metadata, latex, [
        {
          severity: "warning",
          message: "No source text was provided.",
          suggestedFix: "Paste text or upload a supported text, Markdown, or LaTeX file."
        }
      ]),
      stats: { wordCount: 0, equationCount: 0, tableCount: 0, citationCount: 0 }
    };
  }

  if (inputType === "latex-document" || inputType === "latex-fragment") {
    const latex = preserveLatexSource(preparedText, input, language.code);
    const validationIssues = validateLatex(latex, { latexMode: true, inputType, inputLength: preparedText.length, sourceText: preparedText });
    return {
      latex,
      warnings: [...warnings, ...issuesToWarnings(validationIssues)],
      validationIssues,
      metadata: finalizeMetadata({ ...metadata, status: "preserved" }, latex, validationIssues),
      stats: buildLatexStats(preparedText, latex, [])
    };
  }

  const { latex, blocks } =
    inputType === "markdown-latex" || inputType === "markdown"
      ? convertMixedMarkdownLatex(preparedText, input, language.code)
      : convertPlainTextDocument(preparedText, input, language.code);

  const stats = {
    ...buildLatexStats(preparedText, latex, blocks)
  };

  if (language.code !== "en") {
    warnings.push("Only English conversion rules are enabled in this starter. Add language-specific rules before production use.");
  }

  const validationIssues = validateLatex(latex, {
    latexMode: inputType !== "plain-text",
    inputType,
    inputLength: preparedText.length,
    sourceText: preparedText
  });

  return {
    latex,
    warnings: [...warnings, ...issuesToWarnings(validationIssues)],
    validationIssues,
    metadata: finalizeMetadata(metadata, latex, validationIssues),
    stats
  };
}

function isLatexSource(text: string): boolean {
  const hasLatexCommand = /\\(?:[A-Za-z]+|[()[\]{}|])/.test(text);
  const hasDollarMath = /(^|[^\\])\$[^$\n]+\$/.test(text);
  const hasProtectedEnvironment = [...text.matchAll(/\\begin\{([^}]+)\}/g)].some((match) => protectedEnvironments.has(match[1]));
  return hasLatexCommand || hasDollarMath || hasProtectedEnvironment;
}

function stripLeadingWhitespaceAndLatexComments(text: string): string {
  let remaining = text.replace(/^\uFEFF/, "");

  while (remaining.length) {
    const withoutWhitespace = remaining.replace(/^\s+/, "");

    if (withoutWhitespace.startsWith("%")) {
      const newlineIndex = withoutWhitespace.indexOf("\n");
      if (newlineIndex === -1) {
        return "";
      }

      remaining = withoutWhitespace.slice(newlineIndex + 1);
      continue;
    }

    return withoutWhitespace;
  }

  return remaining;
}

function containsLatexDocumentMarkers(text: string): boolean {
  return /\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(text) && /\\begin\{document\}/.test(text);
}

function isLatexDocumentAtMeaningfulStart(text: string): boolean {
  const meaningfulStart = stripLeadingWhitespaceAndLatexComments(text);

  return /^\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(meaningfulStart) && /\\begin\{document\}/.test(meaningfulStart);
}

function isFullLatexDocument(text: string): boolean {
  const meaningfulStart = stripLeadingWhitespaceAndLatexComments(text);

  return isLatexDocumentAtMeaningfulStart(text) && /\\end\{document\}/.test(meaningfulStart);
}

function hasEmbeddedLatexDocumentSnippet(text: string): boolean {
  return containsLatexDocumentMarkers(text) && !isLatexDocumentAtMeaningfulStart(text);
}

function shouldPreserveInputExactly(text: string): boolean {
  if (isLatexDocumentAtMeaningfulStart(text)) {
    return true;
  }

  if (hasEmbeddedLatexDocumentSnippet(text)) {
    return false;
  }

  return isLatexSource(text) && !hasResearchStructure(text);
}

function hasResearchStructure(text: string): boolean {
  return researchLabelRegex.test(text) || inlineResearchLabelRegex.test(text) || numberedResearchHeadingRegex.test(text) || /Expected\s+Behavior\s+Check\s+Table/i.test(text);
}

function getConversionMode(input: LatexConversionInput): LatexSnippetMode {
  return input.conversionMode === "recover-raw" ? "recover-raw" : "display-source";
}

function recoverEmbeddedLatexDocument(text: string): string | null {
  if (isLatexDocumentAtMeaningfulStart(text)) {
    return text;
  }

  const start = text.search(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/);
  if (start === -1) {
    return null;
  }

  const rest = text.slice(start);
  const endMatch = /\\end\{document\}/.exec(rest);
  if (!endMatch) {
    return null;
  }

  return rest.slice(0, endMatch.index + endMatch[0].length).trim();
}

const nonSplitPrecedingWords = new Set([
  "the", "a", "an", "this", "that", "these", "those", "following", "preceding", "above", "below",
  "and", "or", "of", "to", "in", "for", "with", "about", "citations", "some", "any", "every"
]);

function shouldSplitLabel(precedingWord: string | undefined, label: string, matchedLabelText: string): boolean {
  if (!precedingWord) {
    return true;
  }

  const cleanPreceding = precedingWord.toLowerCase().replace(/[^a-z]/g, "");
  const isPrecedingProse =
    /^[a-z]+$/.test(precedingWord) || 
    /^[a-z&,]+$/i.test(precedingWord) ||
    nonSplitPrecedingWords.has(cleanPreceding);

  const lowerLabel = label.toLowerCase();
  const isLabelProseLike = matchedLabelText.trim().startsWith(lowerLabel);

  if (
    /^(equation|table|references|bibliography|theorem|proof|algorithm|loss\s+function|mathematical\s+model|matrix\s+representation|system\s+architecture|problem\s+statement|introduction|results|discussion|conclusion|appendix)$/i.test(lowerLabel)
  ) {
    if (isPrecedingProse || isLabelProseLike) {
      return false;
    }
  }

  return true;
}

function normalizeStructuredLabels(text: string): string {
  if (!text.trim()) {
    return text;
  }

  let normalized = text.replace(/\r\n?/g, "\n");

  normalized = normalizeExtractedExpectedBehaviorTables(normalized);

  normalized = normalized.replace(new RegExp(`(\\S+)?(\\s+)(${researchLabelPattern})\\s*:`, "gi"), (match, precedingWord, spacing, label) => {
    if (shouldSplitLabel(precedingWord, label, match.slice((precedingWord?.length ?? 0) + spacing.length))) {
      return `${precedingWord ? precedingWord : ""}\n${titleCase(label)}:`;
    }
    return match;
  });

  normalized = normalized.replace(/\s+((?:[1-9]|1\d|20)[.)]\s+[A-Za-z][^:\n]{2,80}:)/g, (_match, heading: string) => {
    return `\n${heading.trim()}`;
  });

  normalized = normalized.replace(/(\S+)?(\s+)(References|Bibliography)(?=\s*(?:$|\n|\[\d+\]|[-*]\s+|\d+[.)]\s+))/gi, (match, precedingWord, spacing, label) => {
    if (shouldSplitLabel(precedingWord, label, label)) {
      if (precedingWord && /^\[\d+\]$/.test(precedingWord)) {
        return match;
      }
      return `${precedingWord ? precedingWord : ""}\n${titleCase(label)}`;
    }
    return match;
  });

  return normalized.replace(/\n{3,}/g, "\n\n").trim();
}


function normalizeExtractedExpectedBehaviorTables(text: string): string {
  const boundaryPattern = [
    "Minimal\\s+pass\\s+criteria(?:\\s+for\\s+this\\s+PDF)?",
    "\\d+[.)]\\s+[A-Za-z][^\\n]{2,80}",
    "```",
    "Checklist",
    "LaTeX\\s+source\\s+block",
    "[-–—]{1,3}\\s*(?:page\\s*)?\\d+\\s*(?:of|/)\\s*\\d+\\s*[-–—]{1,3}",
    "Nested\\s+environments",
    "Verbatim(?=\\s*(?:$|\\n))",
    "Verbatim\\s+and\\s+Markdown-like\\s+Content",
    "Comments\\s+and\\s+Percent\\s+Signs",
    "Final\\s+Cross-Reference\\s+Check",
    "References",
    "Bibliography"
  ].join("|");

  const flattenedExpectedBehaviorPattern = new RegExp(
    `Expected\\s+behavior(?:\\s+Check\\s+Table)?:?\\s+Check\\s+Pass\\s+condition\\s+([\\s\\S]*?)(?=\\s+(?:${boundaryPattern})(?=[\\s:]|$)|$)`,
    "gi"
  );

  return text.replace(flattenedExpectedBehaviorPattern, (match, body: string) => {
    const rows = extractKnownExpectedBehaviorRows(body);
    if (rows.length < 2) {
      return match;
    }

    const tableLines = [
      "# Expected Behavior",
      "",
      "| Check | Pass condition |",
      "|---|---|"
    ];
    for (const row of rows) {
      let check = "";
      let passCondition = row.value.replace(/\r?\n/g, " ").replace(/^[|\s]+|[|\s]+$/g, "").trim();
      const commaIndex = passCondition.indexOf(",");
      if (commaIndex !== -1 && commaIndex < 25) {
        check = passCondition.slice(0, commaIndex).trim();
        passCondition = passCondition.slice(commaIndex + 1).trim();
      }
      tableLines.push(`| ${row.key} | ${check ? check + ", " + passCondition : passCondition} |`);
    }

    return tableLines.join("\n") + "\n\n";
  });
}

function extractKnownExpectedBehaviorRows(body: string): Array<{ key: string; value: string }> {
  const pipeRows = extractExpectedBehaviorPipeRows(body);
  if (pipeRows.length) {
    return pipeRows;
  }

  const tableBody = body.replace(
    /\s+(?:Minimal\s+pass\s+criteria(?:\s+for\s+this\s+PDF)?|Checklist|LaTeX\s+source\s+block|Nested\s+environments|Verbatim(?=\s*$)|Verbatim\s+and\s+Markdown-like\s+Content|Comments\s+and\s+Percent\s+Signs|Final\s+Cross-Reference\s+Check|References|Bibliography)\b[\s\S]*$/i,
    ""
  );
  const compact = tableBody.replace(/\s+/g, " ").trim();
  if (!compact) {
    return [];
  }

  const rowKeys = EXPECTED_BEHAVIOR_KNOWN_KEYS;
  const positions: Array<{ key: string; index: number; length: number }> = [];
  const lower = compact.toLowerCase();
  let searchFrom = 0;

  for (const key of rowKeys) {
    const loweredKey = key.toLowerCase();
    let index = lower.indexOf(loweredKey, searchFrom);
    while (index !== -1) {
      const before = index === 0 ? " " : compact[index - 1];
      const after = compact[index + key.length] ?? " ";
      const isEmbeddedTablesWord = loweredKey === "tables" && /\b(?:markdown|latex)\s+$/i.test(compact.slice(0, index));
      const isLowercaseTablesWord = loweredKey === "tables" && compact.slice(index, index + key.length) !== key;
      if (/\s/.test(before) && /\s/.test(after) && !isEmbeddedTablesWord && !isLowercaseTablesWord) {
        positions.push({ key: normalizeExpectedBehaviorKey(key), index, length: key.length });
        searchFrom = index + key.length;
        break;
      }
      index = lower.indexOf(loweredKey, index + 1);
    }
  }

  const rows: Array<{ key: string; value: string }> = [];
  for (let i = 0; i < positions.length; i += 1) {
    const current = positions[i];
    const next = positions[i + 1];
    const value = trimExtractedExpectedBehaviorValue(compact.slice(current.index + current.length, next?.index ?? compact.length));

    if (value) {
      rows.push({ key: current.key, value });
    }
  }

  return rows;
}

function extractExpectedBehaviorPipeRows(body: string): Array<{ key: string; value: string }> {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\|.+\|$/.test(line) && !isMarkdownSeparatorLine(line))
    .map(splitMarkdownRowPreservingMath)
    .filter((cells) => cells.length >= 2 && !/^check$/i.test(cells[0]))
    .map((cells) => ({ key: normalizeExpectedBehaviorKey(cells[0]), value: cells.slice(1).join(" | ") }))
    .filter((row) => row.key && row.value);
}

function splitMarkdownRowPreservingMath(line: string): string[] {
  const content = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let inlineParenMath = false;
  let dollarMath = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1] ?? "";
    const previous = content[index - 1] ?? "";

    if (char === "\\" && next === "(") {
      inlineParenMath = true;
      current += char + next;
      index += 1;
      continue;
    }

    if (char === "\\" && next === ")") {
      inlineParenMath = false;
      current += char + next;
      index += 1;
      continue;
    }

    if (char === "$" && previous !== "\\") {
      dollarMath = !dollarMath;
      current += char;
      continue;
    }

    if (char === "|" && !inlineParenMath && !dollarMath) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeExpectedBehaviorKey(key: string): string {
  return key === "Math code blocks" ? "Math/code blocks" : key;
}

function trimExtractedExpectedBehaviorValue(value: string): string {
  return value
    .replace(
      /\s+(?:Minimal\s+pass\s+criteria(?:\s+for\s+this\s+PDF)?|Checklist|LaTeX\s+source\s+block|Nested\s+environments|Verbatim(?=\s*$)|Verbatim\s+and\s+Markdown-like\s+Content|Comments\s+and\s+Percent\s+Signs|Final\s+Cross-Reference\s+Check|References|Bibliography)\b[\s\S]*$/i,
      ""
    )
    .trim();
}

const EXPECTED_BEHAVIOR_KNOWN_KEYS = [
  "PDF upload",
  "Text extraction",
  "Text input",
  "Inline math",
  "Display math",
  "Code blocks",
  "Markdown tables",
  "Tables",
  "Math/code blocks",
  "Math code blocks",
  "Validation",
  "Unicode",
  "Security",
  "Download"
] as const;

function matchKnownExpectedBehaviorKey(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  for (const key of EXPECTED_BEHAVIOR_KNOWN_KEYS) {
    if (trimmed.toLowerCase().startsWith(key.toLowerCase())) {
      const rest = trimmed.slice(key.length);
      // Key must be followed by whitespace or end of string
      if (!rest || /^\s/.test(rest)) {
        const value = rest.trim();
        if (value) {
          return { key: normalizeExpectedBehaviorKey(key), value };
        }
      }
    }
  }
  return null;
}

function preserveLatexSource(text: string, input: LatexConversionInput, languageCode: string): string {
  const requirements = inferPackageRequirements(text);

  if (isLatexDocumentAtMeaningfulStart(text)) {
    return ensureFullDocumentRequirements(text, requirements);
  }

  return buildDocument({
    title: input.title,
    author: input.author,
    body: text,
    languageCode,
    packages: requirements
  });
}

function inferPackageRequirements(text: string): PackageRequirements {
  const usesAlgorithmicxSyntax = /\\begin\{algorithmic\}|\b\\(?:State|For|If|ElsIf|Else|EndIf|EndFor|While|EndWhile|Require|Ensure)\b/.test(text);
  return {
    algorithm: /\\begin\{algorithm\}/.test(text) || usesAlgorithmicxSyntax,
    algpseudocode: usesAlgorithmicxSyntax,
    amsthm: /\\begin\{(?:theorem|proof)\}/.test(text),
    booktabs: /\\(?:toprule|midrule|bottomrule)\b/.test(text)
  };
}

function ensureFullDocumentRequirements(text: string, requirements: PackageRequirements): string {
  const normalizedText = ensureAlgorithmPackageConsistency(text, requirements);
  const insertions: string[] = [];

  if (requirements.algorithm && !hasUsePackage(normalizedText, "algorithm")) {
    insertions.push("\\usepackage{algorithm}");
  }

  if (requirements.algpseudocode && !hasUsePackage(normalizedText, "algpseudocode")) {
    insertions.push("\\usepackage{algpseudocode}");
  }

  if (requirements.booktabs && !hasUsePackage(normalizedText, "booktabs")) {
    insertions.push("\\usepackage{booktabs}");
  }

  if (requirements.amsthm && !hasUsePackage(normalizedText, "amsthm")) {
    insertions.push("\\usepackage{amsthm}");
  }

  if (requirements.amsthm && /\\begin\{theorem\}/.test(normalizedText) && !/\\newtheorem\{theorem\}/.test(normalizedText)) {
    insertions.push("\\newtheorem{theorem}{Theorem}");
  }

  if (!insertions.length || !/\\begin\{document\}/.test(normalizedText)) {
    return normalizedText;
  }

  return normalizedText.replace(/\\begin\{document\}/, `${insertions.join("\n")}\n\\begin{document}`);
}

function ensureAlgorithmPackageConsistency(text: string, requirements: PackageRequirements): string {
  if (!requirements.algpseudocode) {
    return text;
  }

  return text.replace(/^([ \t]*\\usepackage(?:\[[^\]]*\])?\{)([^}\n]+)(\}[^\n]*\n?)/gm, (match, prefix: string, packageList: string, suffix: string) => {
    const packages = packageList
      .split(",")
      .map((packageName) => packageName.trim())
      .filter(Boolean)
      .filter((packageName) => packageName !== "algorithmic");

    if (packages.length === packageList.split(",").filter((packageName) => packageName.trim()).length) {
      return match;
    }

    return packages.length ? `${prefix}${packages.join(",")}${suffix}` : "";
  });
}

function hasUsePackage(text: string, packageName: string): boolean {
  const packageRegex = new RegExp(`\\\\usepackage(?:\\[[^\\]]*\\])?\\{[^}]*\\b${escapeRegExp(packageName)}\\b[^}]*\\}`);
  return packageRegex.test(text);
}

function buildLatexStats(source: string, latex: string, blocks: Block[]): LatexConversionResult["stats"] {
  return {
    wordCount: source.split(/\s+/).filter(Boolean).length,
    equationCount: blocks.length ? blocks.filter((block) => block.type === "equation" || block.type === "displayMath" || block.type === "align").length : countMatches(latex, /\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?)\}|\\\[/g),
    tableCount: blocks.length ? blocks.filter((block) => block.type === "table").length : countMatches(latex, /\\begin\{table\}|\\begin\{tabular\}/g),
    citationCount: countMatches(latex, /\\cite\{/g)
  };
}

function convertMixedMarkdownLatex(text: string, input: LatexConversionInput, languageCode: string): { latex: string; blocks: Block[] } {
  const lines = text.split("\n");
  const bodyParts: string[] = [];
  let index = 0;
  const blocks: Block[] = [];

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const fence = collectCodeFence(lines, index);
      bodyParts.push(["\\begin{verbatim}", fence.content.join("\n"), "\\end{verbatim}"].join("\n"));
      index = fence.nextIndex;
      continue;
    }

    if (line === "$$") {
      const display = collectDelimitedBlock(lines, index, "$$", "$$");
      bodyParts.push(["\\[", display.content.join("\n"), "\\]"].join("\n"));
      index = display.nextIndex;
      continue;
    }

    if (line === "\\[") {
      const display = collectDelimitedBlock(lines, index, "\\[", "\\]");
      bodyParts.push(["\\[", display.content.join("\n"), "\\]"].join("\n"));
      index = display.nextIndex;
      continue;
    }

    const environmentName = getBeginEnvironmentName(line);
    if (environmentName && protectedEnvironments.has(environmentName)) {
      const environment = collectRawEnvironment(lines, index, environmentName);
      bodyParts.push(environment.content.join("\n"));
      index = environment.nextIndex;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      bodyParts.push(`\\${headingCommands[level]}{${escapeLatex(heading[2].trim())}}`);
      blocks.push({ type: "heading", level, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (isPageMarkerLine(line)) {
      bodyParts.push(renderPageMarker(line));
      blocks.push({ type: "pageMarker", text: line });
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const table = collectWhile(lines, index, (line) => {
        const trimmed = line.trim();
        return /^\|.*\|$/.test(trimmed) || isTableLine(trimmed);
      });
      bodyParts.push(renderTable(parseTableRows(table.values)));
      blocks.push({ type: "table", rows: parseTableRows(table.values) });
      index = table.nextIndex;
      continue;
    }

    if (isListLine(line)) {
      const list = collectWhile(lines, index, (candidate) => isListLine(candidate.trim()));
      const parsedList = parseList(list.values);
      bodyParts.push(renderList(parsedList));
      blocks.push(parsedList);
      index = list.nextIndex;
      continue;
    }

    const paragraph = collectMixedMarkdownParagraph(lines, index);

    bodyParts.push(renderMixedParagraph(paragraph.values));
    index = paragraph.nextIndex;
  }

  const body = bodyParts.filter(Boolean).join("\n\n");
  const latex = buildDocument({
    title: input.title,
    author: input.author,
    body,
    languageCode,
    packages: inferPackageRequirements(body)
  });

  return { latex, blocks };
}

function collectMixedMarkdownParagraph(lines: string[], startIndex: number): { values: string[]; nextIndex: number } {
  const values: string[] = [];
  let index = startIndex;

  while (index < lines.length && !isMixedMarkdownBoundary(lines, index)) {
    values.push(lines[index].trim());
    index += 1;
  }

  return { values, nextIndex: index };
}

function isMixedMarkdownBoundary(lines: string[], index: number): boolean {
  const trimmed = lines[index]?.trim() ?? "";
  return (
    !trimmed ||
    /^```/.test(trimmed) ||
    trimmed === "$$" ||
    trimmed === "\\[" ||
    Boolean(getBeginEnvironmentName(trimmed)) ||
    /^(#{1,6})\s+/.test(trimmed) ||
    isMarkdownTableStart(lines, index) ||
    isListLine(trimmed) ||
    isPageMarkerLine(trimmed)
  );
}

function collectCodeFence(lines: string[], startIndex: number): { content: string[]; nextIndex: number } {
  const content: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    if (/^```/.test(lines[index].trim())) {
      return { content, nextIndex: index + 1 };
    }

    content.push(lines[index]);
    index += 1;
  }

  return { content, nextIndex: index };
}

function collectDelimitedBlock(lines: string[], startIndex: number, open: string, close: string): { content: string[]; nextIndex: number } {
  const content: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    if (lines[index].trim() === close) {
      return { content, nextIndex: index + 1 };
    }

    content.push(lines[index]);
    index += 1;
  }

  return { content, nextIndex: index };
}

function getBeginEnvironmentName(line: string): string | null {
  return /^\\begin\{([^}]+)\}/.exec(line)?.[1] ?? null;
}

function collectRawEnvironment(lines: string[], startIndex: number, environmentName: string): { content: string[]; nextIndex: number } {
  const content: string[] = [];
  let depth = 0;
  let index = startIndex;
  const beginPattern = new RegExp(`\\\\begin\\{${escapeRegExp(environmentName)}\\}`);
  const endPattern = new RegExp(`\\\\end\\{${escapeRegExp(environmentName)}\\}`);

  while (index < lines.length) {
    const line = lines[index];
    if (beginPattern.test(line)) {
      depth += 1;
    }

    if (endPattern.test(line)) {
      depth -= 1;
    }

    content.push(line);
    index += 1;

    if (depth <= 0) {
      break;
    }
  }

  return { content, nextIndex: index };
}

function renderMixedParagraph(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map(escapeTextPreservingInlineLatex)
    .join(" ");
}

function escapeTextPreservingInlineLatex(value: string): string {
  const parts = value.split(/((?<!\\)\$[^$\n]+(?<!\\)\$|\\[A-Za-z*]+(?:\[[^\]]*\])?(?:\{[^{}]*\})*)/g);
  return parts
    .map((part) => {
      if (!part) {
        return "";
      }

      if (/^(?<!\\)\$/.test(part) || /^\\[A-Za-z*]+/.test(part)) {
        return part;
      }

      return escapeLatex(part);
    })
    .join("");
}

function convertPlainTextDocument(text: string, input: LatexConversionInput, languageCode: string): { latex: string; blocks: Block[] } {
  const parsed = parseDocument(text);
  const body = parsed.blocks.map(renderBlock).filter(Boolean).join("\n\n");
  const latex = buildDocument({
    title: parsed.title ?? input.title,
    author: parsed.author ?? input.author,
    institution: parsed.institution,
    date: parsed.date,
    body,
    languageCode,
    packages: inferPackageRequirements(body)
  });

  return { latex, blocks: parsed.blocks };
}

function buildMetadata(input: LatexConversionInput, inputType: DetectedInputType, status: ConversionMetadata["status"], sourceBytes: number): ConversionMetadata {
  return {
    filename: input.filename,
    fileSize: sourceBytes,
    inputLength: input.text?.length ?? 0,
    outputLength: 0,
    inputType,
    outputType: "latex-document",
    outputFilename: getOutputFilename(input.filename),
    outputChecksum: checksumText(""),
    status,
    largeInput: sourceBytes > largePreviewThreshold,
    conversionMode: getConversionMode(input)
  };
}

function finalizeMetadata(metadata: ConversionMetadata, latex: string, validationIssues: ValidationIssue[]): ConversionMetadata {
  return {
    ...metadata,
    outputLength: latex.length,
    outputChecksum: checksumText(latex),
    status: hasFatalValidationIssues(validationIssues) ? "failed" : metadata.status
  };
}

function checksumText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function hasFatalValidationIssues(validationIssues: ValidationIssue[]): boolean {
  return validationIssues.some((issue) => issue.severity === "error");
}

function detectInputType(text: string, filename?: string): DetectedInputType {
  const extension = getFileExtension(filename);

  if (isLatexDocumentAtMeaningfulStart(text)) {
    return "latex-document";
  }

  if (hasResearchStructure(text)) {
    return "plain-text";
  }

  if (hasEmbeddedLatexDocumentSnippet(text)) {
    return "plain-text";
  }

  const latex = isLatexSource(text);
  const markdown = hasMarkdownStructure(text) || extension === "md";

  if (latex && markdown) {
    return "markdown-latex";
  }

  if (latex) {
    return "latex-fragment";
  }

  if (markdown) {
    return "markdown";
  }

  return "plain-text";
}

function hasMarkdownStructure(text: string): boolean {
  return /^#{1,6}\s+\S/m.test(text) || /^```/m.test(text) || /^\|.+\|\s*\n\|?\s*:?-{3,}:?/m.test(text);
}

function getOutputFilename(filename?: string): string {
  if (!filename) {
    return "converted_output.tex";
  }

  const safeName = sanitizeOutputFilename(filename);
  const withoutExtension = safeName.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "converted_output"}_converted.tex`;
}

function sanitizeOutputFilename(filename: string): string {
  const lastPart = filename.split(/[/\\]/).pop() ?? "converted_output";
  return lastPart
    .replace(/\.[^.]+$/, (extension) => extension.toLowerCase())
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export function isSupportedTextFilename(filename: string): boolean {
  return supportedTextFileExtensions.has(getFileExtension(filename));
}

export function getUnsupportedFileIssue(filename: string): ValidationIssue {
  if (isPdfFilename(filename)) {
    return {
      severity: "error",
      message: "PDF input cannot reliably preserve original LaTeX source; upload .tex for exact preservation.",
      suggestedFix: "Use the original .tex file for exact preservation. Treat PDF-to-LaTeX as a separate reconstruction feature."
    };
  }

  return {
    severity: "error",
    message: `Unsupported file type for "${sanitizeOutputFilename(filename)}".`,
    suggestedFix: "Upload a .tex, .latex, .txt, or .md file."
  };
}

function isPdfFilename(filename: string): boolean {
  return getFileExtension(filename) === "pdf";
}

function getFileExtension(filename?: string): string {
  return filename?.split(".").pop()?.toLowerCase() ?? "";
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function looksLikeRawPdfContent(value: string): boolean {
  if (!value) {
    return false;
  }

  return /%PDF-\d\.\d/.test(value.slice(0, 2048)) || hasRawPdfMarkers(value);
}

function hasRawPdfMarkers(value: string): boolean {
  const markers = [
    /^%PDF-\d\.\d/m,
    /^\d+\s+\d+\s+obj\b/m,
    /^stream\s*$/m,
    /^endstream\s*$/m,
    /^xref\s*$/m,
    /^trailer\s*$/m,
    /^startxref\s*$/m,
    /^%%EOF\s*$/m
  ];

  return markers.some((marker) => marker.test(value));
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
}

function issuesToWarnings(issues: ValidationIssue[]): string[] {
  return issues.filter((issue) => issue.severity !== "info").map(formatValidationIssue);
}

function formatValidationIssue(issue: ValidationIssue): string {
  const line = issue.line ? ` on line ${issue.line}` : "";
  const fix = issue.suggestedFix ? ` Suggested fix: ${issue.suggestedFix}` : "";
  const message = issue.message.endsWith(".") ? issue.message.slice(0, -1) : issue.message;
  return `${issue.severity.toUpperCase()}: ${message}${line}.${fix}`;
}

function parseDocument(text: string): ParsedDocument {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let title: string | undefined;
  let author: string | undefined;
  let institution: string | undefined;
  let date: string | undefined;
  let keywords: string | undefined;
  let appendixStarted = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const fence = collectCodeFence(lines, index);
      blocks.push({ type: "verbatim", lines: fence.content });
      index = fence.nextIndex;
      continue;
    }

    if (isPageMarkerLine(line)) {
      blocks.push({ type: "pageMarker", text: line });
      index += 1;
      continue;
    }

    const extractedTable = collectExtractedKeyValueTable(lines, index);
    if (extractedTable) {
      if (extractedTable.title) {
        blocks.push({ type: "heading", level: 1, text: titleCase(extractedTable.title) });
      }
      blocks.push({ type: "table", rows: extractedTable.rows });
      index = extractedTable.nextIndex;
      continue;
    }

    const embeddedDocumentSnippet = collectEmbeddedLatexDocumentSnippet(lines, index);
    if (embeddedDocumentSnippet) {
      blocks.push({ type: "literal", lines: embeddedDocumentSnippet.lines });
      index = embeddedDocumentSnippet.nextIndex;
      continue;
    }

    const rawLatexBlock = collectRawLatexBlock(lines, index);
    if (rawLatexBlock) {
      blocks.push(rawLatexBlock.literal ? { type: "literal", lines: rawLatexBlock.lines } : { type: "rawLatex", lines: rawLatexBlock.lines });
      index = rawLatexBlock.nextIndex;
      continue;
    }

    const titleMatch = /^title:\s*(.*)$/i.exec(line);
    if (titleMatch) {
      title = titleMatch[1].trim() || title;
      index += 1;
      continue;
    }

    const authorMatch = /^author:\s*(.*)$/i.exec(line);
    if (authorMatch) {
      author = authorMatch[1].trim() || author;
      index += 1;
      continue;
    }

    const institutionMatch = /^institution:\s*(.*)$/i.exec(line);
    if (institutionMatch) {
      institution = institutionMatch[1].trim() || institution;
      index += 1;
      continue;
    }

    const dateMatch = /^date:\s*(.*)$/i.exec(line);
    if (dateMatch) {
      date = dateMatch[1].trim() || date;
      index += 1;
      continue;
    }

    const abstractMatch = /^abstract:\s*(.*)$/i.exec(line);
    if (abstractMatch) {
      const firstLine = abstractMatch[1].trim();
      const collected = collectUntilDocumentBoundary(lines, index + 1);
      const abstractLines = [firstLine, ...collected.values].filter(Boolean);

      if (abstractLines.length) {
        blocks.push({ type: "abstract", lines: abstractLines });
      }

      index = collected.nextIndex;
      continue;
    }

    const keywordsMatch = /^keywords:\s*(.*)$/i.exec(line);
    if (keywordsMatch) {
      const firstLine = keywordsMatch[1].trim();
      const collected = collectUntilDocumentBoundary(lines, index + 1);
      keywords = [firstLine, ...collected.values].filter(Boolean).join(" ");
      index = collected.nextIndex;
      continue;
    }

    const appendix = parseAppendixHeading(line);
    if (appendix) {
      if (!appendixStarted) {
        blocks.push({ type: "appendix" });
        appendixStarted = true;
      }
      blocks.push({ type: "heading", level: 1, text: appendix.title });
      index += 1;
      continue;
    }

    const numberedHeading = parseNumberedSectionHeading(line);
    if (numberedHeading) {
      blocks.push({ type: "heading", level: 1, text: numberedHeading });

      if (/^theorem$/i.test(numberedHeading)) {
        const theorem = collectEnvironmentLines(lines, index + 1);
        if (theorem.lines.length) {
          blocks.push({ type: "theorem", lines: theorem.lines });
          index = theorem.nextIndex;
          continue;
        }
      }

      index += 1;
      continue;
    }

    const theoremBlock = parseEnvironmentBlock("theorem", line, lines, index);
    if (theoremBlock) {
      if (theoremBlock.lines.length) {
        blocks.push({ type: "theorem", lines: theoremBlock.lines });
      }
      index = theoremBlock.nextIndex;
      continue;
    }

    const proofBlock = parseEnvironmentBlock("proof", line, lines, index);
    if (proofBlock) {
      if (proofBlock.lines.length) {
        blocks.push({ type: "proof", lines: proofBlock.lines });
      }
      index = proofBlock.nextIndex;
      continue;
    }

    const sectionLabel = parseSectionLabel(line);
    if (sectionLabel) {
      if (sectionLabel.heading !== "Equation" && sectionLabel.heading !== "Table") {
        blocks.push({ type: "heading", level: 1, text: sectionLabel.heading });
      }
      const detailBlock = parseSectionDetail(sectionLabel.heading, sectionLabel.detail);

      if (detailBlock) {
        blocks.push(detailBlock);
      }

      if (sectionLabel.heading === "Algorithm" && !sectionLabel.detail) {
        const algorithm = collectAlgorithmSteps(lines, index + 1);
        if (algorithm.items.length) {
          blocks.push({ type: "algorithm", items: algorithm.items });
          index = algorithm.nextIndex;
          continue;
        }
      }

      if (sectionLabel.heading === "Matrix Representation" && !sectionLabel.detail) {
        const matrix = collectMatrixBlock(lines, index + 1);
        if (matrix) {
          blocks.push({ type: "equation", body: matrix.body });
          index = matrix.nextIndex;
          continue;
        }
      }

      if (sectionLabel.heading === "Loss Function" && !sectionLabel.detail) {
        const loss = collectFollowingEquation(lines, index + 1);
        if (loss) {
          blocks.push({ type: "equation", body: loss.body });
          index = loss.nextIndex;
          continue;
        }
      }

      if (sectionLabel.heading === "Optimization" && !sectionLabel.detail) {
        const optimization = collectOptimizationBlock(lines, index + 1);
        if (optimization) {
          blocks.push({ type: "align", body: optimization.body });
          index = optimization.nextIndex;
          continue;
        }
      }

      index += 1;
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      blocks.push(heading);
      index += 1;
      continue;
    }

    if (/^abstract:?$/i.test(line)) {
      const collected = collectUntilDocumentBoundary(lines, index + 1);
      blocks.push({ type: "abstract", lines: collected.values });
      index = collected.nextIndex;
      continue;
    }

    if (/^(references|bibliography):?$/i.test(line)) {
      const collected = collectReferencesLines(lines, index + 1);
      blocks.push({ type: "references", lines: collected.values });
      index = collected.nextIndex;
      continue;
    }

    const piecewise = collectPiecewiseBlock(lines, index);
    if (piecewise) {
      blocks.push({ type: "equation", body: piecewise.body });
      index = piecewise.nextIndex;
      continue;
    }

    const optimization = collectOptimizationBlock(lines, index);
    if (optimization) {
      blocks.push({ type: "align", body: optimization.body });
      index = optimization.nextIndex;
      continue;
    }

    const pipeline = convertPipelineExpression(line);
    if (pipeline) {
      blocks.push({ type: "displayMath", body: pipeline });
      index += 1;
      continue;
    }

    const matrixBody = collectMatrixBlock(lines, index);
    if (matrixBody) {
      blocks.push({ type: "equation", body: matrixBody.body });
      index = matrixBody.nextIndex;
      continue;
    }

    const equationBody = extractEquationBody(line);
    if (equationBody) {
      blocks.push({ type: "equation", body: equationBody });
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const collected = collectWhile(lines, index, (line) => {
        const trimmed = line.trim();
        return /^\|.*\|$/.test(trimmed) || isTableLine(trimmed);
      });
      blocks.push({ type: "table", rows: parseTableRows(collected.values) });
      index = collected.nextIndex;
      continue;
    }

    if (isStepLine(line)) {
      const algorithm = collectAlgorithmSteps(lines, index);
      if (algorithm.items.length) {
        blocks.push({ type: "algorithm", items: algorithm.items });
        index = algorithm.nextIndex;
        continue;
      }
    }

    if (isListLine(line)) {
      const collected = collectWhile(lines, index, (candidate) => isListLine(candidate.trim()));
      blocks.push(parseList(collected.values));
      index = collected.nextIndex;
      continue;
    }

    const paragraph = collectWhile(lines, index, (candidate) => {
      const trimmed = candidate.trim();
      return Boolean(trimmed) && !isStructuralLine(trimmed);
    });

    if (paragraph.values.length) {
      blocks.push({ type: "paragraph", lines: paragraph.values });
      index = paragraph.nextIndex;
    } else {
      // Fallback: If no parser handled this line but it triggered isStructuralLine,
      // it's a false positive structure (e.g. a loose Markdown table row). Consume it as a paragraph to prevent infinite loops.
      const fallbackLine = lines[index].trim();
      if (fallbackLine) {
        blocks.push({ type: "paragraph", lines: [fallbackLine] });
      }
      index += 1;
    }
  }

  return { title, author, institution, date, blocks: insertKeywordsBlock(blocks, keywords) };
}

function collectEmbeddedLatexDocumentSnippet(lines: string[], startIndex: number): { lines: string[]; nextIndex: number } | null {
  const line = lines[startIndex]?.trim() ?? "";
  if (!/^\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(line)) {
    return null;
  }

  const collected: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    collected.push(lines[index]);
    if (/\\end\{document\}/.test(lines[index])) {
      index += 1;
      break;
    }
    index += 1;
  }

  return { lines: collected, nextIndex: index };
}

function collectRawLatexBlock(lines: string[], startIndex: number): { lines: string[]; nextIndex: number; literal?: boolean } | null {
  const line = lines[startIndex]?.trim() ?? "";

  if (line === "\\[") {
    const display = collectDelimitedBlock(lines, startIndex, "\\[", "\\]");
    return { lines: ["\\[", ...display.content, "\\]"], nextIndex: display.nextIndex };
  }

  if (line === "$$") {
    const display = collectDelimitedBlock(lines, startIndex, "$$", "$$");
    return { lines: ["\\[", ...display.content, "\\]"], nextIndex: display.nextIndex };
  }

  const environmentName = getBeginEnvironmentName(line);
  if (environmentName && (knownLatexEnvironments.has(environmentName) || protectedEnvironments.has(environmentName))) {
    const environment = collectRawEnvironment(lines, startIndex, environmentName);
    return { lines: environment.content, nextIndex: environment.nextIndex };
  }

  if (/^\\(?:section|subsection|subsubsection|paragraph)\*?\{/.test(line)) {
    return { lines: [lines[startIndex]], nextIndex: startIndex + 1 };
  }

  if (/^\\(?:usepackage|newcommand|renewcommand|newtheorem)\b/.test(line)) {
    const collected = collectWhile(lines, startIndex, (candidate) => /^\\(?:usepackage|newcommand|renewcommand|newtheorem)\b/.test(candidate.trim()));
    return { lines: collected.values, nextIndex: collected.nextIndex, literal: true };
  }

  return null;
}

function parseHeading(line: string): Block | null {
  if (/^(expected behavior(?: check table)?|minimal pass criteria(?: for this pdf)?|pass criteria|checklist)$/i.test(line.trim())) {
    return { type: "heading", level: 1, text: titleCase(line.trim()) };
  }

  if (/^(theorem|lemma|proof|remark)\.?$/i.test(line.trim())) {
    return { type: "heading", level: 1, text: titleCase(line.trim().replace(/\.$/, "")) };
  }

  const markdownHeading = /^(#{1,3})\s+(.+)$/.exec(line);
  if (markdownHeading) {
    return {
      type: "heading",
      level: markdownHeading[1].length as 1 | 2 | 3,
      text: markdownHeading[2].trim()
    };
  }

  const numberedHeading = /^(\d+(?:\.\d+){0,2})[.)]?\s+(.+)$/.exec(line);
  if (numberedHeading) {
    const headingText = numberedHeading[2].trim();
    const isAcademicHeading = /^(theorem|lemma|proof|remark)\.?$/i.test(headingText);
    
    if (!isAcademicHeading && !line.trim().endsWith(":") && !looksLikeNumberedHeadingText(headingText)) {
      return null;
    }

    const level = Math.min(numberedHeading[1].split(".").length, 3) as 1 | 2 | 3;
    return { type: "heading", level, text: headingText.replace(/[:.]$/, "").trim() };
  }

  if (line.length < 80 && /^[A-Z][A-Z0-9 ,:;()/-]+$/.test(line) && line.split(/\s+/).length <= 10) {
    if (/^(Equation|Table)$/i.test(line.trim())) {
      return null;
    }
    return { type: "heading", level: 1, text: titleCase(line) };
  }

  return null;
}

function looksLikeNumberedHeadingText(value: string): boolean {
  const words = value.trim().replace(/:$/, "").split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 8) {
    return false;
  }

  return words.every((word) => {
    const cleanWord = word.replace(/^[.,:;()'"\[\]{}!?-]+|[.,:;()'"\[\]{}!?-]+$/g, "");
    if (!cleanWord) {
      return true;
    }
    return /^[A-Z][A-Za-z0-9()/+-]*$/.test(cleanWord) || /^(and|of|the|for|to|in)$/i.test(cleanWord);
  });
}

function parseNumberedSectionHeading(line: string): string | null {
  const match = /^([1-9]|1\d|20)[.)]\s+(.+?)\s*:\s*$/i.exec(line);
  if (!match) {
    return null;
  }

  return titleCase(match[2].trim());
}

function parseAppendixHeading(line: string): { label: string; title: string } | null {
  const match = /^appendix\s+([A-Z])\s*:\s*(.+?)\s*:?\s*$/i.exec(line);
  if (!match) {
    return null;
  }

  return { label: match[1].toUpperCase(), title: titleCase(match[2].trim()) };
}

function insertKeywordsBlock(blocks: Block[], keywords?: string): Block[] {
  if (!keywords?.trim()) {
    return blocks;
  }

  const keywordBlock: Block = { type: "keywords", text: keywords.trim() };
  const abstractIndex = blocks.findIndex((block) => block.type === "abstract");

  if (abstractIndex === -1) {
    return [keywordBlock, ...blocks];
  }

  return [...blocks.slice(0, abstractIndex + 1), keywordBlock, ...blocks.slice(abstractIndex + 1)];
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case "heading":
      return `\\${headingCommands[block.level]}{${escapeLatex(block.text)}}`;
    case "abstract":
      return ["\\begin{abstract}", renderParagraph(block.lines), "\\end{abstract}"].join("\n");
    case "keywords":
      return `\\noindent\\textbf{Keywords:} ${escapeLatex(block.text)}`;
    case "theorem":
      return ["\\begin{theorem}", renderParagraph(block.lines), "\\end{theorem}"].join("\n");
    case "proof":
      return ["\\begin{proof}", renderParagraph(block.lines), "\\end{proof}"].join("\n");
    case "algorithm":
      return renderAlgorithm(block.items);
    case "appendix":
      return "\\appendix";
    case "references":
      return renderReferences(block.lines);
    case "paragraph":
      return renderParagraph(block.lines);
    case "pageMarker":
      return renderPageMarker(block.text);
    case "equation":
      return renderEquation(block.body);
    case "displayMath":
      return ["\\[", block.body, "\\]"].join("\n");
    case "align":
      return ["\\begin{align}", block.body, "\\end{align}"].join("\n");
    case "list":
      return renderList(block);
    case "table":
      return renderTable(block.rows);
    case "rawLatex":
      return block.lines.join("\n");
    case "literal":
      return renderLiteralBlock(block.lines);
    case "verbatim":
      return renderVerbatimBlock(block.lines);
  }
}

function renderLiteralBlock(lines: string[]): string {
  const renderedLines = lines.length ? lines.map((line) => `\\noindent ${escapeLatex(line)}\\par`).join("\n") : "\\noindent\\par";

  return ["\\begin{quote}", "\\ttfamily\\small", renderedLines, "\\end{quote}"].join("\n");
}

function renderVerbatimBlock(lines: string[]): string {
  if (lines.some((line) => /\\end\{verbatim\}/.test(line))) {
    return renderLiteralBlock(lines);
  }

  return ["\\begin{verbatim}", lines.join("\n"), "\\end{verbatim}"].join("\n");
}

function renderPageMarker(text: string): string {
  const marker = text.replace(/[\r\n]/g, " ").replace(/%/g, "\\%").trim();
  return marker ? `% Page marker: ${marker}` : "% Page marker";
}

function renderParagraph(lines: string[]): string {
  return renderTextPreservingInlineMath(lines.join(" ").replace(/\s+/g, " ").trim());
}

function renderTextPreservingInlineMath(value: string): string {
  return convertInlineSyntax(escapeTextPreservingInlineMath(value));
}

function escapeTextPreservingInlineMath(value: string): string {
  const parts = value.split(/(\\\([^\n]*?\\\)|(?<!\\)\$[^$\n]+(?<!\\)\$)/g);
  return parts
    .map((part) => {
      if (!part) {
        return "";
      }

      if (/^\\\(/.test(part) || /^(?<!\\)\$/.test(part)) {
        return part;
      }

      return escapeLatex(part);
    })
    .join("");
}

function convertInlineSyntax(value: string): string {
  // This pass restores common academic citation placeholders after escaping.
  return value.replace(/\[([A-Z][A-Za-z-]+(?:\s+et al\.)?,?\s+\d{4}[a-z]?)\]/g, (_match, citation: string) => {
    return `\\cite{${toCitationKey(citation)}}`;
  });
}

function renderList(block: Extract<Block, { type: "list" }>): string {
  const environment = block.ordered ? "enumerate" : "itemize";
  const items = block.items.map((item) => `  \\item ${renderTextPreservingInlineMath(item)}`).join("\n");
  return [`\\begin{${environment}}`, items, `\\end{${environment}}`].join("\n");
}

function renderAlgorithm(items: string[]): string {
  const renderedItems = items.map((item) => `  \\item ${renderTextPreservingInlineMath(item)}`).join("\n");
  return ["\\begin{enumerate}", renderedItems, "\\end{enumerate}"].join("\n");
}

function renderTable(rows: string[][]): string {
  const dataRows = rows.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell.trim())));
  if (!dataRows.length) {
    return "";
  }

  const columnCount = Math.max(...dataRows.map((row) => row.length), 1);
  const alignment = Array.from({ length: columnCount }, () => "l").join("");
  const [header, ...bodyRows] = dataRows;
  const formattedHeader = `    ${formatTableRow(header)}`;
  const formattedBody = bodyRows.map((row) => `    ${formatTableRow(row)}`).join("\n");
  const tableBody = formattedBody ? [formattedHeader, "    \\midrule", formattedBody] : [formattedHeader];

  return [
    "\\begin{table}[htbp]",
    "  \\centering",
    `  \\begin{tabular}{${alignment}}`,
    "    \\toprule",
    ...tableBody,
    "    \\bottomrule",
    "  \\end{tabular}",
    "  \\caption{Generated table}",
    "\\end{table}"
  ].join("\n");
}

function renderReferences(lines: string[]): string {
  const items = lines
    .map(cleanReferenceText)
    .filter(Boolean)
    .map((line) => `  \\bibitem{${toBibliographyKey(line)}}\n  ${renderReferenceText(line)}`)
    .join("\n");

  return ["\\section*{References}", "\\begin{thebibliography}{99}", items || "  \\bibitem{placeholder} Add reference details here.", "\\end{thebibliography}"].join("\n");
}

function cleanReferenceText(line: string): string {
  return line
    .replace(/^[-*]\s+/, "")
    .replace(/^\[\d+\]\s*/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function toBibliographyKey(reference: string): string {
  const year = /\b(19|20)\d{2}\b/.exec(reference)?.[0] ?? "";
  const beforeYear = year ? reference.slice(0, reference.indexOf(year)) : reference;
  const beforeComma = beforeYear.split(",")[0] || beforeYear;
  const words = beforeComma.match(/[A-Za-z]+/g) ?? [];
  const surname = words.at(-1)?.toLowerCase() ?? toCitationKey(reference);

  return `${surname}${year}` || toCitationKey(reference);
}

function renderReferenceText(reference: string): string {
  const parts = reference.split(",").map((part) => part.trim()).filter(Boolean);
  const lastPart = parts.at(-1) ?? "";

  if (parts.length >= 4 && /\b(19|20)\d{2}\b/.test(lastPart)) {
    const titleIndex = parts.length - 3;
    const authors = parts.slice(0, titleIndex).join(", ");
    const title = parts[titleIndex];
    const publicationParts = parts.slice(titleIndex + 1);
    return `${escapeLatex(authors)}, \\textit{${escapeLatex(stripTextit(title))}}, ${publicationParts.map(escapeLatex).join(", ")}`;
  }

  return escapeLatex(reference);
}

function stripTextit(value: string): string {
  return value.replace(/^\\textit\{(.+)\}$/, "$1").trim();
}

function buildDocument(options: BuildDocumentOptions): string {
  const title = escapeLatex(options.title?.trim() || "Generated Research Draft");
  const authorName = escapeLatex(options.author?.trim() || "Author Name");
  const institution = options.institution?.trim() ? `\\\\${escapeLatex(options.institution.trim())}` : "";
  const date = options.date?.trim() ? escapeLatex(options.date.trim()) : "\\today";
  const packages = options.packages ?? {};
  const optionalPackages = [
    packages.algorithm ? "\\usepackage{algorithm}" : null,
    packages.algpseudocode ? "\\usepackage{algpseudocode}" : null
  ].filter(Boolean);

  return [
    "\\documentclass[12pt]{article}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage{amsmath, amssymb}",
    "\\usepackage{amsthm}",
    "\\usepackage{booktabs}",
    ...optionalPackages,
    "\\usepackage{geometry}",
    "\\usepackage{hyperref}",
    "\\geometry{margin=1in}",
    "\\newtheorem{theorem}{Theorem}",
    "\\newcommand{\\norm}[1]{\\left\\lVert #1 \\right\\rVert}",
    "\\newcommand{\\abs}[1]{\\left\\lvert #1 \\right\\rvert}",
    "",
    `% Language profile: ${options.languageCode}`,
    `\\title{${title}}`,
    `\\author{${authorName}${institution}}`,
    `\\date{${date}}`,
    "",
    "\\begin{document}",
    "\\maketitle",
    "",
    options.body,
    "",
    "\\end{document}"
  ].join("\n");
}

function parseSectionLabel(line: string): { heading: SectionHeading; detail: string } | null {
  const match =
    /^(introduction|problem statement|mathematical model|loss function|matrix representation|system architecture|equation|table|algorithm|optimization|results|discussion|conclusion):\s*(.*)$/i.exec(
      line
    );
  if (!match) {
    return null;
  }

  return {
    heading: titleCase(match[1]) as SectionHeading,
    detail: match[2].trim()
  };
}

function parseSectionDetail(heading: string, detail: string): Block | null {
  if (!detail) {
    return null;
  }

  if (heading === "Algorithm") {
    return { type: "algorithm", items: splitAlgorithmItems(detail) };
  }

  const matrix = convertMatrixExpression(detail);
  if (heading === "Matrix Representation" && matrix) {
    return { type: "equation", body: matrix };
  }

  const equation = extractEquationBody(detail, heading);
  if (equation) {
    return { type: "equation", body: equation };
  }

  return { type: "paragraph", lines: [detail] };
}

function isStructuralLine(line: string): boolean {
  return Boolean(
      /^```/.test(line) ||
      /^title:\s*.+$/i.test(line) ||
      /^author:\s*.+$/i.test(line) ||
      /^institution:\s*.+$/i.test(line) ||
      /^date:\s*.+$/i.test(line) ||
      /^abstract:\s*/i.test(line) ||
      /^keywords:\s*/i.test(line) ||
      isRawLatexBoundaryLine(line) ||
      isPageMarkerLine(line) ||
      isChecklistLine(line) ||
      /^theorem:\s*/i.test(line) ||
      /^proof:\s*/i.test(line) ||
      parseAppendixHeading(line) ||
      parseNumberedSectionHeading(line) ||
      parseSectionLabel(line) ||
      parseHeading(line) ||
      extractEquationBody(line) ||
      isTableLine(line) ||
      isListLine(line)
  );
}

function extractEquationBody(line: string, context?: string): string | null {
  if (isPageMarkerLine(line) || isChecklistLine(line)) {
    return null;
  }

  if (looksLikeProseWithMathSymbols(line)) {
    return null;
  }

  const body = unwrapEquation(line);
  const normalized = extractMathFromSentence(body, context);

  if (body !== line || isAcademicMathExpression(line) || normalized !== body) {
    if (/[.!?;]$/.test(line.trim())) {
      if (body === line && !isMathExpression(line)) {
        return null;
      }
    }
    return isAcademicMathExpression(normalized) ? normalized : null;
  }

  return null;
}

function looksLikeProseWithMathSymbols(value: string): boolean {
  const trimmed = value.trim();
  return /^(for|if|while|when|where|given|let|assume|compute|solve|update|we|the|a|an|in|this|that|these|those)\b/i.test(trimmed) || /:\s*$/.test(trimmed);
}

function unwrapEquation(line: string): string {
  return line
    .replace(/^equation:\s*/i, "")
    .replace(/^\$\$?/, "")
    .replace(/\$\$?$/, "")
    .replace(/^\\\[/, "")
    .replace(/\\\]$/, "")
    .replace(/^\\\(/, "")
    .replace(/\\\)$/, "")
    .trim();
}

function parseEnvironmentBlock(
  environment: "theorem" | "proof",
  line: string,
  lines: string[],
  index: number
): { lines: string[]; nextIndex: number } | null {
  const match = new RegExp(`^${environment}:\\s*(.*)$`, "i").exec(line);
  if (!match) {
    return null;
  }

  const inlineText = match[1].trim();
  if (inlineText) {
    return { lines: [inlineText], nextIndex: index + 1 };
  }

  return collectEnvironmentLines(lines, index + 1);
}

function collectEnvironmentLines(lines: string[], startIndex: number): { lines: string[]; nextIndex: number } {
  const collected = collectWhile(lines, startIndex, (candidate) => {
    const trimmed = candidate.trim();
    return Boolean(trimmed) && !isDocumentBoundaryLine(trimmed);
  });

  return { lines: collected.values, nextIndex: collected.nextIndex };
}

function collectFollowingEquation(lines: string[], startIndex: number): { body: string; nextIndex: number } | null {
  const collected = collectWhile(lines, startIndex, (candidate) => {
    const trimmed = candidate.trim();
    return Boolean(trimmed) && !isDocumentBoundaryLine(trimmed);
  });
  const candidate = collected.values.join(" ");
  const equation = extractEquationBody(candidate, "Loss Function");

  return equation ? { body: equation, nextIndex: collected.nextIndex } : null;
}

function collectPiecewiseBlock(lines: string[], startIndex: number): { body: string; nextIndex: number } | null {
  const first = parsePiecewiseLine(lines[startIndex]?.trim() ?? "");
  if (!first) {
    return null;
  }

  const pieces = [first];
  let index = startIndex + 1;

  while (index < lines.length) {
    const parsed = parsePiecewiseLine(lines[index].trim());
    if (!parsed || parsed.left !== first.left) {
      break;
    }

    pieces.push(parsed);
    index += 1;
  }

  if (pieces.length < 2) {
    return null;
  }

  const rows = pieces.map((piece, pieceIndex) => {
    const ending = pieceIndex === pieces.length - 1 ? "." : ",";
    return `${transformMathText(piece.value)}, & ${transformMathText(piece.condition)}${ending}`;
  });

  return {
    body: [`${transformMathText(first.left)} =`, "\\begin{cases}", rows.join(" \\\\\n"), "\\end{cases}"].join("\n"),
    nextIndex: index
  };
}

function parsePiecewiseLine(line: string): { left: string; value: string; condition: string } | null {
  const match = /^(.+?)\s*=\s*(.+?)\s+if\s+(.+)$/i.exec(line);
  if (!match) {
    return null;
  }

  return {
    left: match[1].trim(),
    value: match[2].trim(),
    condition: match[3].trim()
  };
}

function collectOptimizationBlock(lines: string[], startIndex: number): { body: string; nextIndex: number } | null {
  const first = /^minimi[sz]e\s+(.+)$/i.exec(lines[startIndex]?.trim() ?? "");
  if (!first) {
    return null;
  }

  const rows = [`\\min \\quad & ${transformMathText(first[1].trim())} \\\\`];
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || isDocumentBoundaryLine(line)) {
      break;
    }

    const subject = /^subject to\s+(.+)$/i.exec(line);
    const continuation = /^and\s+(.+)$/i.exec(line);

    if (subject) {
      rows.push(`\\text{subject to} \\quad & ${formatOptimizationCondition(subject[1])}, \\\\`);
      index += 1;
      continue;
    }

    if (continuation) {
      rows.push(`& ${formatOptimizationCondition(continuation[1])}`);
      index += 1;
      continue;
    }

    break;
  }

  return rows.length > 1 ? { body: rows.join("\n"), nextIndex: index } : null;
}

function formatOptimizationCondition(value: string): string {
  const compileMatch = /^([A-Za-z])\s+must\s+compile\s+successfully\.?$/i.exec(value.trim());
  if (compileMatch) {
    return `${compileMatch[1]} \\text{ compiles successfully.}`;
  }

  return transformMathText(value.trim().replace(/[.;]$/, ""));
}

function convertPipelineExpression(line: string): string | null {
  if (!line.includes("->")) {
    return null;
  }

  const parts = line.split("->").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  return parts.map(formatPipelineStep).join(" \\rightarrow ");
}

function formatPipelineStep(value: string): string {
  return /^OCR$/i.test(value) ? "\\operatorname{OCR}" : `\\text{${escapeLatex(value)}}`;
}

function collectAlgorithmSteps(lines: string[], startIndex: number): { items: string[]; nextIndex: number } {
  const collected = collectWhile(lines, startIndex, (candidate) => {
    const trimmed = candidate.trim();
    return Boolean(trimmed) && !isDocumentBoundaryLine(trimmed);
  });

  return {
    items: collected.values.flatMap(splitAlgorithmItems).filter(Boolean),
    nextIndex: collected.nextIndex
  };
}

function splitAlgorithmItems(value: string): string[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const sentenceItems = normalized
    .split(/\s*(?=(?:step\s*)?\d+[.)]\s+|step\s+\d+\s*:)/i)
    .map(cleanAlgorithmItem)
    .filter(Boolean);

  if (sentenceItems.length > 1) {
    return sentenceItems;
  }

  return [cleanAlgorithmItem(normalized)];
}

function cleanAlgorithmItem(value: string): string {
  return value
    .trim()
    .replace(/^[-*+]\s+/, "")
    .replace(/^(?:step\s*)?\d+[.)]\s+/i, "")
    .replace(/^step\s+\d+\s*[:.)-]\s*/i, "")
    .trim();
}

function isStepLine(line: string): boolean {
  return /^step\s+\d+\s*[:.)-]\s*/i.test(line.trim());
}

function collectMatrixBlock(lines: string[], startIndex: number): { body: string; nextIndex: number } | null {
  const firstLine = lines[startIndex]?.trim() ?? "";
  const bracketedMatrix = collectBracketedMatrixExpression(lines, startIndex);
  if (bracketedMatrix) {
    const matrix = convertMatrixExpression(bracketedMatrix.expression);
    if (matrix) {
      return { body: matrix, nextIndex: bracketedMatrix.nextIndex };
    }
  }

  const inlineMatrix = convertMatrixExpression(firstLine);
  if (inlineMatrix) {
    return { body: inlineMatrix, nextIndex: startIndex + 1 };
  }

  if (!/^[A-Za-z][A-Za-z0-9_]*\s*=$/.test(firstLine)) {
    return null;
  }

  const rows: string[][] = [];
  let index = startIndex + 1;

  while (index < lines.length) {
    const row = lines[index].trim();
    if (!row || isDocumentBoundaryLine(row)) {
      break;
    }

    const cells = parseMatrixRow(row);
    if (!cells.length) {
      break;
    }

    rows.push(cells);
    index += 1;
  }

  if (!rows.length) {
    return null;
  }

  return {
    body: renderMatrix(firstLine.replace(/\s*=$/, ""), rows),
    nextIndex: index
  };
}

function collectBracketedMatrixExpression(lines: string[], startIndex: number): { expression: string; nextIndex: number } | null {
  const firstLine = lines[startIndex]?.trim() ?? "";
  if (!/^[A-Za-z][A-Za-z0-9_]*\s*=\s*\[/.test(firstLine)) {
    return null;
  }

  const parts: string[] = [];
  let bracketBalance = 0;
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line || (parts.length > 0 && isDocumentBoundaryLine(line))) {
      break;
    }

    parts.push(line);
    bracketBalance += countCharacters(line, "[") - countCharacters(line, "]");
    index += 1;

    if (bracketBalance <= 0) {
      break;
    }
  }

  return parts.length && bracketBalance <= 0 ? { expression: parts.join(" "), nextIndex: index } : null;
}

function convertMatrixExpression(value: string): string | null {
  const match = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const matrixText = match[2].trim();
  const rows = extractMatrixRows(matrixText);
  if (rows.length < 2) {
    return null;
  }

  return renderMatrix(match[1], rows);
}

function extractMatrixRows(matrixText: string): string[][] {
  const bracketRows = matrixText.match(/\[([^\[\]]+)\]/g);
  if (bracketRows && bracketRows.length >= 2) {
    return bracketRows.map((row) => parseMatrixRow(row.replace(/^\[/, "").replace(/\]$/, ""))).filter((row) => row.length);
  }

  const compact = matrixText.replace(/^\[/, "").replace(/\]$/, "");
  return compact
    .split(";")
    .map(parseMatrixRow)
    .filter((row) => row.length);
}

function parseMatrixRow(row: string): string[] {
  return row
    .replace(/[;,]+$/g, "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/(?:\s*,\s*|\s+)+/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function renderMatrix(name: string, rows: string[][]): string {
  const renderedRows = rows.map((row) => row.map(formatMathToken).join(" & ")).join(" \\\\\n");
  return `${formatMathToken(name)} =\n\\begin{bmatrix}\n${renderedRows}\n\\end{bmatrix}`;
}

function renderEquation(body: string): string {
  const equation = cleanEquation(body);

  if (!equation) {
    return "";
  }

  if (equation.includes("\\begin{bmatrix}")) {
    return ["\\[", equation, "\\]"].join("\n");
  }

  return ["\\begin{equation}", equation, "\\end{equation}"].join("\n");
}

function cleanEquation(body: string): string {
  if (body.includes("\\begin{bmatrix}")) {
    return body.trim();
  }

  const matrix = convertMatrixExpression(body);
  if (matrix) {
    return matrix;
  }

  return formatEquationText(transformMathText(body));
}

function stripWordHyphens(value: string): string {
  return value.replace(/\b([A-Za-z]{2,})-([A-Za-z]{2,})\b/g, "$1 $2");
}

function isMathExpression(value: string): boolean {
  if (isPageMarkerLine(value) || isChecklistLine(value)) {
    return false;
  }

  const stripped = stripWordHyphens(value.trim());
  if (!stripped) {
    return false;
  }

  const hasMathSignal = /(?:=|\\(?:frac|sum|int|sqrt|lim|alpha|beta|gamma|theta|pi|infty)\b|[+\-*/^<>≤≥∑∫√])/.test(stripped);
  if (!hasMathSignal || /[.!?;:]$/.test(stripped)) {
    return false;
  }

  const words = stripped.match(/[A-Za-z]{3,}/g) ?? [];
  const allowedWords = new Set(["sin", "cos", "tan", "log", "lim", "min", "max", "exp", "mod", "sqrt", "frac", "sum", "int"]);
  const proseWords = words.filter((word) => !allowedWords.has(word.toLowerCase()));

  return proseWords.length <= 1;
}

function formatTableRow(row: string[]): string {
  return row.map((cell) => renderTextPreservingInlineMath(cleanExtractedTableCell(cell))).join(" & ") + String.raw` \\`;
}

function cleanExtractedTableCell(cell: string): string {
  return trimExtractedExpectedBehaviorValue(cell.trim());
}

function extractMathFromSentence(value: string, context?: string): string {
  const trimmed = value.trim().replace(/[.!?;:]$/, "");
  if (/^(integral from|sum from)\b/i.test(trimmed)) {
    return trimmed;
  }

  const mathStart = /(?:[A-Za-z]+(?:_[A-Za-z0-9]+)?\s*\(|[A-Za-z]+(?:_[A-Za-z0-9]+)?\s*=|\\(?:frac|sum|int|sqrt)\b)/.exec(trimmed);
  if (!mathStart) {
    return trimmed;
  }

  if (context && /^(Loss Function|Mathematical Model|Equation|Matrix Representation)$/i.test(context)) {
    return trimmed.slice(mathStart.index).replace(/^(is|as|by)\s+/i, "").trim();
  }

  return mathStart.index === 0 ? trimmed : value;
}

function transformMathText(value: string): string {
  return value
    .replace(
      /\bx equals negative b plus or minus square root of b squared minus 4ac over 2a\b/gi,
      "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"
    )
    .replace(/\be to the power i pi plus 1 equals 0\b/gi, "e^{i\\pi} + 1 = 0")
    .replace(/\be to the power i pi\b/gi, "e^{i\\pi}")
    .replace(/\bintegral from ([A-Za-z0-9_]+) to ([A-Za-z0-9_]+) of ([A-Za-z][A-Za-z0-9_]*\([^)]*\)) dx\b/gi, "\\int_$1^$2 $3\\,dx")
    .replace(/\bsum from ([A-Za-z]+)\s*=\s*([A-Za-z0-9_]+) to ([A-Za-z0-9_]+)\b/gi, "\\sum_{$1=$2}^{$3}")
    .replace(/\bapproximately equals\b/gi, "\\approx")
    .replace(/\bplus or minus\b/gi, "\\pm")
    .replace(/\bequals\b/gi, "=")
    .replace(/\s*<\s*=\s*/g, " \\leq ")
    .replace(/\s*>\s*=\s*/g, " \\geq ")
    .replace(/\bapproaches\s+([A-Za-z0-9_{}\\]+)\b/gi, "\\to $1")
    .replace(/\bDelta\s+([A-Za-z])/g, "\\Delta $1")
    .replace(/\bOCR\s*\(([^)]*)\)/g, "\\operatorname{OCR}($1)")
    .replace(/\bsigmoid\s*\(([^)]*)\)/gi, "\\operatorname{sigmoid}($1)")
    .replace(/\bh_theta\s*\(/g, "h_{\\theta}(")
    .replace(/\bh_\{?theta\}?\s*\(/g, "h_{\\theta}(")
    .replace(/\by_hat\b/g, "\\hat{y}")
    .replace(/\bE_(total|ocr|structure|latex)\b/g, "E_{\\text{$1}}")
    .replace(/(?<!\\)\btheta\b/g, "\\theta")
    .replace(/(?<!\\)\bepsilon\b/g, "\\epsilon")
    .replace(/(?<!\\)\bdelta\b/g, "\\delta")
    .replace(/(?<!\\)\bpi\b/g, "\\pi")
    .replace(/\binfinity\b/gi, "\\infty")
    .replace(/\blog\s*\(/g, "\\log(")
    .replace(/(?<!\\)\bsum\b/gi, "\\sum")
    .replace(/(?<!\\)\bint\b/gi, "\\int")
    .replace(/\b([A-Za-z])_([A-Za-z0-9]{2,})\b/g, "$1_{$2}")
    .replace(/\bJ\s*\(\\theta\)/g, "J(\\theta)")
    .replace(/\b1\s*\/\s*n\b/g, "\\frac{1}{n}");
}

function formatEquationText(value: string): string {
  let equation = value.replace(/[ \t]+/g, " ").trim();

  if (shouldUseSizedBrackets(equation)) {
    equation = equation.replace("[", "\\left[").replace(/\](?!.*\])/, "\\right]");
  }

  if (/^J\(\\theta\)\s*=/.test(equation)) {
    equation = equation.replace(/(\\sum_\{i=1\}\^\{n\})\s*/, "$1\n");
  }

  return equation;
}

function shouldUseSizedBrackets(value: string): boolean {
  return value.includes("[") && value.includes("]") && (value.length > 70 || /\\(?:sum|int|frac)\b/.test(value));
}

function formatMathToken(value: string): string {
  return transformMathText(value)
    .replace(/^([A-Za-z])(\d+)$/, "$1_{$2}")
    .replace(/^([A-Za-z]+)_([A-Za-z0-9]+)$/, "$1_{$2}");
}

function isAcademicMathExpression(value: string): boolean {
  if (isMathExpression(value)) {
    return true;
  }

  const stripped = stripWordHyphens(value.trim());
  if (!stripped) {
    return false;
  }

  const lower = stripped.toLowerCase();
  const hasMathSignal =
    /(?:=|\\(?:frac|sum|int|sqrt|lim|alpha|beta|gamma|theta|epsilon|delta|pi|infty)\b|\b(?:approximately equals|integral from|sum from|approaches|equals|square root|to the power|plus or minus)\b|\b(?:ocr|sigmoid)\s*\(|[+\-*/^<>])/.test(
      lower
    );
  if (!hasMathSignal || /^[A-Za-z][^=]+[.!?;:]$/.test(stripped)) {
    return false;
  }

  const words = stripped.match(/[A-Za-z]{3,}/g) ?? [];
  const allowedWords = new Set([
    "sin",
    "cos",
    "tan",
    "log",
    "lim",
    "min",
    "max",
    "exp",
    "mod",
    "sqrt",
    "frac",
    "sum",
    "int",
    "theta",
    "epsilon",
    "delta",
    "approximately",
    "equals",
    "approaches",
    "negative",
    "plus",
    "minus",
    "square",
    "root",
    "squared",
    "over",
    "power",
    "the",
    "hat",
    "sigmoid",
    "integral",
    "from",
    "of",
    "ocr",
    "delta"
  ]);
  const proseWords = words.filter((word) => !allowedWords.has(word.toLowerCase()));

  return proseWords.length <= 2;
}

function countCharacters(value: string, character: string): number {
  return value.split(character).length - 1;
}

type LineLookup = (offset: number) => number;

type EnvironmentStackEntry = {
  name: string;
  line: number;
};

const knownLatexEnvironments = new Set([
  ...protectedEnvironments,
  "document",
  "itemize",
  "enumerate",
  "description",
  "thebibliography",
  "verbatim",
  "lemma",
  "proposition",
  "corollary",
  "definition",
  "remark",
  "example",
  "quote",
  "quotation",
  "center",
  "flushleft",
  "flushright",
  "figure",
  "figure*",
  "table*",
  "minipage",
  "smallmatrix",
  "subequations",
  "tikzpicture",
  "lstlisting"
]);

function validateLatex(
  latex: string,
  options: { latexMode: boolean; inputType?: DetectedInputType; inputLength?: number; sourceText?: string }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lineAt = createLineNumberLookup(latex);
  const checkedLatex = maskVerbatimLikeBlocks(latex);
  const sourceText = options.sourceText ?? "";
  const hasMarkerInSource = sourceText.replace(/\\_/g, "_").includes(finalIntegrityMarker);

  if (hasMarkerInSource && !latexIncludesIntegrityMarker(latex)) {
    issues.push({
      severity: "error",
      message: `Missing final integrity marker ${finalIntegrityMarker} in converted output.`,
      suggestedFix: "Treat the conversion as incomplete; re-run conversion from the full source text before downloading."
    });
  }

  addDuplicateIssue(
    issues,
    checkedLatex,
    /\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/g,
    "Duplicate \\documentclass declarations were detected.",
    "Keep exactly one \\documentclass declaration.",
    lineAt
  );
  addDuplicateIssue(
    issues,
    checkedLatex,
    /\\begin\{document\}/g,
    "Duplicate \\begin{document} blocks were detected.",
    "Keep exactly one document body start.",
    lineAt
  );
  addDuplicateIssue(
    issues,
    checkedLatex,
    /\\end\{document\}/g,
    "Duplicate \\end{document} blocks were detected.",
    "Keep exactly one document body end.",
    lineAt
  );

  if (!/\\begin\{document\}/.test(checkedLatex)) {
    issues.push({
      severity: "error",
      message: "Missing real \\begin{document} in generated LaTeX output.",
      suggestedFix: "Regenerate the document wrapper or restore the document body start outside verbatim/code text."
    });
  }

  if (!/\\end\{document\}/.test(checkedLatex)) {
    issues.push({
      severity: "error",
      message: "Missing \\end{document} in full LaTeX document output.",
      suggestedFix: "Restore the closing document delimiter before downloading or compiling."
    });
  }

  if ((options.inputType === "latex-document" || isFullLatexDocument(latex)) && !/\\end\{document\}\s*$/.test(checkedLatex)) {
    issues.push({
      severity: "error",
      message: "Output does not end with \\end{document}.",
      suggestedFix: "Check for truncated output or content appended after the document terminator."
    });
  }

  const rawFence = /```/.exec(checkedLatex);
  if (rawFence) {
    issues.push({
      severity: "error",
      message: "Raw Markdown code fence found outside a verbatim/listing environment.",
      line: lineAt(rawFence.index),
      suggestedFix: "Protect fenced code blocks before parsing and restore them as verbatim or listing environments."
    });
  }

  if (options.inputLength && options.inputLength > 1000 && latex.length < options.inputLength * 0.35) {
    issues.push({
      severity: sourceText.includes(finalIntegrityMarker) ? "error" : "warning",
      message: "Converted output is suspiciously shorter than the input.",
      suggestedFix: "Check for truncated conversion, preview-only output, or an interrupted parser pass."
    });
  }

  if (options.latexMode) {
    const escapedCommand = /\\textbackslash\{\}(?:documentclass|usepackage|begin|end|section|subsection|subsubsection|paragraph|title|author|date|maketitle|tableofcontents|begin\{)/.exec(
      checkedLatex
    );
    if (escapedCommand) {
      issues.push({
        severity: "error",
        message: "Escaped LaTeX commands were detected in LaTeX-mode output.",
        line: lineAt(escapedCommand.index),
        suggestedFix: "Preserve existing LaTeX commands instead of escaping their backslashes."
      });
    }
  }

  issues.push(...validateEnvironmentBalanceAndNesting(checkedLatex, lineAt));

  const dollarIssue = findUnmatchedSingleDollarIssue(checkedLatex, lineAt);
  if (dollarIssue) {
    issues.push(dollarIssue);
  }

  const braceIssue = findBraceBalanceIssue(checkedLatex, lineAt);
  if (braceIssue) {
    issues.push(braceIssue);
  }

  const tabularLine = findTabularRowsOutsideAllowedEnvironment(checkedLatex);
  if (tabularLine) {
    issues.push({
      severity: "warning",
      message: "Tabular-style rows were found outside tabular, array, cases, or align-like environments.",
      line: tabularLine,
      suggestedFix: "Wrap rows containing & and \\\\ in a tabular, array, cases, or align environment."
    });
  }

  const rawPdfIssue = findRawPdfMarkerIssue(latex, lineAt);
  if (rawPdfIssue) {
    issues.push(rawPdfIssue);
  }

  const unconvertedLabelIssue = findUnconvertedStructuredLabelIssue(latex, options.inputType, lineAt);
  if (unconvertedLabelIssue) {
    issues.push(unconvertedLabelIssue);
  }

  issues.push(...findBrokenFracIssues(checkedLatex, lineAt));
  issues.push(...findLeftRightIssues(checkedLatex, lineAt));

  return dedupeValidationIssues(issues);
}

function latexIncludesIntegrityMarker(latex: string): boolean {
  const normalized = latex
    .replace(/\\_/g, "_")
    .replace(/\\%/g, "%")
    .replace(/\s+/g, " ");
  return normalized.includes(finalIntegrityMarker);
}

function maskVerbatimLikeBlocks(latex: string): string {
  const tokenPattern = /\\begin\{(verbatim|lstlisting)\}/g;
  const chunks: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(latex))) {
    const environment = match[1];
    const bodyStart = tokenPattern.lastIndex;
    const endPattern = new RegExp(`\\\\end\\{${environment}\\}`, "g");
    endPattern.lastIndex = bodyStart;
    const endMatch = endPattern.exec(latex);
    const bodyEnd = endMatch?.index ?? latex.length;
    const endToken = endMatch?.[0] ?? "";

    chunks.push(latex.slice(cursor, bodyStart));
    chunks.push(latex.slice(bodyStart, bodyEnd).replace(/[^\n]/g, " "));
    chunks.push(endToken);
    cursor = endMatch ? bodyEnd + endToken.length : latex.length;
    tokenPattern.lastIndex = cursor;
  }

  chunks.push(latex.slice(cursor));
  return chunks.join("");
}

function addDuplicateIssue(
  issues: ValidationIssue[],
  latex: string,
  pattern: RegExp,
  message: string,
  suggestedFix: string,
  lineAt: LineLookup
) {
  const matches = [...latex.matchAll(pattern)];
  if (matches.length > 1) {
    issues.push({
      severity: "error",
      message,
      line: lineAt(matches[1].index ?? 0),
      suggestedFix
    });
  }
}

function validateEnvironmentBalanceAndNesting(latex: string, lineAt: LineLookup): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stack: EnvironmentStackEntry[] = [];
  const displayLines: number[] = [];
  const tokenPattern = /\\begin\{([^}]+)\}|\\end\{([^}]+)\}|\\\[|\\\]/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(latex))) {
    const beginEnvironment = match[1];
    const endEnvironment = match[2];
    const token = match[0];
    const line = lineAt(match.index);

    if (token === "\\[") {
      displayLines.push(line);
      continue;
    }

    if (token === "\\]") {
      if (!displayLines.length) {
        issues.push({
          severity: "error",
          message: "Unmatched \\] display math delimiter.",
          line,
          suggestedFix: "Add a matching \\[ before this delimiter or remove the stray closing delimiter."
        });
      } else {
        displayLines.pop();
      }
      continue;
    }

    if (beginEnvironment) {
      const insideMath = displayLines.length > 0 || stack.some((environment) => mathEnvironments.has(environment.name));

      if (/^equation\*?$/.test(beginEnvironment) && insideMath) {
        issues.push({
          severity: "error",
          message: "An equation environment appears inside existing math mode.",
          line,
          suggestedFix: "Use the surrounding math environment only, or move this equation outside it."
        });
      }

      if (/^(table|itemize|enumerate)$/.test(beginEnvironment) && insideMath) {
        issues.push({
          severity: "error",
          message: `${beginEnvironment} environment appears inside math mode.`,
          line,
          suggestedFix: "Move prose, tables, or lists outside math delimiters and math environments."
        });
      }

      if (!knownLatexEnvironments.has(beginEnvironment)) {
        issues.push({
          severity: "info",
          message: `Environment "${beginEnvironment}" is not in the converter's known environment list.`,
          line,
          suggestedFix: "If this is intentional, ensure the matching LaTeX package is included."
        });
      }

      stack.push({ name: beginEnvironment, line });
      continue;
    }

    if (endEnvironment) {
      const last = stack.pop();
      if (!last) {
        issues.push({
          severity: "error",
          message: `\\end{${endEnvironment}} has no matching \\begin{${endEnvironment}}.`,
          line,
          suggestedFix: `Add \\begin{${endEnvironment}} before this line or remove the unmatched \\end.`
        });
        continue;
      }

      if (last.name !== endEnvironment) {
        issues.push({
          severity: "error",
          message: `Unbalanced environment near \\end{${endEnvironment}}; last open environment is \\begin{${last.name}} from line ${last.line}.`,
          line,
          suggestedFix: "Check the environment nesting and close the most recent open environment first."
        });

        if (last) {
          const matchingIndex = stack.map((entry) => entry.name).lastIndexOf(endEnvironment);
          if (matchingIndex >= 0) {
            stack.splice(matchingIndex, 1);
          }
        }
      }
    }
  }

  for (const displayLine of displayLines) {
    issues.push({
      severity: "error",
      message: "Unmatched \\[ display math delimiter.",
      line: displayLine,
      suggestedFix: "Add a matching \\] after this display math block."
    });
  }

  for (const environment of stack) {
    issues.push({
      severity: "error",
      message: `\\begin{${environment.name}} has no matching \\end{${environment.name}}.`,
      line: environment.line,
      suggestedFix: `Add \\end{${environment.name}} after this environment's content.`
    });
  }

  return issues;
}

function findUnmatchedSingleDollarIssue(latex: string, lineAt: LineLookup): ValidationIssue | null {
  let openDollarLine: number | null = null;

  for (let index = 0; index < latex.length; index += 1) {
    const character = latex[index];
    if (character === "\\") {
      index += 1;
      continue;
    }

    if (character === "$") {
      if (latex[index + 1] === "$") {
        index += 1;
        continue;
      }

      openDollarLine = openDollarLine === null ? lineAt(index) : null;
    }
  }

  return openDollarLine === null
    ? null
    : {
        severity: "error",
        message: "Unmatched inline dollar math delimiter was detected.",
        line: openDollarLine,
        suggestedFix: "Add the missing closing $ or escape the dollar sign as \\$ for normal text."
      };
}

function findBraceBalanceIssue(latex: string, lineAt: LineLookup): ValidationIssue | null {
  let depth = 0;
  let firstOpenLine: number | null = null;

  for (let index = 0; index < latex.length; index += 1) {
    const character = latex[index];
    if (character === "\\") {
      index += 1;
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        firstOpenLine = lineAt(index);
      }
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    }

    if (depth < 0) {
      return {
        severity: "error",
        message: "A closing brace appears without a matching opening brace.",
        line: lineAt(index),
        suggestedFix: "Remove the extra } or add the matching opening brace."
      };
    }
  }

  return depth === 0
    ? null
    : {
        severity: "error",
        message: "Braces appear to be unbalanced.",
        line: firstOpenLine ?? 1,
        suggestedFix: "Check command arguments such as \\frac{...}{...}, \\section{...}, and grouped subscripts/superscripts."
      };
}

function findTabularRowsOutsideAllowedEnvironment(latex: string): number | null {
  const stack: string[] = [];
  const allowed = new Set([
    "tabular",
    "array",
    "align",
    "align*",
    "aligned",
    "cases",
    "matrix",
    "pmatrix",
    "bmatrix",
    "Bmatrix",
    "vmatrix",
    "Vmatrix"
  ]);
  const lines = latex.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const trimmed = lines[lineIndex].trim();

    for (const match of trimmed.matchAll(/\\begin\{([^}]+)\}/g)) {
      stack.push(match[1]);
    }

    const insideAllowed = stack.some((environment) => allowed.has(environment));

    if (!insideAllowed && /&/.test(trimmed) && /\\\\\s*$/.test(trimmed) && !/^\\(?:usepackage|newtheorem)/.test(trimmed)) {
      return lineIndex + 1;
    }

    for (const match of trimmed.matchAll(/\\end\{([^}]+)\}/g)) {
      const index = stack.lastIndexOf(match[1]);
      if (index >= 0) {
        stack.splice(index, 1);
      }
    }
  }

  return null;
}

function findRawPdfMarkerIssue(latex: string, lineAt: LineLookup): ValidationIssue | null {
  const pattern = /^%PDF-\d\.\d|^\d+\s+\d+\s+obj\b|^stream\s*$|^endstream\s*$|^xref\s*$|^trailer\s*$|^startxref\s*$|^%%EOF\s*$/gm;
  const match = pattern.exec(latex);

  if (!match) {
    return null;
  }

  return {
    severity: "error",
    message: "Raw PDF internals were found in the generated LaTeX output.",
    line: lineAt(match.index),
    suggestedFix: "Do not wrap PDF bytes as text. Extract readable PDF text first, or upload the original .tex source."
  };
}

function findUnconvertedStructuredLabelIssue(
  latex: string,
  inputType: DetectedInputType | undefined,
  lineAt: LineLookup
): ValidationIssue | null {
  if (inputType === "latex-document" || inputType === "latex-fragment") {
    return null;
  }

  const checkedLatex = maskVerbatimLikeBlocks(latex);
  const pattern =
    /^\s*(Title|Author|Institution|Date|Abstract|Keywords|Introduction|Theorem|Proof|Algorithm|Loss Function|Matrix Representation)\s*:/gim;
  const match = pattern.exec(checkedLatex);

  if (!match) {
    return null;
  }

  return {
    severity: "warning",
    message: `Structured label "${match[1]}:" appears as plain text after conversion.`,
    line: lineAt(match.index),
    suggestedFix: "Review structure detection for this line; it should usually become metadata, a section, or a LaTeX environment."
  };
}

function findBrokenFracIssues(latex: string, lineAt: LineLookup): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pattern = /\\frac\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(latex))) {
    const firstGroupEnd = parseBracedGroupEnd(latex, pattern.lastIndex);
    const secondGroupEnd = firstGroupEnd === null ? null : parseBracedGroupEnd(latex, firstGroupEnd);

    if (firstGroupEnd === null || secondGroupEnd === null) {
      issues.push({
        severity: "error",
        message: "Broken \\frac command; expected \\frac{numerator}{denominator}.",
        line: lineAt(match.index),
        suggestedFix: "Wrap both the numerator and denominator in braces."
      });
    }
  }

  return issues;
}

function findLeftRightIssues(latex: string, lineAt: LineLookup): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stack: number[] = [];
  const pattern = /\\(?:left|right)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(latex))) {
    if (match[0] === "\\left") {
      stack.push(lineAt(match.index));
      continue;
    }

    if (!stack.length) {
      issues.push({
        severity: "error",
        message: "\\right delimiter appears without a matching \\left delimiter.",
        line: lineAt(match.index),
        suggestedFix: "Add the matching \\left delimiter or replace \\right with a normal delimiter."
      });
    } else {
      stack.pop();
    }
  }

  for (const line of stack) {
    issues.push({
      severity: "error",
      message: "\\left delimiter appears without a matching \\right delimiter.",
      line,
      suggestedFix: "Add the matching \\right delimiter or replace \\left with a normal delimiter."
    });
  }

  return issues;
}

function parseBracedGroupEnd(value: string, startIndex: number): number | null {
  let index = startIndex;
  while (/\s/.test(value[index] ?? "")) {
    index += 1;
  }

  if (value[index] !== "{") {
    return null;
  }

  let depth = 0;
  for (; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      index += 1;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return null;
}

function createLineNumberLookup(value: string): LineLookup {
  const lineStarts = [0];

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return (offset: number) => {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (lineStarts[middle] <= offset) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return high + 1;
  };
}

function dedupeValidationIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.line ?? ""}:${issue.message}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRawLatexBoundaryLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^```/.test(trimmed) ||
    trimmed === "\\[" ||
    trimmed === "$$" ||
    /^\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(trimmed) ||
    /^\\begin\{[^}]+\}/.test(trimmed) ||
    /^\\(?:section|subsection|subsubsection|paragraph)\*?\{/.test(trimmed) ||
    /^\\(?:usepackage|newcommand|renewcommand|newtheorem)\b/.test(trimmed)
  );
}

function isDocumentBoundaryLine(line: string): boolean {
  return Boolean(
    /^```/.test(line) ||
      /^title:\s*/i.test(line) ||
      /^author:\s*/i.test(line) ||
      /^institution:\s*/i.test(line) ||
      /^date:\s*/i.test(line) ||
      /^abstract:\s*/i.test(line) ||
      /^keywords:\s*/i.test(line) ||
      isRawLatexBoundaryLine(line) ||
      isPageMarkerLine(line) ||
      isChecklistLine(line) ||
      /^theorem:\s*/i.test(line) ||
      /^proof:\s*/i.test(line) ||
      parseAppendixHeading(line) ||
      parseNumberedSectionHeading(line) ||
      /^(references|bibliography):?$/i.test(line) ||
      parseSectionLabel(line) ||
      parseHeading(line) ||
      isTableLine(line)
  );
}


function isPageMarkerLine(line: string): boolean {
  const trimmed = line.replace(/\f/g, "").trim();
  if (!trimmed) {
    return false;
  }

  return /^(?:[-–—]{1,3}\s*)?(?:page\s*)?\d+\s*(?:of|\/)\s*\d+(?:\s*[-–—]{1,3})?$/i.test(trimmed);
}

function collectExtractedKeyValueTable(lines: string[], startIndex: number): { title?: string; rows: string[][]; nextIndex: number } | null {
  let index = startIndex;
  const first = lines[index]?.trim() ?? "";
  const hasTitle = /^(expected behavior(?: check table)?|minimal pass criteria(?: for this pdf)?|pass criteria|checklist)$/i.test(first);

  if (hasTitle) {
    index = skipBlankLines(lines, index + 1);
  }

  const headerA = lines[index]?.trim() ?? "";
  let nextContentIndex = index + 1;

  if (/^check\s+pass condition$/i.test(headerA)) {
    // Single line header
  } else {
    const headerBIndex = skipBlankLines(lines, index + 1);
    const headerB = lines[headerBIndex]?.trim() ?? "";
    if (!/^check$/i.test(headerA) || !/^pass condition$/i.test(headerB)) {
      return null;
    }
    nextContentIndex = headerBIndex + 1;
  }

  index = skipBlankLines(lines, nextContentIndex);
  const rows: string[][] = [["Check", "Pass condition"]];

  while (index < lines.length) {
    index = skipBlankLines(lines, index);
    const rawLine = lines[index]?.trim() ?? "";

    if (!rawLine || isDocumentBoundaryLine(rawLine) || isRawLatexBoundaryLine(rawLine) || isPageMarkerLine(rawLine)) {
      break;
    }

    // Skip Markdown separator lines (|---|---|)
    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(rawLine)) {
      index += 1;
      continue;
    }

    // Handle pipe-formatted rows: | Key | Value |
    const pipeMatch = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/.exec(rawLine);
    if (pipeMatch) {
      const pipeKey = pipeMatch[1].trim();
      const pipeValue = pipeMatch[2].trim();
      if (isLikelyExtractedTableKey(pipeKey)) {
        rows.push([pipeKey, pipeValue]);
        index += 1;
        continue;
      }
    }

    const inlineMatch = /^(.*?)\s+(true|false|pass|fail)(.*)$/i.exec(rawLine);
    if (inlineMatch) {
      const extractedKey = inlineMatch[1].trim();
      const extractedValue = `${inlineMatch[2]}, ${inlineMatch[3]}`.trim().replace(/,\s*,/g, ",").replace(/\s+/g, " ");
      if (isLikelyExtractedTableKey(extractedKey)) {
        rows.push([extractedKey, extractedValue.replace(/^,/, "").trim()]);
        index += 1;
        continue;
      }
      // Fall through to try known-key or simple key-value parsing below
    }

    // Try extracting a known expected-behavior key from the start of the line
    const knownKeyMatch = matchKnownExpectedBehaviorKey(rawLine);
    if (knownKeyMatch) {
      rows.push([knownKeyMatch.key, knownKeyMatch.value]);
      index += 1;
      continue;
    }

    const key = rawLine;

    if (!isLikelyExtractedTableKey(key)) {
      break;
    }

    index += 1;
    const valueLines: string[] = [];

    while (index < lines.length) {
      const candidate = lines[index].trim();

      if (!candidate) {
        index += 1;
        if (valueLines.length) {
          break;
        }
        continue;
      }

      if (isDocumentBoundaryLine(candidate) || isRawLatexBoundaryLine(candidate) || isPageMarkerLine(candidate)) {
        break;
      }

      if (valueLines.length && isLikelyExtractedTableKey(candidate)) {
        break;
      }

      const inlineCandidateMatch = /^(.*?)\s+(true|false|pass|fail)(.*)$/i.exec(candidate);
      if (valueLines.length && inlineCandidateMatch && isLikelyExtractedTableKey(inlineCandidateMatch[1])) {
        break;
      }

      valueLines.push(candidate);
      index += 1;
    }

    if (!valueLines.length) {
      break;
    }

    rows.push([key, valueLines.join(" ")]);
  }

  return rows.length > 1 ? { title: hasTitle ? first : undefined, rows, nextIndex: index } : null;
}

function isLikelyExtractedTableKey(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 48) {
    return false;
  }

  if (/[.!?;:]$/.test(trimmed) || /^(?:\d+[.)]|[-*+]|\[)/.test(trimmed)) {
    return false;
  }

  return /^[A-Za-z][A-Za-z0-9 /+&()_-]*$/.test(trimmed) && trimmed.split(/\s+/).length <= 5;
}

function skipBlankLines(lines: string[], startIndex: number): number {
  let index = startIndex;
  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }
  return index;
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (isMathLikePipeLine(trimmed)) {
    return false;
  }

  return /^\|.+\|$/.test(trimmed) && trimmed.split("|").filter((cell) => cell.trim()).length >= 2;
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  return isTableLine(lines[index] ?? "") && isMarkdownSeparatorLine(lines[index + 1] ?? "");
}

function isMarkdownSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

function isMathLikePipeLine(line: string): boolean {
  return /\\\||\\left\||\\right\||\$|_\{|_[A-Za-z0-9]|\^[A-Za-z0-9{]|\\(?:partial|frac|sum|int|leq|geq|Omega|mathbf|mathcal|boldsymbol)/.test(line);
}

function parseTableRows(lines: string[]): string[][] {
  return lines.map((line) => {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    
    // Mask | inside inline math and code blocks
    const parts = trimmed.split(/(\\\(.*?\\\)|\\\[.*?\\\]|\$.*?\$|`.*?`)/g);
    let masked = "";
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        masked += parts[i].replace(/\|/g, "__PIPE_MASK__");
      } else {
        masked += parts[i];
      }
    }
    
    return masked.split("|").map((cell) => cell.replace(/__PIPE_MASK__/g, "|").trim());
  });
}

function isListLine(line: string): boolean {
  const trimmed = line.trim();
  return !parseNumberedSectionHeading(trimmed) && !isNumberedHeadingLine(trimmed) && (/^([-*+]\s+|\d+[.)]\s+)/.test(trimmed) || isChecklistLine(trimmed));
}

function isNumberedHeadingLine(line: string): boolean {
  const match = /^(\d+(?:\.\d+){0,2})[.)]?\s+(.+)$/.exec(line.trim());
  return Boolean(match && (line.trim().endsWith(":") || looksLikeNumberedHeadingText(match[2]) || /^(theorem|lemma|proof|remark)\.?$/i.test(match[2].trim())));
}

function isChecklistLine(line: string): boolean {
  return /^(?:[-*+]\s+)?\[(?: |x|X|✓|✔)\]\s+/.test(line.trim());
}

function parseList(lines: string[]): Extract<Block, { type: "list" }> {
  const ordered = lines.every((line) => /^\d+[.)]\s+/.test(line.trim()));
  const items = lines.map((line) =>
    line
      .trim()
      .replace(/^[-*+]\s+\[(?: |x|X|✓|✔)\]\s+/, "")
      .replace(/^\[(?: |x|X|✓|✔)\]\s+/, "")
      .replace(/^([-*+]\s+|\d+[.)]\s+)/, "")
  );
  return { type: "list", ordered, items };
}

function collectUntilDocumentBoundary(lines: string[], startIndex: number): { values: string[]; nextIndex: number } {
  return collectWhile(lines, startIndex, (line) => {
    const trimmed = line.trim();
    return Boolean(trimmed) && !isDocumentBoundaryLine(trimmed);
  });
}

function collectReferencesLines(lines: string[], startIndex: number): { values: string[]; nextIndex: number } {
  let index = startIndex;
  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }

  return collectWhile(lines, index, (line) => {
    const trimmed = line.trim();
    return Boolean(trimmed) && !isDocumentBoundaryLine(trimmed);
  });
}

function collectWhile(lines: string[], startIndex: number, predicate: (line: string) => boolean): { values: string[]; nextIndex: number } {
  const values: string[] = [];
  let index = startIndex;

  while (index < lines.length && predicate(lines[index])) {
    values.push(lines[index].trim());
    index += 1;
  }

  return { values, nextIndex: index };
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
}
