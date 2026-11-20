import { drawImagePreview } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { PreviewAwareNode } from "../../shared";
import { OptimizedToolNode, clamp, createToolTitle, getGraphImageSignature, notifyGraphStateChange, refreshNode } from "../shared";
import { defaultKodakPrintOptions, kodakPrinterProfiles, type KodakModelName, type KodakPrintOptions } from "./model";
import { connectKodakPrinter, encodeKodakJpeg, prepareKodakImage, printKodakImage, type KodakSerialPort } from "./runtime";

type KodakNode = PreviewAwareNode & KodakPrintToolNode;
interface PreviewViewport { x: number; y: number; width: number; height: number }
interface CropDragState { startX: number; startY: number; panX: number; panY: number }
const PASS_LABELS = ["giallo", "magenta", "ciano", "protezione"];

export class KodakPrintToolNode extends OptimizedToolNode {
  size: [number, number] = [330, 570]; preview: GraphImage | null = null; port: KodakSerialPort | null = null;
  status = "Scollegata"; logLines: string[] = []; isRunning = false; properties!: Record<string, unknown>;
  private previewViewport: PreviewViewport | null = null;
  private cropDrag: CropDragState | null = null;
  declare setOutputData: (slot: number, data: unknown) => void;
  declare setDirtyCanvas: (foreground?: boolean, background?: boolean) => void;
  constructor() {
    super(); const node = this as unknown as KodakNode; node.title = createToolTitle("Print/Kodak"); node.properties = { ...defaultKodakPrintOptions };
    node.addInput("image", "image"); node.addOutput("preview", "image"); node.addOutput("log", "string");
    const property = (key: keyof KodakPrintOptions, value: unknown) => { node.properties[key] = value; node.resetOptimizedCache(); notifyGraphStateChange(node); node.setDirtyCanvas(true, true); };
    node.addWidget("combo", "Modello", "p300r", value => property("model", String(value)), { values: Object.keys(kodakPrinterProfiles) });
    node.addWidget("toggle", "Foto intera", true, value => property("fit", Boolean(value)));
    node.addWidget("slider", "Zoom crop", 100, value => property("cropZoom", Number(value) / 100), { min: 100, max: 400, step: 5, precision: 0 });
    node.addWidget("button", "Reset selezione", null, () => { node.properties.cropZoom = 1; node.properties.cropPanX = 0; node.properties.cropPanY = 0; node.syncCropZoomWidget(); node.resetOptimizedCache(); notifyGraphStateChange(node); node.setDirtyCanvas(true, true); });
    node.addWidget("slider", "Qualità JPEG", 95, value => property("jpegQuality", Number(value) / 100), { min: 50, max: 100, step: 1, precision: 0 });
    node.addWidget("slider", "Saturazione", 100, value => property("saturation", Number(value) / 100), { min: 0, max: 200, step: 1, precision: 0 });
    node.addWidget("slider", "Luminosità", 100, value => property("brightness", Number(value) / 100), { min: 50, max: 150, step: 1, precision: 0 });
    node.addWidget("slider", "Contrasto", 100, value => property("contrast", Number(value) / 100), { min: 50, max: 150, step: 1, precision: 0 });
    node.addWidget("slider", "Timeout (s)", 180, value => property("timeoutSeconds", Number(value)), { min: 30, max: 600, step: 10, precision: 0 });
    node.addWidget("button", "Collega Kodak", null, () => void node.connect());
    node.addWidget("button", "Stampa", null, () => void node.print());
    node.addWidget("button", "Disconnetti", null, () => void node.disconnect());
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 6); node.refreshPreviewLayout();
  }
  private options(): KodakPrintOptions { return { model: String(this.properties.model ?? "p300r") as KodakModelName, fit: Boolean(this.properties.fit ?? true), cropZoom: clamp(Number(this.properties.cropZoom ?? 1), 1, 4), cropPanX: clamp(Number(this.properties.cropPanX ?? 0), -1, 1), cropPanY: clamp(Number(this.properties.cropPanY ?? 0), -1, 1), jpegQuality: clamp(Number(this.properties.jpegQuality ?? .95), .5, 1), saturation: clamp(Number(this.properties.saturation ?? 1), 0, 2), brightness: clamp(Number(this.properties.brightness ?? 1), .5, 1.5), contrast: clamp(Number(this.properties.contrast ?? 1), .5, 1.5), timeoutSeconds: clamp(Number(this.properties.timeoutSeconds ?? 180), 30, 600) }; }
  private syncCropZoomWidget() { const widget = (this as unknown as { widgets?: Array<{ name?: string; value?: unknown }> }).widgets?.find(item => item.name === "Zoom crop"); if (widget) widget.value = Math.round(Number(this.properties.cropZoom ?? 1) * 100); }
  private updateCrop(panX: number, panY: number, zoom = Number(this.properties.cropZoom ?? 1)) { this.properties.cropPanX = clamp(panX, -1, 1); this.properties.cropPanY = clamp(panY, -1, 1); this.properties.cropZoom = clamp(zoom, 1, 4); this.syncCropZoomWidget(); this.resetOptimizedCache(); notifyGraphStateChange(this as unknown as KodakNode); this.setDirtyCanvas(true, true); }
  private pointInPreview(localX: number, localY: number) { const view = this.previewViewport; return Boolean(view && localX >= view.x && localY >= view.y && localX <= view.x + view.width && localY <= view.y + view.height); }
  private appendLog(line: string) { this.logLines.push(`${new Date().toLocaleTimeString()} ${line}`); this.logLines = this.logLines.slice(-120); this.setOutputData(1, this.logLines.join("\n")); this.setDirtyCanvas(true, true); }
  async connect() { if (this.isRunning || this.port) return; this.status = "Seleziona la porta Kodak…"; this.setDirtyCanvas(true, true); try { this.port = await connectKodakPrinter(line => this.appendLog(line)); this.status = "Collegata · RFCOMM pronto"; } catch (error) { this.status = error instanceof Error ? error.message : String(error); this.appendLog(`ERRORE ${this.status}`); } this.setDirtyCanvas(true, true); }
  async disconnect() { if (this.isRunning || !this.port) return; try { await this.port.close(); } catch { /* può essere già chiusa */ } this.port = null; this.status = "Scollegata"; this.appendLog("Porta chiusa"); }
  async print() {
    if (this.isRunning) return; if (!this.preview) { this.status = "Collega prima un'immagine"; return; } if (!this.port) { this.status = "Collega prima la Kodak"; return; }
    this.isRunning = true; this.logLines = []; const options = this.options(); this.status = "Codifica JPEG…"; this.setDirtyCanvas(true, true);
    try { const jpeg = await encodeKodakJpeg(this.preview, options.jpegQuality); this.appendLog(`JPEG ${kodakPrinterProfiles[options.model].label} · ${(jpeg.length / 1024).toFixed(0)} KiB`); this.status = "Trasferimento alla stampante…"; await printKodakImage(this.port, jpeg, line => this.appendLog(line), pass => { this.status = `Passata ${pass + 1}/4 · ${PASS_LABELS[pass]}`; this.setDirtyCanvas(true, true); }, options.timeoutSeconds * 1000); this.status = "Stampa completata · attendi l'espulsione"; }
    catch (error) { this.status = error instanceof Error ? error.message : String(error); this.appendLog(`ERRORE ${this.status}`); try { await this.port.close(); } catch { /* può essere già chiusa */ } this.port = null; }
    finally { this.isRunning = false; this.setDirtyCanvas(true, true); }
  }
  onExecute(this: KodakNode) { const started = performance.now(), input = this.getInputData(0); if (!input) { this.preview = null; this.resetOptimizedCache(); this.setOutputData(0, null); this.refreshPreviewLayout(); return; } const options = this.options(), signature = getGraphImageSignature(input), optionsSignature = JSON.stringify(options); if (!this.canReuseOptimizedResult(signature, optionsSignature)) { this.preview = prepareKodakImage(input, options); this.completeOptimizedExecution(started, signature, optionsSignature); this.refreshPreviewLayout(); } this.setOutputData(0, this.preview); this.setOutputData(1, this.logLines.join("\n")); }
  onDrawBackground(this: KodakNode, context: CanvasRenderingContext2D) { const layout = drawImagePreview(context, this, this.preview, { footerLines: 6 }); this.previewViewport = { x: layout.padding, y: layout.previewTop, width: layout.previewWidth, height: layout.previewHeight }; context.save(); const options = this.options(); if (!options.fit && this.preview) { context.strokeStyle = this.cropDrag ? "#ffd166" : "rgba(255,209,102,.8)"; context.lineWidth = 2; context.strokeRect(layout.padding + 1, layout.previewTop + 1, layout.previewWidth - 2, layout.previewHeight - 2); context.fillStyle = "rgba(0,0,0,.62)"; context.fillRect(layout.padding + 7, layout.previewTop + 7, 154, 22); context.fillStyle = "#fff"; context.font = "11px sans-serif"; context.fillText("trascina: pan · slider: zoom", layout.padding + 13, layout.previewTop + 22); } context.fillStyle = this.port ? "#75d58a" : "rgba(255,255,255,.75)"; context.font = "12px sans-serif"; const profile = kodakPrinterProfiles[options.model]; context.fillText(this.status.slice(0, 48), 10, layout.footerTop + 14); context.fillStyle = "rgba(255,255,255,.68)"; context.fillText(`${profile.label} · ${profile.width}×${profile.height} · ${options.fit ? "fit" : `crop ${options.cropZoom.toFixed(2)}×`}`, 10, layout.footerTop + 32); this.logLines.slice(-3).forEach((line, index) => context.fillText(line.slice(0, 54), 10, layout.footerTop + 50 + index * 16)); context.restore(); }
  onMouseDown(this: KodakNode, event: PointerEvent, pos?: [number, number]) { if (this.options().fit || !Array.isArray(pos) || !this.pointInPreview(pos[0], pos[1])) return false; this.cropDrag = { startX: pos[0], startY: pos[1], panX: Number(this.properties.cropPanX ?? 0), panY: Number(this.properties.cropPanY ?? 0) }; (this as unknown as { captureInput?: (enabled: boolean) => void }).captureInput?.(true); event.preventDefault(); event.stopPropagation(); return true; }
  onMouseMove(this: KodakNode, event: PointerEvent, pos?: [number, number]) { if (!this.cropDrag || !this.previewViewport || !Array.isArray(pos)) return false; const dx = (pos[0] - this.cropDrag.startX) / Math.max(1, this.previewViewport.width); const dy = (pos[1] - this.cropDrag.startY) / Math.max(1, this.previewViewport.height); this.updateCrop(this.cropDrag.panX + dx * 2, this.cropDrag.panY + dy * 2); event.preventDefault(); event.stopPropagation(); return true; }
  onMouseUp(this: KodakNode, event: PointerEvent) { if (!this.cropDrag) return false; this.cropDrag = null; (this as unknown as { captureInput?: (enabled: boolean) => void }).captureInput?.(false); event.preventDefault(); event.stopPropagation(); this.setDirtyCanvas(true, true); return true; }
  onRemoved() { if (this.port && !this.isRunning) void this.port.close(); this.port = null; }
}
