import type { GraphImage } from "../../../../../models/graphImage";
import type {
  GraphUpscalerData,
  UpscalerOptions,
  UpscalerProgress,
  UpscalerScale,
} from "./model";

type BrowserUpscaler = InstanceType<(typeof import("upscaler"))["default"]>;
type UpscalerConstructorOptions = NonNullable<
  ConstructorParameters<(typeof import("upscaler"))["default"]>[0]
>;
type UpscalerModel = NonNullable<UpscalerConstructorOptions["model"]>;

const upscalers = new Map<UpscalerScale, Promise<BrowserUpscaler>>();
let tensorflowBackendPromise: Promise<"webgl" | "cpu"> | null = null;

function initializeTensorFlowBackend() {
  if (!tensorflowBackendPromise) {
    tensorflowBackendPromise = import("@tensorflow/tfjs").then(async (tf) => {
      for (const backend of ["webgl", "cpu"] as const) {
        try {
          if (await tf.setBackend(backend)) {
            await tf.ready();
            return backend;
          }
        } catch {
          // Prova il backend successivo quando WebGL non è disponibile.
        }
      }
      throw new Error("Nessun backend TensorFlow.js disponibile (WebGL/CPU). ");
    });
  }
  return tensorflowBackendPromise;
}

async function loadModel(scale: UpscalerScale): Promise<UpscalerModel> {
  const definition = scale === 3
    ? (await import("@upscalerjs/esrgan-slim/3x")).default
    : scale === 4
      ? (await import("@upscalerjs/esrgan-slim/4x")).default
      : (await import("@upscalerjs/esrgan-slim/2x")).default;
  const baseUrl = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return {
    ...definition,
    path: `${baseUrl}models/upscaler/x${scale}/model.json`,
  };
}

function getUpscaler(scale: UpscalerScale) {
  const cached = upscalers.get(scale);
  if (cached) return cached;
  const pending = Promise.all([
    initializeTensorFlowBackend(),
    import("upscaler"),
    loadModel(scale),
  ]).then(
    ([, { default: Upscaler }, model]) => new Upscaler({ model }),
  );
  upscalers.set(scale, pending);
  return pending;
}

function dataUrlToGraphImage(source: string): Promise<GraphImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Contesto canvas 2D non disponibile."));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error("UpscalerJS ha restituito un'immagine non valida."));
    image.src = source;
  });
}

export async function upscaleGraphImage(
  input: GraphImage,
  options: UpscalerOptions,
  signal: AbortSignal,
  onProgress?: (progress: UpscalerProgress) => void,
): Promise<{ image: GraphImage; data: GraphUpscalerData }> {
  const startedAt = performance.now();
  const upscaler = await getUpscaler(options.scale);
  await upscaler.ready;
  if (signal.aborted) throw new DOMException("Upscaling annullato.", "AbortError");

  const source = await upscaler.upscale(input, {
    output: "base64",
    patchSize: options.patchSize,
    padding: options.padding,
    awaitNextFrame: options.awaitNextFrame,
    signal,
    progress: (ratio, _slice, sliceData) => {
      onProgress?.({
        ratio,
        row: sliceData?.row ?? null,
        column: sliceData?.col ?? null,
      });
    },
  });
  const image = await dataUrlToGraphImage(source);
  const totalMs = performance.now() - startedAt;
  return {
    image,
    data: {
      task: "image-upscaling",
      engine: { library: "UpscalerJS", modelFamily: "ESRGAN Slim", scale: options.scale },
      options: { ...options },
      input: { width: input.width, height: input.height },
      output: { width: image.width, height: image.height },
      timing: { totalMs },
      generatedAtIso: new Date().toISOString(),
    },
  };
}

export async function clearUpscalerModelCache() {
  const instances = await Promise.all([...upscalers.values()]);
  upscalers.clear();
  await Promise.all(instances.map((upscaler) => upscaler.dispose()));
}
