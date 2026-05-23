import { NextResponse } from "next/server";
import { convertLatexProject, convertTextToLatex, isSupportedTextFilename, maxConvertibleBytes } from "@/lib/latex/converter";

export const runtime = "nodejs";
export const maxDuration = 60;

type ProjectFileRequest = {
  filename: string;
  text: string;
  fileSize?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const projectFiles = Array.isArray(body.files)
      ? body.files
          .filter((file: unknown): file is { filename?: unknown; text?: unknown; fileSize?: unknown } => typeof file === "object" && file !== null)
          .map(
            (file): ProjectFileRequest => ({
              filename: typeof file.filename === "string" ? file.filename : "source.tex",
              text: typeof file.text === "string" ? file.text : "",
              fileSize: typeof file.fileSize === "number" && Number.isFinite(file.fileSize) ? file.fileSize : undefined
            })
          )
      : [];
    const text = typeof body.text === "string" ? body.text : "";
    const language = typeof body.language === "string" ? body.language : "en";
    const title = typeof body.title === "string" ? body.title : undefined;
    const author = typeof body.author === "string" ? body.author : undefined;
    const filename = typeof body.filename === "string" ? body.filename : undefined;
    const fileSize = typeof body.fileSize === "number" && Number.isFinite(body.fileSize) ? body.fileSize : undefined;
    const conversionMode =
      body.conversionMode === "recover-raw" || body.conversionMode === "compile-ready" ? body.conversionMode : "display-source";

    if (projectFiles.length) {
      const oversized = projectFiles.find((file) => (file.fileSize ?? new TextEncoder().encode(file.text).byteLength) > maxConvertibleBytes);
      const unsupported = projectFiles.find((file) => !isSupportedTextFilename(file.filename));
      const result = convertLatexProject({ files: projectFiles, language, conversionMode });
      const status = oversized ? 413 : unsupported ? 415 : result.metadata.status === "failed" ? 422 : 200;

      return NextResponse.json(result, { status });
    }

    const result = convertTextToLatex({ text, language, title, author, filename, fileSize, conversionMode });
    const status =
      fileSize && fileSize > maxConvertibleBytes
        ? 413
        : filename && !isSupportedTextFilename(filename)
          ? 415
          : result.metadata.status === "failed"
            ? 422
            : 200;

    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("Conversion API Error:", error);
    return NextResponse.json(
      {
        latex: "",
        warnings: ["Unable to convert text to LaTeX."],
        validationIssues: [
          {
            severity: "error",
            message: "Unable to convert text to LaTeX.",
            suggestedFix: "Check that the request body is valid UTF-8 JSON and try again."
          }
        ],
        metadata: {
          inputType: "plain-text",
          outputType: "latex-document",
          outputFilename: "converted_output.tex",
          outputChecksum: "00000000",
          status: "failed",
          largeInput: false,
          inputLength: 0,
          outputLength: 0
        },
        stats: { wordCount: 0, equationCount: 0, tableCount: 0, citationCount: 0 }
      },
      { status: 400 }
    );
  }
}
