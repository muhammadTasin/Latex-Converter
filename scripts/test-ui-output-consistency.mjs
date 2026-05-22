import fs from "node:fs";
import path from "node:path";

const serverUrl = process.env.TEST_SERVER_URL ?? "http://localhost:3000";
const workspaceRoot = process.cwd();
const fixturePath = path.join(workspaceRoot, "fixtures", "ultra-hard-output-consistency-input.txt");
const sourceText = fs.readFileSync(fixturePath, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function checksumText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function findRawFenceOutsideVerbatim(value) {
  const lines = value.split("\n");
  let protectedDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/\\begin\{(?:verbatim|lstlisting)\}/.test(line)) {
      protectedDepth += 1;
    }

    if (protectedDepth === 0 && line.includes("```")) {
      return {
        line: index + 1,
        context: lines.slice(Math.max(0, index - 3), index + 4).map((entry, offset) => `${Math.max(0, index - 3) + offset + 1}: ${entry}`).join("\n")
      };
    }

    if (/\\end\{(?:verbatim|lstlisting)\}/.test(line) && protectedDepth > 0) {
      protectedDepth -= 1;
    }
  }

  return null;
}

const response = await fetch(`${serverUrl}/api/convert`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: sourceText,
    filename: "ultra-hard-output-consistency-input.txt",
    fileSize: Buffer.byteLength(sourceText, "utf8"),
    conversionMode: "display-source"
  })
});

let data;
try {
  data = await response.json();
} catch (error) {
  throw new Error(`Expected JSON from /api/convert but received an unreadable response. ${error instanceof Error ? error.message : ""}`);
}

assert(typeof data.latex === "string", "API response must include a canonical latex string.");
assert(data.latex.length > 0, "API canonical latex string must not be empty.");
assert(data.metadata, "API response must include metadata.");
assert(data.metadata.outputLength === data.latex.length, `Metadata outputLength ${data.metadata.outputLength} did not match latex length ${data.latex.length}.`);
assert(data.metadata.outputChecksum === checksumText(data.latex), `Metadata outputChecksum ${data.metadata.outputChecksum} did not match canonical latex checksum ${checksumText(data.latex)}.`);
assert(data.latex.includes("ULTRA\\_FINAL\\_MARKER\\_SIGMA\\_777") || data.latex.includes("ULTRA_FINAL_MARKER_SIGMA_777"), "Ultra final marker must be preserved.");

const rawFence = findRawFenceOutsideVerbatim(data.latex);
if (rawFence) {
  throw new Error(`Raw Markdown code fence found outside verbatim/listing on line ${rawFence.line}.\n${rawFence.context}`);
}

if (Array.isArray(data.validationIssues)) {
  const rawFenceValidation = data.validationIssues.find((issue) => /Raw Markdown code fence/.test(issue.message ?? ""));
  if (rawFenceValidation) {
    throw new Error(`Validation reported raw fence against canonical output: ${rawFenceValidation.message}`);
  }
}

console.log("UI/API output consistency test passed");
console.log(`Server: ${serverUrl}`);
console.log(`Output length: ${data.latex.length}`);
console.log(`Output checksum: ${data.metadata.outputChecksum}`);
