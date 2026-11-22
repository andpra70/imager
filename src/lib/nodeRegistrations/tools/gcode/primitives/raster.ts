import type { GraphImage } from "../../../../../models/graphImage";
import type { PrimitiveKind, PrimitiveOptions, PrimitiveRequest } from "./model";
export function preparePrimitiveRaster(image: GraphImage, kind: PrimitiveKind, options: PrimitiveOptions): PrimitiveRequest {
  const width = Math.min(1400, Math.max(32, Math.round(options.sheetWidth * options.resolution)));
  const height = Math.min(1400, Math.max(32, Math.round(options.sheetHeight * options.resolution)));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("Canvas non disponibile");
  context.fillStyle = "white"; context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return { kind, width, height, pixels: context.getImageData(0, 0, width, height).data, options };
}
