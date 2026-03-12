import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import {
  drawConcentric,
  drawCrossHatching,
  drawGrid,
  drawHalftone,
  drawHatching,
  drawScribble,
  drawSketch,
  drawSpiral,
  drawStippling,
  drawWavy,
  getGrayscale,
} from "./internal/algorithms";
import { SVGContext } from "./internal/svgContext";
import type { LineArtAlgorithmId, LineArtAlgorithmOptions } from "./model";

interface LineArtRunInput {
  algorithmId: LineArtAlgorithmId;
  image: GraphImage;
  options: LineArtAlgorithmOptions;
}

export interface LineArtRunResult {
  preview: GraphImage;
  svg: GraphSvg;
  pathCount: number;
}

function runAlgorithm(
  algorithmId: LineArtAlgorithmId,
  context: CanvasRenderingContext2D | SVGContext,
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  options: LineArtAlgorithmOptions,
) {
  switch (algorithmId) {
    case "hatching":
      drawHatching(context, grayscale, width, height, options);
      return;
    case "cross-hatching":
      drawCrossHatching(context, grayscale, width, height, options);
      return;
    case "spiral":
      drawSpiral(context, grayscale, width, height, options);
      return;
    case "wavy":
      drawWavy(context, grayscale, width, height, options);
      return;
    case "concentric":
      drawConcentric(context, grayscale, width, height, options);
      return;
    case "halftone":
      drawHalftone(context, grayscale, width, height, options);
      return;
    case "stippling":
      drawStippling(context, grayscale, width, height, options);
      return;
    case "grid":
      drawGrid(context, grayscale, width, height, options);
      return;
    case "scribble":
      drawScribble(context, grayscale, width, height, options);
      return;
    case "sketch":
      drawSketch(context, grayscale, width, height, options);
      return;
    default:
      throw new Error(`Unsupported lineart algorithm: ${algorithmId}`);
  }
}

export function countSvgElements(svg: GraphSvg) {
  const pathCount = (svg.match(/<path\b/g) ?? []).length;
  const circleCount = (svg.match(/<circle\b/g) ?? []).length;
  return pathCount + circleCount;
}

export function executeLineArtAlgorithm({ algorithmId, image, options }: LineArtRunInput): LineArtRunResult {
  const sourceContext = image.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D source context not available.");
  }

  const width = image.width;
  const height = image.height;
  const sourceData = sourceContext.getImageData(0, 0, width, height);
  const grayscale = getGrayscale(sourceData);

  const preview = document.createElement("canvas");
  preview.width = width;
  preview.height = height;
  const previewContext = preview.getContext("2d");
  if (!previewContext) {
    throw new Error("2D preview context not available.");
  }

  runAlgorithm(algorithmId, previewContext, grayscale, width, height, options);

  const svgContext = new SVGContext(width, height);
  runAlgorithm(algorithmId, svgContext, grayscale, width, height, options);
  const svg = svgContext.serialize();

  return {
    preview,
    svg,
    pathCount: countSvgElements(svg),
  };
}
