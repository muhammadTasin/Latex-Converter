# LaTeX Converter Starter

A Next.js starter app that converts plain text and OCR-extracted image text into clean academic LaTeX. It supports thesis/research-style structure such as abstracts, headings, paragraphs, lists, equations, tables, citations, and references.

## Project Structure

```text
.
├── app/
│   ├── api/
│   │   ├── convert/route.ts      # Text-to-LaTeX API
│   │   └── ocr/route.ts          # Image OCR API
│   ├── globals.css               # Responsive app styling
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── converter-shell.tsx       # Main web interface
├── lib/
│   ├── languages.ts              # Language metadata and expansion point
│   ├── latex/
│   │   ├── converter.ts          # Plain text parsing and LaTeX rendering
│   │   ├── sanitize.ts           # LaTeX escaping helpers
│   │   └── types.ts
│   └── ocr/
│       ├── index.ts              # OCR provider selector
│       ├── mock-provider.ts
│       ├── tesseract-provider.ts
│       └── types.ts
├── .env.example
├── package.json
├── next.config.mjs
└── tsconfig.json
```

## Implementation Plan

1. Text conversion foundation
   - Parse source text into semantic blocks: abstract, headings, paragraphs, equations, lists, tables, and references.
   - Escape LaTeX-sensitive characters.
   - Render a complete `article` document with common academic packages.
   - Preserve simple citation placeholders such as `[Smith, 2024]` as `\cite{smith2024}`.

2. OCR pipeline
   - Accept image uploads in `app/api/ocr/route.ts`.
   - Use `OCR_PROVIDER=tesseract` for local printed-text OCR.
   - Use `OCR_PROVIDER=mock` for UI development without OCR runtime cost.
   - Tesseract language data is cached in `.ocr-cache` by default after the first successful run.
   - Add hosted providers behind the `OcrProvider` interface for handwriting, equations, and better multilingual accuracy.

3. Handwriting and equation recognition
   - Keep handwriting as a mode flag in the UI and API.
   - Apply conservative cleanup to OCR text before conversion.
   - For production, prefer Mathpix for handwritten math, Google Cloud Vision or Azure AI Vision for general handwriting, or a multimodal LLM pipeline for mixed research notes.

4. Language expansion
   - English is enabled by default.
   - Add language metadata in `lib/languages.ts`.
   - Add OCR language packs or provider-specific language codes.
   - Add language-specific structure rules in `lib/latex/converter.ts` as the parser grows.

5. PDF export
   - The starter includes copy and `.tex` download.
   - Add a server route that runs a LaTeX compiler such as `tectonic` or `latexmk` in a sandboxed job to enable PDF preview/export.

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

For fast UI work without real OCR:

```bash
OCR_PROVIDER=mock npm run dev
```

On Windows PowerShell:

```powershell
$env:OCR_PROVIDER="mock"
npm run dev
```

This starter follows the current Next.js manual-install guidance: Node.js 20.9 or newer, App Router, TypeScript, and package-manager installation of `next@latest`, `react@latest`, and `react-dom@latest`.

## Input Patterns

The converter recognizes these starter patterns:

```text
Title: Structured LaTeX Conversion
Author: Muhammad Tasin
Institution: Department of Computer Science, Independent Research Project
Date: May 2026
Abstract:
This becomes a LaTeX abstract.

Keywords:
OCR, LaTeX generation, handwriting recognition

1. Introduction:
This becomes prose under an Introduction section.

2. Problem Statement:
Research notes often mix prose, equations, references, and OCR artifacts.

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
The parser removes metadata from the body and renders each block with the matching LaTeX environment.

Algorithm:
Step 1: Upload an image or enter plain text.
Step 2: Apply OCR to extract raw text from the image.
Step 3: Convert the cleaned text into LaTeX.

Table:
| Method | Accuracy |
| --- | --- |
| OCR | 92% |

References
- [1] I. Goodfellow, Y. Bengio, and A. Courville, Deep Learning, MIT Press, 2016.
```

## Suggested OCR Tools

- Printed text, local starter: Tesseract.js
- Printed text, production scale: Google Cloud Vision, Azure AI Vision, AWS Textract
- Handwriting: Google Cloud Vision, Azure AI Vision
- Handwritten equations and STEM notes: Mathpix
- Mixed notes and cleanup: multimodal LLM pipeline with human review

## Next Steps

- Add unit tests for parser block detection and LaTeX escaping.
- Add Mathpix or cloud OCR provider implementation.
- Add `.bib` export alongside `thebibliography`.
- Add a sandboxed PDF compilation worker.
- Add authenticated project storage for uploaded images and generated documents.
