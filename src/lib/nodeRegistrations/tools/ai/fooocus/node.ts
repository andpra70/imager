import type { GraphImage } from "../../../../../models/graphImage";
import { drawImagePreview, resizeNodeForPreview } from "../../../../imageUtils";
import type { PreviewAwareNode } from "../../../shared";
import { FOOOCUS_DEFAULTS, type FooocusOptions } from "./model";
import { fetchFooocusBaseModels, fetchFooocusLoraModels, transformWithFooocus } from "./runtime";

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function isImage(value: unknown): value is GraphImage { return value instanceof HTMLCanvasElement && value.width > 0 && value.height > 0; }
function notify(node: PreviewAwareNode) { node.graph?.onGraphStateChange?.(); }

export class FooocusToolNode {
  size: [number, number] = [320, 580];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "pronto";
  cacheStatus = "cache --";
  seed: string | number | null = null;
  pendingRun = false;
  isRunning = false;
  executionMs: number | null = null;
  progress: number | null = null;
  logLines: string[] = [];

  constructor() {
    const node = this as unknown as PreviewAwareNode & FooocusToolNode;
    node.title = "TOOLS / AI / Fooocus Local";
    node.properties = { ...FOOOCUS_DEFAULTS };
    node.addInput("image", "image"); node.addOutput("image", "image");
    node.addWidget("text", "Prompt", FOOOCUS_DEFAULTS.prompt, (value) => { node.properties.prompt = String(value); notify(node); });
    node.addWidget("text", "Negative", FOOOCUS_DEFAULTS.negativePrompt, (value) => { node.properties.negativePrompt = String(value); notify(node); });
    node.addWidget("toggle", "Prompt expansion", FOOOCUS_DEFAULTS.promptExpansion, (value) => { node.properties.promptExpansion = Boolean(value); notify(node); });
    node.addWidget("combo", "Base model", "Automatico", (value) => {
      node.properties.baseModel = value === "Automatico" ? "" : String(value); notify(node);
    }, { values: ["Automatico"] });
    for (let slot = 1; slot <= 5; slot += 1) {
      node.properties[`lora${slot}Enabled`] = false;
      node.properties[`lora${slot}Model`] = "None";
      node.properties[`lora${slot}Weight`] = 1;
      node.addWidget("toggle", `LoRA ${slot} enable`, false, (value) => { node.properties[`lora${slot}Enabled`] = Boolean(value); notify(node); });
      node.addWidget("combo", `LoRA ${slot}`, "None", (value) => { node.properties[`lora${slot}Model`] = String(value); notify(node); }, { values: ["None"] });
      node.addWidget("slider", `LoRA ${slot} weight`, 1, (value) => { node.properties[`lora${slot}Weight`] = Number(value); notify(node); }, { min: -2, max: 2, step: 0.05, precision: 2 });
    }
    node.addWidget("slider", "Image stop", FOOOCUS_DEFAULTS.stop, (value) => { node.properties.stop = Number(value); notify(node); }, { min: 0, max: 1, step: 0.05, precision: 2 });
    node.addWidget("slider", "Image weight", FOOOCUS_DEFAULTS.weight, (value) => { node.properties.weight = Number(value); notify(node); }, { min: 0, max: 2, step: 0.05, precision: 2 });
    node.addWidget("text", "Fooocus URL", FOOOCUS_DEFAULTS.baseUrl, (value) => { node.properties.baseUrl = String(value); notify(node); });
    node.addWidget("button", "Aggiorna modelli", null, () => { void node.refreshBaseModels(); });
    node.addWidget("button", "Trasforma con Fooocus", null, () => { if (!node.isRunning) node.pendingRun = true; node.setDirtyCanvas(true, true); });
    node.refreshPreviewLayout = () => { resizeNodeForPreview(node, node.preview, { footerLines: 8 }); node.setDirtyCanvas(true, true); };
    node.refreshPreviewLayout();
    void node.refreshBaseModels();
  }

  async refreshBaseModels(this: PreviewAwareNode & FooocusToolNode) {
    try {
      const baseUrl = String(this.properties.baseUrl ?? FOOOCUS_DEFAULTS.baseUrl);
      const [models, loras] = await Promise.all([fetchFooocusBaseModels(baseUrl), fetchFooocusLoraModels(baseUrl)]);
      const widget = (this.widgets as Array<{ name?: string; options?: { values?: string[] }; value?: unknown }> | undefined)?.find((item) => item.name === "Base model");
      if (widget) {
        widget.options = { ...(widget.options ?? {}), values: ["Automatico", ...models] };
        const selected = String(this.properties.baseModel ?? "");
        widget.value = selected && models.includes(selected) ? selected : "Automatico";
      }
      for (let slot = 1; slot <= 5; slot += 1) {
        const loraWidget = (this.widgets as Array<{ name?: string; options?: { values?: string[] }; value?: unknown }> | undefined)?.find((item) => item.name === `LoRA ${slot}`);
        if (!loraWidget) continue;
        loraWidget.options = { ...(loraWidget.options ?? {}), values: loras };
        const selected = String(this.properties[`lora${slot}Model`] ?? "None");
        loraWidget.value = loras.includes(selected) ? selected : "None";
      }
      this.status = `${models.length} modelli, ${loras.length} LoRA`;
    } catch (error) { this.status = error instanceof Error ? error.message : "modelli Fooocus non disponibili"; }
    this.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & FooocusToolNode) {
    const value = this.getInputData(0); const input = isImage(value) ? value : null;
    this.setOutputData(0, this.preview);
    if (!this.pendingRun || this.isRunning) { this.refreshPreviewLayout(); return; }
    this.pendingRun = false;
    if (!input) { this.status = "collega un'immagine valida"; this.refreshPreviewLayout(); return; }
    const prompt = String(this.properties.prompt ?? "").trim();
    if (!prompt) { this.status = "inserisci un prompt"; this.refreshPreviewLayout(); return; }
    const options: FooocusOptions = {
      baseUrl: String(this.properties.baseUrl ?? FOOOCUS_DEFAULTS.baseUrl).trim(),
      prompt, negativePrompt: String(this.properties.negativePrompt ?? "").trim(),
      promptExpansion: Boolean(this.properties.promptExpansion ?? FOOOCUS_DEFAULTS.promptExpansion),
      baseModel: String(this.properties.baseModel ?? FOOOCUS_DEFAULTS.baseModel),
      loras: Array.from({ length: 5 }, (_, index) => ({
        enabled: Boolean(this.properties[`lora${index + 1}Enabled`] ?? false),
        model: String(this.properties[`lora${index + 1}Model`] ?? "None"),
        weight: clamp(Number(this.properties[`lora${index + 1}Weight`] ?? 1), -2, 2),
      })),
      stop: clamp(Number(this.properties.stop ?? FOOOCUS_DEFAULTS.stop), 0, 1),
      weight: clamp(Number(this.properties.weight ?? FOOOCUS_DEFAULTS.weight), 0, 2),
    };
    const startedAt = performance.now(); this.isRunning = true; this.progress = 0; this.logLines = ["connessione a Fooocus..."]; this.status = "Fooocus in elaborazione..."; this.cacheStatus = "verifica cache...";
    void transformWithFooocus({ image: input, options }, (update) => {
      this.progress = update.progress;
      this.status = update.progress === null ? update.status : `${update.status} ${Math.round(update.progress * 100)}%`;
      if (this.logLines[this.logLines.length - 1] !== this.status) this.logLines = [...this.logLines.slice(-5), this.status];
      if (update.image) { this.preview = update.image; this.setOutputData(0, this.preview); }
      this.refreshPreviewLayout();
    })
      .then((result) => { this.preview = result.image; this.seed = result.seed; this.cacheStatus = result.cacheHit ? "cache hit" : "cache salvata"; this.status = "completata"; this.progress = 1; this.executionMs = performance.now() - startedAt; this.setOutputData(0, this.preview); })
      .catch((error) => { this.status = error instanceof Error ? error.message : "errore Fooocus"; this.cacheStatus = "cache non aggiornata"; this.executionMs = null; })
      .finally(() => { this.isRunning = false; this.refreshPreviewLayout(); });
  }

  onDrawBackground(this: PreviewAwareNode & FooocusToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 8 });
    context.save(); context.fillStyle = "rgba(255,255,255,0.72)"; context.font = "12px sans-serif";
    context.fillText(this.status.slice(0, 44), 10, layout.footerTop + 12);
    context.fillText(`${this.cacheStatus} | avanzamento ${this.progress === null ? "--" : `${Math.round(this.progress * 100)}%`}`, 10, layout.footerTop + 30);
    context.fillText(this.executionMs === null ? "[-- ms]" : `[${this.executionMs.toFixed(0)} ms]`, 10, layout.footerTop + 48); context.restore();
    context.save(); context.fillStyle = "rgba(190,225,255,0.78)"; context.font = "11px monospace";
    this.logLines.slice(-5).forEach((line, index) => context.fillText(`> ${line}`.slice(0, 52), 10, layout.footerTop + 68 + index * 15));
    context.restore();
  }
}
