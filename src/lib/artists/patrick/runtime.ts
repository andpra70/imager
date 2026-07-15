import type { GraphImage } from "../../../models/graphImage";
import type { PatrickNagelOptions } from "./model";
import {
  applyLevelsValue,
  clamp,
  gaussianBlurImageData,
  hsv255ToRgb,
  normalizeHexColor,
  rgbToHsv255,
  sobelOperatorFromGrayscale,
  toGrayscaleImageData,
} from "../../nodeRegistrations/tools/shared";

interface PatrickPaletteColor {
  r: number;
  g: number;
  b: number;
}

const PATRICK_BLACK: PatrickPaletteColor = { r: 18, g: 18, b: 22 };
const PATRICK_WHITE: PatrickPaletteColor = { r: 248, g: 242, b: 234 };
const PATRICK_SKIN_LIGHT: PatrickPaletteColor = { r: 246, g: 222, b: 209 };
const PATRICK_SKIN_MID: PatrickPaletteColor = { r: 224, g: 168, b: 149 };
const PATRICK_SKIN_DARK: PatrickPaletteColor = { r: 158, g: 92, b: 94 };
const PATRICK_ACCENT_RED: PatrickPaletteColor = { r: 198, g: 63, b: 89 };

function hexToRgb(hex: string): PatrickPaletteColor {
  const normalized = normalizeHexColor(hex);
  const raw = normalized.slice(1);
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

function quantizeChannel(value: number, levels: number) {
  if (levels <= 1) {
    return clamp(Math.round(value), 0, 255);
  }
  const step = 255 / (levels - 1);
  return clamp(Math.round(Math.round(value / step) * step), 0, 255);
}

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isSkinLike(h: number, s: number, v: number) {
  return h >= 5 && h <= 32 && s >= 18 && s <= 170 && v >= 60;
}

function posterizeNagelColor(
  r: number,
  g: number,
  b: number,
  levels: number,
): PatrickPaletteColor {
  const hsv = rgbToHsv255(r, g, b);
  const lum = luminance(r, g, b);

  if (lum < 28) {
    return PATRICK_BLACK;
  }
  if (lum > 238 && hsv.s < 40) {
    return PATRICK_WHITE;
  }
  if (isSkinLike((hsv.h / 255) * 360, hsv.s, hsv.v)) {
    if (lum > 188) {
      return PATRICK_SKIN_LIGHT;
    }
    if (lum > 112) {
      return PATRICK_SKIN_MID;
    }
    return PATRICK_SKIN_DARK;
  }
  if (hsv.s > 110 && hsv.v > 90) {
    const accentMix = clamp((hsv.s - 110) / 90, 0, 1);
    return {
      r: Math.round(r * (1 - accentMix) + PATRICK_ACCENT_RED.r * accentMix),
      g: Math.round(g * (1 - accentMix) + PATRICK_ACCENT_RED.g * accentMix),
      b: Math.round(b * (1 - accentMix) + PATRICK_ACCENT_RED.b * accentMix),
    };
  }

  const quantized = hsv255ToRgb(
    quantizeChannel(hsv.h, Math.max(3, Math.min(levels + 1, 8))),
    quantizeChannel(hsv.s, Math.max(3, levels)),
    quantizeChannel(hsv.v, Math.max(3, levels)),
  );
  return { r: quantized.r, g: quantized.g, b: quantized.b };
}

export function generatePatrickNagelImage(input: GraphImage, options: PatrickNagelOptions): GraphImage {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const blurRadius = Math.max(0, Math.round(options.smoothing));
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;

  const outputContext = output.getContext("2d", { willReadFrequently: true });
  if (!outputContext) {
    throw new Error("2D context not available.");
  }

  outputContext.fillStyle = normalizeHexColor(options.backgroundColor);
  outputContext.fillRect(0, 0, width, height);
  outputContext.drawImage(input, 0, 0, width, height);

  const sourceImageData = outputContext.getImageData(0, 0, width, height);
  const smoothedImageData =
    blurRadius > 0 ? gaussianBlurImageData(sourceImageData, blurRadius) : sourceImageData;
  const grayscale = toGrayscaleImageData(smoothedImageData);
  const gradients = sobelOperatorFromGrayscale(grayscale);
  const outputPixels = smoothedImageData.data;
  const background = hexToRgb(options.backgroundColor);

  for (let index = 0; index < outputPixels.length; index += 4) {
    const alpha = outputPixels[index + 3];
    if (alpha <= 4) {
      outputPixels[index] = background.r;
      outputPixels[index + 1] = background.g;
      outputPixels[index + 2] = background.b;
      outputPixels[index + 3] = 255;
      continue;
    }

    const leveledR = applyLevelsValue(outputPixels[index], options.blackPoint, options.whitePoint, 1, 0, 255);
    const leveledG = applyLevelsValue(outputPixels[index + 1], options.blackPoint, options.whitePoint, 1, 0, 255);
    const leveledB = applyLevelsValue(outputPixels[index + 2], options.blackPoint, options.whitePoint, 1, 0, 255);

    const hsv = rgbToHsv255(leveledR, leveledG, leveledB);
    const saturated = hsv255ToRgb(
      hsv.h,
      clamp(Math.round(hsv.s * options.saturation), 0, 255),
      hsv.v,
    );
    const posterized = posterizeNagelColor(
      saturated.r,
      saturated.g,
      saturated.b,
      Math.round(options.posterizeLevels),
    );

    outputPixels[index] = posterized.r;
    outputPixels[index + 1] = posterized.g;
    outputPixels[index + 2] = posterized.b;
    outputPixels[index + 3] = 255;
  }

  const edgeThreshold = clamp(options.edgeThreshold, 1, 255);
  for (let pixelIndex = 0; pixelIndex < gradients.magnitudes.length; pixelIndex += 1) {
    if (gradients.magnitudes[pixelIndex] < edgeThreshold) {
      continue;
    }
    const offset = pixelIndex * 4;
    const baseR = outputPixels[offset];
    const baseG = outputPixels[offset + 1];
    const baseB = outputPixels[offset + 2];
    const mix = clamp((gradients.magnitudes[pixelIndex] - edgeThreshold) / 120, 0, 1);
    outputPixels[offset] = Math.round(baseR * (1 - mix) + PATRICK_BLACK.r * mix);
    outputPixels[offset + 1] = Math.round(baseG * (1 - mix) + PATRICK_BLACK.g * mix);
    outputPixels[offset + 2] = Math.round(baseB * (1 - mix) + PATRICK_BLACK.b * mix);
  }

  outputContext.putImageData(smoothedImageData, 0, 0);
  return output;
}
