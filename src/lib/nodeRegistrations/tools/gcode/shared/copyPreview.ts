import type { GraphImage } from "../../../../../models/graphImage";

// Keep the node preview at the input image's pixel dimensions. The worker raster
// may have a different resolution for CNC sampling, but that is internal.
export function copyGcodePreview(bitmap: ImageBitmap, image: GraphImage, existing: GraphImage | null): GraphImage {
  const canvas = existing ?? document.createElement("canvas");
  if (canvas.width !== image.width || canvas.height !== image.height) {
    canvas.width = image.width;
    canvas.height = image.height;
  }
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw Error("Canvas anteprima non disponibile"); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}
