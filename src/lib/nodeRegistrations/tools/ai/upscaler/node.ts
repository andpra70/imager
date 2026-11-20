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
  defaultUpscalerOptions,
  type GraphUpscalerData,
  type UpscalerOptions,
  type UpscalerScale,
} from "./model";
import { clearUpscalerModelCache, upscaleGraphImage } from "./runtime";

export class UpscalerToolNode {
  size: [number, number] = [320, 430];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  data: GraphUpscalerData | null = null;
  status = "idle";
  progress = 0;
  executionMs: number | null = null;
  isRendering = false;
  private lastSignature = "";
  private lastOptionsSignature = "";
  private renderToken = 0;
  private abortController: AbortController | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & UpscalerToolNode;
    node.title = createToolTitle("AI / UpscalerJS");
    node.properties = { ...defaultUpscalerOptions };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("info", "upscaler");
    node.addWidget("combo", "Scala / modello", "2x", (value) => {
      node.properties.scale = Number.parseInt(String(value), 10);
      notifyGraphStateChange(node);
    }, { values: ["2x", "3x", "4x"] });
    node.addWidget("combo", "Patch", "64", (value) => {
      node.properties.patchSize = Number(value);
      notifyGraphStateChange(node);
    }, { values: [32, 64, 96, 128] });
    node.addWidget("slider", "Padding", 4, (value) => {
      node.properties.padding = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 16, step: 1, precision: 0 });
    node.addWidget("toggle", "UI responsiva", true, (value) => {
      node.properties.awaitNextFrame = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("button", "Ricarica modello", null, () => {
      node.abortController?.abort();
      void clearUpscalerModelCache();
      node.lastSignature = "";
      node.lastOptionsSignature = "";
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4);
    node.refreshPreviewLayout();
  }

  private getOptions(): UpscalerOptions {
    const rawScale = Math.round(Number(this.properties.scale ?? 2));
    const scale: UpscalerScale = rawScale === 3 || rawScale === 4 ? rawScale : 2;
    return {
      scale,
      patchSize: clamp(Math.round(Number(this.properties.patchSize ?? 64)), 16, 256),
      padding: clamp(Math.round(Number(this.properties.padding ?? 4)), 0, 32),
      awaitNextFrame: Boolean(this.properties.awaitNextFrame ?? true),
    };
  }

  onExecute(this: PreviewAwareNode & UpscalerToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.abortController?.abort();
      this.preview = null;
      this.data = null;
      this.status = "in attesa di un'immagine";
      this.progress = 0;
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
      this.abortController?.abort();
      const controller = new AbortController();
      this.abortController = controller;
      const renderToken = ++this.renderToken;
      this.isRendering = true;
      this.progress = 0;
      this.executionMs = null;
      this.status = `caricamento ESRGAN Slim ${options.scale}x...`;
      this.setDirtyCanvas(true, true);

      void upscaleGraphImage(input, options, controller.signal, ({ ratio }) => {
        if (renderToken !== this.renderToken) return;
        this.progress = clamp(ratio, 0, 1);
        this.status = `upscaling ${(this.progress * 100).toFixed(0)}%`;
        this.setDirtyCanvas(true, true);
      }).then(({ image, data }) => {
        if (renderToken !== this.renderToken) return;
        this.preview = image;
        this.data = data;
        this.executionMs = data.timing.totalMs;
        this.progress = 1;
        this.status = "pronto";
        this.isRendering = false;
        this.setOutputData(0, image);
        this.setOutputData(1, data);
        this.refreshPreviewLayout();
      }).catch((error) => {
        if (renderToken !== this.renderToken) return;
        this.isRendering = false;
        if (error instanceof DOMException && error.name === "AbortError") return;
        this.preview = null;
        this.data = null;
        this.status = error instanceof Error ? error.message : "errore UpscalerJS";
        this.setOutputData(0, null);
        this.setOutputData(1, null);
        this.refreshPreviewLayout();
      });
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.data);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & UpscalerToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    const options = this.getOptions();
    context.save();
    context.fillStyle = "rgba(255,255,255,.72)";
    context.font = "12px sans-serif";
    context.fillText(this.status, 10, layout.footerTop + 12);
    context.fillText(`ESRGAN Slim ${options.scale}x · patch ${options.patchSize} · pad ${options.padding}`, 10, layout.footerTop + 30);
    context.fillText(this.data ? `${this.data.input.width}×${this.data.input.height} → ${this.data.output.width}×${this.data.output.height}` : "UpscalerJS · TensorFlow.js", 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
