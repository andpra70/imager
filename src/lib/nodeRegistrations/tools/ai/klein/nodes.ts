import type { GraphImage } from "../../../../../models/graphImage";
import { drawImagePreview, resizeNodeForPreview } from "../../../../imageUtils";
import type { PreviewAwareNode } from "../../../shared";
import { KLEIN_DEFAULTS, KLEIN_STYLE_PRESETS, resolveKleinImg2ImgPrompt, type KleinImg2ImgOptions, type KleinTxt2ImgOptions } from "./model";
import { kleinImg2Img, kleinTxt2Img } from "./runtime";
import { cacheKleinStylePreview, getKleinStylePreview } from "./stylePreview/cache";
import { showKleinStylePreviewOverlay } from "./stylePreview/overlay";
import { findKleinStylePath, KLEIN_STYLE_CATALOG, type KleinStyleGenre, type KleinStyleSubgenre } from "./styles/catalog";

type KleinNode = PreviewAwareNode & {
  preview: GraphImage | null; status: string; pendingRun: boolean; isRunning: boolean;
  controller: AbortController | null; executionMs: number | null; syncWidgets: () => void;
};
type WidgetLike = { name?: string; value?: unknown; options?: Record<string, unknown>; last_y?: number; computeSize?: (width: number) => [number, number] };
type GraphCanvasLike = { graph_mouse?: [number, number] };
const historyLabel = (prompt: string, index: number) => `${index + 1}. ${prompt.replace(/\s+/g, " ").slice(0, 48)}`;
const clampInt = (value: unknown, min: number, max: number) => Math.round(Math.min(max, Math.max(min, Number(value))));
const clamp = (value: unknown, min: number, max: number) => Math.min(max, Math.max(min, Number(value)));
const notify = (node: PreviewAwareNode) => node.graph?.onGraphStateChange?.();
const isImage = (value: unknown): value is GraphImage => value instanceof HTMLCanvasElement && value.width > 0 && value.height > 0;

function widget(node: PreviewAwareNode, name: string) {
  return (node.widgets as WidgetLike[] | undefined)?.find((item) => item.name === name);
}

function addCommonWidgets(node: PreviewAwareNode) {
  node.addWidget("text", "Klein URL", KLEIN_DEFAULTS.baseUrl, (value) => { node.properties.baseUrl = String(value); notify(node); });
  node.addWidget("slider", "Steps", KLEIN_DEFAULTS.steps, (value) => { node.properties.steps = Number(value); notify(node); }, { min: 1, max: 12, step: 1, precision: 0 });
  node.addWidget("slider", "Guidance", KLEIN_DEFAULTS.guidanceScale, (value) => { node.properties.guidanceScale = Number(value); notify(node); }, { min: 0, max: 20, step: 0.1, precision: 1 });
  node.addWidget("number", "Seed", KLEIN_DEFAULTS.seed, (value) => { node.properties.seed = Number(value); notify(node); }, { min: -1, max: 2147483647, step: 1, precision: 0 });
}

function finish(node: KleinNode, started: number, result: GraphImage) {
  node.preview = result; node.setOutputData(0, result); node.executionMs = performance.now() - started; node.status = "completata";
}

function fail(node: KleinNode, error: unknown) {
  node.status = error instanceof DOMException && error.name === "AbortError" ? "operazione annullata" : error instanceof Error ? error.message : "errore Klein";
}

function draw(node: KleinNode, context: CanvasRenderingContext2D) {
  const layout = drawImagePreview(context, node, node.preview, { footerLines: 3 });
  context.save(); context.fillStyle = "rgba(255,255,255,.78)"; context.font = "12px sans-serif";
  context.fillText(node.status.slice(0, 52), 10, layout.footerTop + 15);
  context.fillText(node.executionMs === null ? "[-- ms]" : `[${node.executionMs.toFixed(0)} ms]`, 10, layout.footerTop + 34); context.restore();
}

export class KleinTxt2ImgToolNode {
  size: [number, number] = [340, 470]; properties!: Record<string, unknown>; preview: GraphImage | null = null;
  status = "pronto"; pendingRun = false; isRunning = false; controller: AbortController | null = null; executionMs: number | null = null;
  private historySignature = "";

  constructor() {
    const node = this as unknown as KleinNode & KleinTxt2ImgToolNode;
    node.title = "TOOLS / AI / KLEIN TXT2IMG";
    node.properties = { ...KLEIN_DEFAULTS, prompt: "un gatto che tiene un cartello con la scritta hello world, fotografia cinematografica", promptHistory: [] };
    node.addOutput("image", "image");
    node.addWidget("text", "Prompt", node.properties.prompt, (value) => { node.properties.prompt = String(value); notify(node); });
    node.addWidget("combo", "Cronologia", "Nessun prompt salvato", (value) => {
      const index = Number.parseInt(String(value), 10) - 1; const history = node.getHistory();
      if (history[index]) { node.properties.prompt = history[index]; const promptWidget = widget(node, "Prompt"); if (promptWidget) promptWidget.value = history[index]; notify(node); }
    }, { values: ["Nessun prompt salvato"] });
    node.addWidget("button", "Salva prompt", null, () => { node.savePrompt(); });
    node.addWidget("number", "Width", KLEIN_DEFAULTS.width, (value) => { node.properties.width = Number(value); notify(node); }, { min: 64, max: 1024, step: 16, precision: 0 });
    node.addWidget("number", "Height", KLEIN_DEFAULTS.height, (value) => { node.properties.height = Number(value); notify(node); }, { min: 64, max: 1024, step: 16, precision: 0 });
    addCommonWidgets(node);
    node.addWidget("button", "Genera immagine", null, () => { if (!node.isRunning) node.pendingRun = true; node.setDirtyCanvas(true, true); });
    node.addWidget("button", "Annulla", null, () => node.controller?.abort());
    node.refreshPreviewLayout = () => { resizeNodeForPreview(node, node.preview, { footerLines: 3 }); node.setDirtyCanvas(true, true); };
    node.refreshPreviewLayout(); node.syncWidgets();
  }

  getHistory() {
    return Array.isArray(this.properties.promptHistory)
      ? this.properties.promptHistory
        .filter((item): item is string => typeof item === "string")
        .sort((left, right) => left.localeCompare(right, "it", { sensitivity: "base", numeric: true }))
      : [];
  }
  savePrompt() {
    const prompt = String(this.properties.prompt ?? "").trim(); if (!prompt) return;
    this.properties.promptHistory = [prompt, ...this.getHistory().filter((item) => item !== prompt)].slice(0, 30);
    this.syncWidgets(); notify(this as unknown as PreviewAwareNode);
  }
  syncWidgets() {
    const history = this.getHistory(); const signature = history.join("\n"); if (signature === this.historySignature) return; this.historySignature = signature;
    const historyWidget = widget(this as unknown as PreviewAwareNode, "Cronologia"); if (historyWidget) historyWidget.options = { ...(historyWidget.options ?? {}), values: history.length ? history.map(historyLabel) : ["Nessun prompt salvato"] };
  }
  onExecute(this: KleinNode & KleinTxt2ImgToolNode) {
    this.syncWidgets(); this.setOutputData(0, this.preview); if (!this.pendingRun || this.isRunning) return; this.pendingRun = false;
    const prompt = String(this.properties.prompt ?? "").trim(); if (!prompt) { this.status = "inserisci un prompt"; return; } this.savePrompt();
    const options: KleinTxt2ImgOptions = { baseUrl: String(this.properties.baseUrl), prompt, width: Math.round(clampInt(this.properties.width, 64, 1024) / 16) * 16, height: Math.round(clampInt(this.properties.height, 64, 1024) / 16) * 16, steps: clampInt(this.properties.steps, 1, 12), guidanceScale: clamp(this.properties.guidanceScale, 0, 20), seed: clampInt(this.properties.seed, -1, 2147483647) };
    const started = performance.now(); this.isRunning = true; this.status = "generazione in corso..."; this.controller = new AbortController(); this.refreshPreviewLayout();
    void kleinTxt2Img({ options, signal: this.controller.signal }).then((result) => finish(this, started, result.image)).catch((error) => fail(this, error)).finally(() => { this.isRunning = false; this.controller = null; this.refreshPreviewLayout(); });
  }
  onDrawBackground(this: KleinNode, context: CanvasRenderingContext2D) { draw(this, context); }
}

export class KleinImg2ImgToolNode {
  size: [number, number] = [340, 540]; properties!: Record<string, unknown>; preview: GraphImage | null = null;
  status = "pronto"; pendingRun = false; isRunning = false; controller: AbortController | null = null; executionMs: number | null = null;
  private syncedStyleId = "";
  constructor() {
    const node = this as unknown as KleinNode & KleinImg2ImgToolNode;
    node.title = "TOOLS / AI / KLEIN IMG2IMG"; const initial = KLEIN_STYLE_PRESETS[1];
    node.properties = { ...KLEIN_DEFAULTS, styleId: initial.id, prompt: initial.prompt, preserveSource: true, useStylePreset: true, textPrompt: "", promptSuffix: "" };
    node.addInput("image 1 (base)", "image");
    node.addInput("image 2", "image");
    node.addInput("image 3", "image");
    node.addInput("image 4", "image");
    node.addOutput("image", "image");
    const initialPath = findKleinStylePath(initial.id)!;
    node.addWidget("combo", "Genere", initialPath.genre.label, (value) => node.selectGenre(String(value)), { values: KLEIN_STYLE_CATALOG.map((item) => item.label) });
    node.addWidget("combo", "Sottogenere", initialPath.subgenre.label, (value) => node.selectSubgenre(String(value)), { values: initialPath.genre.subgenres.map((item) => item.label) });
    node.addWidget("combo", "Stile", initial.label, (value) => node.selectStyle(String(value)), { values: initialPath.subgenre.styles.map((item) => item.label) });
    node.addWidget("text", "Prompt", initial.prompt, (value) => { node.properties.prompt = String(value); node.properties.styleId = "custom"; notify(node); });
    node.addWidget("toggle", "Usa preset", true, (value) => { node.properties.useStylePreset = Boolean(value); notify(node); });
    node.addWidget("toggle", "Conserva", true, (value) => { node.properties.preserveSource = Boolean(value); notify(node); });
    node.addWidget("text", "Prompt immagini (image 1..4)", "", (value) => { node.properties.textPrompt = String(value); notify(node); });
    node.addWidget("text", "Prompt fisso in coda", "", (value) => { node.properties.promptSuffix = String(value); notify(node); });
    node.addWidget("number", "Prescale max", KLEIN_DEFAULTS.maxSize, (value) => { node.properties.maxSize = Number(value); notify(node); }, { min: 128, max: 1024, step: 64, precision: 0 });
    addCommonWidgets(node);
    node.addWidget("button", "Trasforma immagine", null, () => { if (!node.isRunning) node.pendingRun = true; node.setDirtyCanvas(true, true); });
    node.addWidget("button", "Annulla", null, () => node.controller?.abort());
    node.refreshPreviewLayout = () => { resizeNodeForPreview(node, node.preview, { footerLines: 3 }); node.setDirtyCanvas(true, true); }; node.syncStyleCatalog(true); node.refreshPreviewLayout();
  }
  syncWidgets() { /* API comune dei nodi Klein; i preset sono statici. */ }
  private setCombo(name: string, value: string, values: string[]) {
    const item = widget(this as unknown as PreviewAwareNode, name); if (!item) return;
    item.value = value; item.options = { ...(item.options ?? {}), values };
  }
  private applyPath(genre: KleinStyleGenre, subgenre: KleinStyleSubgenre, styleId?: string) {
    const style = subgenre.styles.find((item) => item.id === styleId) ?? subgenre.styles[0]; if (!style) return;
    this.properties.styleGenreId = genre.id; this.properties.styleSubgenreId = subgenre.id; this.properties.styleId = style.id;
    this.setCombo("Genere", genre.label, KLEIN_STYLE_CATALOG.map((item) => item.label));
    this.setCombo("Sottogenere", subgenre.label, genre.subgenres.map((item) => item.label));
    this.setCombo("Stile", style.label, subgenre.styles.map((item) => item.label));
    if (style.id !== "custom") { this.properties.prompt = style.prompt; const promptWidget = widget(this as unknown as PreviewAwareNode, "Prompt"); if (promptWidget) promptWidget.value = style.prompt; }
    this.syncedStyleId = style.id; notify(this as unknown as PreviewAwareNode);
  }
  selectGenre(label: string) {
    const genre = KLEIN_STYLE_CATALOG.find((item) => item.label === label); if (genre?.subgenres[0]) this.applyPath(genre, genre.subgenres[0]);
  }
  selectSubgenre(label: string) {
    const genre = KLEIN_STYLE_CATALOG.find((item) => item.id === this.properties.styleGenreId); const subgenre = genre?.subgenres.find((item) => item.label === label);
    if (genre && subgenre) this.applyPath(genre, subgenre);
  }
  selectStyle(label: string) {
    const genre = KLEIN_STYLE_CATALOG.find((item) => item.id === this.properties.styleGenreId);
    const subgenre = genre?.subgenres.find((item) => item.id === this.properties.styleSubgenreId); const style = subgenre?.styles.find((item) => item.label === label);
    if (genre && subgenre && style) this.applyPath(genre, subgenre, style.id);
  }
  syncStyleCatalog(force = false) {
    const styleId = String(this.properties.styleId ?? "line-art"); if (!force && styleId === this.syncedStyleId) return;
    const path = findKleinStylePath(styleId) ?? findKleinStylePath("custom"); if (path) this.applyPath(path.genre, path.subgenre, path.style.id);
  }
  onConfigure(this: KleinNode & KleinImg2ImgToolNode) {
    this.syncedStyleId = ""; this.syncStyleCatalog(true);
    const values: Record<string, unknown> = {
      Prompt: this.properties.prompt, "Prescale max": this.properties.maxSize, "Klein URL": this.properties.baseUrl,
      "Usa preset": this.properties.useStylePreset ?? true, "Prompt immagini (image 1..4)": this.properties.textPrompt ?? "",
      Conserva: this.properties.preserveSource ?? true,
      "Prompt fisso in coda": this.properties.promptSuffix ?? "",
      Steps: this.properties.steps, Guidance: this.properties.guidanceScale, Seed: this.properties.seed,
    };
    Object.entries(values).forEach(([name, value]) => { const target = widget(this, name); if (target && value !== undefined) target.value = value; });
    this.refreshPreviewLayout();
  }
  onExecute(this: KleinNode & KleinImg2ImgToolNode) {
    this.syncStyleCatalog(); this.setOutputData(0, this.preview); if (!this.pendingRun || this.isRunning) return; this.pendingRun = false;
    const inputSlots = [0, 1, 2, 3].map((slot) => this.getInputData(slot));
    const firstEmptySlot = inputSlots.findIndex((value) => !isImage(value));
    const lastConnectedSlot = inputSlots.reduce((last, value, index) => isImage(value) ? index : last, -1);
    const hasGap = firstEmptySlot >= 0 && lastConnectedSlot > firstEmptySlot;
    const images = inputSlots.slice(0, lastConnectedSlot + 1).filter(isImage);
    const useStylePreset = Boolean(this.properties.useStylePreset ?? true), styleId = String(this.properties.styleId ?? "custom"), prompt = resolveKleinImg2ImgPrompt({
      preserveSource: Boolean(this.properties.preserveSource ?? true),
      useStylePreset,
      stylePrompt: String(this.properties.prompt ?? ""),
      textPrompt: String(this.properties.textPrompt ?? ""),
      promptSuffix: String(this.properties.promptSuffix ?? ""),
    });
    if (!isImage(inputSlots[0])) { this.status = "collega almeno image 1 (base)"; return; }
    if (hasGap) { this.status = "collega le immagini in ordine, senza slot vuoti"; return; }
    if (!prompt) { this.status = Boolean(this.properties.useStylePreset ?? true) ? "seleziona uno stile o inserisci un prompt" : "inserisci il prompt testuale"; return; }
    const options: KleinImg2ImgOptions = { baseUrl: String(this.properties.baseUrl), prompt, maxSize: clampInt(this.properties.maxSize, 128, 1024), steps: clampInt(this.properties.steps, 1, 12), guidanceScale: clamp(this.properties.guidanceScale, 0, 20), seed: clampInt(this.properties.seed, -1, 2147483647) };
    const started = performance.now(); this.isRunning = true; this.status = images.length > 1 ? `trasformazione con ${images.length} immagini...` : "trasformazione in corso..."; this.controller = new AbortController(); this.refreshPreviewLayout();
    void kleinImg2Img({ images, options, signal: this.controller.signal }).then((result) => {
      if (useStylePreset && styleId !== "custom") cacheKleinStylePreview(styleId, result.image);
      finish(this, started, result.image);
    }).catch((error) => fail(this, error)).finally(() => { this.isRunning = false; this.controller = null; this.refreshPreviewLayout(); });
  }
  onDrawBackground(this: KleinNode, context: CanvasRenderingContext2D) { draw(this, context); }
  onDrawForeground(this: KleinNode & KleinImg2ImgToolNode, _context: CanvasRenderingContext2D, graphCanvas?: GraphCanvasLike) {
    const styleId = String(this.properties.styleId ?? "custom");
    const preview = getKleinStylePreview(styleId);
    const graphMouse = graphCanvas?.graph_mouse;
    const nodePosition = (this as unknown as { pos?: [number, number] }).pos;
    const styleWidget = widget(this, "Stile");
    if (!preview || !graphMouse || !nodePosition || styleWidget?.last_y === undefined) return;
    const pointer = { x: graphMouse[0] - nodePosition[0], y: graphMouse[1] - nodePosition[1] };
    const widgetHeight = styleWidget.computeSize?.(this.size[0])[1] ?? 20;
    const isOverStyle = pointer.x >= 6 && pointer.x <= this.size[0] - 12
      && pointer.y >= styleWidget.last_y && pointer.y <= styleWidget.last_y + widgetHeight;
    if (isOverStyle) showKleinStylePreviewOverlay(preview, { x: graphMouse[0], y: graphMouse[1] });
  }
}
