import type { OcrProvider } from "@/lib/ocr/types";

export const mockOcrProvider: OcrProvider = {
  name: "mock",
  async recognize() {
    return {
      provider: "mock",
      confidence: null,
      text: [
        "Title: OCR Research Draft",
        "Author: Muhammad Tasin",
        "Institution: Department of Computer Science, Independent Research Project",
        "Date: May 2026",
        "Abstract:",
        "This sample text was returned by the mock OCR provider.",
        "",
        "Keywords:",
        "OCR, LaTeX generation, handwriting recognition",
        "",
        "1. Introduction:",
        "The system converts OCR output into LaTeX suitable for research drafts.",
        "",
        "3. System Architecture:",
        "Input Image -> Preprocessing -> OCR -> Structure Detection",
        "",
        "Loss Function:",
        "J(theta) = 1/n sum from i=1 to n [-y_i log(h_theta(x_i)) - (1-y_i) log(1-h_theta(x_i))]",
        "",
        "Mathematical Model:",
        "Q(D) = 1 if C >= 0.90",
        "Q(D) = 0.5 if 0.70 <= C < 0.90",
        "Q(D) = 0 if C < 0.70",
        "",
        "Matrix Representation:",
        "X = [ [x_11, x_12, x_13],",
        "      [x_21, x_22, x_23],",
        "      [x_31, x_32, x_33] ]",
        "",
        "Optimization:",
        "minimize E_total",
        "subject to C >= 0.70",
        "and L must compile successfully",
        "",
        "Algorithm:",
        "Step 1: Upload an image or enter plain text.",
        "Step 2: Apply OCR to extract raw text from the image.",
        "",
        "References",
        "- [1] I. Goodfellow, Y. Bengio, and A. Courville, Deep Learning, MIT Press, 2016."
      ].join("\n"),
      warnings: ["OCR_PROVIDER is set to mock. Configure Tesseract or a hosted OCR API for real image recognition."]
    };
  }
};
