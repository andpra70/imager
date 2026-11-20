import { drawImagePreview } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import type { GraphSvg } from "../../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../../shared";
import { clamp, createToolTitle, formatExecutionInfo, getGraphImageSignature, isGraphImageReady, notifyGraphStateChange, refreshNode } from "../../shared";
import { defaultPdfPrintOptions, pdfPageFormatLabels, type GraphPdfData, type PdfImageFit, type PdfOrientation, type PdfPageFormat, type PdfPrintOptions } from "./model";
import { downloadPdf, generateImagePdf, generateSvgPdf, printPdf } from "./runtime";

type PdfNode = PreviewAwareNode & PdfPrintToolNode;

export class PdfPrintToolNode {
  size: [number, number] = [320, 520]; properties!: Record<string, unknown>; preview: GraphImage | null = null; data: GraphPdfData | null = null;
  status = "in attesa di image o svg"; isRendering = false; executionMs: number | null = null;
  private signature = ""; private optionsSignature = ""; private renderToken = 0;
  constructor() {
    const node = this as unknown as PdfNode; node.title = createToolTitle("Print/PDF"); node.properties = { ...defaultPdfPrintOptions };
    node.addInput("image", "image"); node.addInput("svg", "svg"); node.addOutput("pdf", "pdf"); node.addOutput("preview", "image");
    const property = (key: keyof PdfPrintOptions, value: unknown) => { node.properties[key] = value; node.signature = ""; notifyGraphStateChange(node); node.setDirtyCanvas(true, true); };
    node.addWidget("combo", "Formato pagina", "a4", value => property("pageFormat", String(value)), { values: Object.keys(pdfPageFormatLabels) });
    node.addWidget("combo", "Orientamento", "auto", value => property("orientation", String(value)), { values: ["auto", "portrait", "landscape"] });
    node.addWidget("combo", "Adattamento", "contain", value => property("fit", String(value)), { values: ["contain", "cover"] });
    node.addWidget("slider", "Margine %", 5, value => property("marginPercent", Number(value)), { min: 0, max: 45, step: 1, precision: 0 });
    node.addWidget("toggle", "Grays", false, value => property("grayscale", Boolean(value)));
    node.addWidget("slider", "Qualità JPEG", 92, value => property("jpegQuality", Number(value) / 100), { min: 50, max: 100, step: 1, precision: 0 });
    node.addWidget("button", "Download PDF", null, () => { if (node.data) downloadPdf(node.data); else node.status = "genera prima un PDF"; });
    node.addWidget("button", "Print", null, () => { if (node.data) printPdf(node.data); else node.status = "genera prima un PDF"; node.setDirtyCanvas(true, true); });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4); node.refreshPreviewLayout();
  }
  private options(): PdfPrintOptions { const format = String(this.properties.pageFormat ?? "a4") as PdfPageFormat; const orientation = String(this.properties.orientation ?? "auto") as PdfOrientation; const fit = String(this.properties.fit ?? "contain") as PdfImageFit; return { pageFormat: format in pdfPageFormatLabels ? format : "a4", orientation: orientation === "portrait" || orientation === "landscape" ? orientation : "auto", fit: fit === "cover" ? "cover" : "contain", marginPercent: clamp(Number(this.properties.marginPercent ?? 5), 0, 45), grayscale: Boolean(this.properties.grayscale ?? false), jpegQuality: clamp(Number(this.properties.jpegQuality ?? .92), .5, 1) }; }
  onExecute(this: PdfNode) {
    const inputValue = this.getInputData(0), input = isGraphImageReady(inputValue) ? inputValue : null;
    const svgValue = this.getInputData(1) as unknown;
    const svg = typeof svgValue === "string" && /<svg\b/i.test(svgValue) ? svgValue as GraphSvg : null;
    if (!input && !svg) { this.preview = null; this.data = null; this.status = "in attesa di image o svg"; this.isRendering = false; this.setOutputData(0, null); this.setOutputData(1, null); this.refreshPreviewLayout(); return; }
    const signature = svg ? `svg:${svg.length}:${svg.slice(0, 128)}:${svg.slice(-128)}` : getGraphImageSignature(input), options = this.options(), optionsSignature = JSON.stringify(options);
    if (signature !== this.signature || optionsSignature !== this.optionsSignature) {
      this.signature = signature; this.optionsSignature = optionsSignature; const token = ++this.renderToken; const started = performance.now(); this.isRendering = true; this.status = "generazione PDF...";
      const generation = svg ? generateSvgPdf(svg, options) : generateImagePdf(input!, options);
      void generation.then(({ preview, data }) => { if (token !== this.renderToken) return; this.preview = preview; this.data = data; this.executionMs = performance.now() - started; this.isRendering = false; this.status = `PDF pronto · ${data.source.type}`; this.setOutputData(0, data); this.setOutputData(1, preview); this.refreshPreviewLayout(); }).catch(error => { if (token !== this.renderToken) return; this.preview = null; this.data = null; this.isRendering = false; this.status = error instanceof Error ? error.message : "errore PDF"; this.setOutputData(0, null); this.setOutputData(1, null); this.refreshPreviewLayout(); });
    }
    this.setOutputData(0, this.data); this.setOutputData(1, this.preview); this.refreshPreviewLayout();
  }
  onDrawBackground(this: PdfNode, context: CanvasRenderingContext2D) { const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 }); const options = this.options(); context.save(); context.fillStyle = "rgba(255,255,255,.74)"; context.font = "12px sans-serif"; context.fillText(this.status, 10, layout.footerTop + 12); context.fillText(`${pdfPageFormatLabels[options.pageFormat]} · ${options.orientation} · ${options.fit} · margine ${options.marginPercent}%`, 10, layout.footerTop + 30); context.fillText(this.data ? `${this.data.page.widthMm.toFixed(1)}×${this.data.page.heightMm.toFixed(1)} mm · ${(this.data.bytes / 1024).toFixed(0)} KiB · ${options.grayscale ? "grays" : "color"}` : "PDF non generato", 10, layout.footerTop + 48); context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66); context.restore(); }
}
