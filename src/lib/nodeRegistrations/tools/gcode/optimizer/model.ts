export interface GcodeOptimizerOptions {
  simplify: number;
  allowReverse: boolean;
}

export interface GcodeOptimizationMetrics {
  tools: number;
  pathsBefore: number;
  pathsAfter: number;
  segmentsBefore: number;
  segmentsAfter: number;
  drawMmBefore: number;
  drawMmAfter: number;
  travelMmBefore: number;
  travelMmAfter: number;
  travelSavedMm: number;
  travelSavedPercent: number;
  pointsRemoved: number;
  processingMs: number;
}

export interface GcodeOptimizerResult {
  gcode: string;
  metrics: GcodeOptimizationMetrics;
}

export const gcodeOptimizerDefaults: GcodeOptimizerOptions = {
  simplify: 0.05,
  allowReverse: true,
};
