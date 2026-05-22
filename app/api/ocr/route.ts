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

    const allowedMimeTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json({ error: "The uploaded file must be a PNG, JPEG, or WEBP image." }, { status: 415 });
    }

    if (file.size > maxImageBytes) {
      return NextResponse.json({ error: `Image is larger than the ${maxImageBytes / (1024 * 1024)} MB starter limit.` }, { status: 413 });
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
    console.error("OCR API Error:", error);
    return NextResponse.json(
      {
        error: "OCR failed due to an internal server error.",
        provider: process.env.OCR_PROVIDER ?? "tesseract",
        warnings: ["The image could not be processed. Try a sharper image or a different OCR provider."]
      },
      { status: 500 }
    );
  }
}
