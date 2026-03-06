import { blurGraphImage, drawImagePreview } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { PreviewAwareNode } from "../../shared";
import {
  clamp,
  convolveImage3x3,
  createToolTitle,
  formatExecutionInfo,
  getGraphImageSignature,
  notifyGraphStateChange,
  refreshNode,
  sobelGraphImage,
} from "../shared";
import { OptimizedToolNode } from "../shared";

export class BlurToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & BlurToolNode;
    node.title = createToolTitle("Blur");
    node.properties = { radius: 4 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Radius",
      4,
      (value) => {
        node.properties.radius = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 24, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & BlurToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const radius = Number(this.properties.radius ?? 4);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `radius:${Math.round(radius)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = blurGraphImage(input, radius);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BlurToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

export class SharpenToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & SharpenToolNode;
    node.title = createToolTitle("Sharpen");
    node.properties = {
      preset: "classic",
      amount: 1,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Preset",
      "classic",
      (value) => {
        node.properties.preset = String(value);
        notifyGraphStateChange(node);
      },
      { values: ["classic", "strong", "edge"] },
    );
    node.addWidget(
      "slider",
      "Amount",
      1,
      (value) => {
        node.properties.amount = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.5, max: 3, step: 0.1, precision: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & SharpenToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const preset = String(this.properties.preset ?? "classic");
    const amount = clamp(Number(this.properties.amount ?? 1), 0.5, 3);
    const signature = getGraphImageSignature(input);
    const optionsSignature = `preset:${preset}|amount:${amount.toFixed(2)}`;
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const kernels: Record<string, number[]> = {
      classic: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      strong: [-1, -1, -1, -1, 9, -1, -1, -1, -1],
      edge: [1, -2, 1, -2, 5, -2, 1, -2, 1],
    };
    const baseKernel = kernels[preset] ?? kernels.classic;
    const kernel = baseKernel.map((value, index) => (index === 4 ? 1 + (value - 1) * amount : value * amount));
    this.preview = convolveImage3x3(input, kernel, 1, 0);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SharpenToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const preset = String(this.properties.preset ?? "classic");
    const amount = Number(this.properties.amount ?? 1);
    context.fillText(`preset:${preset} | amount:${amount.toFixed(1)}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class SobelToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 400];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & SobelToolNode;
    node.title = createToolTitle("Sobel");
    node.properties = {
      mode: "magnitude",
      threshold: 80,
      invert: false,
      strength: 1,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Mode",
      "magnitude",
      (value) => {
        node.properties.mode = String(value);
        notifyGraphStateChange(node);
      },
      { values: ["magnitude", "horizontal", "vertical", "threshold"] },
    );
    node.addWidget(
      "slider",
      "Threshold",
      80,
      (value) => {
        node.properties.threshold = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 255, step: 1 },
    );
    node.addWidget("toggle", "Invert", false, (value) => {
      node.properties.invert = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget(
      "slider",
      "Strength",
      1,
      (value) => {
        node.properties.strength = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.5, max: 6, step: 0.1, precision: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & SobelToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const mode = String(this.properties.mode ?? "magnitude") as "magnitude" | "horizontal" | "vertical" | "threshold";
    const threshold = Number(this.properties.threshold ?? 80);
    const invert = Boolean(this.properties.invert ?? false);
    const strength = Number(this.properties.strength ?? 1);
    const signature = getGraphImageSignature(input);
    const optionsSignature = `mode:${mode}|thr:${Math.round(threshold)}|inv:${invert ? 1 : 0}|str:${strength.toFixed(2)}`;
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = sobelGraphImage(input, { mode, threshold, invert, strength });
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SobelToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const mode = String(this.properties.mode ?? "magnitude");
    const threshold = Math.round(Number(this.properties.threshold ?? 80));
    context.fillText(`mode:${mode} | thr:${threshold}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}
