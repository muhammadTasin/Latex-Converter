import { NextResponse } from "next/server";
import { convertTextToLatex, isSupportedTextFilename, maxConvertibleBytes } from "@/lib/latex/converter";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text : "";
    const language = typeof body.language === "string" ? body.language : "en";
    const title = typeof body.title === "string" ? body.title : undefined;
    const author = typeof body.author === "string" ? body.author : undefined;
    const filename = typeof body.filename === "string" ? body.filename : undefined;
    const fileSize = typeof body.fileSize === "number" && Number.isFinite(body.fileSize) ? body.fileSize : undefined;
    const conversionMode = body.conversionMode === "recover-raw" ? "recover-raw" : "display-source";

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
