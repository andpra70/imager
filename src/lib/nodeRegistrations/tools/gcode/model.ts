export interface SvgToGcodeOptions {
  sampleStep: number;
  fastDraft: boolean;
  maxPointsPerPath: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  drawFeedRate: number;
  travelFeedRate: number;
  safeZ: number;
  drawZ: number;
  closePaths: boolean;
  includeHeader: boolean;
  decimals: number;
}

export interface SvgToGcodeStats {
  pathCount: number;
  pointCount: number;
  commandCount: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
}

export const svgToGcodeDefaults: SvgToGcodeOptions = {
  sampleStep: 1,
  fastDraft: false,
  maxPointsPerPath: 600,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  drawFeedRate: 1200,
  travelFeedRate: 3000,
  safeZ: 5,
  drawZ: 0,
  closePaths: true,
  includeHeader: true,
  decimals: 3,
};
