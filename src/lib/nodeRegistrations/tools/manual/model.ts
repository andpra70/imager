export type ArtisticTechnique = "graphite" | "charcoal" | "ink" | "comic-ink";

export type ManualLayerId =
  | "composition"
  | "grid"
  | "landmarks"
  | "envelope"
  | "contours"
  | "tones"
  | "edges"
  | "technique"
  | "texture"
  | "details";

export interface ArtisticPoint {
  x: number;
  y: number;
  importance: number;
  kind: "extreme" | "corner" | "feature";
}

export interface ArtisticCell {
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  meanLuminance: number;
  complexity: number;
}

export interface ArtisticRegion {
  id: number;
  tone: number;
  meanLuminance: number;
  area: number;
  edgeType: "hard" | "soft" | "lost";
}

export interface ArtisticMark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  opacity: number;
  layer: ManualLayerId;
}

export interface ManualPrepareOptions {
  technique: ArtisticTechnique;
  outputWidth: number;
  outputHeight: number;
  preserveAspectRatio: boolean;
  detailLevel: number;
  gridColumns: number;
  adaptiveDepth: number;
  complexityThreshold: number;
  landmarkCount: number;
  toneLevels: 2 | 3 | 5 | 9 | 16 | 32;
  edgeThreshold: number;
  hatchSpacing: number;
  strokeWidth: number;
  textureAmount: number;
  humaneness: number;
  seed: number;
  enabledLayers: ManualLayerId[];
}

export interface ManualStageProgress {
  stage: ManualLayerId | "normalization" | "finalization";
  progress: number;
  overall: number;
  message: string;
}

export interface ArtisticModel {
  schemaVersion: 1;
  source: { width: number; height: number };
  support: { width: number; height: number };
  analysis: { width: number; height: number; coordinateSpace: "analysis-viewBox" };
  technique: ArtisticTechnique;
  options: ManualPrepareOptions;
  grid: ArtisticCell[];
  landmarks: ArtisticPoint[];
  silhouette: ArtisticPoint[];
  tonalRegions: ArtisticRegion[];
  marks: ArtisticMark[];
  metrics: {
    meanLuminance: number;
    edgeDensity: number;
    complexity: number;
  };
  layers: Array<{ id: ManualLayerId; enabled: boolean; elementCount: number }>;
}

export interface ManualWorkerInput {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  options: ManualPrepareOptions;
}

export interface ManualWorkerResult {
  svg: string;
  model: ArtisticModel;
}

export const manualLayerIds: ManualLayerId[] = [
  "composition", "grid", "landmarks", "envelope", "contours",
  "tones", "edges", "technique", "texture", "details",
];

export const manualLayerLabels: Record<ManualLayerId, string> = {
  composition: "Composizione",
  grid: "Reticolo adattivo",
  landmarks: "Punti di riferimento",
  envelope: "Silhouette / inviluppo esterno",
  contours: "Contorni interni",
  tones: "Masse tonali",
  edges: "Classificazione bordi",
  technique: "Resa della tecnica",
  texture: "Texture",
  details: "Microdettagli",
};

export const defaultManualPrepareOptions: ManualPrepareOptions = {
  technique: "graphite",
  outputWidth: 1200,
  outputHeight: 0,
  preserveAspectRatio: true,
  detailLevel: 6,
  gridColumns: 12,
  adaptiveDepth: 2,
  complexityThreshold: 0.22,
  landmarkCount: 60,
  toneLevels: 9,
  edgeThreshold: 0.2,
  hatchSpacing: 7,
  strokeWidth: 1,
  textureAmount: 0.35,
  humaneness: 0.4,
  seed: 1337,
  enabledLayers: [...manualLayerIds],
};
