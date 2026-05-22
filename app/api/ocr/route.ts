import { NextResponse } from "next/server";
import { getOcrProvider } from "@/lib/ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxImageBytes = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    const language = String(formData.get("language") || "en");
    const handwritingMode = String(formData.get("handwritingMode") || "false") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload an image file before running OCR." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "The uploaded file must be an image." }, { status: 400 });
    }

    if (file.size > maxImageBytes) {
      return NextResponse.json({ error: "Image is larger than the 8 MB starter limit." }, { status: 413 });
    }

    const provider = getOcrProvider();
    const result = await provider.recognize({
      image: await file.arrayBuffer(),
      mimeType: file.type,
      language,
      handwritingMode
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "OCR failed.",
        provider: process.env.OCR_PROVIDER ?? "tesseract",
        warnings: ["The image could not be processed. Try a sharper image or a different OCR provider."]
      },
      { status: 500 }
    );
  }
}
