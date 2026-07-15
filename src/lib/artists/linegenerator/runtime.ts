import type { GraphImage } from "../../../models/graphImage";
import type { GraphSvg } from "../../../models/graphSvg";
import {
  clamp,
  fitSourceToMaxWidthCanvas,
  normalizeHexColor,
  toGrayscaleImageData,
} from "../../nodeRegistrations/tools/shared";
import type { LineGeneratorOptions } from "./model";

interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface LineGeneratorResult {
  svg: GraphSvg;
  width: number;
  height: number;
  lineCount: number;
}

interface PreparedImage {
  width: number;
  height: number;
  darkness: Float32Array;
}

function createSeededRandom(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function prepareImage(input: GraphImage, options: LineGeneratorOptions): PreparedImage {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const grayscale = toGrayscaleImageData(imageData);
  const darkness = new Float32Array(width * height);
  const pixels = grayscale.data;
  for (let index = 0; index < darkness.length; index += 1) {
    const lum = pixels[index * 4] / 255;
    const contrasted = clamp((1 - lum) * options.contrast, 0, 1);
    darkness[index] = clamp(Math.pow(contrasted, options.gamma) * options.darknessBias, 0, 1);
  }
  return { width, height, darkness };
}

function sampleDarkness(image: PreparedImage, x: number, y: number) {
  const px = clamp(Math.round(x), 0, image.width - 1);
  const py = clamp(Math.round(y), 0, image.height - 1);
  return image.darkness[py * image.width + px];
}

function clampLineToBounds(line: LineSegment, width: number, height: number): LineSegment {
  return {
    x1: clamp(line.x1, 0, width - 1),
    y1: clamp(line.y1, 0, height - 1),
    x2: clamp(line.x2, 0, width - 1),
    y2: clamp(line.y2, 0, height - 1),
  };
}

function rasterizeLineSamples(line: LineSegment) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const steps = Math.max(4, Math.round(length));
  const samples: Array<{ x: number; y: number }> = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    samples.push({
      x: line.x1 + dx * t,
      y: line.y1 + dy * t,
    });
  }
  return samples;
}

function scoreLine(
  line: LineSegment,
  image: PreparedImage,
  drawnCoverage: Float32Array,
  options: LineGeneratorOptions,
) {
  const samples = rasterizeLineSamples(line);
  let reward = 0;
  let penalty = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const px = clamp(Math.round(sample.x), 0, image.width - 1);
    const py = clamp(Math.round(sample.y), 0, image.height - 1);
    const pixelIndex = py * image.width + px;
    const dark = image.darkness[pixelIndex];
    const coverage = drawnCoverage[pixelIndex];
    reward += dark * (1 - coverage);
    penalty += (1 - dark) * 0.7 + coverage * 0.8;
  }
  return reward / samples.length - penalty / samples.length - samples.length * 0.0006;
}

function applyLineCoverage(line: LineSegment, image: PreparedImage, drawnCoverage: Float32Array) {
  const samples = rasterizeLineSamples(line);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const px = clamp(Math.round(sample.x), 0, image.width - 1);
    const py = clamp(Math.round(sample.y), 0, image.height - 1);
    const pixelIndex = py * image.width + px;
    drawnCoverage[pixelIndex] = clamp(drawnCoverage[pixelIndex] + 0.18, 0, 1.35);
  }
}

function areaAverageDarkness(
  image: PreparedImage,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  let sum = 0;
  let count = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      sum += image.darkness[y * image.width + x];
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

function createRandomLineInCell(
  startX: number,
  startY: number,
  cellWidth: number,
  cellHeight: number,
  options: LineGeneratorOptions,
  random: () => number,
) {
  const centerX = startX + random() * cellWidth;
  const centerY = startY + random() * cellHeight;
  const angle = random() * Math.PI * 2;
  const length =
    options.minLineLength + random() * Math.max(0.1, options.maxLineLength - options.minLineLength);
  const dx = Math.cos(angle) * length * 0.5;
  const dy = Math.sin(angle) * length * 0.5;
  return {
    x1: centerX - dx,
    y1: centerY - dy,
    x2: centerX + dx,
    y2: centerY + dy,
  };
}

export async function generateLineGeneratorSvg(
  input: GraphImage,
  options: LineGeneratorOptions,
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status?: string) => void,
): Promise<LineGeneratorResult | null> {
  const image = prepareImage(input, options);
  const random = createSeededRandom(options.seed);
  const drawnCoverage = new Float32Array(image.width * image.height);
  const lines: LineSegment[] = [];
  const cellSize = Math.max(6, Math.round(options.cellSize));
  const cols = Math.ceil(image.width / cellSize);
  const rows = Math.ceil(image.height / cellSize);
  const totalCells = Math.max(1, cols * rows);
  let processedCells = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (shouldCancel?.()) {
        return null;
      }
      const startX = col * cellSize;
      const startY = row * cellSize;
      const endX = Math.min(image.width, startX + cellSize);
      const endY = Math.min(image.height, startY + cellSize);
      const averageDarkness = areaAverageDarkness(image, startX, startY, endX, endY);
      if (averageDarkness >= options.scoreThreshold) {
        let accepted = 0;
        let localAttempts = 0;
        const attemptsTarget = Math.max(4, Math.round(options.attemptsPerCell * (0.5 + averageDarkness)));
        while (accepted < options.maxLinesPerCell && localAttempts < attemptsTarget) {
          localAttempts += 1;
          const candidate = clampLineToBounds(
            createRandomLineInCell(startX, startY, endX - startX, endY - startY, options, random),
            image.width,
            image.height,
          );
          const score = scoreLine(candidate, image, drawnCoverage, options);
          if (score > options.scoreThreshold * 0.35) {
            lines.push(candidate);
            applyLineCoverage(candidate, image, drawnCoverage);
            accepted += 1;
          }
        }
      }

      processedCells += 1;
      if (processedCells % 12 === 0 || processedCells === totalCells) {
        onProgress?.(processedCells / totalCells, "optimizing line cells");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
  }

  const strokeColor = normalizeHexColor(options.strokeColor);
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}">`;
  svg += `<rect x="0" y="0" width="${image.width}" height="${image.height}" fill="${backgroundColor}"/>`;
  svg += `<g fill="none" stroke="${strokeColor}" stroke-width="${Math.max(0.1, options.strokeWidth)}" stroke-linecap="round">`;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    svg += `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}"/>`;
  }
  svg += "</g></svg>";

  return {
    svg,
    width: image.width,
    height: image.height,
    lineCount: lines.length,
  };
}
