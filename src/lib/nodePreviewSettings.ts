const PREVIEW_WIDTH_STORAGE_KEY = "plotterfun.previewWidth";
const DEFAULT_PREVIEW_WIDTH = 256;
const MIN_PREVIEW_WIDTH = 128;
const MAX_PREVIEW_WIDTH = 1024;
const PREVIEW_WIDTH_STEP = 16;

function normalizePreviewWidth(width: number) {
  const finiteWidth = Number.isFinite(width) ? width : DEFAULT_PREVIEW_WIDTH;
  const steppedWidth = Math.round(finiteWidth / PREVIEW_WIDTH_STEP) * PREVIEW_WIDTH_STEP;
  return Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, steppedWidth));
}

let previewWidth = DEFAULT_PREVIEW_WIDTH;

if (typeof window !== "undefined") {
  const savedWidth = Number(window.localStorage.getItem(PREVIEW_WIDTH_STORAGE_KEY));
  if (Number.isFinite(savedWidth)) {
    previewWidth = normalizePreviewWidth(savedWidth);
  }
}

export function getPreviewWidth() {
  return previewWidth;
}

export function setPreviewWidth(width: number) {
  const nextWidth = normalizePreviewWidth(width);
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
    step: PREVIEW_WIDTH_STEP,
    defaultValue: DEFAULT_PREVIEW_WIDTH,
  };
}
