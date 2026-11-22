// Each pass has its own angle; the source luminance selects how many passes apply.
export const HATCH_ANGLES = [0, 90, 45, 135, 22.5, 112.5, 67.5, 157.5, 11.25, 101.25] as const;
export const MAX_HATCH_LAYERS = HATCH_ANGLES.length;

/** 0 is white/transparent; N is black. The white threshold defines the first inked tone. */
export function quantizeTone(luminance: number, alpha: number, whiteThreshold: number, layers: number): number {
  if (alpha < 0.125 || luminance >= whiteThreshold) return 0;
  return Math.min(layers, Math.ceil((whiteThreshold - luminance) * layers / whiteThreshold));
}
