import { drawImagePreview, rasterizeGraphSvg } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../shared";
import {
  DEFAULT_U111166_OPTIONS,
  generateU111166Svg,
  type U111166DrawMode,
  type U111166Options,
} from "../../../artists/u111166";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  getGraphImageSignature,
  normalizeHexColor,
  notifyGraphStateChange,
  refreshNode,
} from "../shared";

export class U111166ToolNode {
  size: [number, number] = [300, 590];
  properties!: U111166Options;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  curveCount = 0;
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
    const node = this as unknown as PreviewAwareNode & U111166ToolNode;
    node.title = createToolTitle("U111166 Curves");
    node.properties = { ...DEFAULT_U111166_OPTIONS };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Mode", DEFAULT_U111166_OPTIONS.mode, (value) => {
      node.properties.mode = String(value) as U111166DrawMode;
      notifyGraphStateChange(node);
    }, { values: ["messy-curves", "sketch-650836", "center-paint"] });
    node.addWidget("slider", "Max width", DEFAULT_U111166_OPTIONS.maxWidth, (value) => {
      node.properties.maxWidth = clamp(Math.round(Number(value)), 192, 2200);
      notifyGraphStateChange(node);
    }, { min: 192, max: 2200, step: 8 });
    node.addWidget("slider", "Spacing", DEFAULT_U111166_OPTIONS.spacing, (value) => {
      node.properties.spacing = clamp(Number(value), 4, 50);
      notifyGraphStateChange(node);
    }, { min: 4, max: 50, step: 0.1, precision: 1 });
    node.addWidget("slider", "Density", DEFAULT_U111166_OPTIONS.density, (value) => {
      node.properties.density = clamp(Number(value), 0.5, 8);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Length", DEFAULT_U111166_OPTIONS.curveLength, (value) => {
      node.properties.curveLength = clamp(Number(value), 4, 64);
      notifyGraphStateChange(node);
    }, { min: 4, max: 64, step: 0.1, precision: 1 });
    node.addWidget("slider", "Bend", DEFAULT_U111166_OPTIONS.curveBend, (value) => {
      node.properties.curveBend = clamp(Number(value), 0, 2.5);
      notifyGraphStateChange(node);
    }, { min: 0, max: 2.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Threshold", DEFAULT_U111166_OPTIONS.threshold, (value) => {
      node.properties.threshold = clamp(Number(value), 0, 0.98);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.98, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", DEFAULT_U111166_OPTIONS.contrast, (value) => {
      node.properties.contrast = clamp(Number(value), 0.2, 4);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Gamma", DEFAULT_U111166_OPTIONS.gamma, (value) => {
      node.properties.gamma = clamp(Number(value), 0.2, 3);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Jitter", DEFAULT_U111166_OPTIONS.jitter, (value) => {
      node.properties.jitter = clamp(Number(value), 0, 3);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Passes", DEFAULT_U111166_OPTIONS.passes, (value) => {
      node.properties.passes = clamp(Math.round(Number(value)), 1, 10);
      notifyGraphStateChange(node);
    }, { min: 1, max: 10, step: 1 });
    node.addWidget("slider", "Iterations", DEFAULT_U111166_OPTIONS.iterations, (value) => {
      node.properties.iterations = clamp(Math.round(Number(value)), 1000, 60000);
      notifyGraphStateChange(node);
    }, { min: 1000, max: 60000, step: 500 });
    node.addWidget("slider", "Line width", DEFAULT_U111166_OPTIONS.strokeWidth, (value) => {
      node.properties.strokeWidth = clamp(Number(value), 0.1, 8);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Seed", DEFAULT_U111166_OPTIONS.seed, (value) => {
      node.properties.seed = clamp(Math.round(Number(value)), 1, 1000000);
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.addWidget("text", "Stroke", DEFAULT_U111166_OPTIONS.strokeColor, (value) => {
      node.properties.strokeColor = normalizeHexColor(String(value ?? DEFAULT_U111166_OPTIONS.strokeColor));
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "BG", DEFAULT_U111166_OPTIONS.backgroundColor, (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value ?? DEFAULT_U111166_OPTIONS.backgroundColor));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & U111166ToolNode) {
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
      this.curveCount = 0;
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

    const options: U111166Options = {
      mode: String(this.properties.mode ?? DEFAULT_U111166_OPTIONS.mode) as U111166DrawMode,
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? DEFAULT_U111166_OPTIONS.maxWidth)), 192, 2200),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? DEFAULT_U111166_OPTIONS.backgroundColor)),
      strokeColor: normalizeHexColor(String(this.properties.strokeColor ?? DEFAULT_U111166_OPTIONS.strokeColor)),
      strokeWidth: clamp(Number(this.properties.strokeWidth ?? DEFAULT_U111166_OPTIONS.strokeWidth), 0.1, 8),
      contrast: clamp(Number(this.properties.contrast ?? DEFAULT_U111166_OPTIONS.contrast), 0.2, 4),
      gamma: clamp(Number(this.properties.gamma ?? DEFAULT_U111166_OPTIONS.gamma), 0.2, 3),
      threshold: clamp(Number(this.properties.threshold ?? DEFAULT_U111166_OPTIONS.threshold), 0, 0.98),
      spacing: clamp(Number(this.properties.spacing ?? DEFAULT_U111166_OPTIONS.spacing), 4, 50),
      density: clamp(Number(this.properties.density ?? DEFAULT_U111166_OPTIONS.density), 0.5, 8),
      curveLength: clamp(Number(this.properties.curveLength ?? DEFAULT_U111166_OPTIONS.curveLength), 4, 64),
      curveBend: clamp(Number(this.properties.curveBend ?? DEFAULT_U111166_OPTIONS.curveBend), 0, 2.5),
      jitter: clamp(Number(this.properties.jitter ?? DEFAULT_U111166_OPTIONS.jitter), 0, 3),
      passes: clamp(Math.round(Number(this.properties.passes ?? DEFAULT_U111166_OPTIONS.passes)), 1, 10),
      iterations: clamp(Math.round(Number(this.properties.iterations ?? DEFAULT_U111166_OPTIONS.iterations)), 1000, 60000),
      seed: clamp(Math.round(Number(this.properties.seed ?? DEFAULT_U111166_OPTIONS.seed)), 1, 1000000),
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

      void generateU111166Svg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return null;
          }
          this.svg = result.svg;
          this.curveCount = result.curveCount;
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
          this.curveCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "u111166 error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onRemoved(this: U111166ToolNode) {
    if (this.debounceTimerId !== null) {
      window.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }

  onDrawBackground(this: PreviewAwareNode & U111166ToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | curves ${this.curveCount}`, 10, layout.footerTop + 30);
    context.fillText(
      `mode ${String(this.properties.mode ?? DEFAULT_U111166_OPTIONS.mode)} | out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
