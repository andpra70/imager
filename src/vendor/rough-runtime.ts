import roughSource from "./rough.js?raw";

export interface RoughPathOptions {
  roughness?: number;
  bowing?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fillStyle?:
    | "hachure"
    | "solid"
    | "zigzag"
    | "cross-hatch"
    | "dots"
    | "dashed"
    | "zigzag-line";
  hachureAngle?: number;
  hachureGap?: number;
  fillWeight?: number;
  simplification?: number;
  curveStepCount?: number;
  maxRandomnessOffset?: number;
  seed?: number;
  disableMultiStroke?: boolean;
}

export interface RoughSvgRenderer {
  path: (d: string, options?: RoughPathOptions) => SVGGElement;
}

export interface RoughApi {
  svg: (svg: SVGSVGElement, config?: Record<string, unknown>) => RoughSvgRenderer;
  newSeed?: () => number;
}

const RUNTIME_KEY = "__plotterfun_rough_runtime__";

function createRuntime() {
  const runtime = globalThis as Record<string, unknown>;
  const cached = runtime[RUNTIME_KEY];
  if (cached && typeof cached === "object" && typeof (cached as RoughApi).svg === "function") {
    return cached as RoughApi;
  }

  const factory = new Function(`${roughSource}\nreturn rough;`) as () => RoughApi;
  const instance = factory();
  runtime[RUNTIME_KEY] = instance;
  return instance;
}

const roughRuntime = createRuntime();

export default roughRuntime;
