import type { GraphImage } from "../../../../../models/graphImage";
import { drawImagePreview, resizeNodeForPreview } from "../../../../imageUtils";
import type { PreviewAwareNode } from "../../../shared";
import { CHATGPT_IMAGE_DEFAULTS, type ChatGptImageOptions } from "./model";
import { transformWithChatGptImage } from "./runtime";

const API_KEY_STORAGE = "plotterfun.openaiApiKey";

function notify(node: PreviewAwareNode) { node.graph?.onGraphStateChange?.(); }
function isImage(value: unknown): value is GraphImage {
  return value instanceof HTMLCanvasElement && value.width > 0 && value.height > 0;
}

export class ChatGptImageToolNode {
  size: [number, number] = [280, 460];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "pronto";
  cacheStatus = "cache --";
  isRunning = false;
  pendingRun = false;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & ChatGptImageToolNode;
    node.title = "TOOLS / AI / ChatGPT Image";
    node.properties = {
      ...CHATGPT_IMAGE_DEFAULTS,
      prompt: "Trasforma l'immagine mantenendo soggetto e composizione, nello stile: ",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("text", "Stile / prompt", node.properties.prompt, (value) => {
      node.properties.prompt = String(value); notify(node);
    });
    node.addWidget("combo", "Qualità", CHATGPT_IMAGE_DEFAULTS.quality, (value) => {
      node.properties.quality = String(value); notify(node);
    }, { values: ["auto", "low", "medium", "high"] });
    node.addWidget("combo", "Formato", CHATGPT_IMAGE_DEFAULTS.outputFormat, (value) => {
      node.properties.outputFormat = String(value); notify(node);
    }, { values: ["png", "webp", "jpeg"] });
    node.addWidget("button", "Imposta API key", null, () => {
      const current = sessionStorage.getItem(API_KEY_STORAGE) ?? "";
      const apiKey = window.prompt("OpenAI API key (salvata solo per questa sessione)", current);
      if (apiKey === null) return;
      const trimmed = apiKey.trim();
      if (trimmed) sessionStorage.setItem(API_KEY_STORAGE, trimmed);
      else sessionStorage.removeItem(API_KEY_STORAGE);
      node.status = trimmed ? "API key impostata" : "API key rimossa";
      node.setDirtyCanvas(true, true);
    });
    node.addWidget("button", "Trasforma immagine", null, () => {
      if (!node.isRunning) node.pendingRun = true;
      node.setDirtyCanvas(true, true);
    });
    node.refreshPreviewLayout = () => {
      resizeNodeForPreview(node, node.preview, { footerLines: 3 });
      node.setDirtyCanvas(true, true);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & ChatGptImageToolNode) {
    const value = this.getInputData(0);
    const input = isImage(value) ? value : null;
    this.setOutputData(0, this.preview);
    if (!this.pendingRun || this.isRunning) { this.refreshPreviewLayout(); return; }
    this.pendingRun = false;
    if (!input) { this.status = "collega un'immagine valida"; this.refreshPreviewLayout(); return; }
    const apiKey = sessionStorage.getItem(API_KEY_STORAGE)?.trim() ?? "";
    if (!apiKey) { this.status = "imposta prima la API key"; this.refreshPreviewLayout(); return; }
    const prompt = String(this.properties.prompt ?? "").trim();
    if (!prompt) { this.status = "inserisci uno stile / prompt"; this.refreshPreviewLayout(); return; }
    const options: ChatGptImageOptions = {
      prompt,
      model: String(this.properties.model ?? CHATGPT_IMAGE_DEFAULTS.model),
      quality: String(this.properties.quality ?? "auto") as ChatGptImageOptions["quality"],
      size: String(this.properties.size ?? "auto") as ChatGptImageOptions["size"],
      outputFormat: String(this.properties.outputFormat ?? "png") as ChatGptImageOptions["outputFormat"],
      endpoint: String(this.properties.endpoint ?? CHATGPT_IMAGE_DEFAULTS.endpoint),
    };
    const startedAt = performance.now();
    this.isRunning = true; this.status = "trasformazione in corso..."; this.cacheStatus = "verifica cache...";
    void transformWithChatGptImage({ image: input, options, apiKey })
      .then((result) => {
        this.preview = result.image;
        this.cacheStatus = result.cacheHit ? "cache hit" : "cache salvata";
        this.status = result.revisedPrompt ? "completata (prompt rivisto)" : "completata";
        this.executionMs = performance.now() - startedAt;
        this.setOutputData(0, this.preview);
      })
      .catch((error) => {
        this.status = error instanceof Error ? error.message : "errore ChatGPT Image";
        this.cacheStatus = "cache non aggiornata"; this.executionMs = null;
      })
      .finally(() => { this.isRunning = false; this.refreshPreviewLayout(); });
  }

  onDrawBackground(this: PreviewAwareNode & ChatGptImageToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save(); context.fillStyle = "rgba(255,255,255,0.72)"; context.font = "12px sans-serif";
    context.fillText(this.status.slice(0, 42), 10, layout.footerTop + 12);
    context.fillText(`${this.cacheStatus} | output ${this.preview ? `${this.preview.width}x${this.preview.height}` : "--"}`, 10, layout.footerTop + 30);
    context.fillText(this.executionMs === null ? "[-- ms]" : `[${this.executionMs.toFixed(0)} ms]`, 10, layout.footerTop + 48);
    context.restore();
  }
}
