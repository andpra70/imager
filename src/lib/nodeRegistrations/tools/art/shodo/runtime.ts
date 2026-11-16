import type { GraphImage } from "../../../../../models/graphImage";
import type { ShodoOptions, ShodoProgress, ShodoResult } from "./model";

interface BrushStroke { path: string; opacity: number }

function randomAt(x: number, y: number, seed: number) {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 29, 668265263) ^ Math.imul(seed + 1, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

const fixed = (value: number) => Number(value.toFixed(2));

function luminance(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (py * width + px) * 4;
  const alpha = pixels[index + 3] / 255;
  const light = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
  return 255 - (255 - light) * alpha;
}

function calligraphicPath(x: number, y: number, length: number, width: number, angle: number, bend: number) {
  const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
  const sx = x - dx * length * 0.5, sy = y - dy * length * 0.5;
  const ex = x + dx * length * 0.5, ey = y + dy * length * 0.5;
  const heel = width * 0.55, tip = width * 0.08;
  const c1x = x - dx * length * 0.15 + nx * bend, c1y = y - dy * length * 0.15 + ny * bend;
  const c2x = x + dx * length * 0.22 + nx * bend * 0.55, c2y = y + dy * length * 0.22 + ny * bend * 0.55;
  return `M${fixed(sx + nx * heel)} ${fixed(sy + ny * heel)} C${fixed(c1x + nx * width * 0.5)} ${fixed(c1y + ny * width * 0.5)} ${fixed(c2x + nx * tip)} ${fixed(c2y + ny * tip)} ${fixed(ex + nx * tip)} ${fixed(ey + ny * tip)} Q${fixed(ex + dx * width * 0.25)} ${fixed(ey + dy * width * 0.25)} ${fixed(ex - nx * tip)} ${fixed(ey - ny * tip)} C${fixed(c2x - nx * tip)} ${fixed(c2y - ny * tip)} ${fixed(c1x - nx * width * 0.5)} ${fixed(c1y - ny * width * 0.5)} ${fixed(sx - nx * heel)} ${fixed(sy - ny * heel)} Q${fixed(sx - dx * width * 0.18)} ${fixed(sy - dy * width * 0.18)} ${fixed(sx + nx * heel)} ${fixed(sy + ny * heel)} Z`;
}

export async function generateShodo(
  source: GraphImage,
  options: ShodoOptions,
  shouldCancel: () => boolean,
  updateProgress: ShodoProgress,
): Promise<ShodoResult | null> {
  const scale = Math.min(1, options.maxWidth / source.width);
  const outputWidth = Math.max(1, Math.round(source.width * scale));
  const outputHeight = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth; canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Contesto 2D non disponibile");
  context.drawImage(source, 0, 0, outputWidth, outputHeight);
  const pixels = context.getImageData(0, 0, outputWidth, outputHeight).data;
  const spacing = Math.max(2, options.brushSize * (1.22 - options.fidelity * 0.82));
  const rows = Math.ceil(outputHeight / spacing);
  const strokes: BrushStroke[] = [];
  updateProgress(0, "lettura struttura");

  for (let row = 0; row < rows; row += 1) {
    if (shouldCancel()) return null;
    const y = row * spacing + spacing * 0.5;
    for (let x = (row % 2) * spacing * 0.5; x < outputWidth; x += spacing) {
      const jitterX = (randomAt(x, row, options.seed) - 0.5) * spacing * 0.65;
      const jitterY = (randomAt(row, x, options.seed + 11) - 0.5) * spacing * 0.65;
      const px = x + jitterX, py = y + jitterY;
      const light = luminance(pixels, outputWidth, outputHeight, px, py);
      const normalized = Math.max(0, Math.min(1, 1 - light / 255));
      const darkness = Math.max(0, Math.min(1, (normalized - 0.5) * options.contrast + 0.5));
      if (darkness < 0.04 || randomAt(row, x, options.seed + 23) > Math.min(1, darkness * options.inkDensity)) continue;
      const radius = Math.max(2, spacing * 0.9);
      const gx = luminance(pixels, outputWidth, outputHeight, px + radius, py) - luminance(pixels, outputWidth, outputHeight, px - radius, py);
      const gy = luminance(pixels, outputWidth, outputHeight, px, py + radius) - luminance(pixels, outputWidth, outputHeight, px, py - radius);
      const structureAngle = Math.atan2(gy, gx) + Math.PI / 2;
      const verticalGesture = Math.PI * 0.5 + (randomAt(x, row, options.seed + 37) - 0.5) * 0.55;
      const angle = structureAngle * options.fidelity + verticalGesture * (1 - options.fidelity);
      const length = options.brushSize * (1.5 + darkness * 2.8) * (0.8 + randomAt(row, x, options.seed + 41) * 0.45);
      const width = options.brushSize * (0.32 + darkness * 0.92);
      const bend = (randomAt(x, row, options.seed + 59) - 0.5) * width * 1.5;
      const dry = randomAt(row, x, options.seed + 71) < options.dryBrush;
      strokes.push({
        path: calligraphicPath(px, py, length, width, angle, bend),
        opacity: dry ? 0.48 + darkness * 0.35 : 0.78 + darkness * 0.22,
      });
      if (dry && width > 2.5) {
        const splitOffset = width * (0.18 + randomAt(x, row, options.seed + 83) * 0.18);
        strokes.push({ path: calligraphicPath(px + Math.cos(angle + Math.PI / 2) * splitOffset, py + Math.sin(angle + Math.PI / 2) * splitOffset, length * 0.84, width * 0.2, angle, bend * 0.5), opacity: 0.75 });
      }
    }
    if (row % 10 === 0) {
      updateProgress((row + 1) / rows * 0.95, "pennellata shodō");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  if (shouldCancel()) return null;
  const paths = strokes.map((stroke) => `<path d="${stroke.path}" fill="#050505" fill-opacity="${stroke.opacity.toFixed(2)}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}"><rect width="100%" height="100%" fill="#fff"/>${paths}</svg>`;
  updateProgress(1, "rasterizzazione");
  return { svg, strokeCount: strokes.length, outputWidth, outputHeight };
}

