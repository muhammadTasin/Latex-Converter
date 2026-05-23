# Downloads Full Benchmark Report

## Scores
- Project Handling: 100.00%
- Full-Document Classification: 100.00%
- Dependency-Library Accuracy: 100.00%
- Bibliography Accuracy: 100.00%
- Fragment Classification: 100.00%
- Fragment Validation: 96.50%
- Raw Preservation: 99.38%
- Compile/Status Accuracy: 85.00%
- **Overall Aggressive Benchmark Accuracy: 97.61%**

## Project Summary
| Project | Files | Status | Compile | Warnings | Issues |
|---|---|---|---|---|---|
| arXiv-1409.0473v7 | 5 | preserved | unavailable | 4 | 0 |
| arXiv-1706.03762v7 | 11 | preserved | unavailable | 3 | 0 |
| arXiv-1709.06005v2 | 2 | compile-failed | failed | 4 | 107 |
| arXiv-1809.00384v1 | 1 | validation-warning | unavailable | 3 | 35 |
| arXiv-1809.03842v8 | 2 | compile-failed | failed | 3 | 1 |
| arXiv-2005.14165v4 | 97 | preserved | unavailable | 3 | 0 |
| arXiv-2310.00367v2 | 39 | compile-failed | failed | 6 | 1 |
| completeness_validator_fix_bundle | 2 | converted | unavailable | 2 | 0 |
| latex-converter-final-all-phases-fix | 2 | converted | unavailable | 2 | 0 |
| pdf_quality_modes_fix_bundle | 1 | converted | unavailable | 2 | 0 |

## Single File Summary (Sample)
| File | Project | Role | Status | Raw Match | Input Len | Output Len |
|---|---|---|---|---|---|---|
| fancyhdr.sty | arXiv-1409.0473v7 | dependency | preserved | true | 21006 | 21006 |
| iclr2015.sty | arXiv-1409.0473v7 | dependency | preserved | true | 9637 | 9637 |
| main.tex | arXiv-1409.0473v7 | fragment | fragment-preserved | true | 35055 | 35055 |
| search.tex | arXiv-1409.0473v7 | main-document | preserved | true | 4361 | 4361 |
| supp.tex | arXiv-1409.0473v7 | fragment | fragment-preserved | true | 18331 | 18331 |
| background.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 8376 | 8376 |
| introduction.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 5300 | 5300 |
| model_architecture.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 17109 | 17109 |
| ms.tex | arXiv-1706.03762v7 | main-document | preserved | true | 17611 | 17611 |
| nips_2017.sty | arXiv-1706.03762v7 | dependency | preserved | true | 10347 | 10347 |
| parameter_attention.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 3489 | 3489 |
| results.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 11800 | 11800 |
| sqrt_d_trick.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 2226 | 2226 |
| training.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 4444 | 4444 |
| visualizations.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 1543 | 1543 |
| why_self_attention.tex | arXiv-1706.03762v7 | fragment | fragment-preserved | true | 7867 | 7867 |
| manual.tex | arXiv-1709.06005v2 | main-document | preserved-with-warnings | true | 143603 | 143603 |
| tikz-network.sty | arXiv-1709.06005v2 | dependency | preserved | true | 52495 | 52495 |
| manuskryptszarek.tex | arXiv-1809.00384v1 | main-document | preserved-with-warnings | true | 75325 | 75325 |
| quantikz_manual_new.tex | arXiv-1809.03842v8 | main-document | preserved | true | 82709 | 82709 |

## Top Bugs
1. **converter bug**: Lost environments: tabular, table, align, equation, cases. Reason: No significant LaTeX markers found; treating as plain text. in `completeness_validator_fix_bundle/completeness_validator_fix_bundle\scripts\fixtures\hard_research_mixture_input.txt`

## Errors During Benchmark

