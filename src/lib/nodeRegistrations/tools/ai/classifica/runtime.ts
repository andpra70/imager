import type { GraphImage } from "../../../../../models/graphImage";
import {
  MOBILENET_V4_MODEL_ID,
  type ClassificationOptions,
  type ClassificationLoadProgress,
  type ClassificationPrediction,
  type GraphClassificationData,
  type ResolvedClassificationBackend,
} from "./model";

interface PipelinePrediction {
  label?: unknown;
  score?: unknown;
}

type ImageClassifier = (
  image: HTMLCanvasElement,
  options?: { topk?: number },
) => Promise<PipelinePrediction | PipelinePrediction[]>;

const classifierPromises = new Map<ResolvedClassificationBackend, Promise<ImageClassifier>>();

interface TransformersProgress {
  status?: unknown;
  file?: unknown;
  progress?: unknown;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function hasWebGpu() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function normalizeProgress(value: TransformersProgress): ClassificationLoadProgress {
  const numericProgress = Number(value.progress);
  return {
    status: typeof value.status === "string" ? value.status : "loading",
    file: typeof value.file === "string" ? value.file : null,
    percent: Number.isFinite(numericProgress) ? numericProgress : null,
  };
}

async function loadClassifier(
  backend: ResolvedClassificationBackend,
  onProgress?: (progress: ClassificationLoadProgress) => void,
) {
  const started = performance.now();
  let classifierPromise = classifierPromises.get(backend);
  if (!classifierPromise) {
    classifierPromise = import("@huggingface/transformers")
      .then(({ pipeline }) => pipeline("image-classification", MOBILENET_V4_MODEL_ID, {
        device: backend,
        dtype: backend === "webgpu" ? "fp32" : "q8",
        progress_callback: (progress: TransformersProgress) => onProgress?.(normalizeProgress(progress)),
      }))
      .then((loaded) => loaded as unknown as ImageClassifier);
    classifierPromises.set(backend, classifierPromise);
    classifierPromise.catch(() => classifierPromises.delete(backend));
  }
  let classifier: ImageClassifier;
  try {
    classifier = await withTimeout(
      classifierPromise,
      backend === "webgpu" ? 45_000 : 90_000,
      `Timeout caricamento MobileNetV4 (${backend}). Controllare l'accesso a huggingface.co e jsdelivr.net.`,
    );
  } catch (error) {
    classifierPromises.delete(backend);
    throw error;
  }
  return { classifier, loadMs: performance.now() - started };
}

function normalizePredictions(value: PipelinePrediction | PipelinePrediction[]) {
  const rows = Array.isArray(value) ? value : [value];
  return rows
    .map((row): ClassificationPrediction | null => {
      const score = Number(row.score);
      if (typeof row.label !== "string" || !Number.isFinite(score)) return null;
      return { label: row.label, score };
    })
    .filter((row): row is ClassificationPrediction => row !== null);
}

async function infer(
  image: GraphImage,
  backend: ResolvedClassificationBackend,
  topK: number,
  onProgress?: (progress: ClassificationLoadProgress) => void,
) {
  const { classifier, loadMs } = await loadClassifier(backend, onProgress);
  const inferenceStarted = performance.now();
  const raw = await classifier(image, { topk: topK });
  return {
    predictions: normalizePredictions(raw),
    loadMs,
    inferenceMs: performance.now() - inferenceStarted,
  };
}

export async function classifyImage(
  image: GraphImage,
  options: ClassificationOptions,
  onProgress?: (progress: ClassificationLoadProgress) => void,
): Promise<GraphClassificationData> {
  const totalStarted = performance.now();
  const preferred: ResolvedClassificationBackend =
    options.backend === "auto" ? (hasWebGpu() ? "webgpu" : "wasm") : options.backend;
  let used = preferred;
  let fallbackReason: string | null = null;
  let result;

  try {
    result = await infer(image, preferred, options.topK, onProgress);
  } catch (error) {
    if (preferred === "wasm") throw error;
    fallbackReason = errorMessage(error);
    used = "wasm";
    onProgress?.({ status: "fallback-cpu", file: null, percent: null });
    result = await infer(image, "wasm", options.topK, onProgress);
  }

  return {
    task: "image-classification",
    model: { family: "MobileNetV4", id: MOBILENET_V4_MODEL_ID },
    backend: { requested: options.backend, used, fallbackReason },
    image: { width: image.width, height: image.height },
    predictions: result.predictions,
    timing: {
      modelLoadMs: result.loadMs,
      inferenceMs: result.inferenceMs,
      totalMs: performance.now() - totalStarted,
    },
    generatedAtIso: new Date().toISOString(),
  };
}

export function clearClassificationModelCache() {
  classifierPromises.clear();
}
