export type PdfPageFormat = "a3" | "a4" | "a5" | "letter" | "legal" | "photo-10x15";
export type PdfOrientation = "auto" | "portrait" | "landscape";
export type PdfImageFit = "contain" | "cover";

export interface PdfPrintOptions {
  pageFormat: PdfPageFormat;
  orientation: PdfOrientation;
  fit: PdfImageFit;
  marginPercent: number;
  grayscale: boolean;
  jpegQuality: number;
}

export interface GraphPdfData {
  task: "document-to-pdf";
  mimeType: "application/pdf";
  fileName: string;
  blob: Blob;
  options: PdfPrintOptions;
  page: { widthMm: number; heightMm: number };
  source: { type: "image" | "svg"; vector: boolean; width: number; height: number };
  bytes: number;
  generatedAtIso: string;
}

export const pdfPageFormatLabels: Record<PdfPageFormat, string> = {
  a3: "A3",
  a4: "A4",
  a5: "A5",
  letter: "Letter",
  legal: "Legal",
  "photo-10x15": "Foto 10 × 15 cm",
};

export const defaultPdfPrintOptions: PdfPrintOptions = {
  pageFormat: "a4",
  orientation: "auto",
  fit: "contain",
  marginPercent: 5,
  grayscale: false,
  jpegQuality: 0.92,
};
