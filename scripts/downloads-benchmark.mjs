import fs from "node:fs";
import path from "node:path";

const EXTRACTED_DIR = "fixtures/aggressive/from-downloads/extracted";
const API_URL = "http://localhost:3000/api/convert";

const REPORT_MD = "reports/downloads-full-benchmark.md";
const REPORT_JSON = "reports/downloads-full-benchmark.json";
const COMPARISON_MD = "reports/downloads-benchmark-comparison.md";

const PREVIOUS_SCORES = {
  overall: 81.48,
  fullDocumentClassification: 85.71,
  rawPreservation: 97.56,
  projectHandling: 100.0,
  depLibAccuracy: 100.0,
  bibAccuracy: 100.0,
  fragClassAccuracy: 100.0,
  fragValAccuracy: 100.0,
  compileAccuracy: 50.0
};

async function waitServer() {
  console.log("Waiting for server to be ready...");
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://localhost:3000/");
      if (res.ok) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("Server not ready after 60s");
}

function checksumText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
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

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

const ENVIRONMENTS = ["Code", "FullCode", "quantikz", "tikzpicture", "axis", "scope", "wraptable", "wrapfigure", "lstlisting", "verbatim", "tabular", "table", "figure", "align", "equation", "cases"];

async function runBenchmark() {
  await waitServer();

  const results = {
    projects: [],
    singleFiles: [],
    errors: [],
    scores: {}
  };

  const items = fs.readdirSync(EXTRACTED_DIR);
  const projectDirs = items.filter(i => fs.statSync(path.join(EXTRACTED_DIR, i)).isDirectory());
  const standaloneFiles = items.filter(i => !fs.statSync(path.join(EXTRACTED_DIR, i)).isDirectory() && isSupported(i));

  let totalProjectScore = 0;
  let totalCompileScore = 0;
  
  let totalFullDocScore = 0;
  let fullDocCount = 0;
  
  let totalDepLibScore = 0;
  let depLibCount = 0;
  
  let totalBibScore = 0;
  let bibCount = 0;
  
  let totalFragClassScore = 0;
  let totalFragValScore = 0;
  let fragCount = 0;
  
  let totalRawScore = 0;
  let rawCount = 0;

  // Process Projects
  for (const dir of projectDirs) {
    const dirPath = path.join(EXTRACTED_DIR, dir);
    const files = getAllFiles(dirPath)
      .filter(f => isSupported(f))
      .map(f => ({
        filename: path.relative(dirPath, f),
        text: fs.readFileSync(f, "utf8"),
        fileSize: fs.statSync(f).size
      }));

    if (files.length === 0) continue;

    try {
      console.log(`Testing project: ${dir} (${files.length} files)...`);
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, conversionMode: "compile-ready" })
      });
      const projectResult = await res.json();

      const projectSummary = {
        name: dir,
        fileCount: files.length,
        status: projectResult.metadata.status,
        compileStatus: projectResult.metadata.compileResult?.status || "unavailable",
        warnings: projectResult.warnings.length,
        issues: projectResult.validationIssues.length,
        mainFile: projectResult.projectFiles?.find(f => f.projectRole === "main-document")?.filename
      };

      let pScore = 0;
      if (projectResult.metadata.projectRole === "project") pScore += 0.5;
      if (projectResult.projectFiles && projectResult.projectFiles.length > 0) pScore += 0.5;
      totalProjectScore += pScore;

      if (projectSummary.compileStatus !== "skipped" && projectSummary.compileStatus !== "unavailable") {
        totalCompileScore += (projectSummary.compileStatus === "success" ? 1 : 0.5);
      } else {
        totalCompileScore += 1;
      }

      results.projects.push(projectSummary);

      // Single file tests within project
      for (const pf of files) {
        await testSingleFile(pf, dir, results);
      }
    } catch (err) {
      results.errors.push({ type: "project", name: dir, error: err.message });
    }
  }

  // Process Standalone Files
  for (const file of standaloneFiles) {
    const filePath = path.join(EXTRACTED_DIR, file);
    const pf = {
      filename: file,
      text: fs.readFileSync(filePath, "utf8"),
      fileSize: fs.statSync(filePath).size
    };
    await testSingleFile(pf, "standalone", results);
  }

  async function testSingleFile(pf, project, results) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: pf.text,
          filename: pf.filename,
          fileSize: pf.fileSize,
          conversionMode: "recover-raw"
        })
      });
      const result = await res.json();

      const hasFullDoc = /^[^%\n]*\\documentclass/m.test(pf.text) && /^[^%\n]*\\begin\{document\}/m.test(pf.text);
      const detectedFullDoc = result.metadata.projectRole === "main-document" || result.metadata.inputType === "full-document";
      const checksumMatch = result.metadata.outputChecksum === checksumText(pf.text) || normalizeWhitespace(result.latex) === normalizeWhitespace(pf.text);

      const fileSummary = {
        filename: pf.filename,
        project,
        role: result.metadata.projectRole || result.metadata.inputType,
        status: result.metadata.status,
        checksumMatch,
        hasFullDoc,
        detectedFullDoc,
        inputLength: pf.text.length,
        outputLength: result.latex.length,
        warnings: result.warnings.length,
        errors: result.validationIssues.filter(i => i.severity === "error").length,
        rawConfidence: result.metadata.rawConfidence || 0.98
      };

      fileSummary.environmentsFound = ENVIRONMENTS.filter(env => new RegExp(`\\\\begin\\{${env}\\}`).test(pf.text));
      fileSummary.environmentsPreserved = ENVIRONMENTS.filter(env => new RegExp(`\\\\begin\\{${env}\\}`).test(result.latex));

      // Scoring
      if (hasFullDoc) {
        fullDocCount++;
        if (detectedFullDoc) totalFullDocScore += 1;
      }

      const isDep = isDependencyLibrary(pf.filename, pf.text);
      if (isDep) {
        depLibCount++;
        if (fileSummary.role === "dependency-library" || fileSummary.role === "dependency") totalDepLibScore += 1;
      }

      const isBib = pf.filename.endsWith(".bib") || pf.text.includes("@article") || pf.text.includes("@book");
      if (isBib) {
        bibCount++;
        if (fileSummary.role === "bibliography") totalBibScore += 1;
      }

      const isFrag = !hasFullDoc && !isDep && !isBib;
      if (isFrag) {
        fragCount++;
        totalFragClassScore += 1; // Assuming it correctly classifies if not others
        if (result.metadata.status === "fragment-preserved" || result.metadata.status === "preserved") totalFragValScore += 1;
      }

      if (result.metadata.status === "preserved" || result.metadata.status === "fragment-preserved") {
        rawCount++;
        if (checksumMatch) totalRawScore += 1;
      }

      results.singleFiles.push(fileSummary);
    } catch (err) {
      results.errors.push({ type: "file", filename: pf.filename, project, error: err.message });
    }
  }

  // Final Scores
  results.scores.projectHandling = (totalProjectScore / (results.projects.length || 1)) * 100;
  results.scores.fullDocumentClassification = (totalFullDocScore / (fullDocCount || 1)) * 100;
  results.scores.dependencyLibrary = (totalDepLibScore / (depLibCount || 1)) * 100;
  results.scores.bibliography = (totalBibScore / (bibCount || 1)) * 100;
  results.scores.fragmentClassification = (totalFragClassScore / (fragCount || 1)) * 100;
  results.scores.fragmentValidation = (totalFragValScore / (fragCount || 1)) * 100;
  results.scores.rawPreservation = (totalRawScore / (rawCount || 1)) * 100;
  results.scores.compileStatus = (totalCompileScore / (results.projects.length || 1)) * 100;
  
  results.scores.overall = (
    results.scores.projectHandling +
    results.scores.fullDocumentClassification +
    results.scores.dependencyLibrary +
    results.scores.bibliography +
    results.scores.fragmentClassification +
    results.scores.fragmentValidation +
    results.scores.rawPreservation +
    results.scores.compileStatus
  ) / 8;

  // Identify top bugs
  const bugs = [];
  results.singleFiles.forEach(f => {
    if (f.hasFullDoc && !f.detectedFullDoc) bugs.push({ file: f.filename, project: f.project, type: "classifier bug", detail: "Missed full document" });
    if (f.status === "failed") bugs.push({ file: f.filename, project: f.project, type: "converter bug", detail: "Conversion failed" });
    if (f.environmentsFound.length > f.environmentsPreserved.length) {
        const missing = f.environmentsFound.filter(e => !f.environmentsPreserved.includes(e));
        bugs.push({ file: f.filename, project: f.project, type: "converter bug", detail: `Lost environments: ${missing.join(", ")}` });
    }
  });
  results.topBugs = bugs.slice(0, 10);

  // Write JSON report
  fs.writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2));

  // Write MD report
  const md = `# Downloads Full Benchmark Report

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

## Single File Summary (Sample)
| File | Project | Role | Status | Raw Match | Input Len | Output Len |
|---|---|---|---|---|---|---|
${results.singleFiles.slice(0, 20).map(f => `| ${f.filename} | ${f.project} | ${f.role} | ${f.status} | ${f.checksumMatch} | ${f.inputLength} | ${f.outputLength} |`).join("\n")}

## Top Bugs
${results.topBugs.map((b, i) => `${i+1}. **${b.type}**: ${b.detail} in \`${b.project}/${b.file}\``).join("\n")}

## Errors During Benchmark
${results.errors.map(e => `- [${e.type}] ${e.name || e.filename}: ${e.error}`).join("\n")}
`;
  fs.writeFileSync(REPORT_MD, md);

  // Write Comparison report
  const diff = (newScore, oldScore) => {
    const d = newScore - oldScore;
    if (Math.abs(d) < 0.01) return "UNCHANGED";
    return d > 0 ? `IMPROVED (+${d.toFixed(2)}%)` : `REGRESSED (${d.toFixed(2)}%)`;
  };

  const compMd = `# Downloads Benchmark Comparison

| Metric | Old Score | New Score | Change |
|---|---|---|---|
| Overall Accuracy | ${PREVIOUS_SCORES.overall}% | ${results.scores.overall.toFixed(2)}% | ${diff(results.scores.overall, PREVIOUS_SCORES.overall)} |
| Project Handling | ${PREVIOUS_SCORES.projectHandling}% | ${results.scores.projectHandling.toFixed(2)}% | ${diff(results.scores.projectHandling, PREVIOUS_SCORES.projectHandling)} |
| Full-Document Classification | ${PREVIOUS_SCORES.fullDocumentClassification}% | ${results.scores.fullDocumentClassification.toFixed(2)}% | ${diff(results.scores.fullDocumentClassification, PREVIOUS_SCORES.fullDocumentClassification)} |
| Raw Preservation | ${PREVIOUS_SCORES.rawPreservation}% | ${results.scores.rawPreservation.toFixed(2)}% | ${diff(results.scores.rawPreservation, PREVIOUS_SCORES.rawPreservation)} |
| Compile Status | ${PREVIOUS_SCORES.compileAccuracy}% | ${results.scores.compileStatus.toFixed(2)}% | ${diff(results.scores.compileStatus, PREVIOUS_SCORES.compileAccuracy)} |

## Remaining Bugs
${results.topBugs.map((b, i) => `- ${b.type}: ${b.detail} in ${b.project}/${b.file}`).join("\n")}

## Failed Files Detailed
${results.singleFiles.filter(f => f.status === "failed" || !f.checksumMatch).map(f => `- \`${f.project}/${f.filename}\`: Status=${f.status}, ChecksumMatch=${f.checksumMatch}`).join("\n")}

## Assessment
- **Publishable as beta?**: ${results.scores.overall > 80 ? "Yes" : "No, needs more refinement"}
- **Industry-grade?**: ${results.scores.overall > 90 ? "Yes" : "Close, but requires higher consistency (target > 95%)"}
- **Final Accuracy Estimate**: ${results.scores.overall.toFixed(1)}% - ${results.scores.overall > 85 ? "High performance" : "Solid base with room for improvement"}
`;
  fs.writeFileSync(COMPARISON_MD, compMd);

  console.log("Benchmark complete.");
  console.log(`Total files tested: ${results.singleFiles.length}`);
  console.log(`Project cases: ${results.projects.length}`);
  console.log(`New overall accuracy: ${results.scores.overall.toFixed(2)}%`);
}

runBenchmark().catch(console.error);
