import type { GraphImage } from "../../../../../models/graphImage";
import type { MatitaSegmentiOptions, MatitaSegmentiRequest } from "./model";
export function prepareMatitaSegmentiRaster(image: GraphImage, options: MatitaSegmentiOptions): MatitaSegmentiRequest {
  const width = Math.round(options.width * options.resolution);
  const height = Math.round(width * image.height / image.width);
  if (width < 10 || height < 10 || width * height > 850_000) throw Error("Risoluzione eccessiva: riduci px/mm o larghezza");
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("Canvas non disponibile");
  // Preserve transparency for the source's alpha mask. The worker composites it optically.
  context.clearRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
  return { width, height, pixels: context.getImageData(0, 0, width, height).data, options };
}
