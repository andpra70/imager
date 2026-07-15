import { drawImagePreview } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { PreviewAwareNode } from "../../shared";
import { DEFAULT_PATRICK_NAGEL_OPTIONS, generatePatrickNagelImage, type PatrickNagelOptions } from "../../../artists/patrick";
import { OptimizedToolNode, clamp, createToolTitle, formatExecutionInfo, getGraphImageSignature, notifyGraphStateChange, refreshNode } from "../shared";

export class PatrickToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 430];
  preview: GraphImage | null = null;
  properties!: PatrickNagelOptions;
  status = "idle";
  pendingRunSignature = "";
  debouncedRunSignature = "";
  debounceTimerId: number | null = null;

  private handleOptionChange(this: PreviewAwareNode & PatrickToolNode) {
    this.resetOptimizedCache();
    this.status = "waiting debounce...";
    this.setDirtyCanvas(true, true);
    notifyGraphStateChange(this);
  }

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & PatrickToolNode;
    node.title = createToolTitle("Patrick Nagel");
    node.properties = { ...DEFAULT_PATRICK_NAGEL_OPTIONS };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("slider", "Smooth", DEFAULT_PATRICK_NAGEL_OPTIONS.smoothing, (value) => {
      node.properties.smoothing = clamp(Number(value), 0, 8);
      node.handleOptionChange();
    }, { min: 0, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Black", DEFAULT_PATRICK_NAGEL_OPTIONS.blackPoint, (value) => {
      node.properties.blackPoint = clamp(Math.round(Number(value)), 0, 180);
      node.handleOptionChange();
    }, { min: 0, max: 180, step: 1 });
    node.addWidget("slider", "White", DEFAULT_PATRICK_NAGEL_OPTIONS.whitePoint, (value) => {
      node.properties.whitePoint = clamp(Math.round(Number(value)), 80, 255);
      node.handleOptionChange();
    }, { min: 80, max: 255, step: 1 });
    node.addWidget("slider", "Sat", DEFAULT_PATRICK_NAGEL_OPTIONS.saturation, (value) => {
      node.properties.saturation = clamp(Number(value), 0, 2.5);
      node.handleOptionChange();
    }, { min: 0, max: 2.5, step: 0.05, precision: 2 });
    node.addWidget("slider", "Posterize", DEFAULT_PATRICK_NAGEL_OPTIONS.posterizeLevels, (value) => {
      node.properties.posterizeLevels = clamp(Math.round(Number(value)), 3, 8);
      node.handleOptionChange();
    }, { min: 3, max: 8, step: 1 });
    node.addWidget("slider", "Edges", DEFAULT_PATRICK_NAGEL_OPTIONS.edgeThreshold, (value) => {
      node.properties.edgeThreshold = clamp(Math.round(Number(value)), 4, 96);
      node.handleOptionChange();
    }, { min: 4, max: 96, step: 1 });
    node.addWidget("text", "BG", DEFAULT_PATRICK_NAGEL_OPTIONS.backgroundColor, (value) => {
      node.properties.backgroundColor = String(value || DEFAULT_PATRICK_NAGEL_OPTIONS.backgroundColor);
      node.handleOptionChange();
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & PatrickToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
        this.debounceTimerId = null;
      }
      this.preview = null;
      this.status = "idle";
      this.pendingRunSignature = "";
      this.debouncedRunSignature = "";
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const blackPoint = clamp(Math.round(Number(this.properties.blackPoint ?? DEFAULT_PATRICK_NAGEL_OPTIONS.blackPoint)), 0, 180);
    const whitePoint = clamp(Math.round(Number(this.properties.whitePoint ?? DEFAULT_PATRICK_NAGEL_OPTIONS.whitePoint)), blackPoint + 1, 255);
    const options: PatrickNagelOptions = {
      smoothing: clamp(Number(this.properties.smoothing ?? DEFAULT_PATRICK_NAGEL_OPTIONS.smoothing), 0, 8),
      blackPoint,
      whitePoint,
      saturation: clamp(Number(this.properties.saturation ?? DEFAULT_PATRICK_NAGEL_OPTIONS.saturation), 0, 2.5),
      posterizeLevels: clamp(Math.round(Number(this.properties.posterizeLevels ?? DEFAULT_PATRICK_NAGEL_OPTIONS.posterizeLevels)), 3, 8),
      edgeThreshold: clamp(Math.round(Number(this.properties.edgeThreshold ?? DEFAULT_PATRICK_NAGEL_OPTIONS.edgeThreshold)), 4, 96),
      backgroundColor: String(this.properties.backgroundColor ?? DEFAULT_PATRICK_NAGEL_OPTIONS.backgroundColor),
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
        this.status = "rendering...";
        this.setDirtyCanvas(true, true);
      }, 160);
    }

    if (this.debouncedRunSignature !== runSignature) {
      this.setOutputData(0, this.preview ?? input);
      this.refreshPreviewLayout();
      return;
    }

    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.status = "rendering...";
    this.preview = generatePatrickNagelImage(input, options);
    this.status = "ready";
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & PatrickToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${this.status} | lvl ${Math.round(Number(this.properties.blackPoint ?? 0))}-${Math.round(Number(this.properties.whitePoint ?? 255))}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(
      `sat ${Number(this.properties.saturation ?? 1).toFixed(2)} | ${formatExecutionInfo(this.executionMs)}`,
      10,
      layout.footerTop + 30,
    );
    context.restore();
  }
}
