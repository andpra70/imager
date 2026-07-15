export type StoppelDrawMode =
  | "circles"
  | "triangles"
  | "scribble"
  | "tiny-lines"
  | "doodle-line";

export interface StoppelOptions {
  mode: StoppelDrawMode;
  maxWidth: number;
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  contrast: number;
  gamma: number;
  threshold: number;
  spacing: number;
  maxShapeSize: number;
  steps: number;
  stepLength: number;
  edgeBoost: number;
  jitter: number;
  segmentLength: number;
  density: number;
  seed: number;
}

export const DEFAULT_STOPPEL_OPTIONS: StoppelOptions = {
  mode: "circles",
  maxWidth: 720,
  backgroundColor: "#FFFFFF",
  strokeColor: "#111111",
  strokeWidth: 0.9,
  contrast: 1.1,
  gamma: 1,
  threshold: 0.12,
  spacing: 10,
  maxShapeSize: 10,
  steps: 22000,
  stepLength: 3.2,
  edgeBoost: 0.55,
  jitter: 0.65,
  segmentLength: 4.5,
  density: 3,
  seed: 1,
};
