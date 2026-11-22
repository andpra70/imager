import { clamp } from "./geometry";

export function renderMatitaPreview(draw: Float32Array, width: number, height: number, exposure = 1): ImageBitmap {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw Error("Anteprima non disponibile");
  const image = context.createImageData(width, height);
  for (let i = 0; i < draw.length; i++) {
    const value = Math.round((1 - clamp(draw[i] * exposure, 0, 1)) * 255);
    image.data[4 * i] = image.data[4 * i + 1] = image.data[4 * i + 2] = value;
    image.data[4 * i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.transferToImageBitmap();
}
