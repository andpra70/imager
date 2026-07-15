import type { GraphImage } from "../../../models/graphImage";
import type { GraphSvg } from "../../../models/graphSvg";
import type { U111166DrawMode, U111166Options } from "./model";
import {
  clamp,
  fitSourceToMaxWidthCanvas,
  normalizeHexColor,
  sobelOperatorFromGrayscale,
  toGrayscaleImageData,
} from "../../nodeRegistrations/tools/shared";

interface U111166Result {
  svg: GraphSvg;
  width: number;
  height: number;
  curveCount: number;
}

interface PreparedImage {
  width: number;
  height: number;
  darkness: Float32Array;
  gradients: ReturnType<typeof sobelOperatorFromGrayscale>;
}

interface Point {
  x: number;
  y: number;
}

function createSeededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function toneScore(value: number, contrast: number, gamma: number) {
  const contrasted = clamp(value * contrast, 0, 1);
  return clamp(Math.pow(contrasted, gamma), 0, 1);
}

function prepareImage(input: GraphImage, options: U111166Options): PreparedImage {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const grayscale = toGrayscaleImageData(imageData);
  const gradients = sobelOperatorFromGrayscale(grayscale);
  const pixels = grayscale.data;
  const darkness = new Float32Array(width * height);
  for (let index = 0; index < darkness.length; index += 1) {
    const lum = pixels[index * 4] / 255;
    darkness[index] = toneScore(1 - lum, options.contrast, options.gamma);
  }
  return { width, height, darkness, gradients };
}

function createSvgFrame(width: number, height: number, backgroundColor: string, strokeColor: string, strokeWidth: number) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundColor}"/>`,
    `<g fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`,
  ];
}

function sampleDarkness(image: PreparedImage, x: number, y: number) {
  const px = clamp(Math.round(x), 0, image.width - 1);
  const py = clamp(Math.round(y), 0, image.height - 1);
  return image.darkness[py * image.width + px];
}

function sampleDirection(image: PreparedImage, x: number, y: number) {
  const px = clamp(Math.round(x), 0, image.width - 1);
  const py = clamp(Math.round(y), 0, image.height - 1);
  return image.gradients.directions[py * image.width + px];
}

function sampleMagnitude(image: PreparedImage, x: number, y: number) {
  const px = clamp(Math.round(x), 0, image.width - 1);
  const py = clamp(Math.round(y), 0, image.height - 1);
  return image.gradients.magnitudes[py * image.width + px];
}

function quadraticPath(start: Point, control: Point, end: Point) {
  return `M${start.x.toFixed(2)} ${start.y.toFixed(2)} Q${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

async function buildMessyCurvesSvg(
  image: PreparedImage,
  options: U111166Options,
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status?: string) => void,
): Promise<U111166Result | null> {
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  const strokeColor = normalizeHexColor(options.strokeColor);
  const svg = createSvgFrame(image.width, image.height, backgroundColor, strokeColor, Math.max(0.1, options.strokeWidth));
  const random = createSeededRandom(options.seed);
  let curveCount = 0;
  const spacing = Math.max(4, options.spacing);
  const totalRows = Math.max(1, Math.ceil(image.height / spacing) * Math.max(1, options.passes));

  for (let pass = 0; pass < options.passes; pass += 1) {
    for (let y = spacing * 0.5; y < image.height; y += spacing) {
      if (shouldCancel?.()) {
        return null;
      }
      for (let x = spacing * 0.5; x < image.width; x += spacing) {
        const dark = sampleDarkness(image, x, y);
        if (dark < options.threshold) {
          continue;
        }
        const direction = sampleDirection(image, x, y) + Math.PI * 0.5;
        const magnitude = sampleMagnitude(image, x, y);
        const localCount = Math.max(1, Math.round(dark * options.density));
        for (let index = 0; index < localCount; index += 1) {
          const length = options.curveLength * (0.5 + dark + magnitude * 0.7);
          const offsetAngle = direction + (random() - 0.5) * options.jitter;
          const bend = options.curveBend * length * (random() - 0.5);
          const centerX = x + (random() - 0.5) * spacing;
          const centerY = y + (random() - 0.5) * spacing;
          const dx = Math.cos(offsetAngle) * length * 0.5;
          const dy = Math.sin(offsetAngle) * length * 0.5;
          const nx = -Math.sin(offsetAngle);
          const ny = Math.cos(offsetAngle);
          const start = { x: centerX - dx, y: centerY - dy };
          const end = { x: centerX + dx, y: centerY + dy };
          const control = { x: centerX + nx * bend, y: centerY + ny * bend };
          svg.push(`<path d="${quadraticPath(start, control, end)}" stroke-opacity="${clamp(0.08 + dark * 0.78, 0.08, 0.95).toFixed(3)}"/>`);
          curveCount += 1;
        }
      }
      const progress = (pass * Math.ceil(image.height / spacing) + y / spacing) / totalRows;
      onProgress?.(progress, "drawing messy curves");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  svg.push("</g></svg>");
  return {
    svg: svg.join(""),
    width: image.width,
    height: image.height,
    curveCount,
  };
}

function chooseSeedPoints(image: PreparedImage, count: number) {
  const seeds: Array<{ x: number; y: number; score: number }> = [];
  for (let y = 2; y < image.height - 2; y += 3) {
    for (let x = 2; x < image.width - 2; x += 3) {
      const dark = sampleDarkness(image, x, y);
      const edge = sampleMagnitude(image, x, y);
      const score = dark * 0.75 + edge * 0.9;
      if (score <= 0.18) {
        continue;
      }
      seeds.push({ x, y, score });
    }
  }
  seeds.sort((a, b) => b.score - a.score);
  return seeds.slice(0, Math.max(1, count));
}

async function buildSketch650836Svg(
  image: PreparedImage,
  options: U111166Options,
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status?: string) => void,
): Promise<U111166Result | null> {
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  const strokeColor = normalizeHexColor(options.strokeColor);
  const svg = createSvgFrame(image.width, image.height, backgroundColor, strokeColor, Math.max(0.1, options.strokeWidth));
  const random = createSeededRandom(options.seed);
  const seeds = chooseSeedPoints(image, Math.round((image.width * image.height) / (options.spacing * options.spacing * 2.8)));
  let curveCount = 0;

  for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const seed = seeds[seedIndex];
    const dark = sampleDarkness(image, seed.x, seed.y);
    const edge = sampleMagnitude(image, seed.x, seed.y);
    const baseDirection = sampleDirection(image, seed.x, seed.y);
    const branchCount = Math.max(1, Math.round(dark * (options.density + 0.5)));

    for (let branch = 0; branch < branchCount; branch += 1) {
      const angle = baseDirection + (random() - 0.5) * Math.PI * (0.6 + options.jitter);
      const length = options.curveLength * (0.6 + dark * 1.8 + edge);
      const spread = options.curveBend * length * (0.3 + random() * 0.7);
      const start = {
        x: seed.x + Math.cos(angle) * (random() - 0.5) * options.spacing,
        y: seed.y + Math.sin(angle) * (random() - 0.5) * options.spacing,
      };
      const end = {
        x: clamp(start.x + Math.cos(angle) * length, 0, image.width),
        y: clamp(start.y + Math.sin(angle) * length, 0, image.height),
      };
      const midX = (start.x + end.x) * 0.5;
      const midY = (start.y + end.y) * 0.5;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const control = {
        x: clamp(midX + nx * spread * (branch % 2 === 0 ? 1 : -1), 0, image.width),
        y: clamp(midY + ny * spread * (branch % 2 === 0 ? 1 : -1), 0, image.height),
      };
      svg.push(`<path d="${quadraticPath(start, control, end)}" stroke-opacity="${clamp(0.06 + dark * 0.74, 0.06, 0.92).toFixed(3)}"/>`);
      curveCount += 1;
    }

    if (seedIndex % 40 === 0 || seedIndex === seeds.length - 1) {
      onProgress?.(seedIndex / Math.max(1, seeds.length - 1), "drawing sketch 650836");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  svg.push("</g></svg>");
  return {
    svg: svg.join(""),
    width: image.width,
    height: image.height,
    curveCount,
  };
}

async function buildCenterPaintSvg(
  image: PreparedImage,
  options: U111166Options,
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status?: string) => void,
): Promise<U111166Result | null> {
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  const strokeColor = normalizeHexColor(options.strokeColor);
  const svg = createSvgFrame(image.width, image.height, backgroundColor, strokeColor, Math.max(0.1, options.strokeWidth));
  const random = createSeededRandom(options.seed);
  const points: Point[] = [{ x: image.width / 2, y: image.height / 2 }];
  let current = points[0];
  let angle = random() * Math.PI * 2;

  for (let step = 0; step < options.iterations; step += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const dark = sampleDarkness(image, current.x, current.y);
    const edge = sampleMagnitude(image, current.x, current.y);
    const flow = sampleDirection(image, current.x, current.y) + Math.PI * 0.5;
    angle =
      angle * 0.4 +
      flow * (0.45 + edge * 0.35) +
      (random() - 0.5) * options.jitter * 0.9 +
      Math.sin(step * 0.01) * 0.04;
    const stepSize = options.curveLength * 0.08 * (0.6 + dark * 1.8 + edge * 0.8);
    let next = {
      x: current.x + Math.cos(angle) * stepSize,
      y: current.y + Math.sin(angle) * stepSize,
    };
    if (next.x < 0 || next.x >= image.width || next.y < 0 || next.y >= image.height) {
      angle += Math.PI * (0.65 + random() * 0.7);
      next = {
        x: clamp(current.x + Math.cos(angle) * stepSize, 0, image.width - 1),
        y: clamp(current.y + Math.sin(angle) * stepSize, 0, image.height - 1),
      };
    }
    points.push(next);
    current = next;

    if (step % 600 === 0 || step === options.iterations - 1) {
      onProgress?.(step / Math.max(1, options.iterations), "drawing center paint");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  const pathData = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  svg.push(`<path d="${pathData}" stroke-opacity="0.88"/>`);
  svg.push("</g></svg>");
  return {
    svg: svg.join(""),
    width: image.width,
    height: image.height,
    curveCount: points.length,
  };
}

export async function generateU111166Svg(
  input: GraphImage,
  options: U111166Options,
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status?: string) => void,
): Promise<U111166Result | null> {
  const image = prepareImage(input, options);
  onProgress?.(0.08, "preparing source");
  if (shouldCancel?.()) {
    return null;
  }
  switch (options.mode as U111166DrawMode) {
    case "messy-curves":
      return buildMessyCurvesSvg(image, options, shouldCancel, onProgress);
    case "sketch-650836":
      return buildSketch650836Svg(image, options, shouldCancel, onProgress);
    case "center-paint":
      return buildCenterPaintSvg(image, options, shouldCancel, onProgress);
    default:
      throw new Error(`Unsupported mode: ${String(options.mode)}`);
  }
}
