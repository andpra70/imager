import { drawImagePreview } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import { isGraphVideo, type GraphVideo } from "../../../../../models/graphVideo";
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
  defaultFaceSwapOptions,
  type FaceSwapBackend,
  type FaceSwapOptions,
  type GraphFaceSwapData,
} from "./model";
import { FaceSwapSession } from "./runtime";

export class FaceSwapToolNode {
  size: [number, number] = [340, 440];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  output: GraphImage | GraphVideo | null = null;
  data: GraphFaceSwapData | null = null;
  status = "in attesa di IN1 o VIN1 e IN2";
  progress = 0;
  executionMs: number | null = null;
  isRendering = false;
  private lastSignature = "";
  private renderToken = 0;
  private session = new FaceSwapSession();
  private videoElement: HTMLVideoElement | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & FaceSwapToolNode;
    node.title = createToolTitle("AI / FaceSwap");
    node.properties = { ...defaultFaceSwapOptions };
    node.addInput("IN1", "image");
    node.addInput("IN2 (face)", "image");
    node.addInput("VIN1", "video");
    node.addOutput("OUT", "");
    node.addOutput("info", "faceswap");
    node.addWidget("combo", "Backend", "auto", (value) => {
      node.properties.backend = String(value);
      node.lastSignature = "";
      notifyGraphStateChange(node);
    }, { values: ["auto", "webgpu", "webnn", "wasm"] });
    node.addWidget("slider", "Intensità", 1, (value) => {
      node.properties.strength = Number(value);
      node.lastSignature = "";
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.05, precision: 2 });
    node.addWidget("toggle", "Occlusioni", true, (value) => {
      node.properties.occlusion = Boolean(value);
      node.lastSignature = "";
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Video FPS max", 30, (value) => {
      node.properties.maxFps = Math.round(Number(value));
      node.lastSignature = "";
      notifyGraphStateChange(node);
    }, { min: 1, max: 60, step: 1, precision: 0 });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview ?? node.videoElement, 4);
    node.refreshPreviewLayout();
  }

  private getOptions(): FaceSwapOptions {
    const rawBackend = String(this.properties.backend ?? "auto");
    const backend: FaceSwapBackend = ["webgpu", "webnn", "wasm"].includes(rawBackend)
      ? rawBackend as FaceSwapBackend
      : "auto";
    return {
      backend,
      strength: clamp(Number(this.properties.strength ?? 1), 0, 1),
      occlusion: Boolean(this.properties.occlusion ?? true),
      maxFps: clamp(Math.round(Number(this.properties.maxFps ?? 30)), 1, 60),
    };
  }

  private showVideo(video: GraphVideo) {
    if (!this.videoElement) {
      this.videoElement = document.createElement("video");
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
    }
    this.videoElement.srcObject = video.stream;
    void this.videoElement.play().catch(() => undefined);
  }

  onExecute(this: PreviewAwareNode & FaceSwapToolNode) {
    const imageValue = this.getInputData(0);
    const faceValue = this.getInputData(1);
    const videoValue = this.getInputData(2);
    const image = isGraphImageReady(imageValue) ? imageValue : null;
    const face = isGraphImageReady(faceValue) ? faceValue : null;
    const video = isGraphVideo(videoValue) && videoValue.track.readyState === "live" ? videoValue : null;

    if ((!image && !video) || !face) {
      if (this.output || this.isRendering) {
        this.renderToken += 1;
        this.session.dispose();
        this.output = null;
        this.preview = null;
        this.data = null;
        this.lastSignature = "";
        this.isRendering = false;
        if (this.videoElement) this.videoElement.srcObject = null;
      }
      this.status = "collega IN2 (face) e IN1 oppure VIN1";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      return;
    }

    const options = this.getOptions();
    const signature = JSON.stringify({
      source: video ? `video:${video.track.id}` : getGraphImageSignature(image),
      face: getGraphImageSignature(face),
      options,
    });
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      const renderToken = ++this.renderToken;
      this.isRendering = true;
      this.progress = 0;
      this.executionMs = null;
      this.status = "inizializzazione browser-inswapper...";
      const onProgress = ({ model, ratio }: { model: string; ratio: number }) => {
        if (renderToken !== this.renderToken) return;
        this.progress = ratio;
        this.status = ratio >= 1
          ? `${model} caricato · avvio backend (può richiedere tempo)...`
          : `caricamento ${model} ${(ratio * 100).toFixed(0)}%`;
        this.setDirtyCanvas(true, true);
      };
      const onStage = (message: string) => {
        if (renderToken !== this.renderToken) return;
        this.status = message;
        this.setDirtyCanvas(true, true);
      };
      const diagnostics = { onProgress, onStage };
      const task = video
        ? this.session.swapVideo(video, face, options, diagnostics)
        : this.session.swapImage(image!, face, options, diagnostics);
      void task.then((result) => {
        if (renderToken !== this.renderToken) return;
        this.data = result.data;
        this.executionMs = result.data.timing.totalMs;
        this.output = "image" in result ? result.image : result.video;
        this.preview = "image" in result ? result.image : null;
        if ("video" in result) this.showVideo(result.video);
        this.progress = 1;
        this.status = result.data.mode === "video" ? "video live pronto" : "pronto";
        this.isRendering = false;
        this.setOutputData(0, this.output);
        this.setOutputData(1, this.data);
        this.refreshPreviewLayout();
      }).catch((error) => {
        if (renderToken !== this.renderToken) return;
        this.isRendering = false;
        this.output = null;
        this.preview = null;
        this.data = null;
        this.status = error instanceof Error ? error.message : "errore FaceSwap";
        this.setOutputData(0, null);
        this.setOutputData(1, null);
        this.refreshPreviewLayout();
      });
    }

    this.setOutputData(0, this.output);
    this.setOutputData(1, this.data);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & FaceSwapToolNode, context: CanvasRenderingContext2D) {
    const source = this.preview ?? (
      this.videoElement?.readyState && this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ? this.videoElement
        : null
    );
    const layout = drawImagePreview(context, this, source, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,.72)";
    context.font = "12px sans-serif";
    context.fillText(this.status, 10, layout.footerTop + 12);
    context.fillText(this.data ? `${this.data.mode} · ${this.data.engine.backend} · ${this.data.facesReplaced ?? "live"} face` : "IN1/VIN1 + IN2 → OUT", 10, layout.footerTop + 30);
    context.fillText(`modelli scaricati e verificati · ${(this.progress * 100).toFixed(0)}%`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }

  onRemoved(this: FaceSwapToolNode) {
    this.session.dispose();
    if (this.videoElement) this.videoElement.srcObject = null;
  }
}
