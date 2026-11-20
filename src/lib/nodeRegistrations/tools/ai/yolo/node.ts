import { drawImagePreview } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
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
import {
  defaultYoloOptions,
  type GraphYoloData,
  type YoloBackendPreference,
  type YoloOptions,
} from "./model";
import { clearYoloModelCache, detectObjects } from "./runtime";

export class YoloToolNode {
  size: [number, number] = [320, 460];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  data: GraphYoloData | null = null;
  status = "idle";
  executionMs: number | null = null;
  isRendering = false;
  private lastSignature = "";
  private lastOptionsSignature = "";
  private renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & YoloToolNode;
    node.title = createToolTitle("AI / YOLO26");
    node.properties = { ...defaultYoloOptions };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("detections", "yolo");
    node.addWidget("combo", "Backend", "auto", (value) => {
      node.properties.backend = String(value);
      notifyGraphStateChange(node);
    }, { values: ["auto", "webgpu", "cpu"] });
    node.addWidget("slider", "Confidenza", 0.25, (value) => {
      node.properties.confidence = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 0.95, step: 0.01, precision: 2 });
    node.addWidget("slider", "IoU", 0.5, (value) => {
      node.properties.iou = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 0.9, step: 0.01, precision: 2 });
    node.addWidget("toggle", "Etichette", true, (value) => {
      node.properties.showLabels = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Spessore box", 3, (value) => {
      node.properties.lineWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 10, step: 1, precision: 0 });
    node.addWidget("button", "Ricarica modello", null, () => {
      void clearYoloModelCache();
      node.lastSignature = "";
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4);
    node.refreshPreviewLayout();
  }

  private getOptions(): YoloOptions {
    const value = String(this.properties.backend ?? "auto");
    const backend: YoloBackendPreference = value === "webgpu" || value === "cpu" ? value : "auto";
    return {
      backend,
      confidence: clamp(Number(this.properties.confidence ?? 0.25), 0.05, 0.95),
      iou: clamp(Number(this.properties.iou ?? 0.5), 0.1, 0.9),
      showLabels: Boolean(this.properties.showLabels ?? true),
      lineWidth: clamp(Math.round(Number(this.properties.lineWidth ?? 3)), 1, 10),
    };
  }

  onExecute(this: PreviewAwareNode & YoloToolNode) {
    const value = this.getInputData(0);
    const input = isGraphImageReady(value) ? value : null;
    if (!input) {
      this.preview = null;
      this.data = null;
      this.status = "in attesa di un'immagine";
      this.isRendering = false;
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getOptions();
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const token = ++this.renderToken;
      this.preview = input;
      this.isRendering = true;
      this.status = "caricamento YOLO26n...";
      this.executionMs = null;
      this.setDirtyCanvas(true, true);
      void detectObjects(input, options)
        .then(({ image, data }) => {
          if (token !== this.renderToken) return;
          this.preview = image;
          this.data = data;
          this.executionMs = data.timing.totalMs;
          this.status = "pronto";
          this.isRendering = false;
          this.setOutputData(0, image);
          this.setOutputData(1, data);
          this.refreshPreviewLayout();
        })
        .catch((error) => {
          if (token !== this.renderToken) return;
          this.data = null;
          this.executionMs = null;
          this.status = error instanceof Error ? error.message : "errore YOLO";
          this.isRendering = false;
          this.setOutputData(0, null);
          this.setOutputData(1, null);
          this.refreshPreviewLayout();
        });
    }
    this.setOutputData(0, this.data ? this.preview : null);
    this.setOutputData(1, this.data);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & YoloToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    const backend = this.data?.engine.backend ?? String(this.properties.backend ?? "auto");
    context.save();
    context.fillStyle = "rgba(255,255,255,.72)";
    context.font = "12px sans-serif";
    context.fillText(this.status, 10, layout.footerTop + 12);
    context.fillText(`YOLO26n · ${backend}`, 10, layout.footerTop + 30);
    context.fillText(`${this.data?.detections.length ?? 0} oggetti`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
