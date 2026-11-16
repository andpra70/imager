export interface ShodoOptions {
  maxWidth: number;
  fidelity: number;
  brushSize: number;
  contrast: number;
  inkDensity: number;
  dryBrush: number;
  seed: number;
}

export interface ShodoResult {
  svg: string;
  strokeCount: number;
  outputWidth: number;
  outputHeight: number;
}

export type ShodoProgress = (value: number, status?: string) => void;

