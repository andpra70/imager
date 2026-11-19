import type { KleinStylePreview, KleinStylePreviewPointer } from "./model";

const PREVIEW_SIZE = 128;
const POINTER_OFFSET = 20;
const ACTIVE_WINDOW_MS = 100;

interface OverlayState {
  preview: KleinStylePreview;
  pointer: KleinStylePreviewPointer;
  updatedAt: number;
}

let overlayState: OverlayState | null = null;

export function showKleinStylePreviewOverlay(preview: KleinStylePreview, pointer: KleinStylePreviewPointer) {
  overlayState = { preview, pointer, updatedAt: performance.now() };
}

export function drawActiveKleinStylePreviewOverlay(context: CanvasRenderingContext2D) {
  const state = overlayState;
  if (!state || performance.now() - state.updatedAt > ACTIVE_WINDOW_MS) return;
  const x = state.pointer.x + POINTER_OFFSET;
  const y = state.pointer.y - PREVIEW_SIZE / 2;
  context.save();
  context.shadowColor = "rgba(0,0,0,.65)";
  context.shadowBlur = 10;
  context.fillStyle = "#111318";
  context.fillRect(x - 4, y - 4, PREVIEW_SIZE + 8, PREVIEW_SIZE + 8);
  context.shadowColor = "transparent";
  context.drawImage(state.preview.thumbnail, x, y, PREVIEW_SIZE, PREVIEW_SIZE);
  context.strokeStyle = "rgba(255,255,255,.8)";
  context.lineWidth = 1;
  context.strokeRect(x - .5, y - .5, PREVIEW_SIZE + 1, PREVIEW_SIZE + 1);
  context.restore();
}
