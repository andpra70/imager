import "../../../../vendor/ml5.js";

import type { GraphFaceBlendshapeCategory, GraphFaceLandmarksData } from "../../../../models/graphFaceLandmarks";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphMl5Data, Ml5Task } from "../../../../models/graphMl5";
import type { GraphPoseBox, GraphPoseData } from "../../../../models/graphPose";
import { drawImagePreview, drawSourceToCanvas, resizeNodeForPreview } from "../../../imageUtils";
import type { LiteNode, PreviewAwareNode } from "../../shared";

interface PoseKeypointLike {
  name?: string;
  x: number;
  y: number;
  score?: number;
}

interface PoseLike {
  keypoints?: PoseKeypointLike[];
}

interface PoseDetectionDetectorLike {
  estimatePoses: (input: CanvasImageSource, options?: Record<string, unknown>) => Promise<PoseLike[]>;
}

interface PoseDetectionRuntimeLike {
  SupportedModels: {
    MoveNet: unknown;
  };
  createDetector: (model: unknown, config?: Record<string, unknown>) => Promise<PoseDetectionDetectorLike>;
}

interface TfJsRuntimeLike {
  ready?: () => Promise<void>;
  setBackend?: (backend: string) => Promise<boolean>;
  getBackend?: () => string;
}

interface MediaPipeVisionApi {
  FilesetResolver: {
    forVisionTasks: (wasmRoot: string) => Promise<unknown>;
  };
  FaceLandmarker: MediaPipeFaceLandmarkerCtorLike;
  ImageSegmenter: {
    createFromOptions: (
      vision: unknown,
      options: Record<string, unknown>,
    ) => Promise<MediaPipeImageSegmenterLike>;
  };
}

interface MediaPipeFaceLandmarkerCtorLike {
  createFromOptions: (
    vision: unknown,
    options: Record<string, unknown>,
  ) => Promise<MediaPipeFaceLandmarkerLike>;
  FACE_LANDMARKS_TESSELATION?: unknown[];
  FACE_LANDMARKS_RIGHT_EYE?: unknown[];
  FACE_LANDMARKS_RIGHT_EYEBROW?: unknown[];
  FACE_LANDMARKS_LEFT_EYE?: unknown[];
  FACE_LANDMARKS_LEFT_EYEBROW?: unknown[];
  FACE_LANDMARKS_FACE_OVAL?: unknown[];
  FACE_LANDMARKS_LIPS?: unknown[];
  FACE_LANDMARKS_RIGHT_IRIS?: unknown[];
  FACE_LANDMARKS_LEFT_IRIS?: unknown[];
}

interface MediaPipeFaceLandmarkerLike {
  detect: (input: CanvasImageSource) => unknown;
  close?: () => void;
}

interface MediaPipeFaceLandmarkerResult {
  faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
  faceBlendshapes?: Array<{
    categories?: Array<{
      categoryName?: string;
      displayName?: string;
      score?: number;
    }>;
  }>;
}

interface FaceLandmarkerConnections {
  tessellation: unknown[];
  rightEye: unknown[];
  rightEyebrow: unknown[];
  leftEye: unknown[];
  leftEyebrow: unknown[];
  faceOval: unknown[];
  lips: unknown[];
  rightIris: unknown[];
  leftIris: unknown[];
}

interface FaceLandmarkerModelLike {
  detect: (input: GraphImage) => MediaPipeFaceLandmarkerResult;
  connections: FaceLandmarkerConnections;
}

interface Ml5ModelLike {
  detect?: (input: CanvasImageSource, callback?: (result: unknown) => void) => unknown;
  predict?: (input: CanvasImageSource, callback?: (result: unknown) => void) => unknown;
  classify?: (input: CanvasImageSource, callback?: (result: unknown) => void) => unknown;
}

interface Ml5BodyPixModelLike {
  segment: (input: CanvasImageSource, callback?: (result: unknown) => void) => unknown;
  model?: {
    segmentPeople?: (input: CanvasImageSource, options?: Record<string, unknown>) => Promise<unknown>;
  };
}

interface BgSegmentationModelLike {
  segment: (input: GraphImage) => Promise<ImageData>;
}

interface MediaPipeMaskLike {
  width?: number;
  height?: number;
  getAsUint8Array?: () => Uint8Array;
  getAsFloat32Array?: () => Float32Array;
  close?: () => void;
}

interface MediaPipeImageSegmenterLike {
  segment: (input: CanvasImageSource) => {
    categoryMask?: MediaPipeMaskLike;
    confidenceMasks?: MediaPipeMaskLike[];
  };
}

interface Ml5Runtime {
  bodypose?: (options?: Record<string, unknown>, callback?: (model?: unknown) => void) => unknown;
  handpose?: (options?: Record<string, unknown>, callback?: (model?: unknown) => void) => unknown;
  facemesh?: (options?: Record<string, unknown>, callback?: (model?: unknown) => void) => unknown;
  imageClassifier?: (
    model: string,
    callback?: (model?: unknown) => void,
  ) => unknown;
  bodyPix?: (
    video?: unknown,
    options?: Record<string, unknown>,
    callback?: (model?: unknown) => void,
  ) => unknown;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMl5Runtime() {
  const runtime = globalThis as { ml5?: Ml5Runtime };
  if (!runtime.ml5) {
    throw new Error("ml5 runtime is not available.");
  }
  return runtime.ml5;
}

function refreshNode(node: PreviewAwareNode, image: CanvasImageSource | null, footerLines = 0) {
  resizeNodeForPreview(node, image, { footerLines });
  node.setDirtyCanvas(true, true);
}

function createToolTitle(name: string) {
  return `TOOLS / ${name}`;
}

function notifyGraphStateChange(node: LiteNode) {
  node.graph?.onGraphStateChange?.();
}

function getGraphImageSignature(image: GraphImage | null) {
  if (!image) {
    return "none";
  }

  const context = image.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return `${image.width}x${image.height}:nocontent`;
  }

  const samplePoints = [
    [0, 0],
    [Math.floor(image.width / 2), Math.floor(image.height / 2)],
    [Math.max(0, image.width - 1), Math.max(0, image.height - 1)],
    [Math.floor(image.width / 3), Math.floor(image.height * 0.7)],
  ];

  const values = samplePoints
    .map(([x, y]) => {
      const pixel = context.getImageData(x, y, 1, 1).data;
      return `${pixel[0]}-${pixel[1]}-${pixel[2]}-${pixel[3]}`;
    })
    .join("|");

  return `${image.width}x${image.height}:${values}`;
}

function isGraphImageReady(value: unknown): value is GraphImage {
  if (!(value instanceof HTMLCanvasElement)) {
    return false;
  }
  if (value.width <= 0 || value.height <= 0) {
    return false;
  }
  const context = value.getContext("2d");
  return Boolean(context);
}

function formatExecutionInfo(executionMs: number | null) {
  if (executionMs === null || !Number.isFinite(executionMs)) {
    return "[-- ms]";
  }
  return `[${executionMs.toFixed(2)} ms]`;
}

const MEDIAPIPE_TASKS_VISION_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12";
const MEDIAPIPE_TASKS_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm";
const MEDIAPIPE_FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MEDIAPIPE_SELFIE_SEGMENTER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
const TFJS_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js";
const POSE_DETECTION_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@latest/dist/pose-detection.min.js";

let mediaPipeVisionPromise: Promise<MediaPipeVisionApi> | null = null;
let tfPoseRuntimePromise: Promise<PoseDetectionRuntimeLike> | null = null;

function importExternalModule(moduleUrl: string) {
  return import(/* @vite-ignore */ moduleUrl);
}

function loadMediaPipeVisionApi() {
  if (!mediaPipeVisionPromise) {
    mediaPipeVisionPromise = importExternalModule(MEDIAPIPE_TASKS_VISION_URL).then(
      (module) => module as unknown as MediaPipeVisionApi,
    );
  }
  return mediaPipeVisionPromise;
}

function loadScriptOnce(url: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-src='${url}']`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${url}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.src = url;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`Failed to load script: ${url}`)),
      { once: true },
    );
    document.head.appendChild(script);
  });
}

function loadTfPoseRuntime() {
  if (!tfPoseRuntimePromise) {
    tfPoseRuntimePromise = (async () => {
      await loadScriptOnce(TFJS_SCRIPT_URL);
      await loadScriptOnce(POSE_DETECTION_SCRIPT_URL);
      const tfRuntime = (globalThis as { tf?: TfJsRuntimeLike }).tf;
      if (!tfRuntime) {
        throw new Error("TensorFlow.js runtime is not available.");
      }
      if (typeof tfRuntime.setBackend === "function") {
        try {
          await tfRuntime.setBackend("webgl");
        } catch {
          await tfRuntime.setBackend("cpu");
        }
      }
      if (typeof tfRuntime.ready === "function") {
        await tfRuntime.ready();
      }
      const runtime = globalThis as { poseDetection?: PoseDetectionRuntimeLike };
      if (!runtime.poseDetection) {
        throw new Error("pose-detection runtime is not available.");
      }
      return runtime.poseDetection;
    })();
  }
  return tfPoseRuntimePromise;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value) && typeof (value as { then?: unknown }).then === "function";
}

function normalizeMl5Result(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }
  if (result === undefined || result === null) {
    return [];
  }
  return [result];
}

function collectMl5Landmarks(
  value: unknown,
  sink: Array<{ x: number; y: number }>,
  depth = 0,
  limit = 480,
) {
  if (depth > 5 || sink.length >= limit || value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      sink.push({ x: value[0], y: value[1] });
      return;
    }
    value.forEach((entry) => collectMl5Landmarks(entry, sink, depth + 1, limit));
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.x === "number" &&
    typeof record.y === "number" &&
    Number.isFinite(record.x) &&
    Number.isFinite(record.y)
  ) {
    sink.push({ x: record.x, y: record.y });
  }

  Object.values(record).forEach((entry) => collectMl5Landmarks(entry, sink, depth + 1, limit));
}

function summarizeMl5Labels(resultItems: unknown[]) {
  const labels = new Set<string>();
  resultItems.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.label === "string") {
      labels.add(record.label);
    }
    if (typeof record.className === "string") {
      labels.add(record.className);
    }
  });
  return Array.from(labels);
}

function drawMl5Overlay(input: GraphImage, points: Array<{ x: number; y: number }>) {
  const preview = drawSourceToCanvas(input);
  if (!points.length) {
    return preview;
  }

  const context = preview.getContext("2d");
  if (!context) {
    return preview;
  }

  context.save();
  context.globalCompositeOperation = "screen";
  context.strokeStyle = "rgba(0, 255, 234, 0.9)";
  context.fillStyle = "rgba(0, 255, 234, 0.5)";
  context.lineWidth = Math.max(1, Math.min(preview.width, preview.height) / 320);
  const radius = Math.max(1, Math.min(preview.width, preview.height) / 180);
  points.slice(0, 480).forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
  return preview;
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex
      .split("")
      .map((channel) => `${channel}${channel}`)
      .join("");
    return `#${expanded.toUpperCase()}`;
  }
  return "#ACE1AF";
}

function hexToRgb(value: string) {
  const normalized = normalizeHexColor(value).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function removeBackgroundFromMask(
  input: GraphImage,
  personMask: ImageData,
  options: {
    threshold: number;
    softness: number;
    invertMask: boolean;
    mode: "transparent" | "color";
    color: string;
  },
) {
  const sourceContext = input.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context is not available.");
  }

  const width = input.width;
  const height = input.height;
  const sourcePixels = sourceContext.getImageData(0, 0, width, height).data;
  const maskPixels = personMask.data;
  const output = sourceContext.createImageData(width, height);
  const outputPixels = output.data;
  const threshold = clamp(Math.round(options.threshold), 0, 255);
  const softness = clamp(options.softness, 0, 1);
  const denom = Math.max(1, 255 - threshold);
  const bgRgb = hexToRgb(options.color);

  for (let index = 0; index < outputPixels.length; index += 4) {
    const maskAlpha = maskPixels[index + 3] ?? 0;
    let matte = clamp((maskAlpha - threshold) / denom, 0, 1);
    if (softness > 0) {
      const gamma = clamp(1 + softness * 2.5, 1, 4);
      matte = matte ** gamma;
    }
    if (options.invertMask) {
      matte = 1 - matte;
    }

    const srcR = sourcePixels[index];
    const srcG = sourcePixels[index + 1];
    const srcB = sourcePixels[index + 2];
    const srcA = sourcePixels[index + 3] / 255;
    const alpha = matte * srcA;

    if (options.mode === "transparent") {
      outputPixels[index] = srcR;
      outputPixels[index + 1] = srcG;
      outputPixels[index + 2] = srcB;
      outputPixels[index + 3] = Math.round(alpha * 255);
      continue;
    }

    outputPixels[index] = Math.round(srcR * alpha + bgRgb.r * (1 - alpha));
    outputPixels[index + 1] = Math.round(srcG * alpha + bgRgb.g * (1 - alpha));
    outputPixels[index + 2] = Math.round(srcB * alpha + bgRgb.b * (1 - alpha));
    outputPixels[index + 3] = 255;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D context is not available.");
  }
  context.putImageData(output, 0, 0);
  return canvas;
}

function getPersonMaskFromBodyPixResult(value: unknown): ImageData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result = value as {
    raw?: {
      personMask?: ImageData | null;
    };
  };
  const mask = result.raw?.personMask;
  return mask instanceof ImageData ? mask : null;
}

function createEmptyPersonMask(width: number, height: number) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  return new ImageData(new Uint8ClampedArray(safeWidth * safeHeight * 4), safeWidth, safeHeight);
}

async function extractPersonMaskViaSegmentPeople(model: Ml5BodyPixModelLike, input: GraphImage) {
  const segmentPeople = model.model?.segmentPeople;
  if (typeof segmentPeople !== "function") {
    return null;
  }

  const result = await segmentPeople(input, {
    multiSegmentation: false,
    segmentBodyParts: false,
    flipHorizontal: false,
  });

  if (!Array.isArray(result) || !result.length) {
    return createEmptyPersonMask(input.width, input.height);
  }

  const first = result[0] as {
    mask?: {
      toImageData?: () => Promise<ImageData> | ImageData;
    };
  };
  const toImageData = first?.mask?.toImageData;
  if (typeof toImageData !== "function") {
    return createEmptyPersonMask(input.width, input.height);
  }

  const mask = await toImageData.call(first.mask);
  if (!(mask instanceof ImageData)) {
    return createEmptyPersonMask(input.width, input.height);
  }
  return mask;
}

async function loadMl5BodyPixModel(): Promise<Ml5BodyPixModelLike> {
  const ml5 = getMl5Runtime();
  if (typeof ml5.bodyPix !== "function") {
    throw new Error("ml5 bodyPix is not available in this bundle.");
  }

  const model = await new Promise<unknown>((resolve, reject) => {
    let settled = false;
    let instance: unknown;
    const complete = (value?: unknown) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      instance = ml5.bodyPix?.(
        undefined,
        {
          architecture: "ResNet50",
          outputStride: 16,
          quantBytes: 2,
        },
        (readyModel) => {
          complete(readyModel ?? instance);
        },
      );
      if (isPromiseLike(instance)) {
        void instance.then(complete).catch((error) => reject(error));
        return;
      }
      if (instance && typeof instance === "object") {
        const maybeReady = (instance as { ready?: unknown }).ready;
        if (isPromiseLike(maybeReady)) {
          void maybeReady.then(() => complete(instance)).catch((error) => reject(error));
        } else {
          complete(instance);
        }
      }
    } catch (error) {
      reject(error);
    }
  });

  if (!model || typeof model !== "object" || typeof (model as Ml5BodyPixModelLike).segment !== "function") {
    throw new Error("Invalid ml5 bodyPix model instance.");
  }
  return model as Ml5BodyPixModelLike;
}

async function runBodyPixSegmentation(model: Ml5BodyPixModelLike, input: GraphImage) {
  try {
    const lowLevelMask = await extractPersonMaskViaSegmentPeople(model, input);
    if (lowLevelMask) {
      return lowLevelMask;
    }
  } catch {
    // fall through to legacy wrapper path
  }

  const result = await new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const complete = (value?: unknown) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const maybe = model.segment(input, (value) => {
        complete(value);
      });
      if (isPromiseLike(maybe)) {
        void maybe.then(complete).catch((error) => reject(error));
        return;
      }
      if (maybe !== undefined) {
        complete(maybe);
      }
    } catch (error) {
      reject(error);
    }
  });

  const personMask = getPersonMaskFromBodyPixResult(result);
  if (!personMask) {
    return createEmptyPersonMask(input.width, input.height);
  }
  return personMask;
}

async function loadMediaPipeFaceModel(): Promise<Ml5ModelLike> {
  const visionApi = await loadMediaPipeVisionApi();
  const vision = await visionApi.FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_WASM_ROOT);
  const faceLandmarker = await visionApi.FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });

  return {
    detect: (input: CanvasImageSource) => {
      const width = "width" in input && typeof input.width === "number" ? input.width : 1;
      const height = "height" in input && typeof input.height === "number" ? input.height : 1;
      const result = faceLandmarker.detect(input) as {
        faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
      };
      const landmarks = result.faceLandmarks ?? [];
      return landmarks.map((face) =>
        face.map((point) => ({
          x: point.x * width,
          y: point.y * height,
          z: point.z,
        })),
      );
    },
  };
}

function createMaskImageDataFromCategoryMask(
  mask: MediaPipeMaskLike | undefined,
  sourceWidth: number,
  sourceHeight: number,
) {
  if (!mask) {
    return createEmptyPersonMask(sourceWidth, sourceHeight);
  }

  const width = Math.max(1, Math.floor(mask.width ?? sourceWidth));
  const height = Math.max(1, Math.floor(mask.height ?? sourceHeight));
  const rgba = new Uint8ClampedArray(width * height * 4);

  const categoryValues = mask.getAsUint8Array?.();
  if (categoryValues && categoryValues.length >= width * height) {
    for (let index = 0; index < width * height; index += 1) {
      // Selfie segmenter category id 0=person, 1=background in this model setup.
      const alpha = categoryValues[index] === 0 ? 255 : 0;
      const pixelOffset = index * 4;
      rgba[pixelOffset] = 255;
      rgba[pixelOffset + 1] = 255;
      rgba[pixelOffset + 2] = 255;
      rgba[pixelOffset + 3] = alpha;
    }
    mask.close?.();
    return new ImageData(rgba, width, height);
  }

  const confidenceValues = mask.getAsFloat32Array?.();
  if (confidenceValues && confidenceValues.length >= width * height) {
    for (let index = 0; index < width * height; index += 1) {
      const alpha = clamp(Math.round(confidenceValues[index] * 255), 0, 255);
      const pixelOffset = index * 4;
      rgba[pixelOffset] = 255;
      rgba[pixelOffset + 1] = 255;
      rgba[pixelOffset + 2] = 255;
      rgba[pixelOffset + 3] = alpha;
    }
    mask.close?.();
    return new ImageData(rgba, width, height);
  }

  mask.close?.();
  return createEmptyPersonMask(sourceWidth, sourceHeight);
}

function resizeMaskToImage(mask: ImageData, width: number, height: number) {
  if (mask.width === width && mask.height === height) {
    return mask;
  }
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = mask.width;
  maskCanvas.height = mask.height;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) {
    return createEmptyPersonMask(width, height);
  }
  maskContext.putImageData(mask, 0, 0);

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = width;
  targetCanvas.height = height;
  const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetContext) {
    return createEmptyPersonMask(width, height);
  }
  targetContext.drawImage(maskCanvas, 0, 0, width, height);
  return targetContext.getImageData(0, 0, width, height);
}

async function loadMediaPipeSelfieSegmenterModel(): Promise<BgSegmentationModelLike> {
  const visionApi = await loadMediaPipeVisionApi();
  const vision = await visionApi.FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_WASM_ROOT);

  const createSegmenter = async (delegate: "GPU" | "CPU") =>
    visionApi.ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE_SELFIE_SEGMENTER_MODEL_URL,
        delegate,
      },
      runningMode: "IMAGE",
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    });

  let segmenter: MediaPipeImageSegmenterLike;
  try {
    segmenter = await createSegmenter("GPU");
  } catch {
    segmenter = await createSegmenter("CPU");
  }

  return {
    segment: async (input: GraphImage) => {
      const result = segmenter.segment(input);
      const preferredConfidenceMask = result.confidenceMasks?.[1] ?? result.confidenceMasks?.[0];
      const baseMask = createMaskImageDataFromCategoryMask(
        result.categoryMask ?? preferredConfidenceMask,
        input.width,
        input.height,
      );
      return resizeMaskToImage(baseMask, input.width, input.height);
    },
  };
}

function parseConnectionIndices(connection: unknown): [number, number] | null {
  if (Array.isArray(connection) && connection.length >= 2) {
    const a = Number(connection[0]);
    const b = Number(connection[1]);
    if (Number.isInteger(a) && Number.isInteger(b)) {
      return [a, b];
    }
  }

  if (connection && typeof connection === "object") {
    const record = connection as { start?: unknown; end?: unknown };
    const a = Number(record.start);
    const b = Number(record.end);
    if (Number.isInteger(a) && Number.isInteger(b)) {
      return [a, b];
    }
  }
  return null;
}

function drawFaceConnections(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  connections: unknown[],
  color: string,
  lineWidth: number,
) {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  connections.forEach((entry) => {
    const parsed = parseConnectionIndices(entry);
    if (!parsed) {
      return;
    }
    const a = points[parsed[0]];
    const b = points[parsed[1]];
    if (!a || !b) {
      return;
    }
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
  });
  context.stroke();
}

function normalizeBlendshapeCategories(result: MediaPipeFaceLandmarkerResult) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  const normalized: GraphFaceBlendshapeCategory[] = categories
    .map((category) => ({
      categoryName: String(category?.categoryName ?? ""),
      displayName: String(category?.displayName ?? category?.categoryName ?? ""),
      score: Number(category?.score ?? 0),
    }))
    .filter((item) => item.categoryName.length > 0)
    .sort((a, b) => b.score - a.score);
  return normalized;
}

function drawFaceLandmarkerOverlay(
  input: GraphImage,
  result: MediaPipeFaceLandmarkerResult,
  options: {
    drawTessellation: boolean;
    drawEyes: boolean;
    drawEyebrows: boolean;
    drawFaceOval: boolean;
    drawLips: boolean;
    drawIris: boolean;
  },
  connections: FaceLandmarkerConnections,
) {
  const preview = drawSourceToCanvas(input);
  const context = preview.getContext("2d");
  if (!context) {
    return preview;
  }

  const faces = result.faceLandmarks ?? [];
  const width = preview.width;
  const height = preview.height;
  context.save();
  faces.forEach((landmarks) => {
    const points = landmarks.map((point) => ({
      x: point.x * width,
      y: point.y * height,
    }));
    if (options.drawTessellation) {
      drawFaceConnections(context, points, connections.tessellation, "#C0C0C070", 1);
    }
    if (options.drawEyes) {
      drawFaceConnections(context, points, connections.rightEye, "#FF3030", 2);
      drawFaceConnections(context, points, connections.leftEye, "#30FF30", 2);
    }
    if (options.drawEyebrows) {
      drawFaceConnections(context, points, connections.rightEyebrow, "#FF3030", 2);
      drawFaceConnections(context, points, connections.leftEyebrow, "#30FF30", 2);
    }
    if (options.drawFaceOval) {
      drawFaceConnections(context, points, connections.faceOval, "#E0E0E0", 2);
    }
    if (options.drawLips) {
      drawFaceConnections(context, points, connections.lips, "#E0E0E0", 2);
    }
    if (options.drawIris) {
      drawFaceConnections(context, points, connections.rightIris, "#FF3030", 2);
      drawFaceConnections(context, points, connections.leftIris, "#30FF30", 2);
    }
  });
  context.restore();
  return preview;
}

async function loadMediaPipeFaceLandmarkerModel(
  options: { numFaces: number; outputBlendshapes: boolean; delegate: "GPU" | "CPU" },
): Promise<FaceLandmarkerModelLike> {
  const visionApi = await loadMediaPipeVisionApi();
  const vision = await visionApi.FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_WASM_ROOT);
  const ctor = visionApi.FaceLandmarker;
  const detector = await ctor.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_MODEL_URL,
      delegate: options.delegate,
    },
    runningMode: "IMAGE",
    outputFaceBlendshapes: options.outputBlendshapes,
    numFaces: clamp(Math.round(options.numFaces), 1, 4),
  });

  return {
    detect: (input: GraphImage) => detector.detect(input) as MediaPipeFaceLandmarkerResult,
    connections: {
      tessellation: ctor.FACE_LANDMARKS_TESSELATION ?? [],
      rightEye: ctor.FACE_LANDMARKS_RIGHT_EYE ?? [],
      rightEyebrow: ctor.FACE_LANDMARKS_RIGHT_EYEBROW ?? [],
      leftEye: ctor.FACE_LANDMARKS_LEFT_EYE ?? [],
      leftEyebrow: ctor.FACE_LANDMARKS_LEFT_EYEBROW ?? [],
      faceOval: ctor.FACE_LANDMARKS_FACE_OVAL ?? [],
      lips: ctor.FACE_LANDMARKS_LIPS ?? [],
      rightIris: ctor.FACE_LANDMARKS_RIGHT_IRIS ?? [],
      leftIris: ctor.FACE_LANDMARKS_LEFT_IRIS ?? [],
    },
  };
}

function getPoseKeypoint(keypoints: PoseKeypointLike[], name: string) {
  return keypoints.find((item) => item.name === name);
}

function getBoundingBoxForPosePoints(points: Array<PoseKeypointLike | undefined>, padding = 10) {
  const validPoints = points.filter(
    (point): point is PoseKeypointLike =>
      point !== undefined &&
      Number(point.score ?? 1) > 0.3 &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y),
  );
  if (!validPoints.length) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  validPoints.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

function buildPoseBoxes(keypoints: PoseKeypointLike[]): GraphPoseBox[] {
  const definitions: Array<{ label: string; points: Array<PoseKeypointLike | undefined>; padding?: number }> = [
    {
      label: "Testa",
      points: [
        getPoseKeypoint(keypoints, "nose"),
        getPoseKeypoint(keypoints, "left_eye"),
        getPoseKeypoint(keypoints, "right_eye"),
        getPoseKeypoint(keypoints, "left_ear"),
        getPoseKeypoint(keypoints, "right_ear"),
      ],
      padding: 15,
    },
    {
      label: "Torso",
      points: [
        getPoseKeypoint(keypoints, "left_shoulder"),
        getPoseKeypoint(keypoints, "right_shoulder"),
        getPoseKeypoint(keypoints, "left_hip"),
        getPoseKeypoint(keypoints, "right_hip"),
      ],
      padding: 15,
    },
    {
      label: "Gamba Sinistra",
      points: [
        getPoseKeypoint(keypoints, "left_hip"),
        getPoseKeypoint(keypoints, "left_knee"),
        getPoseKeypoint(keypoints, "left_ankle"),
      ],
      padding: 15,
    },
    {
      label: "Gamba Destra",
      points: [
        getPoseKeypoint(keypoints, "right_hip"),
        getPoseKeypoint(keypoints, "right_knee"),
        getPoseKeypoint(keypoints, "right_ankle"),
      ],
      padding: 15,
    },
    {
      label: "Mano/Braccio Sinistro",
      points: [getPoseKeypoint(keypoints, "left_elbow"), getPoseKeypoint(keypoints, "left_wrist")],
      padding: 15,
    },
    {
      label: "Mano/Braccio Destro",
      points: [getPoseKeypoint(keypoints, "right_elbow"), getPoseKeypoint(keypoints, "right_wrist")],
      padding: 15,
    },
    {
      label: "Piede Sinistro",
      points: [getPoseKeypoint(keypoints, "left_ankle")],
      padding: 25,
    },
    {
      label: "Piede Destro",
      points: [getPoseKeypoint(keypoints, "right_ankle")],
      padding: 25,
    },
  ];

  const boxes = definitions
    .map((definition) => {
      const box = getBoundingBoxForPosePoints(definition.points, definition.padding ?? 10);
      if (!box) {
        return null;
      }
      return {
        label: definition.label,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    })
    .filter((item): item is GraphPoseBox => Boolean(item));

  const leftShoulder = getPoseKeypoint(keypoints, "left_shoulder");
  const rightShoulder = getPoseKeypoint(keypoints, "right_shoulder");
  const nose = getPoseKeypoint(keypoints, "nose");
  if (
    leftShoulder &&
    rightShoulder &&
    nose &&
    (leftShoulder.score ?? 1) > 0.3 &&
    (rightShoulder.score ?? 1) > 0.3 &&
    (nose.score ?? 1) > 0.3
  ) {
    const shoulderY = (leftShoulder.y + rightShoulder.y) * 0.5;
    const neckTopY = shoulderY - Math.abs(shoulderY - nose.y) * 0.5;
    boxes.push({
      label: "Collo",
      x: Math.min(leftShoulder.x, rightShoulder.x),
      y: neckTopY,
      width: Math.abs(leftShoulder.x - rightShoulder.x),
      height: shoulderY - neckTopY + 10,
    });
  }

  return boxes;
}

function drawPoseBoxesOverlay(input: GraphImage, boxes: GraphPoseBox[]) {
  const preview = drawSourceToCanvas(input);
  const context = preview.getContext("2d");
  if (!context) {
    return preview;
  }
  context.save();
  context.strokeStyle = "#00ff00";
  context.fillStyle = "#00ff00";
  context.lineWidth = 3;
  context.font = "bold 14px sans-serif";
  boxes.forEach((box) => {
    context.strokeRect(box.x, box.y, box.width, box.height);
    const textWidth = context.measureText(box.label).width + 10;
    const textY = Math.max(0, box.y - 18);
    context.fillRect(box.x, textY, textWidth, 18);
    context.fillStyle = "#101010";
    context.fillText(box.label, box.x + 5, textY + 13);
    context.fillStyle = "#00ff00";
  });
  context.restore();
  return preview;
}

async function loadPoseDetectorModel() {
  const poseDetection = await loadTfPoseRuntime();
  return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet);
}

async function loadMl5Model(task: Ml5Task, modelKey: string): Promise<Ml5ModelLike> {
  if (task === "facemesh") {
    return loadMediaPipeFaceModel();
  }

  const ml5 = getMl5Runtime();
  if (task === "imageclassifier") {
    if (typeof ml5.imageClassifier !== "function") {
      throw new Error("ml5 imageClassifier is not available in this bundle.");
    }
    const classifier = await new Promise<unknown>((resolve, reject) => {
      let settled = false;
      let instance: unknown;
      const complete = (value?: unknown) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      try {
        instance = ml5.imageClassifier?.(modelKey, (readyModel) => {
          complete(readyModel ?? instance);
        });
        if (isPromiseLike(instance)) {
          void instance.then(complete).catch((error) => reject(error));
          return;
        }
        if (instance && typeof instance === "object") {
          complete(instance);
        }
      } catch (error) {
        reject(error);
      }
    });
    if (!classifier || typeof classifier !== "object") {
      throw new Error("Invalid ml5 imageClassifier instance.");
    }
    return classifier as Ml5ModelLike;
  }

  const getTaskOptions = (currentTask: Ml5Task): Record<string, unknown> => {
    if (currentTask === "handpose") {
      return {
        maxHands: 2,
        flipHorizontal: false,
      };
    }
    if (currentTask === "bodypose") {
      return {
        modelType: "SINGLEPOSE_LIGHTNING",
        enableSmoothing: true,
      };
    }
    return {};
  };

  const loader = ml5[task];
  if (typeof loader !== "function") {
    throw new Error(`ml5 ${task} is not available.`);
  }

  const model = await new Promise<unknown>((resolve, reject) => {
    let settled = false;
    let instance: unknown;
    const complete = (value?: unknown) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      instance = loader(getTaskOptions(task), (readyModel) => {
        complete(readyModel ?? instance);
      });
      if (isPromiseLike(instance)) {
        void instance.then(complete).catch((error) => reject(error));
        return;
      }
      if (instance && typeof instance === "object") {
        const maybeReady = (instance as { ready?: unknown }).ready;
        if (isPromiseLike(maybeReady)) {
          void maybeReady
            .then(() => complete(instance))
            .catch((error) => reject(error));
        } else {
          complete(instance);
        }
      }
    } catch (error) {
      reject(error);
    }
  });

  if (!model || typeof model !== "object") {
    throw new Error(`Invalid ml5 ${task} model instance.`);
  }

  return model as Ml5ModelLike;
}

async function runMl5Inference(model: Ml5ModelLike, input: GraphImage): Promise<unknown[]> {
  const methods: Array<keyof Ml5ModelLike> = ["detect", "predict", "classify"];
  for (const methodName of methods) {
    const method = model[methodName];
    if (typeof method !== "function") {
      continue;
    }
    const result = await new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const finish = (value?: unknown) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      try {
        const maybe = method.call(model, input, (value) => {
          finish(value);
        });
        if (isPromiseLike(maybe)) {
          void maybe.then(finish).catch((error) => reject(error));
          return;
        }
        if (maybe !== undefined) {
          finish(maybe);
        }
      } catch (error) {
        reject(error);
      }
    });
    return normalizeMl5Result(result);
  }

  throw new Error("No supported inference method found on ml5 model.");
}

export class FaceLandmarkerToolNode {
  size: [number, number] = [280, 540];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  data: GraphFaceLandmarksData | null = null;
  status = "idle";
  executionMs: number | null = null;
  isRendering = false;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  model: FaceLandmarkerModelLike | null = null;
  modelPromise: Promise<FaceLandmarkerModelLike> | null = null;
  modelOptionsSignature = "";

  constructor() {
    const node = this as unknown as PreviewAwareNode & FaceLandmarkerToolNode;
    node.title = createToolTitle("Face Landmarker");
    node.properties = {
      numFaces: 1,
      outputBlendshapes: true,
      delegate: "GPU",
      drawTessellation: true,
      drawEyes: true,
      drawEyebrows: true,
      drawFaceOval: true,
      drawLips: true,
      drawIris: true,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("face", "face");
    node.addWidget("combo", "Delegate", "GPU", (value) => {
      node.properties.delegate = String(value);
      node.invalidateModel();
      notifyGraphStateChange(node);
    }, { values: ["GPU", "CPU"] });
    node.addWidget("slider", "Faces", 1, (value) => {
      node.properties.numFaces = Math.round(Number(value));
      node.invalidateModel();
      notifyGraphStateChange(node);
    }, { min: 1, max: 4, step: 1 });
    node.addWidget("toggle", "Blendshapes", true, (value) => {
      node.properties.outputBlendshapes = Boolean(value);
      node.invalidateModel();
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Mesh", true, (value) => {
      node.properties.drawTessellation = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Eyes", true, (value) => {
      node.properties.drawEyes = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Eyebrows", true, (value) => {
      node.properties.drawEyebrows = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Face oval", true, (value) => {
      node.properties.drawFaceOval = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Lips", true, (value) => {
      node.properties.drawLips = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Iris", true, (value) => {
      node.properties.drawIris = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  invalidateModel(this: FaceLandmarkerToolNode) {
    this.model = null;
    this.modelPromise = null;
    this.modelOptionsSignature = "";
  }

  getModelOptions(this: FaceLandmarkerToolNode) {
    return {
      numFaces: clamp(Math.round(Number(this.properties.numFaces ?? 1)), 1, 4),
      outputBlendshapes: Boolean(this.properties.outputBlendshapes ?? true),
      delegate: String(this.properties.delegate ?? "GPU") === "CPU" ? "CPU" : "GPU",
    } as const;
  }

  getDrawOptions(this: FaceLandmarkerToolNode) {
    return {
      drawTessellation: Boolean(this.properties.drawTessellation ?? true),
      drawEyes: Boolean(this.properties.drawEyes ?? true),
      drawEyebrows: Boolean(this.properties.drawEyebrows ?? true),
      drawFaceOval: Boolean(this.properties.drawFaceOval ?? true),
      drawLips: Boolean(this.properties.drawLips ?? true),
      drawIris: Boolean(this.properties.drawIris ?? true),
    };
  }

  getOrLoadModel(this: FaceLandmarkerToolNode, modelOptions: { numFaces: number; outputBlendshapes: boolean; delegate: "GPU" | "CPU" }) {
    const signature = JSON.stringify(modelOptions);
    if (this.model && this.modelOptionsSignature === signature) {
      return Promise.resolve(this.model);
    }
    if (this.modelPromise && this.modelOptionsSignature === signature) {
      return this.modelPromise;
    }

    this.model = null;
    this.modelOptionsSignature = signature;
    this.modelPromise = loadMediaPipeFaceLandmarkerModel(modelOptions)
      .then((model) => {
        if (this.modelOptionsSignature === signature) {
          this.model = model;
        }
        return model;
      })
      .finally(() => {
        if (this.modelOptionsSignature === signature) {
          this.modelPromise = null;
        }
      });
    return this.modelPromise;
  }

  onExecute(this: PreviewAwareNode & FaceLandmarkerToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.status = "waiting valid image";
      this.isRendering = false;
      this.setOutputData(0, this.preview);
      this.setOutputData(1, this.data);
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const modelOptions = this.getModelOptions();
    const drawOptions = this.getDrawOptions();
    const optionsSignature = JSON.stringify({ modelOptions, drawOptions });

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.status = "detecting face...";
      this.setDirtyCanvas(true, true);

      void this.getOrLoadModel(modelOptions)
        .then((model) => {
          const result = model.detect(input);
          const blendshapes = normalizeBlendshapeCategories(result);
          const faceCount = result.faceLandmarks?.length ?? 0;
          const landmarkCount = result.faceLandmarks?.reduce((total, face) => total + face.length, 0) ?? 0;
          const data: GraphFaceLandmarksData = {
            task: "face-landmarker",
            image: { width: input.width, height: input.height },
            faceCount,
            landmarkCount,
            blendshapes,
            generatedAtIso: new Date().toISOString(),
            raw: result,
          };
          const preview = drawFaceLandmarkerOverlay(input, result, drawOptions, model.connections);
          return { data, preview };
        })
        .then((payload) => {
          if (renderToken !== this.renderToken || !payload) {
            return;
          }
          this.data = payload.data;
          this.preview = payload.preview;
          this.executionMs = performance.now() - start;
          this.status = "ready";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.status = error instanceof Error ? error.message : "face landmark error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.data);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & FaceLandmarkerToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `faces ${this.data?.faceCount ?? 0} | landmarks ${this.data?.landmarkCount ?? 0}`,
      10,
      layout.footerTop + 12,
    );
    const topBlendshape = this.data?.blendshapes?.[0];
    context.fillText(
      `${topBlendshape ? `${topBlendshape.displayName}: ${topBlendshape.score.toFixed(3)}` : this.status}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

export class PoseDetectToolNode {
  size: [number, number] = [280, 400];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  data: GraphPoseData | null = null;
  status = "idle";
  executionMs: number | null = null;
  isRendering = false;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  detector: PoseDetectionDetectorLike | null = null;
  detectorPromise: Promise<PoseDetectionDetectorLike> | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & PoseDetectToolNode;
    node.title = createToolTitle("Pose Detect");
    node.properties = {
      maxPoses: 1,
      flipHorizontal: false,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("pose", "pose");
    node.addWidget("slider", "Max poses", 1, (value) => {
      node.properties.maxPoses = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 5, step: 1 });
    node.addWidget("toggle", "Flip horizontal", false, (value) => {
      node.properties.flipHorizontal = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("button", "Reset model", null, () => {
      node.clearDetectorCache();
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  clearDetectorCache(this: PoseDetectToolNode) {
    this.detector = null;
    this.detectorPromise = null;
  }

  getOrLoadDetector(this: PoseDetectToolNode) {
    if (this.detector) {
      return Promise.resolve(this.detector);
    }
    if (this.detectorPromise) {
      return this.detectorPromise;
    }
    this.detectorPromise = loadPoseDetectorModel()
      .then((detector) => {
        this.detector = detector;
        return detector;
      })
      .finally(() => {
        this.detectorPromise = null;
      });
    return this.detectorPromise;
  }

  onExecute(this: PreviewAwareNode & PoseDetectToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.data = null;
      this.status = "waiting valid image";
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxPoses: clamp(Math.round(Number(this.properties.maxPoses ?? 1)), 1, 5),
      flipHorizontal: Boolean(this.properties.flipHorizontal ?? false),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.status = "detecting pose...";
      this.setDirtyCanvas(true, true);

      void this.getOrLoadDetector()
        .then((detector) => detector.estimatePoses(input, options))
        .then((poses) => {
          if (renderToken !== this.renderToken) {
            return;
          }

          const selectedPose = poses?.[0] ?? null;
          const keypoints = Array.isArray(selectedPose?.keypoints) ? selectedPose.keypoints : [];
          const boxes = buildPoseBoxes(keypoints);
          this.data = {
            task: "pose-detection",
            image: { width: input.width, height: input.height },
            poseCount: Array.isArray(poses) ? poses.length : 0,
            keypointCount: keypoints.length,
            boxes,
            generatedAtIso: new Date().toISOString(),
            raw: poses,
          };
          this.preview = drawPoseBoxesOverlay(input, boxes);
          this.executionMs = performance.now() - start;
          this.status = "ready";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.data = null;
          this.executionMs = null;
          this.status = error instanceof Error ? error.message : "pose detect error";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.data);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & PoseDetectToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `poses ${this.data?.poseCount ?? 0} | keypoints ${this.data?.keypointCount ?? 0}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(
      `boxes ${this.data?.boxes.length ?? 0} | ${this.status}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

export class BgRemoveToolNode {
  size: [number, number] = [280, 430];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "idle";
  executionMs: number | null = null;
  isRendering = false;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  model: BgSegmentationModelLike | null = null;
  modelPromise: Promise<BgSegmentationModelLike> | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & BgRemoveToolNode;
    node.title = createToolTitle("BG Remove");
    node.properties = {
      threshold: 12,
      softness: 0.25,
      invertMask: false,
      backgroundMode: "transparent",
      backgroundColor: "#ACE1AF",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("combo", "Mode", "transparent", (value) => {
      node.properties.backgroundMode = String(value);
      notifyGraphStateChange(node);
    }, { values: ["transparent", "color"] });
    node.addWidget("text", "BG color", "#ACE1AF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Threshold", 12, (value) => {
      node.properties.threshold = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 128, step: 1 });
    node.addWidget("slider", "Softness", 0.25, (value) => {
      node.properties.softness = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("toggle", "Invert mask", false, (value) => {
      node.properties.invertMask = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  getOrLoadModel(this: BgRemoveToolNode) {
    if (this.model) {
      return Promise.resolve(this.model);
    }
    if (this.modelPromise) {
      return this.modelPromise;
    }
    this.modelPromise = loadMediaPipeSelfieSegmenterModel()
      .then((model) => {
        this.model = model;
        return model;
      })
      .finally(() => {
        this.modelPromise = null;
      });
    return this.modelPromise;
  }

  onExecute(this: PreviewAwareNode & BgRemoveToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.status = "waiting valid image";
      this.isRendering = false;
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      threshold: clamp(Math.round(Number(this.properties.threshold ?? 12)), 0, 128),
      softness: clamp(Number(this.properties.softness ?? 0.25), 0, 1),
      invertMask: Boolean(this.properties.invertMask ?? false),
      mode: String(this.properties.backgroundMode ?? "transparent") === "color"
        ? "color"
        : "transparent",
      color: normalizeHexColor(String(this.properties.backgroundColor ?? "#ACE1AF")),
    } as const;
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.status = "segmenting...";
      this.setDirtyCanvas(true, true);

      void this.getOrLoadModel()
        .then((model) => model.segment(input))
        .then((personMask) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = removeBackgroundFromMask(input, personMask, options);
          this.executionMs = performance.now() - start;
          this.status = "ready";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.executionMs = null;
          this.status = error instanceof Error ? error.message : "bg remove error";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BgRemoveToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${String(this.properties.backgroundMode ?? "transparent")} | ${this.status}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(
      `thr ${Number(this.properties.threshold ?? 12)} | soft ${Number(this.properties.softness ?? 0.25).toFixed(2)} | inv ${Boolean(this.properties.invertMask ?? false) ? "on" : "off"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

export class Ml5ExtractToolNode {
  size: [number, number] = [280, 380];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  data: GraphMl5Data | null = null;
  status = "idle";
  executionMs: number | null = null;
  isRendering = false;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  model: Ml5ModelLike | null = null;
  modelTask: Ml5Task | null = null;
  modelKey: string | null = null;
  modelPromise: Promise<Ml5ModelLike> | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & Ml5ExtractToolNode;
    getMl5Runtime();
    node.title = createToolTitle("ML5 Extract");
    node.properties = {
      task: "handpose",
      classifierModel: "MobileNet",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("ml5", "ml5");
    node.addWidget("combo", "Task", "handpose", (value) => {
      node.properties.task = String(value);
      node.clearModelCache();
      notifyGraphStateChange(node);
    }, { values: ["handpose", "facemesh", "bodypose", "imageclassifier"] });
    node.addWidget("combo", "Classifier", "MobileNet", (value) => {
      node.properties.classifierModel = String(value);
      node.clearModelCache();
      notifyGraphStateChange(node);
    }, { values: ["MobileNet", "Darknet", "DoodleNet"] });
    node.addWidget("button", "Reset model", null, () => {
      node.clearModelCache();
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  clearModelCache(this: Ml5ExtractToolNode) {
    this.model = null;
    this.modelTask = null;
    this.modelKey = null;
    this.modelPromise = null;
  }

  getTask(this: Ml5ExtractToolNode): Ml5Task {
    const value = String(this.properties.task ?? "handpose");
    if (value === "bodypose" || value === "facemesh" || value === "imageclassifier") {
      return value;
    }
    return "handpose";
  }

  getModelKey(this: Ml5ExtractToolNode) {
    if (this.getTask() !== "imageclassifier") {
      return "default";
    }
    return String(this.properties.classifierModel ?? "MobileNet");
  }

  getOrLoadModel(this: Ml5ExtractToolNode, task: Ml5Task, modelKey: string) {
    if (this.model && this.modelTask === task && this.modelKey === modelKey) {
      return Promise.resolve(this.model);
    }
    if (this.modelPromise && this.modelTask === task && this.modelKey === modelKey) {
      return this.modelPromise;
    }

    this.model = null;
    this.modelTask = task;
    this.modelKey = modelKey;
    this.modelPromise = loadMl5Model(task, modelKey)
      .then((loadedModel) => {
        if (this.modelTask === task && this.modelKey === modelKey) {
          this.model = loadedModel;
        }
        return loadedModel;
      })
      .finally(() => {
        if (this.modelTask === task && this.modelKey === modelKey) {
          this.modelPromise = null;
        }
      });
    return this.modelPromise;
  }

  onExecute(this: PreviewAwareNode & Ml5ExtractToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.status = "waiting valid image";
      this.isRendering = false;
      this.setOutputData(0, this.preview);
      this.setOutputData(1, this.data);
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const task = this.getTask();
    const modelKey = this.getModelKey();
    const optionsSignature = JSON.stringify({ task, modelKey });

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.status = `running ${task}`;
      this.setDirtyCanvas(true, true);

      void this.getOrLoadModel(task, modelKey)
        .then((model) => runMl5Inference(model, input))
        .then((raw) => {
          if (renderToken !== this.renderToken) {
            return;
          }

          const points: Array<{ x: number; y: number }> = [];
          raw.forEach((item) => collectMl5Landmarks(item, points));
          const labels = summarizeMl5Labels(raw);
          this.data = {
            task,
            modelKey,
            image: { width: input.width, height: input.height },
            summary: {
              itemCount: raw.length,
              pointCount: points.length,
              labels,
            },
            generatedAtIso: new Date().toISOString(),
            raw,
          };
          this.preview = drawMl5Overlay(input, points);
          this.executionMs = performance.now() - start;
          this.status = "ready";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.data = null;
          this.executionMs = null;
          this.status = error instanceof Error ? error.message : "ml5 error";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.data);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & Ml5ExtractToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    const summary = this.data?.summary;
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.getTask()} | ${this.status}`, 10, layout.footerTop + 12);
    context.fillText(
      `items ${summary?.itemCount ?? 0} | points ${summary?.pointCount ?? 0}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}
