import { drawImagePreview, rasterizeGraphSvg } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../shared";
import {
  DEFAULT_STOPPEL_OPTIONS,
  generateStoppelSvg,
  type StoppelDrawMode,
  type StoppelOptions,
} from "../../../artists/stoppel";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  getGraphImageSignature,
  normalizeHexColor,
  notifyGraphStateChange,
  refreshNode,
} from "../shared";

export class StoppelToolNode {
  size: [number, number] = [300, 620];
  properties!: StoppelOptions;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  primitiveCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  executionMs: number | null = null;
  renderToken = 0;
  pendingRunSignature = "";
  debouncedRunSignature = "";
  debounceTimerId: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  isRendering = false;

  constructor() {
    const node = this as unknown as PreviewAwareNode & StoppelToolNode;
    node.title = createToolTitle("Stoppel");
    node.properties = { ...DEFAULT_STOPPEL_OPTIONS };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Mode", DEFAULT_STOPPEL_OPTIONS.mode, (value) => {
      node.properties.mode = String(value) as StoppelDrawMode;
      notifyGraphStateChange(node);
    }, { values: ["circles", "triangles", "scribble", "tiny-lines", "doodle-line"] });
    node.addWidget("slider", "Max width", DEFAULT_STOPPEL_OPTIONS.maxWidth, (value) => {
      node.properties.maxWidth = clamp(Math.round(Number(value)), 192, 2200);
      notifyGraphStateChange(node);
    }, { min: 192, max: 2200, step: 8 });
    node.addWidget("slider", "Spacing", DEFAULT_STOPPEL_OPTIONS.spacing, (value) => {
      node.properties.spacing = clamp(Number(value), 2, 48);
      notifyGraphStateChange(node);
    }, { min: 2, max: 48, step: 0.1, precision: 1 });
    node.addWidget("slider", "Shape size", DEFAULT_STOPPEL_OPTIONS.maxShapeSize, (value) => {
      node.properties.maxShapeSize = clamp(Number(value), 1, 48);
      notifyGraphStateChange(node);
    }, { min: 1, max: 48, step: 0.1, precision: 1 });
    node.addWidget("slider", "Threshold", DEFAULT_STOPPEL_OPTIONS.threshold, (value) => {
      node.properties.threshold = clamp(Number(value), 0, 0.98);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.98, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", DEFAULT_STOPPEL_OPTIONS.contrast, (value) => {
      node.properties.contrast = clamp(Number(value), 0.2, 4);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Gamma", DEFAULT_STOPPEL_OPTIONS.gamma, (value) => {
      node.properties.gamma = clamp(Number(value), 0.2, 3);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Steps", DEFAULT_STOPPEL_OPTIONS.steps, (value) => {
      node.properties.steps = clamp(Math.round(Number(value)), 1000, 120000);
      notifyGraphStateChange(node);
    }, { min: 1000, max: 120000, step: 500 });
    node.addWidget("slider", "Step len", DEFAULT_STOPPEL_OPTIONS.stepLength, (value) => {
      node.properties.stepLength = clamp(Number(value), 0.5, 18);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 18, step: 0.1, precision: 1 });
    node.addWidget("slider", "Edge boost", DEFAULT_STOPPEL_OPTIONS.edgeBoost, (value) => {
      node.properties.edgeBoost = clamp(Number(value), 0, 2.5);
      notifyGraphStateChange(node);
    }, { min: 0, max: 2.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Jitter", DEFAULT_STOPPEL_OPTIONS.jitter, (value) => {
      node.properties.jitter = clamp(Number(value), 0, 3);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Segment len", DEFAULT_STOPPEL_OPTIONS.segmentLength, (value) => {
      node.properties.segmentLength = clamp(Number(value), 0.5, 20);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 20, step: 0.1, precision: 1 });
    node.addWidget("slider", "Density", DEFAULT_STOPPEL_OPTIONS.density, (value) => {
      node.properties.density = clamp(Number(value), 1, 12);
      notifyGraphStateChange(node);
    }, { min: 1, max: 12, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", DEFAULT_STOPPEL_OPTIONS.strokeWidth, (value) => {
      node.properties.strokeWidth = clamp(Number(value), 0.1, 6);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 6, step: 0.1, precision: 1 });
    node.addWidget("slider", "Seed", DEFAULT_STOPPEL_OPTIONS.seed, (value) => {
      node.properties.seed = clamp(Math.round(Number(value)), 1, 1000000);
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.addWidget("text", "Stroke", DEFAULT_STOPPEL_OPTIONS.strokeColor, (value) => {
      node.properties.strokeColor = normalizeHexColor(String(value ?? DEFAULT_STOPPEL_OPTIONS.strokeColor));
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "BG", DEFAULT_STOPPEL_OPTIONS.backgroundColor, (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value ?? DEFAULT_STOPPEL_OPTIONS.backgroundColor));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & StoppelToolNode) {
    const input = this.getInputData(0);
    if (!input) {
      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
        this.debounceTimerId = null;
      }
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.primitiveCount = 0;
      this.outputWidth = 0;
      this.outputHeight = 0;
      this.executionMs = null;
      this.pendingRunSignature = "";
      this.debouncedRunSignature = "";
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.isRendering = false;
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const options: StoppelOptions = {
      mode: String(this.properties.mode ?? DEFAULT_STOPPEL_OPTIONS.mode) as StoppelDrawMode,
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? DEFAULT_STOPPEL_OPTIONS.maxWidth)), 192, 2200),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? DEFAULT_STOPPEL_OPTIONS.backgroundColor)),
      strokeColor: normalizeHexColor(String(this.properties.strokeColor ?? DEFAULT_STOPPEL_OPTIONS.strokeColor)),
      strokeWidth: clamp(Number(this.properties.strokeWidth ?? DEFAULT_STOPPEL_OPTIONS.strokeWidth), 0.1, 6),
      contrast: clamp(Number(this.properties.contrast ?? DEFAULT_STOPPEL_OPTIONS.contrast), 0.2, 4),
      gamma: clamp(Number(this.properties.gamma ?? DEFAULT_STOPPEL_OPTIONS.gamma), 0.2, 3),
      threshold: clamp(Number(this.properties.threshold ?? DEFAULT_STOPPEL_OPTIONS.threshold), 0, 0.98),
      spacing: clamp(Number(this.properties.spacing ?? DEFAULT_STOPPEL_OPTIONS.spacing), 2, 48),
      maxShapeSize: clamp(Number(this.properties.maxShapeSize ?? DEFAULT_STOPPEL_OPTIONS.maxShapeSize), 1, 48),
      steps: clamp(Math.round(Number(this.properties.steps ?? DEFAULT_STOPPEL_OPTIONS.steps)), 1000, 120000),
      stepLength: clamp(Number(this.properties.stepLength ?? DEFAULT_STOPPEL_OPTIONS.stepLength), 0.5, 18),
      edgeBoost: clamp(Number(this.properties.edgeBoost ?? DEFAULT_STOPPEL_OPTIONS.edgeBoost), 0, 2.5),
      jitter: clamp(Number(this.properties.jitter ?? DEFAULT_STOPPEL_OPTIONS.jitter), 0, 3),
      segmentLength: clamp(Number(this.properties.segmentLength ?? DEFAULT_STOPPEL_OPTIONS.segmentLength), 0.5, 20),
      density: clamp(Number(this.properties.density ?? DEFAULT_STOPPEL_OPTIONS.density), 1, 12),
      seed: clamp(Math.round(Number(this.properties.seed ?? DEFAULT_STOPPEL_OPTIONS.seed)), 1, 1000000),
    };

    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    const runSignature = `${signature}|${optionsSignature}`;

    if (runSignature !== this.pendingRunSignature) {
      this.pendingRunSignature = runSignature;
      this.status = "waiting debounce...";
      this.setDirtyCanvas(true, true);
      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
      }
      const queuedRunSignature = runSignature;
      this.debounceTimerId = window.setTimeout(() => {
        if (queuedRunSignature !== this.pendingRunSignature) {
          return;
        }
        this.debounceTimerId = null;
        this.debouncedRunSignature = queuedRunSignature;
        this.setDirtyCanvas(true, true);
      }, 260);
    }

    if (this.debouncedRunSignature !== runSignature) {
      this.setOutputData(0, this.preview ?? input);
      this.setOutputData(1, this.svg);
      this.refreshPreviewLayout();
      return;
    }

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.progress = 0;
      this.status = `generating ${options.mode}...`;
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateStoppelSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return null;
          }
          this.svg = result.svg;
          this.primitiveCount = result.primitiveCount;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.status = `${options.mode} ready`;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview ?? null;
          this.progress = 1;
          this.executionMs = performance.now() - start;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.primitiveCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "stoppel error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onRemoved(this: StoppelToolNode) {
    if (this.debounceTimerId !== null) {
      window.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }

  onDrawBackground(this: PreviewAwareNode & StoppelToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | items ${this.primitiveCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `mode ${String(this.properties.mode ?? DEFAULT_STOPPEL_OPTIONS.mode)} | out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
