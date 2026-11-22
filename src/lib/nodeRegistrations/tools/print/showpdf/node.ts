import { drawImagePreview } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle, refreshNode } from "../../shared";
import type { GraphPdfData } from "../pdf/model";

type ShowPdfNode = PreviewAwareNode & ShowPdfToolNode;

function isGraphPdfData(value: unknown): value is GraphPdfData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<GraphPdfData>;
  return data.mimeType === "application/pdf" && data.blob instanceof Blob && data.preview instanceof HTMLCanvasElement;
}

export class ShowPdfToolNode {
  size: [number, number] = [320, 420];
  preview: GraphImage | null = null;
  status = "in attesa del PDF";
  data: GraphPdfData | null = null;

  constructor() {
    const node = this as unknown as ShowPdfNode;
    node.title = createToolTitle("Print/ShowPDF");
    node.properties = {};
    node.addInput("pdf", "pdf");
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 2);
    node.refreshPreviewLayout();
  }

  onExecute(this: ShowPdfNode) {
    const value: unknown = this.getInputData(0);
    this.data = isGraphPdfData(value) ? value : null;
    this.preview = this.data?.preview ?? null;
    this.status = this.data ? `${this.data.page.widthMm.toFixed(1)} × ${this.data.page.heightMm.toFixed(1)} mm · ${(this.data.bytes / 1024).toFixed(0)} KiB` : value ? "PDF non compatibile con Print/PDF" : "in attesa del PDF";
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: ShowPdfNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save(); context.fillStyle = "rgba(255,255,255,.74)"; context.font = "12px sans-serif";
    context.fillText(this.status, 10, layout.footerTop + 12);
    context.fillText(this.data?.fileName ?? "", 10, layout.footerTop + 30);
    context.restore();
  }
}
