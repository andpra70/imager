import "../../../../vendor/simplify.js";
import "../../../../vendor/c2.js";
import type { ImageTracerOptions } from "../../../../vendor/imagetracer.1.2.6.js";
import imagetracerRuntime, { type ImageTracerApi } from "../../../../vendor/imagetracer-runtime";
import roughRuntime, { type RoughPathOptions, type RoughApi } from "../../../../vendor/rough-runtime";
import marchingSquaresRuntime, { type MarchingSquaresFn } from "../../../../vendor/p5-marching-runtime";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { LiteNode, PreviewAwareNode } from "../../shared";
import {
  type BlendMode,
  drawImagePreview,
  drawSourceToCanvas,
  rasterizeGraphSvg,
  resizeNodeForPreview,
} from "../../../imageUtils";

interface RoughTransformResult {
  svg: GraphSvg;
  pathCount: number;
}

interface SimplifyPoint {
  x: number;
  y: number;
}

type SimplifyFn = (
  points: SimplifyPoint[],
  tolerance?: number,
  highestQuality?: boolean,
) => SimplifyPoint[];

interface SvgSimplifyResult {
  svg: GraphSvg;
  pathCount: number;
}

interface MarchingResult {
  svg: GraphSvg;
  pathCount: number;
  sampledWidth: number;
  sampledHeight: number;
}

interface C2PointLike {
  x: number;
  y: number;
}

interface C2LineLike {
  p1: C2PointLike;
  p2: C2PointLike;
}

interface C2DelaunayInstance {
  edges?: C2LineLike[];
  triangles?: Array<{ p1: C2PointLike; p2: C2PointLike; p3: C2PointLike }>;
  compute: (points: C2PointLike[]) => void;
}

interface C2DelaunayCtor {
  new (): C2DelaunayInstance;
}

interface C2PointCtor {
  new (x: number, y: number): C2PointLike;
}


export function getImageTracer() {
  if (!imagetracerRuntime || typeof imagetracerRuntime.imagedataToSVG !== "function") {
    throw new Error("ImageTracer runtime is not available.");
  }

  return imagetracerRuntime as ImageTracerApi;
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex
      .split("")
      .map((channel) => `${channel}${channel}`)
      .join("");
    return `#${expanded.toUpperCase()}`;
  }
  return "#ACE1AF";
}

function getRough() {
  if (!roughRuntime || typeof (roughRuntime as RoughApi).svg !== "function") {
    throw new Error("Rough global is not available.");
  }

  return roughRuntime as RoughApi;
}

function getSimplify() {
  const simplify = (globalThis as { simplify?: SimplifyFn }).simplify;
  if (!simplify) {
    throw new Error("simplify.js global is not available.");
  }

  return simplify;
}

export function getMarchingSquares() {
  if (!marchingSquaresRuntime || typeof (marchingSquaresRuntime as MarchingSquaresFn) !== "function") {
    throw new Error("p5.marching runtime is not available.");
  }

  return marchingSquaresRuntime as MarchingSquaresFn;
}

function getC2Runtime() {
  const runtime = globalThis as {
    c2?: {
      Point?: C2PointCtor;
      Delaunay?: C2DelaunayCtor;
    };
  };
  const pointCtor = runtime.c2?.Point;
  const delaunayCtor = runtime.c2?.Delaunay;
  if (!pointCtor || !delaunayCtor) {
    throw new Error("c2 Delaunay runtime is not available.");
  }
  return { PointCtor: pointCtor, DelaunayCtor: delaunayCtor };
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export function refreshNode(node: PreviewAwareNode, image: CanvasImageSource | null, footerLines = 0) {
  resizeNodeForPreview(node, image, { footerLines });
  node.setDirtyCanvas(true, true);
}

export function createToolTitle(name: string) {
  return `TOOLS / ${name}`;
}

export const blendModeToCompositeOperation: Record<BlendMode, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  difference: "difference",
};

export function notifyGraphStateChange(node: LiteNode) {
  node.graph?.onGraphStateChange?.();
}

export function getGraphImageSignature(image: GraphImage | null) {
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

export function isGraphImageReady(value: unknown): value is GraphImage {
  if (!(value instanceof HTMLCanvasElement)) {
    return false;
  }
  if (value.width <= 0 || value.height <= 0) {
    return false;
  }
  const context = value.getContext("2d");
  return Boolean(context);
}

function estimateGraphImageColorCount(image: GraphImage) {
  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const sampleWidth = Math.max(1, Math.round(image.width * scale));
  const sampleHeight = Math.max(1, Math.round(image.height * scale));

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) {
    return { count: 0, isEstimated: true };
  }

  sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const unique = new Set<number>();
  for (let index = 0; index < pixels.length; index += 4) {
    const packed =
      pixels[index] |
      (pixels[index + 1] << 8) |
      (pixels[index + 2] << 16) |
      (pixels[index + 3] << 24);
    unique.add(packed >>> 0);
  }

  return {
    count: unique.size,
    isEstimated: sampleWidth !== image.width || sampleHeight !== image.height,
  };
}

function formatGraphImageInfo(image: GraphImage | null) {
  if (!image) {
    return "no image";
  }

  const colorInfo = estimateGraphImageColorCount(image);
  return `${image.width}x${image.height} | ${colorInfo.isEstimated ? "~" : ""}${colorInfo.count} colors`;
}

export function formatExecutionInfo(executionMs: number | null) {
  if (executionMs === null || !Number.isFinite(executionMs)) {
    return "[-- ms]";
  }
  return `[${executionMs.toFixed(2)} ms]`;
}

export function formatImageErrorMetrics(mse: number | null, psnr: number | null) {
  if (mse === null || psnr === null || !Number.isFinite(mse) || !Number.isFinite(psnr)) {
    return "mse: -- | psnr: -- dB";
  }
  return `mse: ${mse.toFixed(1)} | psnr: ${psnr.toFixed(2)} dB`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function computeImageErrorMetrics(
  source: GraphImage | null,
  candidate: GraphImage | null,
  maxSampleSide = 256,
) {
  if (!source || !candidate) {
    return { mse: null, psnr: null } as { mse: number | null; psnr: number | null };
  }

  const width = Math.max(1, Math.min(source.width, candidate.width));
  const height = Math.max(1, Math.min(source.height, candidate.height));
  const scale = Math.min(1, maxSampleSide / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));

  const sourceSample = document.createElement("canvas");
  sourceSample.width = sampleWidth;
  sourceSample.height = sampleHeight;
  const sourceContext = sourceSample.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    return { mse: null, psnr: null };
  }
  sourceContext.drawImage(source, 0, 0, source.width, source.height, 0, 0, sampleWidth, sampleHeight);
  const sourcePixels = sourceContext.getImageData(0, 0, sampleWidth, sampleHeight).data;

  const candidateSample = document.createElement("canvas");
  candidateSample.width = sampleWidth;
  candidateSample.height = sampleHeight;
  const candidateContext = candidateSample.getContext("2d", { willReadFrequently: true });
  if (!candidateContext) {
    return { mse: null, psnr: null };
  }
  candidateContext.drawImage(
    candidate,
    0,
    0,
    candidate.width,
    candidate.height,
    0,
    0,
    sampleWidth,
    sampleHeight,
  );
  const candidatePixels = candidateContext.getImageData(0, 0, sampleWidth, sampleHeight).data;

  let squaredErrorSum = 0;
  let count = 0;
  for (let offset = 0; offset < sourcePixels.length; offset += 4) {
    const dr = sourcePixels[offset] - candidatePixels[offset];
    const dg = sourcePixels[offset + 1] - candidatePixels[offset + 1];
    const db = sourcePixels[offset + 2] - candidatePixels[offset + 2];
    squaredErrorSum += dr * dr + dg * dg + db * db;
    count += 3;
  }
  if (count <= 0) {
    return { mse: null, psnr: null };
  }
  const mse = squaredErrorSum / count;
  const psnr = mse <= 1e-8 ? 99 : 10 * Math.log10((255 * 255) / mse);
  return { mse, psnr };
}

export interface HistogramChannel {
  name: string;
  color: string;
  values: Uint32Array;
}

export type HistogramMode = "rgb" | "hsv" | "grayscale";
export type LevelsMode = "rgb" | "hsv" | "gray" | "alpha";
export type HalftoningMode = "ordered4x4" | "floydSteinberg" | "atkinson" | "density4x4";

export function rgbToHsv255(r: number, g: number, b: number) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rr) {
      hue = ((gg - bb) / delta) % 6;
    } else if (max === gg) {
      hue = (bb - rr) / delta + 2;
    } else {
      hue = (rr - gg) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  const saturation = max === 0 ? 0 : delta / max;
  const value = max;

  return {
    h: Math.round((hue / 360) * 255),
    s: Math.round(saturation * 255),
    v: Math.round(value * 255),
  };
}

export function hsv255ToRgb(h: number, s: number, v: number) {
  const hue = (clamp(h, 0, 255) / 255) * 360;
  const sat = clamp(s, 0, 255) / 255;
  const val = clamp(v, 0, 255) / 255;

  const chroma = val * sat;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const m = val - chroma;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;
  if (segment >= 0 && segment < 1) {
    rPrime = chroma;
    gPrime = x;
  } else if (segment < 2) {
    rPrime = x;
    gPrime = chroma;
  } else if (segment < 3) {
    gPrime = chroma;
    bPrime = x;
  } else if (segment < 4) {
    gPrime = x;
    bPrime = chroma;
  } else if (segment < 5) {
    rPrime = x;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = x;
  }

  return {
    r: clamp(Math.round((rPrime + m) * 255), 0, 255),
    g: clamp(Math.round((gPrime + m) * 255), 0, 255),
    b: clamp(Math.round((bPrime + m) * 255), 0, 255),
  };
}

export function applyLevelsValue(
  value: number,
  inBlack: number,
  inWhite: number,
  gamma: number,
  outBlack: number,
  outWhite: number,
) {
  const safeInBlack = clamp(Math.round(inBlack), 0, 254);
  const safeInWhite = clamp(Math.round(inWhite), safeInBlack + 1, 255);
  const safeGamma = clamp(gamma, 0.1, 5);
  const safeOutBlack = clamp(Math.round(outBlack), 0, 254);
  const safeOutWhite = clamp(Math.round(outWhite), safeOutBlack + 1, 255);

  const normalized = clamp((value - safeInBlack) / (safeInWhite - safeInBlack), 0, 1);
  const corrected = normalized ** (1 / safeGamma);
  return clamp(
    Math.round(safeOutBlack + corrected * (safeOutWhite - safeOutBlack)),
    0,
    255,
  );
}

export function buildHistogram(image: GraphImage, mode: HistogramMode) {
  const context = image.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return {
      channels: [] as HistogramChannel[],
      maxCount: 0,
      pixelCount: 0,
    };
  }

  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const h = new Uint32Array(256);
  const s = new Uint32Array(256);
  const v = new Uint32Array(256);
  const gray = new Uint32Array(256);

  let pixelCount = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha === 0) {
      continue;
    }
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    pixelCount += 1;

    r[red] += 1;
    g[green] += 1;
    b[blue] += 1;

    const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    gray[luminance] += 1;

    const hsv = rgbToHsv255(red, green, blue);
    h[hsv.h] += 1;
    s[hsv.s] += 1;
    v[hsv.v] += 1;
  }

  const channelsByMode: Record<HistogramMode, HistogramChannel[]> = {
    rgb: [
      { name: "R", color: "rgba(255, 80, 80, 0.92)", values: r },
      { name: "G", color: "rgba(76, 220, 120, 0.9)", values: g },
      { name: "B", color: "rgba(92, 150, 255, 0.9)", values: b },
    ],
    hsv: [
      { name: "H", color: "rgba(255, 176, 60, 0.92)", values: h },
      { name: "S", color: "rgba(70, 225, 224, 0.9)", values: s },
      { name: "V", color: "rgba(240, 240, 240, 0.88)", values: v },
    ],
    grayscale: [
      { name: "Y", color: "rgba(240, 240, 240, 0.95)", values: gray },
    ],
  };
  const channels = channelsByMode[mode];
  let maxCount = 0;
  channels.forEach((channel) => {
    for (let index = 0; index < channel.values.length; index += 1) {
      if (channel.values[index] > maxCount) {
        maxCount = channel.values[index];
      }
    }
  });

  return { channels, maxCount, pixelCount };
}

const BAYER_4X4_PATTERN = new Uint8Array([
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
]);

const DENSITY_PATTERN_ORDER_4X4 = new Uint8Array([10, 2, 8, 5, 15, 7, 13, 1, 11, 3, 9, 4, 6, 14, 12, 0]);
const DENSITY_PATTERN_RANK_4X4 = (() => {
  const ranks = new Uint8Array(16);
  for (let index = 0; index < DENSITY_PATTERN_ORDER_4X4.length; index += 1) {
    ranks[DENSITY_PATTERN_ORDER_4X4[index]] = index;
  }
  return ranks;
})();

export interface HalftoningOptions {
  mode: HalftoningMode;
  threshold: number;
  bias: number;
  densityScale: number;
  invert: boolean;
}

function buildLumaBuffer(imageData: ImageData) {
  const pixels = imageData.data;
  const luma = new Uint8Array(imageData.width * imageData.height);
  const alpha = new Uint8Array(imageData.width * imageData.height);
  for (let offset = 0, index = 0; offset < pixels.length; offset += 4, index += 1) {
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const a = pixels[offset + 3];
    luma[index] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    alpha[index] = a;
  }
  return { luma, alpha };
}

function writeBinaryPixel(pixels: Uint8ClampedArray, index: number, value: 0 | 255, alpha: number, invert: boolean) {
  const mono = invert ? (value === 255 ? 0 : 255) : value;
  pixels[index] = mono;
  pixels[index + 1] = mono;
  pixels[index + 2] = mono;
  pixels[index + 3] = alpha;
}

function halftoneOrdered4x4(width: number, height: number, luma: Uint8Array, alpha: Uint8Array, options: HalftoningOptions) {
  const threshold = clamp(Math.round(options.threshold), 0, 255);
  const bias = clamp(Math.round(options.bias), -255, 255);
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const a = alpha[pixelIndex];
      const outIndex = pixelIndex * 4;
      if (a === 0) {
        output[outIndex] = 0;
        output[outIndex + 1] = 0;
        output[outIndex + 2] = 0;
        output[outIndex + 3] = 0;
        continue;
      }
      const adjusted = clamp(luma[pixelIndex] + bias, 0, 255);
      const patternIndex = (y & 3) * 4 + (x & 3);
      const localThreshold = clamp(BAYER_4X4_PATTERN[patternIndex] * 16 + threshold - 127, 0, 255);
      const value: 0 | 255 = adjusted >= localThreshold ? 255 : 0;
      writeBinaryPixel(output, outIndex, value, a, options.invert);
    }
  }
  return new ImageData(output, width, height);
}

function halftoneFloydSteinberg(
  width: number,
  height: number,
  luma: Uint8Array,
  alpha: Uint8Array,
  options: HalftoningOptions,
) {
  const threshold = clamp(Math.round(options.threshold), 0, 255);
  const bias = clamp(Math.round(options.bias), -255, 255);
  const working = new Float32Array(width * height);
  for (let index = 0; index < working.length; index += 1) {
    working[index] = clamp(luma[index] + bias, 0, 255);
  }

  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const direction = y % 2 === 0 ? 1 : -1;
    const startX = direction > 0 ? 0 : width - 1;
    const endX = direction > 0 ? width : -1;
    for (let x = startX; x !== endX; x += direction) {
      const pixelIndex = y * width + x;
      const a = alpha[pixelIndex];
      const outIndex = pixelIndex * 4;
      if (a === 0) {
        output[outIndex] = 0;
        output[outIndex + 1] = 0;
        output[outIndex + 2] = 0;
        output[outIndex + 3] = 0;
        continue;
      }

      const current = clamp(Math.round(working[pixelIndex]), 0, 255);
      const quantized: 0 | 255 = current >= threshold ? 255 : 0;
      const error = current - quantized;
      writeBinaryPixel(output, outIndex, quantized, a, options.invert);

      const rightX = x + direction;
      const leftX = x - direction;
      if (rightX >= 0 && rightX < width) {
        working[pixelIndex + direction] += (error * 7) / 16;
      }
      if (y + 1 < height) {
        working[pixelIndex + width] += (error * 5) / 16;
        if (leftX >= 0 && leftX < width) {
          working[pixelIndex + width - direction] += (error * 3) / 16;
        }
        if (rightX >= 0 && rightX < width) {
          working[pixelIndex + width + direction] += error / 16;
        }
      }
    }
  }
  return new ImageData(output, width, height);
}

function halftoneAtkinson(width: number, height: number, luma: Uint8Array, alpha: Uint8Array, options: HalftoningOptions) {
  const threshold = clamp(Math.round(options.threshold), 0, 255);
  const bias = clamp(Math.round(options.bias), -255, 255);
  const working = new Float32Array(width * height);
  for (let index = 0; index < working.length; index += 1) {
    working[index] = clamp(luma[index] + bias, 0, 255);
  }

  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const a = alpha[pixelIndex];
      const outIndex = pixelIndex * 4;
      if (a === 0) {
        output[outIndex] = 0;
        output[outIndex + 1] = 0;
        output[outIndex + 2] = 0;
        output[outIndex + 3] = 0;
        continue;
      }

      const current = clamp(Math.round(working[pixelIndex]), 0, 255);
      const quantized: 0 | 255 = current >= threshold ? 255 : 0;
      const error = (current - quantized) / 8;
      writeBinaryPixel(output, outIndex, quantized, a, options.invert);

      if (x + 1 < width) {
        working[pixelIndex + 1] += error;
      }
      if (x + 2 < width) {
        working[pixelIndex + 2] += error;
      }
      if (y + 1 < height) {
        if (x - 1 >= 0) {
          working[pixelIndex + width - 1] += error;
        }
        working[pixelIndex + width] += error;
        if (x + 1 < width) {
          working[pixelIndex + width + 1] += error;
        }
      }
      if (y + 2 < height) {
        working[pixelIndex + width * 2] += error;
      }
    }
  }
  return new ImageData(output, width, height);
}

function halftoneDensity4x4(width: number, height: number, luma: Uint8Array, alpha: Uint8Array, options: HalftoningOptions) {
  const threshold = clamp(Math.round(options.threshold), 0, 255);
  const bias = clamp(Math.round(options.bias), -255, 255);
  const scale = clamp(Math.round(options.densityScale), 2, 8);
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const a = alpha[pixelIndex];
      if (a === 0) {
        continue;
      }

      const adjusted = clamp(luma[pixelIndex] + bias + (threshold - 127), 0, 255);
      const fillCount = clamp(Math.round((adjusted / 255) * 16), 0, 16);

      for (let py = 0; py < scale; py += 1) {
        for (let px = 0; px < scale; px += 1) {
          const patternX = Math.floor((px / scale) * 4);
          const patternY = Math.floor((py / scale) * 4);
          const patternIndex = patternY * 4 + patternX;
          const value: 0 | 255 = DENSITY_PATTERN_RANK_4X4[patternIndex] < fillCount ? 255 : 0;
          const outPixel = ((y * scale + py) * outputWidth + (x * scale + px)) * 4;
          writeBinaryPixel(output, outPixel, value, 255, options.invert);
        }
      }
    }
  }
  return new ImageData(output, outputWidth, outputHeight);
}

export function halftoneGraphImage(source: GraphImage, options: HalftoningOptions) {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, source.width, source.height);
  const { luma, alpha } = buildLumaBuffer(imageData);

  const mode = options.mode;
  const outputData =
    mode === "floydSteinberg"
      ? halftoneFloydSteinberg(source.width, source.height, luma, alpha, options)
      : mode === "atkinson"
        ? halftoneAtkinson(source.width, source.height, luma, alpha, options)
        : mode === "density4x4"
          ? halftoneDensity4x4(source.width, source.height, luma, alpha, options)
          : halftoneOrdered4x4(source.width, source.height, luma, alpha, options);

  const output = document.createElement("canvas");
  output.width = outputData.width;
  output.height = outputData.height;
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("2D context not available.");
  }
  outputContext.putImageData(outputData, 0, 0);
  return output;
}

function shouldReuseCachedToolResult(
  executionMs: number | null,
  lastSignature: string,
  lastOptionsSignature: string,
  currentSignature: string,
  currentOptionsSignature: string,
) {
  return (
    executionMs !== null &&
    executionMs > 100 &&
    lastSignature === currentSignature &&
    lastOptionsSignature === currentOptionsSignature
  );
}

export class OptimizedToolNode {
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";

  protected resetOptimizedCache() {
    this.lastSignature = "";
    this.lastOptionsSignature = "";
  }

  protected canReuseOptimizedResult(currentSignature: string, currentOptionsSignature: string) {
    return shouldReuseCachedToolResult(
      this.executionMs,
      this.lastSignature,
      this.lastOptionsSignature,
      currentSignature,
      currentOptionsSignature,
    );
  }

  protected completeOptimizedExecution(
    startedAt: number,
    currentSignature?: string,
    currentOptionsSignature?: string,
  ) {
    this.executionMs = performance.now() - startedAt;
    if (currentSignature !== undefined && currentOptionsSignature !== undefined) {
      this.lastSignature = currentSignature;
      this.lastOptionsSignature = currentOptionsSignature;
    }
  }
}

export function oilPaintGraphImage(source: GraphImage, radius: number, intensityLevels: number) {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }

  const width = source.width;
  const height = source.height;
  const sourceImageData = context.getImageData(0, 0, width, height);
  const sourcePixels = sourceImageData.data;
  const levels = clamp(Math.round(intensityLevels), 2, 64);
  const safeRadius = clamp(Math.round(radius), 1, 24);
  const intensityLut = new Uint8Array(width * height);

  for (let index = 0, pixel = 0; index < sourcePixels.length; index += 4, pixel += 1) {
    const avg = (sourcePixels[index] + sourcePixels[index + 1] + sourcePixels[index + 2]) / 3;
    intensityLut[pixel] = Math.round((avg * (levels - 1)) / 255);
  }

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("2D context not available.");
  }

  const destinationImageData = outputContext.createImageData(width, height);
  const destinationPixels = destinationImageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const countByLevel = new Uint32Array(levels);
      const rByLevel = new Uint32Array(levels);
      const gByLevel = new Uint32Array(levels);
      const bByLevel = new Uint32Array(levels);

      const minY = Math.max(0, y - safeRadius);
      const maxY = Math.min(height - 1, y + safeRadius);
      const minX = Math.max(0, x - safeRadius);
      const maxX = Math.min(width - 1, x + safeRadius);

      for (let yy = minY; yy <= maxY; yy += 1) {
        for (let xx = minX; xx <= maxX; xx += 1) {
          const pixelIndex = yy * width + xx;
          const level = intensityLut[pixelIndex];
          const sourceIndex = pixelIndex * 4;
          countByLevel[level] += 1;
          rByLevel[level] += sourcePixels[sourceIndex];
          gByLevel[level] += sourcePixels[sourceIndex + 1];
          bByLevel[level] += sourcePixels[sourceIndex + 2];
        }
      }

      let selectedLevel = 0;
      let selectedCount = 0;
      for (let level = 0; level < levels; level += 1) {
        if (countByLevel[level] > selectedCount) {
          selectedLevel = level;
          selectedCount = countByLevel[level];
        }
      }

      const destinationIndex = (y * width + x) * 4;
      const divisor = Math.max(1, selectedCount);
      destinationPixels[destinationIndex] = Math.round(rByLevel[selectedLevel] / divisor);
      destinationPixels[destinationIndex + 1] = Math.round(gByLevel[selectedLevel] / divisor);
      destinationPixels[destinationIndex + 2] = Math.round(bByLevel[selectedLevel] / divisor);
      destinationPixels[destinationIndex + 3] = 255;
    }
  }

  outputContext.putImageData(destinationImageData, 0, 0);
  return output;
}

export function convolveImage3x3(source: GraphImage, kernel: number[], divisor = 1, bias = 0) {
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }

  const width = source.width;
  const height = source.height;
  const sourceImage = sourceContext.getImageData(0, 0, width, height);
  const sourcePixels = sourceImage.data;
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("2D context not available.");
  }
  const destinationImage = outputContext.createImageData(width, height);
  const destinationPixels = destinationImage.data;

  const safeDivisor = divisor === 0 ? 1 : divisor;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        const yy = clamp(y + ky, 0, height - 1);
        for (let kx = -1; kx <= 1; kx += 1) {
          const xx = clamp(x + kx, 0, width - 1);
          const kernelWeight = kernel[(ky + 1) * 3 + (kx + 1)];
          const sourceIndex = (yy * width + xx) * 4;
          sumR += sourcePixels[sourceIndex] * kernelWeight;
          sumG += sourcePixels[sourceIndex + 1] * kernelWeight;
          sumB += sourcePixels[sourceIndex + 2] * kernelWeight;
        }
      }

      const destinationIndex = (y * width + x) * 4;
      destinationPixels[destinationIndex] = clamp(Math.round(sumR / safeDivisor + bias), 0, 255);
      destinationPixels[destinationIndex + 1] = clamp(Math.round(sumG / safeDivisor + bias), 0, 255);
      destinationPixels[destinationIndex + 2] = clamp(Math.round(sumB / safeDivisor + bias), 0, 255);
      destinationPixels[destinationIndex + 3] = sourcePixels[destinationIndex + 3];
    }
  }

  outputContext.putImageData(destinationImage, 0, 0);
  return output;
}

export function sobelGraphImage(
  source: GraphImage,
  options: { mode: "magnitude" | "horizontal" | "vertical" | "threshold"; threshold: number; invert: boolean; strength: number },
) {
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }

  const width = source.width;
  const height = source.height;
  const sourceImage = sourceContext.getImageData(0, 0, width, height);
  const sourcePixels = sourceImage.data;
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("2D context not available.");
  }
  const destinationImage = outputContext.createImageData(width, height);
  const destinationPixels = destinationImage.data;

  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const threshold = clamp(Math.round(options.threshold), 0, 255);
  const strength = clamp(options.strength, 0.5, 6);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        const yy = clamp(y + ky, 0, height - 1);
        for (let kx = -1; kx <= 1; kx += 1) {
          const xx = clamp(x + kx, 0, width - 1);
          const sourceIndex = (yy * width + xx) * 4;
          const luminance =
            0.2126 * sourcePixels[sourceIndex] +
            0.7152 * sourcePixels[sourceIndex + 1] +
            0.0722 * sourcePixels[sourceIndex + 2];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          gx += luminance * kernelX[kernelIndex];
          gy += luminance * kernelY[kernelIndex];
        }
      }

      let edgeValue = 0;
      if (options.mode === "horizontal") {
        edgeValue = Math.abs(gx);
      } else if (options.mode === "vertical") {
        edgeValue = Math.abs(gy);
      } else {
        edgeValue = Math.hypot(gx, gy);
      }
      edgeValue = clamp(edgeValue * (strength / 4), 0, 255);
      if (options.mode === "threshold") {
        edgeValue = edgeValue >= threshold ? 255 : 0;
      }
      if (options.invert) {
        edgeValue = 255 - edgeValue;
      }

      const destinationIndex = (y * width + x) * 4;
      const gray = clamp(Math.round(edgeValue), 0, 255);
      destinationPixels[destinationIndex] = gray;
      destinationPixels[destinationIndex + 1] = gray;
      destinationPixels[destinationIndex + 2] = gray;
      destinationPixels[destinationIndex + 3] = sourcePixels[destinationIndex + 3];
    }
  }

  outputContext.putImageData(destinationImage, 0, 0);
  return output;
}

function parseSvgLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseSvgRoot(svg: GraphSvg): SVGSVGElement | null {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() === "parsererror") {
    return null;
  }

  if (root.tagName.toLowerCase() === "svg") {
    return root as unknown as SVGSVGElement;
  }

  return document.querySelector("svg") as SVGSVGElement | null;
}

function parsePaintFromStyle(style: string | null, property: "fill" | "stroke") {
  if (!style) {
    return null;
  }

  const match = style.match(new RegExp(`${property}\\s*:\\s*([^;]+)`, "i"));
  return match?.[1]?.trim() ?? null;
}

function getSvgPaint(path: SVGPathElement, property: "fill" | "stroke") {
  const attrValue = path.getAttribute(property);
  if (attrValue) {
    return attrValue;
  }

  return parsePaintFromStyle(path.getAttribute("style"), property);
}

function roundWithPrecision(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundNumbersInString(value: string, precision: number) {
  return value.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (match) => {
    const parsed = Number(match);
    if (!Number.isFinite(parsed)) {
      return match;
    }
    const rounded = roundWithPrecision(parsed, precision);
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  });
}

function buildPolylinePath(points: SimplifyPoint[], precision: number, closed: boolean) {
  if (!points.length) {
    return "";
  }

  const toCoord = (value: number) => {
    const rounded = roundWithPrecision(value, precision);
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };
  const commands = points.map((point, index) => {
    const x = toCoord(point.x);
    const y = toCoord(point.y);
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  });
  if (closed) {
    commands.push("Z");
  }
  return commands.join(" ");
}

function simplifyPathD(
  pathData: string,
  simplify: SimplifyFn,
  options: { tolerance: number; sampleStep: number; highQuality: boolean; precision: number },
) {
  const pathTokenCount = pathData.match(/[Mm]/g)?.length ?? 0;
  if (pathTokenCount > 1) {
    return roundNumbersInString(pathData, options.precision).replace(/\s+/g, " ").trim();
  }

  const parserDocument = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
  const parserPath = parserDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  parserPath.setAttribute("d", pathData);
  parserDocument.documentElement.appendChild(parserPath);

  let length = 0;
  try {
    length = parserPath.getTotalLength();
  } catch {
    return roundNumbersInString(pathData, options.precision).replace(/\s+/g, " ").trim();
  }

  if (!Number.isFinite(length) || length <= 0) {
    return roundNumbersInString(pathData, options.precision).replace(/\s+/g, " ").trim();
  }

  const sampleCount = Math.max(10, Math.ceil(length / Math.max(0.25, options.sampleStep)));
  const points: SimplifyPoint[] = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const point = parserPath.getPointAtLength((length * index) / sampleCount);
    points.push({ x: point.x, y: point.y });
  }

  const deduped: SimplifyPoint[] = [];
  points.forEach((point) => {
    const last = deduped[deduped.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      deduped.push(point);
    }
  });

  const simplified = simplify(
    deduped,
    Math.max(0, options.tolerance),
    options.highQuality,
  );
  if (simplified.length < 2) {
    return roundNumbersInString(pathData, options.precision).replace(/\s+/g, " ").trim();
  }

  const closed = /[zZ]\s*$/.test(pathData.trim());
  const normalized = [...simplified];
  if (closed && normalized.length > 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first.x === last.x && first.y === last.y) {
      normalized.pop();
    }
  }

  return buildPolylinePath(normalized, options.precision, closed);
}

export function simplifyGraphSvg(
  inputSvg: GraphSvg,
  options: {
    tolerance: number;
    sampleStep: number;
    precision: number;
    highQuality: boolean;
    minify: boolean;
  },
): SvgSimplifyResult {
  const inputRoot = parseSvgRoot(inputSvg);
  if (!inputRoot) {
    throw new Error("Invalid SVG input.");
  }

  const outputRoot = inputRoot.cloneNode(true) as SVGSVGElement;
  const simplify = getSimplify();
  let pathCount = 0;

  Array.from(outputRoot.querySelectorAll("path")).forEach((path) => {
    const current = path.getAttribute("d");
    if (!current) {
      return;
    }

    const simplified = simplifyPathD(current, simplify, options);
    if (simplified) {
      path.setAttribute("d", simplified);
      pathCount += 1;
    }
  });

  if (options.minify) {
    const numericAttributes = [
      "d",
      "points",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "width",
      "height",
      "viewBox",
      "transform",
      "stroke-width",
      "stroke-dasharray",
      "stroke-dashoffset",
      "opacity",
      "fill-opacity",
      "stroke-opacity",
    ];
    outputRoot.querySelectorAll("*").forEach((element) => {
      numericAttributes.forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (!value) {
          return;
        }
        element.setAttribute(
          attribute,
          roundNumbersInString(value, options.precision).replace(/\s+/g, " ").trim(),
        );
      });
    });
  }

  const svg = new XMLSerializer()
    .serializeToString(outputRoot)
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { svg, pathCount };
}

export function roughenGraphSvg(
  inputSvg: GraphSvg,
  options: RoughPathOptions & {
    preserveStroke: boolean;
    preserveFill: boolean;
    fallbackStroke: string;
    fallbackFill: string;
  },
): RoughTransformResult {
  const inputRoot = parseSvgRoot(inputSvg);
  if (!inputRoot) {
    throw new Error("Invalid SVG input.");
  }

  const outputDocument = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
  const outputRoot = outputDocument.documentElement as unknown as SVGSVGElement;
  outputRoot.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const viewBox = inputRoot.getAttribute("viewBox");
  const width = parseSvgLength(inputRoot.getAttribute("width"));
  const height = parseSvgLength(inputRoot.getAttribute("height"));
  if (viewBox) {
    outputRoot.setAttribute("viewBox", viewBox);
  } else if (width && height) {
    outputRoot.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  if (width) {
    outputRoot.setAttribute("width", String(width));
  }
  if (height) {
    outputRoot.setAttribute("height", String(height));
  }

  const roughSvg = getRough().svg(outputRoot);
  const sourcePaths = Array.from(inputRoot.querySelectorAll("path"));
  let pathCount = 0;

  sourcePaths.forEach((sourcePath) => {
    const d = sourcePath.getAttribute("d");
    if (!d) {
      return;
    }

    const stroke = options.preserveStroke
      ? (getSvgPaint(sourcePath, "stroke") ?? options.fallbackStroke)
      : options.fallbackStroke;
    const fill = options.preserveFill
      ? (getSvgPaint(sourcePath, "fill") ?? options.fallbackFill)
      : options.fallbackFill;

    const roughPath = roughSvg.path(d, {
      roughness: options.roughness,
      bowing: options.bowing,
      strokeWidth: options.strokeWidth,
      fillStyle: options.fillStyle,
      hachureAngle: options.hachureAngle,
      hachureGap: options.hachureGap,
      fillWeight: options.fillWeight,
      simplification: options.simplification,
      curveStepCount: options.curveStepCount,
      maxRandomnessOffset: options.maxRandomnessOffset,
      seed: options.seed,
      disableMultiStroke: options.disableMultiStroke,
      stroke,
      fill,
    });

    const transform = sourcePath.getAttribute("transform");
    if (transform) {
      roughPath.setAttribute("transform", transform);
    }

    outputRoot.appendChild(roughPath);
    pathCount += 1;
  });

  if (!pathCount) {
    throw new Error("No SVG paths available for rough transform.");
  }

  return {
    svg: new XMLSerializer().serializeToString(outputRoot),
    pathCount,
  };
}

function segmentEndpointKey(point: SimplifyPoint) {
  return `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
}

function stitchMarchingSegments(
  segments: number[][],
  scale: number,
): SimplifyPoint[][] {
  if (!segments.length) {
    return [];
  }

  const normalized = segments.map((segment) => {
    const a: SimplifyPoint = { x: segment[0] * scale, y: segment[1] * scale };
    const b: SimplifyPoint = { x: segment[2] * scale, y: segment[3] * scale };
    return { a, b };
  });

  const endpointMap = new Map<string, Set<number>>();
  normalized.forEach((segment, index) => {
    [segmentEndpointKey(segment.a), segmentEndpointKey(segment.b)].forEach((key) => {
      const current = endpointMap.get(key) ?? new Set<number>();
      current.add(index);
      endpointMap.set(key, current);
    });
  });

  const used = new Set<number>();
  const polylines: SimplifyPoint[][] = [];

  const grow = (
    polyline: SimplifyPoint[],
    atHead: boolean,
  ) => {
    while (true) {
      const pivot = atHead ? polyline[0] : polyline[polyline.length - 1];
      const pivotKey = segmentEndpointKey(pivot);
      const candidates = endpointMap.get(pivotKey);
      if (!candidates) {
        break;
      }

      let nextIndex: number | null = null;
      candidates.forEach((candidate) => {
        if (nextIndex !== null || used.has(candidate)) {
          return;
        }
        nextIndex = candidate;
      });

      if (nextIndex === null) {
        break;
      }

      used.add(nextIndex);
      const segment = normalized[nextIndex];
      const keyA = segmentEndpointKey(segment.a);
      const nextPoint = keyA === pivotKey ? segment.b : segment.a;
      if (atHead) {
        polyline.unshift(nextPoint);
      } else {
        polyline.push(nextPoint);
      }
    }
  };

  normalized.forEach((segment, index) => {
    if (used.has(index)) {
      return;
    }

    used.add(index);
    const polyline = [segment.a, segment.b];
    grow(polyline, false);
    grow(polyline, true);
    polylines.push(polyline);
  });

  return polylines.filter((polyline) => polyline.length >= 2);
}

function toHexColorChannel(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

interface BoldiniGradientMap {
  magnitudes: Float32Array;
  directions: Float32Array;
}

export function getAverageColorFromImageData(imageData: ImageData) {
  const data = imageData.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] <= 0) {
      continue;
    }
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  }
  if (count === 0) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

export function toGrayscaleImageData(imageData: ImageData) {
  const source = imageData.data;
  const gray = new Uint8ClampedArray(source.length);
  for (let index = 0; index < source.length; index += 4) {
    const luminosity = 0.299 * source[index] + 0.587 * source[index + 1] + 0.114 * source[index + 2];
    gray[index] = luminosity;
    gray[index + 1] = luminosity;
    gray[index + 2] = luminosity;
    gray[index + 3] = source[index + 3];
  }
  return new ImageData(gray, imageData.width, imageData.height);
}

export function sobelOperatorFromGrayscale(imageData: ImageData): BoldiniGradientMap {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const magnitudes = new Float32Array(width * height);
  const directions = new Float32Array(width * height);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sumX = 0;
      let sumY = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const sampleIndex = ((y + ky) * width + (x + kx)) * 4;
          const value = data[sampleIndex];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          sumX += value * gx[kernelIndex];
          sumY += value * gy[kernelIndex];
        }
      }
      const targetIndex = y * width + x;
      magnitudes[targetIndex] = Math.min(1, Math.sqrt(sumX * sumX + sumY * sumY) / 1140);
      directions[targetIndex] = Math.atan2(sumY, sumX);
    }
  }

  return { magnitudes, directions };
}

function createGaussianKernel(radius: number) {
  const size = radius * 2 + 1;
  const kernel = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const sigma = Math.max(0.0001, radius / 2);
  const sigma2 = 2 * sigma * sigma;
  let sum = 0;

  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      const value = Math.exp(-(distance * distance) / sigma2) / (Math.PI * sigma2);
      kernel[y + radius][x + radius] = value;
      sum += value;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      kernel[y][x] /= sum;
    }
  }

  return kernel;
}

export function gaussianBlurImageData(imageData: ImageData, radius: number) {
  const width = imageData.width;
  const height = imageData.height;
  const source = imageData.data;
  const output = new Uint8ClampedArray(source.length);
  const kernel = createGaussianKernel(radius);
  const side = radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weightSum = 0;
      for (let ky = -side; ky <= side; ky += 1) {
        for (let kx = -side; kx <= side; kx += 1) {
          const sampleX = clamp(x + kx, 0, width - 1);
          const sampleY = clamp(y + ky, 0, height - 1);
          const sourceIndex = (sampleY * width + sampleX) * 4;
          const weight = kernel[ky + side][kx + side];
          r += source[sourceIndex] * weight;
          g += source[sourceIndex + 1] * weight;
          b += source[sourceIndex + 2] * weight;
          a += source[sourceIndex + 3] * weight;
          weightSum += weight;
        }
      }
      const outputIndex = (y * width + x) * 4;
      output[outputIndex] = r / weightSum;
      output[outputIndex + 1] = g / weightSum;
      output[outputIndex + 2] = b / weightSum;
      output[outputIndex + 3] = a / weightSum;
    }
  }

  return new ImageData(output, width, height);
}

function drawBoldiniSimpleStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string,
) {
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(0, 0, size, size / 3, 0, 0, Math.PI * 2);
  context.fill();
}

function drawBoldiniCurvedStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string,
) {
  const length = size * 1.5;
  const curveAmount = (Math.random() - 0.5) * 0.8;
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, size / 4);
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x, y);
  const endX = x + Math.cos(angle) * length;
  const endY = y + Math.sin(angle) * length;
  const cpX = x + Math.cos(angle + curveAmount) * length * 0.5;
  const cpY = y + Math.sin(angle + curveAmount) * length * 0.5;
  context.quadraticCurveTo(cpX, cpY, endX, endY);
  context.stroke();
}

function drawSargentStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string,
) {
  const width = size;
  const height = size / (Math.random() * 2 + 1.5);
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = color;
  context.beginPath();
  context.rect(-width * 0.5, -height * 0.5, width, height);
  context.fill();
}

export async function renderSargentLayer(options: {
  context: CanvasRenderingContext2D;
  numStrokes: number;
  minSize: number;
  maxSize: number;
  colorSource: ImageData;
  gradientMap: BoldiniGradientMap;
  opacity: number;
  sharpen?: boolean;
  colorJitter?: number;
  brightnessBoost?: number;
  shouldCancel?: () => boolean;
  onProgress?: (progress: number) => void;
}) {
  const {
    context,
    numStrokes,
    minSize,
    maxSize,
    colorSource,
    gradientMap,
    opacity,
    sharpen = false,
    colorJitter = 0,
    brightnessBoost = 0,
    shouldCancel,
    onProgress,
  } = options;
  const width = context.canvas.width;
  const height = context.canvas.height;
  const data = colorSource.data;

  for (let strokeIndex = 0; strokeIndex < numStrokes; strokeIndex += 1) {
    if (shouldCancel?.()) {
      return false;
    }

    let x = 0;
    let y = 0;
    if (sharpen) {
      do {
        x = Math.floor(Math.random() * width);
        y = Math.floor(Math.random() * height);
      } while (Math.random() > gradientMap.magnitudes[y * width + x]);
    } else {
      x = Math.floor(Math.random() * width);
      y = Math.floor(Math.random() * height);
    }

    const pixelIndex = (y * width + x) * 4;
    let r = data[pixelIndex];
    let g = data[pixelIndex + 1];
    let b = data[pixelIndex + 2];

    if (colorJitter > 0) {
      r += (Math.random() - 0.5) * colorJitter;
      g += (Math.random() - 0.5) * colorJitter;
      b += (Math.random() - 0.5) * colorJitter;
    }
    if (brightnessBoost > 0) {
      r += brightnessBoost;
      g += brightnessBoost;
      b += brightnessBoost;
    }

    r = clamp(r, 0, 255);
    g = clamp(g, 0, 255);
    b = clamp(b, 0, 255);

    const color = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    const size = Math.random() * (maxSize - minSize) + minSize;
    const angle = gradientMap.directions[y * width + x];
    context.save();
    context.globalAlpha = opacity * (Math.random() * 0.4 + 0.6);
    drawSargentStroke(context, x, y, size, angle, color);
    context.restore();

    if (strokeIndex % 100 === 0) {
      onProgress?.(strokeIndex / numStrokes);
      await yieldToUi();
    }
  }

  onProgress?.(1);
  return true;
}

export async function renderBoldiniLayer(options: {
  context: CanvasRenderingContext2D;
  numStrokes: number;
  minSize: number;
  maxSize: number;
  colorSource: ImageData;
  gradientMap: BoldiniGradientMap;
  opacity: number;
  useCurve?: boolean;
  sharpen?: boolean;
  colorJitter?: number;
  shouldCancel?: () => boolean;
  onProgress?: (progress: number) => void;
}) {
  const {
    context,
    numStrokes,
    minSize,
    maxSize,
    colorSource,
    gradientMap,
    opacity,
    useCurve = false,
    sharpen = false,
    colorJitter = 0,
    shouldCancel,
    onProgress,
  } = options;
  const width = context.canvas.width;
  const height = context.canvas.height;
  const data = colorSource.data;

  for (let strokeIndex = 0; strokeIndex < numStrokes; strokeIndex += 1) {
    if (shouldCancel?.()) {
      return false;
    }

    let x = 0;
    let y = 0;
    if (sharpen) {
      do {
        x = Math.floor(Math.random() * width);
        y = Math.floor(Math.random() * height);
      } while (Math.random() > gradientMap.magnitudes[y * width + x]);
    } else {
      x = Math.floor(Math.random() * width);
      y = Math.floor(Math.random() * height);
    }

    const pixelIndex = (y * width + x) * 4;
    let r = data[pixelIndex];
    let g = data[pixelIndex + 1];
    let b = data[pixelIndex + 2];
    if (colorJitter > 0) {
      r = clamp(r + (Math.random() - 0.5) * colorJitter, 0, 255);
      g = clamp(g + (Math.random() - 0.5) * colorJitter, 0, 255);
      b = clamp(b + (Math.random() - 0.5) * colorJitter, 0, 255);
    }
    const color = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    const size = Math.random() * (maxSize - minSize) + minSize;
    const angle = gradientMap.directions[y * width + x] + Math.PI / 2;
    context.save();
    context.globalAlpha = opacity * (Math.random() * 0.5 + 0.5);
    if (useCurve) {
      drawBoldiniCurvedStroke(context, x, y, size, angle, color);
    } else {
      drawBoldiniSimpleStroke(context, x, y, size, angle, color);
    }
    context.restore();

    if (strokeIndex % 100 === 0) {
      onProgress?.(strokeIndex / numStrokes);
      await yieldToUi();
    }
  }

  onProgress?.(1);
  return true;
}

export function fitSourceToSquareCanvas(input: GraphImage, side: number) {
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const ratio = Math.min(side / input.width, side / input.height);
  const drawWidth = input.width * ratio;
  const drawHeight = input.height * ratio;
  const offsetX = (side - drawWidth) * 0.5;
  const offsetY = (side - drawHeight) * 0.5;
  context.clearRect(0, 0, side, side);
  context.drawImage(input, 0, 0, input.width, input.height, offsetX, offsetY, drawWidth, drawHeight);
  return canvas;
}

export function fitSourceToMaxWidthCanvas(input: GraphImage, maxWidth: number) {
  const safeMaxWidth = Math.max(1, Math.round(maxWidth));
  const scale = Math.min(1, safeMaxWidth / input.width);
  const width = Math.max(1, Math.round(input.width * scale));
  const height = Math.max(1, Math.round(input.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  context.clearRect(0, 0, width, height);
  context.drawImage(input, 0, 0, input.width, input.height, 0, 0, width, height);
  return canvas;
}

export function createGrayMapFromImageData(imageData: ImageData) {
  const grayMap = new Uint8Array(imageData.width * imageData.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    grayMap[index / 4] = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  }
  return grayMap;
}

function drawCarbonHumanStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  angleDeg: number,
  baseAlpha: number,
  lineWidth: number,
) {
  const radians = angleDeg * (Math.PI / 180);
  const x1 = x;
  const y1 = y;
  const x2 = x1 + Math.cos(radians) * length;
  const y2 = y1 + Math.sin(radians) * length;
  const gradient = context.createLinearGradient(x1, y1, x2, y2);
  gradient.addColorStop(0, `rgba(0,0,0,${baseAlpha * (0.4 + Math.random() * 0.4)})`);
  gradient.addColorStop(0.5, `rgba(0,0,0,${baseAlpha * (0.8 + Math.random() * 0.4)})`);
  gradient.addColorStop(1, `rgba(0,0,0,${baseAlpha * (0.3 + Math.random() * 0.4)})`);
  context.strokeStyle = gradient;
  context.lineWidth = Math.max(0.5, lineWidth * (0.8 + Math.random() * 0.4));
  const midX = (x1 + x2) * 0.5;
  const midY = (y1 + y2) * 0.5;
  const curveStrength = length * 0.15;
  const cpX = midX + (Math.random() - 0.5) * curveStrength;
  const cpY = midY + (Math.random() - 0.5) * curveStrength;
  context.beginPath();
  context.moveTo(x1, y1);
  context.quadraticCurveTo(cpX, cpY, x2, y2);
  context.stroke();
}

function drawCarbonScumble(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  baseAlpha: number,
  maxLineWidth: number,
) {
  const numPoints = 10 + Math.random() * 15;
  for (let index = 0; index < numPoints; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    context.fillStyle = `rgba(0,0,0,${baseAlpha * (0.5 + Math.random() * 0.5)})`;
    context.fillRect(
      px,
      py,
      Math.max(1, maxLineWidth * Math.random()),
      Math.max(1, maxLineWidth * Math.random()),
    );
  }
}

export async function renderCarbonLayer(options: {
  context: CanvasRenderingContext2D;
  passName: string;
  numStrokes: number;
  brightnessThreshold: number;
  angle: number | "random";
  angleJitter: number;
  scumbleChance: number;
  getStrokeLength: (gray: number) => number;
  getStrokeWidth: (gray: number) => number;
  getAlpha: (gray: number) => number;
  grayMap: Uint8Array;
  width: number;
  height: number;
  upscaleFactor: number;
  alphaFactor: number;
  progressState: { drawn: number; total: number };
  shouldCancel?: () => boolean;
  onProgress?: (progress: number, status: string) => void;
}) {
  const {
    context,
    passName,
    numStrokes,
    brightnessThreshold,
    angle,
    angleJitter,
    scumbleChance,
    getStrokeLength,
    getStrokeWidth,
    getAlpha,
    grayMap,
    width,
    height,
    upscaleFactor,
    alphaFactor,
    progressState,
    shouldCancel,
    onProgress,
  } = options;
  const HIGHLIGHT_THRESHOLD = 245;
  const UPDATE_INTERVAL = 3000;
  const totalStrokes = Math.max(1, Math.round(numStrokes));

  for (let index = 0; index < totalStrokes; index += 1) {
    if (shouldCancel?.()) {
      return false;
    }

    const x = Math.random() * width;
    const y = Math.random() * height;
    const mapIndex = Math.floor(y) * width + Math.floor(x);
    const grayValue = grayMap[mapIndex];
    progressState.drawn += 1;

    if (grayValue <= HIGHLIGHT_THRESHOLD && grayValue <= brightnessThreshold) {
      const baseAlpha = getAlpha(grayValue) * alphaFactor;
      const finalLength = getStrokeLength(grayValue) * upscaleFactor;
      const finalWidth = getStrokeWidth(grayValue) * upscaleFactor;
      if (Math.random() < scumbleChance) {
        drawCarbonScumble(
          context,
          x * upscaleFactor,
          y * upscaleFactor,
          finalLength * 0.5,
          baseAlpha,
          finalWidth,
        );
      } else {
        const strokeAngle =
          angle === "random"
            ? Math.random() * 180
            : angle + (Math.random() - 0.5) * angleJitter;
        drawCarbonHumanStroke(
          context,
          x * upscaleFactor,
          y * upscaleFactor,
          finalLength,
          strokeAngle,
          baseAlpha,
          finalWidth,
        );
      }
    }

    if (index % UPDATE_INTERVAL === 0) {
      const progress = progressState.total > 0 ? progressState.drawn / progressState.total : 0;
      onProgress?.(progress, `passata: ${passName}`);
      await yieldToUi();
    }
  }

  const progress = progressState.total > 0 ? progressState.drawn / progressState.total : 1;
  onProgress?.(progress, `passata: ${passName}`);
  return true;
}

interface CrosshatchBnResult {
  svg: GraphSvg;
  lineCount: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}

interface MatitaPoint {
  x: number;
  y: number;
}

interface MatitaQuantizedData {
  map: Uint8Array;
  width: number;
  height: number;
}

interface MatitaResult {
  svg: GraphSvg;
  pathCount: number;
  width: number;
  height: number;
}

interface LinefyLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

interface LinefyResult {
  svg: GraphSvg;
  preview: GraphImage;
  lineCount: number;
  width: number;
  height: number;
}

interface Linefy2Result {
  svg: GraphSvg;
  preview: GraphImage;
  lineCount: number;
  width: number;
  height: number;
}

interface SketchResult {
  svg: GraphSvg;
  preview: GraphImage;
  pathCount: number;
  iterations: number;
  finalError: number;
  stopReason: "line_limit" | "min_error" | "stalled" | "darkness_cleared";
  width: number;
  height: number;
}

interface BicPencilResult {
  svg: GraphSvg;
  preview: GraphImage;
  pointCount: number;
  pathLength: number;
  mse: number;
  generations: number;
  stopReason: "max_generations" | "target_error" | "stalled";
  width: number;
  height: number;
}

interface AsciifyResult {
  svg: GraphSvg;
  preview: GraphImage;
  text: string;
  rowCount: number;
  colCount: number;
  width: number;
  height: number;
}

interface Oil2Result {
  svg: GraphSvg;
  preview: GraphImage;
  strokeCount: number;
  pathCount: number;
  width: number;
  height: number;
}

interface Oil3Result {
  svg: GraphSvg;
  preview: GraphImage;
  strokeCount: number;
  pathCount: number;
  width: number;
  height: number;
}

interface LineFieldResult {
  svg: GraphSvg;
  preview: GraphImage;
  lineCount: number;
  pointCount: number;
  width: number;
  height: number;
}

interface DotsResult {
  svg: GraphSvg;
  preview: GraphImage;
  dotCount: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
}

interface DelanoyResult {
  svg: GraphSvg;
  preview: GraphImage;
  edgeCount: number;
  pointCount: number;
  triangleCount: number;
  width: number;
  height: number;
}

interface Delanoy2Result {
  svg: GraphSvg;
  preview: GraphImage;
  circleCount: number;
  pointCount: number;
  triangleCount: number;
  width: number;
  height: number;
}

function clipInfiniteLineToRect(
  anchorX: number,
  anchorY: number,
  dx: number,
  dy: number,
  width: number,
  height: number,
) {
  const eps = 1e-8;
  let tMin = Number.NEGATIVE_INFINITY;
  let tMax = Number.POSITIVE_INFINITY;

  if (Math.abs(dx) < eps) {
    if (anchorX < 0 || anchorX > width - 1) {
      return null;
    }
  } else {
    const tx1 = (0 - anchorX) / dx;
    const tx2 = (width - 1 - anchorX) / dx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }

  if (Math.abs(dy) < eps) {
    if (anchorY < 0 || anchorY > height - 1) {
      return null;
    }
  } else {
    const ty1 = (0 - anchorY) / dy;
    const ty2 = (height - 1 - anchorY) / dy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  }

  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin > tMax) {
    return null;
  }

  const x1 = clamp(Math.round(anchorX + tMin * dx), 0, width - 1);
  const y1 = clamp(Math.round(anchorY + tMin * dy), 0, height - 1);
  const x2 = clamp(Math.round(anchorX + tMax * dx), 0, width - 1);
  const y2 = clamp(Math.round(anchorY + tMax * dy), 0, height - 1);
  if (x1 === x2 && y1 === y2) {
    return null;
  }
  return { x1, y1, x2, y2 };
}

function walkLineBresenham(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
  visitor: (pixelIndex: number) => void,
) {
  let x = x1;
  let y = y1;
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      visitor(y * width + x);
    }
    if (x === x2 && y === y2) {
      break;
    }
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export async function generateLinefySvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    colorMode: "grayscale" | "color";
    mixing: "additive" | "subtractive";
    numLines: number;
    lineStep: number;
    testLines: number;
    anchorSamples: number;
    lineWidth: number;
    seed: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<LinefyResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const pixelCount = width * height;
  const rng = createSeededRandom(options.seed);
  const lineStep = clamp(Math.round(options.lineStep), 1, 255);
  const totalLines = clamp(Math.round(options.numLines), 1, 12000);
  const testLines = clamp(Math.round(options.testLines), 4, 4096);
  const anchorSamples = clamp(Math.round(options.anchorSamples), 32, 65536);

  const channels =
    options.colorMode === "color"
      ? ["r", "g", "b"] as const
      : ["gray"] as const;

  type ChannelId = (typeof channels)[number];
  const residualByChannel: Record<ChannelId, Float32Array> = channels.reduce((acc, channel) => {
    acc[channel] = new Float32Array(pixelCount);
    return acc;
  }, {} as Record<ChannelId, Float32Array>);
  const linesByChannel: Record<ChannelId, LinefyLine[]> = channels.reduce((acc, channel) => {
    acc[channel] = [];
    return acc;
  }, {} as Record<ChannelId, LinefyLine[]>);
  const totals: Record<ChannelId, number> = channels.reduce((acc, channel) => {
    acc[channel] = 0;
    return acc;
  }, {} as Record<ChannelId, number>);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    if (options.colorMode === "color") {
      const rr = options.mixing === "subtractive" ? 255 - r : r;
      const gg = options.mixing === "subtractive" ? 255 - g : g;
      const bb = options.mixing === "subtractive" ? 255 - b : b;
      residualByChannel.r[index] = rr;
      residualByChannel.g[index] = gg;
      residualByChannel.b[index] = bb;
      totals.r += rr;
      totals.g += gg;
      totals.b += bb;
    } else {
      const gray = Math.round(0.21 * r + 0.72 * g + 0.07 * b);
      const value = options.mixing === "subtractive" ? 255 - gray : gray;
      residualByChannel.gray[index] = value;
      totals.gray += value;
    }
  }

  const totalEnergy = channels.reduce((acc, channel) => acc + totals[channel], 0);
  const lineBudgetByChannel: Record<ChannelId, number> = channels.reduce((acc, channel, index) => {
    const ratio = totalEnergy > 0 ? totals[channel] / totalEnergy : 1 / channels.length;
    const proposed = Math.max(1, Math.round(totalLines * ratio));
    acc[channel] = proposed;
    if (index === channels.length - 1) {
      const current = channels.reduce((sum, c) => sum + acc[c], 0);
      acc[channel] += totalLines - current;
    }
    return acc;
  }, {} as Record<ChannelId, number>);

  let processedLines = 0;
  const totalBudget = Math.max(1, channels.reduce((acc, channel) => acc + lineBudgetByChannel[channel], 0));
  const previewEveryLines = Math.max(20, Math.floor(totalBudget / 40));
  let lastYieldTime = performance.now();

  const strokeColors: Record<ChannelId, string> = channels.reduce((acc, channel) => {
    if (channel === "gray") {
      acc[channel] = options.mixing === "additive" ? "#FFFFFF" : "#000000";
      return acc;
    }
    if (options.mixing === "subtractive") {
      acc.r = "#00FFFF";
      acc.g = "#FF00FF";
      acc.b = "#FFFF00";
    } else {
      acc.r = "#FF0000";
      acc.g = "#00FF00";
      acc.b = "#0000FF";
    }
    return acc;
  }, {} as Record<ChannelId, string>);
  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  previewContext.fillStyle = options.mixing === "additive" ? "#000000" : "#FFFFFF";
  previewContext.fillRect(0, 0, width, height);
  previewContext.lineWidth = Math.max(0.1, options.lineWidth);
  previewContext.lineCap = "round";
  previewContext.globalAlpha = 1;

  for (let c = 0; c < channels.length; c += 1) {
    const channel = channels[c];
    const residual = residualByChannel[channel];
    const budget = lineBudgetByChannel[channel];
    const outLines = linesByChannel[channel];

    for (let lineIndex = 0; lineIndex < budget; lineIndex += 1) {
      if (shouldCancel?.()) {
        return null;
      }

      let bestAnchorIndex = 0;
      let bestAnchorValue = -1;
      for (let sample = 0; sample < anchorSamples; sample += 1) {
        const idx = Math.floor(rng() * pixelCount);
        const value = residual[idx];
        if (value > bestAnchorValue) {
          bestAnchorValue = value;
          bestAnchorIndex = idx;
        }
      }
      if (bestAnchorValue <= 0.5) {
        processedLines += budget - lineIndex;
        break;
      }

      const anchorX = bestAnchorIndex % width;
      const anchorY = Math.floor(bestAnchorIndex / width);
      let bestLine: LinefyLine | null = null;
      let bestLineScore = -1;
      let bestLineDelta = lineStep;

      for (let test = 0; test < testLines; test += 1) {
        const angle = rng() * Math.PI;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const clipped = clipInfiniteLineToRect(anchorX, anchorY, dx, dy, width, height);
        if (!clipped) {
          continue;
        }
        const candidate: LinefyLine = { ...clipped, alpha: 1 };
        const evaluated = evaluateLineCandidateFromResidual(
          residual,
          width,
          height,
          candidate,
          lineStep,
          32,
        );
        if (evaluated.score > bestLineScore) {
          bestLineScore = evaluated.score;
          bestLine = candidate;
          bestLineDelta = evaluated.adaptiveDelta;
        }
      }

      if (!bestLine) {
        processedLines += 1;
        continue;
      }

      walkLineBresenham(bestLine.x1, bestLine.y1, bestLine.x2, bestLine.y2, width, height, (pixelIndex) => {
        residual[pixelIndex] = Math.max(0, residual[pixelIndex] - bestLineDelta);
      });
      bestLine.alpha = clamp(bestLineDelta / 255, 0.01, 1);
      outLines.push(bestLine);
      previewContext.strokeStyle = strokeColors[channel];
      previewContext.globalAlpha = bestLine.alpha;
      previewContext.beginPath();
      previewContext.moveTo(bestLine.x1 + 0.5, bestLine.y1 + 0.5);
      previewContext.lineTo(bestLine.x2 + 0.5, bestLine.y2 + 0.5);
      previewContext.stroke();
      processedLines += 1;

      const progress = processedLines / totalBudget;
      onProgress?.(progress, `line ${processedLines}/${totalBudget}`);
      if (processedLines % previewEveryLines === 0 || processedLines === totalBudget) {
        onPreview?.(preview);
      }
      if (performance.now() - lastYieldTime > 12) {
        await yieldToUi();
        lastYieldTime = performance.now();
      }
    }
  }

  const svgGroups: string[] = [];
  channels.forEach((channel) => {
    const lines = linesByChannel[channel];
    const color = strokeColors[channel];
    if (!lines.length) {
      return;
    }
    let group = `<g stroke="${color}" stroke-width="${Math.max(0.1, options.lineWidth)}" stroke-linecap="round">`;
    lines.forEach((line) => {
      group += `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke-opacity="${line.alpha.toFixed(4)}"/>`;
    });
    group += "</g>";
    svgGroups.push(group);
  });

  const lineCount = channels.reduce((acc, channel) => acc + linesByChannel[channel].length, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${options.mixing === "additive" ? "#000000" : "#FFFFFF"}"/>${svgGroups.join("")}</svg>`;
  return { svg, preview, lineCount, width, height };
}

function evaluateLineCandidateFromResidual(
  residual: Float32Array,
  width: number,
  height: number,
  line: LinefyLine,
  maxDelta: number,
  samples: number,
) {
  const safeSamples = clamp(Math.round(samples), 4, 256);
  let score = 0;
  let avgResidual = 0;
  let count = 0;
  for (let i = 0; i < safeSamples; i += 1) {
    const t = safeSamples <= 1 ? 0.5 : i / (safeSamples - 1);
    const x = clamp(Math.round(line.x1 + (line.x2 - line.x1) * t), 0, width - 1);
    const y = clamp(Math.round(line.y1 + (line.y2 - line.y1) * t), 0, height - 1);
    const r = Math.max(0, residual[y * width + x]);
    if (r <= 0) {
      continue;
    }
    const d = Math.min(r, maxDelta);
    // Improvement in squared error: r^2 - (r-d)^2
    score += r * r - (r - d) * (r - d);
    avgResidual += r;
    count += 1;
  }
  const meanResidual = count > 0 ? avgResidual / count : 0;
  const adaptiveDelta = clamp(meanResidual * 1.1, 1, maxDelta);
  return { score, adaptiveDelta };
}

function rebuildResidualFromCanvas(
  target: Float32Array,
  channelCanvas: GraphImage,
  width: number,
  height: number,
  residual: Float32Array,
) {
  const context = channelCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return;
  }
  const painted = context.getImageData(0, 0, width, height).data;
  for (let i = 0; i < residual.length; i += 1) {
    const paintedValue = painted[i * 4];
    residual[i] = Math.max(0, target[i] - paintedValue);
  }
}

export async function generateLinefy2Svg(
  input: GraphImage,
  options: {
    maxWidth: number;
    colorMode: "grayscale" | "color";
    mixing: "additive" | "subtractive";
    numLines: number;
    lineStep: number;
    testLines: number;
    anchorSamples: number;
    scoreSamples: number;
    refreshEvery: number;
    lineWidth: number;
    seed: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<Linefy2Result | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const pixelCount = width * height;
  const rng = createSeededRandom(options.seed);
  const lineStep = clamp(Math.round(options.lineStep), 1, 255);
  const totalLines = clamp(Math.round(options.numLines), 1, 20000);
  const testLines = clamp(Math.round(options.testLines), 4, 4096);
  const anchorSamples = clamp(Math.round(options.anchorSamples), 32, 65536);
  const scoreSamples = clamp(Math.round(options.scoreSamples), 4, 256);
  const refreshEvery = clamp(Math.round(options.refreshEvery), 4, 256);

  const channels =
    options.colorMode === "color"
      ? ["r", "g", "b"] as const
      : ["gray"] as const;
  type ChannelId = (typeof channels)[number];

  const targetByChannel: Record<ChannelId, Float32Array> = channels.reduce((acc, channel) => {
    acc[channel] = new Float32Array(pixelCount);
    return acc;
  }, {} as Record<ChannelId, Float32Array>);
  const residualByChannel: Record<ChannelId, Float32Array> = channels.reduce((acc, channel) => {
    acc[channel] = new Float32Array(pixelCount);
    return acc;
  }, {} as Record<ChannelId, Float32Array>);
  const linesByChannel: Record<ChannelId, LinefyLine[]> = channels.reduce((acc, channel) => {
    acc[channel] = [];
    return acc;
  }, {} as Record<ChannelId, LinefyLine[]>);
  const channelCanvasByChannel: Record<ChannelId, GraphImage> = channels.reduce((acc, channel) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    acc[channel] = canvas;
    return acc;
  }, {} as Record<ChannelId, GraphImage>);
  const channelContextByChannel: Record<ChannelId, CanvasRenderingContext2D> = channels.reduce((acc, channel) => {
    const ctx = channelCanvasByChannel[channel].getContext("2d");
    if (!ctx) {
      throw new Error("2D context not available.");
    }
    acc[channel] = ctx;
    return acc;
  }, {} as Record<ChannelId, CanvasRenderingContext2D>);
  const totals: Record<ChannelId, number> = channels.reduce((acc, channel) => {
    acc[channel] = 0;
    return acc;
  }, {} as Record<ChannelId, number>);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    if (options.colorMode === "color") {
      const rr = options.mixing === "subtractive" ? 255 - r : r;
      const gg = options.mixing === "subtractive" ? 255 - g : g;
      const bb = options.mixing === "subtractive" ? 255 - b : b;
      targetByChannel.r[index] = rr;
      targetByChannel.g[index] = gg;
      targetByChannel.b[index] = bb;
      residualByChannel.r[index] = rr;
      residualByChannel.g[index] = gg;
      residualByChannel.b[index] = bb;
      totals.r += rr;
      totals.g += gg;
      totals.b += bb;
    } else {
      const gray = Math.round(0.21 * r + 0.72 * g + 0.07 * b);
      const value = options.mixing === "subtractive" ? 255 - gray : gray;
      targetByChannel.gray[index] = value;
      residualByChannel.gray[index] = value;
      totals.gray += value;
    }
  }

  channels.forEach((channel) => {
    const ctx = channelContextByChannel[channel];
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgb(255 255 255)";
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(0.1, options.lineWidth);
  });

  const totalEnergy = channels.reduce((acc, channel) => acc + totals[channel], 0);
  const lineBudgetByChannel: Record<ChannelId, number> = channels.reduce((acc, channel, index) => {
    const ratio = totalEnergy > 0 ? totals[channel] / totalEnergy : 1 / channels.length;
    const proposed = Math.max(1, Math.round(totalLines * ratio));
    acc[channel] = proposed;
    if (index === channels.length - 1) {
      const current = channels.reduce((sum, c) => sum + acc[c], 0);
      acc[channel] += totalLines - current;
    }
    return acc;
  }, {} as Record<ChannelId, number>);

  let processedLines = 0;
  const totalBudget = Math.max(1, channels.reduce((acc, channel) => acc + lineBudgetByChannel[channel], 0));
  const previewEveryLines = Math.max(20, Math.floor(totalBudget / 40));
  let lastYieldTime = performance.now();

  const strokeColors: Record<ChannelId, string> = channels.reduce((acc, channel) => {
    if (channel === "gray") {
      acc[channel] = options.mixing === "additive" ? "#FFFFFF" : "#000000";
      return acc;
    }
    if (options.mixing === "subtractive") {
      acc.r = "#00FFFF";
      acc.g = "#FF00FF";
      acc.b = "#FFFF00";
    } else {
      acc.r = "#FF0000";
      acc.g = "#00FF00";
      acc.b = "#0000FF";
    }
    return acc;
  }, {} as Record<ChannelId, string>);
  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  previewContext.fillStyle = options.mixing === "additive" ? "#000000" : "#FFFFFF";
  previewContext.fillRect(0, 0, width, height);
  previewContext.lineWidth = Math.max(0.1, options.lineWidth);
  previewContext.lineCap = "round";
  previewContext.globalAlpha = 1;

  for (let c = 0; c < channels.length; c += 1) {
    const channel = channels[c];
    const residual = residualByChannel[channel];
    const target = targetByChannel[channel];
    const lines = linesByChannel[channel];
    const channelCtx = channelContextByChannel[channel];
    const budget = lineBudgetByChannel[channel];
    let linesFromLastRefresh = 0;

    for (let lineIndex = 0; lineIndex < budget; lineIndex += 1) {
      if (shouldCancel?.()) {
        return null;
      }

      if (linesFromLastRefresh >= refreshEvery) {
        rebuildResidualFromCanvas(target, channelCanvasByChannel[channel], width, height, residual);
        linesFromLastRefresh = 0;
      }

      let bestAnchor = 0;
      let bestAnchorValue = -1;
      for (let sample = 0; sample < anchorSamples; sample += 1) {
        const idx = Math.floor(rng() * pixelCount);
        const value = residual[idx];
        if (value > bestAnchorValue) {
          bestAnchorValue = value;
          bestAnchor = idx;
        }
      }
      if (bestAnchorValue <= 0.5) {
        processedLines += budget - lineIndex;
        break;
      }

      const anchorX = bestAnchor % width;
      const anchorY = Math.floor(bestAnchor / width);
      let bestLine: LinefyLine | null = null;
      let bestScore = -1;
      let bestDelta = lineStep;

      for (let test = 0; test < testLines; test += 1) {
        const angle = rng() * Math.PI;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const clipped = clipInfiniteLineToRect(anchorX, anchorY, dx, dy, width, height);
        if (!clipped) {
          continue;
        }
        const candidate: LinefyLine = { ...clipped, alpha: 1 };
        const evaluated = evaluateLineCandidateFromResidual(
          residual,
          width,
          height,
          candidate,
          lineStep,
          scoreSamples,
        );
        if (evaluated.score > bestScore) {
          bestScore = evaluated.score;
          bestLine = candidate;
          bestDelta = evaluated.adaptiveDelta;
        }
      }

      if (!bestLine) {
        processedLines += 1;
        continue;
      }

      bestLine.alpha = clamp(bestDelta / 255, 0.01, 1);
      channelCtx.globalAlpha = bestLine.alpha;
      channelCtx.beginPath();
      channelCtx.moveTo(bestLine.x1 + 0.5, bestLine.y1 + 0.5);
      channelCtx.lineTo(bestLine.x2 + 0.5, bestLine.y2 + 0.5);
      channelCtx.stroke();
      lines.push(bestLine);
      previewContext.strokeStyle = strokeColors[channel];
      previewContext.globalAlpha = bestLine.alpha;
      previewContext.beginPath();
      previewContext.moveTo(bestLine.x1 + 0.5, bestLine.y1 + 0.5);
      previewContext.lineTo(bestLine.x2 + 0.5, bestLine.y2 + 0.5);
      previewContext.stroke();
      linesFromLastRefresh += 1;
      processedLines += 1;

      if (processedLines % refreshEvery === 0 || processedLines === totalBudget) {
        const progress = processedLines / totalBudget;
        onProgress?.(progress, `line ${processedLines}/${totalBudget}`);
      }
      if (processedLines % previewEveryLines === 0 || processedLines === totalBudget) {
        onPreview?.(preview);
      }
      if (performance.now() - lastYieldTime > 10) {
        await yieldToUi();
        lastYieldTime = performance.now();
      }
    }

    rebuildResidualFromCanvas(target, channelCanvasByChannel[channel], width, height, residual);
  }

  const svgGroups: string[] = [];
  channels.forEach((channel) => {
    const lines = linesByChannel[channel];
    const color = strokeColors[channel];
    if (!lines.length) {
      return;
    }
    let group = `<g stroke="${color}" stroke-width="${Math.max(0.1, options.lineWidth)}" stroke-linecap="round">`;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      group += `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke-opacity="${line.alpha.toFixed(4)}"/>`;
    }
    group += "</g>";
    svgGroups.push(group);
  });

  const lineCount = channels.reduce((acc, channel) => acc + linesByChannel[channel].length, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${options.mixing === "additive" ? "#000000" : "#FFFFFF"}"/>${svgGroups.join("")}</svg>`;
  return { svg, preview, lineCount, width, height };
}

export async function generateDelanoySvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    gridCells: number;
    jitter: number;
    scale: number;
    lineWidth: number;
    lineColor: string;
    backgroundColor: string;
    renderMode: "wireframe" | "fill" | "both";
    fillOpacity: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<DelanoyResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const gridCells = clamp(Math.round(options.gridCells), 8, 320);
  const cellWidth = width / gridCells;
  const rows = Math.max(8, Math.round(height / cellWidth));
  const cellHeight = height / rows;
  const jitter = clamp(options.jitter, 0, 1);
  const rng = createSeededRandom(1337 + width * 31 + height * 17 + gridCells * 13);

  const { PointCtor, DelaunayCtor } = getC2Runtime();
  const points: C2PointLike[] = [];
  for (let y = 0; y < rows; y += 1) {
    const baseY = y * cellHeight;
    for (let x = 0; x < gridCells; x += 1) {
      const baseX = x * cellWidth;
      const px = clamp(baseX + (rng() - 0.5) * cellWidth * jitter, 0, width - 1);
      const py = clamp(baseY + (rng() - 0.5) * cellHeight * jitter, 0, height - 1);
      points.push(new PointCtor(px, py));
    }
    if (y % 8 === 0) {
      onProgress?.((y + 1) / (rows + 4), "sampling points");
      await yieldToUi();
      if (shouldCancel?.()) {
        return null;
      }
    }
  }

  const delaunay = new DelaunayCtor();
  delaunay.compute(points);
  if (shouldCancel?.()) {
    return null;
  }

  const edges = delaunay.edges ?? [];
  const triangles = delaunay.triangles ?? [];
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }
  const sourceData = sourceContext.getImageData(0, 0, width, height);
  const grayMap = createGrayMapFromImageData(sourceData);
  const scale = clamp(options.scale, 1, 8);
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const lineWidth = Math.max(0.1, options.lineWidth);
  const lineColor = normalizeHexColor(options.lineColor);
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  const fillOpacity = clamp(options.fillOpacity, 0, 1);
  const renderMode = options.renderMode;

  const preview = document.createElement("canvas");
  preview.width = outWidth;
  preview.height = outHeight;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  previewContext.fillStyle = backgroundColor;
  previewContext.fillRect(0, 0, outWidth, outHeight);
  previewContext.strokeStyle = lineColor;
  previewContext.lineWidth = lineWidth;
  previewContext.lineCap = "round";
  previewContext.lineJoin = "round";

  const svgPolygons: string[] = [];
  if (renderMode === "fill" || renderMode === "both") {
    for (let index = 0; index < triangles.length; index += 1) {
      const triangle = triangles[index];
      const ax = clamp(triangle.p1.x, 0, width - 1);
      const ay = clamp(triangle.p1.y, 0, height - 1);
      const bx = clamp(triangle.p2.x, 0, width - 1);
      const by = clamp(triangle.p2.y, 0, height - 1);
      const cx = clamp(triangle.p3.x, 0, width - 1);
      const cy = clamp(triangle.p3.y, 0, height - 1);
      const centroidX = clamp(Math.round((ax + bx + cx) / 3), 0, width - 1);
      const centroidY = clamp(Math.round((ay + by + cy) / 3), 0, height - 1);
      const gray = Math.round(grayMap[centroidY * width + centroidX]);
      const fillColor = `rgb(${gray}, ${gray}, ${gray})`;

      const x1 = ax * scale;
      const y1 = ay * scale;
      const x2 = bx * scale;
      const y2 = by * scale;
      const x3 = cx * scale;
      const y3 = cy * scale;

      previewContext.save();
      previewContext.globalAlpha = fillOpacity;
      previewContext.fillStyle = fillColor;
      previewContext.beginPath();
      previewContext.moveTo(x1, y1);
      previewContext.lineTo(x2, y2);
      previewContext.lineTo(x3, y3);
      previewContext.closePath();
      previewContext.fill();
      previewContext.restore();

      svgPolygons.push(
        `<polygon points="${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${x3.toFixed(2)},${y3.toFixed(2)}" fill="${fillColor}" fill-opacity="${fillOpacity.toFixed(4)}"/>`,
      );

      if (index % 1200 === 0 || index === triangles.length - 1) {
        onProgress?.((rows + 1 + (index + 1) / Math.max(1, triangles.length) * 2) / (rows + 4), "filling triangles");
        onPreview?.(preview);
        await yieldToUi();
        if (shouldCancel?.()) {
          return null;
        }
      }
    }
  }

  const svgLines: string[] = [];
  if (renderMode === "wireframe" || renderMode === "both") {
    for (let index = 0; index < edges.length; index += 1) {
      const edge = edges[index];
      const x1 = clamp(edge.p1.x * scale, 0, outWidth - 1);
      const y1 = clamp(edge.p1.y * scale, 0, outHeight - 1);
      const x2 = clamp(edge.p2.x * scale, 0, outWidth - 1);
      const y2 = clamp(edge.p2.y * scale, 0, outHeight - 1);
      previewContext.beginPath();
      previewContext.moveTo(x1, y1);
      previewContext.lineTo(x2, y2);
      previewContext.stroke();
      svgLines.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`,
      );

      if (index % 1500 === 0 || index === edges.length - 1) {
        onProgress?.((rows + 1 + (index + 1) / Math.max(1, edges.length) * 3) / (rows + 4), "drawing edges");
        onPreview?.(preview);
        await yieldToUi();
        if (shouldCancel?.()) {
          return null;
        }
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}"><rect width="100%" height="100%" fill="${backgroundColor}"/>${svgPolygons.join("")}<g stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round">${svgLines.join("")}</g></svg>`;
  return {
    svg,
    preview,
    edgeCount: edges.length,
    pointCount: points.length,
    triangleCount: triangles.length,
    width: outWidth,
    height: outHeight,
  };
}

export async function generateDelanoy2Svg(
  input: GraphImage,
  options: {
    maxWidth: number;
    gridCells: number;
    jitter: number;
    scale: number;
    lineWidth: number;
    lineColor: string;
    backgroundColor: string;
    radiusScale: number;
    radiusMode: "vertex" | "inradius";
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<Delanoy2Result | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const gridCells = clamp(Math.round(options.gridCells), 6, 220);
  const cellWidth = width / gridCells;
  const rows = Math.max(6, Math.round(height / cellWidth));
  const cellHeight = height / rows;
  const jitter = clamp(options.jitter, 0, 1);
  const rng = createSeededRandom(8249 + width * 29 + height * 19 + gridCells * 11);

  const { PointCtor, DelaunayCtor } = getC2Runtime();
  const points: C2PointLike[] = [];
  for (let y = 0; y < rows; y += 1) {
    const baseY = y * cellHeight;
    for (let x = 0; x < gridCells; x += 1) {
      const baseX = x * cellWidth;
      const px = clamp(baseX + (0.5 + (rng() - 0.5) * jitter) * cellWidth, 0, width - 1);
      const py = clamp(baseY + (0.5 + (rng() - 0.5) * jitter) * cellHeight, 0, height - 1);
      points.push(new PointCtor(px, py));
    }
    if (y % 8 === 0) {
      onProgress?.((y + 1) / (rows + 3), "sampling points");
      await yieldToUi();
      if (shouldCancel?.()) {
        return null;
      }
    }
  }

  const delaunay = new DelaunayCtor();
  delaunay.compute(points);
  if (shouldCancel?.()) {
    return null;
  }
  const triangles = delaunay.triangles ?? [];

  const scale = clamp(options.scale, 1, 8);
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const lineWidth = Math.max(0.1, options.lineWidth);
  const lineColor = normalizeHexColor(options.lineColor);
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  const radiusScale = clamp(options.radiusScale, 0.1, 3);
  const radiusMode = options.radiusMode;

  const preview = document.createElement("canvas");
  preview.width = outWidth;
  preview.height = outHeight;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  previewContext.fillStyle = backgroundColor;
  previewContext.fillRect(0, 0, outWidth, outHeight);
  previewContext.strokeStyle = lineColor;
  previewContext.lineWidth = lineWidth;
  previewContext.lineCap = "round";
  previewContext.lineJoin = "round";

  const svgCircles: string[] = [];
  let circleCount = 0;
  for (let index = 0; index < triangles.length; index += 1) {
    const triangle = triangles[index];
    const ax = triangle.p1.x;
    const ay = triangle.p1.y;
    const bx = triangle.p2.x;
    const by = triangle.p2.y;
    const cx = triangle.p3.x;
    const cy = triangle.p3.y;

    const centerX = (ax + bx + cx) / 3;
    const centerY = (ay + by + cy) / 3;
    const d1 = Math.hypot(centerX - ax, centerY - ay);
    const d2 = Math.hypot(centerX - bx, centerY - by);
    const d3 = Math.hypot(centerX - cx, centerY - cy);
    const area2 = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    const perimeter = Math.hypot(ax - bx, ay - by) + Math.hypot(bx - cx, by - cy) + Math.hypot(cx - ax, cy - ay);
    const inradius = perimeter > 1e-6 ? area2 / perimeter : 0;

    const baseRadius = radiusMode === "inradius" ? inradius : (d1 + d2 + d3) / 3;
    const radius = Math.max(0.15, baseRadius * radiusScale) * scale;
    const x = clamp(centerX * scale, 0, outWidth - 1);
    const y = clamp(centerY * scale, 0, outHeight - 1);

    previewContext.beginPath();
    previewContext.arc(x, y, radius, 0, Math.PI * 2);
    previewContext.stroke();
    svgCircles.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="none"/>`);
    circleCount += 1;

    if (index % 1200 === 0 || index === triangles.length - 1) {
      onProgress?.((rows + 1 + (index + 1) / Math.max(1, triangles.length) * 2) / (rows + 3), "drawing circles");
      onPreview?.(preview);
      await yieldToUi();
      if (shouldCancel?.()) {
        return null;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}"><rect width="100%" height="100%" fill="${backgroundColor}"/><g stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round">${svgCircles.join("")}</g></svg>`;
  return {
    svg,
    preview,
    circleCount,
    pointCount: points.length,
    triangleCount: triangles.length,
    width: outWidth,
    height: outHeight,
  };
}

export async function generateSketchSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    lineLimit: number;
    squiggleMaxLength: number;
    gridCells: number;
    darkestAreaCandidates: number;
    lineWidth: number;
    lineAlpha: number;
    simplifyTolerance: number;
    lightenStep: number;
    refreshEvery: number;
    minError?: number;
    errorStabilityDelta?: number;
    errorStabilityChecks?: number;
    errorCheckEvery?: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<SketchResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = width * height;
  const luminance = new Float32Array(pixelCount);
  for (let index = 0, pixel = 0; pixel < pixelCount; index += 4, pixel += 1) {
    luminance[pixel] = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  }

  const gridCols = clamp(Math.round(options.gridCells), 8, 400);
  const gridRows = Math.max(8, Math.round((height / width) * gridCols));
  const cellWidth = width / gridCols;
  const cellHeight = height / gridRows;
  const gridCount = gridCols * gridRows;
  const gridAverage = new Float32Array(gridCount);
  const gridPixelCount = new Uint32Array(gridCount);
  for (let y = 0; y < height; y += 1) {
    const gy = clamp(Math.floor(y / cellHeight), 0, gridRows - 1);
    for (let x = 0; x < width; x += 1) {
      const gx = clamp(Math.floor(x / cellWidth), 0, gridCols - 1);
      const cellIndex = gy * gridCols + gx;
      gridAverage[cellIndex] += luminance[y * width + x];
      gridPixelCount[cellIndex] += 1;
    }
  }
  for (let index = 0; index < gridCount; index += 1) {
    const count = gridPixelCount[index];
    gridAverage[index] = count > 0 ? gridAverage[index] / count : 255;
  }

  const recomputeCellAverage = (cellIndex: number) => {
    const gx = cellIndex % gridCols;
    const gy = Math.floor(cellIndex / gridCols);
    const left = Math.floor(gx * cellWidth);
    const top = Math.floor(gy * cellHeight);
    const right = Math.min(width, Math.ceil((gx + 1) * cellWidth));
    const bottom = Math.min(height, Math.ceil((gy + 1) * cellHeight));
    let sum = 0;
    let count = 0;
    for (let y = top; y < bottom; y += 1) {
      let index = y * width + left;
      for (let x = left; x < right; x += 1) {
        sum += luminance[index];
        index += 1;
        count += 1;
      }
    }
    gridAverage[cellIndex] = count > 0 ? sum / count : 255;
  };

  const findDarkestCell = () => {
    const candidates = clamp(Math.round(options.darkestAreaCandidates), 1, 12);
    const bestIndices = new Int32Array(candidates);
    const bestValues = new Float32Array(candidates);
    bestIndices.fill(-1);
    bestValues.fill(256);
    for (let index = 0; index < gridCount; index += 1) {
      const value = gridAverage[index];
      for (let rank = 0; rank < candidates; rank += 1) {
        if (value >= bestValues[rank]) {
          continue;
        }
        for (let shift = candidates - 1; shift > rank; shift -= 1) {
          bestValues[shift] = bestValues[shift - 1];
          bestIndices[shift] = bestIndices[shift - 1];
        }
        bestValues[rank] = value;
        bestIndices[rank] = index;
        break;
      }
    }
    const picked = bestIndices[0];
    return picked >= 0 ? picked : 0;
  };

  const findDarkestPixelInCell = (cellIndex: number) => {
    const gx = cellIndex % gridCols;
    const gy = Math.floor(cellIndex / gridCols);
    const left = Math.floor(gx * cellWidth);
    const top = Math.floor(gy * cellHeight);
    const right = Math.min(width, Math.ceil((gx + 1) * cellWidth));
    const bottom = Math.min(height, Math.ceil((gy + 1) * cellHeight));
    let bestX = left;
    let bestY = top;
    let bestLuma = 255;
    for (let y = top; y < bottom; y += 1) {
      let index = y * width + left;
      for (let x = left; x < right; x += 1) {
        const value = luminance[index];
        if (value < bestLuma) {
          bestLuma = value;
          bestX = x;
          bestY = y;
        }
        index += 1;
      }
    }
    return { x: bestX, y: bestY, luminance: bestLuma };
  };

  const simplifyFn = options.simplifyTolerance > 0 ? getSimplify() : null;
  const lineLimit = clamp(Math.round(options.lineLimit), 1, 12000);
  const squiggleMaxLength = clamp(Math.round(options.squiggleMaxLength), 8, 12000);
  const lineWidth = clamp(options.lineWidth, 0.1, 20);
  const lineAlpha = clamp(options.lineAlpha, 0.01, 1);
  const lightenStep = clamp(Math.round(options.lightenStep), 1, 255);
  const refreshEvery = clamp(Math.round(options.refreshEvery), 4, 256);
  const brushRadius = Math.max(0, Math.round(lineWidth * 0.5));
  const minError = clamp(Number(options.minError ?? 0), 0, 255);
  const errorStabilityDelta = clamp(Number(options.errorStabilityDelta ?? 0), 0, 255);
  const errorStabilityChecks = clamp(Math.round(Number(options.errorStabilityChecks ?? 0)), 0, 1024);
  const errorCheckEvery = clamp(Math.round(Number(options.errorCheckEvery ?? refreshEvery)), 1, 2048);
  const convergenceEnabled =
    Number.isFinite(options.minError ?? NaN) ||
    Number.isFinite(options.errorStabilityDelta ?? NaN) ||
    Number.isFinite(options.errorStabilityChecks ?? NaN);

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  previewContext.fillStyle = "#FFFFFF";
  previewContext.fillRect(0, 0, width, height);
  previewContext.strokeStyle = "#000000";
  previewContext.lineWidth = lineWidth;
  previewContext.lineCap = "round";
  previewContext.lineJoin = "round";
  previewContext.globalAlpha = lineAlpha;

  const visitedStamp = new Int32Array(pixelCount);
  let stamp = 0;
  const dX = [-1, -1, 1, 1, -1, 1, 0, 0];
  const dY = [-1, 0, -1, 0, 1, 1, -1, 1];
  const svgPaths: string[] = [];
  let pathCount = 0;
  let lastYieldTime = performance.now();
  let iterations = 0;
  let stopReason: SketchResult["stopReason"] = "line_limit";
  let finalError = 255;
  let previousError = Number.POSITIVE_INFINITY;
  let stableErrorChecks = 0;

  for (let lineIndex = 0; lineIndex < lineLimit; lineIndex += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const darkestCell = findDarkestCell();
    const start = findDarkestPixelInCell(darkestCell);
    if (start.luminance > 245) {
      stopReason = "darkness_cleared";
      break;
    }

    stamp += 1;
    const rawPath: Array<{ x: number; y: number }> = [{ x: start.x, y: start.y }];
    visitedStamp[start.y * width + start.x] = stamp;
    let cursorX = start.x;
    let cursorY = start.y;

    for (let step = 1; step < squiggleMaxLength; step += 1) {
      let bestNeighborX = -1;
      let bestNeighborY = -1;
      let bestNeighborLuma = 256;
      for (let dir = 0; dir < 8; dir += 1) {
        const nx = cursorX + dX[dir];
        const ny = cursorY + dY[dir];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const nIndex = ny * width + nx;
        if (visitedStamp[nIndex] === stamp) {
          continue;
        }
        const value = luminance[nIndex];
        if (value < bestNeighborLuma) {
          bestNeighborLuma = value;
          bestNeighborX = nx;
          bestNeighborY = ny;
        }
      }
      if (bestNeighborX < 0 || bestNeighborY < 0) {
        break;
      }
      cursorX = bestNeighborX;
      cursorY = bestNeighborY;
      visitedStamp[cursorY * width + cursorX] = stamp;
      rawPath.push({ x: cursorX, y: cursorY });
    }

    if (rawPath.length < 2) {
      continue;
    }

    const pathRaw =
      simplifyFn && options.simplifyTolerance > 0 && rawPath.length > 2
        ? simplifyFn(rawPath, options.simplifyTolerance, true)
        : rawPath;
    const hasInvalidSimplifiedPoint = pathRaw.some((point) =>
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x >= width ||
      point.y >= height,
    );
    const sourcePath = hasInvalidSimplifiedPoint ? rawPath : pathRaw;
    const sanitizedPath = sourcePath.filter((point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < width &&
      point.y < height,
    );
    const path: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < sanitizedPath.length; i += 1) {
      const point = sanitizedPath[i];
      const prev = path[path.length - 1];
      if (prev && Math.abs(prev.x - point.x) < 1e-6 && Math.abs(prev.y - point.y) < 1e-6) {
        continue;
      }
      path.push(point);
    }
    if (path.length < 2) {
      continue;
    }

    const maxPenDownDistance = 64;
    const subpaths: Array<Array<{ x: number; y: number }>> = [];
    let currentSubpath: Array<{ x: number; y: number }> = [path[0]];
    for (let i = 1; i < path.length; i += 1) {
      const prev = path[i - 1];
      const point = path[i];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > maxPenDownDistance) {
        if (currentSubpath.length >= 2) {
          subpaths.push(currentSubpath);
        }
        currentSubpath = [point];
        continue;
      }
      currentSubpath.push(point);
    }
    if (currentSubpath.length >= 2) {
      subpaths.push(currentSubpath);
    }

    const touchedCells = new Set<number>();
    for (let subpathIndex = 0; subpathIndex < subpaths.length; subpathIndex += 1) {
      const subpath = subpaths[subpathIndex];
      previewContext.beginPath();
      previewContext.moveTo(subpath[0].x, subpath[0].y);
      for (let i = 1; i < subpath.length; i += 1) {
        previewContext.lineTo(subpath[i].x, subpath[i].y);
      }
      previewContext.stroke();

      for (let i = 1; i < subpath.length; i += 1) {
        const a = subpath[i - 1];
        const b = subpath[i];
        walkLineBresenham(
          Math.round(a.x),
          Math.round(a.y),
          Math.round(b.x),
          Math.round(b.y),
          width,
          height,
          (pixelIndex) => {
            const px = pixelIndex % width;
            const py = Math.floor(pixelIndex / width);
            const applyLighten = (tx: number, ty: number) => {
              if (tx < 0 || ty < 0 || tx >= width || ty >= height) {
                return;
              }
              const targetIndex = ty * width + tx;
              const current = luminance[targetIndex];
              const next = Math.min(255, current + lightenStep);
              if (next <= current) {
                return;
              }
              luminance[targetIndex] = next;
              const gx = clamp(Math.floor(tx / cellWidth), 0, gridCols - 1);
              const gy = clamp(Math.floor(ty / cellHeight), 0, gridRows - 1);
              touchedCells.add(gy * gridCols + gx);
            };
            applyLighten(px, py);
            if (brushRadius > 0) {
              for (let oy = -brushRadius; oy <= brushRadius; oy += 1) {
                for (let ox = -brushRadius; ox <= brushRadius; ox += 1) {
                  if (ox * ox + oy * oy > brushRadius * brushRadius) {
                    continue;
                  }
                  applyLighten(px + ox, py + oy);
                }
              }
            }
          },
        );
      }

      const d =
        `M${subpath[0].x.toFixed(2)},${subpath[0].y.toFixed(2)} ` +
        subpath
          .slice(1)
          .map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(" ");
      svgPaths.push(`<path d="${d}"/>`);
    }

    touchedCells.forEach((cellIndex) => {
      recomputeCellAverage(cellIndex);
    });
    pathCount += subpaths.length;
    iterations = lineIndex + 1;

    if (convergenceEnabled && (iterations % errorCheckEvery === 0 || iterations === lineLimit)) {
      let errorSum = 0;
      for (let i = 0; i < gridCount; i += 1) {
        errorSum += gridAverage[i];
      }
      finalError = errorSum / Math.max(1, gridCount);

      if (finalError <= minError) {
        stopReason = "min_error";
        onProgress?.(iterations / lineLimit, `min error reached (${finalError.toFixed(2)})`);
        break;
      }

      const improvement = previousError - finalError;
      if (improvement <= errorStabilityDelta) {
        stableErrorChecks += 1;
      } else {
        stableErrorChecks = 0;
      }
      previousError = finalError;

      if (errorStabilityChecks > 0 && stableErrorChecks >= errorStabilityChecks) {
        stopReason = "stalled";
        onProgress?.(
          iterations / lineLimit,
          `error stalled (${finalError.toFixed(2)}, Δ<=${errorStabilityDelta.toFixed(3)})`,
        );
        break;
      }
    }

    const progress = (lineIndex + 1) / lineLimit;
    onProgress?.(progress, `line ${lineIndex + 1}/${lineLimit}`);
    if ((lineIndex + 1) % refreshEvery === 0 || lineIndex + 1 === lineLimit) {
      onPreview?.(preview);
    }
    if (performance.now() - lastYieldTime > 12) {
      await yieldToUi();
      lastYieldTime = performance.now();
    }
  }

  if (!convergenceEnabled) {
    let errorSum = 0;
    for (let i = 0; i < gridCount; i += 1) {
      errorSum += gridAverage[i];
    }
    finalError = errorSum / Math.max(1, gridCount);
  }

  if (iterations === 0 && stopReason === "line_limit") {
    stopReason = "darkness_cleared";
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/><g fill="none" stroke="#000000" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${lineAlpha.toFixed(4)}">${svgPaths.join("")}</g></svg>`;
  onProgress?.(1, "ready");
  return { svg, preview, pathCount, iterations, finalError, stopReason, width, height };
}

export async function generateBicPencilSingleLineSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    pointCount: number;
    gamma: number;
    contrast: number;
    simplifyTolerance: number;
    lineWidth: number;
    lineAlpha: number;
    optimizePasses: number;
    maxGenerations: number;
    offspringPerGeneration: number;
    mutationRate: number;
    mutationStrength: number;
    minMse: number;
    mseDeltaThreshold: number;
    stableGenerations: number;
    workScale: number;
    seed: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
): Promise<BicPencilResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const gamma = clamp(options.gamma, 0.2, 3);
  const contrast = clamp(options.contrast, 0.2, 4);
  const targetPoints = clamp(Math.round(options.pointCount), 300, 25000);
  const simplifyTolerance = clamp(options.simplifyTolerance, 0, 10);
  const lineWidth = clamp(options.lineWidth, 0.1, 8);
  const lineAlpha = clamp(options.lineAlpha, 0.01, 1);
  const optimizePasses = clamp(Math.round(options.optimizePasses), 0, 20);
  const maxGenerations = clamp(Math.round(options.maxGenerations), 0, 200);
  const offspringPerGeneration = clamp(Math.round(options.offspringPerGeneration), 1, 16);
  const mutationRate = clamp(options.mutationRate, 0.001, 0.5);
  const mutationStrength = clamp(options.mutationStrength, 0.25, 64);
  const minMse = clamp(options.minMse, 0, 65025);
  const mseDeltaThreshold = clamp(options.mseDeltaThreshold, 0, 1000);
  const stableGenerations = clamp(Math.round(options.stableGenerations), 1, 100);
  const workScale = clamp(options.workScale, 0.1, 1);
  const rng = createSeededRandom(Math.round(options.seed) || 1);

  const pixelCount = width * height;
  const darkness = new Float32Array(pixelCount);
  let totalDarkness = 0;
  for (let i = 0, p = 0; p < pixelCount; i += 4, p += 1) {
    const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const d = clamp(Math.pow(1 - l, gamma) * contrast, 0, 1);
    darkness[p] = d;
    totalDarkness += d;
  }
  if (totalDarkness <= 1e-6) {
    const blank = document.createElement("canvas");
    blank.width = width;
    blank.height = height;
    const blankCtx = blank.getContext("2d");
    if (!blankCtx) {
      throw new Error("2D context not available.");
    }
    blankCtx.fillStyle = "#FFFFFF";
    blankCtx.fillRect(0, 0, width, height);
    const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/></svg>`;
    return {
      svg: emptySvg,
      preview: blank,
      pointCount: 0,
      pathLength: 0,
      mse: 0,
      generations: 0,
      stopReason: "target_error",
      width,
      height,
    };
  }

  const cum = new Float64Array(pixelCount);
  let acc = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    acc += darkness[i];
    cum[i] = acc;
  }

  const points: Array<{ x: number; y: number }> = [];
  const occupied = new Uint8Array(pixelCount);
  const pickWeightedIndex = () => {
    const r = rng() * acc;
    let lo = 0;
    let hi = pixelCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const reportStep = Math.max(1, Math.floor(targetPoints / 20));
  for (let i = 0; i < targetPoints; i += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const idx = pickWeightedIndex();
    if (occupied[idx]) {
      continue;
    }
    occupied[idx] = 1;
    points.push({ x: idx % width, y: Math.floor(idx / width) });
    if (i % reportStep === 0 || i === targetPoints - 1) {
      onProgress?.(0.2 * (i / Math.max(1, targetPoints - 1)), `sampling ${i + 1}/${targetPoints}`);
      await yieldToUi();
    }
  }

  if (points.length < 2) {
    const blank = document.createElement("canvas");
    blank.width = width;
    blank.height = height;
    const blankCtx = blank.getContext("2d");
    if (!blankCtx) {
      throw new Error("2D context not available.");
    }
    blankCtx.fillStyle = "#FFFFFF";
    blankCtx.fillRect(0, 0, width, height);
    const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/></svg>`;
    return {
      svg: emptySvg,
      preview: blank,
      pointCount: points.length,
      pathLength: 0,
      mse: 0,
      generations: 0,
      stopReason: "target_error",
      width,
      height,
    };
  }

  let startIndex = 0;
  let darkest = -1;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const d = darkness[p.y * width + p.x];
    if (d > darkest) {
      darkest = d;
      startIndex = i;
    }
  }

  const route: Array<{ x: number; y: number }> = [];
  const used = new Uint8Array(points.length);
  let current = startIndex;
  used[current] = 1;
  route.push(points[current]);

  const sqDist = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  for (let usedCount = 1; usedCount < points.length; usedCount += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    const from = points[current];
    for (let i = 0; i < points.length; i += 1) {
      if (used[i]) continue;
      const cand = points[i];
      const dist = sqDist(from, cand);
      const d = darkness[cand.y * width + cand.x];
      const score = dist / (0.3 + d); // prefer dark areas when distances are similar
      if (score < bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0) break;
    used[best] = 1;
    current = best;
    route.push(points[current]);
    if (usedCount % Math.max(1, Math.floor(points.length / 20)) === 0) {
      onProgress?.(0.2 + 0.3 * (usedCount / points.length), `routing ${usedCount}/${points.length}`);
      await yieldToUi();
    }
  }

  const reverseSegment = (arr: Array<{ x: number; y: number }>, i: number, j: number) => {
    while (i < j) {
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
      i += 1;
      j -= 1;
    }
  };
  const segDist = (arr: Array<{ x: number; y: number }>, i: number, j: number) => {
    return Math.sqrt(sqDist(arr[i], arr[j]));
  };

  for (let pass = 0; pass < optimizePasses; pass += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const attempts = Math.min(20000, route.length * 8);
    for (let k = 0; k < attempts; k += 1) {
      const a = 1 + Math.floor(rng() * Math.max(1, route.length - 3));
      const b = a + 1 + Math.floor(rng() * Math.max(1, route.length - a - 2));
      const oldLen = segDist(route, a - 1, a) + segDist(route, b, b + 1);
      const newLen = segDist(route, a - 1, b) + segDist(route, a, b + 1);
      if (newLen < oldLen) {
        reverseSegment(route, a, b);
      }
    }
    onProgress?.(0.5 + 0.2 * ((pass + 1) / Math.max(1, optimizePasses)), `optimize ${pass + 1}/${optimizePasses}`);
    await yieldToUi();
  }

  let finalPoints =
    simplifyTolerance > 0 && route.length > 2
      ? getSimplify()(
        route.map((p) => ({ x: p.x, y: p.y })),
        simplifyTolerance,
        true,
      )
      : route;

  if (finalPoints.length < 2) {
    finalPoints = route;
  }

  const workWidth = clamp(Math.round(width * workScale), 64, width);
  const workHeight = clamp(Math.round(height * workScale), 64, height);
  const scaleX = workWidth / width;
  const scaleY = workHeight / height;
  const invScaleX = width / workWidth;
  const invScaleY = height / workHeight;
  const workLineWidth = Math.max(0.1, lineWidth * ((scaleX + scaleY) * 0.5));

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = workWidth;
  targetCanvas.height = workHeight;
  const targetCtx = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetCtx) {
    throw new Error("2D context not available.");
  }
  targetCtx.fillStyle = "#FFFFFF";
  targetCtx.fillRect(0, 0, workWidth, workHeight);
  targetCtx.drawImage(source, 0, 0, workWidth, workHeight);
  const targetData = targetCtx.getImageData(0, 0, workWidth, workHeight).data;
  const targetLum = new Float32Array(workWidth * workHeight);
  for (let i = 0, p = 0; p < targetLum.length; i += 4, p += 1) {
    targetLum[p] = 0.299 * targetData[i] + 0.587 * targetData[i + 1] + 0.114 * targetData[i + 2];
  }

  const workCanvas = document.createElement("canvas");
  workCanvas.width = workWidth;
  workCanvas.height = workHeight;
  const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!workCtx) {
    throw new Error("2D context not available.");
  }

  const renderMse = (pts: Array<{ x: number; y: number }>) => {
    workCtx.fillStyle = "#FFFFFF";
    workCtx.fillRect(0, 0, workWidth, workHeight);
    if (pts.length >= 2) {
      workCtx.strokeStyle = "#000000";
      workCtx.globalAlpha = lineAlpha;
      workCtx.lineWidth = workLineWidth;
      workCtx.lineCap = "round";
      workCtx.lineJoin = "round";
      workCtx.beginPath();
      workCtx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
      for (let i = 1; i < pts.length; i += 1) {
        workCtx.lineTo(pts[i].x * scaleX, pts[i].y * scaleY);
      }
      workCtx.stroke();
    }
    const rendered = workCtx.getImageData(0, 0, workWidth, workHeight).data;
    let mse = 0;
    for (let i = 0, p = 0; p < targetLum.length; i += 4, p += 1) {
      const lum = 0.299 * rendered[i] + 0.587 * rendered[i + 1] + 0.114 * rendered[i + 2];
      const err = targetLum[p] - lum;
      mse += err * err;
    }
    return mse / Math.max(1, targetLum.length);
  };

  const mutatePath = (base: Array<{ x: number; y: number }>) => {
    const candidate = base.map((p) => ({ x: p.x, y: p.y }));
    const mutateCount = Math.max(2, Math.round(candidate.length * mutationRate));
    for (let i = 0; i < mutateCount; i += 1) {
      const idx = Math.floor(rng() * candidate.length);
      const p = candidate[idx];
      const jx = (rng() * 2 - 1) * mutationStrength;
      const jy = (rng() * 2 - 1) * mutationStrength;
      p.x = clamp(p.x + jx, 0, width - 1);
      p.y = clamp(p.y + jy, 0, height - 1);
    }
    if (candidate.length > 12 && rng() < 0.35) {
      const a = 1 + Math.floor(rng() * Math.max(1, candidate.length - 3));
      const b = a + 1 + Math.floor(rng() * Math.max(1, candidate.length - a - 2));
      reverseSegment(candidate, a, b);
    }
    if (simplifyTolerance > 0 && candidate.length > 12) {
      const simplified = getSimplify()(candidate, simplifyTolerance * 0.25, true);
      return simplified.length >= 2 ? simplified : candidate;
    }
    return candidate;
  };

  let bestPoints = finalPoints.map((p) => ({ x: p.x, y: p.y }));
  let bestMse = renderMse(bestPoints);
  let generations = 0;
  let stableCount = 0;
  let stopReason: BicPencilResult["stopReason"] = "max_generations";

  if (bestMse <= minMse) {
    stopReason = "target_error";
  } else {
    for (let generation = 0; generation < maxGenerations; generation += 1) {
      if (shouldCancel?.()) {
        return null;
      }
      let improved = false;
      let generationBest = bestMse;
      let generationBestPath = bestPoints;
      for (let child = 0; child < offspringPerGeneration; child += 1) {
        const candidate = mutatePath(bestPoints);
        const mse = renderMse(candidate);
        if (mse < generationBest) {
          generationBest = mse;
          generationBestPath = candidate;
        }
      }

      const delta = bestMse - generationBest;
      if (delta > 0) {
        improved = true;
        bestMse = generationBest;
        bestPoints = generationBestPath;
      }

      generations = generation + 1;
      if (bestMse <= minMse) {
        stopReason = "target_error";
        onProgress?.(0.7 + 0.3 * ((generation + 1) / Math.max(1, maxGenerations)), `evolve ${generation + 1} mse ${bestMse.toFixed(2)}`);
        break;
      }

      if (!improved || delta <= mseDeltaThreshold) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      if (stableCount >= stableGenerations) {
        stopReason = "stalled";
        onProgress?.(0.7 + 0.3 * ((generation + 1) / Math.max(1, maxGenerations)), `stalled mse ${bestMse.toFixed(2)}`);
        break;
      }

      onProgress?.(0.7 + 0.3 * ((generation + 1) / Math.max(1, maxGenerations)), `evolve ${generation + 1}/${maxGenerations} mse ${bestMse.toFixed(2)}`);
      if ((generation + 1) % 2 === 0) {
        await yieldToUi();
      }
    }
  }

  finalPoints = bestPoints.map((p) => ({
    x: clamp(p.x, 0, width - 1),
    y: clamp(p.y, 0, height - 1),
  }));

  let d = `M${finalPoints[0].x.toFixed(2)},${finalPoints[0].y.toFixed(2)}`;
  let pathLength = 0;
  for (let i = 1; i < finalPoints.length; i += 1) {
    d += ` L${finalPoints[i].x.toFixed(2)},${finalPoints[i].y.toFixed(2)}`;
    pathLength += Math.sqrt(sqDist(finalPoints[i - 1], finalPoints[i]));
  }

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewCtx = preview.getContext("2d");
  if (!previewCtx) {
    throw new Error("2D context not available.");
  }
  previewCtx.fillStyle = "#FFFFFF";
  previewCtx.fillRect(0, 0, width, height);
  previewCtx.strokeStyle = "rgba(0,0,120,1)";
  previewCtx.lineWidth = lineWidth;
  previewCtx.globalAlpha = lineAlpha;
  previewCtx.lineCap = "round";
  previewCtx.lineJoin = "round";
  previewCtx.beginPath();
  previewCtx.moveTo(finalPoints[0].x, finalPoints[0].y);
  for (let i = 1; i < finalPoints.length; i += 1) {
    previewCtx.lineTo(finalPoints[i].x, finalPoints[i].y);
  }
  previewCtx.stroke();
  onProgress?.(1, "ready");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/><path d="${d}" fill="none" stroke="#00008B" stroke-width="${lineWidth}" stroke-opacity="${lineAlpha.toFixed(4)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return {
    svg,
    preview,
    pointCount: finalPoints.length,
    pathLength,
    mse: bestMse,
    generations,
    stopReason,
    width,
    height,
  };
}

function oil2RgbaCss(r: number, g: number, b: number, a: number) {
  return `rgba(${clamp(Math.round(r), 0, 255)},${clamp(Math.round(g), 0, 255)},${clamp(Math.round(b), 0, 255)},${clamp(a, 0, 1).toFixed(4)})`;
}

function generateOil2StrokePaths(options: {
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  angleRad: number;
  strokeLength: number;
  strokeThickness: number;
  strokeColor: { r: number; g: number; b: number; a: number };
  rng: () => number;
  maxSvgPaths: number;
  svgPaths: string[];
}) {
  const {
    context,
    x,
    y,
    angleRad,
    strokeLength,
    strokeThickness,
    strokeColor,
    rng,
    maxSvgPaths,
    svgPaths,
  } = options;
  const stepLength = strokeLength / 4;
  let tangent1 = 0;
  let tangent2 = 0;
  if (rng() < 0.7) {
    tangent1 = -strokeLength + rng() * strokeLength * 2;
    tangent2 = -strokeLength + rng() * strokeLength * 2;
  }
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const transformPoint = (px: number, py: number) => ({
    x: x + px * cosA - py * sinA,
    y: y + px * sinA + py * cosA,
  });
  const drawCurve = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    colorCss: string,
    weight: number,
  ) => {
    const safeWeight = Math.max(0.1, weight);
    const tp0 = transformPoint(p0.x, p0.y);
    const tp1 = transformPoint(p1.x, p1.y);
    const tp2 = transformPoint(p2.x, p2.y);
    const tp3 = transformPoint(p3.x, p3.y);
    const c1 = {
      x: tp1.x + (tp2.x - tp0.x) / 6,
      y: tp1.y + (tp2.y - tp0.y) / 6,
    };
    const c2 = {
      x: tp2.x - (tp3.x - tp1.x) / 6,
      y: tp2.y - (tp3.y - tp1.y) / 6,
    };
    context.strokeStyle = colorCss;
    context.lineWidth = safeWeight;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(tp1.x, tp1.y);
    context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, tp2.x, tp2.y);
    context.stroke();
    if (svgPaths.length < maxSvgPaths) {
      const d =
        `M ${tp1.x.toFixed(2)} ${tp1.y.toFixed(2)} ` +
        `C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${tp2.x.toFixed(2)} ${tp2.y.toFixed(2)}`;
      svgPaths.push(
        `<path d="${d}" fill="none" stroke="${colorCss}" stroke-width="${safeWeight.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  };

  const baseColorCss = oil2RgbaCss(strokeColor.r, strokeColor.g, strokeColor.b, strokeColor.a);
  drawCurve(
    { x: tangent1, y: -stepLength * 2 },
    { x: 0, y: -stepLength },
    { x: 0, y: stepLength },
    { x: tangent2, y: stepLength * 2 },
    baseColorCss,
    strokeThickness,
  );

  let z = 1;
  const detailIterations = Math.max(1, Math.round(strokeThickness));
  for (let num = detailIterations; num > 0; num -= 1) {
    const offset = -50 + rng() * 75;
    const detailColorCss = oil2RgbaCss(
      strokeColor.r + offset,
      strokeColor.g + offset,
      strokeColor.b + offset,
      (100 + rng() * 155) / 255,
    );
    const detailWeight = Math.floor(rng() * 3);
    if (detailWeight <= 0) {
      z += 1;
      continue;
    }
    const localX = z - strokeThickness / 2;
    drawCurve(
      { x: tangent1, y: -stepLength * 2 },
      { x: localX, y: -stepLength * (0.9 + rng() * 0.2) },
      { x: localX, y: stepLength * (0.9 + rng() * 0.2) },
      { x: tangent2, y: stepLength * 2 },
      detailColorCss,
      detailWeight,
    );
    z += 1;
  }
}

export async function generateOil2Svg(
  input: GraphImage,
  options: {
    maxWidth: number;
    density: number;
    probabilityDiv: number;
    seed: number;
    refreshEvery: number;
    maxSvgPaths: number;
    backgroundColor: string;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<Oil2Result | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  previewContext.fillStyle = backgroundColor;
  previewContext.fillRect(0, 0, width, height);

  const rng = createSeededRandom(options.seed);
  const safeDensity = clamp(options.density, 0.05, 8);
  const safeProbabilityDiv = clamp(Math.round(options.probabilityDiv), 2000, 120000);
  const expectedPerFrame = (width * height * safeDensity) / safeProbabilityDiv;
  const refreshEvery = clamp(Math.round(options.refreshEvery), 1, 512);
  const maxSvgPaths = clamp(Math.round(options.maxSvgPaths), 1000, 300000);

  const stages = [
    { name: "rough", frames: 20, lenMin: 150, lenMax: 250, thickMin: 20, thickMax: 40 },
    { name: "thick", frames: 30, lenMin: 75, lenMax: 125, thickMin: 8, thickMax: 12 },
    { name: "small", frames: 250, lenMin: 30, lenMax: 60, thickMin: 1, thickMax: 4 },
    { name: "big-dots", frames: 50, lenMin: 5, lenMax: 20, thickMin: 5, thickMax: 15 },
    { name: "small-dots", frames: 250, lenMin: 1, lenMax: 10, thickMin: 1, thickMax: 7 },
  ] as const;
  const stageTargets = stages.map((stage) => Math.max(1, Math.round(expectedPerFrame * stage.frames)));
  const totalStrokesTarget = stageTargets.reduce((sum, value) => sum + value, 0);

  const svgPaths: string[] = [];
  let strokeCount = 0;
  let lastYieldTime = performance.now();

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    const stage = stages[stageIndex];
    const target = stageTargets[stageIndex];
    for (let index = 0; index < target; index += 1) {
      if (shouldCancel?.()) {
        return null;
      }
      const px = Math.floor(rng() * width);
      const py = Math.floor(rng() * height);
      const pixelIndex = (py * width + px) * 4;
      const r = pixels[pixelIndex];
      const g = pixels[pixelIndex + 1];
      const b = pixels[pixelIndex + 2];
      const baseAlpha = 100 / 255;
      const angleRad = ((-90 + rng() * 180) * Math.PI) / 180;
      const strokeLength = stage.lenMin + rng() * (stage.lenMax - stage.lenMin);
      const thickness =
        Math.floor(stage.thickMin + rng() * (stage.thickMax - stage.thickMin + 1));

      generateOil2StrokePaths({
        context: previewContext,
        x: px,
        y: py,
        angleRad,
        strokeLength,
        strokeThickness: thickness,
        strokeColor: { r, g, b, a: baseAlpha },
        rng,
        maxSvgPaths,
        svgPaths,
      });
      strokeCount += 1;

      if (strokeCount % refreshEvery === 0 || strokeCount === totalStrokesTarget) {
        onProgress?.(strokeCount / Math.max(1, totalStrokesTarget), `${stage.name} ${index + 1}/${target}`);
        onPreview?.(preview);
      }
      if (performance.now() - lastYieldTime > 12) {
        await yieldToUi();
        lastYieldTime = performance.now();
      }
    }
  }

  const pathCount = svgPaths.length;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${backgroundColor}"/>${svgPaths.join("")}</svg>`;
  onProgress?.(1, "ready");
  return { svg, preview, strokeCount, pathCount, width, height };
}

function generateOil3StrokePaths(options: {
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  angleRad: number;
  strokeLength: number;
  strokeThickness: number;
  strokeColor: { r: number; g: number; b: number; a: number };
  stepDiv: number;
  tangentChance: number;
  detailChance: number;
  detailJitter: number;
  rng: () => number;
  maxSvgPaths: number;
  svgPaths: string[];
}) {
  const {
    context,
    x,
    y,
    angleRad,
    strokeLength,
    strokeThickness,
    strokeColor,
    stepDiv,
    tangentChance,
    detailChance,
    detailJitter,
    rng,
    maxSvgPaths,
    svgPaths,
  } = options;
  const stepLength = strokeLength / Math.max(1, stepDiv);
  let tangent1 = 0;
  let tangent2 = 0;
  if (rng() < tangentChance) {
    tangent1 = -strokeLength + rng() * strokeLength * 2;
    tangent2 = -strokeLength + rng() * strokeLength * 2;
  }
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const transformPoint = (px: number, py: number) => ({
    x: x + px * cosA - py * sinA,
    y: y + px * sinA + py * cosA,
  });
  const drawCurve = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    colorCss: string,
    weight: number,
  ) => {
    const safeWeight = Math.max(0.1, weight);
    const tp0 = transformPoint(p0.x, p0.y);
    const tp1 = transformPoint(p1.x, p1.y);
    const tp2 = transformPoint(p2.x, p2.y);
    const tp3 = transformPoint(p3.x, p3.y);
    const c1 = {
      x: tp1.x + (tp2.x - tp0.x) / 6,
      y: tp1.y + (tp2.y - tp0.y) / 6,
    };
    const c2 = {
      x: tp2.x - (tp3.x - tp1.x) / 6,
      y: tp2.y - (tp3.y - tp1.y) / 6,
    };
    context.strokeStyle = colorCss;
    context.lineWidth = safeWeight;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(tp1.x, tp1.y);
    context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, tp2.x, tp2.y);
    context.stroke();
    if (svgPaths.length < maxSvgPaths) {
      const d =
        `M ${tp1.x.toFixed(2)} ${tp1.y.toFixed(2)} ` +
        `C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${tp2.x.toFixed(2)} ${tp2.y.toFixed(2)}`;
      svgPaths.push(
        `<path d="${d}" fill="none" stroke="${colorCss}" stroke-width="${safeWeight.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  };

  const baseColorCss = oil2RgbaCss(strokeColor.r, strokeColor.g, strokeColor.b, strokeColor.a);
  drawCurve(
    { x: tangent1, y: -stepLength * 2 },
    { x: 0, y: -stepLength },
    { x: 0, y: stepLength },
    { x: tangent2, y: stepLength * 2 },
    baseColorCss,
    strokeThickness,
  );

  if (rng() > detailChance) {
    return;
  }

  let z = 1;
  const detailIterations = Math.max(1, Math.round(strokeThickness));
  for (let num = detailIterations; num > 0; num -= 1) {
    const offset = -detailJitter + rng() * detailJitter * 1.5;
    const detailColorCss = oil2RgbaCss(
      strokeColor.r + offset,
      strokeColor.g + offset,
      strokeColor.b + offset,
      (100 + rng() * 155) / 255,
    );
    const detailWeight = Math.floor(rng() * 2);
    if (detailWeight <= 0) {
      z += 1;
      continue;
    }
    const localX = z - strokeThickness / 2;
    drawCurve(
      { x: tangent1, y: -stepLength * 2 },
      { x: localX, y: -stepLength * (0.9 + rng() * 0.2) },
      { x: localX, y: stepLength * (0.9 + rng() * 0.2) },
      { x: tangent2, y: stepLength * 2 },
      detailColorCss,
      detailWeight,
    );
    z += 1;
  }
}

export async function generateOil3Svg(
  input: GraphImage,
  options: {
    maxWidth: number;
    density: number;
    probabilityDiv: number;
    seed: number;
    refreshEvery: number;
    maxSvgPaths: number;
    backgroundColor: string;
    rotationMin: number;
    rotationMax: number;
    alpha: number;
    stepDiv: number;
    tangentChance: number;
    detailChance: number;
    detailJitter: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<Oil3Result | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  previewContext.fillStyle = backgroundColor;
  previewContext.fillRect(0, 0, width, height);

  const rng = createSeededRandom(options.seed);
  const safeDensity = clamp(options.density, 0.05, 8);
  const safeProbabilityDiv = clamp(Math.round(options.probabilityDiv), 2000, 120000);
  const expectedPerFrame = (width * height * safeDensity) / safeProbabilityDiv;
  const refreshEvery = clamp(Math.round(options.refreshEvery), 1, 512);
  const maxSvgPaths = clamp(Math.round(options.maxSvgPaths), 1000, 300000);
  const rotationMin = clamp(options.rotationMin, -180, 180);
  const rotationMax = clamp(options.rotationMax, rotationMin, 180);
  const alpha = clamp(options.alpha, 0, 1);
  const stepDiv = clamp(options.stepDiv, 1, 100);
  const tangentChance = clamp(options.tangentChance, 0, 1);
  const detailChance = clamp(options.detailChance, 0, 1);
  const detailJitter = clamp(options.detailJitter, 0, 255);

  const stages = [
    { name: "rough", frames: 20, lenMin: 150, lenMax: 250, thickMin: 20, thickMax: 40 },
    { name: "thick", frames: 30, lenMin: 75, lenMax: 125, thickMin: 8, thickMax: 12 },
    { name: "small", frames: 250, lenMin: 30, lenMax: 60, thickMin: 1, thickMax: 4 },
    { name: "big-dots", frames: 50, lenMin: 5, lenMax: 20, thickMin: 5, thickMax: 15 },
    { name: "small-dots", frames: 250, lenMin: 1, lenMax: 10, thickMin: 1, thickMax: 7 },
  ] as const;
  const stageTargets = stages.map((stage) => Math.max(1, Math.round(expectedPerFrame * stage.frames)));
  const totalStrokesTarget = stageTargets.reduce((sum, value) => sum + value, 0);

  const svgPaths: string[] = [];
  let strokeCount = 0;
  let lastYieldTime = performance.now();
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    const stage = stages[stageIndex];
    const target = stageTargets[stageIndex];
    for (let index = 0; index < target; index += 1) {
      if (shouldCancel?.()) {
        return null;
      }
      const px = Math.floor(rng() * width);
      const py = Math.floor(rng() * height);
      const pixelIndex = (py * width + px) * 4;
      const r = pixels[pixelIndex];
      const g = pixels[pixelIndex + 1];
      const b = pixels[pixelIndex + 2];
      const angleRad = ((rotationMin + rng() * (rotationMax - rotationMin)) * Math.PI) / 180;
      const strokeLength = stage.lenMin + rng() * (stage.lenMax - stage.lenMin);
      const thickness = Math.floor(stage.thickMin + rng() * (stage.thickMax - stage.thickMin + 1));

      generateOil3StrokePaths({
        context: previewContext,
        x: px,
        y: py,
        angleRad,
        strokeLength,
        strokeThickness: thickness,
        strokeColor: { r, g, b, a: alpha },
        stepDiv,
        tangentChance,
        detailChance,
        detailJitter,
        rng,
        maxSvgPaths,
        svgPaths,
      });
      strokeCount += 1;

      if (strokeCount % refreshEvery === 0 || strokeCount === totalStrokesTarget) {
        onProgress?.(strokeCount / Math.max(1, totalStrokesTarget), `${stage.name} ${index + 1}/${target}`);
        onPreview?.(preview);
      }
      if (performance.now() - lastYieldTime > 12) {
        await yieldToUi();
        lastYieldTime = performance.now();
      }
    }
  }

  const pathCount = svgPaths.length;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${backgroundColor}"/>${svgPaths.join("")}</svg>`;
  onProgress?.(1, "ready");
  return { svg, preview, strokeCount, pathCount, width, height };
}

export async function generateLinesSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    lineCount: number;
    pointsPerLine: number;
    amplitude: number;
    channel: "luma" | "red" | "green" | "blue";
    invert: boolean;
    zoom: number;
    offsetX: number;
    offsetY: number;
    lineWidth: number;
    lineAlpha: number;
    lineColor: string;
    backgroundColor: string;
    refreshEvery: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<LineFieldResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }
  const pixels = sourceContext.getImageData(0, 0, width, height).data;

  const lineCount = clamp(Math.round(options.lineCount), 2, 4096);
  const pointsPerLine = clamp(Math.round(options.pointsPerLine), 4, 8192);
  const amplitude = clamp(options.amplitude, 0, height);
  const zoom = clamp(options.zoom, 0.05, 20);
  const offsetX = options.offsetX;
  const offsetY = options.offsetY;
  const lineWidth = clamp(options.lineWidth, 0.1, 20);
  const lineAlpha = clamp(options.lineAlpha, 0, 1);
  const lineColor = normalizeHexColor(options.lineColor);
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  const refreshEvery = clamp(Math.round(options.refreshEvery), 1, 512);
  const invert = options.invert;
  const channel = options.channel;

  const sampleValue = (ix: number, iy: number) => {
    const x = Math.floor(ix);
    const y = Math.floor(iy);
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return 255;
    }
    const index = (y * width + x) * 4;
    if (channel === "red") {
      return pixels[index];
    }
    if (channel === "green") {
      return pixels[index + 1];
    }
    if (channel === "blue") {
      return pixels[index + 2];
    }
    return Math.round(0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]);
  };

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  previewContext.fillStyle = backgroundColor;
  previewContext.fillRect(0, 0, width, height);
  previewContext.strokeStyle = lineColor;
  previewContext.lineWidth = lineWidth;
  previewContext.globalAlpha = lineAlpha;
  previewContext.lineCap = "round";
  previewContext.lineJoin = "round";

  const pointSpacing = width / (pointsPerLine + 1);
  const lineSpacing = height / (lineCount + 1);
  const svgPaths: string[] = [];
  let totalPoints = 0;
  let lastYieldTime = performance.now();

  for (let lineIndex = 1; lineIndex <= lineCount; lineIndex += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const y = lineIndex * lineSpacing;
    const points: Array<{ x: number; y: number }> = [];
    for (let pointIndex = 1; pointIndex <= pointsPerLine; pointIndex += 1) {
      const x = pointIndex * pointSpacing;
      const centeredX = x - width * 0.5 - offsetX;
      const centeredY = y - height * 0.5 - offsetY;
      const imgX = centeredX / zoom + width * 0.5;
      const imgY = centeredY / zoom + height * 0.5;
      const value = sampleValue(imgX, imgY);
      const mapped = invert
        ? ((value / 255) * amplitude)
        : ((value / 255) * amplitude - amplitude);
      points.push({ x, y: y + mapped });
    }
    if (points.length < 2) {
      continue;
    }

    previewContext.beginPath();
    previewContext.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      previewContext.lineTo(points[i].x, points[i].y);
    }
    previewContext.stroke();

    const d =
      `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)} ` +
      points
        .slice(1)
        .map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(" ");
    svgPaths.push(`<path d="${d}" fill="none"/>`);
    totalPoints += points.length;

    onProgress?.(lineIndex / lineCount, `line ${lineIndex}/${lineCount}`);
    if (lineIndex % refreshEvery === 0 || lineIndex === lineCount) {
      onPreview?.(preview);
    }
    if (performance.now() - lastYieldTime > 12) {
      await yieldToUi();
      lastYieldTime = performance.now();
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${backgroundColor}"/><g stroke="${lineColor}" stroke-width="${lineWidth}" stroke-opacity="${lineAlpha.toFixed(4)}" stroke-linecap="round" stroke-linejoin="round">${svgPaths.join("")}</g></svg>`;
  return {
    svg,
    preview,
    lineCount: svgPaths.length,
    pointCount: totalPoints,
    width,
    height,
  };
}

export async function generateDotsSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    tileSize: number;
    dotScale: number;
    jitter: number;
    sampleMode: "nearest" | "average";
    backgroundColor: string;
    stroke: boolean;
    strokeColor: string;
    strokeWidth: number;
    refreshEvery: number;
    seed: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<DotsResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }
  const pixels = sourceContext.getImageData(0, 0, width, height).data;

  const tileSize = clamp(options.tileSize, 2, 256);
  const dotScale = clamp(options.dotScale, 0.05, 2);
  const jitter = clamp(options.jitter, 0, 1);
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  const strokeColor = normalizeHexColor(options.strokeColor);
  const strokeWidth = clamp(options.strokeWidth, 0.1, 20);
  const refreshEvery = clamp(Math.round(options.refreshEvery), 1, 512);
  const sampleMode = options.sampleMode;
  const rng = createSeededRandom(options.seed);

  const cols = Math.max(1, Math.floor(width / tileSize));
  const rows = Math.max(1, Math.floor(height / tileSize));

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  previewContext.fillStyle = backgroundColor;
  previewContext.fillRect(0, 0, width, height);
  previewContext.lineJoin = "round";
  previewContext.lineCap = "round";

  const circles: string[] = [];
  let dotCount = 0;
  let lastYieldTime = performance.now();
  const dotRadius = (tileSize * dotScale) * 0.5;

  const sampleNearest = (cx: number, cy: number) => {
    const x = clamp(Math.round(cx), 0, width - 1);
    const y = clamp(Math.round(cy), 0, height - 1);
    const index = (y * width + x) * 4;
    return {
      r: pixels[index],
      g: pixels[index + 1],
      b: pixels[index + 2],
      a: pixels[index + 3] / 255,
    };
  };
  const sampleAverage = (left: number, top: number, right: number, bottom: number) => {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;
    let count = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * width + x) * 4;
        sumR += pixels[index];
        sumG += pixels[index + 1];
        sumB += pixels[index + 2];
        sumA += pixels[index + 3];
        count += 1;
      }
    }
    if (count <= 0) {
      return { r: 0, g: 0, b: 0, a: 1 };
    }
    return {
      r: sumR / count,
      g: sumG / count,
      b: sumB / count,
      a: (sumA / count) / 255,
    };
  };

  for (let row = 0; row <= rows; row += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const y = row * tileSize;
    for (let col = 0; col <= cols; col += 1) {
      const x = col * tileSize;
      const jitterX = (rng() - 0.5) * tileSize * jitter;
      const jitterY = (rng() - 0.5) * tileSize * jitter;
      const cx = clamp(x + jitterX, 0, width - 1);
      const cy = clamp(y + jitterY, 0, height - 1);

      const left = clamp(Math.floor(x), 0, width - 1);
      const top = clamp(Math.floor(y), 0, height - 1);
      const right = clamp(Math.ceil(x + tileSize), left + 1, width);
      const bottom = clamp(Math.ceil(y + tileSize), top + 1, height);
      const color = sampleMode === "average"
        ? sampleAverage(left, top, right, bottom)
        : sampleNearest(cx, cy);
      const fillCss = oil2RgbaCss(color.r, color.g, color.b, color.a);

      previewContext.fillStyle = fillCss;
      previewContext.beginPath();
      previewContext.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      previewContext.fill();
      if (options.stroke) {
        previewContext.strokeStyle = strokeColor;
        previewContext.lineWidth = strokeWidth;
        previewContext.stroke();
      }

      circles.push(
        `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${dotRadius.toFixed(2)}" fill="${fillCss}"${options.stroke ? ` stroke="${strokeColor}" stroke-width="${strokeWidth.toFixed(2)}"` : ""}/>`,
      );
      dotCount += 1;
    }

    onProgress?.((row + 1) / (rows + 1), `row ${row + 1}/${rows + 1}`);
    if ((row + 1) % refreshEvery === 0 || row === rows) {
      onPreview?.(preview);
    }
    if (performance.now() - lastYieldTime > 12) {
      await yieldToUi();
      lastYieldTime = performance.now();
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${backgroundColor}"/>${circles.join("")}</svg>`;
  return { svg, preview, dotCount, cols: cols + 1, rows: rows + 1, width, height };
}

export const ASCIIFY_CHARSETS = {
  minimalist: "#+-.",
  normal: "@%#*+=-:.",
  normal2: "&$Xx+;:.",
  alphabetic: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyz",
  numerical: "0896452317",
  extended: "@%#{}[]()<>^*+=~-:. ",
  math: "+-\u00d7\u00f7=\u2260\u2248\u221e\u221a\u03c0",
  arrow: "\u2191\u2197\u2192\u2198\u2193\u2199\u2190\u2196",
  grayscale: "@$BWM#*oahkbdpwmZO0QCJYXzcvnxrjft/|()1{}[]-_+~<>i!lI;:,\"^`'.",
  max: "\u00c6\u00d1\u00ca\u0152\u00d8M\u00c9\u00cb\u00c8\u00c3\u00c2WQB\u00c5\u00e6#N\u00c1\u00feE\u00c4\u00c0HKR\u017d\u0153Xg\u00d0\u00eaq\u00db\u0160\u00d5\u00d4A\u20ac\u00dfpm\u00e3\u00e2G\u00b6\u00f8\u00f0\u00e98\u00da\u00dc$\u00ebd\u00d9\u00fd\u00e8\u00d3\u00de\u00d6\u00e5\u00ff\u00d2b\u00a5FD\u00f1\u00e1ZP\u00e4\u0161\u00c7\u00e0h\u00fb\u00a7\u00ddk\u0178\u00aeS9\u017eUTe6\u00b5Oyx\u00ce\u00bef4\u00f55\u00f4\u00fa&a\u00fc\u21222\u00f9\u00e7w\u00a9Y\u00a30V\u00cdL\u00b13\u00cf\u00cc\u00f3C@n\u00f6\u00f2s\u00a2u\u2030\u00bd\u00bc\u2021zJ\u0192%\u00a4Itoc\u00eerjv1l\u00ed=\u00ef\u00ec<>i7\u2020[\u00bf?\u00d7}*{+()/\u00bb\u00ab\u2022\u00ac|!\u00a1\u00f7\u00a6\u00af\u2014^\u00aa\u201e\u201c\u201d~\u00b3\u00ba\u00b2\u2013\u00b0\u00ad\u00b9\u2039\u203a;:\u2019\u2018\u201a\u2019\u02dc\u02c6\u00b8\u2026\u00b7\u00a8\u00b4`",
  codepage437: "\u2588\u2593\u2592\u2591",
  blockelement: "\u2588",
} as const;

export type AsciifyCharsetPreset = keyof typeof ASCIIFY_CHARSETS;
export const ASCIIFY_CHARSET_PRESETS = Object.keys(ASCIIFY_CHARSETS) as AsciifyCharsetPreset[];

export async function generateAsciifyOutput(
  input: GraphImage,
  options: {
    maxWidth: number;
    columns: number;
    fontScale: number;
    charAspect: number;
    charset: string;
    invert: boolean;
    foregroundColor: string;
    backgroundColor: string;
    refreshEvery: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
  onPreview?: (preview: GraphImage) => void,
): Promise<AsciifyResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }

  const safeColumns = clamp(Math.round(options.columns), 16, 800);
  const safeCharAspect = clamp(options.charAspect, 0.25, 2);
  const rows = Math.max(8, Math.round((height / width) * safeColumns / safeCharAspect));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = safeColumns;
  sampleCanvas.height = rows;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) {
    throw new Error("2D context not available.");
  }
  sampleContext.drawImage(source, 0, 0, width, height, 0, 0, safeColumns, rows);
  const sampleData = sampleContext.getImageData(0, 0, safeColumns, rows).data;

  const charset = options.charset.length > 0 ? options.charset : "@%#{}[]()<>^*+=~-:. ";
  const cellWidth = width / safeColumns;
  const cellHeight = height / rows;
  const fontSize = Math.max(1, cellHeight * clamp(options.fontScale, 0.4, 2.2));
  const foregroundColor = normalizeHexColor(options.foregroundColor);
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  const refreshEvery = clamp(Math.round(options.refreshEvery), 1, 128);

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  previewContext.fillStyle = backgroundColor;
  previewContext.fillRect(0, 0, width, height);
  previewContext.fillStyle = foregroundColor;
  previewContext.font = `${fontSize}px monospace`;
  previewContext.textBaseline = "top";

  const lines: string[] = new Array(rows);
  const svgRows: string[] = [];
  for (let y = 0; y < rows; y += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    let textLine = "";
    for (let x = 0; x < safeColumns; x += 1) {
      const index = (y * safeColumns + x) * 4;
      const r = sampleData[index];
      const g = sampleData[index + 1];
      const b = sampleData[index + 2];
      const luminance = clamp(Math.round(0.299 * r + 0.587 * g + 0.114 * b), 0, 255);
      const normalized = options.invert ? 1 - luminance / 255 : luminance / 255;
      const charIndex = clamp(Math.floor(normalized * (charset.length - 1)), 0, charset.length - 1);
      textLine += charset[charIndex];
    }
    lines[y] = textLine;
    previewContext.fillText(textLine, 0, y * cellHeight);
    svgRows.push(
      `<text x="0" y="${(y * cellHeight).toFixed(2)}">${escapeXmlText(textLine)}</text>`,
    );

    const progress = (y + 1) / rows;
    onProgress?.(progress, `row ${y + 1}/${rows}`);
    if ((y + 1) % refreshEvery === 0 || y + 1 === rows) {
      onPreview?.(preview);
    }
    if ((y + 1) % 8 === 0) {
      await yieldToUi();
    }
  }

  const text = lines.join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${backgroundColor}"/><g fill="${foregroundColor}" font-family="monospace" font-size="${fontSize.toFixed(2)}" xml:space="preserve">${svgRows.join("")}</g></svg>`;
  return {
    svg,
    preview,
    text,
    rowCount: rows,
    colCount: safeColumns,
    width,
    height,
  };
}

interface StipplePoint {
  x: number;
  y: number;
  spacing: number;
  darkness: number;
}

interface StippleResult {
  svg: GraphSvg;
  preview: GraphImage;
  dotCount: number;
  width: number;
  height: number;
}

interface GridDotResult {
  svg: GraphSvg;
  preview: GraphImage;
  dotCount: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

function sampleCellGray(
  grayMap: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  samplesPerCell: number,
) {
  const sampleCount = clamp(Math.round(samplesPerCell), 1, 36);
  const side = Math.max(1, Math.round(Math.sqrt(sampleCount)));
  let sum = 0;
  let count = 0;
  for (let sy = 0; sy < side; sy += 1) {
    const ty = (sy + 0.5) / side;
    const py = clamp(Math.floor(top + (bottom - top) * ty), 0, height - 1);
    for (let sx = 0; sx < side; sx += 1) {
      const tx = (sx + 0.5) / side;
      const px = clamp(Math.floor(left + (right - left) * tx), 0, width - 1);
      sum += grayMap[py * width + px];
      count += 1;
    }
  }
  return count > 0 ? sum / count : 255;
}

export async function generateGridDotSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    gridCells: number;
    samplesPerCell: number;
    radiusMin: number;
    radiusMax: number;
    gamma: number;
    invert: boolean;
    dotColor: string;
    dotOpacity: number;
    backgroundMode: "transparent" | "color";
    backgroundColor: string;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
): Promise<GridDotResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const grayMap = createGrayMapFromImageData(imageData);

  const cols = clamp(Math.round(options.gridCells), 8, 1000);
  const rows = Math.max(1, Math.round((height / width) * cols));
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const maxCellRadius = Math.max(0.05, Math.min(cellWidth, cellHeight) * 0.5);
  const radiusMin = clamp(options.radiusMin, 0, maxCellRadius);
  const radiusMax = clamp(options.radiusMax, radiusMin, maxCellRadius);
  const gamma = clamp(options.gamma, 0.2, 4);
  const samplesPerCell = clamp(Math.round(options.samplesPerCell), 1, 36);
  const dotColor = normalizeHexColor(options.dotColor);
  const dotOpacity = clamp(options.dotOpacity, 0, 1);
  const backgroundColor = normalizeHexColor(options.backgroundColor);

  const circles: string[] = [];
  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }
  if (options.backgroundMode === "color") {
    previewContext.fillStyle = backgroundColor;
    previewContext.fillRect(0, 0, width, height);
  } else {
    previewContext.clearRect(0, 0, width, height);
  }
  previewContext.save();
  previewContext.fillStyle = dotColor;
  previewContext.globalAlpha = dotOpacity;

  let dotCount = 0;
  let lastYieldTime = performance.now();
  for (let row = 0; row < rows; row += 1) {
    const top = row * cellHeight;
    const bottom = (row + 1) * cellHeight;
    for (let col = 0; col < cols; col += 1) {
      const left = col * cellWidth;
      const right = (col + 1) * cellWidth;
      const gray = sampleCellGray(grayMap, width, height, left, top, right, bottom, samplesPerCell);
      let tone = gray / 255;
      if (options.invert) {
        tone = 1 - tone;
      }
      const radius = radiusMin + (tone ** gamma) * (radiusMax - radiusMin);
      if (radius <= 0.01) {
        continue;
      }

      const centerX = left + cellWidth * 0.5;
      const centerY = top + cellHeight * 0.5;
      previewContext.beginPath();
      previewContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
      previewContext.fill();
      circles.push(
        `<circle cx="${centerX.toFixed(2)}" cy="${centerY.toFixed(2)}" r="${radius.toFixed(2)}"/>`,
      );
      dotCount += 1;
    }

    onProgress?.((row + 1) / rows, `row ${row + 1}/${rows}`);
    if (performance.now() - lastYieldTime > 12) {
      await yieldToUi();
      lastYieldTime = performance.now();
      if (shouldCancel?.()) {
        return null;
      }
    }
  }
  previewContext.restore();

  const backgroundRect =
    options.backgroundMode === "color"
      ? `<rect width="100%" height="100%" fill="${backgroundColor}"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${backgroundRect}<g fill="${dotColor}" fill-opacity="${dotOpacity.toFixed(4)}">${circles.join("")}</g></svg>`;
  return { svg, preview, dotCount, width, height, cols, rows };
}

function createSeededRandom(seed: number) {
  let state = (Math.floor(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleGrayNormalized(grayMap: Uint8Array, width: number, height: number, x: number, y: number) {
  const px = clamp(x, 0, width - 1);
  const py = clamp(y, 0, height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;
  const i00 = grayMap[y0 * width + x0] / 255;
  const i10 = grayMap[y0 * width + x1] / 255;
  const i01 = grayMap[y1 * width + x0] / 255;
  const i11 = grayMap[y1 * width + x1] / 255;
  const ix0 = i00 + (i10 - i00) * tx;
  const ix1 = i01 + (i11 - i01) * tx;
  return clamp(ix0 + (ix1 - ix0) * ty, 0, 1);
}

function findCdfIndex(cdf: Float64Array, value: number) {
  let low = 0;
  let high = cdf.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (value <= cdf[middle]) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

export async function generateStippleSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    pointCount: number;
    darknessGamma: number;
    minSpacing: number;
    maxSpacing: number;
    relaxIterations: number;
    relaxRadius: number;
    attraction: number;
    repulsion: number;
    jitter: number;
    dotMinRadius: number;
    dotMaxRadius: number;
    dotGamma: number;
    dotColor: string;
    dotOpacity: number;
    backgroundMode: "transparent" | "color";
    backgroundColor: string;
    seed: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
): Promise<StippleResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const grayMap = createGrayMapFromImageData(imageData);
  const rng = createSeededRandom(options.seed);

  const pointCount = clamp(Math.round(options.pointCount), 50, 20000);
  const gamma = clamp(options.darknessGamma, 0.2, 4);
  const minSpacing = clamp(options.minSpacing, 0.25, 32);
  const maxSpacing = clamp(options.maxSpacing, minSpacing, 96);
  const relaxIterations = clamp(Math.round(options.relaxIterations), 0, 24);
  const relaxRadius = clamp(Math.round(options.relaxRadius), 1, 32);
  const attraction = clamp(options.attraction, 0, 1);
  const repulsion = clamp(options.repulsion, 0, 2);
  const jitter = clamp(options.jitter, 0, 3);
  const dotMinRadius = clamp(options.dotMinRadius, 0.1, 20);
  const dotMaxRadius = clamp(options.dotMaxRadius, dotMinRadius, 24);
  const dotGamma = clamp(options.dotGamma, 0.2, 3);
  const dotColor = normalizeHexColor(options.dotColor);
  const dotOpacity = clamp(options.dotOpacity, 0, 1);
  const backgroundColor = normalizeHexColor(options.backgroundColor);

  const weights = new Float64Array(width * height);
  const cdf = new Float64Array(width * height);
  let totalWeight = 0;
  for (let i = 0; i < grayMap.length; i += 1) {
    const darkness = clamp(1 - grayMap[i] / 255, 0, 1) ** gamma;
    const w = Math.max(1e-5, darkness);
    weights[i] = w;
    totalWeight += w;
    cdf[i] = totalWeight;
  }
  if (totalWeight <= 0) {
    return null;
  }

  const points: StipplePoint[] = [];
  const cellSize = Math.max(0.5, minSpacing);
  const gridCols = Math.max(1, Math.ceil(width / cellSize));
  const gridRows = Math.max(1, Math.ceil(height / cellSize));
  const grid: number[][] = Array.from({ length: gridCols * gridRows }, () => []);
  const cellIndexOf = (x: number, y: number) => {
    const gx = clamp(Math.floor(x / cellSize), 0, gridCols - 1);
    const gy = clamp(Math.floor(y / cellSize), 0, gridRows - 1);
    return gy * gridCols + gx;
  };
  const resetGrid = () => {
    grid.forEach((bucket) => {
      bucket.length = 0;
    });
    points.forEach((point, index) => {
      grid[cellIndexOf(point.x, point.y)].push(index);
    });
  };

  let attempts = 0;
  const maxAttempts = pointCount * 40;
  while (points.length < pointCount && attempts < maxAttempts) {
    attempts += 1;
    if (attempts % 2000 === 0) {
      if (shouldCancel?.()) {
        return null;
      }
      onProgress?.(Math.min(0.45, points.length / Math.max(1, pointCount) * 0.45), "sampling points");
      await yieldToUi();
    }

    const target = rng() * totalWeight;
    const pixelIndex = findCdfIndex(cdf, target);
    const baseX = pixelIndex % width;
    const baseY = Math.floor(pixelIndex / width);
    const x = clamp(baseX + (rng() - 0.5) * 1.8, 0, width - 1);
    const y = clamp(baseY + (rng() - 0.5) * 1.8, 0, height - 1);
    const darkness = clamp(1 - sampleGrayNormalized(grayMap, width, height, x, y), 0, 1);
    const spacing = maxSpacing - darkness * (maxSpacing - minSpacing);

    const gx = clamp(Math.floor(x / cellSize), 0, gridCols - 1);
    const gy = clamp(Math.floor(y / cellSize), 0, gridRows - 1);
    const range = Math.max(1, Math.ceil(maxSpacing / cellSize));
    let collides = false;
    for (let yy = Math.max(0, gy - range); yy <= Math.min(gridRows - 1, gy + range); yy += 1) {
      for (let xx = Math.max(0, gx - range); xx <= Math.min(gridCols - 1, gx + range); xx += 1) {
        const bucket = grid[yy * gridCols + xx];
        for (let i = 0; i < bucket.length; i += 1) {
          const other = points[bucket[i]];
          const minAllowed = Math.min(spacing, other.spacing) * 0.9;
          const dx = other.x - x;
          const dy = other.y - y;
          if (dx * dx + dy * dy < minAllowed * minAllowed) {
            collides = true;
            break;
          }
        }
        if (collides) {
          break;
        }
      }
      if (collides) {
        break;
      }
    }
    if (collides) {
      continue;
    }
    points.push({ x, y, spacing, darkness });
    grid[cellIndexOf(x, y)].push(points.length - 1);
  }

  onProgress?.(0.5, `sampled ${points.length} points`);
  await yieldToUi();

  let lastYieldTime = performance.now();
  for (let iteration = 0; iteration < relaxIterations; iteration += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    resetGrid();
    const nextPoints: StipplePoint[] = new Array(points.length);
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const gx = clamp(Math.floor(point.x / cellSize), 0, gridCols - 1);
      const gy = clamp(Math.floor(point.y / cellSize), 0, gridRows - 1);
      const range = Math.max(1, Math.ceil((point.spacing * 1.8) / cellSize));
      let pushX = 0;
      let pushY = 0;

      for (let yy = Math.max(0, gy - range); yy <= Math.min(gridRows - 1, gy + range); yy += 1) {
        for (let xx = Math.max(0, gx - range); xx <= Math.min(gridCols - 1, gx + range); xx += 1) {
          const bucket = grid[yy * gridCols + xx];
          for (let i = 0; i < bucket.length; i += 1) {
            const otherIndex = bucket[i];
            if (otherIndex === index) {
              continue;
            }
            const other = points[otherIndex];
            const dx = point.x - other.x;
            const dy = point.y - other.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < 1e-6) {
              continue;
            }
            const dist = Math.sqrt(distSq);
            const desired = Math.min(point.spacing, other.spacing);
            if (dist < desired * 1.25) {
              const force = ((desired * 1.25 - dist) / (desired * 1.25)) * repulsion;
              pushX += (dx / dist) * force;
              pushY += (dy / dist) * force;
            }
          }
        }
      }

      let weightSum = 0;
      let centroidX = 0;
      let centroidY = 0;
      const minX = Math.max(0, Math.floor(point.x - relaxRadius));
      const maxX = Math.min(width - 1, Math.ceil(point.x + relaxRadius));
      const minY = Math.max(0, Math.floor(point.y - relaxRadius));
      const maxY = Math.min(height - 1, Math.ceil(point.y + relaxRadius));
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = x + 0.5 - point.x;
          const dy = y + 0.5 - point.y;
          if (dx * dx + dy * dy > relaxRadius * relaxRadius) {
            continue;
          }
          const darkness = clamp(1 - grayMap[y * width + x] / 255, 0, 1) ** gamma;
          const w = Math.max(0, darkness);
          weightSum += w;
          centroidX += (x + 0.5) * w;
          centroidY += (y + 0.5) * w;
        }
      }

      const targetX = weightSum > 1e-6 ? centroidX / weightSum : point.x;
      const targetY = weightSum > 1e-6 ? centroidY / weightSum : point.y;
      const nextX = clamp(
        point.x +
          (targetX - point.x) * attraction +
          pushX +
          (rng() - 0.5) * jitter,
        0,
        width - 1,
      );
      const nextY = clamp(
        point.y +
          (targetY - point.y) * attraction +
          pushY +
          (rng() - 0.5) * jitter,
        0,
        height - 1,
      );
      const darkness = clamp(1 - sampleGrayNormalized(grayMap, width, height, nextX, nextY), 0, 1);
      const spacing = maxSpacing - darkness * (maxSpacing - minSpacing);
      nextPoints[index] = { x: nextX, y: nextY, spacing, darkness };

      if (performance.now() - lastYieldTime > 14) {
        await yieldToUi();
        lastYieldTime = performance.now();
        if (shouldCancel?.()) {
          return null;
        }
      }
    }

    for (let index = 0; index < points.length; index += 1) {
      points[index] = nextPoints[index];
    }
    onProgress?.(0.5 + ((iteration + 1) / Math.max(1, relaxIterations)) * 0.35, `relax ${iteration + 1}/${relaxIterations}`);
    await yieldToUi();
  }

  points.sort((a, b) => a.y - b.y || a.x - b.x);
  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D context not available.");
  }

  if (options.backgroundMode === "color") {
    previewContext.fillStyle = backgroundColor;
    previewContext.fillRect(0, 0, width, height);
  } else {
    previewContext.clearRect(0, 0, width, height);
  }

  previewContext.save();
  previewContext.fillStyle = dotColor;
  previewContext.globalAlpha = dotOpacity;
  const circles: string[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const radius = dotMinRadius + (point.darkness ** dotGamma) * (dotMaxRadius - dotMinRadius);
    const safeRadius = Math.max(0.05, radius);
    previewContext.beginPath();
    previewContext.arc(point.x, point.y, safeRadius, 0, Math.PI * 2);
    previewContext.fill();
    circles.push(
      `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${safeRadius.toFixed(2)}"/>`,
    );
  }
  previewContext.restore();

  const backgroundRect =
    options.backgroundMode === "color"
      ? `<rect width="100%" height="100%" fill="${backgroundColor}"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${backgroundRect}<g fill="${dotColor}" fill-opacity="${dotOpacity.toFixed(4)}">${circles.join("")}</g></svg>`;
  onProgress?.(1, "ready");
  return {
    svg,
    preview,
    dotCount: points.length,
    width,
    height,
  };
}

function appendSvgCrosshatchLine(
  lines: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  thickness: number,
  alpha: number,
) {
  if (x1 === x2 && y1 === y2) {
    return;
  }
  lines.push(
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${thickness}" stroke-opacity="${alpha}" stroke-linecap="round"/>`,
  );
}

export async function generateCrosshatchBnSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    levels: number;
    upscale: number;
    whiteThreshold: number;
    lineSpacing: number;
    lineThickness: number;
    lineColor: string;
    lineAlpha: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
): Promise<CrosshatchBnResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }

  const imageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const data = imageData.data;
  const levels = clamp(Math.round(options.levels), 2, 128);
  const quantizedLevelsData = new Uint8Array(sourceWidth * sourceHeight);
  const step = 256 / levels;
  for (let index = 0; index < data.length; index += 4) {
    const grayscale = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
    const levelIndex = Math.min(Math.floor(grayscale / step), levels - 1);
    quantizedLevelsData[index / 4] = levelIndex;
  }

  const upscale = clamp(Math.round(options.upscale), 1, 10);
  const outputWidth = sourceWidth * upscale;
  const outputHeight = sourceHeight * upscale;
  const lineSpacing = Math.max(1, Math.round(options.lineSpacing));
  const lineThickness = Math.max(0.1, options.lineThickness);
  const lineColor = normalizeHexColor(options.lineColor);
  const lineAlpha = clamp(options.lineAlpha, 0, 1);
  const whiteThreshold = clamp(Math.round(options.whiteThreshold), 0, 255);
  const totalAngleVariations = levels;
  const maxPerpendicularDist = Math.max(outputWidth, outputHeight) * 1.5;
  const totalLength = 2 * maxPerpendicularDist;
  const numStepsOnLine = Math.max(1, Math.floor(totalLength / Math.max(1, upscale / 2)));
  const lines: string[] = [];
  let lineCount = 0;
  let lastYieldTime = performance.now();

  for (let angleVariationIndex = 0; angleVariationIndex < totalAngleVariations; angleVariationIndex += 1) {
    if (shouldCancel?.()) {
      return null;
    }

    const angleRad =
      totalAngleVariations <= 1
        ? 0
        : (angleVariationIndex / (totalAngleVariations - 1)) * (Math.PI / 2);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    for (let p = -maxPerpendicularDist; p < maxPerpendicularDist; p += lineSpacing) {
      const centerX = outputWidth * 0.5;
      const centerY = outputHeight * 0.5;
      const lineStartX = centerX + p * sinA - maxPerpendicularDist * cosA;
      const lineStartY = centerY - p * cosA - maxPerpendicularDist * sinA;
      const lineEndX = centerX + p * sinA + maxPerpendicularDist * cosA;
      const lineEndY = centerY - p * cosA + maxPerpendicularDist * sinA;
      let activeSegment: { x1: number; y1: number; lastX: number; lastY: number } | null = null;

      for (let stepIndex = 0; stepIndex <= numStepsOnLine; stepIndex += 1) {
        const t = stepIndex / numStepsOnLine;
        const currentX = lineStartX + t * (lineEndX - lineStartX);
        const currentY = lineStartY + t * (lineEndY - lineStartY);
        const roundedCurrentX = Math.round(currentX);
        const roundedCurrentY = Math.round(currentY);
        let shouldDraw = false;

        if (
          roundedCurrentX >= 0 &&
          roundedCurrentX < outputWidth &&
          roundedCurrentY >= 0 &&
          roundedCurrentY < outputHeight
        ) {
          const originalX = Math.floor(roundedCurrentX / upscale);
          const originalY = Math.floor(roundedCurrentY / upscale);
          if (originalX >= 0 && originalX < sourceWidth && originalY >= 0 && originalY < sourceHeight) {
            const quantizedPixelIndex = originalY * sourceWidth + originalX;
            const pixelLevelIndex = quantizedLevelsData[quantizedPixelIndex];
            const pixelGrayscaleValue = Math.round(pixelLevelIndex * (255 / (levels - 1)));
            if (pixelGrayscaleValue < whiteThreshold) {
              const maxAnglesForDarkness = levels - pixelLevelIndex;
              if (angleVariationIndex < maxAnglesForDarkness) {
                shouldDraw = true;
              }
            }
          }
        }

        if (shouldDraw) {
          if (!activeSegment) {
            activeSegment = {
              x1: roundedCurrentX,
              y1: roundedCurrentY,
              lastX: roundedCurrentX,
              lastY: roundedCurrentY,
            };
          } else {
            activeSegment.lastX = roundedCurrentX;
            activeSegment.lastY = roundedCurrentY;
          }
        } else if (activeSegment) {
          appendSvgCrosshatchLine(
            lines,
            activeSegment.x1,
            activeSegment.y1,
            activeSegment.lastX,
            activeSegment.lastY,
            lineColor,
            lineThickness,
            lineAlpha,
          );
          lineCount += 1;
          activeSegment = null;
        }
      }

      if (activeSegment) {
        appendSvgCrosshatchLine(
          lines,
          activeSegment.x1,
          activeSegment.y1,
          activeSegment.lastX,
          activeSegment.lastY,
          lineColor,
          lineThickness,
          lineAlpha,
        );
        lineCount += 1;
      }

      if (performance.now() - lastYieldTime > 14) {
        await yieldToUi();
        lastYieldTime = performance.now();
        if (shouldCancel?.()) {
          return null;
        }
      }
    }

    onProgress?.(
      (angleVariationIndex + 1) / totalAngleVariations,
      `crosshatch ${Math.round(((angleVariationIndex + 1) / totalAngleVariations) * 100)}%`,
    );
    await yieldToUi();
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}"><rect width="100%" height="100%" fill="white"/>${lines.join("")}</svg>`;
  return {
    svg,
    lineCount,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
  };
}

function quantizeMatitaImage(imageData: ImageData, numLevels: number): MatitaQuantizedData {
  const { width, height, data } = imageData;
  const map = new Uint8Array(width * height);
  for (let index = 0; index < map.length; index += 1) {
    const offset = index * 4;
    const luminosity = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
    map[index] = Math.round(numLevels * (1 - luminosity / 255));
  }
  return { map, width, height };
}

function findNearestMatitaPoint(
  startX: number,
  startY: number,
  points: MatitaPoint[],
  isUsed: boolean[],
) {
  let bestIndex = -1;
  let minSqDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    if (isUsed[index]) {
      continue;
    }
    const point = points[index];
    const dx = point.x - startX;
    const dy = point.y - startY;
    const sqDistance = dx * dx + dy * dy;
    if (sqDistance < minSqDistance) {
      minSqDistance = sqDistance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function runMatitaSinglePass(level: number, quantizedData: MatitaQuantizedData) {
  const { map, width, height } = quantizedData;
  const pointsToVisit: MatitaPoint[] = [];
  const pointMap = new Map<number, number>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      if (map[id] >= level) {
        pointMap.set(id, pointsToVisit.length);
        pointsToVisit.push({ x, y });
      }
    }
  }

  if (!pointsToVisit.length) {
    return [] as MatitaPoint[][];
  }

  const isUsed = new Array(pointsToVisit.length).fill(false);
  const paths: MatitaPoint[][] = [];
  let pointsUsedCount = 0;
  let currentPointIndex = 0;
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];

  while (pointsUsedCount < pointsToVisit.length) {
    if (isUsed[currentPointIndex]) {
      currentPointIndex = isUsed.indexOf(false);
      if (currentPointIndex === -1) {
        break;
      }
    }

    const currentPath: MatitaPoint[] = [];
    let { x, y } = pointsToVisit[currentPointIndex];

    while (true) {
      currentPath.push({ x, y });
      isUsed[currentPointIndex] = true;
      pointsUsedCount += 1;

      let foundNext = false;
      for (const [dx, dy] of directions) {
        const nextX = x + dx;
        const nextY = y + dy;
        const nextId = nextY * width + nextX;
        if (!pointMap.has(nextId)) {
          continue;
        }
        const nextIndex = pointMap.get(nextId);
        if (nextIndex === undefined || isUsed[nextIndex]) {
          continue;
        }
        x = nextX;
        y = nextY;
        currentPointIndex = nextIndex;
        foundNext = true;
        break;
      }

      if (!foundNext) {
        paths.push(currentPath);
        currentPointIndex = findNearestMatitaPoint(x, y, pointsToVisit, isUsed);
        break;
      }
    }
  }

  return paths;
}

function matitaPerpendicularDistance(point: MatitaPoint, a: MatitaPoint, b: MatitaPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const px = point.x - a.x;
    const py = point.y - a.y;
    return Math.sqrt(px * px + py * py);
  }
  return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / Math.sqrt(dx * dx + dy * dy);
}

function rdpMatita(points: MatitaPoint[], epsilon: number): MatitaPoint[] {
  if (points.length < 3) {
    return points;
  }

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i += 1) {
    const distance = matitaPerpendicularDistance(points[i], points[0], points[end]);
    if (distance > dmax) {
      index = i;
      dmax = distance;
    }
  }

  if (dmax > epsilon) {
    const recA = rdpMatita(points.slice(0, index + 1), epsilon);
    const recB = rdpMatita(points.slice(index, end + 1), epsilon);
    return recA.slice(0, recA.length - 1).concat(recB);
  }

  return [points[0], points[end]];
}

export async function generateMatitaSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    iterations: number;
    simplification: number;
    lineWidth: number;
    lineColor: string;
    backgroundMode: "transparent" | "color";
    backgroundColor: string;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
): Promise<MatitaResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const totalIterations = clamp(Math.round(options.iterations), 1, 20);
  const quantizedData = quantizeMatitaImage(imageData, totalIterations);
  const allLevelPaths: MatitaPoint[][][] = [];
  let pathCount = 0;

  for (let level = 1; level <= totalIterations; level += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const passPaths = runMatitaSinglePass(level, quantizedData);
    pathCount += passPaths.length;
    allLevelPaths.push(passPaths);
    onProgress?.(level / totalIterations, `livello ${level}/${totalIterations}`);
    await yieldToUi();
  }

  const simplification = Math.max(0, options.simplification);
  const strokeWidth = Math.max(0.1, options.lineWidth);
  const strokeColor = normalizeHexColor(options.lineColor);
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  let svgPaths = "";
  allLevelPaths.forEach((passPaths) => {
    const opacity = 1 / totalIterations;
    let groupPaths = "";
    passPaths.forEach((path) => {
      const simplified = simplification > 0 ? rdpMatita(path, simplification) : path;
      if (simplified.length < 2) {
        return;
      }
      const d =
        `M${simplified[0].x},${simplified[0].y} ` +
        simplified
          .slice(1)
          .map((point) => `L${point.x},${point.y}`)
          .join(" ");
      groupPaths += `<path d="${d}"/>`;
    });
    if (groupPaths) {
      svgPaths += `<g stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${opacity.toFixed(4)}" fill="none" stroke-linecap="round" stroke-linejoin="round">${groupPaths}</g>`;
    }
  });

  const backgroundRect =
    options.backgroundMode === "color"
      ? `<rect width="100%" height="100%" fill="${backgroundColor}"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${backgroundRect}${svgPaths}</svg>`;
  return { svg, pathCount, width, height };
}

export async function marchingGraphImage(
  input: GraphImage,
  options: {
    levels: number;
    thresholdMin: number;
    thresholdMax: number;
    downscale: number;
    blur: number;
    simplify: number;
    highQuality: boolean;
    lineWidth: number;
    opacity: number;
    invert: boolean;
    colorMode: "gray" | "source";
  },
  shouldCancel?: () => boolean,
): Promise<MarchingResult | null> {
  const requestedScale = clamp(Math.round(options.downscale), 1, 8);
  const maxSampleSide = 96;
  const maxProcessingCells = options.highQuality ? 1400 : 900;
  const adaptiveScale = Math.max(
    requestedScale,
    Math.ceil(Math.max(input.width, input.height) / maxSampleSide),
  );
  let sampleScale = clamp(adaptiveScale, 1, 24);
  let sampledWidth = Math.max(8, Math.round(input.width / sampleScale));
  let sampledHeight = Math.max(8, Math.round(input.height / sampleScale));
  while (sampledWidth * sampledHeight > maxProcessingCells && sampleScale < 64) {
    sampleScale += 1;
    sampledWidth = Math.max(8, Math.round(input.width / sampleScale));
    sampledHeight = Math.max(8, Math.round(input.height / sampleScale));
  }
  const levels = clamp(Math.round(options.levels), 2, 8);
  const thresholdMin = clamp(options.thresholdMin, 0, 1);
  const thresholdMax = clamp(options.thresholdMax, thresholdMin, 1);
  const thresholdRange = Math.max(0.0001, thresholdMax - thresholdMin);

  const sampledCanvas = document.createElement("canvas");
  sampledCanvas.width = sampledWidth;
  sampledCanvas.height = sampledHeight;
  const sampledContext = sampledCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampledContext) {
    throw new Error("2D context not available.");
  }

  if (shouldCancel?.()) {
    return null;
  }

  sampledContext.clearRect(0, 0, sampledWidth, sampledHeight);
  sampledContext.filter = options.blur > 0 ? `blur(${options.blur}px)` : "none";
  sampledContext.drawImage(input, 0, 0, sampledWidth, sampledHeight);
  sampledContext.filter = "none";
  const imageData = sampledContext.getImageData(0, 0, sampledWidth, sampledHeight).data;

  const field: number[][] = [];
  const colorBins = Array.from({ length: levels }, () => ({
    r: 0,
    g: 0,
    b: 0,
    count: 0,
  }));

  let lastYieldTime = performance.now();
  for (let y = 0; y < sampledHeight; y += 1) {
    if (shouldCancel?.()) {
      return null;
    }

    const row: number[] = [];
    for (let x = 0; x < sampledWidth; x += 1) {
      const offset = (y * sampledWidth + x) * 4;
      const r = imageData[offset];
      const g = imageData[offset + 1];
      const b = imageData[offset + 2];
      const a = imageData[offset + 3] / 255;
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const tone = clamp(options.invert ? 1 - luminance * a : luminance * a, 0, 1);
      row.push(tone);

      const normalized = clamp((tone - thresholdMin) / thresholdRange, 0, 1);
      const binIndex = clamp(Math.round(normalized * (levels - 1)), 0, levels - 1);
      const bin = colorBins[binIndex];
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.count += 1;
    }
    field.push(row);

    if (performance.now() - lastYieldTime > 12) {
      await yieldToUi();
      if (shouldCancel?.()) {
        return null;
      }
      lastYieldTime = performance.now();
    }
  }

  const marchingSquares = getMarchingSquares();
  const simplifyFn = getSimplify();
  const outputDocument = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
  const outputRoot = outputDocument.documentElement as unknown as SVGSVGElement;
  outputRoot.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  outputRoot.setAttribute("width", String(input.width));
  outputRoot.setAttribute("height", String(input.height));
  outputRoot.setAttribute("viewBox", `0 0 ${input.width} ${input.height}`);
  outputRoot.setAttribute("fill", "none");

  let pathCount = 0;
  for (let index = 0; index < levels; index += 1) {
    if (shouldCancel?.()) {
      return null;
    }

    const t = thresholdMin + (thresholdRange * index) / Math.max(1, levels - 1);
    const segments = marchingSquares(field, t);
    if (!segments.length) {
      continue;
    }

    const polylines = stitchMarchingSegments(segments, sampleScale).map((polyline) => {
      if (options.simplify > 0 && polyline.length > 2) {
        return simplifyFn(polyline, options.simplify, options.highQuality);
      }
      return polyline;
    });

    const pathD = polylines
      .filter((polyline) => polyline.length >= 2)
      .map((polyline) => buildPolylinePath(polyline, 2, false))
      .join(" ");
    if (!pathD) {
      continue;
    }

    const bin = colorBins[index];
    const sourceColor =
      bin.count > 0
        ? `#${toHexColorChannel(bin.r / bin.count)}${toHexColorChannel(bin.g / bin.count)}${toHexColorChannel(bin.b / bin.count)}`
        : null;
    const gray = clamp(Math.round((options.invert ? 1 - t : t) * 255), 0, 255);
    const grayColor = `#${toHexColorChannel(gray)}${toHexColorChannel(gray)}${toHexColorChannel(gray)}`;

    const path = outputDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.setAttribute("stroke", options.colorMode === "source" ? (sourceColor ?? grayColor) : grayColor);
    path.setAttribute("stroke-opacity", String(clamp(options.opacity, 0, 1)));
    path.setAttribute("stroke-width", String(Math.max(0.1, options.lineWidth)));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    outputRoot.appendChild(path);
    pathCount += 1;

    if (performance.now() - lastYieldTime > 12) {
      await yieldToUi();
      if (shouldCancel?.()) {
        return null;
      }
      lastYieldTime = performance.now();
    }
  }

  return {
    svg: new XMLSerializer().serializeToString(outputRoot),
    pathCount,
    sampledWidth,
    sampledHeight,
  };
}

export function paletteBufferToHexColors(buffer: ArrayBuffer) {
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
