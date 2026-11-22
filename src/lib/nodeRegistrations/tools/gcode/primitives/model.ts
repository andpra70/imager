export type PrimitiveKind = "rectangle" | "circle";
export interface PrimitiveOptions {
  sheetWidth: number; sheetHeight: number; resolution: number; penDiameter: number;
  alpha: number; white: number; whiteMargin: number; maxShapes: number;
  minSize: number; maxSize: number; samples: number; targetMse: number;
  plateauWindow: number; minProgressPercent: number;
  safeZ: number; drawZ: number; feed: number; feedZ: number;
}
export const primitiveDefaults: PrimitiveOptions = {
  sheetWidth: 160, sheetHeight: 200, resolution: 3, penDiameter: .5,
  alpha: .23, white: 238, whiteMargin: .08, maxShapes: 12000,
  minSize: .6, maxSize: 18, samples: 100, targetMse: .006,
  plateauWindow: 35, minProgressPercent: .35,
  safeZ: 3, drawZ: -.12, feed: 1200, feedZ: 180,
};
export interface PrimitiveRequest { kind: PrimitiveKind; width: number; height: number; pixels: Uint8ClampedArray; options: PrimitiveOptions }
export interface RectangleShape { kind: "rectangle"; x: number; y: number; width: number; height: number; gain: number }
export interface CircleShape { kind: "circle"; cx: number; cy: number; radius: number; gain: number }
export type PrimitiveShape = RectangleShape | CircleShape;
export interface PrimitiveResult { gcode: string; svg: string; preview: ImageBitmap; shapes: number; mse: number; reason: string }
export type PrimitiveResponse =
  | { type: "progress"; shapes: number; mse: number; preview: ImageBitmap }
  | { type: "result"; result: PrimitiveResult }
  | { type: "error"; message: string };
export function validatePrimitiveOptions(c: PrimitiveOptions) {
  if ((Object.keys(primitiveDefaults) as Array<keyof PrimitiveOptions>).some(key => !Number.isFinite(c[key]))) throw Error("Parametri numerici non validi");
  if (c.sheetWidth < 30 || c.sheetWidth > 400 || c.sheetHeight < 30 || c.sheetHeight > 400 || c.resolution < 1 || c.resolution > 8 || c.penDiameter < .1 || c.penDiameter > 2 || c.alpha < .02 || c.alpha > .95 || c.white < 100 || c.white > 255 || c.whiteMargin < 0 || c.whiteMargin > 1 || c.maxShapes < 100 || c.maxShapes > 200000 || c.minSize < .2 || c.minSize > 10 || c.maxSize < 1 || c.maxSize > 60 || c.maxSize < c.minSize || c.samples < 10 || c.samples > 1000 || c.targetMse < 0 || c.targetMse > .2 || c.plateauWindow < 10 || c.plateauWindow > 500 || c.minProgressPercent < .01 || c.minProgressPercent > 20 || c.safeZ <= 0 || c.drawZ >= c.safeZ || c.feed < 50 || c.feedZ < 20) throw Error("Parametri Matita fuori intervallo");
}
