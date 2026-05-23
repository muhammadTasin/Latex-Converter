# Research LaTeX Studio Beta

**High-fidelity LaTeX recovery and conversion for academic documents.**

Research LaTeX Studio is a Next.js web application that converts plain text, OCR-extracted image text, and mixed research notes into clean, compilable academic LaTeX. It specializes in thesis-style structure including abstracts, headings, equations, tables, citations, algorithms, theorems, proofs, and references.

> **Status: Beta** — Academic/Project recovery is production-grade (100% accuracy on standard papers). Documentation-source and macro-heavy files are in active development.

## Features

- **Smart input detection** — automatically identifies LaTeX documents, fragments, Markdown, plain text, and bibliographies.
- **Structural parsing** — title, author, institution, date, abstract, keywords, numbered sections, appendices.
- **Math conversion** — natural language equations → LaTeX (`\begin{equation}`, `\begin{align}`, `\begin{cases}`).
- **Matrix support** — bracket notation → `\begin{bmatrix}` environments.
- **Table extraction** — Markdown tables and extracted key-value tables → `\begin{tabular}`.
- **Algorithm blocks** — step-numbered instructions → `\begin{enumerate}` or `algorithmic`.
- **Theorem environments** — theorem, proof, lemma, remark → proper LaTeX environments.
- **Citation handling** — `[Smith, 2024]` → `\cite{smith2024}`.
- **Reference formatting** — numbered reference lists → `\begin{thebibliography}`.
- **OCR integration** — extract text from images via Tesseract.js or cloud providers.
- **PDF text extraction** — upload PDFs and convert extracted text to LaTeX.

## Supported Input

- **.tex** — Full LaTeX documents or fragments.
- **.bib** — BibTeX bibliography files (preserved as raw source).
- **.sty / .cls** — LaTeX packages and classes (preserved as raw source).
- **tikzlibrary*.code.tex** — TikZ libraries.
- **.dtx / .ins** — LaTeX documentation sources (Beta support).
- **.md / .txt** — Markdown or plain text research notes.
- **Images** — JPG, PNG, WebP (processed via OCR).
- **PDF** — Text extraction (best-effort recovery).

## Benchmark Summary

The converter is continuously validated against a "Torture Test" suite of 20+ hard real-world LaTeX files.

| Category | Accuracy | Status |
|---|---|---|
| **Academic/Research Papers** | **100%** | **Industry-grade** |
| **Bibliography (.bib)** | **100%** | **Production-ready** |
| **Dependency (.sty/.cls)** | **100%** | **Production-ready** |
| **LaTeX Fragments** | **100%** | **Production-ready** |
| **Mixed Prose + LaTeX** | **100%** | **Production-ready** |
| **Documentation (.dtx)** | **~77%** | **Beta** |

## Known Limitations

- **OCR/PDF reconstruction** is best-effort and depends on the quality of the source layer.
- **Compile validation** requires a local TeX environment or a connected compiler service.
- **Missing assets**: Missing images, `.bib`, or custom `.sty` files will cause local compile warnings.
- **Macro-heavy documentation**: Complex `.dtx` files or manuals using dynamic TeX constructs (like `\end{\@currenvir}`) may trigger environment-balancing warnings.
- **Large files**: Files over 2MB should be uploaded in smaller chunks for optimal performance.

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Checks

```bash
npm test          # Regression tests
npm run typecheck # TypeScript strict mode
npm run lint      # ESLint
npm run build     # Production build
```

## Deployment

Deploy to Vercel in seconds:

1. Push to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Set environment variables (see `.env.example`).
4. Deploy.

## License

Portfolio / recruitment-review-only. See [LICENSE](LICENSE).
