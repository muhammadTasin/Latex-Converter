# Comparison Report: LaTeX Converter Improvements

| Metric | Before | After | Improvement |
|---|---|---|---|
| **Overall Accuracy** | 58.93% | 66.00% | **+7.07%** |
| Existing Project Tests | 99.60% | 99.60% | +0.00% |
| New Hard LaTeX Tests | 38.60% | 49.20% | +10.60% |

## Per-File Before/After Table

| File | Group | Before Acc | After Acc | Status Change | Explanation (After) |
|---|---|---|---|---|---|
| advanced-latex-conversion-input.txt | existing project test | 100.0% | 100.0% | No Change | Success |
| hard-research-mixture-input.txt | existing project test | 100.0% | 100.0% | No Change | Success |
| quantikz_manual_new.tex | existing project test | 100.0% | 100.0% | No Change | Success |
| tikzlibraryquantikz2.code.tex | existing project test | 98.0% | 98.0% | No Change | Success |
| ultra-hard-output-consistency-input.txt | existing project test | 100.0% | 100.0% | No Change | Success |
| 01-biblatex.tex | new hard LaTeX test | 0.0% | 0.0% | No Change | Unbalanced environment near \end{ltxexample}; last open environment is \begin{document} from line 4311. |
| 02-pgfmanual-main-body.tex | new hard LaTeX test | 100.0% | 100.0% | No Change | Success |
| 03-tcolorbox.tex | new hard LaTeX test | 100.0% | 100.0% | No Change | Success |
| 04-beameruserguide.tex | new hard LaTeX test | 100.0% | 100.0% | No Change | Success |
| 05-hyperref-doc.tex | new hard LaTeX test | 32.0% | 72.0% | No Change | \begin{document} has no matching \end{document}. |
| 06-amsmath.dtx | new hard LaTeX test | 0.0% | 0.0% | No Change | Output does not end with \end{document}. |
| 07-classes.dtx | new hard LaTeX test | 0.0% | 48.0% | FIXED | Success |
| 08-l3doc.dtx | new hard LaTeX test | 0.0% | 18.0% | FIXED | Success |
| 09-l3str.dtx | new hard LaTeX test | 0.0% | 0.0% | No Change | Output does not end with \end{document}. |
| 10-pgfplotstable.tex | new hard LaTeX test | 54.0% | 54.0% | No Change | Unbalanced environment near \end{document}; last open environment is \begin{tabular} from line 112. |

## Remaining Failures

- **01-biblatex.tex** (0.0%): Unbalanced environment near \end{ltxexample}; last open environment is \begin{document} from line 4311.
- **05-hyperref-doc.tex** (72.0%): \begin{document} has no matching \end{document}.
- **06-amsmath.dtx** (0.0%): Output does not end with \end{document}.
- **07-classes.dtx** (48.0%): Success
- **08-l3doc.dtx** (18.0%): Success
- **09-l3str.dtx** (0.0%): Output does not end with \end{document}.
- **10-pgfplotstable.tex** (54.0%): Unbalanced environment near \end{document}; last open environment is \begin{tabular} from line 112.

## Top Unsupported LaTeX Constructs


## Next Recommended Fix

Improve environment balancing for complex nested environments like `tabular` and `align`, especially in large documentation files where these might be broken across many lines or nested deeply.
