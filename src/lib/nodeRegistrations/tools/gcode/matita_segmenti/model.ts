export interface MatitaSegmentiOptions {
  width: number; resolution: number; diameter: number; alpha: number;
  epsilon: number; maxSegments: number; step: number; directions: number;
  over: number; detail: number; zMin: number; zMax: number;
  margin: number; zSafe: number; feed: number; feedZ: number; arcTolerance: number;
}
export const matitaSegmentiDefaults: MatitaSegmentiOptions = {
  width: 170, resolution: 3, diameter: 0.5, alpha: 0.24,
  epsilon: 0.009, maxSegments: 16000, step: 0.65, directions: 24,
  over: 6, detail: 3, zMin: 0.05, zMax: 0.20,
  margin: 10, zSafe: 3, feed: 1300, feedZ: 180, arcTolerance: 0.09,
};
export interface MatitaSegmentiRequest { width: number; height: number; pixels: Uint8ClampedArray; options: MatitaSegmentiOptions }
export interface MatitaSegmentiResult { gcode: string; svg: string; preview: ImageBitmap; strokes: number; segments: number; mse: number; arcs: number; reason: string }
export type MatitaSegmentiResponse =
  | { type: "progress"; strokes: number; segments: number; mse: number; preview: ImageBitmap }
  | { type: "result"; result: MatitaSegmentiResult }
  | { type: "error"; message: string };
export function validateMatitaSegmentiOptions(c: MatitaSegmentiOptions) {
  if ((Object.keys(matitaSegmentiDefaults) as Array<keyof MatitaSegmentiOptions>).some(key => !Number.isFinite(c[key]))) throw Error("Parametri numerici non validi");
  if (c.width < 30 || c.width > 350 || c.resolution < 1 || c.resolution > 5 || c.diameter < .1 || c.diameter > 2 || c.alpha < .05 || c.alpha > .6 || c.epsilon < .0001 || c.epsilon > .3 || c.maxSegments < 100 || c.maxSegments > 200000 || c.step < .2 || c.step > 2 || c.directions < 8 || c.directions > 64 || c.over < 1 || c.over > 30 || c.detail < 1 || c.detail > 8 || c.zMin < 0 || c.zMax < c.zMin || c.zMax > 2 || c.margin < 0 || c.zSafe <= 0 || c.feed <= 0 || c.feedZ <= 0 || c.arcTolerance <= 0) throw Error("Parametri MatitaSegmenti fuori intervallo");
}
