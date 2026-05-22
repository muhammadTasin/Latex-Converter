import { NextResponse } from "next/server";
import { maxConvertibleBytes } from "@/lib/latex/converter";
import { extractPdfTextFromBytes, hasPdfHeader } from "@/lib/pdf/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

const pdfExtractionWarning = "PDF-to-LaTeX cannot perfectly recover original LaTeX source. For exact preservation, upload .tex.";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return pdfError("No PDF file was uploaded.", "Choose a PDF file and try again.", 400);
    }

    if (file.size > maxConvertibleBytes) {
      return pdfError(
        `PDF is ${(file.size / (1024 * 1024)).toFixed(1)} MB, which exceeds the ${maxConvertibleBytes / (1024 * 1024)} MB limit.`,
        "Upload a smaller PDF or split the document before extraction.",
        413
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (!isPdfFile(bytes, file)) {
      return pdfError("Uploaded file is not a valid PDF.", "Upload a .pdf file or use .tex/.txt/.md for text conversion.", 415);
    }

    const result = await extractPdfTextFromBytes(bytes);
    const text = result.text;

    if (!text) {
      return pdfError(
        "PDF text could not be extracted. Please upload a .tex file for exact LaTeX preservation.",
        "If this PDF is scanned or image-only, run OCR first or upload the original .tex source.",
        422
      );
    }

    return NextResponse.json({
      text,
      warnings: [pdfExtractionWarning, ...(result.warnings ?? [])],
      metadata: {
        filename: file.name,
        fileSize: file.size,
        pageCount: result.pageCount,
        extractedLength: text.length
      }
    });
  } catch (error) {
    console.error("PDF Extraction API Error:", error);
    return pdfError(
      "PDF text could not be extracted. Please upload a .tex file for exact LaTeX preservation.",
      "Internal PDF extraction error. Please check server logs.",
      500
    );
  }
}

function isPdfFile(bytes: Uint8Array, file: File): boolean {
  return hasPdfHeader(bytes) || file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function pdfError(message: string, suggestedFix: string, status: number) {
  return NextResponse.json(
    {
      text: "",
      warnings: [message],
      validationIssues: [
        {
          severity: "error",
          message,
          suggestedFix
        }
      ]
    },
    { status }
  );
}
