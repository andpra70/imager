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

export class QuantizeLevelsToolNode extends OptimizedToolNode {
  size: [number, number] = [320, 430];
  preview: GraphImage | null = null;
  masks: GraphImage[] = [];
  outputCount = 0;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & QuantizeLevelsToolNode;
    node.title = createToolTitle("Quantize Levels");
    node.properties = {
      levels: 8,
      previewLevel: 1,
    };
    node.addInput("image", "image");

    node.addWidget(
      "slider",
      "Levels",
      8,
      (value) => {
        node.properties.levels = clamp(Math.round(Number(value)), 2, 64);
        const currentPreview = clamp(Math.round(Number(node.properties.previewLevel ?? 1)), 1, Number(node.properties.levels));
        node.properties.previewLevel = currentPreview;
        this.syncLevelOutputs(Number(node.properties.levels));
        notifyGraphStateChange(node);
      },
      { min: 2, max: 64, step: 1 },
    );
    node.addWidget(
      "slider",
      "Preview L",
      1,
      (value) => {
        node.properties.previewLevel = clamp(Math.round(Number(value)), 1, Number(node.properties.levels ?? 8));
        notifyGraphStateChange(node);
      },
      { min: 1, max: 64, step: 1 },
    );

    this.syncLevelOutputs(8);
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  private syncLevelOutputs(this: QuantizeLevelsToolNode, requestedLevels: number) {
    const node = this as unknown as PreviewAwareNode & QuantizeLevelsToolNode & {
      outputs?: Array<{ name?: string; type?: string }>;
      removeOutput?: (slot: number) => void;
    };
    const targetCount = clamp(Math.round(Number(requestedLevels)), 2, 64);

    if (!Array.isArray(node.outputs)) {
      for (let index = 0; index < targetCount; index += 1) {
        node.addOutput(`L${index + 1}`, "image");
      }
      this.outputCount = targetCount;
      return;
    }

    if (typeof node.removeOutput === "function") {
      while ((node.outputs?.length ?? 0) > targetCount) {
        node.removeOutput((node.outputs?.length ?? 1) - 1);
      }
    }

    while ((node.outputs?.length ?? 0) < targetCount) {
      const outputIndex = (node.outputs?.length ?? 0) + 1;
      node.addOutput(`L${outputIndex}`, "image");
    }

    for (let index = 0; index < (node.outputs?.length ?? 0); index += 1) {
      if (!node.outputs) {
        break;
      }
      node.outputs[index].name = `L${index + 1}`;
      node.outputs[index].type = "image";
    }

    this.outputCount = node.outputs?.length ?? targetCount;
  }

  onExecute(this: PreviewAwareNode & QuantizeLevelsToolNode) {
    const start = performance.now();
    const input = this.getInputData(0) ?? null;
    const levels = clamp(Math.round(Number(this.properties.levels ?? 8)), 2, 64);
    this.syncLevelOutputs(levels);

    if (!input) {
      this.preview = null;
      this.masks = [];
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      for (let slot = 0; slot < this.outputCount; slot += 1) {
        this.setOutputData(slot, null);
      }
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const optionsSignature = `levels:${levels}`;
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      for (let slot = 0; slot < this.outputCount; slot += 1) {
        this.setOutputData(slot, this.masks[slot] ?? null);
      }
      this.refreshPreviewLayout();
      return;
    }

    const sourceContext = input.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) {
      this.preview = null;
      this.masks = [];
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      for (let slot = 0; slot < this.outputCount; slot += 1) {
        this.setOutputData(slot, null);
      }
      this.refreshPreviewLayout();
      return;
    }

    const width = input.width;
    const height = input.height;
    const pixels = width * height;
    const sourceData = sourceContext.getImageData(0, 0, width, height).data;
    const levelIndexByPixel = new Uint8Array(pixels);

    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const dataIndex = pixel * 4;
      const luminance = Math.round(
        0.299 * sourceData[dataIndex]
        + 0.587 * sourceData[dataIndex + 1]
        + 0.114 * sourceData[dataIndex + 2],
      );
      const levelIndex = Math.min(levels - 1, Math.floor((luminance / 256) * levels));
      levelIndexByPixel[pixel] = levelIndex;
    }

    const nextMasks: GraphImage[] = [];
    for (let level = 0; level < levels; level += 1) {
      const mask = document.createElement("canvas");
      mask.width = width;
      mask.height = height;
      const maskContext = mask.getContext("2d");
      if (!maskContext) {
        continue;
      }

      const maskImage = maskContext.createImageData(width, height);
      const target = maskImage.data;
      for (let pixel = 0; pixel < pixels; pixel += 1) {
        const dataIndex = pixel * 4;
        const on = levelIndexByPixel[pixel] === level ? 255 : 0;
        target[dataIndex] = on;
        target[dataIndex + 1] = on;
        target[dataIndex + 2] = on;
        target[dataIndex + 3] = 255;
      }
      maskContext.putImageData(maskImage, 0, 0);
      nextMasks.push(mask);
    }

    this.masks = nextMasks;
    const previewLevel = clamp(Math.round(Number(this.properties.previewLevel ?? 1)), 1, levels) - 1;
    this.preview = this.masks[previewLevel] ?? this.masks[0] ?? null;

    this.completeOptimizedExecution(start, signature, optionsSignature);
    for (let slot = 0; slot < this.outputCount; slot += 1) {
      this.setOutputData(slot, this.masks[slot] ?? null);
    }
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & QuantizeLevelsToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const levels = clamp(Math.round(Number(this.properties.levels ?? 8)), 2, 64);
    const previewLevel = clamp(Math.round(Number(this.properties.previewLevel ?? 1)), 1, levels);
    context.fillText(`levels: ${levels} | preview: L${previewLevel}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
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
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  static MAX_LAYERS = 6;
  layerRects: Array<{ x: number; y: number; width: number; height: number } | null> = [];
  previewViewport: { x: number; y: number; width: number; height: number; ratio: number } | null = null;
  dragState:
    | {
        layerIndex: number;
        mode: "move" | "scale";
        startLocalX: number;
        startLocalY: number;
        startOffsetX: number;
        startOffsetY: number;
        startScale: number;
      }
    | null = null;

  private setWidgetValue(this: LayersToolNode, name: string, value: unknown) {
    const widgets = (this as unknown as LiteNode).widgets;
    if (!widgets?.length) {
      return;
    }
    const widget = widgets.find((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      return (item as { name?: unknown }).name === name;
    }) as { value?: unknown } | undefined;
    if (widget) {
      widget.value = value;
    }
  }

  private getActiveLayerIndex(this: LayersToolNode) {
    const activeLayer = clamp(
      Math.round(Number(this.properties.activeLayer ?? 1)),
      1,
      LayersToolNode.MAX_LAYERS,
    );
    return activeLayer - 1;
  }

  private getLayerOffsetX(this: LayersToolNode, index: number) {
    return Number(this.properties[`layer${index + 1}OffsetX`] ?? 0);
  }

  private getLayerOffsetY(this: LayersToolNode, index: number) {
    return Number(this.properties[`layer${index + 1}OffsetY`] ?? 0);
  }

  private getLayerScale(this: LayersToolNode, index: number) {
    return clamp(Number(this.properties[`layer${index + 1}Scale`] ?? 1), 0.05, 8);
  }

  private setLayerTransform(this: LayersToolNode, index: number, offsetX: number, offsetY: number, scale: number) {
    this.properties[`layer${index + 1}OffsetX`] = offsetX;
    this.properties[`layer${index + 1}OffsetY`] = offsetY;
    this.properties[`layer${index + 1}Scale`] = clamp(scale, 0.05, 8);
  }

  private syncActiveLayerWidgets(this: LayersToolNode) {
    const activeLayer = this.getActiveLayerIndex() + 1;
    this.setWidgetValue("Active layer", activeLayer);
    this.setWidgetValue("Offset X", Number(this.properties[`layer${activeLayer}OffsetX`] ?? 0));
    this.setWidgetValue("Offset Y", Number(this.properties[`layer${activeLayer}OffsetY`] ?? 0));
    this.setWidgetValue("Scale", Number(this.properties[`layer${activeLayer}Scale`] ?? 1));
  }

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & LayersToolNode;
    node.title = createToolTitle("Layers");
    const layerDefaults: Record<string, unknown> = {};
    for (let index = 0; index < LayersToolNode.MAX_LAYERS; index += 1) {
      const layer = index + 1;
      layerDefaults[`layer${layer}Mode`] = "normal";
      layerDefaults[`layer${layer}Alpha`] = 1;
      layerDefaults[`layer${layer}OffsetX`] = 0;
      layerDefaults[`layer${layer}OffsetY`] = 0;
      layerDefaults[`layer${layer}Scale`] = 1;
    }
    node.properties = {
      layerCount: 3,
      activeLayer: 1,
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
    node.addWidget(
      "combo",
      "Active layer",
      1,
      (value) => {
        node.properties.activeLayer = clamp(Math.round(Number(value)), 1, LayersToolNode.MAX_LAYERS);
        node.syncActiveLayerWidgets();
        node.setDirtyCanvas(true, true);
      },
      { values: Array.from({ length: LayersToolNode.MAX_LAYERS }).map((_, i) => i + 1) },
    );
    node.addWidget(
      "slider",
      "Offset X",
      0,
      (value) => {
        const active = node.getActiveLayerIndex();
        node.properties[`layer${active + 1}OffsetX`] = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -3000, max: 3000, step: 1 },
    );
    node.addWidget(
      "slider",
      "Offset Y",
      0,
      (value) => {
        const active = node.getActiveLayerIndex();
        node.properties[`layer${active + 1}OffsetY`] = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -3000, max: 3000, step: 1 },
    );
    node.addWidget(
      "slider",
      "Scale",
      1,
      (value) => {
        const active = node.getActiveLayerIndex();
        node.properties[`layer${active + 1}Scale`] = clamp(Number(value), 0.05, 8);
        notifyGraphStateChange(node);
      },
      { min: 0.05, max: 8, step: 0.01, precision: 2 },
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
    node.syncActiveLayerWidgets();
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
        offsetX: Number(this.properties[`layer${index + 1}OffsetX`] ?? 0).toFixed(2),
        offsetY: Number(this.properties[`layer${index + 1}OffsetY`] ?? 0).toFixed(2),
        scale: Number(this.properties[`layer${index + 1}Scale`] ?? 1).toFixed(4),
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
      this.layerRects = [];
      this.previewViewport = null;
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
    this.layerRects = Array.from({ length: layerCount }).map(() => null);

    for (let index = 0; index < layerCount; index += 1) {
      const image = layers[index];
      if (!image) {
        continue;
      }
      const mode = String(this.properties[`layer${index + 1}Mode`] ?? "normal") as BlendMode;
      const alpha = clamp(Number(this.properties[`layer${index + 1}Alpha`] ?? 1), 0, 1);
      const offsetX = this.getLayerOffsetX(index);
      const offsetY = this.getLayerOffsetY(index);
      const userScale = this.getLayerScale(index);
      const fitScale = Math.min(width / image.width, height / image.height);
      const finalScale = fitScale * userScale;
      const drawWidth = image.width * finalScale;
      const drawHeight = image.height * finalScale;
      const drawX = (width - drawWidth) * 0.5 + offsetX;
      const drawY = (height - drawHeight) * 0.5 + offsetY;
      this.layerRects[index] = {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      };
      context.save();
      context.globalCompositeOperation = blendModeToCompositeOperation[mode] ?? "source-over";
      context.globalAlpha = alpha;
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      context.restore();
    }

    this.preview = canvas;
    this.previewViewport = null;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & LayersToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    this.previewViewport = null;
    if (this.preview) {
      const ratio = Math.min(layout.previewWidth / this.preview.width, layout.previewHeight / this.preview.height);
      const width = this.preview.width * ratio;
      const height = this.preview.height * ratio;
      const x = layout.padding + (layout.previewWidth - width) * 0.5;
      const y = layout.previewTop + (layout.previewHeight - height) * 0.5;
      this.previewViewport = { x, y, width, height, ratio };

      const activeLayerIndex = this.getActiveLayerIndex();
      const activeRect = this.layerRects[activeLayerIndex];
      if (activeRect) {
        const rx = x + activeRect.x * ratio;
        const ry = y + activeRect.y * ratio;
        const rw = activeRect.width * ratio;
        const rh = activeRect.height * ratio;
        context.save();
        context.strokeStyle = "rgba(255, 198, 64, 0.95)";
        context.lineWidth = 1.5;
        context.strokeRect(rx, ry, rw, rh);
        context.fillStyle = "rgba(255, 198, 64, 0.95)";
        context.fillRect(rx + rw - 5, ry + rh - 5, 10, 10);
        context.restore();
      }
    }

    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const layerCount = clamp(Math.round(Number(this.properties.layerCount ?? 3)), 1, LayersToolNode.MAX_LAYERS);
    const activeLayer = this.getActiveLayerIndex() + 1;
    context.fillText(`layers:${layerCount} | active:L${activeLayer} drag=move resize=corner`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }

  onMouseDown(this: PreviewAwareNode & LayersToolNode, event: PointerEvent, pos?: [number, number]) {
    if (!this.preview || !this.previewViewport || !Array.isArray(pos)) {
      return false;
    }
    const self = this as unknown as { pos?: [number, number]; captureInput?: (enable: boolean) => void };
    const nodePos = self.pos ?? [0, 0];
    const localX = pos[0] - nodePos[0];
    const localY = pos[1] - nodePos[1];
    const viewport = this.previewViewport;
    if (
      localX < viewport.x ||
      localY < viewport.y ||
      localX > viewport.x + viewport.width ||
      localY > viewport.y + viewport.height
    ) {
      return false;
    }
    const activeLayerIndex = this.getActiveLayerIndex();
    const activeRect = this.layerRects[activeLayerIndex];
    if (!activeRect) {
      return false;
    }
    const ratio = viewport.ratio;
    const rx = viewport.x + activeRect.x * ratio;
    const ry = viewport.y + activeRect.y * ratio;
    const rw = activeRect.width * ratio;
    const rh = activeRect.height * ratio;
    const inRect = localX >= rx && localY >= ry && localX <= rx + rw && localY <= ry + rh;
    const handleSize = 8;
    const inHandle = localX >= rx + rw - handleSize && localY >= ry + rh - handleSize && localX <= rx + rw + handleSize && localY <= ry + rh + handleSize;
    if (!inRect && !inHandle) {
      return false;
    }
    this.dragState = {
      layerIndex: activeLayerIndex,
      mode: inHandle ? "scale" : "move",
      startLocalX: localX,
      startLocalY: localY,
      startOffsetX: this.getLayerOffsetX(activeLayerIndex),
      startOffsetY: this.getLayerOffsetY(activeLayerIndex),
      startScale: this.getLayerScale(activeLayerIndex),
    };
    self.captureInput?.(true);
    event.preventDefault();
    return true;
  }

  onMouseMove(this: PreviewAwareNode & LayersToolNode, event: PointerEvent, pos?: [number, number]) {
    if (!this.dragState || !this.previewViewport || !Array.isArray(pos)) {
      return false;
    }
    const self = this as unknown as { pos?: [number, number] };
    const nodePos = self.pos ?? [0, 0];
    const localX = pos[0] - nodePos[0];
    const localY = pos[1] - nodePos[1];
    const ratio = this.previewViewport.ratio;
    const dx = (localX - this.dragState.startLocalX) / Math.max(1e-6, ratio);
    const dy = (localY - this.dragState.startLocalY) / Math.max(1e-6, ratio);
    if (this.dragState.mode === "move") {
      this.setLayerTransform(
        this.dragState.layerIndex,
        this.dragState.startOffsetX + dx,
        this.dragState.startOffsetY + dy,
        this.dragState.startScale,
      );
    } else {
      const base = Math.max(24, (this.previewViewport.width + this.previewViewport.height) * 0.5);
      const delta = Math.max(dx, dy);
      const scale = clamp(this.dragState.startScale * (1 + delta / base), 0.05, 8);
      this.setLayerTransform(
        this.dragState.layerIndex,
        this.dragState.startOffsetX,
        this.dragState.startOffsetY,
        scale,
      );
    }
    this.syncActiveLayerWidgets();
    notifyGraphStateChange(this);
    event.preventDefault();
    return true;
  }

  onMouseUp(this: PreviewAwareNode & LayersToolNode) {
    if (!this.dragState) {
      return false;
    }
    const self = this as unknown as { captureInput?: (enable: boolean) => void };
    this.dragState = null;
    self.captureInput?.(false);
    return true;
  }
}
