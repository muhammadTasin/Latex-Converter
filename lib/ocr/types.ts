export type OcrRequest = {
  image: ArrayBuffer;
  mimeType: string;
  language: string;
  handwritingMode: boolean;
};

export type OcrResult = {
  text: string;
  confidence: number | null;
  provider: string;
  warnings: string[];
};

export interface OcrProvider {
  name: string;
  recognize(request: OcrRequest): Promise<OcrResult>;
}
