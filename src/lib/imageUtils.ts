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
