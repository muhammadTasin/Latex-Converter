# Aggressive LaTeX Download Benchmark Report

## Scores
- Project Handling: 100.00%
- Full-Document Classification: 85.71%
- Dependency-Library Accuracy: 100.00%
- Bibliography Accuracy: 100.00%
- Fragment Classification: 100.00%
- Fragment Validation: 100.00%
- Raw Preservation: 97.56%
- Compile/Status Accuracy: 50.00%
- **Overall Aggressive Benchmark Accuracy: 81.48%**

## Project Summary
| Project | Files | Status | Compile | Warnings | Issues |
|---|---|---|---|---|---|
| arXiv-1709.06005v2 | 2 | compile-failed | failed | 4 | 107 |
| arXiv-1809.00384v1 | 1 | validation-warning | unavailable | 3 | 35 |
| arXiv-1809.03842v8 | 2 | compile-failed | failed | 3 | 1 |
| arXiv-2310.00367v2 | 39 | compile-failed | failed | 6 | 1 |
| completeness_validator_fix_bundle | 2 | failed | unavailable | 5 | 3 |
| latex-converter-final-all-phases-fix | 2 | converted | unavailable | 2 | 0 |
| pdf_quality_modes_fix_bundle | 1 | converted | unavailable | 2 | 0 |

## Top 10 Bugs
1. **classifier bug**: Missed full document in `completeness_validator_fix_bundle/completeness_validator_fix_bundle\scripts\fixtures\hard_research_mixture_input.txt`
2. **converter bug**: Lost environments: tabular, table, align, equation, cases in `completeness_validator_fix_bundle/completeness_validator_fix_bundle\scripts\fixtures\hard_research_mixture_input.txt`

## Errors During Benchmark


## Conclusion
Needs more work. Some edge cases in classification or environment preservation found.
