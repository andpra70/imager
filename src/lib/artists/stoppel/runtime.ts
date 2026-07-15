import type { GraphImage } from "../../../models/graphImage";
import type { GraphSvg } from "../../../models/graphSvg";
import type { StoppelDrawMode, StoppelOptions } from "./model";
import {
  clamp,
  fitSourceToMaxWidthCanvas,
  normalizeHexColor,
  sobelOperatorFromGrayscale,
  toGrayscaleImageData,
} from "../../nodeRegistrations/tools/shared";

interface StoppelResult {
  svg: GraphSvg;
  width: number;
  height: number;
  primitiveCount: number;
}

interface PreparedSource {
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

function createSvgShell(width: number, height: number, backgroundColor: string) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundColor}"/>`,
  ];
}

function finalizeSvg(parts: string[]) {
  return `${parts.join("")}</svg>`;
}

function toneScore(value: number, contrast: number, gamma: number) {
  const contrasted = clamp(value * contrast, 0, 1);
  return clamp(Math.pow(contrasted, gamma), 0, 1);
}

function prepareSource(input: GraphImage, options: StoppelOptions): PreparedSource {
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
  const darkness = new Float32Array(width * height);
  const pixels = grayscale.data;
  for (let index = 0; index < darkness.length; index += 1) {
    const lum = pixels[index * 4] / 255;
    darkness[index] = toneScore(1 - lum, options.contrast, options.gamma);
  }
  return { width, height, darkness, gradients };
}

function sampleField(field: Float32Array, width: number, height: number, x: number, y: number) {
  const ix = clamp(Math.round(x), 0, width - 1);
  const iy = clamp(Math.round(y), 0, height - 1);
  return field[iy * width + ix];
}

function findDarkestStart(source: PreparedSource) {
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < source.darkness.length; index += 5) {
    const score = source.darkness[index] + source.gradients.magnitudes[index] * 0.35;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return {
    x: bestIndex % source.width,
    y: Math.floor(bestIndex / source.width),
  };
}

function buildCircleOrTriangleSvg(
  mode: "circles" | "triangles",
  source: PreparedSource,
  options: StoppelOptions,
): StoppelResult {
  const svgParts = createSvgShell(source.width, source.height, normalizeHexColor(options.backgroundColor));
  svgParts.push(
    `<g fill="none" stroke="${normalizeHexColor(options.strokeColor)}" stroke-width="${Math.max(
      0.1,
      options.strokeWidth,
    )}" stroke-linecap="round" stroke-linejoin="round">`,
  );
  let primitiveCount = 0;
  const spacing = Math.max(2, options.spacing);
  const random = createSeededRandom(options.seed);

  for (let y = spacing * 0.5; y < source.height; y += spacing) {
    for (let x = spacing * 0.5; x < source.width; x += spacing) {
      const index = Math.round(y) * source.width + Math.round(x);
      const dark = source.darkness[index];
      if (dark < options.threshold) {
        continue;
      }
      const size = Math.max(0.2, dark * options.maxShapeSize);
      const jitterX = (random() - 0.5) * options.jitter * spacing;
      const jitterY = (random() - 0.5) * options.jitter * spacing;
      const centerX = clamp(x + jitterX, 0, source.width);
      const centerY = clamp(y + jitterY, 0, source.height);
      if (mode === "circles") {
        svgParts.push(
          `<circle cx="${centerX.toFixed(2)}" cy="${centerY.toFixed(2)}" r="${(size * 0.5).toFixed(2)}" stroke-opacity="${clamp(
            dark * 0.95 + 0.05,
            0.05,
            1,
          ).toFixed(3)}"/>`,
        );
      } else {
        const angle = source.gradients.directions[index] + Math.PI * 0.5;
        const radius = size * 0.75;
        const points: string[] = [];
        for (let vertex = 0; vertex < 3; vertex += 1) {
          const theta = angle + (Math.PI * 2 * vertex) / 3;
          const px = centerX + Math.cos(theta) * radius;
          const py = centerY + Math.sin(theta) * radius;
          points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
        }
        svgParts.push(
          `<polygon points="${points.join(" ")}" stroke-opacity="${clamp(dark * 0.95 + 0.05, 0.05, 1).toFixed(3)}"/>`,
        );
      }
      primitiveCount += 1;
    }
  }

  svgParts.push("</g>");
  return {
    svg: finalizeSvg(svgParts),
    width: source.width,
    height: source.height,
    primitiveCount,
  };
}

function buildTinyLinesSvg(source: PreparedSource, options: StoppelOptions): StoppelResult {
  const svgParts = createSvgShell(source.width, source.height, normalizeHexColor(options.backgroundColor));
  svgParts.push(
    `<g fill="none" stroke="${normalizeHexColor(options.strokeColor)}" stroke-width="${Math.max(
      0.1,
      options.strokeWidth,
    )}" stroke-linecap="round">`,
  );
  const random = createSeededRandom(options.seed);
  const spacing = Math.max(2, options.spacing * 0.55);
  let primitiveCount = 0;

  for (let y = spacing * 0.5; y < source.height; y += spacing) {
    for (let x = spacing * 0.5; x < source.width; x += spacing) {
      const index = Math.round(y) * source.width + Math.round(x);
      const dark = source.darkness[index];
      if (dark < options.threshold) {
        continue;
      }
      const repeats = Math.max(1, Math.round(dark * options.density));
      for (let iteration = 0; iteration < repeats; iteration += 1) {
        const angle =
          source.gradients.directions[index] +
          Math.PI * 0.5 +
          (random() - 0.5) * options.jitter * 1.6;
        const length = options.segmentLength * (0.6 + dark * 1.35) * (0.85 + random() * 0.3);
        const cx = x + (random() - 0.5) * spacing;
        const cy = y + (random() - 0.5) * spacing;
        const dx = Math.cos(angle) * length * 0.5;
        const dy = Math.sin(angle) * length * 0.5;
        svgParts.push(
          `<line x1="${(cx - dx).toFixed(2)}" y1="${(cy - dy).toFixed(2)}" x2="${(cx + dx).toFixed(
            2,
          )}" y2="${(cy + dy).toFixed(2)}" stroke-opacity="${clamp(0.15 + dark * 0.9, 0.1, 1).toFixed(3)}"/>`,
        );
        primitiveCount += 1;
      }
    }
  }

  svgParts.push("</g>");
  return {
    svg: finalizeSvg(svgParts),
    width: source.width,
    height: source.height,
    primitiveCount,
  };
}

function pickNextPoint(
  current: Point,
  previousAngle: number,
  source: PreparedSource,
  options: StoppelOptions,
  visited: Float32Array,
  random: () => number,
  mode: "scribble" | "doodle-line",
) {
  const candidateCount = mode === "scribble" ? 12 : 16;
  let bestPoint = current;
  let bestAngle = previousAngle;
  let bestScore = -Infinity;

  for (let candidate = 0; candidate < candidateCount; candidate += 1) {
    const spread = mode === "scribble" ? Math.PI * 1.1 : Math.PI * 2;
    const candidateAngle =
      previousAngle +
      ((candidate / Math.max(1, candidateCount - 1)) - 0.5) * spread +
      (random() - 0.5) * options.jitter * (mode === "scribble" ? 0.6 : 1.2);
    const nx = clamp(current.x + Math.cos(candidateAngle) * options.stepLength, 0, source.width - 1);
    const ny = clamp(current.y + Math.sin(candidateAngle) * options.stepLength, 0, source.height - 1);
    const index = Math.round(ny) * source.width + Math.round(nx);
    const dark = source.darkness[index];
    const edge = source.gradients.magnitudes[index];
    const inertia = Math.cos(candidateAngle - previousAngle);
    const visitPenalty = visited[index];
    const randomBias = (random() - 0.5) * (mode === "scribble" ? 0.08 : 0.24);
    const score =
      dark * (mode === "scribble" ? 1.5 : 1.05) +
      edge * options.edgeBoost +
      inertia * (mode === "scribble" ? 0.28 : 0.1) -
      visitPenalty * (mode === "scribble" ? 1.4 : 0.55) +
      randomBias;
    if (score > bestScore) {
      bestScore = score;
      bestPoint = { x: nx, y: ny };
      bestAngle = candidateAngle;
    }
  }

  return { point: bestPoint, angle: bestAngle };
}

function simplifyPath(points: Point[], epsilon: number) {
  if (points.length < 3 || epsilon <= 0) {
    return points;
  }
  const simplified: Point[] = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    if (dx * dx + dy * dy >= epsilon * epsilon) {
      simplified.push(current);
    }
  }
  simplified.push(points[points.length - 1]);
  return simplified;
}

async function buildSingleLineSvg(
  source: PreparedSource,
  options: StoppelOptions,
  mode: "scribble" | "doodle-line",
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status?: string) => void,
): Promise<StoppelResult | null> {
  const svgParts = createSvgShell(source.width, source.height, normalizeHexColor(options.backgroundColor));
  const visited = new Float32Array(source.width * source.height);
  const random = createSeededRandom(options.seed);
  const points: Point[] = [];
  let current = findDarkestStart(source);
  let angle = random() * Math.PI * 2;
  points.push(current);

  for (let step = 0; step < options.steps; step += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const next = pickNextPoint(current, angle, source, options, visited, random, mode);
    current = next.point;
    angle = next.angle;
    points.push(current);

    const centerIndex = Math.round(current.y) * source.width + Math.round(current.x);
    visited[centerIndex] = clamp(visited[centerIndex] + 0.2, 0, 3);

    if (step % 900 === 0 || step === options.steps - 1) {
      onProgress?.(step / Math.max(1, options.steps), `building ${mode} path`);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }

    if (step > 0 && step % Math.max(200, Math.round(options.steps / 12)) === 0 && mode === "doodle-line") {
      const restart = findDarkestStart(source);
      points.push(restart);
      current = restart;
      angle = random() * Math.PI * 2;
    }
  }

  const simplified = simplifyPath(points, mode === "scribble" ? 0.8 : 0.4);
  const pathData = simplified
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  svgParts.push(
    `<path d="${pathData}" fill="none" stroke="${normalizeHexColor(options.strokeColor)}" stroke-width="${Math.max(
      0.1,
      options.strokeWidth,
    )}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${mode === "scribble" ? "0.92" : "0.82"}"/>`,
  );

  return {
    svg: finalizeSvg(svgParts),
    width: source.width,
    height: source.height,
    primitiveCount: simplified.length,
  };
}

export async function generateStoppelSvg(
  input: GraphImage,
  options: StoppelOptions,
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status?: string) => void,
): Promise<StoppelResult | null> {
  const prepared = prepareSource(input, options);
  onProgress?.(0.12, "preparing source");
  if (shouldCancel?.()) {
    return null;
  }

  switch (options.mode as StoppelDrawMode) {
    case "circles":
      onProgress?.(0.45, "placing circles");
      return buildCircleOrTriangleSvg("circles", prepared, options);
    case "triangles":
      onProgress?.(0.45, "placing triangles");
      return buildCircleOrTriangleSvg("triangles", prepared, options);
    case "tiny-lines":
      onProgress?.(0.45, "placing tiny lines");
      return buildTinyLinesSvg(prepared, options);
    case "scribble":
      return buildSingleLineSvg(prepared, options, "scribble", shouldCancel, onProgress);
    case "doodle-line":
      return buildSingleLineSvg(prepared, options, "doodle-line", shouldCancel, onProgress);
    default:
      throw new Error(`Unsupported Stoppel mode: ${String(options.mode)}`);
  }
}
