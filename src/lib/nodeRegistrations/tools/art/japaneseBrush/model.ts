export interface JapaneseBrushOptions {
  maxWidth: number;
  grayLevels: number;
  spacing: number;
  strokeLength: number;
  strokeWidth: number;
  flow: number;
  seed: number;
}

export interface JapaneseBrushResult {
  svg: string;
  strokeCount: number;
  outputWidth: number;
  outputHeight: number;
  grayLevels: number;
}

export type JapaneseBrushProgress = (value: number, status?: string) => void;

