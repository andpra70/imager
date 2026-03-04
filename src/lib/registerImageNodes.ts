import "../vendor/bluenoise.js";
import "../vendor/imagetracer.1.2.6.js";
import "../vendor/pnnquant.js";
import type { ImageTracerOptions } from "../vendor/imagetracer.1.2.6.js";
import type { PnnQuantOptions, PnnQuantResult } from "../vendor/pnnquant.js";
import { LiteGraph } from "litegraph.js";
import type { GraphImage } from "../models/graphImage";
import type { GraphPalette } from "../models/graphPalette";
import type { GraphSvg } from "../models/graphSvg";
import {
  blendGraphImages,
  type BlendMode,
  blurGraphImage,
  deserializeGraphImage,
  downloadGraphSvg,
  downloadGraphImage,
  drawImagePreview,
  drawSourceToCanvas,
  graphImageToUint32Array,
  grayscaleGraphImage,
  invertGraphImage,
  rasterizeGraphSvg,
  resizeNodeForPreview,
  serializeCompressedGraphImage,
  thresholdGraphImage,
  uint32ArrayToGraphImage,
} from "./imageUtils";

type LiteNode = {
  addInput: (name: string, type?: string) => void;
  addOutput: (name: string, type?: string) => void;
  addWidget: (
    type: string,
    name: string,
    value: unknown,
    callback?: (value: number | string | boolean) => void,
    options?: Record<string, unknown>,
  ) => void;
  getInputData: (slot: number) => GraphImage | null | undefined;
  setOutputData: (slot: number, data: unknown) => void;
  setDirtyCanvas: (foreground?: boolean, background?: boolean) => void;
  size: [number, number];
  title: string;
  properties: Record<string, unknown>;
  widgets?: unknown[];
  graph?: {
    onGraphStateChange?: () => void;
  };
  onSerialize?: (data: Record<string, unknown>) => void;
  onConfigure?: (data: Record<string, unknown>) => void;
};

type NodeCtor = new () => LiteNode;

interface PreviewAwareNode extends LiteNode {
  refreshPreviewLayout: () => void;
}

let registered = false;
interface ImageTracerApi {
  optionpresets: Record<string, ImageTracerOptions>;
  imagedataToSVG: (imageData: ImageData, options?: string | ImageTracerOptions) => string;
  checkoptions: (options?: string | ImageTracerOptions) => ImageTracerOptions;
}

interface PnnQuantInstance {
  getResult(): Promise<PnnQuantResult>;
}

interface PnnQuantConstructor {
  new (options: PnnQuantOptions): PnnQuantInstance;
}

interface BlueNoiseInstance {
  diffuse: (
    pixel: number,
    palettePixel: number,
    strength: number,
    x: number,
    y: number,
  ) => number;
}

interface BlueNoiseConstructor {
  new (options: { weight: number }): BlueNoiseInstance;
}

function getImageTracer() {
  const imageTracer = (globalThis as { ImageTracer?: ImageTracerApi }).ImageTracer;
  if (!imageTracer) {
    throw new Error("ImageTracer global is not available.");
  }

  return imageTracer;
}

function getPnnQuant() {
  const runtime = globalThis as {
    PnnQuant?: PnnQuantConstructor;
    TELL_BLUE_NOISE?: Int16Array;
    BlueNoise?: BlueNoiseConstructor;
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

function refreshNode(node: PreviewAwareNode, image: CanvasImageSource | null, footerLines = 0) {
  resizeNodeForPreview(node, image, { footerLines });
  node.setDirtyCanvas(true, true);
}

function createToolTitle(name: string) {
  return `TOOLS / ${name}`;
}

function notifyGraphStateChange(node: LiteNode) {
  node.graph?.onGraphStateChange?.();
}

function getGraphImageSignature(image: GraphImage | null) {
  if (!image) {
    return "none";
  }

  const context = image.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return `${image.width}x${image.height}:nocontent`;
  }

  const samplePoints = [
    [0, 0],
    [Math.floor(image.width / 2), Math.floor(image.height / 2)],
    [Math.max(0, image.width - 1), Math.max(0, image.height - 1)],
    [Math.floor(image.width / 3), Math.floor(image.height * 0.7)],
  ];

  const values = samplePoints
    .map(([x, y]) => {
      const pixel = context.getImageData(x, y, 1, 1).data;
      return `${pixel[0]}-${pixel[1]}-${pixel[2]}-${pixel[3]}`;
    })
    .join("|");

  return `${image.width}x${image.height}:${values}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function paletteBufferToHexColors(buffer: ArrayBuffer) {
  const palette = new Uint32Array(buffer);
  return Array.from(palette, (value) => {
    const r = value & 0xff;
    const g = (value >>> 8) & 0xff;
    const b = (value >>> 16) & 0xff;
    const a = (value >>> 24) & 0xff;
    return `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}${a
      .toString(16)
      .padStart(2, "0")}`;
  });
}

function drawPalettePreview(
  context: CanvasRenderingContext2D,
  node: PreviewAwareNode,
  palette: GraphPalette | null,
  footerText?: string,
) {
  const swatches = palette ?? [];
  const columns = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(Math.max(swatches.length, 1)))));
  const rows = Math.max(1, Math.ceil(Math.max(swatches.length, 1) / columns));
  const padding = 10;
  const headerHeight = 34 + (node.widgets?.length ?? 0) * 28;
  const swatchGap = 4;
  const swatchWidth = 30;
  const swatchHeight = 24;
  const previewWidth = columns * swatchWidth + (columns - 1) * swatchGap;
  const previewHeight = rows * swatchHeight + (rows - 1) * swatchGap;
  const footerLines = footerText ? 1 : 0;
  node.size = [
    previewWidth + padding * 2,
    headerHeight + previewHeight + padding * 2 + footerLines * 18,
  ];

  context.save();
  context.fillStyle = "#161616";
  context.fillRect(padding, headerHeight, previewWidth, previewHeight);

  if (!swatches.length) {
    context.fillStyle = "rgba(255,255,255,0.45)";
    context.font = "12px sans-serif";
    context.fillText("No palette", padding + 10, headerHeight + 20);
  } else {
    swatches.forEach((color, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (swatchWidth + swatchGap);
      const y = headerHeight + row * (swatchHeight + swatchGap);
      context.fillStyle = color;
      context.fillRect(x, y, swatchWidth, swatchHeight);
      context.strokeStyle = "rgba(255,255,255,0.18)";
      context.strokeRect(x + 0.5, y + 0.5, swatchWidth - 1, swatchHeight - 1);
    });
  }

  if (footerText) {
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(footerText, 10, headerHeight + previewHeight + padding + 12);
  }
  context.restore();
}

function downloadGraphPalette(palette: GraphPalette, filename: string) {
  const blob = new Blob([JSON.stringify(palette, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getSerializedImageFromConfig(data: Record<string, unknown>) {
  if (typeof data.serializedImage === "string") {
    return data.serializedImage;
  }

  const properties =
    data.properties && typeof data.properties === "object"
      ? (data.properties as Record<string, unknown>)
      : null;

  return typeof properties?.serializedImage === "string" ? properties.serializedImage : null;
}

class InputImageNode {
  image: GraphImage | null = null;
  fileInput!: HTMLInputElement;
  size: [number, number] = [280, 280];
  objectUrl: string | null = null;
  serializedImage: string | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & InputImageNode;
    node.title = "INPUT";
    node.properties = {};
    node.addOutput("image", "image");
    node.addWidget("button", "Load image", null, () => {
      node.fileInput.click();
    });

    node.fileInput = document.createElement("input");
    node.fileInput.type = "file";
    node.fileInput.accept = "image/*";
    node.fileInput.style.display = "none";
    node.fileInput.addEventListener("change", () => {
      const file = node.fileInput.files?.[0];
      if (!file) {
        return;
      }
      node.loadImageFile(file);
    });

    node.refreshPreviewLayout = () => {
      refreshNode(node, node.image);
    };

    document.body.appendChild(node.fileInput);
    node.refreshPreviewLayout();
  }

  loadImageFile(this: PreviewAwareNode & InputImageNode, file: File) {
    if (!file.type.startsWith("image/")) {
      return;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    this.objectUrl = objectUrl;
    image.onload = () => {
      this.image = drawSourceToCanvas(image);
      this.serializedImage = serializeCompressedGraphImage(this.image);
      this.refreshPreviewLayout();
      notifyGraphStateChange(this);
      URL.revokeObjectURL(objectUrl);
      if (this.objectUrl === objectUrl) {
        this.objectUrl = null;
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (this.objectUrl === objectUrl) {
        this.objectUrl = null;
      }
    };
    image.src = objectUrl;
  }

  onDropFile(this: PreviewAwareNode & InputImageNode, file: File) {
    this.loadImageFile(file);
  }

  onSerialize(this: InputImageNode, data: Record<string, unknown>) {
    data.serializedImage = this.image
      ? serializeCompressedGraphImage(this.image)
      : this.serializedImage;
  }

  onConfigure(this: PreviewAwareNode & InputImageNode, data: Record<string, unknown>) {
    const serializedImage = getSerializedImageFromConfig(data);
    this.serializedImage = serializedImage;

    if (!serializedImage) {
      this.image = null;
      this.refreshPreviewLayout();
      return;
    }

    void deserializeGraphImage(serializedImage)
      .then((image) => {
        this.image = image;
        this.serializedImage = serializedImage;
        this.refreshPreviewLayout();
        notifyGraphStateChange(this);
      })
      .catch(() => {
        this.image = null;
        this.serializedImage = null;
        this.refreshPreviewLayout();
      });
  }

  onExecute(this: LiteNode & InputImageNode) {
    this.setOutputData(0, this.image);
  }

  onDrawBackground(this: PreviewAwareNode & InputImageNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.image);
  }

  onRemoved(this: InputImageNode) {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.fileInput.remove();
  }
}

class WebcamImageNode {
  image: GraphImage | null = null;
  stream: MediaStream | null = null;
  video!: HTMLVideoElement;
  animationFrameId: number | null = null;
  size: [number, number] = [280, 300];
  serializedImage: string | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & WebcamImageNode;
    node.title = "WEBCAM";
    node.properties = { status: "requesting camera" };
    node.addOutput("image", "image");
    node.addWidget("button", "Grab", null, () => {
      if (node.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        node.image = drawSourceToCanvas(node.video);
        node.serializedImage = serializeCompressedGraphImage(node.image);
        node.properties.status = "frame captured";
        node.refreshPreviewLayout();
        notifyGraphStateChange(node);
      }
    });

    node.video = document.createElement("video");
    node.video.autoplay = true;
    node.video.muted = true;
    node.video.playsInline = true;
    node.video.addEventListener("loadedmetadata", () => {
      node.properties.status = "camera live";
      node.refreshPreviewLayout();
      node.startPreviewLoop();
    });
    node.video.addEventListener("playing", () => {
      node.properties.status = "camera live";
      node.startPreviewLoop();
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.video.readyState >= HTMLMediaElement.HAVE_METADATA ? node.video : null, 1);
    };
    void node.startCamera();
  }

  async startCamera(this: PreviewAwareNode & WebcamImageNode) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.properties.status = "camera live";
      this.refreshPreviewLayout();
    } catch {
      this.properties.status = "camera denied";
      this.refreshPreviewLayout();
    }
  }

  startPreviewLoop(this: PreviewAwareNode & WebcamImageNode) {
    if (this.animationFrameId !== null) {
      return;
    }

    const tick = () => {
      this.animationFrameId = window.requestAnimationFrame(tick);
      if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.setDirtyCanvas(true, true);
      }
    };

    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  onExecute(this: PreviewAwareNode & WebcamImageNode) {
    this.setOutputData(0, this.image);
  }

  onSerialize(this: WebcamImageNode, data: Record<string, unknown>) {
    data.serializedImage = this.image
      ? serializeCompressedGraphImage(this.image)
      : this.serializedImage;
  }

  onConfigure(this: PreviewAwareNode & WebcamImageNode, data: Record<string, unknown>) {
    const serializedImage = getSerializedImageFromConfig(data);
    this.serializedImage = serializedImage;

    if (!serializedImage) {
      this.image = null;
      this.refreshPreviewLayout();
      return;
    }

    void deserializeGraphImage(serializedImage)
      .then((image) => {
        this.image = image;
        this.serializedImage = serializedImage;
        this.properties.status = "frame restored";
        this.refreshPreviewLayout();
        notifyGraphStateChange(this);
      })
      .catch(() => {
        this.image = null;
        this.serializedImage = null;
        this.refreshPreviewLayout();
      });
  }

  onDrawBackground(this: PreviewAwareNode & WebcamImageNode, context: CanvasRenderingContext2D) {
    const liveSource =
      this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? this.video : null;
    const layout = drawImagePreview(context, this, liveSource, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(String(this.properties.status ?? ""), 10, layout.footerTop + 12);
    context.restore();
  }

  onRemoved(this: WebcamImageNode) {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}

class InvertToolNode {
  size: [number, number] = [280, 280];
  preview: GraphImage | null = null;

  constructor() {
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
    const input = this.getInputData(0);
    this.preview = input ? invertGraphImage(input) : null;
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & InvertToolNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.preview);
  }
}

class GrayscaleToolNode {
  size: [number, number] = [280, 280];
  preview: GraphImage | null = null;

  constructor() {
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
    const input = this.getInputData(0);
    this.preview = input ? grayscaleGraphImage(input) : null;
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GrayscaleToolNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.preview);
  }
}

class ThresholdToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
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
    const input = this.getInputData(0);
    const threshold = Number(this.properties.threshold ?? 128);
    this.preview = input ? thresholdGraphImage(input, threshold) : null;
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & ThresholdToolNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.preview);
  }
}

class BlurToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
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
    const input = this.getInputData(0);
    const radius = Number(this.properties.radius ?? 4);
    this.preview = input ? blurGraphImage(input, radius) : null;
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BlurToolNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.preview);
  }
}

class QuantizeToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;
  palette: GraphPalette | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  isRendering = false;

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
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.palette = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
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
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`palette: ${this.palette?.length ?? 0} colors`, 10, layout.footerTop + 12);
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

class BlendToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;

  constructor() {
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
    const baseImage = this.getInputData(0);
    const layerImage = this.getInputData(1);

    if (!baseImage) {
      this.preview = null;
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    if (!layerImage) {
      this.preview = baseImage;
      this.setOutputData(0, baseImage);
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
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BlendToolNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.preview);
  }
}

class VectorizeToolNode {
  size: [number, number] = [280, 540];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  properties!: Record<string, unknown>;
  isRendering = false;

  constructor() {
    const node = this as unknown as PreviewAwareNode & VectorizeToolNode;
    const imageTracer = getImageTracer();
    node.title = createToolTitle("Vectorize");
    node.properties = {
      preset: "default",
      ltres: 1,
      qtres: 1,
      pathomit: 8,
      rightangleenhance: true,
      colorsampling: 2,
      numberofcolors: 16,
      mincolorratio: 0,
      colorquantcycles: 3,
      layering: 0,
      strokewidth: 1,
      linefilter: false,
      roundcoords: 1,
      blurradius: 0,
      blurdelta: 20,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget(
      "combo",
      "Preset",
      "default",
      (value) => {
        const preset = String(value);
        node.properties.preset = preset;
        const presetOptions = imageTracer.checkoptions(preset);
        Object.assign(node.properties, presetOptions, { preset });
        notifyGraphStateChange(node);
      },
      {
        values: Object.keys(imageTracer.optionpresets),
      },
    );
    node.addWidget("slider", "Colors", 16, (value) => {
      node.properties.numberofcolors = Number(value);
      notifyGraphStateChange(node);
    }, { min: 2, max: 64, step: 1 });
    node.addWidget("slider", "Path omit", 8, (value) => {
      node.properties.pathomit = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 32, step: 1 });
    node.addWidget("slider", "Line thr", 1, (value) => {
      node.properties.ltres = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 10, step: 0.01, precision: 2 });
    node.addWidget("slider", "Quad thr", 1, (value) => {
      node.properties.qtres = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 10, step: 0.01, precision: 2 });
    node.addWidget("slider", "Color ratio", 0, (value) => {
      node.properties.mincolorratio = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Quant cycles", 3, (value) => {
      node.properties.colorquantcycles = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 10, step: 1 });
    node.addWidget("combo", "Sampling", 2, (value) => {
      node.properties.colorsampling = Number(value);
      notifyGraphStateChange(node);
    }, { values: [0, 1, 2] });
    node.addWidget("combo", "Layering", 0, (value) => {
      node.properties.layering = Number(value);
      notifyGraphStateChange(node);
    }, { values: [0, 1] });
    node.addWidget("slider", "Stroke", 1, (value) => {
      node.properties.strokewidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 0.1, precision: 1 });
    node.addWidget("slider", "Round", 1, (value) => {
      node.properties.roundcoords = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3, step: 1 });
    node.addWidget("slider", "Blur rad", 0, (value) => {
      node.properties.blurradius = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 1 });
    node.addWidget("slider", "Blur delta", 20, (value) => {
      node.properties.blurdelta = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 256, step: 1 });
    node.addWidget("toggle", "Right angle", true, (value) => {
      node.properties.rightangleenhance = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Line filter", false, (value) => {
      node.properties.linefilter = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  getVectorizeOptions(this: PreviewAwareNode & VectorizeToolNode): ImageTracerOptions {
    return {
      ltres: Number(this.properties.ltres ?? 1),
      qtres: Number(this.properties.qtres ?? 1),
      pathomit: Number(this.properties.pathomit ?? 8),
      rightangleenhance: Boolean(this.properties.rightangleenhance ?? true),
      colorsampling: Number(this.properties.colorsampling ?? 2),
      numberofcolors: clamp(Number(this.properties.numberofcolors ?? 16), 2, 64),
      mincolorratio: Number(this.properties.mincolorratio ?? 0),
      colorquantcycles: clamp(Number(this.properties.colorquantcycles ?? 3), 1, 10),
      layering: Number(this.properties.layering ?? 0),
      strokewidth: Number(this.properties.strokewidth ?? 1),
      linefilter: Boolean(this.properties.linefilter ?? false),
      roundcoords: Number(this.properties.roundcoords ?? 1),
      blurradius: Number(this.properties.blurradius ?? 0),
      blurdelta: Number(this.properties.blurdelta ?? 20),
    };
  }

  onExecute(this: PreviewAwareNode & VectorizeToolNode) {
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getVectorizeOptions();
    const optionsSignature = JSON.stringify(options);

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      this.isRendering = true;
      const context = input.getContext("2d", { willReadFrequently: true });
      if (context) {
        const imageData = context.getImageData(0, 0, input.width, input.height);
        const svg = getImageTracer().imagedataToSVG(imageData, options);
        this.svg = svg;

        const renderToken = ++this.renderToken;
        void rasterizeGraphSvg(svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.isRendering = false;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.svg = null;
            this.isRendering = false;
            this.lastSignature = "";
            this.lastOptionsSignature = "";
            this.setDirtyCanvas(true, true);
          });
      }
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & VectorizeToolNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.preview);
  }
}

class OutputImageNode {
  image: GraphImage | null = null;
  size: [number, number] = [320, 300];

  constructor() {
    const node = this as unknown as PreviewAwareNode & OutputImageNode;
    node.title = "OUTPUT";
    node.properties = {};
    node.addInput("image", "image");
    node.addWidget("button", "Save image", null, () => {
      if (node.image) {
        downloadGraphImage(node.image, "plotterfun-output.png");
      }
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.image);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OutputImageNode) {
    this.image = this.getInputData(0) ?? null;
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OutputImageNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.image);
  }
}

class OutputSvgNode {
  svg: GraphSvg | null = null;
  preview: GraphImage | null = null;
  lastSvg = "";
  renderToken = 0;
  size: [number, number] = [320, 340];

  constructor() {
    const node = this as unknown as PreviewAwareNode & OutputSvgNode;
    node.title = "SVG";
    node.properties = {};
    node.addInput("svg", "svg");
    node.addWidget("button", "Save SVG", null, () => {
      if (node.svg) {
        downloadGraphSvg(node.svg, "plotterfun-output.svg");
      }
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OutputSvgNode) {
    const svg = this.getInputData(0);
    this.svg = typeof svg === "string" ? svg : null;

    if (!this.svg) {
      this.preview = null;
      this.lastSvg = "";
      this.refreshPreviewLayout();
      return;
    }

    if (this.svg !== this.lastSvg) {
      this.lastSvg = this.svg;
      const renderToken = ++this.renderToken;
      void rasterizeGraphSvg(this.svg)
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview;
          this.setDirtyCanvas(true, true);
        })
        .catch(() => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = null;
          this.setDirtyCanvas(true, true);
        });
    }

    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OutputSvgNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.preview);
  }
}

class OutputPaletteNode {
  palette: GraphPalette | null = null;
  size: [number, number] = [320, 220];

  constructor() {
    const node = this as unknown as PreviewAwareNode & OutputPaletteNode;
    node.title = "PALETTE";
    node.properties = {};
    node.addInput("palette", "palette");
    node.addWidget("button", "Save palette", null, () => {
      if (node.palette?.length) {
        downloadGraphPalette(node.palette, "plotterfun-palette.json");
      }
    });
    node.refreshPreviewLayout = () => {
      node.setDirtyCanvas(true, true);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OutputPaletteNode) {
    const palette = this.getInputData(0);
    this.palette = Array.isArray(palette)
      ? palette.filter((item): item is string => typeof item === "string")
      : null;
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OutputPaletteNode, context: CanvasRenderingContext2D) {
    drawPalettePreview(context, this, this.palette, `${this.palette?.length ?? 0} colors`);
  }
}

export function registerImageNodes() {
  if (registered) {
    return;
  }

  LiteGraph.registerNodeType("input/image", InputImageNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("input/webcam", WebcamImageNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/invert", InvertToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/grayscale", GrayscaleToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/threshold", ThresholdToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/blur", BlurToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/quantize", QuantizeToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/blend", BlendToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/vectorize", VectorizeToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("output/image", OutputImageNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("output/palette", OutputPaletteNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("output/svg", OutputSvgNode as unknown as NodeCtor);
  registered = true;
}
