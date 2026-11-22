export type MatitaMode = "balanced" | "fast" | "fine";
export interface MatitaOptions {
  width: number; ppm: number; mode: MatitaMode; candidates: number; horizon: number;
  maxStrokes: number; epsilon: number; stopSensitivity: number; stopWindow: number;
  alpha: number; over: number; white: number; margin: number; diameter: number;
  step: number; zMin: number; zMax: number; zSafe: number; spring: number;
  feed: number; feedZ: number;
}
export const matitaDefaults: MatitaOptions = {
  width: 160, ppm: 3.5, mode: "balanced", candidates: 12, horizon: 12,
  maxStrokes: 12000, epsilon: 0.007, stopSensitivity: 2, stopWindow: 20,
  alpha: 0.20, over: 4, white: 238, margin: 0.10, diameter: 0.5,
  step: 0.40, zMin: 0.05, zMax: 0.20, zSafe: 3, spring: 2,
  feed: 1200, feedZ: 180,
};
export interface MatitaRequest<TOptions extends MatitaOptions = MatitaOptions> { width: number; height: number; pixels: Uint8ClampedArray; options: TOptions }
export interface MatitaResult {
  gcode: string; svg: string; preview: ImageBitmap; strokes: number; mse: number;
  lengthMm: number; arcs: number; lines: number; stopReason: string;
}
export type MatitaResponse =
  | { type: "progress"; strokes: number; mse: number; stage: number; preview: ImageBitmap }
  | { type: "result"; result: MatitaResult }
  | { type: "error"; message: string };
export function validateMatitaOptions(c: MatitaOptions) {
  if (Object.values(c).some(v => typeof v === "number" && !Number.isFinite(v))) throw Error("Parametri numerici non validi");
  if (!["balanced", "fast", "fine"].includes(c.mode) || c.width < 30 || c.width > 500 || c.ppm < 1 || c.ppm > 5 || c.candidates < 4 || c.candidates > 32 || c.horizon < 2 || c.horizon > 25 || c.maxStrokes < 50 || c.maxStrokes > 100000 || c.epsilon < 0.0001 || c.epsilon > 0.5 || c.stopSensitivity < 1 || c.stopSensitivity > 10 || c.stopWindow < 15 || c.stopWindow > 200 || c.alpha < 0.02 || c.alpha > 0.8 || c.over < 1 || c.over > 20 || c.white < 180 || c.white > 255 || c.margin < 0 || c.margin > 1 || c.diameter < 0.1 || c.diameter > 2 || c.step < 0.15 || c.step > 1 || c.zMin < 0.01 || c.zMin > 1 || c.zMax < 0.02 || c.zMax > 1.5 || c.zSafe < 0.5 || c.zSafe > 20 || c.spring < 0.5 || c.spring > 20 || c.feed < 100 || c.feed > 10000 || c.feedZ < 30 || c.feedZ > 2000) throw Error("Parametri Matita fuori intervallo");
  if (c.zMax < c.zMin || c.zMax >= c.spring) throw Error("Z massima deve essere compresa fra Z minima e corsa molla");
}
