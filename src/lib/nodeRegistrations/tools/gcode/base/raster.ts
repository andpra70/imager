import type { GraphImage } from "../../../../../models/graphImage";
import type { BaseGcodeOptions, BaseGcodeRequest } from "./model";

export function prepareBaseGcodeRaster(image: GraphImage, options: BaseGcodeOptions): BaseGcodeRequest {
  const availableWidth = Math.round((options.width - 2 * options.margin) * options.resolution);
  const availableHeight = Math.round((options.height - 2 * options.margin) * options.resolution);
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const width = Math.max(2, Math.round(image.width * scale));
  const height = Math.max(2, Math.round(image.height * scale));
  if (width * height > 2_500_000) throw Error("Immagine troppo grande: riduci px/mm");
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("Canvas non disponibile");
  context.drawImage(image, 0, 0, width, height);
  return { pixels: context.getImageData(0, 0, width, height).data, width, height, options };
}
