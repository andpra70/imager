export type LineArtAlgorithmId =
  | "hatching"
  | "cross-hatching"
  | "spiral"
  | "wavy"
  | "concentric"
  | "halftone"
  | "stippling"
  | "grid"
  | "scribble"
  | "sketch";

export interface LineArtAlgorithmOptions {
  lineSpacing: number;
  minThickness: number;
  maxThickness: number;
  angle: number;
  resolution: number;
  intensity: number;
  frequency: number;
  invert: boolean;
  strokeDasharray: string;
  scribblePoints: number;
  opacity: number;
  noise: number;
}

export interface LineArtAlgorithmSpec {
  id: LineArtAlgorithmId;
  type: `tools/linesart/${string}`;
  label: string;
  description: string;
  controls: LineArtControlSpec[];
}

export type LineArtControlSpec = LineArtSliderControlSpec | LineArtToggleControlSpec | LineArtTextControlSpec;

export interface LineArtSliderControlSpec {
  type: "slider";
  key: keyof LineArtAlgorithmOptions;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
}

export interface LineArtToggleControlSpec {
  type: "toggle";
  key: keyof LineArtAlgorithmOptions;
  label: string;
  defaultValue: boolean;
}

export interface LineArtTextControlSpec {
  type: "text";
  key: keyof LineArtAlgorithmOptions;
  label: string;
  defaultValue: string;
}

export const lineArtDefaultOptions: LineArtAlgorithmOptions = {
  lineSpacing: 8,
  minThickness: 0.5,
  maxThickness: 3,
  angle: 45,
  resolution: 1,
  intensity: 10,
  frequency: 1,
  invert: false,
  strokeDasharray: "",
  scribblePoints: 5000,
  opacity: 1,
  noise: 0,
};

const commonControls: LineArtControlSpec[] = [
  { type: "slider", key: "lineSpacing", label: "Line spacing", defaultValue: 8, min: 2, max: 30, step: 1 },
  { type: "slider", key: "minThickness", label: "Min width", defaultValue: 0.5, min: 0, max: 2, step: 0.1 },
  { type: "slider", key: "maxThickness", label: "Max width", defaultValue: 3, min: 1, max: 10, step: 0.5 },
  { type: "slider", key: "opacity", label: "Opacity", defaultValue: 1, min: 0.1, max: 1, step: 0.05 },
  { type: "slider", key: "noise", label: "Noise", defaultValue: 0, min: 0, max: 10, step: 0.5 },
  { type: "toggle", key: "invert", label: "Invert tones", defaultValue: false },
];

const strokeDashControl: LineArtControlSpec = {
  type: "text",
  key: "strokeDasharray",
  label: "Dash pattern",
  defaultValue: "",
};

const intensityControl: LineArtControlSpec = {
  type: "slider",
  key: "intensity",
  label: "Intensity",
  defaultValue: 10,
  min: 0,
  max: 50,
  step: 1,
};

export const lineArtAlgorithms: LineArtAlgorithmSpec[] = [
  {
    id: "hatching",
    type: "tools/linesart/hatching",
    label: "Hatching",
    description: "Parallel hatch lines rotated by angle with tone-based thickness.",
    controls: [
      ...commonControls,
      { type: "slider", key: "angle", label: "Angle", defaultValue: 45, min: 0, max: 180, step: 5 },
      strokeDashControl,
    ],
  },
  {
    id: "cross-hatching",
    type: "tools/linesart/cross-hatching",
    label: "Cross Hatching",
    description: "Two hatching passes at 90 degree offset.",
    controls: [
      ...commonControls,
      { type: "slider", key: "angle", label: "Angle", defaultValue: 45, min: 0, max: 180, step: 5 },
      strokeDashControl,
    ],
  },
  {
    id: "spiral",
    type: "tools/linesart/spiral",
    label: "Spiral",
    description: "Single radial spiral with tone-modulated stroke width.",
    controls: [...commonControls, strokeDashControl],
  },
  {
    id: "wavy",
    type: "tools/linesart/wavy",
    label: "Wavy",
    description: "Horizontal waves with brightness-driven amplitude/frequency.",
    controls: [
      ...commonControls,
      intensityControl,
      { type: "slider", key: "frequency", label: "Wave frequency", defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
    ],
  },
  {
    id: "concentric",
    type: "tools/linesart/concentric",
    label: "Concentric",
    description: "Concentric rings sampled on source luminance.",
    controls: [...commonControls],
  },
  {
    id: "halftone",
    type: "tools/linesart/halftone",
    label: "Halftone",
    description: "Dot grid with radius controlled by tone.",
    controls: [...commonControls],
  },
  {
    id: "stippling",
    type: "tools/linesart/stippling",
    label: "Stippling",
    description: "Random stipple points weighted by image darkness.",
    controls: [...commonControls, intensityControl],
  },
  {
    id: "grid",
    type: "tools/linesart/grid",
    label: "Grid",
    description: "Orthogonal hatching (0 and 90 degrees).",
    controls: [...commonControls, strokeDashControl],
  },
  {
    id: "scribble",
    type: "tools/linesart/scribble",
    label: "Scribble",
    description: "Nearest-neighbor scribble path from sampled density points.",
    controls: [
      ...commonControls,
      { type: "slider", key: "scribblePoints", label: "Scribble points", defaultValue: 5000, min: 1000, max: 20000, step: 500 },
    ],
  },
  {
    id: "sketch",
    type: "tools/linesart/sketch",
    label: "Sketch",
    description: "Short pencil-like strokes with local randomness.",
    controls: [...commonControls, intensityControl],
  },
];
