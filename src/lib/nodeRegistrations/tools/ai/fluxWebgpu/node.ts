import { drawImagePreview, resizeNodeForPreview } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { notifyGraphStateChange } from "../../shared";
import {
  FLUX_WEBGPU_DEFAULTS,
  type FluxWebGpuLevel,
  type FluxWebGpuOptions,
  type FluxWebGpuResidency,
  type GraphFluxWebGpuData,
} from "./model";
import { generateFluxWebGpu, unloadFluxWebGpu } from "./runtime";

const clampInt = (value: unknown, min: number, max: number) =>
  Math.round(Math.min(max, Math.max(min, Number(value))));

export class FluxWebGpuToolNode {
  size: [number, number] = [360, 500];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  data: GraphFluxWebGpuData | null = null;
  status = "pronto · primo avvio scarica circa 3,2 GB";
  progress = 0;
  executionMs: number | null = null;
  isRunning = false;
  private pendingRun = false;
  private controller: AbortController | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & FluxWebGpuToolNode;
    node.title = "TOOLS / AI / FLUX WEBGPU";
    node.properties = { ...FLUX_WEBGPU_DEFAULTS };
    node.addOutput("image", "image");
    node.addOutput("info", "flux-webgpu");
    node.addWidget("text", "Prompt", FLUX_WEBGPU_DEFAULTS.prompt, (value) => {
      node.properties.prompt = String(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("combo", "Risoluzione", "512×512", (value) => {
      const side = Number.parseInt(String(value), 10);
      node.properties.width = side;
      node.properties.height = side;
      notifyGraphStateChange(node);
    }, { values: ["256×256", "512×512", "768×768", "1024×1024"] });
    node.addWidget("slider", "Steps", 4, (value) => {
      node.properties.steps = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 4, step: 1, precision: 0 });
    node.addWidget("number", "Seed", 42, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 2147483647, step: 1, precision: 0 });
    node.addWidget("combo", "Qualità", "mint", (value) => {
      node.properties.level = String(value);
      notifyGraphStateChange(node);
    }, { values: ["mint", "weathered", "off-the-rails"] });
    node.addWidget("combo", "Memoria", "all", (value) => {
      node.properties.residency = String(value);
      notifyGraphStateChange(node);
    }, { values: ["all", "lean"] });
    node.addWidget("button", "Genera", null, () => {
      if (!node.isRunning) node.pendingRun = true;
      node.setDirtyCanvas(true, true);
    });
    node.addWidget("button", "Annulla", null, () => node.controller?.abort());
    node.addWidget("button", "Scarica modello dalla GPU", null, () => {
      node.controller?.abort();
      void unloadFluxWebGpu().then(() => {
        node.status = "modello rilasciato";
        node.setDirtyCanvas(true, true);
      });
    });
    node.refreshPreviewLayout = () => {
      resizeNodeForPreview(node, node.preview, { footerLines: 4 });
      node.setDirtyCanvas(true, true);
    };
    node.refreshPreviewLayout();
  }

  private getOptions(): FluxWebGpuOptions {
    const rawLevel = String(this.properties.level ?? "mint");
    const level: FluxWebGpuLevel = rawLevel === "weathered" || rawLevel === "off-the-rails"
      ? rawLevel
      : "mint";
    const residency: FluxWebGpuResidency = this.properties.residency === "lean" ? "lean" : "all";
    const width = Math.round(clampInt(this.properties.width, 256, 1024) / 16) * 16;
    const height = Math.round(clampInt(this.properties.height, 256, 1024) / 16) * 16;
    return {
      prompt: String(this.properties.prompt ?? "").trim(),
      width,
      height,
      steps: clampInt(this.properties.steps, 1, 4),
      seed: clampInt(this.properties.seed, 0, 2147483647),
      level,
      residency,
    };
  }

  onExecute(this: PreviewAwareNode & FluxWebGpuToolNode) {
    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.data);
    if (!this.pendingRun || this.isRunning) return;
    this.pendingRun = false;
    const options = this.getOptions();
    if (!options.prompt) {
      this.status = "inserisci un prompt";
      return;
    }

    this.isRunning = true;
    this.progress = 0;
    this.executionMs = null;
    this.status = "verifica WebGPU...";
    const controller = new AbortController();
    this.controller = controller;
    void generateFluxWebGpu(options, controller.signal, (progress) => {
      this.progress = progress.ratio;
      const byteInfo = progress.totalBytes
        ? ` · ${(progress.loadedBytes! / 2 ** 20).toFixed(0)}/${(progress.totalBytes / 2 ** 20).toFixed(0)} MiB`
        : "";
      this.status = `${progress.label}${byteInfo}`;
      this.setDirtyCanvas(true, true);
    }).then(({ image, data }) => {
      this.preview = image;
      this.data = data;
      this.executionMs = data.timing.totalMs;
      this.status = "completata";
      this.progress = 1;
      this.setOutputData(0, image);
      this.setOutputData(1, data);
    }).catch((error) => {
      this.status = error instanceof DOMException && error.name === "AbortError"
        ? "generazione annullata"
        : error instanceof Error ? error.message : "errore FLUX WebGPU";
    }).finally(() => {
      this.isRunning = false;
      this.controller = null;
      this.refreshPreviewLayout();
    });
  }

  onDrawBackground(this: PreviewAwareNode & FluxWebGpuToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    const options = this.getOptions();
    context.save();
    context.fillStyle = "rgba(255,255,255,.76)";
    context.font = "12px sans-serif";
    context.fillText(this.status.slice(0, 58), 10, layout.footerTop + 12);
    context.fillText(`${options.width}×${options.height} · ${options.steps} step · ${options.level} · ${options.residency}`, 10, layout.footerTop + 30);
    context.fillText(`WebGPU · FLUX.2 Klein 4B + Qwen3-4B · ${(this.progress * 100).toFixed(0)}%`, 10, layout.footerTop + 48);
    context.fillText(this.executionMs === null ? "[-- ms]" : `[${this.executionMs.toFixed(0)} ms]`, 10, layout.footerTop + 66);
    context.restore();
  }

  onRemoved(this: FluxWebGpuToolNode) {
    this.controller?.abort();
  }
}
