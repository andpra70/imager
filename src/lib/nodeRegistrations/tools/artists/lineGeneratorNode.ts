import { drawImagePreview, rasterizeGraphSvg } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../shared";
import {
  DEFAULT_LINE_GENERATOR_OPTIONS,
  generateLineGeneratorSvg,
  type LineGeneratorOptions,
} from "../../../artists/linegenerator";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  getGraphImageSignature,
  normalizeHexColor,
  notifyGraphStateChange,
  refreshNode,
} from "../shared";

export class LineGeneratorToolNode {
  size: [number, number] = [300, 640];
  properties!: LineGeneratorOptions;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  lineCount = 0;
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
    const node = this as unknown as PreviewAwareNode & LineGeneratorToolNode;
    node.title = createToolTitle("LineGenerator");
    node.properties = { ...DEFAULT_LINE_GENERATOR_OPTIONS };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", DEFAULT_LINE_GENERATOR_OPTIONS.maxWidth, (value) => {
      node.properties.maxWidth = clamp(Math.round(Number(value)), 192, 2400);
      notifyGraphStateChange(node);
    }, { min: 192, max: 2400, step: 8 });
    node.addWidget("slider", "Cell size", DEFAULT_LINE_GENERATOR_OPTIONS.cellSize, (value) => {
      node.properties.cellSize = clamp(Math.round(Number(value)), 6, 80);
      notifyGraphStateChange(node);
    }, { min: 6, max: 80, step: 1 });
    node.addWidget("slider", "Score thr", DEFAULT_LINE_GENERATOR_OPTIONS.scoreThreshold, (value) => {
      node.properties.scoreThreshold = clamp(Number(value), 0.01, 0.8);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 0.8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Attempts", DEFAULT_LINE_GENERATOR_OPTIONS.attemptsPerCell, (value) => {
      node.properties.attemptsPerCell = clamp(Math.round(Number(value)), 4, 300);
      notifyGraphStateChange(node);
    }, { min: 4, max: 300, step: 1 });
    node.addWidget("slider", "Max/cell", DEFAULT_LINE_GENERATOR_OPTIONS.maxLinesPerCell, (value) => {
      node.properties.maxLinesPerCell = clamp(Math.round(Number(value)), 1, 80);
      notifyGraphStateChange(node);
    }, { min: 1, max: 80, step: 1 });
    node.addWidget("slider", "Min len", DEFAULT_LINE_GENERATOR_OPTIONS.minLineLength, (value) => {
      node.properties.minLineLength = clamp(Number(value), 1, 80);
      notifyGraphStateChange(node);
    }, { min: 1, max: 80, step: 0.1, precision: 1 });
    node.addWidget("slider", "Max len", DEFAULT_LINE_GENERATOR_OPTIONS.maxLineLength, (value) => {
      node.properties.maxLineLength = clamp(Number(value), 2, 120);
      notifyGraphStateChange(node);
    }, { min: 2, max: 120, step: 0.1, precision: 1 });
    node.addWidget("slider", "Contrast", DEFAULT_LINE_GENERATOR_OPTIONS.contrast, (value) => {
      node.properties.contrast = clamp(Number(value), 0.2, 4);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Gamma", DEFAULT_LINE_GENERATOR_OPTIONS.gamma, (value) => {
      node.properties.gamma = clamp(Number(value), 0.2, 3);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Dark bias", DEFAULT_LINE_GENERATOR_OPTIONS.darknessBias, (value) => {
      node.properties.darknessBias = clamp(Number(value), 0.2, 3);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Line width", DEFAULT_LINE_GENERATOR_OPTIONS.strokeWidth, (value) => {
      node.properties.strokeWidth = clamp(Number(value), 0.1, 6);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 6, step: 0.1, precision: 1 });
    node.addWidget("slider", "Seed", DEFAULT_LINE_GENERATOR_OPTIONS.seed, (value) => {
      node.properties.seed = clamp(Math.round(Number(value)), 1, 1000000);
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.addWidget("text", "Stroke", DEFAULT_LINE_GENERATOR_OPTIONS.strokeColor, (value) => {
      node.properties.strokeColor = normalizeHexColor(String(value ?? DEFAULT_LINE_GENERATOR_OPTIONS.strokeColor));
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "BG", DEFAULT_LINE_GENERATOR_OPTIONS.backgroundColor, (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value ?? DEFAULT_LINE_GENERATOR_OPTIONS.backgroundColor));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & LineGeneratorToolNode) {
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
      this.lineCount = 0;
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

    const minLineLength = clamp(Number(this.properties.minLineLength ?? DEFAULT_LINE_GENERATOR_OPTIONS.minLineLength), 1, 80);
    const maxLineLength = clamp(
      Number(this.properties.maxLineLength ?? DEFAULT_LINE_GENERATOR_OPTIONS.maxLineLength),
      Math.max(minLineLength + 0.1, 2),
      120,
    );
    const options: LineGeneratorOptions = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? DEFAULT_LINE_GENERATOR_OPTIONS.maxWidth)), 192, 2400),
      cellSize: clamp(Math.round(Number(this.properties.cellSize ?? DEFAULT_LINE_GENERATOR_OPTIONS.cellSize)), 6, 80),
      scoreThreshold: clamp(Number(this.properties.scoreThreshold ?? DEFAULT_LINE_GENERATOR_OPTIONS.scoreThreshold), 0.01, 0.8),
      attemptsPerCell: clamp(Math.round(Number(this.properties.attemptsPerCell ?? DEFAULT_LINE_GENERATOR_OPTIONS.attemptsPerCell)), 4, 300),
      maxLinesPerCell: clamp(Math.round(Number(this.properties.maxLinesPerCell ?? DEFAULT_LINE_GENERATOR_OPTIONS.maxLinesPerCell)), 1, 80),
      minLineLength,
      maxLineLength,
      contrast: clamp(Number(this.properties.contrast ?? DEFAULT_LINE_GENERATOR_OPTIONS.contrast), 0.2, 4),
      gamma: clamp(Number(this.properties.gamma ?? DEFAULT_LINE_GENERATOR_OPTIONS.gamma), 0.2, 3),
      darknessBias: clamp(Number(this.properties.darknessBias ?? DEFAULT_LINE_GENERATOR_OPTIONS.darknessBias), 0.2, 3),
      strokeColor: normalizeHexColor(String(this.properties.strokeColor ?? DEFAULT_LINE_GENERATOR_OPTIONS.strokeColor)),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? DEFAULT_LINE_GENERATOR_OPTIONS.backgroundColor)),
      strokeWidth: clamp(Number(this.properties.strokeWidth ?? DEFAULT_LINE_GENERATOR_OPTIONS.strokeWidth), 0.1, 6),
      seed: clamp(Math.round(Number(this.properties.seed ?? DEFAULT_LINE_GENERATOR_OPTIONS.seed)), 1, 1000000),
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
      this.status = "generating lines...";
      this.setDirtyCanvas(true, true);
      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateLineGeneratorSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return null;
          }
          this.svg = result.svg;
          this.lineCount = result.lineCount;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.status = "ready";
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
          this.lineCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "linegenerator error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onRemoved(this: LineGeneratorToolNode) {
    if (this.debounceTimerId !== null) {
      window.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }

  onDrawBackground(this: PreviewAwareNode & LineGeneratorToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | lines ${this.lineCount}`, 10, layout.footerTop + 30);
    context.fillText(`cells ${Math.round(Number(this.properties.cellSize ?? 0))} | out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
