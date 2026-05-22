# Research LaTeX Studio

A Next.js web application that converts plain text, OCR-extracted image text, and mixed research notes into clean, compilable academic LaTeX. Supports thesis-style structure including abstracts, headings, equations, tables, citations, algorithms, theorems, proofs, and references.

> **Portfolio project** — see [LICENSE](LICENSE) for usage terms.

## Features

- **Smart input detection** — automatically identifies LaTeX documents, Markdown, plain text, and mixed formats
- **Structural parsing** — title, author, institution, date, abstract, keywords, numbered sections, appendices
- **Math conversion** — natural language equations → LaTeX (`\begin{equation}`, `\begin{align}`, `\begin{cases}`)
- **Matrix support** — bracket notation → `\begin{bmatrix}` environments
- **Table extraction** — Markdown tables and extracted key-value tables → `\begin{tabular}`
- **Algorithm blocks** — step-numbered instructions → `\begin{enumerate}`
- **Theorem environments** — theorem, proof, lemma, remark → proper LaTeX environments
- **Citation handling** — `[Smith, 2024]` → `\cite{smith2024}`
- **Reference formatting** — numbered reference lists → `\begin{thebibliography}`
- **Pipeline diagrams** — `A -> B -> C` → display math with `\rightarrow`
- **OCR integration** — extract text from images via Tesseract.js or cloud providers
- **PDF text extraction** — upload PDFs and convert extracted text to LaTeX
- **Conversion modes** — "Display as Text" or "Recover Raw LaTeX" for embedded source
- **Validation** — structural validation with error/warning/info severity levels
- **Integrity markers** — `END_TEST_MARKER_OMEGA_999` completeness verification
- **Page marker handling** — OCR artifacts like `-- 1 of 3 --` become safe LaTeX comments
- **Code/verbatim preservation** — fenced code blocks stay in `\begin{verbatim}`

## Project Structure

```text
.
├── app/
│   ├── api/
│   │   ├── convert/route.ts      # Text-to-LaTeX API
│   │   ├── ocr/route.ts          # Image OCR API
│   │   └── pdf-extract/route.ts  # PDF text extraction API
│   ├── globals.css               # Responsive app styling
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── converter-shell.tsx       # Main web interface
├── lib/
│   ├── languages.ts              # Language metadata
│   ├── latex/
│   │   ├── converter.ts          # Plain text parsing and LaTeX rendering (~3200 lines)
│   │   ├── sanitize.ts           # LaTeX escaping helpers
│   │   └── types.ts
│   ├── ocr/
│   │   ├── index.ts              # OCR provider selector
│   │   ├── mock-provider.ts
│   │   ├── tesseract-provider.ts
│   │   └── types.ts
│   └── pdf/
│       └── extract.ts            # PDF text extraction
├── scripts/
│   └── test-latex-converter.mjs  # Regression test suite
├── fixtures/
│   └── hard-research-mixture-input.txt  # Hard fixture for regression testing
├── .env.example
├── LICENSE
├── package.json
├── next.config.mjs
└── tsconfig.json
```

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For fast UI work without real OCR:

```bash
# macOS / Linux
OCR_PROVIDER=mock npm run dev

# Windows PowerShell
$env:OCR_PROVIDER="mock"
npm run dev
```

## Quality Checks

```bash
npm test          # Regression tests (hard fixture + Z7 semantic tests)
npm run typecheck # TypeScript strict mode
npm run lint      # ESLint
npm run build     # Production build
```

## Conversion Modes

| Mode | Behavior |
| --- | --- |
| **Display as Text** (default) | Embedded LaTeX source is escaped so it renders as readable text in the generated document |
| **Recover Raw LaTeX** | When a complete `\documentclass` ... `\end{document}` is found in the input, it is returned as editable raw `.tex` source |

## Input Patterns

The converter recognizes these structural patterns:

```text
Title: Structured LaTeX Conversion
Author: Muhammad Tasin
Institution: Department of Computer Science
Date: May 2026
Abstract:
This becomes a LaTeX abstract.

Keywords:
OCR, LaTeX generation, handwriting recognition

1. Introduction:
This becomes prose under an Introduction section.

Loss Function:
J(theta) = 1/n sum from i=1 to n [...]

Mathematical Model:
Q(D) = 1 if C >= 0.90
Q(D) = 0.5 if 0.70 <= C < 0.90
Q(D) = 0 if C < 0.70

Matrix Representation:
X = [ [x_11, x_12], [x_21, x_22] ]

Optimization:
minimize E_total
subject to C >= 0.70

Theorem:
Every cleanly parsed structural label maps to a valid LaTeX block.

Proof:
The parser detects academic labels and renders each block correctly.

Algorithm:
Step 1: Upload an image or enter plain text.
Step 2: Apply OCR to extract raw text.
Step 3: Convert the cleaned text into LaTeX.

| Method | Accuracy |
| --- | --- |
| OCR | 92% |

References
- [1] I. Goodfellow et al., Deep Learning, MIT Press, 2016.
```

## Suggested OCR Tools

- **Local starter**: Tesseract.js
- **Production scale**: Google Cloud Vision, Azure AI Vision, AWS Textract
- **Handwriting**: Google Cloud Vision, Azure AI Vision
- **Handwritten equations**: Mathpix
- **Mixed notes**: Multimodal LLM pipeline with human review

## Deployment

This is a standard Next.js application. Deploy to Vercel:

1. Push to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Set environment variables from `.env.example`
4. Deploy

Or build locally:

```bash
npm run build
npm start
```

## License

Portfolio / recruitment-review-only. See [LICENSE](LICENSE).
