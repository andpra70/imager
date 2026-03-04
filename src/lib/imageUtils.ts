import type { GraphImage, GraphImageSize } from "../models/graphImage";
import type { GraphSvg } from "../models/graphSvg";
import { getPreviewWidth } from "./nodePreviewSettings";

interface PreviewNode {
  size: [number, number];
  widgets?: unknown[];
}

interface PreviewOptions {
  footerLines?: number;
}

interface PreviewLayout {
  padding: number;
  previewTop: number;
  previewWidth: number;
  previewHeight: number;
  footerTop: number;
}

const FALLBACK_IMAGE_SIZE: GraphImageSize = { width: 4, height: 3 };
const PREVIEW_PADDING = 10;
const HEADER_HEIGHT = 34;
const WIDGET_HEIGHT = 28;
const FOOTER_LINE_HEIGHT = 18;
const MIN_PREVIEW_HEIGHT = 120;

function createCanvas(size: GraphImageSize): GraphImage {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

function with2dContext<T>(canvas: GraphImage, action: (context: CanvasRenderingContext2D) => T): T {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }

  return action(context);
}

function createImageCanvas(size: GraphImageSize, action: (context: CanvasRenderingContext2D) => void) {
  const canvas = createCanvas(size);
  with2dContext(canvas, action);
  return canvas;
}

function applyPixelTransform(
  source: GraphImage,
  transform: (data: Uint8ClampedArray) => void,
): GraphImage {
  return createImageCanvas({ width: source.width, height: source.height }, (context) => {
    context.drawImage(source, 0, 0);
    const imageData = context.getImageData(0, 0, source.width, source.height);
    transform(imageData.data);
    context.putImageData(imageData, 0, 0);
  });
}

export function imageSizeFromSource(source: CanvasImageSource): GraphImageSize {
  if (source instanceof HTMLVideoElement) {
    return {
      width: source.videoWidth || source.clientWidth || 640,
      height: source.videoHeight || source.clientHeight || 480,
    };
  }

  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }

  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }

  if (source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }

  return { width: 640, height: 480 };
}

export function drawSourceToCanvas(source: CanvasImageSource): GraphImage {
  const size = imageSizeFromSource(source);
  return createImageCanvas(size, (context) => {
    context.drawImage(source, 0, 0, size.width, size.height);
  });
}

export function graphImageToUint32Array(source: GraphImage) {
  return with2dContext(source, (context) => {
    const imageData = context.getImageData(0, 0, source.width, source.height);
    return new Uint32Array(imageData.data.buffer.slice(0));
  });
}

export function uint32ArrayToGraphImage(
  pixels: Uint32Array,
  size: GraphImageSize,
) {
  return createImageCanvas(size, (context) => {
    const rgba = new Uint8ClampedArray(pixels.byteLength);
    rgba.set(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength));
    const imageData = new ImageData(
      rgba,
      size.width,
      size.height,
    );
    context.putImageData(imageData, 0, 0);
  });
}

export function cloneGraphImage(source: GraphImage): GraphImage {
  return drawSourceToCanvas(source);
}

export function invertGraphImage(source: GraphImage): GraphImage {
  return applyPixelTransform(source, (data) => {
    for (let index = 0; index < data.length; index += 4) {
      data[index] = 255 - data[index];
      data[index + 1] = 255 - data[index + 1];
      data[index + 2] = 255 - data[index + 2];
    }
  });
}

export function grayscaleGraphImage(source: GraphImage): GraphImage {
  return applyPixelTransform(source, (data) => {
    for (let index = 0; index < data.length; index += 4) {
      const luminance =
        0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      data[index] = luminance;
      data[index + 1] = luminance;
      data[index + 2] = luminance;
    }
  });
}

export function thresholdGraphImage(source: GraphImage, threshold: number): GraphImage {
  return applyPixelTransform(source, (data) => {
    for (let index = 0; index < data.length; index += 4) {
      const luminance =
        0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      const value = luminance >= threshold ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  });
}

export function blurGraphImage(source: GraphImage, radius: number): GraphImage {
  const size = { width: source.width, height: source.height };
  return createImageCanvas(size, (context) => {
    context.filter = `blur(${Math.max(0, radius)}px)`;
    context.drawImage(source, 0, 0, size.width, size.height);
    context.filter = "none";
  });
}

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "difference";

export interface BlendGraphImageOptions {
  alpha: number;
  mode: BlendMode;
  offsetX: number;
  offsetY: number;
  scale: number;
}

const blendModeToCompositeOperation: Record<BlendMode, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  difference: "difference",
};

export interface RgbSplitResult {
  r: GraphImage;
  g: GraphImage;
  b: GraphImage;
}

export interface CmykSplitResult {
  c: GraphImage;
  m: GraphImage;
  y: GraphImage;
  k: GraphImage;
}

export function combineRgbChannels(
  rImage: GraphImage,
  gImage: GraphImage,
  bImage: GraphImage,
): GraphImage {
  const width = Math.max(rImage.width, gImage.width, bImage.width);
  const height = Math.max(rImage.height, gImage.height, bImage.height);
  const rCanvas = createImageCanvas({ width, height }, (context) => {
    context.drawImage(rImage, 0, 0, width, height);
  });
  const gCanvas = createImageCanvas({ width, height }, (context) => {
    context.drawImage(gImage, 0, 0, width, height);
  });
  const bCanvas = createImageCanvas({ width, height }, (context) => {
    context.drawImage(bImage, 0, 0, width, height);
  });

  return createImageCanvas({ width, height }, (context) => {
    const rData = rCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, width, height);
    const gData = gCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, width, height);
    const bData = bCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, width, height);
    if (!rData || !gData || !bData) {
      return;
    }

    const out = context.createImageData(width, height);
    for (let index = 0; index < out.data.length; index += 4) {
      out.data[index] = rData.data[index];
      out.data[index + 1] = gData.data[index];
      out.data[index + 2] = bData.data[index];
      out.data[index + 3] = 255;
    }
    context.putImageData(out, 0, 0);
  });
}

export function combineCmykChannels(
  cImage: GraphImage,
  mImage: GraphImage,
  yImage: GraphImage,
  kImage: GraphImage,
): GraphImage {
  const width = Math.max(cImage.width, mImage.width, yImage.width, kImage.width);
  const height = Math.max(cImage.height, mImage.height, yImage.height, kImage.height);
  const cCanvas = createImageCanvas({ width, height }, (context) => {
    context.drawImage(cImage, 0, 0, width, height);
  });
  const mCanvas = createImageCanvas({ width, height }, (context) => {
    context.drawImage(mImage, 0, 0, width, height);
  });
  const yCanvas = createImageCanvas({ width, height }, (context) => {
    context.drawImage(yImage, 0, 0, width, height);
  });
  const kCanvas = createImageCanvas({ width, height }, (context) => {
    context.drawImage(kImage, 0, 0, width, height);
  });

  return createImageCanvas({ width, height }, (context) => {
    const cData = cCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, width, height);
    const mData = mCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, width, height);
    const yData = yCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, width, height);
    const kData = kCanvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, width, height);
    if (!cData || !mData || !yData || !kData) {
      return;
    }

    const out = context.createImageData(width, height);
    for (let index = 0; index < out.data.length; index += 4) {
      const c = 1 - cData.data[index] / 255;
      const m = 1 - mData.data[index] / 255;
      const y = 1 - yData.data[index] / 255;
      const k = 1 - kData.data[index] / 255;
      out.data[index] = clampByte((1 - c) * (1 - k) * 255);
      out.data[index + 1] = clampByte((1 - m) * (1 - k) * 255);
      out.data[index + 2] = clampByte((1 - y) * (1 - k) * 255);
      out.data[index + 3] = 255;
    }
    context.putImageData(out, 0, 0);
  });
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, value));
}

export function scaleGraphImage(source: GraphImage, scalePercent: number): GraphImage {
  const scale = Math.max(0.01, scalePercent / 100);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  return createImageCanvas({ width, height }, (context) => {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
  });
}

export function rotateGraphImage(source: GraphImage, angleDeg: number): GraphImage {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angleRad));
  const sin = Math.abs(Math.sin(angleRad));
  const width = Math.max(1, Math.round(source.width * cos + source.height * sin));
  const height = Math.max(1, Math.round(source.width * sin + source.height * cos));

  return createImageCanvas({ width, height }, (context) => {
    context.translate(width / 2, height / 2);
    context.rotate(angleRad);
    context.drawImage(source, -source.width / 2, -source.height / 2);
  });
}

export function brightnessContrastGraphImage(
  source: GraphImage,
  brightness: number,
  contrast: number,
  saturation: number,
): GraphImage {
  const brightnessOffset = (brightness / 100) * 255;
  const contrastValue = (contrast / 100) * 255;
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const saturationFactor = Math.max(0, 1 + saturation / 100);

  return applyPixelTransform(source, (data) => {
    for (let index = 0; index < data.length; index += 4) {
      const r = clampByte(contrastFactor * (data[index] - 128) + 128 + brightnessOffset);
      const g = clampByte(contrastFactor * (data[index + 1] - 128) + 128 + brightnessOffset);
      const b = clampByte(contrastFactor * (data[index + 2] - 128) + 128 + brightnessOffset);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      data[index] = clampByte(luminance + (r - luminance) * saturationFactor);
      data[index + 1] = clampByte(luminance + (g - luminance) * saturationFactor);
      data[index + 2] = clampByte(luminance + (b - luminance) * saturationFactor);
    }
  });
}

export function splitRgbChannels(source: GraphImage): RgbSplitResult {
  const r = createImageCanvas({ width: source.width, height: source.height }, (context) => {
    context.drawImage(source, 0, 0);
    const imageData = context.getImageData(0, 0, source.width, source.height);
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const channel = data[index];
      data[index] = channel;
      data[index + 1] = channel;
      data[index + 2] = channel;
    }
    context.putImageData(imageData, 0, 0);
  });

  const g = createImageCanvas({ width: source.width, height: source.height }, (context) => {
    context.drawImage(source, 0, 0);
    const imageData = context.getImageData(0, 0, source.width, source.height);
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const channel = data[index + 1];
      data[index] = channel;
      data[index + 1] = channel;
      data[index + 2] = channel;
    }
    context.putImageData(imageData, 0, 0);
  });

  const b = createImageCanvas({ width: source.width, height: source.height }, (context) => {
    context.drawImage(source, 0, 0);
    const imageData = context.getImageData(0, 0, source.width, source.height);
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const channel = data[index + 2];
      data[index] = channel;
      data[index + 1] = channel;
      data[index + 2] = channel;
    }
    context.putImageData(imageData, 0, 0);
  });

  return { r, g, b };
}

export function splitCmykChannels(source: GraphImage): CmykSplitResult {
  const c = createImageCanvas({ width: source.width, height: source.height }, () => undefined);
  const m = createImageCanvas({ width: source.width, height: source.height }, () => undefined);
  const y = createImageCanvas({ width: source.width, height: source.height }, () => undefined);
  const k = createImageCanvas({ width: source.width, height: source.height }, () => undefined);

  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  const cContext = c.getContext("2d", { willReadFrequently: true });
  const mContext = m.getContext("2d", { willReadFrequently: true });
  const yContext = y.getContext("2d", { willReadFrequently: true });
  const kContext = k.getContext("2d", { willReadFrequently: true });
  if (!sourceContext || !cContext || !mContext || !yContext || !kContext) {
    return { c, m, y, k };
  }

  const sourceData = sourceContext.getImageData(0, 0, source.width, source.height);
  const cData = new ImageData(source.width, source.height);
  const mData = new ImageData(source.width, source.height);
  const yData = new ImageData(source.width, source.height);
  const kData = new ImageData(source.width, source.height);

  for (let index = 0; index < sourceData.data.length; index += 4) {
    const r = sourceData.data[index] / 255;
    const g = sourceData.data[index + 1] / 255;
    const b = sourceData.data[index + 2] / 255;
    const alpha = sourceData.data[index + 3];

    const black = 1 - Math.max(r, g, b);
    const denom = Math.max(1e-6, 1 - black);
    const cyan = (1 - r - black) / denom;
    const magenta = (1 - g - black) / denom;
    const yellow = (1 - b - black) / denom;

    const cValue = clampByte((1 - Math.max(0, cyan)) * 255);
    const mValue = clampByte((1 - Math.max(0, magenta)) * 255);
    const yValue = clampByte((1 - Math.max(0, yellow)) * 255);
    const kValue = clampByte((1 - Math.max(0, black)) * 255);

    cData.data[index] = cValue;
    cData.data[index + 1] = cValue;
    cData.data[index + 2] = cValue;
    cData.data[index + 3] = alpha;

    mData.data[index] = mValue;
    mData.data[index + 1] = mValue;
    mData.data[index + 2] = mValue;
    mData.data[index + 3] = alpha;

    yData.data[index] = yValue;
    yData.data[index + 1] = yValue;
    yData.data[index + 2] = yValue;
    yData.data[index + 3] = alpha;

    kData.data[index] = kValue;
    kData.data[index + 1] = kValue;
    kData.data[index + 2] = kValue;
    kData.data[index + 3] = alpha;
  }

  cContext.putImageData(cData, 0, 0);
  mContext.putImageData(mData, 0, 0);
  yContext.putImageData(yData, 0, 0);
  kContext.putImageData(kData, 0, 0);

  return { c, m, y, k };
}

export function blendGraphImages(
  baseImage: GraphImage,
  layerImage: GraphImage,
  options: BlendGraphImageOptions,
): GraphImage {
  const width = baseImage.width;
  const height = baseImage.height;
  const alpha = Math.max(0, Math.min(1, options.alpha));
  const scale = Math.max(0.1, options.scale);
  const drawWidth = layerImage.width * scale;
  const drawHeight = layerImage.height * scale;

  return createImageCanvas({ width, height }, (context) => {
    context.drawImage(baseImage, 0, 0, width, height);
    context.save();
    context.globalAlpha = alpha;
    context.globalCompositeOperation = blendModeToCompositeOperation[options.mode];
    context.drawImage(layerImage, options.offsetX, options.offsetY, drawWidth, drawHeight);
    context.restore();
  });
}

export function downloadGraphImage(image: GraphImage, filename: string) {
  const link = document.createElement("a");
  link.href = image.toDataURL("image/png");
  link.download = filename;
  link.click();
}

export function serializeCompressedGraphImage(image: GraphImage) {
  const maxDimension = 640;
  const longestSide = Math.max(image.width, image.height);
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const compressedCanvas = createImageCanvas({ width, height }, (context) => {
    context.drawImage(image, 0, 0, width, height);
  });

  return compressedCanvas.toDataURL("image/webp", 0.68);
}

export function deserializeGraphImage(dataUrl: string) {
  return new Promise<GraphImage>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(drawSourceToCanvas(image));
    image.onerror = () => reject(new Error("Unable to decode serialized image."));
    image.src = dataUrl;
  });
}

export function downloadGraphSvg(svg: GraphSvg, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function rasterizeGraphSvg(svg: GraphSvg) {
  return new Promise<GraphImage>((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      try {
        resolve(drawSourceToCanvas(image));
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to rasterize SVG."));
    };

    image.src = url;
  });
}

function getPreviewAspectRatio(source: CanvasImageSource | null) {
  const size = source ? imageSizeFromSource(source) : FALLBACK_IMAGE_SIZE;
  if (size.width <= 0 || size.height <= 0) {
    return FALLBACK_IMAGE_SIZE.height / FALLBACK_IMAGE_SIZE.width;
  }

  return size.height / size.width;
}

export function resizeNodeForPreview(
  node: PreviewNode,
  source: CanvasImageSource | null,
  options: PreviewOptions = {},
): PreviewLayout {
  const previewWidth = getPreviewWidth();
  const footerLines = options.footerLines ?? 0;
  const widgetHeight = (node.widgets?.length ?? 0) * WIDGET_HEIGHT;
  const previewTop = HEADER_HEIGHT + widgetHeight;
  const previewHeight = Math.max(
    MIN_PREVIEW_HEIGHT,
    Math.round(previewWidth * getPreviewAspectRatio(source)),
  );
  const footerTop = previewTop + previewHeight + PREVIEW_PADDING;
  const nodeWidth = previewWidth + PREVIEW_PADDING * 2;
  const nodeHeight =
    footerTop +
    footerLines * FOOTER_LINE_HEIGHT +
    PREVIEW_PADDING;

  node.size = [nodeWidth, nodeHeight];

  return {
    padding: PREVIEW_PADDING,
    previewTop,
    previewWidth,
    previewHeight,
    footerTop,
  };
}

export function drawImagePreview(
  context: CanvasRenderingContext2D,
  node: PreviewNode,
  source: CanvasImageSource | null,
  options: PreviewOptions = {},
) {
  const layout = resizeNodeForPreview(node, source, options);

  context.save();
  context.fillStyle = "#161616";
  context.fillRect(
    layout.padding,
    layout.previewTop,
    layout.previewWidth,
    layout.previewHeight,
  );

  if (source) {
    const sourceSize = imageSizeFromSource(source);
    const ratio = Math.min(
      layout.previewWidth / sourceSize.width,
      layout.previewHeight / sourceSize.height,
    );
    const drawWidth = sourceSize.width * ratio;
    const drawHeight = sourceSize.height * ratio;
    const x = layout.padding + (layout.previewWidth - drawWidth) / 2;
    const y = layout.previewTop + (layout.previewHeight - drawHeight) / 2;
    context.drawImage(source, x, y, drawWidth, drawHeight);
  } else {
    context.fillStyle = "rgba(255,255,255,0.45)";
    context.font = "12px sans-serif";
    context.fillText("No image", layout.padding + 10, layout.previewTop + 20);
  }

  context.restore();
  return layout;
}
