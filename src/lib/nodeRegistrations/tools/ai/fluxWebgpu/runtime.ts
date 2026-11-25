import {
  createKleinApp,
  KLEIN_HOSTED_WEIGHTS,
  type KleinApp,
} from "@kaminos/flux2-klein";
import type { GraphImage } from "../../../../../models/graphImage";
import type {
  FluxWebGpuOptions,
  FluxWebGpuProgress,
  GraphFluxWebGpuData,
} from "./model";

interface FluxRuntimeEntry {
  signature: string;
  app: KleinApp;
  loaded: boolean;
}

let activeRuntime: FluxRuntimeEntry | null = null;

function rgbaToGraphImage(rgba: Uint8ClampedArray, width: number, height: number): GraphImage {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Contesto canvas 2D non disponibile.");
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

function assertWebGpu() {
  if (!navigator.gpu) throw new Error("WebGPU non è disponibile in questo browser.");
}

async function getRuntime(
  options: FluxWebGpuOptions,
  onProgress?: (progress: FluxWebGpuProgress) => void,
) {
  assertWebGpu();
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("WebGPU è presente ma non è disponibile alcun adapter GPU.");
  if (!adapter.features.has("shader-f16")) {
    throw new Error(
      "FLUX WebGPU richiede shader-f16. Su Linux/NVIDIA aggiorna il driver e avvia Chrome con " +
      "--enable-dawn-features=vulkan_enable_f16_on_nvidia; poi verifica adapter.features.",
    );
  }

  const signature = JSON.stringify({ level: options.level, residency: options.residency });
  if (activeRuntime?.signature !== signature) {
    if (activeRuntime) await activeRuntime.app.destroy();
    onProgress?.({ phase: "checking", label: "creazione runtime WebGPU", ratio: 0 });
    const app = await createKleinApp({
      load: false,
      pipelineOptions: { level: options.level, residency: options.residency },
    });
    activeRuntime = { signature, app, loaded: false };
  }

  if (!activeRuntime.loaded) {
    await activeRuntime.app.load((part, file, progress) => {
      onProgress?.({
        phase: "loading",
        label: `${part} · ${file}`,
        ratio: progress.totalBytes > 0 ? progress.loadedBytes / progress.totalBytes : 0,
        loadedBytes: progress.loadedBytes,
        totalBytes: progress.totalBytes,
      });
    });
    activeRuntime.loaded = true;
  }
  return activeRuntime.app;
}

export async function generateFluxWebGpu(
  options: FluxWebGpuOptions,
  signal: AbortSignal,
  onProgress?: (progress: FluxWebGpuProgress) => void,
): Promise<{ image: GraphImage; data: GraphFluxWebGpuData }> {
  const startedAt = performance.now();
  const app = await getRuntime(options, onProgress);
  if (signal.aborted) throw new DOMException("Generazione annullata.", "AbortError");
  const abort = () => app.stop("Generazione annullata dall'utente");
  signal.addEventListener("abort", abort, { once: true });
  try {
    const result = await app.generate({
      prompt: options.prompt,
      width: options.width,
      height: options.height,
      steps: options.steps,
      seed: options.seed,
      signal,
      onPhase: (phase) => onProgress?.({
        phase: phase === "weights" ? "loading" : phase,
        label: phase === "weights" ? "trasferimento pesi GPU" : phase,
        ratio: 0,
      }),
      onStep: (step, steps) => onProgress?.({
        phase: "denoise",
        label: `denoise ${step}/${steps}`,
        ratio: step / steps,
        step,
        steps,
      }),
    });
    const image = rgbaToGraphImage(result.rgba, result.width, result.height);
    const totalMs = performance.now() - startedAt;
    onProgress?.({ phase: "complete", label: "completata", ratio: 1 });
    return {
      image,
      data: {
        task: "text-to-image",
        engine: {
          runtime: "@kaminos/flux2-klein",
          architecture: "FLUX.2 Klein 4B + Qwen3-4B",
          backend: "WebGPU",
          weightsRepository: KLEIN_HOSTED_WEIGHTS,
          requestedReference: "gandamu/flux2-klein-4b-qwen3-4b-webgpu",
        },
        options: { ...options },
        output: { width: result.width, height: result.height },
        timing: { totalMs, stages: result.timings as Record<string, number | number[]> },
        generatedAtIso: new Date().toISOString(),
      },
    };
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export async function unloadFluxWebGpu() {
  const runtime = activeRuntime;
  activeRuntime = null;
  await runtime?.app.destroy();
}
