import type { GraphImage } from "../../../../../models/graphImage";
import type { MatitaOptions, MatitaRequest } from "./model";
export function prepareMatitaRaster<TOptions extends MatitaOptions>(image: GraphImage, options: TOptions): MatitaRequest<TOptions> {
  const width = Math.round(options.width * options.ppm);
  const height = Math.round(width * image.height / image.width);
  if (width * height > 1_400_000) throw Error("Immagine troppo grande: riduci risoluzione o larghezza");
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw Error("Canvas non disponibile");
  context.fillStyle = "white"; context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return { width, height, pixels: context.getImageData(0, 0, width, height).data, options };
}
