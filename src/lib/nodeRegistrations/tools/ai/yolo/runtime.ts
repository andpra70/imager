import type { GraphImage } from "../../../../../models/graphImage";
import yoloWasmUrl from "@ultralytics/yolo/pkg/ultralytics_inference_web_bg.wasm?url";
import type {
  GraphYoloData,
  YoloBackendPreference,
  YoloOptions,
  YoloRuntimeBackend,
} from "./model";

type YoloModel = Awaited<ReturnType<(typeof import("@ultralytics/yolo"))["YOLO"]["load"]>>;

const models = new Map<YoloBackendPreference, Promise<YoloModel>>();

function assetUrl(relativePath: string) {
  const baseUrl = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${baseUrl}${relativePath}`;
}

function getModel(backend: YoloBackendPreference) {
  const cached = models.get(backend);
  if (cached) return cached;
  const pending = import("@ultralytics/yolo")
    .then(({ YOLO }) => YOLO.load(assetUrl("models/yolo/yolo26n-ultralytics-v8.4.0.onnx"), {
      device: backend,
      // L'auto-risoluzione interna del pacchetto può puntare alla pagina HTML
      // fallback del dev server. Vite trasforma invece questo import nell'URL
      // reale del binario (con hash in produzione).
      wasmUrl: yoloWasmUrl,
    }))
    .catch((error) => {
      models.delete(backend);
      throw error;
    });
  models.set(backend, pending);
  return pending;
}

export async function detectObjects(
  input: GraphImage,
  options: YoloOptions,
): Promise<{ image: GraphImage; data: GraphYoloData }> {
  const startedAt = performance.now();
  const [{ annotate }, model] = await Promise.all([
    import("@ultralytics/yolo"),
    getModel(options.backend),
  ]);
  const results = await model.predict(input, {
    conf: options.confidence,
    iou: options.iou,
  });
  const output = document.createElement("canvas");
  await annotate(output, input, results, {
    labels: options.showLabels,
    lineWidth: options.lineWidth,
  });

  const data: GraphYoloData = {
    task: "object-detection",
    engine: {
      library: "Ultralytics YOLO Browser",
      family: "YOLO26",
      model: "YOLO26n",
      backend: model.device === "webgpu" ? "webgpu" : "cpu" as YoloRuntimeBackend,
    },
    image: { width: results.width, height: results.height },
    detections: results.boxes.map((box) => ({
      classId: box.cls,
      label: box.name,
      confidence: box.conf,
      color: box.color,
      box: {
        x1: box.x1,
        y1: box.y1,
        x2: box.x2,
        y2: box.y2,
        x: box.x1,
        y: box.y1,
        width: box.x2 - box.x1,
        height: box.y2 - box.y1,
      },
    })),
    timing: {
      preprocessMs: results.speed.preprocess,
      inferenceMs: results.speed.inference,
      postprocessMs: results.speed.postprocess,
      totalMs: performance.now() - startedAt,
    },
    options: { ...options },
    generatedAtIso: new Date().toISOString(),
  };
  return { image: output, data };
}

export async function clearYoloModelCache() {
  const loaded = await Promise.allSettled(models.values());
  models.clear();
  for (const result of loaded) {
    if (result.status === "fulfilled") result.value.free();
  }
}
