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
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  module._compile(output, filename);
};

const { convertTextToLatex } = require("./lib/latex/converter.ts");

const input = fs.readFileSync("fixtures/hard-research-mixture-input.txt", "utf8");

console.log("Running with filename...");
console.time("convert-file");
convertTextToLatex({ text: input, filename: "hard-research-mixture-input.txt", conversionMode: "display-source" });
console.timeEnd("convert-file");

console.log("Running WITHOUT filename...");
console.time("convert-nofilename");
convertTextToLatex({ text: input, conversionMode: "display-source" });
console.timeEnd("convert-nofilename");

console.log("Running with CRLF input...");
const crlfInput = input.replace(/\r?\n/g, "\r\n");
console.time("convert-crlf");
convertTextToLatex({ text: crlfInput, conversionMode: "display-source" });
console.timeEnd("convert-crlf");
