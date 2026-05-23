import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import type { CompileResult, LatexProjectFile } from "@/lib/latex/types";

const compileEngines = ["latexmk", "pdflatex", "xelatex", "lualatex"];

export function validateLatexCompileProject(files: LatexProjectFile[], mainFilename?: string): CompileResult {
  if (process.env.LATEX_COMPILE_ENABLED !== "true") {
    return {
      status: "unavailable",
      message: "Compile validation is unavailable. Set LATEX_COMPILE_ENABLED=true and install latexmk, pdflatex, xelatex, or lualatex to enable it.",
      suggestedFix: "Install a LaTeX distribution and enable server-side compile validation before publishing compile results."
    };
  }

  const mainFile = mainFilename ? files.find((file) => file.filename === mainFilename) : files[0];
  if (!mainFile) {
    return {
      status: "failed",
      message: "No main LaTeX document was available for compile validation.",
      suggestedFix: "Upload a main .tex file containing \\documentclass and \\begin{document}."
    };
  }

  const engine = compileEngines.find(isExecutableAvailable);
  if (!engine) {
    return {
      status: "unavailable",
      message: "No supported LaTeX compiler was found on this machine.",
      suggestedFix: "Install latexmk, pdflatex, xelatex, or lualatex and try again."
    };
  }

  const compileDir = mkdtempSync(`${trimTrailingSeparator(tmpdir())}${separator()}latex-studio-`);
  try {
    for (const file of files) {
      const safeName = sanitizeCompileFilename(file.filename);
      writeFileSync(`${compileDir}${separator()}${safeName}`, file.text, "utf8");
    }

    const mainSafeName = sanitizeCompileFilename(mainFile.filename);
    const args =
      engine === "latexmk"
        ? ["-pdf", "-interaction=nonstopmode", "-halt-on-error", mainSafeName]
        : ["-interaction=nonstopmode", "-halt-on-error", mainSafeName];
    const result = spawnSync(engine, args, {
      cwd: compileDir,
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true
    });
    const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    if (result.status === 0) {
      return {
        status: "success",
        engine,
        command: `${engine} ${args.join(" ")}`,
        message: "Compile validation succeeded."
      };
    }

    return {
      status: "failed",
      engine,
      command: `${engine} ${args.join(" ")}`,
      message: "Output recovered, but compile failed.",
      ...parseLatexCompileLog(log)
    };
  } finally {
    rmSync(compileDir, { recursive: true, force: true });
  }
}

export function parseLatexCompileLog(log: string): Partial<CompileResult> {
  const missingFile = /(?:LaTeX Error: File `([^']+)' not found|! I can't find file `([^']+)')/.exec(log);
  const firstError = /^! (.+)$/m.exec(log);
  const line = /^l\.(\d+)/m.exec(log);

  if (missingFile) {
    const file = missingFile[1] ?? missingFile[2];
    return {
      firstError: `Missing file: ${file}`,
      missingFile: file,
      line: line ? Number(line[1]) : undefined,
      suggestedFix: "Upload the missing dependency file beside the main document."
    };
  }

  return {
    firstError: firstError?.[1],
    line: line ? Number(line[1]) : undefined,
    suggestedFix: firstError ? "Review the LaTeX error and the reported line in the recovered source." : "Review the compiler log for details."
  };
}

function isExecutableAvailable(command: string): boolean {
  const probe =
    process.platform === "win32"
      ? spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true })
      : spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf8" });
  return probe.status === 0;
}

function sanitizeCompileFilename(filename: string): string {
  return (
    filename
      .split(/[/\\]/)
      .pop()
      ?.replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 160) || "main.tex"
  );
}

function separator(): "\\" | "/" {
  return process.platform === "win32" ? "\\" : "/";
}

function trimTrailingSeparator(value: string): string {
  return value.replace(/[\\/]+$/, "");
}
