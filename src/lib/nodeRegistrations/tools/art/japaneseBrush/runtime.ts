import type { GraphImage } from "../../../../../models/graphImage";
import type {
  JapaneseBrushOptions,
  JapaneseBrushProgress,
  JapaneseBrushResult,
} from "./model";

const escapeNumber = (value: number) => Number(value.toFixed(2));

function randomAt(x: number, y: number, seed: number) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function luminanceAt(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const safeX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (safeY * width + safeX) * 4;
  const alpha = pixels[index + 3] / 255;
  const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
  return 255 - (255 - luminance) * alpha;
}

function brushPath(cx: number, cy: number, length: number, width: number, angle: number, bend: number) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const startX = cx - dx * length * 0.5;
  const startY = cy - dy * length * 0.5;
  const endX = cx + dx * length * 0.5;
  const endY = cy + dy * length * 0.5;
  const controlX = cx + nx * bend;
  const controlY = cy + ny * bend;
  const leftX = startX + nx * width * 0.35;
  const leftY = startY + ny * width * 0.35;
  const rightX = startX - nx * width * 0.35;
  const rightY = startY - ny * width * 0.35;
  return `M${escapeNumber(leftX)} ${escapeNumber(leftY)} Q${escapeNumber(controlX + nx * width * 0.5)} ${escapeNumber(controlY + ny * width * 0.5)} ${escapeNumber(endX)} ${escapeNumber(endY)} Q${escapeNumber(controlX - nx * width * 0.5)} ${escapeNumber(controlY - ny * width * 0.5)} ${escapeNumber(rightX)} ${escapeNumber(rightY)} Z`;
}

export async function generateJapaneseBrush(
  source: GraphImage,
  options: JapaneseBrushOptions,
  shouldCancel: () => boolean,
  updateProgress: JapaneseBrushProgress,
): Promise<JapaneseBrushResult | null> {
  const scale = Math.min(1, options.maxWidth / source.width);
  const outputWidth = Math.max(1, Math.round(source.width * scale));
  const outputHeight = Math.max(1, Math.round(source.height * scale));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = outputWidth;
  sampleCanvas.height = outputHeight;
  const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Contesto 2D non disponibile");
  context.drawImage(source, 0, 0, outputWidth, outputHeight);
  const pixels = context.getImageData(0, 0, outputWidth, outputHeight).data;
  const pathsByLevel = Array.from({ length: options.grayLevels - 1 }, () => [] as string[]);
  const rows = Math.ceil(outputHeight / options.spacing);

  updateProgress(0, "analisi toni");
  for (let row = 0; row < rows; row += 1) {
    if (shouldCancel()) return null;
    const y = Math.min(outputHeight - 1, row * options.spacing + options.spacing * 0.5);
    const offset = row % 2 ? options.spacing * 0.5 : 0;
    for (let x = offset; x < outputWidth; x += options.spacing) {
      const jitterX = (randomAt(x, row, options.seed) - 0.5) * options.spacing * 0.7;
      const jitterY = (randomAt(row, x, options.seed + 17) - 0.5) * options.spacing * 0.7;
      const px = Math.max(0, Math.min(outputWidth - 1, x + jitterX));
      const py = Math.max(0, Math.min(outputHeight - 1, y + jitterY));
      const luminance = luminanceAt(pixels, outputWidth, outputHeight, px, py);
      const darkness = 1 - luminance / 255;
      if (darkness < 0.025 || randomAt(x, row, options.seed + 31) > Math.min(1, darkness * options.flow)) continue;

      const left = luminanceAt(pixels, outputWidth, outputHeight, px - options.spacing, py);
      const right = luminanceAt(pixels, outputWidth, outputHeight, px + options.spacing, py);
      const top = luminanceAt(pixels, outputWidth, outputHeight, px, py - options.spacing);
      const bottom = luminanceAt(pixels, outputWidth, outputHeight, px, py + options.spacing);
      const gradientAngle = Math.atan2(bottom - top, right - left) + Math.PI / 2;
      const angle = gradientAngle * 0.72 - Math.PI * 0.08 + (randomAt(row, x, options.seed + 53) - 0.5) * 0.35;
      const level = Math.min(options.grayLevels - 2, Math.floor(darkness * (options.grayLevels - 1)));
      const length = options.strokeLength * (0.65 + darkness * 0.7) * (0.85 + randomAt(x, row, options.seed + 71) * 0.3);
      const width = options.strokeWidth * (0.55 + darkness * 0.9);
      const bend = (randomAt(row, x, options.seed + 89) - 0.5) * width * 1.8;
      pathsByLevel[level].push(brushPath(px, py, length, width, angle, bend));
    }
    if (row % 12 === 0) {
      updateProgress((row + 1) / rows * 0.9, "creazione pennellate");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  if (shouldCancel()) return null;
  const groups = pathsByLevel.map((paths, level) => {
    const gray = Math.round(255 * (1 - (level + 1) / (options.grayLevels - 1)));
    return paths.length ? `<path fill="rgb(${gray},${gray},${gray})" d="${paths.join(" ")}"/>` : "";
  }).join("");
  const strokeCount = pathsByLevel.reduce((total, paths) => total + paths.length, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}"><rect width="100%" height="100%" fill="white"/>${groups}</svg>`;
  updateProgress(1, "rasterizzazione");
  return { svg, strokeCount, outputWidth, outputHeight, grayLevels: options.grayLevels };
}

