import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.join(process.cwd(), "benchmark-results");

function run() {
  const beforeJson = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "before-all-tests.json"), "utf8"));
  const afterJson = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "after-all-tests.json"), "utf8"));

  const beforeAcc = beforeJson.reduce((acc, r) => acc + r.accuracy, 0) / beforeJson.length;
  const afterAcc = afterJson.reduce((acc, r) => acc + r.accuracy, 0) / afterJson.length;
  const improvement = afterAcc - beforeAcc;

  const groups = [...new Set(beforeJson.map(r => r.sourceGroup))];

  let md = "# Comparison Report: LaTeX Converter Improvements\n\n";
  md += `| Category | Before | After | Improvement |\n`;
  md += `|---|---|---|---|\n`;
  md += `| **Overall Accuracy** | ${beforeAcc.toFixed(2)}% | ${afterAcc.toFixed(2)}% | **+${improvement.toFixed(2)}%** |\n`;

  for (const group of groups) {
    const bGroup = beforeJson.filter(r => r.sourceGroup === group);
    const aGroup = afterJson.filter(r => r.sourceGroup === group);
    const bAcc = bGroup.reduce((acc, r) => acc + r.accuracy, 0) / (bGroup.length || 1);
    const aAcc = aGroup.reduce((acc, r) => acc + r.accuracy, 0) / (aGroup.length || 1);
    md += `| ${group} | ${bAcc.toFixed(2)}% | ${aAcc.toFixed(2)}% | +${(aAcc - bAcc).toFixed(2)}% |\n`;
  }

  md += `\n## Per-File Before/After Table\n\n`;
  md += `| File | Group | Before Acc | After Acc | Status Change | Explanation (After) |\n`;
  md += `|---|---|---|---|---|---|\n`;

  for (let i = 0; i < beforeJson.length; i++) {
    const b = beforeJson[i];
    // Find matching file in afterJson by name
    const a = afterJson.find(r => r.fileName === b.fileName) || { accuracy: 0, conversionSucceeded: false, explanation: "Missing in after" };
    const statusChange = b.conversionSucceeded === a.conversionSucceeded ? "No Change" : (a.conversionSucceeded ? "FIXED" : "REGRESSION");
    md += `| ${b.fileName} | ${b.sourceGroup} | ${b.accuracy.toFixed(1)}% | ${a.accuracy.toFixed(1)}% | ${statusChange} | ${a.explanation} |\n`;
  }

  md += `\n## Remaining Failures\n\n`;
  const failures = afterJson.filter(r => !r.conversionSucceeded || r.accuracy < 80);
  for (const f of failures) {
    md += `- **${f.fileName}** (${f.accuracy.toFixed(1)}%): ${f.explanation}\n`;
  }

  md += `\n## Top Unsupported LaTeX Constructs\n\n`;
  const unsupported = afterJson.flatMap(r => r.unsupportedCommands).filter((v, i, a) => a.indexOf(v) === i);
  for (const u of unsupported.slice(0, 10)) {
    md += `- \\\\${u}\n`;
  }

  md += `\n## Next Recommended Fix\n\n`;
  md += `Improve environment balancing for complex nested environments like \`tabular\` and \`align\`, especially in large documentation files where these might be broken across many lines or nested deeply.\n`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "comparison-all-tests.md"), md);
  console.log("Comparison report generated: benchmark-results/comparison-all-tests.md");
}

run();
