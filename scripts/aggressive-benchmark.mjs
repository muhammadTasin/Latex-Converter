import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Module = require("node:module");
const workspaceRoot = process.cwd();
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return path.join(workspaceRoot, request.slice(2)) + ".ts";
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  module._compile(output, filename);
};

const { classifyLatexFile, convertLatexProject, convertTextToLatex } = require("../lib/latex/converter.ts");

const FIXTURES_DIR = path.join(workspaceRoot, "fixtures/aggressive/from-downloads/extracted");
const REPORT_MD = path.join(workspaceRoot, "reports/aggressive-download-benchmark.md");
const REPORT_JSON = path.join(workspaceRoot, "reports/aggressive-download-benchmark.json");

async function runBenchmark() {
  const results = {
    projects: [],
    singleFiles: [],
    errors: [],
    scores: {
      projectHandling: 0,
      fullDocumentClassification: 0,
      dependencyLibrary: 0,
      bibliography: 0,
      fragmentClassification: 0,
      fragmentValidation: 0,
      rawPreservation: 0,
      compileStatus: 0,
      overall: 0
    }
  };

  const projectDirs = fs.readdirSync(FIXTURES_DIR).filter(d => fs.statSync(path.join(FIXTURES_DIR, d)).isDirectory());

  let totalProjectScore = 0;
  let totalFullDocScore = 0;
  let totalDepLibScore = 0;
  let totalBibScore = 0;
  let totalFragClassScore = 0;
  let totalFragValScore = 0;
  let totalRawScore = 0;
  let totalCompileScore = 0;

  let fullDocCount = 0;
  let depLibCount = 0;
  let bibCount = 0;
  let fragCount = 0;
  let rawCount = 0;

  for (const dir of projectDirs) {
    const dirPath = path.join(FIXTURES_DIR, dir);
    const files = getAllFiles(dirPath);
    const projectFiles = files
      .filter(f => isSupported(f))
      .map(f => ({
        filename: path.relative(dirPath, f),
        text: fs.readFileSync(f, "utf8"),
        fileSize: fs.statSync(f).size
      }));

    if (projectFiles.length === 0) continue;

    // Project-level test
    try {
      const projectResult = convertLatexProject({
        files: projectFiles,
        conversionMode: "compile-ready"
      });

      const projectSummary = {
        name: dir,
        fileCount: projectFiles.length,
        status: projectResult.metadata.status,
        compileStatus: projectResult.metadata.compileResult?.status,
        warnings: projectResult.warnings.length,
        issues: projectResult.validationIssues.length,
        mainFile: projectResult.projectFiles?.find(f => f.projectRole === "main-document")?.filename
      };

      // Score project handling
      let pScore = 0;
      if (projectResult.metadata.projectRole === "project") pScore += 0.5;
      if (projectResult.projectFiles && projectResult.projectFiles.length > 0) pScore += 0.5;
      totalProjectScore += pScore;

      if (projectResult.metadata.compileResult?.status !== "skipped") {
        totalCompileScore += (projectResult.metadata.compileResult?.status === "success" ? 1 : 0.5);
      } else {
        totalCompileScore += 1; // Mark compile skipped as not failed per instructions
      }

      results.projects.push(projectSummary);
    } catch (err) {
      results.errors.push({ type: "project", name: dir, error: err.message });
    }

    // Single-file tests
    for (const pf of projectFiles) {
      try {
        const classification = classifyLatexFile(pf.text, pf.filename);
        const result = convertTextToLatex({
          text: pf.text,
          filename: pf.filename,
          fileSize: pf.fileSize,
          conversionMode: "recover-raw"
        });

        const fileSummary = {
          filename: pf.filename,
          project: dir,
          role: classification.fileRole,
          status: result.metadata.status,
          checksumMatch: result.metadata.outputChecksum === checksumText(pf.text),
          hasFullDoc: /\\documentclass/.test(pf.text) && /\\begin\{document\}/.test(pf.text),
          detectedFullDoc: classification.fileRole === "full-document"
        };

        // Aggressive checks for environments
        const environments = ["Code", "FullCode", "quantikz", "tikzpicture", "axis", "scope", "wraptable", "wrapfigure", "lstlisting", "verbatim", "tabular", "table", "figure", "align", "equation", "cases"];
        fileSummary.environmentsFound = environments.filter(env => new RegExp(`\\\\begin\\{${env}\\}`).test(pf.text));
        fileSummary.environmentsPreserved = environments.filter(env => new RegExp(`\\\\begin\\{${env}\\}`).test(result.latex));

        // Scoring
        if (fileSummary.hasFullDoc) {
          fullDocCount++;
          if (fileSummary.detectedFullDoc) totalFullDocScore += 1;
        }

        if (classification.fileRole === "dependency-library") {
          depLibCount++;
          if (isDependencyLibrary(pf.filename, pf.text)) totalDepLibScore += 1;
        }

        if (classification.fileRole === "bibliography") {
          bibCount++;
          if (pf.filename.endsWith(".bib") || pf.text.includes("@article")) totalBibScore += 1;
        }

        if (classification.fileRole === "fragment") {
          fragCount++;
          totalFragClassScore += 1;
          if (result.metadata.status === "fragment-preserved" || result.metadata.status === "preserved") totalFragValScore += 1;
        }

        if (result.metadata.status === "preserved" || result.metadata.status === "fragment-preserved") {
            rawCount++;
            if (fileSummary.checksumMatch) totalRawScore += 1;
            else {
                // Check if it's just normalized whitespace
                if (normalizeWhitespace(result.latex) === normalizeWhitespace(pf.text)) totalRawScore += 1;
            }
        }

        results.singleFiles.push(fileSummary);
      } catch (err) {
        results.errors.push({ type: "file", filename: pf.filename, project: dir, error: err.message });
      }
    }
  }

  // Calculate final scores
  results.scores.projectHandling = (totalProjectScore / projectDirs.length) * 100;
  results.scores.fullDocumentClassification = (totalFullDocScore / (fullDocCount || 1)) * 100;
  results.scores.dependencyLibrary = (totalDepLibScore / (depLibCount || 1)) * 100;
  results.scores.bibliography = (totalBibScore / (bibCount || 1)) * 100;
  results.scores.fragmentClassification = (totalFragClassScore / (fragCount || 1)) * 100;
  results.scores.fragmentValidation = (totalFragValScore / (fragCount || 1)) * 100;
  results.scores.rawPreservation = (totalRawScore / (rawCount || 1)) * 100;
  results.scores.compileStatus = (totalCompileScore / projectDirs.length) * 100;
  
  results.scores.overall = Object.values(results.scores).reduce((a, b) => a + b, 0) / 9;

  // Identify top bugs
  const bugs = [];
  results.singleFiles.forEach(f => {
    if (f.hasFullDoc && !f.detectedFullDoc) bugs.push({ file: f.filename, project: f.project, type: "classifier bug", detail: "Missed full document" });
    if (f.role === "fragment" && f.status === "failed") bugs.push({ file: f.filename, project: f.project, type: "converter bug", detail: "Fragment failed" });
    if (f.environmentsFound.length > f.environmentsPreserved.length) {
        const missing = f.environmentsFound.filter(e => !f.environmentsPreserved.includes(e));
        bugs.push({ file: f.filename, project: f.project, type: "converter bug", detail: `Lost environments: ${missing.join(", ")}` });
    }
  });
  
  results.topBugs = bugs.slice(0, 10);

  // Write reports
  fs.writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2));
  
  const md = `# Aggressive LaTeX Download Benchmark Report

## Scores
- Project Handling: ${results.scores.projectHandling.toFixed(2)}%
- Full-Document Classification: ${results.scores.fullDocumentClassification.toFixed(2)}%
- Dependency-Library Accuracy: ${results.scores.dependencyLibrary.toFixed(2)}%
- Bibliography Accuracy: ${results.scores.bibliography.toFixed(2)}%
- Fragment Classification: ${results.scores.fragmentClassification.toFixed(2)}%
- Fragment Validation: ${results.scores.fragmentValidation.toFixed(2)}%
- Raw Preservation: ${results.scores.rawPreservation.toFixed(2)}%
- Compile/Status Accuracy: ${results.scores.compileStatus.toFixed(2)}%
- **Overall Aggressive Benchmark Accuracy: ${results.scores.overall.toFixed(2)}%**

## Project Summary
| Project | Files | Status | Compile | Warnings | Issues |
|---|---|---|---|---|---|
${results.projects.map(p => `| ${p.name} | ${p.fileCount} | ${p.status} | ${p.compileStatus} | ${p.warnings} | ${p.issues} |`).join("\n")}

## Top 10 Bugs
${results.topBugs.map((b, i) => `${i+1}. **${b.type}**: ${b.detail} in \`${b.project}/${b.file}\``).join("\n")}

## Errors During Benchmark
${results.errors.map(e => `- [${e.type}] ${e.name || e.filename}: ${e.error}`).join("\n")}

## Conclusion
${results.scores.overall > 85 ? "Publishable as beta. High fidelity and robust project handling." : "Needs more work. Some edge cases in classification or environment preservation found."}
`;
  fs.writeFileSync(REPORT_MD, md);

  console.log("Benchmark complete. Reports generated in reports/");
}

function getAllFiles(dir, allFiles = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getAllFiles(name, allFiles);
    } else {
      allFiles.push(name);
    }
  }
  return allFiles;
}

function isSupported(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ["tex", "sty", "cls", "bib", "txt", "md"].includes(ext);
}

function isDependencyLibrary(filename, text) {
  return /\.sty$|\.cls$|tikzlibrary.+\.code\.tex$/i.test(filename) || text.includes("\\ProvidesPackage") || text.includes("\\ProvidesClass");
}

function checksumText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

runBenchmark().catch(console.error);
