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
    return path.join(workspaceRoot, request.slice(2)) + ".ts";
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  });

  return module._compile(compiled.outputText, filename);
};

const { convertTextToLatex } = require("./lib/latex/converter.ts");

const z7Input4 = `Expected Behavior Check Table
Check Pass condition
PDF upload true, App accepts the file or clearly says PDF input is unsupported.
Text extraction false It fails
Verbatim`;

const result = convertTextToLatex({ text: z7Input4, filename: "z7-4.txt" });
console.log(result.latex);
