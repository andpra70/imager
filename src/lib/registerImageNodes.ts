import "../vendor/bluenoise.js";
import "../vendor/imagetracer.1.2.6.js";
import "../vendor/pnnquant.js";
import "../vendor/simplify.js";
import type { ImageTracerOptions } from "../vendor/imagetracer.1.2.6.js";
import type { PnnQuantOptions, PnnQuantResult } from "../vendor/pnnquant.js";
import roughRuntime, { type RoughPathOptions, type RoughApi } from "../vendor/rough-runtime";
import marchingSquaresRuntime, { type MarchingSquaresFn } from "../vendor/p5-marching-runtime";
import { LiteGraph } from "litegraph.js";
import type { GraphImage } from "../models/graphImage";
import type { GraphPalette } from "../models/graphPalette";
import type { GraphSvg } from "../models/graphSvg";
import {
  blendGraphImages,
  brightnessContrastGraphImage,
  combineCmykChannels,
  combineRgbChannels,
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
  rotateGraphImage,
  resizeNodeForPreview,
  scaleGraphImage,
  splitCmykChannels,
  splitRgbChannels,
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

function getMarchingSquares() {
  if (!marchingSquaresRuntime || typeof (marchingSquaresRuntime as MarchingSquaresFn) !== "function") {
    throw new Error("p5.marching runtime is not available.");
  }

  return marchingSquaresRuntime as MarchingSquaresFn;
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
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

function formatExecutionInfo(executionMs: number | null) {
  if (executionMs === null || !Number.isFinite(executionMs)) {
    return "[-- ms]";
  }
  return `[${executionMs.toFixed(2)} ms]`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function simplifyGraphSvg(
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

function roughenGraphSvg(
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

async function marchingGraphImage(
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
  infoText = "no image";

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
      refreshNode(node, node.image, 1);
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
      this.infoText = formatGraphImageInfo(this.image);
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
      this.infoText = "no image";
      this.refreshPreviewLayout();
      return;
    }

    void deserializeGraphImage(serializedImage)
      .then((image) => {
        this.image = image;
        this.serializedImage = serializedImage;
        this.infoText = formatGraphImageInfo(this.image);
        this.refreshPreviewLayout();
        notifyGraphStateChange(this);
      })
      .catch(() => {
        this.image = null;
        this.serializedImage = null;
        this.infoText = "no image";
        this.refreshPreviewLayout();
      });
  }

  onExecute(this: LiteNode & InputImageNode) {
    this.setOutputData(0, this.image);
  }

  onDrawBackground(this: PreviewAwareNode & InputImageNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.image, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(this.infoText, 10, layout.footerTop + 12);
    context.restore();
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
    node.properties = {
      status: "requesting camera",
    };
    node.addOutput("image", "image");
    node.addWidget("button", "Grab", null, () => {
      if (node.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        node.image = drawSourceToCanvas(node.video);
        node.serializedImage = null;
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
  executionMs: number | null = null;

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
    const start = performance.now();
    const input = this.getInputData(0);
    this.preview = input ? invertGraphImage(input) : null;
    this.executionMs = performance.now() - start;
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

class GrayscaleToolNode {
  size: [number, number] = [280, 280];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

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
    const start = performance.now();
    const input = this.getInputData(0);
    this.preview = input ? grayscaleGraphImage(input) : null;
    this.executionMs = performance.now() - start;
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

class ThresholdToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

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
    const start = performance.now();
    const input = this.getInputData(0);
    const threshold = Number(this.properties.threshold ?? 128);
    this.preview = input ? thresholdGraphImage(input, threshold) : null;
    this.executionMs = performance.now() - start;
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

class BlurToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

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
    const start = performance.now();
    const input = this.getInputData(0);
    const radius = Number(this.properties.radius ?? 4);
    this.preview = input ? blurGraphImage(input, radius) : null;
    this.executionMs = performance.now() - start;
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

class ScaleToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & ScaleToolNode;
    node.title = createToolTitle("Scale");
    node.properties = { percent: 100 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Scale %",
      100,
      (value) => {
        node.properties.percent = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 400, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & ScaleToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const percent = Number(this.properties.percent ?? 100);
    this.preview = input ? scaleGraphImage(input, percent) : null;
    this.executionMs = performance.now() - start;
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & ScaleToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      this.preview ? `${this.preview.width}x${this.preview.height}` : "no output",
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class RotateToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & RotateToolNode;
    node.title = createToolTitle("Rotate");
    node.properties = { angle: 0 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Angle",
      0,
      (value) => {
        node.properties.angle = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -180, max: 180, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RotateToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const angle = Number(this.properties.angle ?? 0);
    this.preview = input ? rotateGraphImage(input, angle) : null;
    this.executionMs = performance.now() - start;
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RotateToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${Number(this.properties.angle ?? 0).toFixed(0)} deg`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class BrightnessContrastToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

  constructor() {
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
    this.preview = input
      ? brightnessContrastGraphImage(input, brightness, contrast, saturation)
      : null;
    this.executionMs = performance.now() - start;
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

class RgbSplitToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;
  r: GraphImage | null = null;
  g: GraphImage | null = null;
  b: GraphImage | null = null;
  executionMs: number | null = null;

  constructor() {
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
      this.executionMs = performance.now() - start;
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.setOutputData(2, null);
      this.refreshPreviewLayout();
      return;
    }

    const result = splitRgbChannels(input);
    this.r = result.r;
    this.g = result.g;
    this.b = result.b;
    this.preview = result.r;
    this.executionMs = performance.now() - start;
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

class CmykSplitToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;
  c: GraphImage | null = null;
  m: GraphImage | null = null;
  y: GraphImage | null = null;
  k: GraphImage | null = null;
  executionMs: number | null = null;

  constructor() {
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
      this.executionMs = performance.now() - start;
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.setOutputData(2, null);
      this.setOutputData(3, null);
      this.refreshPreviewLayout();
      return;
    }

    const result = splitCmykChannels(input);
    this.c = result.c;
    this.m = result.m;
    this.y = result.y;
    this.k = result.k;
    this.preview = result.k;
    this.executionMs = performance.now() - start;
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

class RgbCombineToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

  constructor() {
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
      this.executionMs = performance.now() - start;
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = combineRgbChannels(r, g, b);
    this.executionMs = performance.now() - start;
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

class CmykCombineToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

  constructor() {
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
      this.executionMs = performance.now() - start;
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = combineCmykChannels(c, m, y, k);
    this.executionMs = performance.now() - start;
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

class QuantizeToolNode {
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

class BlendToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;
  executionMs: number | null = null;

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
    const start = performance.now();
    const baseImage = this.getInputData(0);
    const layerImage = this.getInputData(1);

    if (!baseImage) {
      this.preview = null;
      this.executionMs = performance.now() - start;
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

    this.preview = blendGraphImages(baseImage, layerImage, {
      alpha: Number(this.properties.alpha ?? 0.5),
      mode: String(this.properties.mode ?? "normal") as BlendMode,
      offsetX: Number(this.properties.offsetX ?? 0),
      offsetY: Number(this.properties.offsetY ?? 0),
      scale: Number(this.properties.scale ?? 1),
    });
    this.executionMs = performance.now() - start;
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

class VectorizeToolNode {
  size: [number, number] = [280, 540];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  properties!: Record<string, unknown>;
  isRendering = false;
  executionMs: number | null = null;

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
    const start = performance.now();
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.executionMs = performance.now() - start;
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
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.svg = null;
            this.isRendering = false;
            this.executionMs = null;
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
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

class MarchingToolNode {
  size: [number, number] = [280, 520];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  pathCount = 0;
  sampledWidth = 0;
  sampledHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: MarchingToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & MarchingToolNode,
    preset: "fast" | "quality",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            levels: 4,
            thresholdMin: 0.14,
            thresholdMax: 0.9,
            downscale: 4,
            blur: 0.4,
            simplify: 1.8,
            highQuality: false,
            lineWidth: 1.3,
            opacity: 0.82,
          }
        : {
            levels: 8,
            thresholdMin: 0.06,
            thresholdMax: 0.94,
            downscale: 2,
            blur: 1.1,
            simplify: 0.5,
            highQuality: true,
            lineWidth: 1.2,
            opacity: 0.78,
          };

    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Levels", values.levels);
    this.setWidgetValue("Thr min", values.thresholdMin);
    this.setWidgetValue("Thr max", values.thresholdMax);
    this.setWidgetValue("Downscale", values.downscale);
    this.setWidgetValue("Blur", values.blur);
    this.setWidgetValue("Simplify", values.simplify);
    this.setWidgetValue("Line width", values.lineWidth);
    this.setWidgetValue("Opacity", values.opacity);
    this.setWidgetValue("HQ simplify", values.highQuality);
    this.setWidgetValue("Mode", preset);
    if (notify) {
      notifyGraphStateChange(this);
    }
    this.setDirtyCanvas(true, true);
  }

  markCustom(this: PreviewAwareNode & MarchingToolNode) {
    if (String(this.properties.preset ?? "quality") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Mode", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & MarchingToolNode;
    getMarchingSquares();
    node.title = createToolTitle("Marching");
    node.properties = {
      preset: "quality",
      levels: 6,
      thresholdMin: 0.1,
      thresholdMax: 0.9,
      downscale: 2,
      blur: 0.8,
      simplify: 0.7,
      highQuality: true,
      lineWidth: 1.4,
      opacity: 0.8,
      invert: false,
      colorMode: "source",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Mode", "quality", (value) => {
      const mode = String(value);
      if (mode === "fast" || mode === "quality") {
        node.applyPreset(mode, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["quality", "fast", "custom"] });
    node.addWidget("button", "Apply preset", null, () => {
      const selected = String(node.properties.preset ?? "quality");
      const preset = selected === "fast" ? "fast" : "quality";
      node.applyPreset(preset, true);
    });
    node.addWidget("slider", "Levels", 6, (value) => {
      node.properties.levels = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 2, max: 8, step: 1 });
    node.addWidget("slider", "Thr min", 0.1, (value) => {
      node.properties.thresholdMin = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Thr max", 0.9, (value) => {
      node.properties.thresholdMax = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Downscale", 2, (value) => {
      node.properties.downscale = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 8, step: 1 });
    node.addWidget("slider", "Blur", 0.8, (value) => {
      node.properties.blur = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.1, precision: 1 });
    node.addWidget("slider", "Simplify", 0.7, (value) => {
      node.properties.simplify = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 1.4, (value) => {
      node.properties.lineWidth = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Opacity", 0.8, (value) => {
      node.properties.opacity = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 1, step: 0.05, precision: 2 });
    node.addWidget("combo", "Colors", "source", (value) => {
      node.properties.colorMode = String(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { values: ["source", "gray"] });
    node.addWidget("toggle", "Invert", false, (value) => {
      node.properties.invert = Boolean(value);
      node.markCustom();
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "HQ simplify", true, (value) => {
      node.properties.highQuality = Boolean(value);
      node.markCustom();
      notifyGraphStateChange(node);
    });

    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.applyPreset("quality", false);
    node.refreshPreviewLayout();
  }

  getMarchingOptions(this: PreviewAwareNode & MarchingToolNode) {
    return {
      levels: Math.round(Number(this.properties.levels ?? 6)),
      thresholdMin: Number(this.properties.thresholdMin ?? 0.1),
      thresholdMax: Number(this.properties.thresholdMax ?? 0.9),
      downscale: Math.round(Number(this.properties.downscale ?? 2)),
      blur: Number(this.properties.blur ?? 0.8),
      simplify: Number(this.properties.simplify ?? 0.7),
      highQuality: Boolean(this.properties.highQuality ?? true),
      lineWidth: Number(this.properties.lineWidth ?? 1.4),
      opacity: Number(this.properties.opacity ?? 0.8),
      invert: Boolean(this.properties.invert ?? false),
      colorMode: String(this.properties.colorMode ?? "source") as "gray" | "source",
    };
  }

  onExecute(this: PreviewAwareNode & MarchingToolNode) {
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.pathCount = 0;
      this.sampledWidth = 0;
      this.sampledHeight = 0;
      this.isRendering = false;
      this.executionMs = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getMarchingOptions();
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      this.isRendering = true;
      const start = performance.now();
      this.setDirtyCanvas(true, true);

      void marchingGraphImage(input, options, () => renderToken !== this.renderToken)
        .then((result) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          if (!result) {
            return;
          }
          this.svg = result.svg;
          this.pathCount = result.pathCount;
          this.sampledWidth = result.sampledWidth;
          this.sampledHeight = result.sampledHeight;
          this.executionMs = performance.now() - start;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview ?? null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch(() => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = null;
          this.svg = null;
          this.pathCount = 0;
          this.sampledWidth = 0;
          this.sampledHeight = 0;
          this.isRendering = false;
          this.executionMs = null;
          this.lastSignature = "";
          this.lastOptionsSignature = "";
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & MarchingToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const status = this.isRendering ? "rendering..." : "ready";
    const mode = String(this.properties.preset ?? "custom");
    context.fillText(`isolines: ${this.pathCount} | ${status} | ${mode}`, 10, layout.footerTop + 12);
    context.fillText(
      `sample: ${this.sampledWidth || "-"}x${this.sampledHeight || "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

class RoughToolNode {
  size: [number, number] = [280, 540];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  lastSvg = "";
  lastOptionsSignature = "";
  renderToken = 0;
  pathCount = 0;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & RoughToolNode;
    getRough();
    node.title = createToolTitle("Rough");
    node.properties = {
      roughness: 1.5,
      bowing: 1,
      strokeWidth: 1.2,
      fillStyle: "hachure",
      hachureAngle: -41,
      hachureGap: 4,
      fillWeight: 1,
      simplification: 0,
      curveStepCount: 9,
      maxRandomnessOffset: 2,
      seed: 1,
      disableMultiStroke: false,
      preserveStroke: true,
      preserveFill: true,
    };
    node.addInput("svg", "svg");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Roughness", 1.5, (value) => {
      node.properties.roughness = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.05, precision: 2 });
    node.addWidget("slider", "Bowing", 1, (value) => {
      node.properties.bowing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.05, precision: 2 });
    node.addWidget("slider", "Stroke", 1.2, (value) => {
      node.properties.strokeWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("combo", "Fill style", "hachure", (value) => {
      node.properties.fillStyle = String(value);
      notifyGraphStateChange(node);
    }, { values: ["hachure", "solid", "zigzag", "cross-hatch", "dots", "dashed", "zigzag-line"] });
    node.addWidget("slider", "Hach gap", 4, (value) => {
      node.properties.hachureGap = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 24, step: 0.5, precision: 1 });
    node.addWidget("slider", "Hach angle", -41, (value) => {
      node.properties.hachureAngle = Number(value);
      notifyGraphStateChange(node);
    }, { min: -180, max: 180, step: 1 });
    node.addWidget("slider", "Fill weight", 1, (value) => {
      node.properties.fillWeight = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Simplify", 0, (value) => {
      node.properties.simplification = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Curve steps", 9, (value) => {
      node.properties.curveStepCount = Number(value);
      notifyGraphStateChange(node);
    }, { min: 4, max: 30, step: 1 });
    node.addWidget("slider", "Random off", 2, (value) => {
      node.properties.maxRandomnessOffset = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 16, step: 0.1, precision: 1 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 9999, step: 1 });
    node.addWidget("toggle", "Mono stroke", false, (value) => {
      node.properties.disableMultiStroke = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Keep stroke", true, (value) => {
      node.properties.preserveStroke = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Keep fill", true, (value) => {
      node.properties.preserveFill = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  getRoughOptions(this: PreviewAwareNode & RoughToolNode) {
    return {
      roughness: Number(this.properties.roughness ?? 1.5),
      bowing: Number(this.properties.bowing ?? 1),
      strokeWidth: Number(this.properties.strokeWidth ?? 1.2),
      fillStyle: String(this.properties.fillStyle ?? "hachure") as RoughPathOptions["fillStyle"],
      hachureAngle: Number(this.properties.hachureAngle ?? -41),
      hachureGap: Number(this.properties.hachureGap ?? 4),
      fillWeight: Number(this.properties.fillWeight ?? 1),
      simplification: Number(this.properties.simplification ?? 0),
      curveStepCount: Math.round(Number(this.properties.curveStepCount ?? 9)),
      maxRandomnessOffset: Number(this.properties.maxRandomnessOffset ?? 2),
      seed: Math.round(Number(this.properties.seed ?? 1)),
      disableMultiStroke: Boolean(this.properties.disableMultiStroke ?? false),
      preserveStroke: Boolean(this.properties.preserveStroke ?? true),
      preserveFill: Boolean(this.properties.preserveFill ?? true),
      fallbackStroke: "#101010",
      fallbackFill: "none",
    };
  }

  onExecute(this: PreviewAwareNode & RoughToolNode) {
    const start = performance.now();
    const svg = this.getInputData(0);
    const inputSvg = typeof svg === "string" ? svg : null;
    if (!inputSvg) {
      this.svg = null;
      this.preview = null;
      this.pathCount = 0;
      this.lastSvg = "";
      this.lastOptionsSignature = "";
      this.executionMs = performance.now() - start;
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = this.getRoughOptions();
    const optionsSignature = JSON.stringify(options);

    if (inputSvg !== this.lastSvg || optionsSignature !== this.lastOptionsSignature) {
      this.lastSvg = inputSvg;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;

      try {
        const transformed = roughenGraphSvg(inputSvg, options);
        this.svg = transformed.svg;
        this.pathCount = transformed.pathCount;
        void rasterizeGraphSvg(transformed.svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.executionMs = null;
            this.setDirtyCanvas(true, true);
          });
      } catch {
        this.svg = null;
        this.preview = null;
        this.pathCount = 0;
        this.executionMs = null;
        this.lastSvg = "";
        this.lastOptionsSignature = "";
      }
    }

    this.setOutputData(0, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RoughToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`rough paths: ${this.pathCount}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class SvgSimplifyToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  pathCount = 0;
  inputBytes = 0;
  outputBytes = 0;
  lastSvg = "";
  lastOptionsSignature = "";
  renderToken = 0;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & SvgSimplifyToolNode;
    getSimplify();
    node.title = createToolTitle("SVG Simplify");
    node.properties = {
      tolerance: 1.2,
      sampleStep: 2.5,
      precision: 2,
      highQuality: true,
      minify: true,
    };
    node.addInput("svg", "svg");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Tolerance", 1.2, (value) => {
      node.properties.tolerance = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.05, precision: 2 });
    node.addWidget("slider", "Sample step", 2.5, (value) => {
      node.properties.sampleStep = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 12, step: 0.1, precision: 1 });
    node.addWidget("slider", "Precision", 2, (value) => {
      node.properties.precision = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 1 });
    node.addWidget("toggle", "High quality", true, (value) => {
      node.properties.highQuality = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Minify", true, (value) => {
      node.properties.minify = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  getSimplifyOptions(this: PreviewAwareNode & SvgSimplifyToolNode) {
    return {
      tolerance: Number(this.properties.tolerance ?? 1.2),
      sampleStep: Number(this.properties.sampleStep ?? 2.5),
      precision: Math.round(Number(this.properties.precision ?? 2)),
      highQuality: Boolean(this.properties.highQuality ?? true),
      minify: Boolean(this.properties.minify ?? true),
    };
  }

  onExecute(this: PreviewAwareNode & SvgSimplifyToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const inputSvg = typeof input === "string" ? input : null;
    if (!inputSvg) {
      this.svg = null;
      this.preview = null;
      this.pathCount = 0;
      this.inputBytes = 0;
      this.outputBytes = 0;
      this.lastSvg = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.executionMs = performance.now() - start;
      this.refreshPreviewLayout();
      return;
    }

    const options = this.getSimplifyOptions();
    const optionsSignature = JSON.stringify(options);
    this.inputBytes = new Blob([inputSvg]).size;

    if (inputSvg !== this.lastSvg || optionsSignature !== this.lastOptionsSignature) {
      this.lastSvg = inputSvg;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;

      try {
        const result = simplifyGraphSvg(inputSvg, options);
        this.svg = result.svg;
        this.pathCount = result.pathCount;
        this.outputBytes = new Blob([result.svg]).size;
        void rasterizeGraphSvg(result.svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.executionMs = null;
            this.setDirtyCanvas(true, true);
          });
      } catch {
        this.svg = null;
        this.preview = null;
        this.pathCount = 0;
        this.outputBytes = 0;
        this.executionMs = null;
        this.lastSvg = "";
        this.lastOptionsSignature = "";
      }
    }

    this.setOutputData(0, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SvgSimplifyToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    const gain =
      this.inputBytes > 0
        ? Math.max(0, ((this.inputBytes - this.outputBytes) / this.inputBytes) * 100)
        : 0;
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${this.pathCount} paths | ${this.inputBytes} -> ${this.outputBytes} bytes`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(`size reduction: ${gain.toFixed(1)}%`, 10, layout.footerTop + 30);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

class OutputImageNode {
  image: GraphImage | null = null;
  size: [number, number] = [320, 300];
  infoText = "no image";
  lastSignature = "";

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
      refreshNode(node, node.image, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OutputImageNode) {
    this.image = this.getInputData(0) ?? null;
    const signature = getGraphImageSignature(this.image);
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.infoText = formatGraphImageInfo(this.image);
    }
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OutputImageNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.image, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(this.infoText, 10, layout.footerTop + 12);
    context.restore();
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
  LiteGraph.registerNodeType("tools/scale", ScaleToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/rotate", RotateToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/brightness-contrast", BrightnessContrastToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/rgb-split", RgbSplitToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/cmyk-split", CmykSplitToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/cymk-split", CmykSplitToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/rgb-combine", RgbCombineToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/cmyk-combine", CmykCombineToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/cymk-combine", CmykCombineToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/quantize", QuantizeToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/blend", BlendToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/vectorize", VectorizeToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/marching", MarchingToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/rough", RoughToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("tools/svg-simplify", SvgSimplifyToolNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("output/image", OutputImageNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("output/palette", OutputPaletteNode as unknown as NodeCtor);
  LiteGraph.registerNodeType("output/svg", OutputSvgNode as unknown as NodeCtor);
  registered = true;
}
