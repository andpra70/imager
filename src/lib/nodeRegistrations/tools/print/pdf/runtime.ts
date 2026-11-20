import type { GraphImage } from "../../../../../models/graphImage";
import type { GraphSvg } from "../../../../../models/graphSvg";
import { rasterizeGraphSvg } from "../../../../imageUtils";
import { clamp } from "../../shared";
import type { GraphPdfData, PdfOrientation, PdfPageFormat, PdfPrintOptions } from "./model";

const customFormatMm: Partial<Record<PdfPageFormat, [number, number]>> = { "photo-10x15": [100, 150] };

function resolvedOrientation(source: GraphImage, orientation: PdfOrientation) {
  if (orientation !== "auto") return orientation;
  return source.width > source.height ? "landscape" : "portrait";
}

function opaqueJpegData(source: GraphImage, quality: number) {
  const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D non disponibile per il PDF.");
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0);
  return canvas.toDataURL("image/jpeg", clamp(quality, .5, 1));
}

function applyGrayscale(source: GraphImage) {
  const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D non disponibile per la conversione in grigi.");
  context.drawImage(source, 0, 0); const image = context.getImageData(0, 0, canvas.width, canvas.height), pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) { const gray = Math.round(.2126 * pixels[index] + .7152 * pixels[index + 1] + .0722 * pixels[index + 2]); pixels[index] = gray; pixels[index + 1] = gray; pixels[index + 2] = gray; }
  context.putImageData(image, 0, 0); return canvas;
}

function normalizedColor(value: string) {
  const input = value.trim();
  if (!input || input === "none" || input === "currentColor" || input.startsWith("url(")) return input;
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  if (!context) return input;
  context.fillStyle = "#010203"; context.fillStyle = input;
  const color = context.fillStyle;
  if (color === "#010203" && input.toLowerCase() !== "#010203" && input.replace(/\s/g, "").toLowerCase() !== "rgb(1,2,3)") return input;
  let red = 0, green = 0, blue = 0, alpha = 1;
  if (/^#[0-9a-f]{6}$/i.test(color)) { red = Number.parseInt(color.slice(1, 3), 16); green = Number.parseInt(color.slice(3, 5), 16); blue = Number.parseInt(color.slice(5, 7), 16); }
  else { const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i); if (!match) return input; red = Number(match[1]); green = Number(match[2]); blue = Number(match[3]); alpha = match[4] === undefined ? 1 : Number(match[4]); }
  const gray = Math.round(.2126 * red + .7152 * green + .0722 * blue);
  return alpha < 1 ? `rgba(${gray},${gray},${gray},${alpha})` : `rgb(${gray},${gray},${gray})`;
}

function grayscaleSvg(svg: GraphSvg): GraphSvg {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.tagName.toLowerCase() !== "svg") throw new Error("SVG non valido.");
  const paintAttributes = ["fill", "stroke", "color", "stop-color", "flood-color"];
  parsed.querySelectorAll("*").forEach(element => {
    for (const attribute of paintAttributes) if (element.hasAttribute(attribute)) element.setAttribute(attribute, normalizedColor(element.getAttribute(attribute) ?? ""));
    const htmlElement = element as unknown as HTMLElement;
    for (const property of paintAttributes) { const value = htmlElement.style.getPropertyValue(property); if (value) htmlElement.style.setProperty(property, normalizedColor(value), htmlElement.style.getPropertyPriority(property)); }
  });
  parsed.querySelectorAll("style").forEach(style => { style.textContent = (style.textContent ?? "").replace(/(fill|stroke|color|stop-color|flood-color)\s*:\s*([^;}]+)/gi, (_all, property: string, color: string) => `${property}:${normalizedColor(color)}`); });
  return new XMLSerializer().serializeToString(parsed.documentElement);
}

function parseSvg(svg: GraphSvg) {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.tagName.toLowerCase() !== "svg") throw new Error("SVG non valido.");
  return parsed.documentElement as unknown as SVGSVGElement;
}

interface SvgViewBox { minX: number; minY: number; width: number; height: number }

function readSvgViewBox(root: SVGSVGElement, fallbackWidth: number, fallbackHeight: number): SvgViewBox {
  const values = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return { minX: values[0], minY: values[1], width: values[2], height: values[3] };
  }
  return { minX: 0, minY: 0, width: fallbackWidth, height: fallbackHeight };
}

function createFittedSvgForPdf(
  svg: GraphSvg,
  sourceWidth: number,
  sourceHeight: number,
  pageWidth: number,
  pageHeight: number,
  drawX: number,
  drawY: number,
  drawWidth: number,
  drawHeight: number,
) {
  const sourceRoot = parseSvg(svg);
  const viewBox = readSvgViewBox(sourceRoot, sourceWidth, sourceHeight);

  // Riproduce esattamente xMidYMid meet del browser nel viewport della preview.
  const viewBoxScale = Math.min(sourceWidth / viewBox.width, sourceHeight / viewBox.height);
  const viewportOffsetX = (sourceWidth - viewBox.width * viewBoxScale) / 2;
  const viewportOffsetY = (sourceHeight - viewBox.height * viewBoxScale) / 2;
  const pageScale = Math.min(drawWidth / sourceWidth, drawHeight / sourceHeight);
  const scale = viewBoxScale * pageScale;
  const translateX = drawX + viewportOffsetX * pageScale - viewBox.minX * scale;
  const translateY = drawY + viewportOffsetY * pageScale - viewBox.minY * scale;

  const document = sourceRoot.ownerDocument;
  const pageRoot = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  pageRoot.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  pageRoot.setAttribute("width", String(pageWidth));
  pageRoot.setAttribute("height", String(pageHeight));
  pageRoot.setAttribute("viewBox", `0 0 ${pageWidth} ${pageHeight}`);

  const content = document.createElementNS("http://www.w3.org/2000/svg", "g");
  content.setAttribute("transform", `translate(${translateX} ${translateY}) scale(${scale})`);
  // Conserva le proprietà grafiche ereditabili eventualmente definite sulla radice.
  for (const attribute of Array.from(sourceRoot.attributes)) {
    if (!["xmlns", "width", "height", "viewBox", "preserveAspectRatio", "x", "y", "overflow", "transform"].includes(attribute.name)) {
      content.setAttribute(attribute.name, attribute.value);
    }
  }
  while (sourceRoot.firstChild) content.appendChild(sourceRoot.firstChild);
  pageRoot.appendChild(content);
  return pageRoot;
}

function createPagePreview(source: GraphImage, pageWidth: number, pageHeight: number, margin: number, x: number, y: number, width: number, height: number) {
  const previewScale = Math.min(1, 900 / Math.max(pageWidth, pageHeight));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(pageWidth * previewScale)); canvas.height = Math.max(1, Math.round(pageHeight * previewScale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas preview PDF non disponibile.");
  context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.save(); context.beginPath(); context.rect(margin * previewScale, margin * previewScale, (pageWidth - margin * 2) * previewScale, (pageHeight - margin * 2) * previewScale); context.clip();
  context.drawImage(source, x * previewScale, y * previewScale, width * previewScale, height * previewScale);
  context.restore();
  return canvas;
}

export async function generateImagePdf(source: GraphImage, options: PdfPrintOptions): Promise<{ preview: GraphImage; data: GraphPdfData }> {
  return generatePdf(source, null, options);
}

async function generatePdf(source: GraphImage, svg: GraphSvg | null, options: PdfPrintOptions): Promise<{ preview: GraphImage; data: GraphPdfData }> {
  const { jsPDF } = await import("jspdf");
  const printableSource = options.grayscale && !svg ? applyGrayscale(source) : source;
  const orientation = resolvedOrientation(source, options.orientation);
  const format = customFormatMm[options.pageFormat] ?? options.pageFormat;
  const pdfDocument = new jsPDF({ orientation, unit: "mm", format, compress: true, putOnlyUsedFonts: true });
  const pageWidth = pdfDocument.internal.pageSize.getWidth(), pageHeight = pdfDocument.internal.pageSize.getHeight();
  const marginPercent = clamp(options.marginPercent, 0, 45);
  const margin = Math.min(pageWidth, pageHeight) * marginPercent / 100;
  const availableWidth = Math.max(1, pageWidth - margin * 2), availableHeight = Math.max(1, pageHeight - margin * 2);
  const scale = svg || options.fit === "contain" ? Math.min(availableWidth / source.width, availableHeight / source.height) : Math.max(availableWidth / source.width, availableHeight / source.height);
  const drawWidth = source.width * scale, drawHeight = source.height * scale;
  const drawX = (pageWidth - drawWidth) / 2, drawY = (pageHeight - drawHeight) / 2;
  if (svg) {
    await import("svg2pdf.js");
    const vectorRoot = createFittedSvgForPdf(svg, source.width, source.height, pageWidth, pageHeight, drawX, drawY, drawWidth, drawHeight);
    pdfDocument.saveGraphicsState();
    pdfDocument.rect(margin, margin, availableWidth, availableHeight);
    pdfDocument.clip();
    pdfDocument.discardPath();
    await pdfDocument.svg(vectorRoot, { x: 0, y: 0, width: pageWidth, height: pageHeight, loadImages: true });
    pdfDocument.restoreGraphicsState();
  } else {
    pdfDocument.saveGraphicsState(); pdfDocument.rect(margin, margin, availableWidth, availableHeight); pdfDocument.clip(); pdfDocument.discardPath();
    pdfDocument.addImage(opaqueJpegData(printableSource, options.jpegQuality), "JPEG", drawX, drawY, drawWidth, drawHeight, undefined, "FAST"); pdfDocument.restoreGraphicsState();
  }
  const blob = pdfDocument.output("blob");
  const fileName = `plotterfun-${options.pageFormat}-${orientation}.pdf`;
  return {
    preview: createPagePreview(printableSource, pageWidth, pageHeight, margin, drawX, drawY, drawWidth, drawHeight),
    data: { task: "document-to-pdf", mimeType: "application/pdf", fileName, blob, options: { ...options }, page: { widthMm: pageWidth, heightMm: pageHeight }, source: { type: svg ? "svg" : "image", vector: Boolean(svg), width: source.width, height: source.height }, bytes: blob.size, generatedAtIso: new Date().toISOString() },
  };
}

export async function generateSvgPdf(svg: GraphSvg, options: PdfPrintOptions) {
  const printableSvg = options.grayscale ? grayscaleSvg(svg) : svg;
  const previewSource = await rasterizeGraphSvg(printableSvg);
  return generatePdf(previewSource, printableSvg, options);
}

export function downloadPdf(data: GraphPdfData) {
  const url = URL.createObjectURL(data.blob), link = document.createElement("a"); link.href = url; link.download = data.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printPdf(data: GraphPdfData) {
  const url = URL.createObjectURL(data.blob), frame = document.createElement("iframe");
  frame.style.position = "fixed"; frame.style.width = "1px"; frame.style.height = "1px"; frame.style.opacity = "0"; frame.style.pointerEvents = "none"; frame.src = url; document.body.append(frame);
  frame.onload = () => window.setTimeout(() => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } finally { window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000); } }, 250);
}
