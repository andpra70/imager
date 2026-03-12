import source from "./potrace.js?raw";

export type PotraceTurnPolicy = "black" | "white" | "left" | "right" | "minority" | "majority";

export interface PotraceParameters {
  turnpolicy?: PotraceTurnPolicy;
  turdsize?: number;
  optcurve?: boolean;
  alphamax?: number;
  opttolerance?: number;
}

export interface PotraceApi {
  loadImageFromUrl: (url: string) => void;
  setParameter: (params: PotraceParameters) => void;
  process: (callback: () => void) => void;
  getSVG: (size?: number, opt_type?: string) => string;
}

const RUNTIME_KEY = "__plotterfun_potrace_runtime__";

function createRuntime() {
  const runtime = globalThis as Record<string, unknown>;
  const cached = runtime[RUNTIME_KEY];
  if (
    cached
    && typeof cached === "object"
    && typeof (cached as PotraceApi).process === "function"
    && typeof (cached as PotraceApi).getSVG === "function"
  ) {
    return cached as PotraceApi;
  }

  const factory = new Function(
    `${source}
return (
  (typeof Potrace !== "undefined" ? Potrace : undefined) ||
  (typeof globalThis !== "undefined" ? (globalThis.Potrace || globalThis.potrace) : undefined)
);`,
  ) as () => PotraceApi | undefined;

  const instance = factory();
  if (!instance || typeof instance.process !== "function" || typeof instance.getSVG !== "function") {
    throw new Error("Potrace runtime is not available.");
  }

  runtime[RUNTIME_KEY] = instance;
  return instance;
}

const potraceRuntime = createRuntime();

export default potraceRuntime;
