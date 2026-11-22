import { drawImagePreview, rasterizeGraphSvg } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import type { GraphSvg } from "../../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle, formatExecutionInfo, refreshNode } from "../../shared";
import type { GraphPdfData } from "../pdf/model";

type Pdf2SvgNode = PreviewAwareNode & Pdf2SvgToolNode;

function isGraphPdfData(value: unknown): value is GraphPdfData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<GraphPdfData>;
  return data.mimeType === "application/pdf" && data.blob instanceof Blob && typeof data.pageSvg === "string" && data.preview instanceof HTMLCanvasElement;
}

export class Pdf2SvgToolNode {
  size: [number, number] = [320, 420];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "in attesa del PDF";
  isRendering = false;
  executionMs: number | null = null;
  private source: GraphPdfData | null = null;
  private renderToken = 0;

  constructor() {
    const node = this as unknown as Pdf2SvgNode;
    node.title = createToolTitle("Print/PDF2SVG");
    node.properties = {};
    node.addInput("pdf", "pdf");
    node.addOutput("svg", "svg");
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 2);
    node.refreshPreviewLayout();
  }

  onExecute(this: Pdf2SvgNode) {
    const value: unknown = this.getInputData(0);
    if (!isGraphPdfData(value)) {
      ++this.renderToken;
      this.source = null; this.svg = null; this.preview = null; this.isRendering = false;
      this.status = value ? "PDF non compatibile con Print/PDF" : "in attesa del PDF";
      this.setOutputData(0, null); this.refreshPreviewLayout();
      return;
    }
    if (value !== this.source) {
      const started = performance.now();
      const token = ++this.renderToken;
      this.source = value;
      this.svg = value.pageSvg;
      this.preview = null;
      this.isRendering = true;
      this.status = "anteprima SVG...";
      void rasterizeGraphSvg(this.svg).then(preview => {
        if (token !== this.renderToken) return;
        this.preview = preview;
        this.executionMs = performance.now() - started;
        this.isRendering = false;
        this.status = "SVG pronto";
        this.refreshPreviewLayout();
      }).catch(error => {
        if (token !== this.renderToken) return;
        this.preview = null;
        this.isRendering = false;
        this.status = error instanceof Error ? error.message : "errore anteprima SVG";
        this.refreshPreviewLayout();
      });
    }
    this.setOutputData(0, this.svg); this.refreshPreviewLayout();
  }

  onDrawBackground(this: Pdf2SvgNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save(); context.fillStyle = "rgba(255,255,255,.74)"; context.font = "12px sans-serif";
    context.fillText(this.status, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}
