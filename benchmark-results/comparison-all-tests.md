# Comparison Report: LaTeX Converter Improvements

| Category | Before | After | Improvement |
|---|---|---|---|
| **Overall Accuracy** | 60.73% | 79.55% | **+18.82%** |
| academic/project document | 100.00% | 100.00% | +0.00% |
| fragment | 100.00% | 100.00% | +0.00% |
| dependency-library | 100.00% | 100.00% | +0.00% |
| documentation-source | 16.67% | 76.67% | +60.00% |
| mixed prose + LaTeX | 100.00% | 100.00% | +0.00% |
| bibliography | 100.00% | 100.00% | +0.00% |
| new hard LaTeX test | 38.60% | 62.00% | +23.40% |

## Per-File Before/After Table

| File | Group | Before Acc | After Acc | Status Change | Explanation (After) |
|---|---|---|---|---|---|
| advanced-latex-conversion-input.txt | academic/project document | 100.0% | 100.0% | No Change | Success |
| hard-research-mixture-input.txt | academic/project document | 100.0% | 100.0% | No Change | Success |
| ultra-hard-output-consistency-input.txt | academic/project document | 100.0% | 100.0% | No Change | Success |
| quantikz_manual_new.tex | fragment | 100.0% | 100.0% | No Change | Success |
| tikzlibraryquantikz2.code.tex | dependency-library | 100.0% | 100.0% | No Change | Success |
| doc-source-dtx.dtx | documentation-source | 0.0% | 90.0% | FIXED | Success |
| doc-source-ins.ins | documentation-source | 0.0% | 90.0% | FIXED | Success |
| doc-source-ltxdoc.tex | documentation-source | 50.0% | 50.0% | No Change | \begin{document} has no matching \end{document}. |
| mixed-prose-latex.txt | mixed prose + LaTeX | 100.0% | 100.0% | No Change | Success |
| bib-with-documentclass.bib | bibliography | 100.0% | 100.0% | No Change | Success |
| sty-with-article.sty | dependency-library | 100.0% | 100.0% | No Change | Success |
| tikzlibrarymylib.code.tex | dependency-library | 100.0% | 100.0% | No Change | Success |
| 01-biblatex.tex | new hard LaTeX test | 0.0% | 72.0% | No Change | \begin{document} has no matching \end{document}. |
| 02-pgfmanual-main-body.tex | new hard LaTeX test | 100.0% | 100.0% | No Change | Success |
| 03-tcolorbox.tex | new hard LaTeX test | 100.0% | 100.0% | No Change | Success |
| 04-beameruserguide.tex | new hard LaTeX test | 100.0% | 100.0% | No Change | Success |
| 05-hyperref-doc.tex | new hard LaTeX test | 32.0% | 32.0% | No Change | Duplicate \begin{document} blocks were detected. |
| 06-amsmath.dtx | new hard LaTeX test | 0.0% | 0.0% | FIXED | Unbalanced environment near \end{\@currenvir}; last open environment is \begin{\@xp\@gobble\string#1} from line 2565. |
| 07-classes.dtx | new hard LaTeX test | 0.0% | 32.0% | FIXED | Unbalanced environment near \end{titlepage}; last open environment is \begin{document} from line 22. |
| 08-l3doc.dtx | new hard LaTeX test | 0.0% | 32.0% | FIXED | Unbalanced environment near \end{\@currenvir}; last open environment is \begin{document} from line 22. |
| 09-l3str.dtx | new hard LaTeX test | 0.0% | 98.0% | FIXED | Success |
| 10-pgfplotstable.tex | new hard LaTeX test | 54.0% | 54.0% | No Change | Unbalanced environment near \end{document}; last open environment is \begin{tabular} from line 112. |

## Remaining Failures

- **doc-source-ltxdoc.tex** (50.0%): \begin{document} has no matching \end{document}.
- **01-biblatex.tex** (72.0%): \begin{document} has no matching \end{document}.
- **05-hyperref-doc.tex** (32.0%): Duplicate \begin{document} blocks were detected.
- **06-amsmath.dtx** (0.0%): Unbalanced environment near \end{\@currenvir}; last open environment is \begin{\@xp\@gobble\string#1} from line 2565.
- **07-classes.dtx** (32.0%): Unbalanced environment near \end{titlepage}; last open environment is \begin{document} from line 22.
- **08-l3doc.dtx** (32.0%): Unbalanced environment near \end{\@currenvir}; last open environment is \begin{document} from line 22.
- **10-pgfplotstable.tex** (54.0%): Unbalanced environment near \end{document}; last open environment is \begin{tabular} from line 112.

## Top Unsupported LaTeX Constructs


## Next Recommended Fix

Improve environment balancing for complex nested environments like `tabular` and `align`, especially in large documentation files where these might be broken across many lines or nested deeply.
