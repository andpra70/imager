import { drawImagePreview } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { NodeCtor, PreviewAwareNode } from "../../shared";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  getGraphImageSignature,
  notifyGraphStateChange,
  refreshNode,
} from "../shared";
import { OptimizedToolNode } from "../shared";
import { executePlotterLegacyAlgorithm } from "./legacyRuntime";

type PlotterControlSpec = PlotterSliderControlSpec | PlotterToggleControlSpec | PlotterComboControlSpec;

interface PlotterSliderControlSpec {
  type: "slider";
  key: string;
  legacyLabel: string;
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
}

interface PlotterToggleControlSpec {
  type: "toggle";
  key: string;
  legacyLabel: string;
  label: string;
  defaultValue: boolean;
}

interface PlotterComboControlSpec {
  type: "combo";
  key: string;
  legacyLabel: string;
  label: string;
  defaultValue: string | number;
  options: Array<string | number>;
}

interface PlotterAlgorithmSpec {
  id: string;
  type: string;
  sourceFile: string;
  label: string;
  description: string;
  includeDefaultControls: boolean;
  controls: PlotterControlSpec[];
}

interface PlotterNodePayload {
  family: "plotterfun";
  schemaVersion: 1;
  algorithm: {
    id: string;
    type: string;
    label: string;
    sourceFile: string;
    description: string;
  };
  image: {
    width: number;
    height: number;
  } | null;
  controls: Record<string, string | number | boolean>;
  legacyConfig: Record<string, string | number | boolean>;
  controlModel: Array<{
    key: string;
    legacyLabel: string;
    label: string;
    type: PlotterControlSpec["type"];
    min?: number;
    max?: number;
    step?: number;
    options?: Array<string | number>;
    defaultValue: string | number | boolean;
  }>;
}

const plotterDefaultControls: PlotterControlSpec[] = [
  { type: "toggle", key: "inverted", legacyLabel: "Inverted", label: "Inverted", defaultValue: false },
  { type: "slider", key: "brightness", legacyLabel: "Brightness", label: "Brightness", defaultValue: 0, min: -100, max: 100, step: 1 },
  { type: "slider", key: "contrast", legacyLabel: "Contrast", label: "Contrast", defaultValue: 0, min: -100, max: 100, step: 1 },
  { type: "slider", key: "minBrightness", legacyLabel: "Min brightness", label: "Min brightness", defaultValue: 0, min: 0, max: 255, step: 1 },
  { type: "slider", key: "maxBrightness", legacyLabel: "Max brightness", label: "Max brightness", defaultValue: 255, min: 0, max: 255, step: 1 },
];

export const plotterAlgorithms: PlotterAlgorithmSpec[] = [
  {
    id: "boxes",
    type: "tools/plotter/boxes",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/boxes.js",
    label: "Boxes",
    description: "Grid di box proporzionati alla luminanza, con random opzionale.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "boxSize", legacyLabel: "Box Size", label: "Box Size", defaultValue: 5, min: 5, max: 50, step: 1 },
      { type: "slider", key: "boxSpacing", legacyLabel: "Box Spacing", label: "Box Spacing", defaultValue: 10, min: 5, max: 50, step: 1 },
      { type: "toggle", key: "random", legacyLabel: "Random", label: "Random", defaultValue: false },
    ],
  },
  {
    id: "delaunay",
    type: "tools/plotter/delaunay",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/delaunay.js",
    label: "Delaunay",
    description: "Stipple + triangolazione Delaunay con iterazioni e spread/gamma.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "maxStipples", legacyLabel: "Max Stipples", label: "Max Stipples", defaultValue: 2000, min: 500, max: 10000, step: 1 },
      { type: "slider", key: "maxIterations", legacyLabel: "Max Iterations", label: "Max Iterations", defaultValue: 30, min: 2, max: 200, step: 1 },
      { type: "slider", key: "spread", legacyLabel: "Spread", label: "Spread", defaultValue: 0, min: 0, max: 100, step: 1 },
      { type: "slider", key: "gamma", legacyLabel: "Gamma", label: "Gamma", defaultValue: 2, min: 0, max: 10, step: 0.01 },
    ],
  },
  {
    id: "dots",
    type: "tools/plotter/dots",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/dots.js",
    label: "Dots",
    description: "Punti/segmenti randomizzati con seed e direzione controllata.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "resolution", legacyLabel: "Resolution", label: "Resolution", defaultValue: 2, min: 1, max: 20, step: 1 },
      { type: "slider", key: "lineDirection", legacyLabel: "Line Direction", label: "Line Direction", defaultValue: 0, min: 0, max: 180, step: 1 },
      { type: "toggle", key: "randomDirection", legacyLabel: "Random Direction", label: "Random Direction", defaultValue: false },
      { type: "slider", key: "seed", legacyLabel: "Seed", label: "Seed", defaultValue: 50, min: 0, max: 100, step: 1 },
    ],
  },
  {
    id: "halftone",
    type: "tools/plotter/halftone",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/halftone.js",
    label: "Halftone",
    description: "Retino a cerchi/diamanti con cutoff e interlacciamento.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "divisions", legacyLabel: "Divisions", label: "Divisions", defaultValue: 25, min: 10, max: 100, step: 1 },
      { type: "slider", key: "factor", legacyLabel: "Factor", label: "Factor", defaultValue: 100, min: 10, max: 400, step: 1 },
      { type: "slider", key: "cutoff", legacyLabel: "Cutoff", label: "Cutoff", defaultValue: 0, min: 0, max: 254, step: 1 },
      { type: "toggle", key: "interlaced", legacyLabel: "Interlaced", label: "Interlaced", defaultValue: false },
      { type: "toggle", key: "diamond", legacyLabel: "Diamond", label: "Diamond", defaultValue: false },
    ],
  },
  {
    id: "implode",
    type: "tools/plotter/implode",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/implode.js",
    label: "Implode",
    description: "Raggi centripeti con threshold/dither e route optimization.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "rays", legacyLabel: "Rays", label: "Rays", defaultValue: 1000, min: 100, max: 5000, step: 1 },
      { type: "slider", key: "threshold", legacyLabel: "Threshold", label: "Threshold", defaultValue: 128, min: 1, max: 254, step: 1 },
      { type: "slider", key: "stepSize", legacyLabel: "Step size", label: "Step size", defaultValue: 5, min: 1, max: 20, step: 0.1 },
      { type: "slider", key: "dither", legacyLabel: "Dither", label: "Dither", defaultValue: 0, min: 0, max: 1, step: 0.01 },
      { type: "toggle", key: "optimizeRoute", legacyLabel: "Optimize route", label: "Optimize route", defaultValue: true },
    ],
  },
  {
    id: "jaggy",
    type: "tools/plotter/jaggy",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/jaggy.js",
    label: "Jaggy",
    description: "Percorso singolo iterativo con inserimento sul segmento piu vicino.",
    includeDefaultControls: true,
    controls: [{ type: "slider", key: "seed", legacyLabel: "Seed", label: "Seed", defaultValue: 50, min: 0, max: 100, step: 1 }],
  },
  {
    id: "linedraw",
    type: "tools/plotter/linedraw",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/linedraw.js",
    label: "Linedraw",
    description: "Port del linedraw.py con contorni/hatching/noise scale.",
    includeDefaultControls: false,
    controls: [
      { type: "toggle", key: "contours", legacyLabel: "Contours", label: "Contours", defaultValue: true },
      { type: "slider", key: "contourDetail", legacyLabel: "Contour detail", label: "Contour detail", defaultValue: 8, min: 1, max: 16, step: 1 },
      { type: "toggle", key: "hatching", legacyLabel: "Hatching", label: "Hatching", defaultValue: true },
      { type: "slider", key: "hatchScale", legacyLabel: "Hatch scale", label: "Hatch scale", defaultValue: 8, min: 1, max: 24, step: 1 },
      { type: "slider", key: "noiseScale", legacyLabel: "Noise scale", label: "Noise scale", defaultValue: 1, min: 0, max: 2, step: 0.1 },
      { type: "toggle", key: "optimizeRoute", legacyLabel: "Optimize route", label: "Optimize route", defaultValue: true },
    ],
  },
  {
    id: "linescan",
    type: "tools/plotter/linescan",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/linescan.js",
    label: "Linescan",
    description: "Scansione lineare threshold-based su orizzontale/verticale/both.",
    includeDefaultControls: false,
    controls: [
      { type: "slider", key: "spacing", legacyLabel: "Spacing", label: "Spacing", defaultValue: 5, min: 1, max: 20, step: 1 },
      { type: "slider", key: "threshold", legacyLabel: "Threshold", label: "Threshold", defaultValue: 128, min: 0, max: 255, step: 1 },
      { type: "slider", key: "minlength", legacyLabel: "Minlength", label: "Minlength", defaultValue: 1, min: 0, max: 32, step: 1 },
      { type: "toggle", key: "alternate", legacyLabel: "Alternate", label: "Alternate", defaultValue: false },
      { type: "combo", key: "direction", legacyLabel: "Direction", label: "Direction", defaultValue: "Horizontal", options: ["Horizontal", "Vertical", "Both"] },
    ],
  },
  {
    id: "longwave",
    type: "tools/plotter/longwave",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/longwave.js",
    label: "Longwave",
    description: "Onde lunghe threshold/hysteresis con profondita e direzione.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "waveSpeed", legacyLabel: "Wave Speed", label: "Wave Speed", defaultValue: 20, min: 1, max: 100, step: 1 },
      { type: "slider", key: "waveAmplitude", legacyLabel: "Wave Amplitude", label: "Wave Amplitude", defaultValue: 10, min: 0, max: 50, step: 0.1 },
      { type: "slider", key: "stepSize", legacyLabel: "Step size", label: "Step size", defaultValue: 5, min: 1, max: 20, step: 0.1 },
      { type: "slider", key: "simplify", legacyLabel: "Simplify", label: "Simplify", defaultValue: 10, min: 1, max: 50, step: 0.1 },
      { type: "slider", key: "depth", legacyLabel: "Depth", label: "Depth", defaultValue: 1, min: 1, max: 8, step: 1 },
      { type: "combo", key: "direction", legacyLabel: "Direction", label: "Direction", defaultValue: "Vertical", options: ["Vertical", "Horizontal", "Both"] },
      { type: "toggle", key: "optimizeRoute", legacyLabel: "Optimize route", label: "Optimize route", defaultValue: false },
    ],
  },
  {
    id: "mosaic",
    type: "tools/plotter/mosaic",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/mosaic.js",
    label: "Mosaic",
    description: "Mosaico hatch su celle con scala, hatches e outlines.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "scale", legacyLabel: "Scale", label: "Scale", defaultValue: 10, min: 2, max: 100, step: 1 },
      { type: "slider", key: "hatches", legacyLabel: "Hatches", label: "Hatches", defaultValue: 6, min: 2, max: 10, step: 1 },
      { type: "toggle", key: "outlines", legacyLabel: "Outlines", label: "Outlines", defaultValue: false },
    ],
  },
  {
    id: "needles",
    type: "tools/plotter/needles",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/needles.js",
    label: "Needles",
    description: "Needle strokes con lunghezza massima e soglia.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "needles", legacyLabel: "Needles", label: "Needles", defaultValue: 100, min: 100, max: 10000, step: 1 },
      { type: "slider", key: "maxLength", legacyLabel: "Max Length", label: "Max Length", defaultValue: 5, min: 0.1, max: 40, step: 0.1 },
      { type: "slider", key: "threshold", legacyLabel: "Threshold", label: "Threshold", defaultValue: 50, min: 1, max: 254, step: 1 },
      { type: "toggle", key: "optimizeRoute", legacyLabel: "Optimize route", label: "Optimize route", defaultValue: true },
    ],
  },
  {
    id: "peano",
    type: "tools/plotter/peano",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/peano.js",
    label: "Peano",
    description: "Peano space-filling curve con ordine e blocchi.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "order", legacyLabel: "Order", label: "Order", defaultValue: 5, min: 1, max: 6, step: 1 },
      { type: "slider", key: "hblocks", legacyLabel: "Hblocks", label: "Hblocks", defaultValue: 1, min: 1, max: 15, step: 1 },
      { type: "slider", key: "vblocks", legacyLabel: "Vblocks", label: "Vblocks", defaultValue: 1, min: 1, max: 15, step: 1 },
    ],
  },
  {
    id: "polyspiral",
    type: "tools/plotter/polyspiral",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/polyspiral.js",
    label: "PolySpiral",
    description: "Spirale poligonale con displacement modulato da luminanza.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "polygon", legacyLabel: "Polygon", label: "Polygon", defaultValue: 4, min: 3, max: 8, step: 1 },
      { type: "slider", key: "frequency", legacyLabel: "Frequency", label: "Frequency", defaultValue: 150, min: 5, max: 256, step: 1 },
      { type: "slider", key: "amplitude", legacyLabel: "Amplitude", label: "Amplitude", defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
      { type: "slider", key: "spacing", legacyLabel: "Spacing", label: "Spacing", defaultValue: 1, min: 0.5, max: 5, step: 0.1 },
    ],
  },
  {
    id: "sawtooth",
    type: "tools/plotter/sawtooth",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/sawtooth.js",
    label: "Sawtooth",
    description: "Versione sawtooth multi-linea con campionamento continuo.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "frequency", legacyLabel: "Frequency", label: "Frequency", defaultValue: 150, min: 5, max: 256, step: 1 },
      { type: "slider", key: "lineCount", legacyLabel: "Line Count", label: "Line Count", defaultValue: 50, min: 10, max: 200, step: 1 },
      { type: "slider", key: "amplitude", legacyLabel: "Amplitude", label: "Amplitude", defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
      { type: "slider", key: "sampling", legacyLabel: "Sampling", label: "Sampling", defaultValue: 1, min: 0.5, max: 2.9, step: 0.1 },
    ],
  },
  {
    id: "spiral",
    type: "tools/plotter/spiral",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/spiral.js",
    label: "Spiral",
    description: "Spirale radiale con ampiezza/frequenza/spacing.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "frequency", legacyLabel: "Frequency", label: "Frequency", defaultValue: 150, min: 5, max: 256, step: 1 },
      { type: "slider", key: "amplitude", legacyLabel: "Amplitude", label: "Amplitude", defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
      { type: "slider", key: "spacing", legacyLabel: "Spacing", label: "Spacing", defaultValue: 1, min: 0.5, max: 5, step: 0.1 },
    ],
  },
  {
    id: "springs",
    type: "tools/plotter/springs",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/springs.js",
    label: "Springs",
    description: "Traiettorie tipo molla con direzione widdershins opzionale.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "frequency", legacyLabel: "Frequency", label: "Frequency", defaultValue: 50, min: 1, max: 100, step: 1 },
      { type: "slider", key: "lineCount", legacyLabel: "Line Count", label: "Line Count", defaultValue: 20, min: 10, max: 100, step: 1 },
      { type: "slider", key: "amplitude", legacyLabel: "Amplitude", label: "Amplitude", defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
      { type: "slider", key: "sampling", legacyLabel: "Sampling", label: "Sampling", defaultValue: 1, min: 0.5, max: 5, step: 0.1 },
      { type: "toggle", key: "widdershins", legacyLabel: "Widdershins", label: "Widdershins", defaultValue: false },
    ],
  },
  {
    id: "squiggle",
    type: "tools/plotter/squiggle",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/squiggle.js",
    label: "Squiggle",
    description: "Squiggle classico con AM/FM/both modulation.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "frequency", legacyLabel: "Frequency", label: "Frequency", defaultValue: 150, min: 5, max: 256, step: 1 },
      { type: "slider", key: "lineCount", legacyLabel: "Line Count", label: "Line Count", defaultValue: 50, min: 10, max: 200, step: 1 },
      { type: "slider", key: "amplitude", legacyLabel: "Amplitude", label: "Amplitude", defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
      { type: "slider", key: "sampling", legacyLabel: "Sampling", label: "Sampling", defaultValue: 1, min: 0.5, max: 2.9, step: 0.1 },
      { type: "combo", key: "modulation", legacyLabel: "Modulation", label: "Modulation", defaultValue: "both", options: ["both", "AM", "FM"] },
    ],
  },
  {
    id: "squiggle-left-right",
    type: "tools/plotter/squiggle-left-right",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/squiggleLeftRight.js",
    label: "Squiggle L/R",
    description: "Squiggle zig-zag sinistra/destra con join ends opzionale.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "frequency", legacyLabel: "Frequency", label: "Frequency", defaultValue: 150, min: 5, max: 256, step: 1 },
      { type: "slider", key: "lineCount", legacyLabel: "Line Count", label: "Line Count", defaultValue: 50, min: 10, max: 200, step: 1 },
      { type: "slider", key: "amplitude", legacyLabel: "Amplitude", label: "Amplitude", defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
      { type: "slider", key: "sampling", legacyLabel: "Sampling", label: "Sampling", defaultValue: 1, min: 0.5, max: 2.9, step: 0.1 },
      { type: "toggle", key: "joinEnds", legacyLabel: "Join Ends", label: "Join Ends", defaultValue: false },
    ],
  },
  {
    id: "stipple",
    type: "tools/plotter/stipple",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/stipple.js",
    label: "Stipple",
    description: "Voronoi stippling iterativo con TSP art e shape variants.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "maxStipples", legacyLabel: "Max Stipples", label: "Max Stipples", defaultValue: 2000, min: 500, max: 10000, step: 1 },
      { type: "slider", key: "maxIterations", legacyLabel: "Max Iterations", label: "Max Iterations", defaultValue: 30, min: 2, max: 200, step: 1 },
      { type: "slider", key: "minDotSize", legacyLabel: "Min dot size", label: "Min dot size", defaultValue: 2, min: 0.5, max: 8, step: 0.1 },
      { type: "slider", key: "dotSizeRange", legacyLabel: "Dot size range", label: "Dot size range", defaultValue: 4, min: 0, max: 20, step: 0.1 },
      { type: "toggle", key: "tspArt", legacyLabel: "TSP Art", label: "TSP Art", defaultValue: false },
      {
        type: "combo",
        key: "stippleType",
        legacyLabel: "Stipple type",
        label: "Stipple type",
        defaultValue: "Circles",
        options: ["Circles", "Spirals", "Hexagons", "Pentagrams", "Snowflakes"],
      },
    ],
  },
  {
    id: "subline",
    type: "tools/plotter/subline",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/subline.js",
    label: "Subline",
    description: "Linee principali divise in subline forward/backward.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "lineCount", legacyLabel: "Line Count", label: "Line Count", defaultValue: 50, min: 10, max: 200, step: 1 },
      { type: "slider", key: "sublines", legacyLabel: "Sublines", label: "Sublines", defaultValue: 3, min: 1, max: 10, step: 1 },
      { type: "slider", key: "amplitude", legacyLabel: "Amplitude", label: "Amplitude", defaultValue: 1, min: 0.1, max: 5, step: 0.1 },
      { type: "slider", key: "sampling", legacyLabel: "Sampling", label: "Sampling", defaultValue: 1, min: 0.5, max: 5, step: 0.1 },
    ],
  },
  {
    id: "waves",
    type: "tools/plotter/waves",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/waves.js",
    label: "Waves",
    description: "Tracciato a onde parallele orientabili per angolo e passo.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "angle", legacyLabel: "Angle", label: "Angle", defaultValue: 0, min: 0, max: 360, step: 1 },
      { type: "slider", key: "stepSize", legacyLabel: "Step size", label: "Step size", defaultValue: 5, min: 1, max: 20, step: 0.1 },
    ],
  },
  {
    id: "woven",
    type: "tools/plotter/woven",
    sourceFile: "src/lib/nodeRegistrations/tools/plotter/legacy/woven.js",
    label: "Woven",
    description: "Effetto tessitura con swapping linee e power mapping.",
    includeDefaultControls: true,
    controls: [
      { type: "slider", key: "frequency", legacyLabel: "Frequency", label: "Frequency", defaultValue: 150, min: 5, max: 256, step: 1 },
      { type: "slider", key: "lineCount", legacyLabel: "Line Count", label: "Line Count", defaultValue: 8, min: 5, max: 200, step: 1 },
      { type: "toggle", key: "cosine", legacyLabel: "Cosine", label: "Cosine", defaultValue: false },
      { type: "toggle", key: "random", legacyLabel: "Random", label: "Random", defaultValue: false },
      { type: "combo", key: "power", legacyLabel: "Power", label: "Power", defaultValue: 2, options: [0.5, 1, 2, 3] },
    ],
  },
];

function getAlgorithmFile(sourceFile: string) {
  const parts = sourceFile.split("/");
  const filename = parts[parts.length - 1];
  if (!filename.endsWith(".js")) {
    throw new Error(`Invalid plotter source file: ${sourceFile}`);
  }
  return filename as
    | "boxes.js"
    | "delaunay.js"
    | "dots.js"
    | "halftone.js"
    | "implode.js"
    | "jaggy.js"
    | "linedraw.js"
    | "linescan.js"
    | "longwave.js"
    | "mosaic.js"
    | "needles.js"
    | "peano.js"
    | "polyspiral.js"
    | "sawtooth.js"
    | "spiral.js"
    | "springs.js"
    | "squiggle.js"
    | "squiggleLeftRight.js"
    | "stipple.js"
    | "subline.js"
    | "waves.js"
    | "woven.js";
}

function getActiveControls(spec: PlotterAlgorithmSpec) {
  return spec.includeDefaultControls
    ? [...plotterDefaultControls, ...spec.controls]
    : [...spec.controls];
}

function getPrecisionFromStep(step: number | undefined) {
  if (step === undefined || Number.isInteger(step)) {
    return undefined;
  }
  const decimals = step.toString().split(".")[1];
  return decimals ? decimals.length : undefined;
}

function normalizeControlValue(control: PlotterControlSpec, rawValue: unknown): string | number | boolean {
  if (control.type === "toggle") {
    return Boolean(rawValue);
  }
  if (control.type === "combo") {
    return control.options.includes(rawValue as string | number)
      ? (rawValue as string | number)
      : control.defaultValue;
  }
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return control.defaultValue;
  }
  return clamp(numericValue, control.min, control.max);
}

function buildDefaultProperties(spec: PlotterAlgorithmSpec) {
  const properties: Record<string, unknown> = {};
  const controls = getActiveControls(spec);
  for (const control of controls) {
    properties[control.key] = control.defaultValue;
  }
  return properties;
}

function buildPayload(
  spec: PlotterAlgorithmSpec,
  properties: Record<string, unknown>,
  image: GraphImage | null,
): PlotterNodePayload {
  const controls = getActiveControls(spec);
  const normalizedControls: Record<string, string | number | boolean> = {};
  const legacyConfig: Record<string, string | number | boolean> = {};

  for (const control of controls) {
    const normalized = normalizeControlValue(control, properties[control.key]);
    normalizedControls[control.key] = normalized;
    legacyConfig[control.legacyLabel] = normalized;
  }

  // Some legacy algorithms call pixelProcessor(...) even when they do not
  // expose defaultControls in their own UI (e.g. linescan). Ensure baseline
  // legacy fields are always present to avoid NaN pipelines.
  if (legacyConfig.Inverted === undefined) legacyConfig.Inverted = false;
  if (legacyConfig.Brightness === undefined) legacyConfig.Brightness = 0;
  if (legacyConfig.Contrast === undefined) legacyConfig.Contrast = 0;
  if (legacyConfig["Min brightness"] === undefined) legacyConfig["Min brightness"] = 0;
  if (legacyConfig["Max brightness"] === undefined) legacyConfig["Max brightness"] = 255;

  if (image) {
    legacyConfig.width = image.width;
    legacyConfig.height = image.height;
  }

  const controlModel = controls.map((control) => {
    if (control.type === "slider") {
      return {
        key: control.key,
        legacyLabel: control.legacyLabel,
        label: control.label,
        type: control.type,
        min: control.min,
        max: control.max,
        step: control.step,
        defaultValue: control.defaultValue,
      };
    }
    if (control.type === "combo") {
      return {
        key: control.key,
        legacyLabel: control.legacyLabel,
        label: control.label,
        type: control.type,
        options: control.options,
        defaultValue: control.defaultValue,
      };
    }
    return {
      key: control.key,
      legacyLabel: control.legacyLabel,
      label: control.label,
      type: control.type,
      defaultValue: control.defaultValue,
    };
  });

  return {
    family: "plotterfun",
    schemaVersion: 1,
    algorithm: {
      id: spec.id,
      type: spec.type,
      label: spec.label,
      sourceFile: spec.sourceFile,
      description: spec.description,
    },
    image: image
      ? {
        width: image.width,
        height: image.height,
      }
      : null,
    controls: normalizedControls,
    legacyConfig,
    controlModel,
  };
}

function createNodeCtor(spec: PlotterAlgorithmSpec): NodeCtor {
  const controls = getActiveControls(spec);
  const algorithmFile = getAlgorithmFile(spec.sourceFile);

  class PlotterToolNode extends OptimizedToolNode {
    size: [number, number] = [320, 470];
    preview: GraphImage | null = null;
    svg: GraphSvg | null = null;
    payload: PlotterNodePayload | null = null;
    status = "idle";
    pathCount = 0;
    isRendering = false;
    renderToken = 0;
    runningSignature = "";
    runningOptionsSignature = "";
    private abortController: AbortController | null = null;

    constructor() {
      super();
      const node = this as unknown as PreviewAwareNode & PlotterToolNode;
      node.title = createToolTitle(`Plotter/${spec.label}`);
      node.properties = buildDefaultProperties(spec);
      node.addInput("image", "image");
      node.addOutput("image", "image");
      node.addOutput("svg", "svg");
      node.addOutput("json", "*");

      for (const control of controls) {
        if (control.type === "toggle") {
          node.addWidget("toggle", control.label, control.defaultValue, (value) => {
            node.properties[control.key] = Boolean(value);
            notifyGraphStateChange(node);
          });
          continue;
        }

        if (control.type === "combo") {
          node.addWidget("combo", control.label, control.defaultValue, (value) => {
            node.properties[control.key] = normalizeControlValue(control, value);
            notifyGraphStateChange(node);
          }, { values: control.options });
          continue;
        }

        const precision = getPrecisionFromStep(control.step);
        node.addWidget(
          "slider",
          control.label,
          control.defaultValue,
          (value) => {
            node.properties[control.key] = normalizeControlValue(control, value);
            notifyGraphStateChange(node);
          },
          {
            min: control.min,
            max: control.max,
            step: control.step ?? 1,
            ...(precision !== undefined ? { precision } : {}),
          },
        );
      }

      node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4);
      node.refreshPreviewLayout();
    }

    onExecute(this: PreviewAwareNode & PlotterToolNode) {
      const input = this.getInputData(0);
      const image = input ?? null;
      const payload = buildPayload(spec, this.properties, image);
      this.payload = payload;

      if (!image) {
        this.preview = null;
        this.svg = null;
        this.pathCount = 0;
        this.status = "waiting image";
        this.isRendering = false;
        this.runningSignature = "";
        this.runningOptionsSignature = "";
        this.executionMs = null;
        this.abortController?.abort();
        this.abortController = null;
        this.resetOptimizedCache();
        this.setOutputData(0, null);
        this.setOutputData(1, null);
        this.setOutputData(2, this.payload);
        this.refreshPreviewLayout();
        return;
      }

      const signature = getGraphImageSignature(image);
      const optionsSignature = JSON.stringify(payload.controls);

      if (
        this.isRendering &&
        this.runningSignature === signature &&
        this.runningOptionsSignature === optionsSignature
      ) {
        this.setOutputData(0, this.preview);
        this.setOutputData(1, this.svg);
        this.setOutputData(2, this.payload);
        return;
      }

      if (
        !this.isRendering &&
        this.lastSignature === signature &&
        this.lastOptionsSignature === optionsSignature
      ) {
        this.setOutputData(0, this.preview);
        this.setOutputData(1, this.svg);
        this.setOutputData(2, this.payload);
        return;
      }

      if (this.canReuseOptimizedResult(signature, optionsSignature)) {
        this.setOutputData(0, this.preview);
        this.setOutputData(1, this.svg);
        this.setOutputData(2, this.payload);
        this.refreshPreviewLayout();
        return;
      }

      const startedAt = performance.now();
      this.abortController?.abort();
      this.abortController = new AbortController();
      const renderToken = ++this.renderToken;
      this.runningSignature = signature;
      this.runningOptionsSignature = optionsSignature;
      this.preview = image;
      this.svg = null;
      this.pathCount = 0;
      this.status = "rendering...";
      this.isRendering = true;
      this.refreshPreviewLayout();

      void executePlotterLegacyAlgorithm({
        algorithmFile,
        config: payload.legacyConfig,
        image,
        signal: this.abortController.signal,
      })
        .then((result) => {
          if (this.renderToken !== renderToken) {
            return;
          }
          this.preview = result.preview;
          this.svg = result.svg;
          this.pathCount = result.pathCount;
          this.status = result.status || "ready";
          this.isRendering = false;
          this.runningSignature = "";
          this.runningOptionsSignature = "";
          this.completeOptimizedExecution(startedAt, signature, optionsSignature);
          this.setOutputData(0, this.preview);
          this.setOutputData(1, this.svg);
          this.setOutputData(2, this.payload);
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (this.renderToken !== renderToken) {
            return;
          }
          if (error instanceof Error && error.message === "cancelled") {
            return;
          }
          this.preview = image;
          this.svg = null;
          this.pathCount = 0;
          this.status = error instanceof Error ? error.message : "plotter runtime error";
          this.isRendering = false;
          this.runningSignature = "";
          this.runningOptionsSignature = "";
          this.executionMs = null;
          this.resetOptimizedCache();
          this.setOutputData(0, this.preview);
          this.setOutputData(1, this.svg);
          this.setOutputData(2, this.payload);
          this.setDirtyCanvas(true, true);
        });

      this.setOutputData(0, this.preview);
      this.setOutputData(1, this.svg);
      this.setOutputData(2, this.payload);
    }

    onDrawBackground(this: PreviewAwareNode & PlotterToolNode, context: CanvasRenderingContext2D) {
      const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
      context.save();
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.font = "12px sans-serif";
      context.fillText(`algo: ${spec.id} | ${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
      context.fillText(`src: ${spec.sourceFile}`, 10, layout.footerTop + 30);
      context.fillText(`paths: ${this.pathCount}`, 10, layout.footerTop + 48);
      context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
      context.restore();
    }

    onRemoved(this: PlotterToolNode) {
      this.abortController?.abort();
      this.abortController = null;
    }
  }

  return PlotterToolNode as unknown as NodeCtor;
}

export function createPlotterNodeCtors(): Record<string, NodeCtor> {
  const ctors: Record<string, NodeCtor> = {};
  for (const spec of plotterAlgorithms) {
    ctors[spec.type] = createNodeCtor(spec);
  }
  return ctors;
}
