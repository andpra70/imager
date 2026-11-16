import { drawImagePreview, rasterizeGraphSvg } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import type { GraphSvg } from "../../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../../shared";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  getGraphImageSignature,
  isGraphImageReady,
  notifyGraphStateChange,
  refreshNode,
} from "../../shared";
import type { JapaneseBrushOptions } from "./model";
import { generateJapaneseBrush } from "./runtime";

export class JapaneseBrushToolNode {
  size: [number, number] = [280, 510];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  strokeCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & JapaneseBrushToolNode;
    node.title = createToolTitle("Japanese Brush");
    node.properties = { maxWidth: 900, grayLevels: 6, spacing: 7, strokeLength: 18, strokeWidth: 4, flow: 1.7, seed: 1 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    const slider = (label: string, key: keyof JapaneseBrushOptions, value: number, min: number, max: number, step: number) =>
      node.addWidget("slider", label, value, (next) => {
        node.properties[key] = Number(next);
        notifyGraphStateChange(node);
      }, { min, max, step, precision: step < 1 ? 1 : 0 });
    slider("Max width", "maxWidth", 900, 128, 2400, 8);
    slider("Gray levels", "grayLevels", 6, 2, 16, 1);
    slider("Spacing", "spacing", 7, 2, 24, 1);
    slider("Stroke length", "strokeLength", 18, 3, 64, 1);
    slider("Stroke width", "strokeWidth", 4, 0.5, 16, 0.5);
    slider("Ink flow", "flow", 1.7, 0.2, 4, 0.1);
    slider("Seed", "seed", 1, 0, 999, 1);
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & JapaneseBrushToolNode) {
    const value = this.getInputData(0);
    const input = isGraphImageReady(value) ? value : null;
    if (!input) {
      this.renderToken += 1;
      this.preview = null; this.svg = null; this.status = "waiting valid image"; this.progress = 0;
      this.strokeCount = 0; this.outputWidth = 0; this.outputHeight = 0; this.isRendering = false;
      this.lastSignature = ""; this.lastOptionsSignature = ""; this.executionMs = null;
      this.setOutputData(0, null); this.setOutputData(1, null); this.refreshPreviewLayout();
      return;
    }
    const options: JapaneseBrushOptions = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 900)), 128, 2400),
      grayLevels: clamp(Math.round(Number(this.properties.grayLevels ?? 6)), 2, 16),
      spacing: clamp(Math.round(Number(this.properties.spacing ?? 7)), 2, 24),
      strokeLength: clamp(Number(this.properties.strokeLength ?? 18), 3, 64),
      strokeWidth: clamp(Number(this.properties.strokeWidth ?? 4), 0.5, 16),
      flow: clamp(Number(this.properties.flow ?? 1.7), 0.2, 4),
      seed: clamp(Math.round(Number(this.properties.seed ?? 1)), 0, 999),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature; this.lastOptionsSignature = optionsSignature;
      const token = ++this.renderToken;
      const startedAt = performance.now();
      this.isRendering = true; this.progress = 0; this.status = "generating brush strokes";
      const updateProgress = (progress: number, status?: string) => {
        if (token !== this.renderToken) return;
        this.progress = clamp(progress, 0, 1); if (status) this.status = status; this.setDirtyCanvas(true, true);
      };
      void generateJapaneseBrush(input, options, () => token !== this.renderToken, updateProgress)
        .then(async (result) => {
          if (!result || token !== this.renderToken) return null;
          this.svg = result.svg; this.strokeCount = result.strokeCount;
          this.outputWidth = result.outputWidth; this.outputHeight = result.outputHeight;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (!preview || token !== this.renderToken) return;
          this.preview = preview; this.progress = 1; this.status = "ready";
          this.executionMs = performance.now() - startedAt; this.isRendering = false; this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (token !== this.renderToken) return;
          this.preview = null; this.svg = null; this.status = error instanceof Error ? error.message : "brush error";
          this.progress = 0; this.isRendering = false; this.executionMs = null; this.setDirtyCanvas(true, true);
        });
    }
    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & JapaneseBrushToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save(); context.fillStyle = "rgba(255,255,255,0.65)"; context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | strokes ${this.strokeCount}`, 10, layout.footerTop + 30);
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"} | ${Math.round(Number(this.properties.grayLevels ?? 6))} grays`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66); context.restore();
  }
}

