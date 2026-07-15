export type U111166DrawMode = "messy-curves" | "sketch-650836" | "center-paint";

export interface U111166Options {
  mode: U111166DrawMode;
  maxWidth: number;
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  contrast: number;
  gamma: number;
  threshold: number;
  spacing: number;
  density: number;
  curveLength: number;
  curveBend: number;
  jitter: number;
  passes: number;
  iterations: number;
  seed: number;
}

export const DEFAULT_U111166_OPTIONS: U111166Options = {
  mode: "messy-curves",
  maxWidth: 860,
  backgroundColor: "#FFFFFF",
  strokeColor: "#111111",
  strokeWidth: 0.9,
  contrast: 1.15,
  gamma: 1,
  threshold: 0.1,
  spacing: 14,
  density: 2.4,
  curveLength: 18,
  curveBend: 0.75,
  jitter: 0.7,
  passes: 3,
  iterations: 10000,
  seed: 1,
};
