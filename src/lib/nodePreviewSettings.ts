const PREVIEW_WIDTH_STORAGE_KEY = "plotterfun.previewWidth";
const DEFAULT_PREVIEW_WIDTH = 260;
const MIN_PREVIEW_WIDTH = 160;
const MAX_PREVIEW_WIDTH = 480;

let previewWidth = DEFAULT_PREVIEW_WIDTH;

if (typeof window !== "undefined") {
  const savedWidth = Number(window.localStorage.getItem(PREVIEW_WIDTH_STORAGE_KEY));
  if (Number.isFinite(savedWidth)) {
    previewWidth = Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, savedWidth));
  }
}

export function getPreviewWidth() {
  return previewWidth;
}

export function setPreviewWidth(width: number) {
  const nextWidth = Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, Math.round(width)));
  previewWidth = nextWidth;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(PREVIEW_WIDTH_STORAGE_KEY, String(nextWidth));
  }

  return nextWidth;
}

export function getPreviewWidthBounds() {
  return {
    min: MIN_PREVIEW_WIDTH,
    max: MAX_PREVIEW_WIDTH,
    defaultValue: DEFAULT_PREVIEW_WIDTH,
  };
}
