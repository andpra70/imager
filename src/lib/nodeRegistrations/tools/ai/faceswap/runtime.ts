import {
  createFaceSwap,
  KNOWN_SHA256,
  type FaceSwap,
} from "browser-inswapper";
import type { GraphImage } from "../../../../../models/graphImage";
import type { GraphVideo } from "../../../../../models/graphVideo";
import type {
  FaceSwapOptions,
  FaceSwapDiagnostics,
  GraphFaceSwapData,
} from "./model";

const HUGGING_FACE = "https://huggingface.co/";
const MODELS = {
  swapperFp16: {
    url: `${HUGGING_FACE}facefusion/models-3.0.0/resolve/main/inswapper_128_fp16.onnx`,
    sha256: KNOWN_SHA256.swapperFp16,
  },
  swapperFp32: {
    url: `${HUGGING_FACE}facefusion/models-3.0.0/resolve/main/inswapper_128.onnx`,
    sha256: KNOWN_SHA256.swapperFp32,
  },
  arcface: {
    url: `${HUGGING_FACE}public-data/insightface/resolve/main/models/buffalo_l/w600k_r50.onnx`,
    sha256: KNOWN_SHA256.arcface,
  },
};

function bitmapToGraphImage(bitmap: ImageBitmap): GraphImage {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Contesto canvas 2D non disponibile.");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export class FaceSwapSession {
  private engine: FaceSwap | null = null;
  private optionsSignature = "";
  private outputTrack: MediaStreamTrack | null = null;
  private generation = 0;

  async prepare(
    options: FaceSwapOptions,
    diagnostics: FaceSwapDiagnostics = {},
  ) {
    const { onProgress, onStage } = diagnostics;
    const signature = JSON.stringify({ backend: options.backend, occlusion: options.occlusion });
    if (this.engine && signature === this.optionsSignature) return this.engine;
    this.dispose();
    const generation = this.generation;
    this.optionsSignature = signature;
    const logs: string[] = [];
    const create = (backend: FaceSwapOptions["backend"]) => {
      onStage?.(`creazione engine · backend ${backend}`);
      return createFaceSwap({
        models: MODELS,
        backend,
        occlusion: options.occlusion,
        onLog: (message) => {
          logs.push(message);
          onStage?.(`engine · ${message}`);
        },
        onProgress: ({ model, loaded, total }) => onProgress?.({
          model,
          loaded,
          total,
          ratio: total > 0 ? loaded / total : 0,
        }),
      });
    };
    let engine: FaceSwap;
    try {
      engine = await create(options.backend);
      onStage?.(`engine pronto · ${engine.backend}`);
    } catch (error) {
      const canRetryWasm = options.backend !== "wasm"
        && error instanceof Error
        && error.message.includes("No way to run the face model");
      if (!canRetryWasm) {
        const detail = logs.join(" | ");
        throw new Error(detail ? `${error instanceof Error ? error.message : error} (${detail})` : String(error));
      }
      onProgress?.({
        model: `fallback ${options.backend} → WASM FP32`,
        loaded: 0,
        total: 1,
        ratio: 0,
      });
      const acceleratorDetail = logs.join(" | ");
      logs.length = 0;
      try {
        engine = await create("wasm");
        onStage?.("engine pronto · wasm FP32");
      } catch (fallbackError) {
        const detail = [acceleratorDetail, logs.join(" | ")].filter(Boolean).join(" | ");
        throw new Error(
          `FaceSwap non disponibile anche con WASM FP32: ${detail ?? (fallbackError instanceof Error ? fallbackError.message : fallbackError)}`,
        );
      }
    }
    if (generation !== this.generation) {
      engine.dispose();
      throw new DOMException("FaceSwap annullato.", "AbortError");
    }
    this.engine = engine;
    return engine;
  }

  async swapImage(
    target: GraphImage,
    face: GraphImage,
    options: FaceSwapOptions,
    diagnostics: FaceSwapDiagnostics = {},
  ): Promise<{ image: GraphImage; data: GraphFaceSwapData }> {
    const startedAt = performance.now();
    this.outputTrack?.stop();
    this.outputTrack = null;
    const engine = await this.prepare(options, diagnostics);
    diagnostics.onStage?.("preparazione identità IN2 e ricerca volti IN1");
    const [identity, faces] = await Promise.all([
      engine.identityOf({ image: face }),
      engine.findFaces(target),
    ]);
    if (!faces.length) throw new Error("Nessun volto trovato in IN1.");
    diagnostics.onStage?.(`${faces.length} volti trovati · inferenza faceswap`);
    engine.setStrength(options.strength);
    const bitmap = await engine.swapPhoto(target, faces.map((found) => ({ face: found, identity })));
    const image = bitmapToGraphImage(bitmap);
    diagnostics.onStage?.("compositing immagine completato");
    return {
      image,
      data: {
        task: "face-swap",
        mode: "image",
        engine: { library: "browser-inswapper", backend: engine.backend, model: "inswapper_128" },
        options: { ...options },
        input: { width: target.width, height: target.height },
        output: { width: image.width, height: image.height },
        facesReplaced: faces.length,
        timing: { totalMs: performance.now() - startedAt },
        generatedAtIso: new Date().toISOString(),
      },
    };
  }

  async swapVideo(
    input: GraphVideo,
    face: GraphImage,
    options: FaceSwapOptions,
    diagnostics: FaceSwapDiagnostics = {},
  ): Promise<{ video: GraphVideo; data: GraphFaceSwapData }> {
    const startedAt = performance.now();
    const engine = await this.prepare(options, diagnostics);
    diagnostics.onStage?.("estrazione identità da IN2");
    await engine.setIdentity({ image: face });
    diagnostics.onStage?.("identità pronta · avvio stream VIN1");
    engine.setStrength(options.strength);
    this.outputTrack?.stop();
    const outputTrack = engine.process(input.track, { maxFps: options.maxFps });
    this.outputTrack = outputTrack;
    const settings = outputTrack.getSettings();
    const size = settings.width && settings.height
      ? { width: settings.width, height: settings.height }
      : input.size ?? { width: 0, height: 0 };
    const video: GraphVideo = {
      kind: "graph-video",
      track: outputTrack,
      stream: new MediaStream([outputTrack]),
      size,
      source: "faceswap",
      generatedAtIso: new Date().toISOString(),
    };
    return {
      video,
      data: {
        task: "face-swap",
        mode: "video",
        engine: { library: "browser-inswapper", backend: engine.backend, model: "inswapper_128" },
        options: { ...options },
        input: input.size ?? size,
        output: size,
        facesReplaced: null,
        timing: { totalMs: performance.now() - startedAt },
        generatedAtIso: new Date().toISOString(),
      },
    };
  }

  dispose() {
    this.generation += 1;
    this.outputTrack?.stop();
    this.outputTrack = null;
    this.engine?.dispose();
    this.engine = null;
    this.optionsSignature = "";
  }
}
