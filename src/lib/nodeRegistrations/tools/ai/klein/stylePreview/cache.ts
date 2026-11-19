import type { GraphImage } from "../../../../../../models/graphImage";
import type { KleinStylePreview } from "./model";
import { loadStoredKleinStylePreviews, storeKleinStylePreview } from "./storage";

const THUMBNAIL_SIZE = 128;
const previews = new Map<string, KleinStylePreview>();
let initialization: Promise<void> | null = null;
type ThumbnailSource = CanvasImageSource & { width: number; height: number };

function createThumbnail(image: ThumbnailSource) {
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
  const thumbnail = createThumbnail(image), generatedAt = Date.now();
  previews.set(styleId, { styleId, thumbnail, generatedAt });
  thumbnail.toBlob((blob) => {
    if (blob) void storeKleinStylePreview({ styleId, image: blob, generatedAt }).catch(() => { /* cache persistence is optional */ });
  }, "image/webp", .78);
}

export function getKleinStylePreview(styleId: string) {
  return previews.get(styleId) ?? null;
}

function blobToThumbnail(blob: Blob) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob), image = new Image();
    image.onload = () => {
      try { resolve(createThumbnail(image)); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Preview locale non valida.")); };
    image.src = url;
  });
}

export function initializeKleinStylePreviewCache() {
  initialization ??= loadStoredKleinStylePreviews()
    .then(async stored => {
      await Promise.all(stored.map(async item => {
        const thumbnail = await blobToThumbnail(item.image);
        const current = previews.get(item.styleId);
        if (!current || current.generatedAt < item.generatedAt) previews.set(item.styleId, { styleId: item.styleId, thumbnail, generatedAt: item.generatedAt });
      }));
    })
    .catch(() => { /* IndexedDB may be unavailable in restricted browsing modes */ });
  return initialization;
}
