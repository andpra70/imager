import type { GraphImage } from "../../../../../../models/graphImage";
import type { KleinStylePreview } from "./model";

const THUMBNAIL_SIZE = 128;
const previews = new Map<string, KleinStylePreview>();

function createThumbnail(image: GraphImage) {
  const thumbnail = document.createElement("canvas");
  thumbnail.width = THUMBNAIL_SIZE;
  thumbnail.height = THUMBNAIL_SIZE;
  const context = thumbnail.getContext("2d");
  if (!context) return thumbnail;
  context.fillStyle = "#17191d";
  context.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  const scale = Math.min(THUMBNAIL_SIZE / image.width, THUMBNAIL_SIZE / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  context.drawImage(image, (THUMBNAIL_SIZE - width) / 2, (THUMBNAIL_SIZE - height) / 2, width, height);
  return thumbnail;
}

export function cacheKleinStylePreview(styleId: string, image: GraphImage) {
  previews.set(styleId, { styleId, thumbnail: createThumbnail(image), generatedAt: Date.now() });
}

export function getKleinStylePreview(styleId: string) {
  return previews.get(styleId) ?? null;
}
