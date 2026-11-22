import { MAX_HATCH_LAYERS } from "./hatchLayers";

export interface BaseGcodeOptions {
  width: number; height: number; margin: number; resolution: number;
  white: number; protect: number; step: number; layers: number; angle: number;
  minLength: number; contour: number; edges: boolean;
  safeZ: number; lightZ: number; darkZ: number; spring: number;
  feed: number; feedZ: number; zStep: number; maxPaths: number;
  humanize: boolean; handWobble: number; handScale: number;
}
export interface BaseGcodeRequest { pixels: Uint8ClampedArray; width: number; height: number; options: BaseGcodeOptions }
export interface BaseGcodeResult { gcode: string; svg: string; preview: ImageBitmap; paths: number; lines: number; drawMm: number; travelMm: number }
export type BaseGcodeResponse = { type: "result"; result: BaseGcodeResult } | { type: "error"; message: string };
export const baseGcodeDefaults: BaseGcodeOptions = {
  width: 190, height: 190, margin: 3, resolution: 3, white: 225, protect: 0.18,
  step: 0.55, layers: 2, angle: 35, minLength: 0.65, contour: 0.45, edges: true,
  safeZ: 3, lightZ: -0.05, darkZ: -0.20, spring: 2, feed: 1200, feedZ: 180,
  zStep: 1.5, maxPaths: 30000, humanize: false, handWobble: 0.12, handScale: 6,
};
export function validateBaseGcodeOptions(c: BaseGcodeOptions) {
  if (Object.values(c).some(value => typeof value === "number" && !Number.isFinite(value))) throw Error("Parametri numerici non validi");
  if (c.width <= 2 * c.margin || c.height <= 2 * c.margin || c.resolution <= 0 || c.step <= 0 || c.zStep <= 0 || c.minLength <= 0 || c.feed <= 0 || c.feedZ <= 0 || !Number.isInteger(c.layers) || c.layers < 1 || c.layers > MAX_HATCH_LAYERS || c.maxPaths < 1 || c.handWobble < 0 || c.handWobble > 2 || c.handScale <= 0) throw Error("Dimensioni o velocità non valide");
  if (c.lightZ > 0 || c.darkZ > c.lightZ || -c.darkZ >= c.spring || c.safeZ <= 0) throw Error("Quote Z non valide");
}
