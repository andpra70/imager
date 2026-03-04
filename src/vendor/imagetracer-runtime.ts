import source from "./imagetracer.1.2.6.js?raw";

import type { ImageTracerOptions } from "./imagetracer.1.2.6.js";

export interface ImageTracerApi {
  optionpresets: Record<string, ImageTracerOptions>;
  imagedataToSVG: (imageData: ImageData, options?: string | ImageTracerOptions) => string;
  checkoptions: (options?: string | ImageTracerOptions) => ImageTracerOptions;
}

const RUNTIME_KEY = "__plotterfun_imagetracer_runtime__";

function createRuntime() {
  const runtime = globalThis as Record<string, unknown>;
  const cached = runtime[RUNTIME_KEY];
  if (
    cached &&
    typeof cached === "object" &&
    typeof (cached as ImageTracerApi).imagedataToSVG === "function"
  ) {
    return cached as ImageTracerApi;
  }

  const factory = new Function(
    `${source}
return (
  globalThis.ImageTracer ||
  (typeof self !== "undefined" ? self.ImageTracer : undefined) ||
  (typeof window !== "undefined" ? window.ImageTracer : undefined)
);`,
  ) as () => ImageTracerApi | undefined;
  const instance = factory();
  if (!instance || typeof instance.imagedataToSVG !== "function") {
    throw new Error("ImageTracer runtime is not available.");
  }

  runtime[RUNTIME_KEY] = instance;
  return instance;
}

const imagetracerRuntime = createRuntime();

export default imagetracerRuntime;
