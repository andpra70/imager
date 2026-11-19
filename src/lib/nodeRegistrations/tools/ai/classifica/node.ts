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
  defaultClassificationOptions,
  type ClassificationBackend,
  type ClassificationOptions,
  type GraphClassificationData,
} from "./model";
import { classifyImage, clearClassificationModelCache } from "./runtime";

export class ClassificaToolNode {
  size: [number, number] = [300, 410];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  data: GraphClassificationData | null = null;
  status = "idle";
  executionMs: number | null = null;
  isRendering = false;
  private lastSignature = "";
  private lastOptionsSignature = "";
  private renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & ClassificaToolNode;
    node.title = createToolTitle("AI / Classifica");
    node.properties = { ...defaultClassificationOptions };
    node.addInput("image", "image");
    node.addOutput("response", "classification");
    node.addWidget("combo", "Backend", "wasm", (value) => {
      node.properties.backend = String(value);
      notifyGraphStateChange(node);
    }, { values: ["auto", "webgpu", "wasm"] });
    node.addWidget("slider", "Top risultati", 5, (value) => {
      node.properties.topK = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 20, step: 1, precision: 0 });
    node.addWidget("button", "Ricarica modello", null, () => {
      clearClassificationModelCache();
      node.lastSignature = "";
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4);
    node.refreshPreviewLayout();
  }

  private getOptions(): ClassificationOptions {
    const backendValue = String(this.properties.backend ?? "wasm");
    const backend: ClassificationBackend =
      backendValue === "webgpu" || backendValue === "wasm" ? backendValue : "auto";
    return {
      backend,
      topK: clamp(Math.round(Number(this.properties.topK ?? 5)), 1, 20),
    };
  }

  onExecute(this: PreviewAwareNode & ClassificaToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.data = null;
      this.status = "in attesa di un'immagine";
      this.isRendering = false;
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = input;
    const signature = getGraphImageSignature(input);
    const options = this.getOptions();
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      this.isRendering = true;
      this.status = "caricamento MobileNetV4...";
      this.executionMs = null;
      this.setDirtyCanvas(true, true);

      void classifyImage(input, options, (progress) => {
        if (renderToken !== this.renderToken) return;
        if (progress.status === "fallback-cpu") {
          this.status = "GPU non disponibile · carico CPU...";
        } else {
          const percent = progress.percent === null ? "" : ` ${progress.percent.toFixed(0)}%`;
          const file = progress.file ? ` · ${progress.file.split("/").pop()}` : "";
          this.status = `${progress.status}${percent}${file}`;
        }
        this.setDirtyCanvas(true, true);
      })
        .then((data) => {
          if (renderToken !== this.renderToken) return;
          this.data = data;
          this.executionMs = data.timing.totalMs;
          this.status = data.backend.fallbackReason ? "pronto · fallback CPU" : "pronto";
          this.isRendering = false;
          this.setOutputData(0, data);
          this.refreshPreviewLayout();
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) return;
          this.data = null;
          this.executionMs = null;
          this.status = error instanceof Error ? error.message : "errore di classificazione";
          this.isRendering = false;
          this.setOutputData(0, null);
          this.refreshPreviewLayout();
        });
    }

    this.setOutputData(0, this.data);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & ClassificaToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    const first = this.data?.predictions[0];
    const backend = this.data?.backend.used ?? String(this.properties.backend ?? "wasm");
    context.save();
    context.fillStyle = "rgba(255,255,255,.72)";
    context.font = "12px sans-serif";
    context.fillText(first ? `${first.label} · ${(first.score * 100).toFixed(1)}%` : this.status, 10, layout.footerTop + 12);
    context.fillText(`MobileNetV4 · ${backend}`, 10, layout.footerTop + 30);
    context.fillText(`${this.data?.predictions.length ?? 0} risultati`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
