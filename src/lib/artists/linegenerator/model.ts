export interface LineGeneratorOptions {
  maxWidth: number;
  cellSize: number;
  scoreThreshold: number;
  attemptsPerCell: number;
  maxLinesPerCell: number;
  minLineLength: number;
  maxLineLength: number;
  contrast: number;
  gamma: number;
  darknessBias: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  seed: number;
}

export const DEFAULT_LINE_GENERATOR_OPTIONS: LineGeneratorOptions = {
  maxWidth: 960,
  cellSize: 24,
  scoreThreshold: 0.12,
  attemptsPerCell: 42,
  maxLinesPerCell: 12,
  minLineLength: 6,
  maxLineLength: 34,
  contrast: 1.2,
  gamma: 1,
  darknessBias: 1,
  strokeColor: "#111111",
  backgroundColor: "#FFFFFF",
  strokeWidth: 0.9,
  seed: 1,
};
