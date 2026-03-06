import "../../../../vendor/bluenoise.js";
import "../../../../vendor/pnnquant.js";
import imagetracerRuntime, { type ImageTracerApi } from "../../../../vendor/imagetracer-runtime";
import type { PnnQuantOptions, PnnQuantResult } from "../../../../vendor/pnnquant.js";
import { blendGraphImages, brightnessContrastGraphImage, combineCmykChannels, combineRgbChannels, type BlendMode, drawImagePreview, graphImageToUint32Array, grayscaleGraphImage, invertGraphImage, splitCmykChannels, splitRgbChannels, thresholdGraphImage, uint32ArrayToGraphImage } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphPalette } from "../../../../models/graphPalette";
import type { LiteNode, PreviewAwareNode } from "../../shared";
import { OptimizedToolNode, blendModeToCompositeOperation, buildHistogram, clamp, createToolTitle, type HalftoningMode, type HalftoningOptions, type HistogramChannel, type HistogramMode, hsv255ToRgb, notifyGraphStateChange, type LevelsMode, applyLevelsValue, formatExecutionInfo, getGraphImageSignature, halftoneGraphImage, paletteBufferToHexColors, refreshNode, rgbToHsv255 } from "../shared";

interface PnnQuantInstance {
  getResult(): Promise<PnnQuantResult>;
}

interface PnnQuantConstructor {
  new (options: PnnQuantOptions): PnnQuantInstance;
}

function getImageTracer() {
  if (!imagetracerRuntime || typeof imagetracerRuntime.imagedataToSVG !== "function") {
    throw new Error("ImageTracer runtime is not available.");
  }
  return imagetracerRuntime as ImageTracerApi;
}

function getPnnQuant() {
  const runtime = globalThis as {
    PnnQuant?: PnnQuantConstructor;
    TELL_BLUE_NOISE?: Int16Array;
    BlueNoise?: unknown;
  };

  const pnnQuant = runtime.PnnQuant;
  if (!pnnQuant) {
    throw new Error("PnnQuant global is not available.");
  }

  if (!runtime.TELL_BLUE_NOISE || !runtime.BlueNoise) {
    throw new Error("BlueNoise runtime is not available.");
  }

  return pnnQuant;
}

export class InvertToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 280];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & InvertToolNode;
    node.title = createToolTitle("Invert");
    node.properties = {};
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    getImageTracer();
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & InvertToolNode) {
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
    const signature = getGraphImageSignature(input);
    const optionsSignature = "invert";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = invertGraphImage(input);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & InvertToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

export class GrayscaleToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 280];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & GrayscaleToolNode;
    node.title = createToolTitle("Grayscale");
    node.properties = {};
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GrayscaleToolNode) {
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
    const signature = getGraphImageSignature(input);
    const optionsSignature = "grayscale";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = grayscaleGraphImage(input);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GrayscaleToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

export class ThresholdToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & ThresholdToolNode;
    node.title = createToolTitle("Threshold");
    node.properties = { threshold: 128 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Threshold",
      128,
      (value) => {
        node.properties.threshold = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 255, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & ThresholdToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const threshold = Number(this.properties.threshold ?? 128);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `threshold:${Math.round(threshold)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = thresholdGraphImage(input, threshold);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & ThresholdToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

export class HalftoningToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 405];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & HalftoningToolNode;
    node.title = createToolTitle("Halftoning");
    node.properties = {
      mode: "ordered4x4" as HalftoningMode,
      threshold: 127,
      bias: 0,
      densityScale: 4,
      invert: false,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Type",
      "ordered4x4",
      (value) => {
        node.properties.mode = String(value) as HalftoningMode;
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { values: ["ordered4x4", "floydSteinberg", "atkinson", "density4x4"] },
    );
    node.addWidget(
      "slider",
      "Threshold",
      127,
      (value) => {
        node.properties.threshold = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 255, step: 1 },
    );
    node.addWidget(
      "slider",
      "Bias",
      0,
      (value) => {
        node.properties.bias = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -128, max: 128, step: 1 },
    );
    node.addWidget(
      "slider",
      "Density Scale",
      4,
      (value) => {
        node.properties.densityScale = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 2, max: 8, step: 1 },
    );
    node.addWidget(
      "toggle",
      "Invert",
      false,
      (value) => {
        node.properties.invert = Boolean(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      {},
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & HalftoningToolNode) {
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

    const options: HalftoningOptions = {
      mode: String(this.properties.mode ?? "ordered4x4") as HalftoningMode,
      threshold: Number(this.properties.threshold ?? 127),
      bias: Number(this.properties.bias ?? 0),
      densityScale: Number(this.properties.densityScale ?? 4),
      invert: Boolean(this.properties.invert ?? false),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify({
      mode: options.mode,
      threshold: Math.round(options.threshold),
      bias: Math.round(options.bias),
      densityScale: Math.round(options.densityScale),
      invert: options.invert,
    });
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = halftoneGraphImage(input, options);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & HalftoningToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const mode = String(this.properties.mode ?? "ordered4x4");
    const threshold = Math.round(Number(this.properties.threshold ?? 127));
    const bias = Math.round(Number(this.properties.bias ?? 0));
    const densityScale = Math.round(Number(this.properties.densityScale ?? 4));
    context.fillText(`mode:${mode} | thr:${threshold} | bias:${bias}`, 10, layout.footerTop + 12);
    context.fillText(`density:${densityScale} | ${formatExecutionInfo(this.executionMs)}`, 10, layout.footerTop + 30);
    context.restore();
  }
}

export class BrightnessContrastToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & BrightnessContrastToolNode;
    node.title = createToolTitle("Brightness/Contrast");
    node.properties = { brightness: 0, contrast: 0, saturation: 0 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Brightness",
      0,
      (value) => {
        node.properties.brightness = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.addWidget(
      "slider",
      "Contrast",
      0,
      (value) => {
        node.properties.contrast = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.addWidget(
      "slider",
      "Saturation",
      0,
      (value) => {
        node.properties.saturation = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & BrightnessContrastToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const brightness = Number(this.properties.brightness ?? 0);
    const contrast = Number(this.properties.contrast ?? 0);
    const saturation = Number(this.properties.saturation ?? 0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `b:${Math.round(brightness)}|c:${Math.round(contrast)}|s:${Math.round(saturation)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = brightnessContrastGraphImage(input, brightness, contrast, saturation);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BrightnessContrastToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `B ${Number(this.properties.brightness ?? 0)} | C ${Number(this.properties.contrast ?? 0)} | S ${Number(this.properties.saturation ?? 0)}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class HistogramToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;
  channels: HistogramChannel[] = [];
  maxCount = 0;
  pixelCount = 0;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & HistogramToolNode;
    node.title = createToolTitle("Histogram");
    node.properties = { mode: "rgb" as HistogramMode };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Type",
      "rgb",
      (value) => {
        const mode = String(value) as HistogramMode;
        node.properties.mode = mode;
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { values: ["rgb", "hsv", "grayscale"] },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & HistogramToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    this.preview = input ?? null;
    this.setOutputData(0, input ?? null);
    if (!input) {
      this.channels = [];
      this.maxCount = 0;
      this.pixelCount = 0;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.refreshPreviewLayout();
      return;
    }

    const mode = String(this.properties.mode ?? "rgb") as HistogramMode;
    const signature = getGraphImageSignature(input);
    const optionsSignature = `mode:${mode}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.refreshPreviewLayout();
      return;
    }
    const histogram = buildHistogram(input, mode);
    this.channels = histogram.channels;
    this.maxCount = histogram.maxCount;
    this.pixelCount = histogram.pixelCount;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & HistogramToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    if (this.channels.length && this.maxCount > 0) {
      const left = layout.padding + 8;
      const top = layout.previewTop + 8;
      const width = layout.previewWidth - 16;
      const height = layout.previewHeight - 16;

      context.save();
      context.fillStyle = "rgba(8,8,8,0.55)";
      context.fillRect(left, top, width, height);
      context.strokeStyle = "rgba(255,255,255,0.12)";
      context.lineWidth = 1;
      context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);

      this.channels.forEach((channel) => {
        context.beginPath();
        context.lineWidth = 1.5;
        context.strokeStyle = channel.color;
        for (let index = 0; index < 256; index += 1) {
          const x = left + (index / 255) * width;
          const normalized = channel.values[index] / this.maxCount;
          const y = top + height - normalized * height;
          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        context.stroke();
      });
      context.restore();
    }

    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const mode = String(this.properties.mode ?? "rgb");
    context.fillText(`mode: ${mode} | pixels: ${this.pixelCount}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class LevelsToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 430];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & LevelsToolNode;
    node.title = createToolTitle("Levels");
    node.properties = {
      mode: "rgb" as LevelsMode,
      inBlack: 0,
      inWhite: 255,
      gamma: 1,
      outBlack: 0,
      outWhite: 255,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Type",
      "rgb",
      (value) => {
        node.properties.mode = String(value) as LevelsMode;
        notifyGraphStateChange(node);
      },
      { values: ["rgb", "hsv", "gray", "alpha"] },
    );
    node.addWidget(
      "slider",
      "In Black",
      0,
      (value) => {
        node.properties.inBlack = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 254, step: 1 },
    );
    node.addWidget(
      "slider",
      "In White",
      255,
      (value) => {
        node.properties.inWhite = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 255, step: 1 },
    );
    node.addWidget(
      "slider",
      "Gamma",
      1,
      (value) => {
        node.properties.gamma = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.1, max: 5, step: 0.01, precision: 2 },
    );
    node.addWidget(
      "slider",
      "Out Black",
      0,
      (value) => {
        node.properties.outBlack = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 254, step: 1 },
    );
    node.addWidget(
      "slider",
      "Out White",
      255,
      (value) => {
        node.properties.outWhite = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 255, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & LevelsToolNode) {
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

    const mode = String(this.properties.mode ?? "rgb") as LevelsMode;
    const inBlack = Number(this.properties.inBlack ?? 0);
    const inWhite = Number(this.properties.inWhite ?? 255);
    const gamma = Number(this.properties.gamma ?? 1);
    const outBlack = Number(this.properties.outBlack ?? 0);
    const outWhite = Number(this.properties.outWhite ?? 255);
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify({
      mode,
      inBlack: Math.round(inBlack),
      inWhite: Math.round(inWhite),
      gamma: Number(gamma.toFixed(3)),
      outBlack: Math.round(outBlack),
      outWhite: Math.round(outWhite),
    });
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const sourceContext = input.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const imageData = sourceContext.getImageData(0, 0, input.width, input.height);
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      if (mode === "rgb") {
        data[index] = applyLevelsValue(r, inBlack, inWhite, gamma, outBlack, outWhite);
        data[index + 1] = applyLevelsValue(g, inBlack, inWhite, gamma, outBlack, outWhite);
        data[index + 2] = applyLevelsValue(b, inBlack, inWhite, gamma, outBlack, outWhite);
      } else if (mode === "hsv") {
        const hsv = rgbToHsv255(r, g, b);
        const adjustedValue = applyLevelsValue(hsv.v, inBlack, inWhite, gamma, outBlack, outWhite);
        const rgb = hsv255ToRgb(hsv.h, hsv.s, adjustedValue);
        data[index] = rgb.r;
        data[index + 1] = rgb.g;
        data[index + 2] = rgb.b;
      } else if (mode === "gray") {
        const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        const gray = applyLevelsValue(luminance, inBlack, inWhite, gamma, outBlack, outWhite);
        data[index] = gray;
        data[index + 1] = gray;
        data[index + 2] = gray;
      } else if (mode === "alpha") {
        data[index + 3] = applyLevelsValue(a, inBlack, inWhite, gamma, outBlack, outWhite);
      }
    }

    const output = document.createElement("canvas");
    output.width = input.width;
    output.height = input.height;
    const outputContext = output.getContext("2d");
    if (!outputContext) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    outputContext.putImageData(imageData, 0, 0);
    this.preview = output;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & LevelsToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const mode = String(this.properties.mode ?? "rgb");
    const inBlack = Number(this.properties.inBlack ?? 0);
    const inWhite = Number(this.properties.inWhite ?? 255);
    const gamma = Number(this.properties.gamma ?? 1);
    context.fillText(
      `mode:${mode} | in:${Math.round(inBlack)}-${Math.round(inWhite)} | g:${gamma.toFixed(2)}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class RgbSplitToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;
  r: GraphImage | null = null;
  g: GraphImage | null = null;
  b: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & RgbSplitToolNode;
    node.title = createToolTitle("RGB Split");
    node.properties = {};
    node.addInput("image", "image");
    node.addOutput("R", "image");
    node.addOutput("G", "image");
    node.addOutput("B", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RgbSplitToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.r = null;
      this.g = null;
      this.b = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.setOutputData(2, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = "rgb-split";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.r);
      this.setOutputData(1, this.g);
      this.setOutputData(2, this.b);
      this.refreshPreviewLayout();
      return;
    }

    const result = splitRgbChannels(input);
    this.r = result.r;
    this.g = result.g;
    this.b = result.b;
    this.preview = result.r;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.r);
    this.setOutputData(1, this.g);
    this.setOutputData(2, this.b);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RgbSplitToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText("outputs: R, G, B", 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class CmykSplitToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;
  c: GraphImage | null = null;
  m: GraphImage | null = null;
  y: GraphImage | null = null;
  k: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & CmykSplitToolNode;
    node.title = createToolTitle("CMYK Split");
    node.properties = {};
    node.addInput("image", "image");
    node.addOutput("C", "image");
    node.addOutput("M", "image");
    node.addOutput("Y", "image");
    node.addOutput("K", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & CmykSplitToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.c = null;
      this.m = null;
      this.y = null;
      this.k = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.setOutputData(2, null);
      this.setOutputData(3, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = "cmyk-split";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.c);
      this.setOutputData(1, this.m);
      this.setOutputData(2, this.y);
      this.setOutputData(3, this.k);
      this.refreshPreviewLayout();
      return;
    }

    const result = splitCmykChannels(input);
    this.c = result.c;
    this.m = result.m;
    this.y = result.y;
    this.k = result.k;
    this.preview = result.k;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.c);
    this.setOutputData(1, this.m);
    this.setOutputData(2, this.y);
    this.setOutputData(3, this.k);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & CmykSplitToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText("outputs: C, M, Y, K", 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class RgbCombineToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & RgbCombineToolNode;
    node.title = createToolTitle("RGB Combine");
    node.properties = {};
    node.addInput("R", "image");
    node.addInput("G", "image");
    node.addInput("B", "image");
    node.addOutput("image", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RgbCombineToolNode) {
    const start = performance.now();
    const r = this.getInputData(0);
    const g = this.getInputData(1);
    const b = this.getInputData(2);
    if (!r || !g || !b) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = `${getGraphImageSignature(r)}|${getGraphImageSignature(g)}|${getGraphImageSignature(b)}`;
    const optionsSignature = "rgb-combine";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = combineRgbChannels(r, g, b);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RgbCombineToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText("inputs: R, G, B", 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class CmykCombineToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & CmykCombineToolNode;
    node.title = createToolTitle("CMYK Combine");
    node.properties = {};
    node.addInput("C", "image");
    node.addInput("M", "image");
    node.addInput("Y", "image");
    node.addInput("K", "image");
    node.addOutput("image", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & CmykCombineToolNode) {
    const start = performance.now();
    const c = this.getInputData(0);
    const m = this.getInputData(1);
    const y = this.getInputData(2);
    const k = this.getInputData(3);
    if (!c || !m || !y || !k) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = `${getGraphImageSignature(c)}|${getGraphImageSignature(m)}|${getGraphImageSignature(y)}|${getGraphImageSignature(k)}`;
    const optionsSignature = "cmyk-combine";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = combineCmykChannels(c, m, y, k);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & CmykCombineToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText("inputs: C, M, Y, K", 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class QuantizeToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;
  palette: GraphPalette | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  isRendering = false;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & QuantizeToolNode;
    getPnnQuant();
    node.title = createToolTitle("Quantize");
    node.properties = {
      colors: 16,
      dithering: true,
      weight: 0.55,
      alphaThreshold: 15,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("palette", "palette");
    node.addWidget(
      "slider",
      "Colors",
      16,
      (value) => {
        node.properties.colors = Math.round(Number(value));
        notifyGraphStateChange(node);
      },
      { min: 2, max: 256, step: 1 },
    );
    node.addWidget("toggle", "Dither", true, (value) => {
      node.properties.dithering = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget(
      "slider",
      "Weight",
      0.55,
      (value) => {
        node.properties.weight = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.001, max: 1, step: 0.001, precision: 3 },
    );
    node.addWidget(
      "slider",
      "Alpha thr",
      15,
      (value) => {
        node.properties.alphaThreshold = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 255, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  getQuantizeOptions(this: PreviewAwareNode & QuantizeToolNode, input: GraphImage): PnnQuantOptions {
    return {
      pixels: graphImageToUint32Array(input),
      width: input.width,
      height: input.height,
      colors: clamp(Math.round(Number(this.properties.colors ?? 16)), 2, 256),
      dithering: Boolean(this.properties.dithering ?? true),
      alphaThreshold: clamp(Number(this.properties.alphaThreshold ?? 15), 0, 255),
      weight: Number(this.properties.weight ?? 0.55),
    };
  }

  onExecute(this: PreviewAwareNode & QuantizeToolNode) {
    const start = performance.now();
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.palette = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.executionMs = performance.now() - start;
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getQuantizeOptions(input);
    const optionsSignature = JSON.stringify({
      colors: options.colors,
      dithering: options.dithering,
      alphaThreshold: options.alphaThreshold,
      weight: options.weight,
    });

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      this.isRendering = true;
      const PnnQuant = getPnnQuant();
      const quantizer = new PnnQuant(options);
      const renderToken = ++this.renderToken;

      void quantizer
        .getResult()
        .then((result: PnnQuantResult) => {
          if (renderToken !== this.renderToken) {
            return;
          }

          if (result.img8) {
            this.preview = uint32ArrayToGraphImage(result.img8, {
              width: input.width,
              height: input.height,
            });
            this.palette = result.pal8 ? paletteBufferToHexColors(result.pal8) : null;
            this.isRendering = false;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          }
        })
        .catch(() => {
          if (renderToken !== this.renderToken) {
            return;
          }

          this.preview = null;
          this.palette = null;
          this.isRendering = false;
          this.executionMs = null;
          this.lastSignature = "";
          this.lastOptionsSignature = "";
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.palette);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & QuantizeToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`palette: ${this.palette?.length ?? 0} colors`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }

  onSerialize(this: QuantizeToolNode, data: Record<string, unknown>) {
    data.palette = this.palette;
  }

  onConfigure(this: PreviewAwareNode & QuantizeToolNode, data: Record<string, unknown>) {
    this.palette = Array.isArray(data.palette)
      ? data.palette.filter((item): item is string => typeof item === "string")
      : null;
    this.refreshPreviewLayout();
  }
}

export class BlendToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & BlendToolNode;
    node.title = createToolTitle("Blend");
    node.properties = {
      mode: "normal",
      alpha: 0.5,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
    node.addInput("base", "image");
    node.addInput("layer", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Mode",
      "normal",
      (value) => {
        node.properties.mode = String(value);
        notifyGraphStateChange(node);
      },
      {
        values: ["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference"],
      },
    );
    node.addWidget(
      "slider",
      "Alpha",
      0.5,
      (value) => {
        node.properties.alpha = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 1, step: 0.05, precision: 2 },
    );
    node.addWidget(
      "slider",
      "Offset X",
      0,
      (value) => {
        node.properties.offsetX = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -4096, max: 4096, step: 1 },
    );
    node.addWidget(
      "slider",
      "Offset Y",
      0,
      (value) => {
        node.properties.offsetY = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -4096, max: 4096, step: 1 },
    );
    node.addWidget(
      "slider",
      "Scale",
      1,
      (value) => {
        node.properties.scale = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.1, max: 4, step: 0.05, precision: 2 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & BlendToolNode) {
    const start = performance.now();
    const baseImage = this.getInputData(0);
    const layerImage = this.getInputData(1);

    if (!baseImage) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    if (!layerImage) {
      this.preview = baseImage;
      this.executionMs = performance.now() - start;
      this.setOutputData(0, baseImage);
      this.refreshPreviewLayout();
      return;
    }

    const signature = `${getGraphImageSignature(baseImage)}|${getGraphImageSignature(layerImage)}`;
    const optionsSignature = JSON.stringify({
      mode: String(this.properties.mode ?? "normal"),
      alpha: Number(this.properties.alpha ?? 0.5).toFixed(3),
      offsetX: Math.round(Number(this.properties.offsetX ?? 0)),
      offsetY: Math.round(Number(this.properties.offsetY ?? 0)),
      scale: Number(this.properties.scale ?? 1).toFixed(3),
    });
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = blendGraphImages(baseImage, layerImage, {
      alpha: Number(this.properties.alpha ?? 0.5),
      mode: String(this.properties.mode ?? "normal") as BlendMode,
      offsetX: Number(this.properties.offsetX ?? 0),
      offsetY: Number(this.properties.offsetY ?? 0),
      scale: Number(this.properties.scale ?? 1),
    });
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BlendToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

export class LayersToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 500];
  preview: GraphImage | null = null;
  static MAX_LAYERS = 6;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & LayersToolNode;
    node.title = createToolTitle("Layers");
    const layerDefaults: Record<string, unknown> = {};
    for (let index = 0; index < LayersToolNode.MAX_LAYERS; index += 1) {
      const layer = index + 1;
      layerDefaults[`layer${layer}Mode`] = "normal";
      layerDefaults[`layer${layer}Alpha`] = 1;
    }
    node.properties = {
      layerCount: 3,
      ...layerDefaults,
    };
    for (let index = 0; index < LayersToolNode.MAX_LAYERS; index += 1) {
      node.addInput(`L${index + 1}`, "image");
    }
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Layers",
      3,
      (value) => {
        node.properties.layerCount = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 1, max: LayersToolNode.MAX_LAYERS, step: 1 },
    );
    for (let index = 0; index < LayersToolNode.MAX_LAYERS; index += 1) {
      const layer = index + 1;
      node.addWidget(
        "combo",
        `L${layer} Mode`,
        "normal",
        (value) => {
          node.properties[`layer${layer}Mode`] = String(value);
          notifyGraphStateChange(node);
        },
        { values: ["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference"] },
      );
      node.addWidget(
        "slider",
        `L${layer} Alpha`,
        1,
        (value) => {
          node.properties[`layer${layer}Alpha`] = Number(value);
          notifyGraphStateChange(node);
        },
        { min: 0, max: 1, step: 0.05, precision: 2 },
      );
    }
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & LayersToolNode) {
    const start = performance.now();
    const layerCount = clamp(Math.round(Number(this.properties.layerCount ?? 3)), 1, LayersToolNode.MAX_LAYERS);
    const layers = Array.from({ length: layerCount }).map((_, index) => this.getInputData(index));
    const signatures = layers.map((image) => getGraphImageSignature(image ?? null));
    const optionsSignature = JSON.stringify({
      layerCount,
      layers: Array.from({ length: layerCount }).map((_, index) => ({
        mode: String(this.properties[`layer${index + 1}Mode`] ?? "normal"),
        alpha: Number(this.properties[`layer${index + 1}Alpha`] ?? 1).toFixed(3),
      })),
    });
    const signature = signatures.join("|");

    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const availableLayers = layers.filter((image): image is GraphImage => Boolean(image));
    if (!availableLayers.length) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const width = Math.max(...availableLayers.map((image) => image.width));
    const height = Math.max(...availableLayers.map((image) => image.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    context.clearRect(0, 0, width, height);

    for (let index = 0; index < layerCount; index += 1) {
      const image = layers[index];
      if (!image) {
        continue;
      }
      const mode = String(this.properties[`layer${index + 1}Mode`] ?? "normal") as BlendMode;
      const alpha = clamp(Number(this.properties[`layer${index + 1}Alpha`] ?? 1), 0, 1);
      context.save();
      context.globalCompositeOperation = blendModeToCompositeOperation[mode] ?? "source-over";
      context.globalAlpha = alpha;
      context.drawImage(image, 0, 0, width, height);
      context.restore();
    }

    this.preview = canvas;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & LayersToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const layerCount = clamp(Math.round(Number(this.properties.layerCount ?? 3)), 1, LayersToolNode.MAX_LAYERS);
    context.fillText(`layers:${layerCount} | blend stack`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}
