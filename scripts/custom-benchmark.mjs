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
    const relativePath = request.slice(2);
    for (const ext of [".ts", ".tsx", ".js"]) {
        const fullPath = path.join(workspaceRoot, relativePath) + ext;
        if (fs.existsSync(fullPath)) return fullPath;
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React
    }
  }).outputText;
  module._compile(output, filename);
};

require.extensions[".tsx"] = require.extensions[".ts"];

const { convertTextToLatex } = require("../lib/latex/converter.ts");

const HARD_TESTS_DIR = "C:\\Users\\muham\\Downloads\\latex-hard-tests";
const FIXTURES_DIR = path.join(workspaceRoot, "fixtures");
const OUTPUT_DIR = path.join(workspaceRoot, "benchmark-results");

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const filesToTest = [
  { group: "existing project test", path: path.join(FIXTURES_DIR, "advanced-latex-conversion-input.txt") },
  { group: "existing project test", path: path.join(FIXTURES_DIR, "hard-research-mixture-input.txt") },
  { group: "existing project test", path: path.join(FIXTURES_DIR, "quantikz_manual_new.tex") },
  { group: "existing project test", path: path.join(FIXTURES_DIR, "tikzlibraryquantikz2.code.tex") },
  { group: "existing project test", path: path.join(FIXTURES_DIR, "ultra-hard-output-consistency-input.txt") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "01-biblatex.tex") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "02-pgfmanual-main-body.tex") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "03-tcolorbox.tex") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "04-beameruserguide.tex") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "05-hyperref-doc.tex") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "06-amsmath.dtx") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "07-classes.dtx") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "08-l3doc.dtx") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "09-l3str.dtx") },
  { group: "new hard LaTeX test", path: path.join(HARD_TESTS_DIR, "10-pgfplotstable.tex") },
];

function calculateAccuracy(input, result) {
  let score = 100;
  const { latex, validationIssues, metadata } = result;
  
  if (metadata.status === "failed" || metadata.status === "converter-failed") return 0;
  
  const fatalErrors = validationIssues.filter(i => i.severity === "error");
  score -= fatalErrors.length * 20;

  const commonEnvs = ["tabular", "align", "equation", "cases", "tikzpicture", "verbatim", "lstlisting"];
  for (const env of commonEnvs) {
    const inInput = (input.match(new RegExp(`\\\\begin\\{${env}\\}`, "g")) || []).length;
    const inOutput = (latex.match(new RegExp(`\\\\begin\\{${env}\\}`, "g")) || []).length;
    if (inInput > inOutput) score -= (inInput - inOutput) * 10;
  }

  const inputMath = (input.match(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g) || []).length;
  const outputMath = (latex.match(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g) || []).length;
  if (inputMath > outputMath) score -= (inputMath - outputMath) * 10;

  score -= result.warnings.length * 2;

  if (latex.length < input.length * 0.2 && input.length > 500) score -= 40;
  
  return Math.max(0, score);
}

async function run() {
  const results = [];
  for (const testCase of filesToTest) {
    if (!fs.existsSync(testCase.path)) {
      results.push({
          sourceGroup: testCase.group,
          fileName: path.basename(testCase.path),
          filePath: testCase.path,
          fileSize: 0,
          parsingSucceeded: false,
          conversionSucceeded: false,
          warnings: 0,
          errors: 0,
          failedConstructs: [],
          unsupportedCommands: [],
          runtime: 0,
          outputLength: 0,
          accuracy: 0,
          explanation: "File not found"
      });
      continue;
    }
    const input = fs.readFileSync(testCase.path, "utf8");
    const startTime = Date.now();
    let result;
    let error = null;
    try {
      result = convertTextToLatex({ text: input, filename: path.basename(testCase.path), fileSize: fs.statSync(testCase.path).size });
    } catch (e) {
      error = e.message;
    }
    const endTime = Date.now();
    
    const errors = result?.validationIssues.filter(i => i.severity === "error") || [];
    const warnings = result?.warnings || [];
    
    const entry = {
      sourceGroup: testCase.group,
      fileName: path.basename(testCase.path),
      filePath: testCase.path,
      fileSize: fs.statSync(testCase.path).size,
      parsingSucceeded: !!result && result.metadata.status !== "failed",
      conversionSucceeded: !!result && !["failed", "converter-failed"].includes(result.metadata.status),
      warnings: warnings.length,
      errors: errors.length,
      failedConstructs: errors.map(e => e.message.match(/env|command|block|group/i)?.[0] || "unknown").filter((v, i, a) => a.indexOf(v) === i),
      unsupportedCommands: warnings.filter(w => w.toLowerCase().includes("unsupported")).map(w => w.match(/\\(\w+)/)?.[1]).filter(Boolean),
      runtime: endTime - startTime,
      outputLength: result?.latex.length || 0,
      accuracy: result ? calculateAccuracy(input, result) : 0,
      explanation: error || (errors[0]?.message || "Success")
    };
    results.push(entry);
  }
  
  const prefix = process.argv[2] || "before";
  const allTestsJsonPath = path.join(OUTPUT_DIR, `${prefix}-all-tests.json`);
  const allTestsMdPath = path.join(OUTPUT_DIR, `${prefix}-all-tests.md`);
  const existingTestsMdPath = path.join(OUTPUT_DIR, `${prefix}-existing-project-tests.md`);
  const hardTestsMdPath = path.join(OUTPUT_DIR, `${prefix}-latex-hard-tests.md`);
  
  fs.writeFileSync(allTestsJsonPath, JSON.stringify(results, null, 2));
  
  function generateMd(title, filterFn) {
    const filtered = results.filter(filterFn);
    const avgAccuracy = filtered.reduce((acc, r) => acc + r.accuracy, 0) / (filtered.length || 1);
    let md = `# ${title}\n\n**Average Accuracy: ${avgAccuracy.toFixed(2)}%**\n\n`;
    md += `| File | Group | Size | Status | Errors | Warnings | Accuracy | Runtime | Explanation |\n|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of filtered) {
      md += `| ${r.fileName} | ${r.sourceGroup} | ${r.fileSize} | ${r.conversionSucceeded ? "Pass" : "Fail"} | ${r.errors} | ${r.warnings} | ${r.accuracy.toFixed(1)}% | ${r.runtime}ms | ${r.explanation} |\n`;
    }
    return md;
  }
  
  fs.writeFileSync(allTestsMdPath, generateMd("All Tests Benchmark", () => true));
  fs.writeFileSync(existingTestsMdPath, generateMd("Existing Project Tests Benchmark", r => r.sourceGroup === "existing project test"));
  fs.writeFileSync(hardTestsMdPath, generateMd("Hard LaTeX Tests Benchmark", r => r.sourceGroup === "new hard LaTeX test"));
  
  console.log(`Benchmark complete. Results saved to benchmark-results/${prefix}-*`);
}

run().catch(console.error);
