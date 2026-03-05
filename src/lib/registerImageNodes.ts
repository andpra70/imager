import "../vendor/bluenoise.js";
import "../vendor/ml5.js";
import "../vendor/pnnquant.js";
import "../vendor/simplify.js";
import type { ImageTracerOptions } from "../vendor/imagetracer.1.2.6.js";
import type { PnnQuantOptions, PnnQuantResult } from "../vendor/pnnquant.js";
import imagetracerRuntime, { type ImageTracerApi } from "../vendor/imagetracer-runtime";
import roughRuntime, { type RoughPathOptions, type RoughApi } from "../vendor/rough-runtime";
import marchingSquaresRuntime, { type MarchingSquaresFn } from "../vendor/p5-marching-runtime";
import { LiteGraph } from "litegraph.js";
import type { GraphImage } from "../models/graphImage";
import type { GraphFaceBlendshapeCategory, GraphFaceLandmarksData } from "../models/graphFaceLandmarks";
import type { GraphMl5Data, Ml5Task } from "../models/graphMl5";
import type { GraphPalette } from "../models/graphPalette";
import type { GraphPoseBox, GraphPoseData } from "../models/graphPose";
import type { GraphSvg } from "../models/graphSvg";
import {
  blendGraphImages,
  brightnessContrastGraphImage,
  combineCmykChannels,
  combineRgbChannels,
  type BlendMode,
  blurGraphImage,
  deserializeGraphImage,
  downloadGraphSvg,
  downloadGraphImage,
  drawImagePreview,
  drawSourceToCanvas,
  graphImageToUint32Array,
  grayscaleGraphImage,
  invertGraphImage,
  rasterizeGraphSvg,
  rotateGraphImage,
  resizeNodeForPreview,
  scaleGraphImage,
  splitCmykChannels,
  splitRgbChannels,
  serializeCompressedGraphImage,
  thresholdGraphImage,
  uint32ArrayToGraphImage,
} from "./imageUtils";
import { registerInputNodes, registerOutputNodes } from "./nodeRegistrations/io";
import { registerBasicToolNodes } from "./nodeRegistrations/basic";
import { registerColorToolNodes } from "./nodeRegistrations/colors";
import { registerArtToolNodes } from "./nodeRegistrations/art";
import { registerAiToolNodes } from "./nodeRegistrations/ai";
import { registerSvgToolNodes } from "./nodeRegistrations/svg";

type LiteNode = {
  addInput: (name: string, type?: string) => void;
  addOutput: (name: string, type?: string) => void;
  addWidget: (
    type: string,
    name: string,
    value: unknown,
    callback?: (value: number | string | boolean) => void,
    options?: Record<string, unknown>,
  ) => void;
  getInputData: (slot: number) => GraphImage | null | undefined;
  setOutputData: (slot: number, data: unknown) => void;
  setDirtyCanvas: (foreground?: boolean, background?: boolean) => void;
  size: [number, number];
  title: string;
  properties: Record<string, unknown>;
  widgets?: unknown[];
  graph?: {
    onGraphStateChange?: () => void;
  };
  onSerialize?: (data: Record<string, unknown>) => void;
  onConfigure?: (data: Record<string, unknown>) => void;
};

type NodeCtor = new () => LiteNode;

interface PreviewAwareNode extends LiteNode {
  refreshPreviewLayout: () => void;
}

let registered = false;

interface PnnQuantInstance {
  getResult(): Promise<PnnQuantResult>;
}

interface PnnQuantConstructor {
  new (options: PnnQuantOptions): PnnQuantInstance;
}

interface BlueNoiseInstance {
  diffuse: (
    pixel: number,
    palettePixel: number,
    strength: number,
    x: number,
    y: number,
  ) => number;
}

interface BlueNoiseConstructor {
  new (options: { weight: number }): BlueNoiseInstance;
}

interface RoughTransformResult {
  svg: GraphSvg;
  pathCount: number;
}

interface SimplifyPoint {
  x: number;
  y: number;
}

type SimplifyFn = (
  points: SimplifyPoint[],
  tolerance?: number,
  highestQuality?: boolean,
) => SimplifyPoint[];

interface SvgSimplifyResult {
  svg: GraphSvg;
  pathCount: number;
}

interface MarchingResult {
  svg: GraphSvg;
  pathCount: number;
  sampledWidth: number;
  sampledHeight: number;
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

interface MediaPipeFaceLandmarkerLike {
  detect: (input: CanvasImageSource) => unknown;
  close?: () => void;
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

function getMl5Runtime() {
  const runtime = globalThis as { ml5?: Ml5Runtime };
  if (!runtime.ml5) {
    throw new Error("ml5 runtime is not available.");
  }
  return runtime.ml5;
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
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${url}`)), { once: true });
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
    script.addEventListener("error", () => reject(new Error(`Failed to load script: ${url}`)), {
      once: true,
    });
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
        throw new Error("TensorFlow.js runtime not available.");
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
        throw new Error("pose-detection runtime not available.");
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
    throw new Error("2D context not available.");
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
    throw new Error("2D context not available.");
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

function getImageTracer() {
  if (!imagetracerRuntime || typeof imagetracerRuntime.imagedataToSVG !== "function") {
    throw new Error("ImageTracer runtime is not available.");
  }

  return imagetracerRuntime as ImageTracerApi;
}

function getPnnQuant() {
  const runtime = globalThis as {
    PnnQuant?: PnnQuantConstructor;
    TELL_BLUE_NOISE?: Int16Array;
    BlueNoise?: BlueNoiseConstructor;
  };

  const pnnQuant = runtime.PnnQuant;
  if (!pnnQuant) {
    throw new Error("PnnQuant global is not available.");
  }

  if (!runtime.TELL_BLUE_NOISE || !runtime.BlueNoise) {
    throw new Error("BlueNoise runtime is not available.");
  }

  return pnnQuant;
}

function getRough() {
  if (!roughRuntime || typeof (roughRuntime as RoughApi).svg !== "function") {
    throw new Error("Rough global is not available.");
  }

  return roughRuntime as RoughApi;
}

function getSimplify() {
  const simplify = (globalThis as { simplify?: SimplifyFn }).simplify;
  if (!simplify) {
    throw new Error("simplify.js global is not available.");
  }

  return simplify;
}

function getMarchingSquares() {
  if (!marchingSquaresRuntime || typeof (marchingSquaresRuntime as MarchingSquaresFn) !== "function") {
    throw new Error("p5.marching runtime is not available.");
  }

  return marchingSquaresRuntime as MarchingSquaresFn;
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function refreshNode(node: PreviewAwareNode, image: CanvasImageSource | null, footerLines = 0) {
  resizeNodeForPreview(node, image, { footerLines });
  node.setDirtyCanvas(true, true);
}

function createToolTitle(name: string) {
  return `TOOLS / ${name}`;
}

const blendModeToCompositeOperation: Record<BlendMode, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  difference: "difference",
};

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

function estimateGraphImageColorCount(image: GraphImage) {
  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const sampleWidth = Math.max(1, Math.round(image.width * scale));
  const sampleHeight = Math.max(1, Math.round(image.height * scale));

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) {
    return { count: 0, isEstimated: true };
  }

  sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const unique = new Set<number>();
  for (let index = 0; index < pixels.length; index += 4) {
    const packed =
      pixels[index] |
      (pixels[index + 1] << 8) |
      (pixels[index + 2] << 16) |
      (pixels[index + 3] << 24);
    unique.add(packed >>> 0);
  }

  return {
    count: unique.size,
    isEstimated: sampleWidth !== image.width || sampleHeight !== image.height,
  };
}

function formatGraphImageInfo(image: GraphImage | null) {
  if (!image) {
    return "no image";
  }

  const colorInfo = estimateGraphImageColorCount(image);
  return `${image.width}x${image.height} | ${colorInfo.isEstimated ? "~" : ""}${colorInfo.count} colors`;
}

function formatExecutionInfo(executionMs: number | null) {
  if (executionMs === null || !Number.isFinite(executionMs)) {
    return "[-- ms]";
  }
  return `[${executionMs.toFixed(2)} ms]`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface HistogramChannel {
  name: string;
  color: string;
  values: Uint32Array;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type HistogramMode = "rgb" | "hsv" | "grayscale";
type LevelsMode = "rgb" | "hsv" | "gray" | "alpha";

function rgbToHsv255(r: number, g: number, b: number) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rr) {
      hue = ((gg - bb) / delta) % 6;
    } else if (max === gg) {
      hue = (bb - rr) / delta + 2;
    } else {
      hue = (rr - gg) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  const saturation = max === 0 ? 0 : delta / max;
  const value = max;

  return {
    h: Math.round((hue / 360) * 255),
    s: Math.round(saturation * 255),
    v: Math.round(value * 255),
  };
}

function hsv255ToRgb(h: number, s: number, v: number) {
  const hue = (clamp(h, 0, 255) / 255) * 360;
  const sat = clamp(s, 0, 255) / 255;
  const val = clamp(v, 0, 255) / 255;

  const chroma = val * sat;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const m = val - chroma;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;
  if (segment >= 0 && segment < 1) {
    rPrime = chroma;
    gPrime = x;
  } else if (segment < 2) {
    rPrime = x;
    gPrime = chroma;
  } else if (segment < 3) {
    gPrime = chroma;
    bPrime = x;
  } else if (segment < 4) {
    gPrime = x;
    bPrime = chroma;
  } else if (segment < 5) {
    rPrime = x;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = x;
  }

  return {
    r: clamp(Math.round((rPrime + m) * 255), 0, 255),
    g: clamp(Math.round((gPrime + m) * 255), 0, 255),
    b: clamp(Math.round((bPrime + m) * 255), 0, 255),
  };
}

function applyLevelsValue(
  value: number,
  inBlack: number,
  inWhite: number,
  gamma: number,
  outBlack: number,
  outWhite: number,
) {
  const safeInBlack = clamp(Math.round(inBlack), 0, 254);
  const safeInWhite = clamp(Math.round(inWhite), safeInBlack + 1, 255);
  const safeGamma = clamp(gamma, 0.1, 5);
  const safeOutBlack = clamp(Math.round(outBlack), 0, 254);
  const safeOutWhite = clamp(Math.round(outWhite), safeOutBlack + 1, 255);

  const normalized = clamp((value - safeInBlack) / (safeInWhite - safeInBlack), 0, 1);
  const corrected = normalized ** (1 / safeGamma);
  return clamp(
    Math.round(safeOutBlack + corrected * (safeOutWhite - safeOutBlack)),
    0,
    255,
  );
}

function buildHistogram(image: GraphImage, mode: HistogramMode) {
  const context = image.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return {
      channels: [] as HistogramChannel[],
      maxCount: 0,
      pixelCount: 0,
    };
  }

  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const h = new Uint32Array(256);
  const s = new Uint32Array(256);
  const v = new Uint32Array(256);
  const gray = new Uint32Array(256);

  let pixelCount = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha === 0) {
      continue;
    }
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    pixelCount += 1;

    r[red] += 1;
    g[green] += 1;
    b[blue] += 1;

    const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    gray[luminance] += 1;

    const hsv = rgbToHsv255(red, green, blue);
    h[hsv.h] += 1;
    s[hsv.s] += 1;
    v[hsv.v] += 1;
  }

  const channelsByMode: Record<HistogramMode, HistogramChannel[]> = {
    rgb: [
      { name: "R", color: "rgba(255, 80, 80, 0.92)", values: r },
      { name: "G", color: "rgba(76, 220, 120, 0.9)", values: g },
      { name: "B", color: "rgba(92, 150, 255, 0.9)", values: b },
    ],
    hsv: [
      { name: "H", color: "rgba(255, 176, 60, 0.92)", values: h },
      { name: "S", color: "rgba(70, 225, 224, 0.9)", values: s },
      { name: "V", color: "rgba(240, 240, 240, 0.88)", values: v },
    ],
    grayscale: [
      { name: "Y", color: "rgba(240, 240, 240, 0.95)", values: gray },
    ],
  };
  const channels = channelsByMode[mode];
  let maxCount = 0;
  channels.forEach((channel) => {
    for (let index = 0; index < channel.values.length; index += 1) {
      if (channel.values[index] > maxCount) {
        maxCount = channel.values[index];
      }
    }
  });

  return { channels, maxCount, pixelCount };
}

function shouldReuseCachedToolResult(
  executionMs: number | null,
  lastSignature: string,
  lastOptionsSignature: string,
  currentSignature: string,
  currentOptionsSignature: string,
) {
  return (
    executionMs !== null &&
    executionMs > 100 &&
    lastSignature === currentSignature &&
    lastOptionsSignature === currentOptionsSignature
  );
}

class OptimizedToolNode {
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";

  protected resetOptimizedCache() {
    this.lastSignature = "";
    this.lastOptionsSignature = "";
  }

  protected canReuseOptimizedResult(currentSignature: string, currentOptionsSignature: string) {
    return shouldReuseCachedToolResult(
      this.executionMs,
      this.lastSignature,
      this.lastOptionsSignature,
      currentSignature,
      currentOptionsSignature,
    );
  }

  protected completeOptimizedExecution(
    startedAt: number,
    currentSignature?: string,
    currentOptionsSignature?: string,
  ) {
    this.executionMs = performance.now() - startedAt;
    if (currentSignature !== undefined && currentOptionsSignature !== undefined) {
      this.lastSignature = currentSignature;
      this.lastOptionsSignature = currentOptionsSignature;
    }
  }
}

function oilPaintGraphImage(source: GraphImage, radius: number, intensityLevels: number) {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }

  const width = source.width;
  const height = source.height;
  const sourceImageData = context.getImageData(0, 0, width, height);
  const sourcePixels = sourceImageData.data;
  const levels = clamp(Math.round(intensityLevels), 2, 64);
  const safeRadius = clamp(Math.round(radius), 1, 24);
  const intensityLut = new Uint8Array(width * height);

  for (let index = 0, pixel = 0; index < sourcePixels.length; index += 4, pixel += 1) {
    const avg = (sourcePixels[index] + sourcePixels[index + 1] + sourcePixels[index + 2]) / 3;
    intensityLut[pixel] = Math.round((avg * (levels - 1)) / 255);
  }

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("2D context not available.");
  }

  const destinationImageData = outputContext.createImageData(width, height);
  const destinationPixels = destinationImageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const countByLevel = new Uint32Array(levels);
      const rByLevel = new Uint32Array(levels);
      const gByLevel = new Uint32Array(levels);
      const bByLevel = new Uint32Array(levels);

      const minY = Math.max(0, y - safeRadius);
      const maxY = Math.min(height - 1, y + safeRadius);
      const minX = Math.max(0, x - safeRadius);
      const maxX = Math.min(width - 1, x + safeRadius);

      for (let yy = minY; yy <= maxY; yy += 1) {
        for (let xx = minX; xx <= maxX; xx += 1) {
          const pixelIndex = yy * width + xx;
          const level = intensityLut[pixelIndex];
          const sourceIndex = pixelIndex * 4;
          countByLevel[level] += 1;
          rByLevel[level] += sourcePixels[sourceIndex];
          gByLevel[level] += sourcePixels[sourceIndex + 1];
          bByLevel[level] += sourcePixels[sourceIndex + 2];
        }
      }

      let selectedLevel = 0;
      let selectedCount = 0;
      for (let level = 0; level < levels; level += 1) {
        if (countByLevel[level] > selectedCount) {
          selectedLevel = level;
          selectedCount = countByLevel[level];
        }
      }

      const destinationIndex = (y * width + x) * 4;
      const divisor = Math.max(1, selectedCount);
      destinationPixels[destinationIndex] = Math.round(rByLevel[selectedLevel] / divisor);
      destinationPixels[destinationIndex + 1] = Math.round(gByLevel[selectedLevel] / divisor);
      destinationPixels[destinationIndex + 2] = Math.round(bByLevel[selectedLevel] / divisor);
      destinationPixels[destinationIndex + 3] = 255;
    }
  }

  outputContext.putImageData(destinationImageData, 0, 0);
  return output;
}

function convolveImage3x3(source: GraphImage, kernel: number[], divisor = 1, bias = 0) {
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }

  const width = source.width;
  const height = source.height;
  const sourceImage = sourceContext.getImageData(0, 0, width, height);
  const sourcePixels = sourceImage.data;
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("2D context not available.");
  }
  const destinationImage = outputContext.createImageData(width, height);
  const destinationPixels = destinationImage.data;

  const safeDivisor = divisor === 0 ? 1 : divisor;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        const yy = clamp(y + ky, 0, height - 1);
        for (let kx = -1; kx <= 1; kx += 1) {
          const xx = clamp(x + kx, 0, width - 1);
          const kernelWeight = kernel[(ky + 1) * 3 + (kx + 1)];
          const sourceIndex = (yy * width + xx) * 4;
          sumR += sourcePixels[sourceIndex] * kernelWeight;
          sumG += sourcePixels[sourceIndex + 1] * kernelWeight;
          sumB += sourcePixels[sourceIndex + 2] * kernelWeight;
        }
      }

      const destinationIndex = (y * width + x) * 4;
      destinationPixels[destinationIndex] = clamp(Math.round(sumR / safeDivisor + bias), 0, 255);
      destinationPixels[destinationIndex + 1] = clamp(Math.round(sumG / safeDivisor + bias), 0, 255);
      destinationPixels[destinationIndex + 2] = clamp(Math.round(sumB / safeDivisor + bias), 0, 255);
      destinationPixels[destinationIndex + 3] = sourcePixels[destinationIndex + 3];
    }
  }

  outputContext.putImageData(destinationImage, 0, 0);
  return output;
}

function sobelGraphImage(
  source: GraphImage,
  options: { mode: "magnitude" | "horizontal" | "vertical" | "threshold"; threshold: number; invert: boolean; strength: number },
) {
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }

  const width = source.width;
  const height = source.height;
  const sourceImage = sourceContext.getImageData(0, 0, width, height);
  const sourcePixels = sourceImage.data;
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  if (!outputContext) {
    throw new Error("2D context not available.");
  }
  const destinationImage = outputContext.createImageData(width, height);
  const destinationPixels = destinationImage.data;

  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const threshold = clamp(Math.round(options.threshold), 0, 255);
  const strength = clamp(options.strength, 0.5, 6);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        const yy = clamp(y + ky, 0, height - 1);
        for (let kx = -1; kx <= 1; kx += 1) {
          const xx = clamp(x + kx, 0, width - 1);
          const sourceIndex = (yy * width + xx) * 4;
          const luminance =
            0.2126 * sourcePixels[sourceIndex] +
            0.7152 * sourcePixels[sourceIndex + 1] +
            0.0722 * sourcePixels[sourceIndex + 2];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          gx += luminance * kernelX[kernelIndex];
          gy += luminance * kernelY[kernelIndex];
        }
      }

      let edgeValue = 0;
      if (options.mode === "horizontal") {
        edgeValue = Math.abs(gx);
      } else if (options.mode === "vertical") {
        edgeValue = Math.abs(gy);
      } else {
        edgeValue = Math.hypot(gx, gy);
      }
      edgeValue = clamp(edgeValue * (strength / 4), 0, 255);
      if (options.mode === "threshold") {
        edgeValue = edgeValue >= threshold ? 255 : 0;
      }
      if (options.invert) {
        edgeValue = 255 - edgeValue;
      }

      const destinationIndex = (y * width + x) * 4;
      const gray = clamp(Math.round(edgeValue), 0, 255);
      destinationPixels[destinationIndex] = gray;
      destinationPixels[destinationIndex + 1] = gray;
      destinationPixels[destinationIndex + 2] = gray;
      destinationPixels[destinationIndex + 3] = sourcePixels[destinationIndex + 3];
    }
  }

  outputContext.putImageData(destinationImage, 0, 0);
  return output;
}

function parseSvgLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseSvgRoot(svg: GraphSvg): SVGSVGElement | null {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() === "parsererror") {
    return null;
  }

  if (root.tagName.toLowerCase() === "svg") {
    return root as unknown as SVGSVGElement;
  }

  return document.querySelector("svg") as SVGSVGElement | null;
}

function parsePaintFromStyle(style: string | null, property: "fill" | "stroke") {
  if (!style) {
    return null;
  }

  const match = style.match(new RegExp(`${property}\\s*:\\s*([^;]+)`, "i"));
  return match?.[1]?.trim() ?? null;
}

function getSvgPaint(path: SVGPathElement, property: "fill" | "stroke") {
  const attrValue = path.getAttribute(property);
  if (attrValue) {
    return attrValue;
  }

  return parsePaintFromStyle(path.getAttribute("style"), property);
}

function roundWithPrecision(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundNumbersInString(value: string, precision: number) {
  return value.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (match) => {
    const parsed = Number(match);
    if (!Number.isFinite(parsed)) {
      return match;
    }
    const rounded = roundWithPrecision(parsed, precision);
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  });
}

function buildPolylinePath(points: SimplifyPoint[], precision: number, closed: boolean) {
  if (!points.length) {
    return "";
  }

  const toCoord = (value: number) => {
    const rounded = roundWithPrecision(value, precision);
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };
  const commands = points.map((point, index) => {
    const x = toCoord(point.x);
    const y = toCoord(point.y);
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  });
  if (closed) {
    commands.push("Z");
  }
  return commands.join(" ");
}

function simplifyPathD(
  pathData: string,
  simplify: SimplifyFn,
  options: { tolerance: number; sampleStep: number; highQuality: boolean; precision: number },
) {
  const pathTokenCount = pathData.match(/[Mm]/g)?.length ?? 0;
  if (pathTokenCount > 1) {
    return roundNumbersInString(pathData, options.precision).replace(/\s+/g, " ").trim();
  }

  const parserDocument = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
  const parserPath = parserDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  parserPath.setAttribute("d", pathData);
  parserDocument.documentElement.appendChild(parserPath);

  let length = 0;
  try {
    length = parserPath.getTotalLength();
  } catch {
    return roundNumbersInString(pathData, options.precision).replace(/\s+/g, " ").trim();
  }

  if (!Number.isFinite(length) || length <= 0) {
    return roundNumbersInString(pathData, options.precision).replace(/\s+/g, " ").trim();
  }

  const sampleCount = Math.max(10, Math.ceil(length / Math.max(0.25, options.sampleStep)));
  const points: SimplifyPoint[] = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const point = parserPath.getPointAtLength((length * index) / sampleCount);
    points.push({ x: point.x, y: point.y });
  }

  const deduped: SimplifyPoint[] = [];
  points.forEach((point) => {
    const last = deduped[deduped.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      deduped.push(point);
    }
  });

  const simplified = simplify(
    deduped,
    Math.max(0, options.tolerance),
    options.highQuality,
  );
  if (simplified.length < 2) {
    return roundNumbersInString(pathData, options.precision).replace(/\s+/g, " ").trim();
  }

  const closed = /[zZ]\s*$/.test(pathData.trim());
  const normalized = [...simplified];
  if (closed && normalized.length > 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first.x === last.x && first.y === last.y) {
      normalized.pop();
    }
  }

  return buildPolylinePath(normalized, options.precision, closed);
}

function simplifyGraphSvg(
  inputSvg: GraphSvg,
  options: {
    tolerance: number;
    sampleStep: number;
    precision: number;
    highQuality: boolean;
    minify: boolean;
  },
): SvgSimplifyResult {
  const inputRoot = parseSvgRoot(inputSvg);
  if (!inputRoot) {
    throw new Error("Invalid SVG input.");
  }

  const outputRoot = inputRoot.cloneNode(true) as SVGSVGElement;
  const simplify = getSimplify();
  let pathCount = 0;

  Array.from(outputRoot.querySelectorAll("path")).forEach((path) => {
    const current = path.getAttribute("d");
    if (!current) {
      return;
    }

    const simplified = simplifyPathD(current, simplify, options);
    if (simplified) {
      path.setAttribute("d", simplified);
      pathCount += 1;
    }
  });

  if (options.minify) {
    const numericAttributes = [
      "d",
      "points",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "width",
      "height",
      "viewBox",
      "transform",
      "stroke-width",
      "stroke-dasharray",
      "stroke-dashoffset",
      "opacity",
      "fill-opacity",
      "stroke-opacity",
    ];
    outputRoot.querySelectorAll("*").forEach((element) => {
      numericAttributes.forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (!value) {
          return;
        }
        element.setAttribute(
          attribute,
          roundNumbersInString(value, options.precision).replace(/\s+/g, " ").trim(),
        );
      });
    });
  }

  const svg = new XMLSerializer()
    .serializeToString(outputRoot)
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { svg, pathCount };
}

function roughenGraphSvg(
  inputSvg: GraphSvg,
  options: RoughPathOptions & {
    preserveStroke: boolean;
    preserveFill: boolean;
    fallbackStroke: string;
    fallbackFill: string;
  },
): RoughTransformResult {
  const inputRoot = parseSvgRoot(inputSvg);
  if (!inputRoot) {
    throw new Error("Invalid SVG input.");
  }

  const outputDocument = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
  const outputRoot = outputDocument.documentElement as unknown as SVGSVGElement;
  outputRoot.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const viewBox = inputRoot.getAttribute("viewBox");
  const width = parseSvgLength(inputRoot.getAttribute("width"));
  const height = parseSvgLength(inputRoot.getAttribute("height"));
  if (viewBox) {
    outputRoot.setAttribute("viewBox", viewBox);
  } else if (width && height) {
    outputRoot.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  if (width) {
    outputRoot.setAttribute("width", String(width));
  }
  if (height) {
    outputRoot.setAttribute("height", String(height));
  }

  const roughSvg = getRough().svg(outputRoot);
  const sourcePaths = Array.from(inputRoot.querySelectorAll("path"));
  let pathCount = 0;

  sourcePaths.forEach((sourcePath) => {
    const d = sourcePath.getAttribute("d");
    if (!d) {
      return;
    }

    const stroke = options.preserveStroke
      ? (getSvgPaint(sourcePath, "stroke") ?? options.fallbackStroke)
      : options.fallbackStroke;
    const fill = options.preserveFill
      ? (getSvgPaint(sourcePath, "fill") ?? options.fallbackFill)
      : options.fallbackFill;

    const roughPath = roughSvg.path(d, {
      roughness: options.roughness,
      bowing: options.bowing,
      strokeWidth: options.strokeWidth,
      fillStyle: options.fillStyle,
      hachureAngle: options.hachureAngle,
      hachureGap: options.hachureGap,
      fillWeight: options.fillWeight,
      simplification: options.simplification,
      curveStepCount: options.curveStepCount,
      maxRandomnessOffset: options.maxRandomnessOffset,
      seed: options.seed,
      disableMultiStroke: options.disableMultiStroke,
      stroke,
      fill,
    });

    const transform = sourcePath.getAttribute("transform");
    if (transform) {
      roughPath.setAttribute("transform", transform);
    }

    outputRoot.appendChild(roughPath);
    pathCount += 1;
  });

  if (!pathCount) {
    throw new Error("No SVG paths available for rough transform.");
  }

  return {
    svg: new XMLSerializer().serializeToString(outputRoot),
    pathCount,
  };
}

function segmentEndpointKey(point: SimplifyPoint) {
  return `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
}

function stitchMarchingSegments(
  segments: number[][],
  scale: number,
): SimplifyPoint[][] {
  if (!segments.length) {
    return [];
  }

  const normalized = segments.map((segment) => {
    const a: SimplifyPoint = { x: segment[0] * scale, y: segment[1] * scale };
    const b: SimplifyPoint = { x: segment[2] * scale, y: segment[3] * scale };
    return { a, b };
  });

  const endpointMap = new Map<string, Set<number>>();
  normalized.forEach((segment, index) => {
    [segmentEndpointKey(segment.a), segmentEndpointKey(segment.b)].forEach((key) => {
      const current = endpointMap.get(key) ?? new Set<number>();
      current.add(index);
      endpointMap.set(key, current);
    });
  });

  const used = new Set<number>();
  const polylines: SimplifyPoint[][] = [];

  const grow = (
    polyline: SimplifyPoint[],
    atHead: boolean,
  ) => {
    while (true) {
      const pivot = atHead ? polyline[0] : polyline[polyline.length - 1];
      const pivotKey = segmentEndpointKey(pivot);
      const candidates = endpointMap.get(pivotKey);
      if (!candidates) {
        break;
      }

      let nextIndex: number | null = null;
      candidates.forEach((candidate) => {
        if (nextIndex !== null || used.has(candidate)) {
          return;
        }
        nextIndex = candidate;
      });

      if (nextIndex === null) {
        break;
      }

      used.add(nextIndex);
      const segment = normalized[nextIndex];
      const keyA = segmentEndpointKey(segment.a);
      const nextPoint = keyA === pivotKey ? segment.b : segment.a;
      if (atHead) {
        polyline.unshift(nextPoint);
      } else {
        polyline.push(nextPoint);
      }
    }
  };

  normalized.forEach((segment, index) => {
    if (used.has(index)) {
      return;
    }

    used.add(index);
    const polyline = [segment.a, segment.b];
    grow(polyline, false);
    grow(polyline, true);
    polylines.push(polyline);
  });

  return polylines.filter((polyline) => polyline.length >= 2);
}

function toHexColorChannel(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

interface BoldiniGradientMap {
  magnitudes: Float32Array;
  directions: Float32Array;
}

function getAverageColorFromImageData(imageData: ImageData) {
  const data = imageData.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] <= 0) {
      continue;
    }
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  }
  if (count === 0) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

function toGrayscaleImageData(imageData: ImageData) {
  const source = imageData.data;
  const gray = new Uint8ClampedArray(source.length);
  for (let index = 0; index < source.length; index += 4) {
    const luminosity = 0.299 * source[index] + 0.587 * source[index + 1] + 0.114 * source[index + 2];
    gray[index] = luminosity;
    gray[index + 1] = luminosity;
    gray[index + 2] = luminosity;
    gray[index + 3] = source[index + 3];
  }
  return new ImageData(gray, imageData.width, imageData.height);
}

function sobelOperatorFromGrayscale(imageData: ImageData): BoldiniGradientMap {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const magnitudes = new Float32Array(width * height);
  const directions = new Float32Array(width * height);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sumX = 0;
      let sumY = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const sampleIndex = ((y + ky) * width + (x + kx)) * 4;
          const value = data[sampleIndex];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          sumX += value * gx[kernelIndex];
          sumY += value * gy[kernelIndex];
        }
      }
      const targetIndex = y * width + x;
      magnitudes[targetIndex] = Math.min(1, Math.sqrt(sumX * sumX + sumY * sumY) / 1140);
      directions[targetIndex] = Math.atan2(sumY, sumX);
    }
  }

  return { magnitudes, directions };
}

function createGaussianKernel(radius: number) {
  const size = radius * 2 + 1;
  const kernel = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const sigma = Math.max(0.0001, radius / 2);
  const sigma2 = 2 * sigma * sigma;
  let sum = 0;

  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      const value = Math.exp(-(distance * distance) / sigma2) / (Math.PI * sigma2);
      kernel[y + radius][x + radius] = value;
      sum += value;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      kernel[y][x] /= sum;
    }
  }

  return kernel;
}

function gaussianBlurImageData(imageData: ImageData, radius: number) {
  const width = imageData.width;
  const height = imageData.height;
  const source = imageData.data;
  const output = new Uint8ClampedArray(source.length);
  const kernel = createGaussianKernel(radius);
  const side = radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weightSum = 0;
      for (let ky = -side; ky <= side; ky += 1) {
        for (let kx = -side; kx <= side; kx += 1) {
          const sampleX = clamp(x + kx, 0, width - 1);
          const sampleY = clamp(y + ky, 0, height - 1);
          const sourceIndex = (sampleY * width + sampleX) * 4;
          const weight = kernel[ky + side][kx + side];
          r += source[sourceIndex] * weight;
          g += source[sourceIndex + 1] * weight;
          b += source[sourceIndex + 2] * weight;
          a += source[sourceIndex + 3] * weight;
          weightSum += weight;
        }
      }
      const outputIndex = (y * width + x) * 4;
      output[outputIndex] = r / weightSum;
      output[outputIndex + 1] = g / weightSum;
      output[outputIndex + 2] = b / weightSum;
      output[outputIndex + 3] = a / weightSum;
    }
  }

  return new ImageData(output, width, height);
}

function drawBoldiniSimpleStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string,
) {
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(0, 0, size, size / 3, 0, 0, Math.PI * 2);
  context.fill();
}

function drawBoldiniCurvedStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string,
) {
  const length = size * 1.5;
  const curveAmount = (Math.random() - 0.5) * 0.8;
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, size / 4);
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x, y);
  const endX = x + Math.cos(angle) * length;
  const endY = y + Math.sin(angle) * length;
  const cpX = x + Math.cos(angle + curveAmount) * length * 0.5;
  const cpY = y + Math.sin(angle + curveAmount) * length * 0.5;
  context.quadraticCurveTo(cpX, cpY, endX, endY);
  context.stroke();
}

function drawSargentStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  color: string,
) {
  const width = size;
  const height = size / (Math.random() * 2 + 1.5);
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = color;
  context.beginPath();
  context.rect(-width * 0.5, -height * 0.5, width, height);
  context.fill();
}

async function renderSargentLayer(options: {
  context: CanvasRenderingContext2D;
  numStrokes: number;
  minSize: number;
  maxSize: number;
  colorSource: ImageData;
  gradientMap: BoldiniGradientMap;
  opacity: number;
  sharpen?: boolean;
  colorJitter?: number;
  brightnessBoost?: number;
  shouldCancel?: () => boolean;
  onProgress?: (progress: number) => void;
}) {
  const {
    context,
    numStrokes,
    minSize,
    maxSize,
    colorSource,
    gradientMap,
    opacity,
    sharpen = false,
    colorJitter = 0,
    brightnessBoost = 0,
    shouldCancel,
    onProgress,
  } = options;
  const width = context.canvas.width;
  const height = context.canvas.height;
  const data = colorSource.data;

  for (let strokeIndex = 0; strokeIndex < numStrokes; strokeIndex += 1) {
    if (shouldCancel?.()) {
      return false;
    }

    let x = 0;
    let y = 0;
    if (sharpen) {
      do {
        x = Math.floor(Math.random() * width);
        y = Math.floor(Math.random() * height);
      } while (Math.random() > gradientMap.magnitudes[y * width + x]);
    } else {
      x = Math.floor(Math.random() * width);
      y = Math.floor(Math.random() * height);
    }

    const pixelIndex = (y * width + x) * 4;
    let r = data[pixelIndex];
    let g = data[pixelIndex + 1];
    let b = data[pixelIndex + 2];

    if (colorJitter > 0) {
      r += (Math.random() - 0.5) * colorJitter;
      g += (Math.random() - 0.5) * colorJitter;
      b += (Math.random() - 0.5) * colorJitter;
    }
    if (brightnessBoost > 0) {
      r += brightnessBoost;
      g += brightnessBoost;
      b += brightnessBoost;
    }

    r = clamp(r, 0, 255);
    g = clamp(g, 0, 255);
    b = clamp(b, 0, 255);

    const color = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    const size = Math.random() * (maxSize - minSize) + minSize;
    const angle = gradientMap.directions[y * width + x];
    context.save();
    context.globalAlpha = opacity * (Math.random() * 0.4 + 0.6);
    drawSargentStroke(context, x, y, size, angle, color);
    context.restore();

    if (strokeIndex % 100 === 0) {
      onProgress?.(strokeIndex / numStrokes);
      await yieldToUi();
    }
  }

  onProgress?.(1);
  return true;
}

async function renderBoldiniLayer(options: {
  context: CanvasRenderingContext2D;
  numStrokes: number;
  minSize: number;
  maxSize: number;
  colorSource: ImageData;
  gradientMap: BoldiniGradientMap;
  opacity: number;
  useCurve?: boolean;
  sharpen?: boolean;
  colorJitter?: number;
  shouldCancel?: () => boolean;
  onProgress?: (progress: number) => void;
}) {
  const {
    context,
    numStrokes,
    minSize,
    maxSize,
    colorSource,
    gradientMap,
    opacity,
    useCurve = false,
    sharpen = false,
    colorJitter = 0,
    shouldCancel,
    onProgress,
  } = options;
  const width = context.canvas.width;
  const height = context.canvas.height;
  const data = colorSource.data;

  for (let strokeIndex = 0; strokeIndex < numStrokes; strokeIndex += 1) {
    if (shouldCancel?.()) {
      return false;
    }

    let x = 0;
    let y = 0;
    if (sharpen) {
      do {
        x = Math.floor(Math.random() * width);
        y = Math.floor(Math.random() * height);
      } while (Math.random() > gradientMap.magnitudes[y * width + x]);
    } else {
      x = Math.floor(Math.random() * width);
      y = Math.floor(Math.random() * height);
    }

    const pixelIndex = (y * width + x) * 4;
    let r = data[pixelIndex];
    let g = data[pixelIndex + 1];
    let b = data[pixelIndex + 2];
    if (colorJitter > 0) {
      r = clamp(r + (Math.random() - 0.5) * colorJitter, 0, 255);
      g = clamp(g + (Math.random() - 0.5) * colorJitter, 0, 255);
      b = clamp(b + (Math.random() - 0.5) * colorJitter, 0, 255);
    }
    const color = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    const size = Math.random() * (maxSize - minSize) + minSize;
    const angle = gradientMap.directions[y * width + x] + Math.PI / 2;
    context.save();
    context.globalAlpha = opacity * (Math.random() * 0.5 + 0.5);
    if (useCurve) {
      drawBoldiniCurvedStroke(context, x, y, size, angle, color);
    } else {
      drawBoldiniSimpleStroke(context, x, y, size, angle, color);
    }
    context.restore();

    if (strokeIndex % 100 === 0) {
      onProgress?.(strokeIndex / numStrokes);
      await yieldToUi();
    }
  }

  onProgress?.(1);
  return true;
}

function fitSourceToSquareCanvas(input: GraphImage, side: number) {
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const ratio = Math.min(side / input.width, side / input.height);
  const drawWidth = input.width * ratio;
  const drawHeight = input.height * ratio;
  const offsetX = (side - drawWidth) * 0.5;
  const offsetY = (side - drawHeight) * 0.5;
  context.clearRect(0, 0, side, side);
  context.drawImage(input, 0, 0, input.width, input.height, offsetX, offsetY, drawWidth, drawHeight);
  return canvas;
}

function fitSourceToMaxWidthCanvas(input: GraphImage, maxWidth: number) {
  const safeMaxWidth = Math.max(1, Math.round(maxWidth));
  const scale = Math.min(1, safeMaxWidth / input.width);
  const width = Math.max(1, Math.round(input.width * scale));
  const height = Math.max(1, Math.round(input.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  context.clearRect(0, 0, width, height);
  context.drawImage(input, 0, 0, input.width, input.height, 0, 0, width, height);
  return canvas;
}

function createGrayMapFromImageData(imageData: ImageData) {
  const grayMap = new Uint8Array(imageData.width * imageData.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    grayMap[index / 4] = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  }
  return grayMap;
}

function drawCarbonHumanStroke(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  angleDeg: number,
  baseAlpha: number,
  lineWidth: number,
) {
  const radians = angleDeg * (Math.PI / 180);
  const x1 = x;
  const y1 = y;
  const x2 = x1 + Math.cos(radians) * length;
  const y2 = y1 + Math.sin(radians) * length;
  const gradient = context.createLinearGradient(x1, y1, x2, y2);
  gradient.addColorStop(0, `rgba(0,0,0,${baseAlpha * (0.4 + Math.random() * 0.4)})`);
  gradient.addColorStop(0.5, `rgba(0,0,0,${baseAlpha * (0.8 + Math.random() * 0.4)})`);
  gradient.addColorStop(1, `rgba(0,0,0,${baseAlpha * (0.3 + Math.random() * 0.4)})`);
  context.strokeStyle = gradient;
  context.lineWidth = Math.max(0.5, lineWidth * (0.8 + Math.random() * 0.4));
  const midX = (x1 + x2) * 0.5;
  const midY = (y1 + y2) * 0.5;
  const curveStrength = length * 0.15;
  const cpX = midX + (Math.random() - 0.5) * curveStrength;
  const cpY = midY + (Math.random() - 0.5) * curveStrength;
  context.beginPath();
  context.moveTo(x1, y1);
  context.quadraticCurveTo(cpX, cpY, x2, y2);
  context.stroke();
}

function drawCarbonScumble(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  baseAlpha: number,
  maxLineWidth: number,
) {
  const numPoints = 10 + Math.random() * 15;
  for (let index = 0; index < numPoints; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    context.fillStyle = `rgba(0,0,0,${baseAlpha * (0.5 + Math.random() * 0.5)})`;
    context.fillRect(
      px,
      py,
      Math.max(1, maxLineWidth * Math.random()),
      Math.max(1, maxLineWidth * Math.random()),
    );
  }
}

async function renderCarbonLayer(options: {
  context: CanvasRenderingContext2D;
  passName: string;
  numStrokes: number;
  brightnessThreshold: number;
  angle: number | "random";
  angleJitter: number;
  scumbleChance: number;
  getStrokeLength: (gray: number) => number;
  getStrokeWidth: (gray: number) => number;
  getAlpha: (gray: number) => number;
  grayMap: Uint8Array;
  width: number;
  height: number;
  upscaleFactor: number;
  alphaFactor: number;
  progressState: { drawn: number; total: number };
  shouldCancel?: () => boolean;
  onProgress?: (progress: number, status: string) => void;
}) {
  const {
    context,
    passName,
    numStrokes,
    brightnessThreshold,
    angle,
    angleJitter,
    scumbleChance,
    getStrokeLength,
    getStrokeWidth,
    getAlpha,
    grayMap,
    width,
    height,
    upscaleFactor,
    alphaFactor,
    progressState,
    shouldCancel,
    onProgress,
  } = options;
  const HIGHLIGHT_THRESHOLD = 245;
  const UPDATE_INTERVAL = 3000;
  const totalStrokes = Math.max(1, Math.round(numStrokes));

  for (let index = 0; index < totalStrokes; index += 1) {
    if (shouldCancel?.()) {
      return false;
    }

    const x = Math.random() * width;
    const y = Math.random() * height;
    const mapIndex = Math.floor(y) * width + Math.floor(x);
    const grayValue = grayMap[mapIndex];
    progressState.drawn += 1;

    if (grayValue <= HIGHLIGHT_THRESHOLD && grayValue <= brightnessThreshold) {
      const baseAlpha = getAlpha(grayValue) * alphaFactor;
      const finalLength = getStrokeLength(grayValue) * upscaleFactor;
      const finalWidth = getStrokeWidth(grayValue) * upscaleFactor;
      if (Math.random() < scumbleChance) {
        drawCarbonScumble(
          context,
          x * upscaleFactor,
          y * upscaleFactor,
          finalLength * 0.5,
          baseAlpha,
          finalWidth,
        );
      } else {
        const strokeAngle =
          angle === "random"
            ? Math.random() * 180
            : angle + (Math.random() - 0.5) * angleJitter;
        drawCarbonHumanStroke(
          context,
          x * upscaleFactor,
          y * upscaleFactor,
          finalLength,
          strokeAngle,
          baseAlpha,
          finalWidth,
        );
      }
    }

    if (index % UPDATE_INTERVAL === 0) {
      const progress = progressState.total > 0 ? progressState.drawn / progressState.total : 0;
      onProgress?.(progress, `passata: ${passName}`);
      await yieldToUi();
    }
  }

  const progress = progressState.total > 0 ? progressState.drawn / progressState.total : 1;
  onProgress?.(progress, `passata: ${passName}`);
  return true;
}

interface CrosshatchBnResult {
  svg: GraphSvg;
  lineCount: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}

interface MatitaPoint {
  x: number;
  y: number;
}

interface MatitaQuantizedData {
  map: Uint8Array;
  width: number;
  height: number;
}

interface MatitaResult {
  svg: GraphSvg;
  pathCount: number;
  width: number;
  height: number;
}

function appendSvgCrosshatchLine(
  lines: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  thickness: number,
  alpha: number,
) {
  if (x1 === x2 && y1 === y2) {
    return;
  }
  lines.push(
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${thickness}" stroke-opacity="${alpha}" stroke-linecap="round"/>`,
  );
}

async function generateCrosshatchBnSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    levels: number;
    upscale: number;
    whiteThreshold: number;
    lineSpacing: number;
    lineThickness: number;
    lineColor: string;
    lineAlpha: number;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
): Promise<CrosshatchBnResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("2D context not available.");
  }

  const imageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const data = imageData.data;
  const levels = clamp(Math.round(options.levels), 2, 128);
  const quantizedLevelsData = new Uint8Array(sourceWidth * sourceHeight);
  const step = 256 / levels;
  for (let index = 0; index < data.length; index += 4) {
    const grayscale = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
    const levelIndex = Math.min(Math.floor(grayscale / step), levels - 1);
    quantizedLevelsData[index / 4] = levelIndex;
  }

  const upscale = clamp(Math.round(options.upscale), 1, 10);
  const outputWidth = sourceWidth * upscale;
  const outputHeight = sourceHeight * upscale;
  const lineSpacing = Math.max(1, Math.round(options.lineSpacing));
  const lineThickness = Math.max(0.1, options.lineThickness);
  const lineColor = normalizeHexColor(options.lineColor);
  const lineAlpha = clamp(options.lineAlpha, 0, 1);
  const whiteThreshold = clamp(Math.round(options.whiteThreshold), 0, 255);
  const totalAngleVariations = levels;
  const maxPerpendicularDist = Math.max(outputWidth, outputHeight) * 1.5;
  const totalLength = 2 * maxPerpendicularDist;
  const numStepsOnLine = Math.max(1, Math.floor(totalLength / Math.max(1, upscale / 2)));
  const lines: string[] = [];
  let lineCount = 0;
  let lastYieldTime = performance.now();

  for (let angleVariationIndex = 0; angleVariationIndex < totalAngleVariations; angleVariationIndex += 1) {
    if (shouldCancel?.()) {
      return null;
    }

    const angleRad =
      totalAngleVariations <= 1
        ? 0
        : (angleVariationIndex / (totalAngleVariations - 1)) * (Math.PI / 2);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    for (let p = -maxPerpendicularDist; p < maxPerpendicularDist; p += lineSpacing) {
      const centerX = outputWidth * 0.5;
      const centerY = outputHeight * 0.5;
      const lineStartX = centerX + p * sinA - maxPerpendicularDist * cosA;
      const lineStartY = centerY - p * cosA - maxPerpendicularDist * sinA;
      const lineEndX = centerX + p * sinA + maxPerpendicularDist * cosA;
      const lineEndY = centerY - p * cosA + maxPerpendicularDist * sinA;
      let activeSegment: { x1: number; y1: number; lastX: number; lastY: number } | null = null;

      for (let stepIndex = 0; stepIndex <= numStepsOnLine; stepIndex += 1) {
        const t = stepIndex / numStepsOnLine;
        const currentX = lineStartX + t * (lineEndX - lineStartX);
        const currentY = lineStartY + t * (lineEndY - lineStartY);
        const roundedCurrentX = Math.round(currentX);
        const roundedCurrentY = Math.round(currentY);
        let shouldDraw = false;

        if (
          roundedCurrentX >= 0 &&
          roundedCurrentX < outputWidth &&
          roundedCurrentY >= 0 &&
          roundedCurrentY < outputHeight
        ) {
          const originalX = Math.floor(roundedCurrentX / upscale);
          const originalY = Math.floor(roundedCurrentY / upscale);
          if (originalX >= 0 && originalX < sourceWidth && originalY >= 0 && originalY < sourceHeight) {
            const quantizedPixelIndex = originalY * sourceWidth + originalX;
            const pixelLevelIndex = quantizedLevelsData[quantizedPixelIndex];
            const pixelGrayscaleValue = Math.round(pixelLevelIndex * (255 / (levels - 1)));
            if (pixelGrayscaleValue < whiteThreshold) {
              const maxAnglesForDarkness = levels - pixelLevelIndex;
              if (angleVariationIndex < maxAnglesForDarkness) {
                shouldDraw = true;
              }
            }
          }
        }

        if (shouldDraw) {
          if (!activeSegment) {
            activeSegment = {
              x1: roundedCurrentX,
              y1: roundedCurrentY,
              lastX: roundedCurrentX,
              lastY: roundedCurrentY,
            };
          } else {
            activeSegment.lastX = roundedCurrentX;
            activeSegment.lastY = roundedCurrentY;
          }
        } else if (activeSegment) {
          appendSvgCrosshatchLine(
            lines,
            activeSegment.x1,
            activeSegment.y1,
            activeSegment.lastX,
            activeSegment.lastY,
            lineColor,
            lineThickness,
            lineAlpha,
          );
          lineCount += 1;
          activeSegment = null;
        }
      }

      if (activeSegment) {
        appendSvgCrosshatchLine(
          lines,
          activeSegment.x1,
          activeSegment.y1,
          activeSegment.lastX,
          activeSegment.lastY,
          lineColor,
          lineThickness,
          lineAlpha,
        );
        lineCount += 1;
      }

      if (performance.now() - lastYieldTime > 14) {
        await yieldToUi();
        lastYieldTime = performance.now();
        if (shouldCancel?.()) {
          return null;
        }
      }
    }

    onProgress?.(
      (angleVariationIndex + 1) / totalAngleVariations,
      `crosshatch ${Math.round(((angleVariationIndex + 1) / totalAngleVariations) * 100)}%`,
    );
    await yieldToUi();
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}"><rect width="100%" height="100%" fill="white"/>${lines.join("")}</svg>`;
  return {
    svg,
    lineCount,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
  };
}

function quantizeMatitaImage(imageData: ImageData, numLevels: number): MatitaQuantizedData {
  const { width, height, data } = imageData;
  const map = new Uint8Array(width * height);
  for (let index = 0; index < map.length; index += 1) {
    const offset = index * 4;
    const luminosity = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
    map[index] = Math.round(numLevels * (1 - luminosity / 255));
  }
  return { map, width, height };
}

function findNearestMatitaPoint(
  startX: number,
  startY: number,
  points: MatitaPoint[],
  isUsed: boolean[],
) {
  let bestIndex = -1;
  let minSqDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    if (isUsed[index]) {
      continue;
    }
    const point = points[index];
    const dx = point.x - startX;
    const dy = point.y - startY;
    const sqDistance = dx * dx + dy * dy;
    if (sqDistance < minSqDistance) {
      minSqDistance = sqDistance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function runMatitaSinglePass(level: number, quantizedData: MatitaQuantizedData) {
  const { map, width, height } = quantizedData;
  const pointsToVisit: MatitaPoint[] = [];
  const pointMap = new Map<number, number>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = y * width + x;
      if (map[id] >= level) {
        pointMap.set(id, pointsToVisit.length);
        pointsToVisit.push({ x, y });
      }
    }
  }

  if (!pointsToVisit.length) {
    return [] as MatitaPoint[][];
  }

  const isUsed = new Array(pointsToVisit.length).fill(false);
  const paths: MatitaPoint[][] = [];
  let pointsUsedCount = 0;
  let currentPointIndex = 0;
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];

  while (pointsUsedCount < pointsToVisit.length) {
    if (isUsed[currentPointIndex]) {
      currentPointIndex = isUsed.indexOf(false);
      if (currentPointIndex === -1) {
        break;
      }
    }

    const currentPath: MatitaPoint[] = [];
    let { x, y } = pointsToVisit[currentPointIndex];

    while (true) {
      currentPath.push({ x, y });
      isUsed[currentPointIndex] = true;
      pointsUsedCount += 1;

      let foundNext = false;
      for (const [dx, dy] of directions) {
        const nextX = x + dx;
        const nextY = y + dy;
        const nextId = nextY * width + nextX;
        if (!pointMap.has(nextId)) {
          continue;
        }
        const nextIndex = pointMap.get(nextId);
        if (nextIndex === undefined || isUsed[nextIndex]) {
          continue;
        }
        x = nextX;
        y = nextY;
        currentPointIndex = nextIndex;
        foundNext = true;
        break;
      }

      if (!foundNext) {
        paths.push(currentPath);
        currentPointIndex = findNearestMatitaPoint(x, y, pointsToVisit, isUsed);
        break;
      }
    }
  }

  return paths;
}

function matitaPerpendicularDistance(point: MatitaPoint, a: MatitaPoint, b: MatitaPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const px = point.x - a.x;
    const py = point.y - a.y;
    return Math.sqrt(px * px + py * py);
  }
  return Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / Math.sqrt(dx * dx + dy * dy);
}

function rdpMatita(points: MatitaPoint[], epsilon: number): MatitaPoint[] {
  if (points.length < 3) {
    return points;
  }

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i += 1) {
    const distance = matitaPerpendicularDistance(points[i], points[0], points[end]);
    if (distance > dmax) {
      index = i;
      dmax = distance;
    }
  }

  if (dmax > epsilon) {
    const recA = rdpMatita(points.slice(0, index + 1), epsilon);
    const recB = rdpMatita(points.slice(index, end + 1), epsilon);
    return recA.slice(0, recA.length - 1).concat(recB);
  }

  return [points[0], points[end]];
}

async function generateMatitaSvg(
  input: GraphImage,
  options: {
    maxWidth: number;
    iterations: number;
    simplification: number;
    lineWidth: number;
    lineColor: string;
    backgroundMode: "transparent" | "color";
    backgroundColor: string;
  },
  shouldCancel?: () => boolean,
  onProgress?: (progress: number, status: string) => void,
): Promise<MatitaResult | null> {
  const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
  const width = source.width;
  const height = source.height;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }
  const imageData = context.getImageData(0, 0, width, height);
  const totalIterations = clamp(Math.round(options.iterations), 1, 20);
  const quantizedData = quantizeMatitaImage(imageData, totalIterations);
  const allLevelPaths: MatitaPoint[][][] = [];
  let pathCount = 0;

  for (let level = 1; level <= totalIterations; level += 1) {
    if (shouldCancel?.()) {
      return null;
    }
    const passPaths = runMatitaSinglePass(level, quantizedData);
    pathCount += passPaths.length;
    allLevelPaths.push(passPaths);
    onProgress?.(level / totalIterations, `livello ${level}/${totalIterations}`);
    await yieldToUi();
  }

  const simplification = Math.max(0, options.simplification);
  const strokeWidth = Math.max(0.1, options.lineWidth);
  const strokeColor = normalizeHexColor(options.lineColor);
  const backgroundColor = normalizeHexColor(options.backgroundColor);
  let svgPaths = "";
  allLevelPaths.forEach((passPaths) => {
    const opacity = 1 / totalIterations;
    let groupPaths = "";
    passPaths.forEach((path) => {
      const simplified = simplification > 0 ? rdpMatita(path, simplification) : path;
      if (simplified.length < 2) {
        return;
      }
      const d =
        `M${simplified[0].x},${simplified[0].y} ` +
        simplified
          .slice(1)
          .map((point) => `L${point.x},${point.y}`)
          .join(" ");
      groupPaths += `<path d="${d}"/>`;
    });
    if (groupPaths) {
      svgPaths += `<g stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${opacity.toFixed(4)}" fill="none" stroke-linecap="round" stroke-linejoin="round">${groupPaths}</g>`;
    }
  });

  const backgroundRect =
    options.backgroundMode === "color"
      ? `<rect width="100%" height="100%" fill="${backgroundColor}"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${backgroundRect}${svgPaths}</svg>`;
  return { svg, pathCount, width, height };
}

async function marchingGraphImage(
  input: GraphImage,
  options: {
    levels: number;
    thresholdMin: number;
    thresholdMax: number;
    downscale: number;
    blur: number;
    simplify: number;
    highQuality: boolean;
    lineWidth: number;
    opacity: number;
    invert: boolean;
    colorMode: "gray" | "source";
  },
  shouldCancel?: () => boolean,
): Promise<MarchingResult | null> {
  const requestedScale = clamp(Math.round(options.downscale), 1, 8);
  const maxSampleSide = 96;
  const maxProcessingCells = options.highQuality ? 1400 : 900;
  const adaptiveScale = Math.max(
    requestedScale,
    Math.ceil(Math.max(input.width, input.height) / maxSampleSide),
  );
  let sampleScale = clamp(adaptiveScale, 1, 24);
  let sampledWidth = Math.max(8, Math.round(input.width / sampleScale));
  let sampledHeight = Math.max(8, Math.round(input.height / sampleScale));
  while (sampledWidth * sampledHeight > maxProcessingCells && sampleScale < 64) {
    sampleScale += 1;
    sampledWidth = Math.max(8, Math.round(input.width / sampleScale));
    sampledHeight = Math.max(8, Math.round(input.height / sampleScale));
  }
  const levels = clamp(Math.round(options.levels), 2, 8);
  const thresholdMin = clamp(options.thresholdMin, 0, 1);
  const thresholdMax = clamp(options.thresholdMax, thresholdMin, 1);
  const thresholdRange = Math.max(0.0001, thresholdMax - thresholdMin);

  const sampledCanvas = document.createElement("canvas");
  sampledCanvas.width = sampledWidth;
  sampledCanvas.height = sampledHeight;
  const sampledContext = sampledCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampledContext) {
    throw new Error("2D context not available.");
  }

  if (shouldCancel?.()) {
    return null;
  }

  sampledContext.clearRect(0, 0, sampledWidth, sampledHeight);
  sampledContext.filter = options.blur > 0 ? `blur(${options.blur}px)` : "none";
  sampledContext.drawImage(input, 0, 0, sampledWidth, sampledHeight);
  sampledContext.filter = "none";
  const imageData = sampledContext.getImageData(0, 0, sampledWidth, sampledHeight).data;

  const field: number[][] = [];
  const colorBins = Array.from({ length: levels }, () => ({
    r: 0,
    g: 0,
    b: 0,
    count: 0,
  }));

  let lastYieldTime = performance.now();
  for (let y = 0; y < sampledHeight; y += 1) {
    if (shouldCancel?.()) {
      return null;
    }

    const row: number[] = [];
    for (let x = 0; x < sampledWidth; x += 1) {
      const offset = (y * sampledWidth + x) * 4;
      const r = imageData[offset];
      const g = imageData[offset + 1];
      const b = imageData[offset + 2];
      const a = imageData[offset + 3] / 255;
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const tone = clamp(options.invert ? 1 - luminance * a : luminance * a, 0, 1);
      row.push(tone);

      const normalized = clamp((tone - thresholdMin) / thresholdRange, 0, 1);
      const binIndex = clamp(Math.round(normalized * (levels - 1)), 0, levels - 1);
      const bin = colorBins[binIndex];
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.count += 1;
    }
    field.push(row);

    if (performance.now() - lastYieldTime > 12) {
      await yieldToUi();
      if (shouldCancel?.()) {
        return null;
      }
      lastYieldTime = performance.now();
    }
  }

  const marchingSquares = getMarchingSquares();
  const simplifyFn = getSimplify();
  const outputDocument = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
  const outputRoot = outputDocument.documentElement as unknown as SVGSVGElement;
  outputRoot.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  outputRoot.setAttribute("width", String(input.width));
  outputRoot.setAttribute("height", String(input.height));
  outputRoot.setAttribute("viewBox", `0 0 ${input.width} ${input.height}`);
  outputRoot.setAttribute("fill", "none");

  let pathCount = 0;
  for (let index = 0; index < levels; index += 1) {
    if (shouldCancel?.()) {
      return null;
    }

    const t = thresholdMin + (thresholdRange * index) / Math.max(1, levels - 1);
    const segments = marchingSquares(field, t);
    if (!segments.length) {
      continue;
    }

    const polylines = stitchMarchingSegments(segments, sampleScale).map((polyline) => {
      if (options.simplify > 0 && polyline.length > 2) {
        return simplifyFn(polyline, options.simplify, options.highQuality);
      }
      return polyline;
    });

    const pathD = polylines
      .filter((polyline) => polyline.length >= 2)
      .map((polyline) => buildPolylinePath(polyline, 2, false))
      .join(" ");
    if (!pathD) {
      continue;
    }

    const bin = colorBins[index];
    const sourceColor =
      bin.count > 0
        ? `#${toHexColorChannel(bin.r / bin.count)}${toHexColorChannel(bin.g / bin.count)}${toHexColorChannel(bin.b / bin.count)}`
        : null;
    const gray = clamp(Math.round((options.invert ? 1 - t : t) * 255), 0, 255);
    const grayColor = `#${toHexColorChannel(gray)}${toHexColorChannel(gray)}${toHexColorChannel(gray)}`;

    const path = outputDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.setAttribute("stroke", options.colorMode === "source" ? (sourceColor ?? grayColor) : grayColor);
    path.setAttribute("stroke-opacity", String(clamp(options.opacity, 0, 1)));
    path.setAttribute("stroke-width", String(Math.max(0.1, options.lineWidth)));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    outputRoot.appendChild(path);
    pathCount += 1;

    if (performance.now() - lastYieldTime > 12) {
      await yieldToUi();
      if (shouldCancel?.()) {
        return null;
      }
      lastYieldTime = performance.now();
    }
  }

  return {
    svg: new XMLSerializer().serializeToString(outputRoot),
    pathCount,
    sampledWidth,
    sampledHeight,
  };
}

function paletteBufferToHexColors(buffer: ArrayBuffer) {
  const palette = new Uint32Array(buffer);
  return Array.from(palette, (value) => {
    const r = value & 0xff;
    const g = (value >>> 8) & 0xff;
    const b = (value >>> 16) & 0xff;
    const a = (value >>> 24) & 0xff;
    return `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}${a
      .toString(16)
      .padStart(2, "0")}`;
  });
}

function drawPalettePreview(
  context: CanvasRenderingContext2D,
  node: PreviewAwareNode,
  palette: GraphPalette | null,
  footerText?: string,
) {
  const swatches = palette ?? [];
  const columns = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(Math.max(swatches.length, 1)))));
  const rows = Math.max(1, Math.ceil(Math.max(swatches.length, 1) / columns));
  const padding = 10;
  const headerHeight = 34 + (node.widgets?.length ?? 0) * 28;
  const swatchGap = 4;
  const swatchWidth = 30;
  const swatchHeight = 24;
  const previewWidth = columns * swatchWidth + (columns - 1) * swatchGap;
  const previewHeight = rows * swatchHeight + (rows - 1) * swatchGap;
  const footerLines = footerText ? 1 : 0;
  node.size = [
    previewWidth + padding * 2,
    headerHeight + previewHeight + padding * 2 + footerLines * 18,
  ];

  context.save();
  context.fillStyle = "#161616";
  context.fillRect(padding, headerHeight, previewWidth, previewHeight);

  if (!swatches.length) {
    context.fillStyle = "rgba(255,255,255,0.45)";
    context.font = "12px sans-serif";
    context.fillText("No palette", padding + 10, headerHeight + 20);
  } else {
    swatches.forEach((color, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (swatchWidth + swatchGap);
      const y = headerHeight + row * (swatchHeight + swatchGap);
      context.fillStyle = color;
      context.fillRect(x, y, swatchWidth, swatchHeight);
      context.strokeStyle = "rgba(255,255,255,0.18)";
      context.strokeRect(x + 0.5, y + 0.5, swatchWidth - 1, swatchHeight - 1);
    });
  }

  if (footerText) {
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(footerText, 10, headerHeight + previewHeight + padding + 12);
  }
  context.restore();
}

function downloadGraphPalette(palette: GraphPalette, filename: string) {
  const blob = new Blob([JSON.stringify(palette, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadGraphJsonData(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getSerializedImageFromConfig(data: Record<string, unknown>) {
  if (typeof data.serializedImage === "string") {
    return data.serializedImage;
  }

  const properties =
    data.properties && typeof data.properties === "object"
      ? (data.properties as Record<string, unknown>)
      : null;

  return typeof properties?.serializedImage === "string" ? properties.serializedImage : null;
}

class InputImageNode {
  image: GraphImage | null = null;
  fileInput!: HTMLInputElement;
  size: [number, number] = [280, 280];
  objectUrl: string | null = null;
  serializedImage: string | null = null;
  infoText = "no image";

  constructor() {
    const node = this as unknown as PreviewAwareNode & InputImageNode;
    node.title = "INPUT";
    node.properties = {};
    node.addOutput("image", "image");
    node.addWidget("button", "Load image", null, () => {
      node.fileInput.click();
    });

    node.fileInput = document.createElement("input");
    node.fileInput.type = "file";
    node.fileInput.accept = "image/*";
    node.fileInput.style.display = "none";
    node.fileInput.addEventListener("change", () => {
      const file = node.fileInput.files?.[0];
      if (!file) {
        return;
      }
      node.loadImageFile(file);
    });

    node.refreshPreviewLayout = () => {
      refreshNode(node, node.image, 1);
    };

    document.body.appendChild(node.fileInput);
    node.refreshPreviewLayout();
  }

  loadImageFile(this: PreviewAwareNode & InputImageNode, file: File) {
    if (!file.type.startsWith("image/")) {
      return;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    this.objectUrl = objectUrl;
    image.onload = () => {
      this.image = drawSourceToCanvas(image);
      this.serializedImage = serializeCompressedGraphImage(this.image);
      this.infoText = formatGraphImageInfo(this.image);
      this.refreshPreviewLayout();
      notifyGraphStateChange(this);
      URL.revokeObjectURL(objectUrl);
      if (this.objectUrl === objectUrl) {
        this.objectUrl = null;
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (this.objectUrl === objectUrl) {
        this.objectUrl = null;
      }
    };
    image.src = objectUrl;
  }

  onDropFile(this: PreviewAwareNode & InputImageNode, file: File) {
    this.loadImageFile(file);
  }

  onSerialize(this: InputImageNode, data: Record<string, unknown>) {
    data.serializedImage = this.image
      ? serializeCompressedGraphImage(this.image)
      : this.serializedImage;
  }

  onConfigure(this: PreviewAwareNode & InputImageNode, data: Record<string, unknown>) {
    const serializedImage = getSerializedImageFromConfig(data);
    this.serializedImage = serializedImage;

    if (!serializedImage) {
      this.image = null;
      this.infoText = "no image";
      this.refreshPreviewLayout();
      return;
    }

    void deserializeGraphImage(serializedImage)
      .then((image) => {
        this.image = image;
        this.serializedImage = serializedImage;
        this.infoText = formatGraphImageInfo(this.image);
        this.refreshPreviewLayout();
        notifyGraphStateChange(this);
      })
      .catch(() => {
        this.image = null;
        this.serializedImage = null;
        this.infoText = "no image";
        this.refreshPreviewLayout();
      });
  }

  onExecute(this: LiteNode & InputImageNode) {
    this.setOutputData(0, this.image);
  }

  onDrawBackground(this: PreviewAwareNode & InputImageNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.image, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(this.infoText, 10, layout.footerTop + 12);
    context.restore();
  }

  onRemoved(this: InputImageNode) {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.fileInput.remove();
  }
}

class WebcamImageNode {
  image: GraphImage | null = null;
  stream: MediaStream | null = null;
  video!: HTMLVideoElement;
  animationFrameId: number | null = null;
  size: [number, number] = [280, 300];
  serializedImage: string | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & WebcamImageNode;
    node.title = "WEBCAM";
    node.properties = {
      status: "requesting camera",
    };
    node.addOutput("image", "image");
    node.addWidget("button", "Grab", null, () => {
      if (node.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        node.image = drawSourceToCanvas(node.video);
        node.serializedImage = null;
        node.properties.status = "frame captured";
        node.refreshPreviewLayout();
        notifyGraphStateChange(node);
      }
    });

    node.video = document.createElement("video");
    node.video.autoplay = true;
    node.video.muted = true;
    node.video.playsInline = true;
    node.video.addEventListener("loadedmetadata", () => {
      node.properties.status = "camera live";
      node.refreshPreviewLayout();
      node.startPreviewLoop();
    });
    node.video.addEventListener("playing", () => {
      node.properties.status = "camera live";
      node.startPreviewLoop();
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.video.readyState >= HTMLMediaElement.HAVE_METADATA ? node.video : null, 1);
    };
    void node.startCamera();
  }

  async startCamera(this: PreviewAwareNode & WebcamImageNode) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.properties.status = "camera live";
      this.refreshPreviewLayout();
    } catch {
      this.properties.status = "camera denied";
      this.refreshPreviewLayout();
    }
  }

  startPreviewLoop(this: PreviewAwareNode & WebcamImageNode) {
    if (this.animationFrameId !== null) {
      return;
    }

    const tick = () => {
      this.animationFrameId = window.requestAnimationFrame(tick);
      if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.setDirtyCanvas(true, true);
      }
    };

    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  onExecute(this: PreviewAwareNode & WebcamImageNode) {
    this.setOutputData(0, this.image);
  }

  onSerialize(this: WebcamImageNode, data: Record<string, unknown>) {
    data.serializedImage = this.image
      ? serializeCompressedGraphImage(this.image)
      : this.serializedImage;
  }

  onConfigure(this: PreviewAwareNode & WebcamImageNode, data: Record<string, unknown>) {
    const serializedImage = getSerializedImageFromConfig(data);
    this.serializedImage = serializedImage;

    if (!serializedImage) {
      this.image = null;
      this.refreshPreviewLayout();
      return;
    }

    void deserializeGraphImage(serializedImage)
      .then((image) => {
        this.image = image;
        this.serializedImage = serializedImage;
        this.properties.status = "frame restored";
        this.refreshPreviewLayout();
        notifyGraphStateChange(this);
      })
      .catch(() => {
        this.image = null;
        this.serializedImage = null;
        this.refreshPreviewLayout();
      });
  }

  onDrawBackground(this: PreviewAwareNode & WebcamImageNode, context: CanvasRenderingContext2D) {
    const liveSource =
      this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? this.video : null;
    const layout = drawImagePreview(context, this, liveSource, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(String(this.properties.status ?? ""), 10, layout.footerTop + 12);
    context.restore();
  }

  onRemoved(this: WebcamImageNode) {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}

class InvertToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 280];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & InvertToolNode;
    node.title = createToolTitle("Invert");
    node.properties = {};
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    getImageTracer();
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & InvertToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = "invert";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = invertGraphImage(input);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & InvertToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

class GrayscaleToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 280];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & GrayscaleToolNode;
    node.title = createToolTitle("Grayscale");
    node.properties = {};
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GrayscaleToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = "grayscale";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = grayscaleGraphImage(input);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GrayscaleToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

class ThresholdToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & ThresholdToolNode;
    node.title = createToolTitle("Threshold");
    node.properties = { threshold: 128 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Threshold",
      128,
      (value) => {
        node.properties.threshold = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 255, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & ThresholdToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const threshold = Number(this.properties.threshold ?? 128);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `threshold:${Math.round(threshold)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = thresholdGraphImage(input, threshold);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & ThresholdToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

class BlurToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & BlurToolNode;
    node.title = createToolTitle("Blur");
    node.properties = { radius: 4 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Radius",
      4,
      (value) => {
        node.properties.radius = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 24, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & BlurToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const radius = Number(this.properties.radius ?? 4);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `radius:${Math.round(radius)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = blurGraphImage(input, radius);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BlurToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

class SharpenToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & SharpenToolNode;
    node.title = createToolTitle("Sharpen");
    node.properties = {
      preset: "classic",
      amount: 1,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Preset",
      "classic",
      (value) => {
        node.properties.preset = String(value);
        notifyGraphStateChange(node);
      },
      { values: ["classic", "strong", "edge"] },
    );
    node.addWidget(
      "slider",
      "Amount",
      1,
      (value) => {
        node.properties.amount = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.5, max: 3, step: 0.1, precision: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & SharpenToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const preset = String(this.properties.preset ?? "classic");
    const amount = clamp(Number(this.properties.amount ?? 1), 0.5, 3);
    const signature = getGraphImageSignature(input);
    const optionsSignature = `preset:${preset}|amount:${amount.toFixed(2)}`;
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const kernels: Record<string, number[]> = {
      classic: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      strong: [-1, -1, -1, -1, 9, -1, -1, -1, -1],
      edge: [1, -2, 1, -2, 5, -2, 1, -2, 1],
    };
    const baseKernel = kernels[preset] ?? kernels.classic;
    const kernel = baseKernel.map((value, index) => (index === 4 ? 1 + (value - 1) * amount : value * amount));
    this.preview = convolveImage3x3(input, kernel, 1, 0);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SharpenToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const preset = String(this.properties.preset ?? "classic");
    const amount = Number(this.properties.amount ?? 1);
    context.fillText(`preset:${preset} | amount:${amount.toFixed(1)}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class SobelToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 400];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & SobelToolNode;
    node.title = createToolTitle("Sobel");
    node.properties = {
      mode: "magnitude",
      threshold: 80,
      invert: false,
      strength: 1,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Mode",
      "magnitude",
      (value) => {
        node.properties.mode = String(value);
        notifyGraphStateChange(node);
      },
      { values: ["magnitude", "horizontal", "vertical", "threshold"] },
    );
    node.addWidget(
      "slider",
      "Threshold",
      80,
      (value) => {
        node.properties.threshold = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 255, step: 1 },
    );
    node.addWidget("toggle", "Invert", false, (value) => {
      node.properties.invert = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget(
      "slider",
      "Strength",
      1,
      (value) => {
        node.properties.strength = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.5, max: 6, step: 0.1, precision: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & SobelToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const mode = String(this.properties.mode ?? "magnitude") as "magnitude" | "horizontal" | "vertical" | "threshold";
    const threshold = Number(this.properties.threshold ?? 80);
    const invert = Boolean(this.properties.invert ?? false);
    const strength = Number(this.properties.strength ?? 1);
    const signature = getGraphImageSignature(input);
    const optionsSignature = `mode:${mode}|thr:${Math.round(threshold)}|inv:${invert ? 1 : 0}|str:${strength.toFixed(2)}`;
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = sobelGraphImage(input, { mode, threshold, invert, strength });
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SobelToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const mode = String(this.properties.mode ?? "magnitude");
    const threshold = Math.round(Number(this.properties.threshold ?? 80));
    context.fillText(`mode:${mode} | thr:${threshold}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class ScaleToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & ScaleToolNode;
    node.title = createToolTitle("Scale");
    node.properties = { percent: 100 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Scale %",
      100,
      (value) => {
        node.properties.percent = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 400, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & ScaleToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const percent = Number(this.properties.percent ?? 100);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `percent:${Math.round(percent)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = scaleGraphImage(input, percent);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & ScaleToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      this.preview ? `${this.preview.width}x${this.preview.height}` : "no output",
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class RotateToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & RotateToolNode;
    node.title = createToolTitle("Rotate");
    node.properties = { angle: 0 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Angle",
      0,
      (value) => {
        node.properties.angle = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -180, max: 180, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RotateToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const angle = Number(this.properties.angle ?? 0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `angle:${Math.round(angle)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = rotateGraphImage(input, angle);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RotateToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${Number(this.properties.angle ?? 0).toFixed(0)} deg`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class RotatePanZoomToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 440];
  preview: GraphImage | null = null;
  birdEyeImage: GraphImage | null = null;
  cropRect: CropRect | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & RotatePanZoomToolNode;
    node.title = createToolTitle("RotatePanZoom");
    node.properties = {
      rotation: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      cropPercent: 70,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Rotation",
      0,
      (value) => {
        node.properties.rotation = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -180, max: 180, step: 1 },
    );
    node.addWidget(
      "slider",
      "Zoom",
      1,
      (value) => {
        node.properties.zoom = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.2, max: 5, step: 0.05, precision: 2 },
    );
    node.addWidget(
      "slider",
      "Pan X",
      0,
      (value) => {
        node.properties.panX = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.addWidget(
      "slider",
      "Pan Y",
      0,
      (value) => {
        node.properties.panY = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.addWidget(
      "slider",
      "Crop %",
      70,
      (value) => {
        node.properties.cropPercent = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 10, max: 100, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RotatePanZoomToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.birdEyeImage = null;
      this.cropRect = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const rotation = Number(this.properties.rotation ?? 0);
    const zoom = clamp(Number(this.properties.zoom ?? 1), 0.2, 5);
    const panX = clamp(Number(this.properties.panX ?? 0), -100, 100);
    const panY = clamp(Number(this.properties.panY ?? 0), -100, 100);
    const cropPercent = clamp(Number(this.properties.cropPercent ?? 70), 10, 100);
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify({
      rotation: Math.round(rotation),
      zoom: Number(zoom.toFixed(3)),
      panX: Math.round(panX),
      panY: Math.round(panY),
      cropPercent: Math.round(cropPercent),
    });
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const width = input.width;
    const height = input.height;
    const transformed = document.createElement("canvas");
    transformed.width = width;
    transformed.height = height;
    const transformedContext = transformed.getContext("2d");
    if (!transformedContext) {
      this.preview = null;
      this.birdEyeImage = null;
      this.cropRect = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    transformedContext.save();
    transformedContext.translate(width / 2, height / 2);
    transformedContext.rotate((rotation * Math.PI) / 180);
    transformedContext.scale(zoom, zoom);
    transformedContext.drawImage(input, -width / 2, -height / 2, width, height);
    transformedContext.restore();

    const cropWidth = clamp(Math.round(width * (cropPercent / 100)), 1, width);
    const cropHeight = clamp(Math.round(height * (cropPercent / 100)), 1, height);
    const maxOffsetX = Math.max(0, (width - cropWidth) / 2);
    const maxOffsetY = Math.max(0, (height - cropHeight) / 2);
    const centerX = width / 2 + (panX / 100) * maxOffsetX;
    const centerY = height / 2 + (panY / 100) * maxOffsetY;
    const cropX = clamp(Math.round(centerX - cropWidth / 2), 0, width - cropWidth);
    const cropY = clamp(Math.round(centerY - cropHeight / 2), 0, height - cropHeight);

    const cropped = document.createElement("canvas");
    cropped.width = cropWidth;
    cropped.height = cropHeight;
    const croppedContext = cropped.getContext("2d");
    if (!croppedContext) {
      this.preview = null;
      this.birdEyeImage = null;
      this.cropRect = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    croppedContext.drawImage(transformed, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    this.preview = cropped;
    this.birdEyeImage = transformed;
    this.cropRect = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RotatePanZoomToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    if (this.birdEyeImage && this.cropRect) {
      const panelWidth = Math.max(60, Math.min(110, layout.previewWidth * 0.34));
      const panelHeight = Math.max(60, Math.min(110, layout.previewHeight * 0.34));
      const panelX = layout.padding + layout.previewWidth - panelWidth - 8;
      const panelY = layout.previewTop + 8;
      context.save();
      context.fillStyle = "rgba(10,10,10,0.72)";
      context.fillRect(panelX, panelY, panelWidth, panelHeight);
      context.drawImage(this.birdEyeImage, panelX, panelY, panelWidth, panelHeight);
      context.strokeStyle = "rgba(255,255,255,0.2)";
      context.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);

      const scaleX = panelWidth / this.birdEyeImage.width;
      const scaleY = panelHeight / this.birdEyeImage.height;
      context.strokeStyle = "rgba(255, 173, 92, 0.96)";
      context.lineWidth = 1.2;
      context.strokeRect(
        panelX + this.cropRect.x * scaleX + 0.5,
        panelY + this.cropRect.y * scaleY + 0.5,
        Math.max(1, this.cropRect.width * scaleX - 1),
        Math.max(1, this.cropRect.height * scaleY - 1),
      );
      context.restore();
    }

    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const rotation = Math.round(Number(this.properties.rotation ?? 0));
    const zoom = Number(this.properties.zoom ?? 1);
    const panX = Math.round(Number(this.properties.panX ?? 0));
    const panY = Math.round(Number(this.properties.panY ?? 0));
    context.fillText(`rot:${rotation}deg | zoom:${zoom.toFixed(2)} | pan:${panX},${panY}`, 10, layout.footerTop + 12);
    context.fillText(
      this.preview ? `crop:${this.preview.width}x${this.preview.height}` : "no output",
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

class BrightnessContrastToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & BrightnessContrastToolNode;
    node.title = createToolTitle("Brightness/Contrast");
    node.properties = { brightness: 0, contrast: 0, saturation: 0 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Brightness",
      0,
      (value) => {
        node.properties.brightness = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.addWidget(
      "slider",
      "Contrast",
      0,
      (value) => {
        node.properties.contrast = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.addWidget(
      "slider",
      "Saturation",
      0,
      (value) => {
        node.properties.saturation = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & BrightnessContrastToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const brightness = Number(this.properties.brightness ?? 0);
    const contrast = Number(this.properties.contrast ?? 0);
    const saturation = Number(this.properties.saturation ?? 0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `b:${Math.round(brightness)}|c:${Math.round(contrast)}|s:${Math.round(saturation)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = brightnessContrastGraphImage(input, brightness, contrast, saturation);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BrightnessContrastToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `B ${Number(this.properties.brightness ?? 0)} | C ${Number(this.properties.contrast ?? 0)} | S ${Number(this.properties.saturation ?? 0)}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class HistogramToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;
  channels: HistogramChannel[] = [];
  maxCount = 0;
  pixelCount = 0;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & HistogramToolNode;
    node.title = createToolTitle("Histogram");
    node.properties = { mode: "rgb" as HistogramMode };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Type",
      "rgb",
      (value) => {
        const mode = String(value) as HistogramMode;
        node.properties.mode = mode;
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { values: ["rgb", "hsv", "grayscale"] },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & HistogramToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    this.preview = input ?? null;
    this.setOutputData(0, input ?? null);
    if (!input) {
      this.channels = [];
      this.maxCount = 0;
      this.pixelCount = 0;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.refreshPreviewLayout();
      return;
    }

    const mode = String(this.properties.mode ?? "rgb") as HistogramMode;
    const signature = getGraphImageSignature(input);
    const optionsSignature = `mode:${mode}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.refreshPreviewLayout();
      return;
    }
    const histogram = buildHistogram(input, mode);
    this.channels = histogram.channels;
    this.maxCount = histogram.maxCount;
    this.pixelCount = histogram.pixelCount;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & HistogramToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    if (this.channels.length && this.maxCount > 0) {
      const left = layout.padding + 8;
      const top = layout.previewTop + 8;
      const width = layout.previewWidth - 16;
      const height = layout.previewHeight - 16;

      context.save();
      context.fillStyle = "rgba(8,8,8,0.55)";
      context.fillRect(left, top, width, height);
      context.strokeStyle = "rgba(255,255,255,0.12)";
      context.lineWidth = 1;
      context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);

      this.channels.forEach((channel) => {
        context.beginPath();
        context.lineWidth = 1.5;
        context.strokeStyle = channel.color;
        for (let index = 0; index < 256; index += 1) {
          const x = left + (index / 255) * width;
          const normalized = channel.values[index] / this.maxCount;
          const y = top + height - normalized * height;
          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        context.stroke();
      });
      context.restore();
    }

    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const mode = String(this.properties.mode ?? "rgb");
    context.fillText(`mode: ${mode} | pixels: ${this.pixelCount}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class LevelsToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 430];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & LevelsToolNode;
    node.title = createToolTitle("Levels");
    node.properties = {
      mode: "rgb" as LevelsMode,
      inBlack: 0,
      inWhite: 255,
      gamma: 1,
      outBlack: 0,
      outWhite: 255,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Type",
      "rgb",
      (value) => {
        node.properties.mode = String(value) as LevelsMode;
        notifyGraphStateChange(node);
      },
      { values: ["rgb", "hsv", "gray", "alpha"] },
    );
    node.addWidget(
      "slider",
      "In Black",
      0,
      (value) => {
        node.properties.inBlack = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 254, step: 1 },
    );
    node.addWidget(
      "slider",
      "In White",
      255,
      (value) => {
        node.properties.inWhite = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 255, step: 1 },
    );
    node.addWidget(
      "slider",
      "Gamma",
      1,
      (value) => {
        node.properties.gamma = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.1, max: 5, step: 0.01, precision: 2 },
    );
    node.addWidget(
      "slider",
      "Out Black",
      0,
      (value) => {
        node.properties.outBlack = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 254, step: 1 },
    );
    node.addWidget(
      "slider",
      "Out White",
      255,
      (value) => {
        node.properties.outWhite = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 255, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & LevelsToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const mode = String(this.properties.mode ?? "rgb") as LevelsMode;
    const inBlack = Number(this.properties.inBlack ?? 0);
    const inWhite = Number(this.properties.inWhite ?? 255);
    const gamma = Number(this.properties.gamma ?? 1);
    const outBlack = Number(this.properties.outBlack ?? 0);
    const outWhite = Number(this.properties.outWhite ?? 255);
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify({
      mode,
      inBlack: Math.round(inBlack),
      inWhite: Math.round(inWhite),
      gamma: Number(gamma.toFixed(3)),
      outBlack: Math.round(outBlack),
      outWhite: Math.round(outWhite),
    });
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const sourceContext = input.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const imageData = sourceContext.getImageData(0, 0, input.width, input.height);
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      if (mode === "rgb") {
        data[index] = applyLevelsValue(r, inBlack, inWhite, gamma, outBlack, outWhite);
        data[index + 1] = applyLevelsValue(g, inBlack, inWhite, gamma, outBlack, outWhite);
        data[index + 2] = applyLevelsValue(b, inBlack, inWhite, gamma, outBlack, outWhite);
      } else if (mode === "hsv") {
        const hsv = rgbToHsv255(r, g, b);
        const adjustedValue = applyLevelsValue(hsv.v, inBlack, inWhite, gamma, outBlack, outWhite);
        const rgb = hsv255ToRgb(hsv.h, hsv.s, adjustedValue);
        data[index] = rgb.r;
        data[index + 1] = rgb.g;
        data[index + 2] = rgb.b;
      } else if (mode === "gray") {
        const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        const gray = applyLevelsValue(luminance, inBlack, inWhite, gamma, outBlack, outWhite);
        data[index] = gray;
        data[index + 1] = gray;
        data[index + 2] = gray;
      } else if (mode === "alpha") {
        data[index + 3] = applyLevelsValue(a, inBlack, inWhite, gamma, outBlack, outWhite);
      }
    }

    const output = document.createElement("canvas");
    output.width = input.width;
    output.height = input.height;
    const outputContext = output.getContext("2d");
    if (!outputContext) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    outputContext.putImageData(imageData, 0, 0);
    this.preview = output;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & LevelsToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const mode = String(this.properties.mode ?? "rgb");
    const inBlack = Number(this.properties.inBlack ?? 0);
    const inWhite = Number(this.properties.inWhite ?? 255);
    const gamma = Number(this.properties.gamma ?? 1);
    context.fillText(
      `mode:${mode} | in:${Math.round(inBlack)}-${Math.round(inWhite)} | g:${gamma.toFixed(2)}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class RgbSplitToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;
  r: GraphImage | null = null;
  g: GraphImage | null = null;
  b: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & RgbSplitToolNode;
    node.title = createToolTitle("RGB Split");
    node.properties = {};
    node.addInput("image", "image");
    node.addOutput("R", "image");
    node.addOutput("G", "image");
    node.addOutput("B", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RgbSplitToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.r = null;
      this.g = null;
      this.b = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.setOutputData(2, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = "rgb-split";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.r);
      this.setOutputData(1, this.g);
      this.setOutputData(2, this.b);
      this.refreshPreviewLayout();
      return;
    }

    const result = splitRgbChannels(input);
    this.r = result.r;
    this.g = result.g;
    this.b = result.b;
    this.preview = result.r;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.r);
    this.setOutputData(1, this.g);
    this.setOutputData(2, this.b);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RgbSplitToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText("outputs: R, G, B", 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class CmykSplitToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;
  c: GraphImage | null = null;
  m: GraphImage | null = null;
  y: GraphImage | null = null;
  k: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & CmykSplitToolNode;
    node.title = createToolTitle("CMYK Split");
    node.properties = {};
    node.addInput("image", "image");
    node.addOutput("C", "image");
    node.addOutput("M", "image");
    node.addOutput("Y", "image");
    node.addOutput("K", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & CmykSplitToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.c = null;
      this.m = null;
      this.y = null;
      this.k = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.setOutputData(2, null);
      this.setOutputData(3, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = "cmyk-split";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.c);
      this.setOutputData(1, this.m);
      this.setOutputData(2, this.y);
      this.setOutputData(3, this.k);
      this.refreshPreviewLayout();
      return;
    }

    const result = splitCmykChannels(input);
    this.c = result.c;
    this.m = result.m;
    this.y = result.y;
    this.k = result.k;
    this.preview = result.k;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.c);
    this.setOutputData(1, this.m);
    this.setOutputData(2, this.y);
    this.setOutputData(3, this.k);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & CmykSplitToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText("outputs: C, M, Y, K", 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class RgbCombineToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & RgbCombineToolNode;
    node.title = createToolTitle("RGB Combine");
    node.properties = {};
    node.addInput("R", "image");
    node.addInput("G", "image");
    node.addInput("B", "image");
    node.addOutput("image", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RgbCombineToolNode) {
    const start = performance.now();
    const r = this.getInputData(0);
    const g = this.getInputData(1);
    const b = this.getInputData(2);
    if (!r || !g || !b) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = `${getGraphImageSignature(r)}|${getGraphImageSignature(g)}|${getGraphImageSignature(b)}`;
    const optionsSignature = "rgb-combine";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = combineRgbChannels(r, g, b);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RgbCombineToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText("inputs: R, G, B", 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class CmykCombineToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 340];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & CmykCombineToolNode;
    node.title = createToolTitle("CMYK Combine");
    node.properties = {};
    node.addInput("C", "image");
    node.addInput("M", "image");
    node.addInput("Y", "image");
    node.addInput("K", "image");
    node.addOutput("image", "image");
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & CmykCombineToolNode) {
    const start = performance.now();
    const c = this.getInputData(0);
    const m = this.getInputData(1);
    const y = this.getInputData(2);
    const k = this.getInputData(3);
    if (!c || !m || !y || !k) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = `${getGraphImageSignature(c)}|${getGraphImageSignature(m)}|${getGraphImageSignature(y)}|${getGraphImageSignature(k)}`;
    const optionsSignature = "cmyk-combine";
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = combineCmykChannels(c, m, y, k);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & CmykCombineToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText("inputs: C, M, Y, K", 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class QuantizeToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;
  palette: GraphPalette | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  isRendering = false;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & QuantizeToolNode;
    getPnnQuant();
    node.title = createToolTitle("Quantize");
    node.properties = {
      colors: 16,
      dithering: true,
      weight: 0.55,
      alphaThreshold: 15,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("palette", "palette");
    node.addWidget(
      "slider",
      "Colors",
      16,
      (value) => {
        node.properties.colors = Math.round(Number(value));
        notifyGraphStateChange(node);
      },
      { min: 2, max: 256, step: 1 },
    );
    node.addWidget("toggle", "Dither", true, (value) => {
      node.properties.dithering = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget(
      "slider",
      "Weight",
      0.55,
      (value) => {
        node.properties.weight = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.001, max: 1, step: 0.001, precision: 3 },
    );
    node.addWidget(
      "slider",
      "Alpha thr",
      15,
      (value) => {
        node.properties.alphaThreshold = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 255, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  getQuantizeOptions(this: PreviewAwareNode & QuantizeToolNode, input: GraphImage): PnnQuantOptions {
    return {
      pixels: graphImageToUint32Array(input),
      width: input.width,
      height: input.height,
      colors: clamp(Math.round(Number(this.properties.colors ?? 16)), 2, 256),
      dithering: Boolean(this.properties.dithering ?? true),
      alphaThreshold: clamp(Number(this.properties.alphaThreshold ?? 15), 0, 255),
      weight: Number(this.properties.weight ?? 0.55),
    };
  }

  onExecute(this: PreviewAwareNode & QuantizeToolNode) {
    const start = performance.now();
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.palette = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.executionMs = performance.now() - start;
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getQuantizeOptions(input);
    const optionsSignature = JSON.stringify({
      colors: options.colors,
      dithering: options.dithering,
      alphaThreshold: options.alphaThreshold,
      weight: options.weight,
    });

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      this.isRendering = true;
      const PnnQuant = getPnnQuant();
      const quantizer = new PnnQuant(options);
      const renderToken = ++this.renderToken;

      void quantizer
        .getResult()
        .then((result: PnnQuantResult) => {
          if (renderToken !== this.renderToken) {
            return;
          }

          if (result.img8) {
            this.preview = uint32ArrayToGraphImage(result.img8, {
              width: input.width,
              height: input.height,
            });
            this.palette = result.pal8 ? paletteBufferToHexColors(result.pal8) : null;
            this.isRendering = false;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          }
        })
        .catch(() => {
          if (renderToken !== this.renderToken) {
            return;
          }

          this.preview = null;
          this.palette = null;
          this.isRendering = false;
          this.executionMs = null;
          this.lastSignature = "";
          this.lastOptionsSignature = "";
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.palette);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & QuantizeToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`palette: ${this.palette?.length ?? 0} colors`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }

  onSerialize(this: QuantizeToolNode, data: Record<string, unknown>) {
    data.palette = this.palette;
  }

  onConfigure(this: PreviewAwareNode & QuantizeToolNode, data: Record<string, unknown>) {
    this.palette = Array.isArray(data.palette)
      ? data.palette.filter((item): item is string => typeof item === "string")
      : null;
    this.refreshPreviewLayout();
  }
}

class BlendToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & BlendToolNode;
    node.title = createToolTitle("Blend");
    node.properties = {
      mode: "normal",
      alpha: 0.5,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
    node.addInput("base", "image");
    node.addInput("layer", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "combo",
      "Mode",
      "normal",
      (value) => {
        node.properties.mode = String(value);
        notifyGraphStateChange(node);
      },
      {
        values: ["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference"],
      },
    );
    node.addWidget(
      "slider",
      "Alpha",
      0.5,
      (value) => {
        node.properties.alpha = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0, max: 1, step: 0.05, precision: 2 },
    );
    node.addWidget(
      "slider",
      "Offset X",
      0,
      (value) => {
        node.properties.offsetX = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -4096, max: 4096, step: 1 },
    );
    node.addWidget(
      "slider",
      "Offset Y",
      0,
      (value) => {
        node.properties.offsetY = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -4096, max: 4096, step: 1 },
    );
    node.addWidget(
      "slider",
      "Scale",
      1,
      (value) => {
        node.properties.scale = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.1, max: 4, step: 0.05, precision: 2 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & BlendToolNode) {
    const start = performance.now();
    const baseImage = this.getInputData(0);
    const layerImage = this.getInputData(1);

    if (!baseImage) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    if (!layerImage) {
      this.preview = baseImage;
      this.executionMs = performance.now() - start;
      this.setOutputData(0, baseImage);
      this.refreshPreviewLayout();
      return;
    }

    const signature = `${getGraphImageSignature(baseImage)}|${getGraphImageSignature(layerImage)}`;
    const optionsSignature = JSON.stringify({
      mode: String(this.properties.mode ?? "normal"),
      alpha: Number(this.properties.alpha ?? 0.5).toFixed(3),
      offsetX: Math.round(Number(this.properties.offsetX ?? 0)),
      offsetY: Math.round(Number(this.properties.offsetY ?? 0)),
      scale: Number(this.properties.scale ?? 1).toFixed(3),
    });
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    this.preview = blendGraphImages(baseImage, layerImage, {
      alpha: Number(this.properties.alpha ?? 0.5),
      mode: String(this.properties.mode ?? "normal") as BlendMode,
      offsetX: Number(this.properties.offsetX ?? 0),
      offsetY: Number(this.properties.offsetY ?? 0),
      scale: Number(this.properties.scale ?? 1),
    });
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BlendToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

class LayersToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 500];
  preview: GraphImage | null = null;
  static MAX_LAYERS = 6;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & LayersToolNode;
    node.title = createToolTitle("Layers");
    const layerDefaults: Record<string, unknown> = {};
    for (let index = 0; index < LayersToolNode.MAX_LAYERS; index += 1) {
      const layer = index + 1;
      layerDefaults[`layer${layer}Mode`] = "normal";
      layerDefaults[`layer${layer}Alpha`] = 1;
    }
    node.properties = {
      layerCount: 3,
      ...layerDefaults,
    };
    for (let index = 0; index < LayersToolNode.MAX_LAYERS; index += 1) {
      node.addInput(`L${index + 1}`, "image");
    }
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Layers",
      3,
      (value) => {
        node.properties.layerCount = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 1, max: LayersToolNode.MAX_LAYERS, step: 1 },
    );
    for (let index = 0; index < LayersToolNode.MAX_LAYERS; index += 1) {
      const layer = index + 1;
      node.addWidget(
        "combo",
        `L${layer} Mode`,
        "normal",
        (value) => {
          node.properties[`layer${layer}Mode`] = String(value);
          notifyGraphStateChange(node);
        },
        { values: ["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference"] },
      );
      node.addWidget(
        "slider",
        `L${layer} Alpha`,
        1,
        (value) => {
          node.properties[`layer${layer}Alpha`] = Number(value);
          notifyGraphStateChange(node);
        },
        { min: 0, max: 1, step: 0.05, precision: 2 },
      );
    }
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & LayersToolNode) {
    const start = performance.now();
    const layerCount = clamp(Math.round(Number(this.properties.layerCount ?? 3)), 1, LayersToolNode.MAX_LAYERS);
    const layers = Array.from({ length: layerCount }).map((_, index) => this.getInputData(index));
    const signatures = layers.map((image) => getGraphImageSignature(image ?? null));
    const optionsSignature = JSON.stringify({
      layerCount,
      layers: Array.from({ length: layerCount }).map((_, index) => ({
        mode: String(this.properties[`layer${index + 1}Mode`] ?? "normal"),
        alpha: Number(this.properties[`layer${index + 1}Alpha`] ?? 1).toFixed(3),
      })),
    });
    const signature = signatures.join("|");

    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const availableLayers = layers.filter((image): image is GraphImage => Boolean(image));
    if (!availableLayers.length) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const width = Math.max(...availableLayers.map((image) => image.width));
    const height = Math.max(...availableLayers.map((image) => image.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    context.clearRect(0, 0, width, height);

    for (let index = 0; index < layerCount; index += 1) {
      const image = layers[index];
      if (!image) {
        continue;
      }
      const mode = String(this.properties[`layer${index + 1}Mode`] ?? "normal") as BlendMode;
      const alpha = clamp(Number(this.properties[`layer${index + 1}Alpha`] ?? 1), 0, 1);
      context.save();
      context.globalCompositeOperation = blendModeToCompositeOperation[mode] ?? "source-over";
      context.globalAlpha = alpha;
      context.drawImage(image, 0, 0, width, height);
      context.restore();
    }

    this.preview = canvas;
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & LayersToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const layerCount = clamp(Math.round(Number(this.properties.layerCount ?? 3)), 1, LayersToolNode.MAX_LAYERS);
    context.fillText(`layers:${layerCount} | blend stack`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class OilToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & OilToolNode;
    node.title = createToolTitle("Oil");
    node.properties = {
      radius: 6,
      intensity: 10,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Radius",
      6,
      (value) => {
        node.properties.radius = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 20, step: 1 },
    );
    node.addWidget(
      "slider",
      "Intensity",
      10,
      (value) => {
        node.properties.intensity = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 2, max: 50, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OilToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const radius = Number(this.properties.radius ?? 6);
    const intensity = Number(this.properties.intensity ?? 10);
    const signature = getGraphImageSignature(input);
    const optionsSignature = `radius:${Math.round(radius)}|intensity:${Math.round(intensity)}`;
    if (
      this.canReuseOptimizedResult(signature, optionsSignature)
    ) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = oilPaintGraphImage(input, radius, intensity);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OilToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `radius:${Math.round(Number(this.properties.radius ?? 6))} | intensity:${Math.round(Number(this.properties.intensity ?? 10))}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class VectorizeToolNode {
  size: [number, number] = [280, 540];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  properties!: Record<string, unknown>;
  isRendering = false;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & VectorizeToolNode;
    const imageTracer = getImageTracer();
    node.title = createToolTitle("Vectorize");
    node.properties = {
      preset: "default",
      ltres: 1,
      qtres: 1,
      pathomit: 8,
      rightangleenhance: true,
      colorsampling: 2,
      numberofcolors: 16,
      mincolorratio: 0,
      colorquantcycles: 3,
      layering: 0,
      strokewidth: 1,
      linefilter: false,
      roundcoords: 1,
      blurradius: 0,
      blurdelta: 20,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget(
      "combo",
      "Preset",
      "default",
      (value) => {
        const preset = String(value);
        node.properties.preset = preset;
        const presetOptions = imageTracer.checkoptions(preset);
        Object.assign(node.properties, presetOptions, { preset });
        notifyGraphStateChange(node);
      },
      {
        values: Object.keys(imageTracer.optionpresets),
      },
    );
    node.addWidget("slider", "Colors", 16, (value) => {
      node.properties.numberofcolors = Number(value);
      notifyGraphStateChange(node);
    }, { min: 2, max: 64, step: 1 });
    node.addWidget("slider", "Path omit", 8, (value) => {
      node.properties.pathomit = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 32, step: 1 });
    node.addWidget("slider", "Line thr", 1, (value) => {
      node.properties.ltres = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 10, step: 0.01, precision: 2 });
    node.addWidget("slider", "Quad thr", 1, (value) => {
      node.properties.qtres = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 10, step: 0.01, precision: 2 });
    node.addWidget("slider", "Color ratio", 0, (value) => {
      node.properties.mincolorratio = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Quant cycles", 3, (value) => {
      node.properties.colorquantcycles = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 10, step: 1 });
    node.addWidget("combo", "Sampling", 2, (value) => {
      node.properties.colorsampling = Number(value);
      notifyGraphStateChange(node);
    }, { values: [0, 1, 2] });
    node.addWidget("combo", "Layering", 0, (value) => {
      node.properties.layering = Number(value);
      notifyGraphStateChange(node);
    }, { values: [0, 1] });
    node.addWidget("slider", "Stroke", 1, (value) => {
      node.properties.strokewidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 0.1, precision: 1 });
    node.addWidget("slider", "Round", 1, (value) => {
      node.properties.roundcoords = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3, step: 1 });
    node.addWidget("slider", "Blur rad", 0, (value) => {
      node.properties.blurradius = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 1 });
    node.addWidget("slider", "Blur delta", 20, (value) => {
      node.properties.blurdelta = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 256, step: 1 });
    node.addWidget("toggle", "Right angle", true, (value) => {
      node.properties.rightangleenhance = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Line filter", false, (value) => {
      node.properties.linefilter = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  getVectorizeOptions(this: PreviewAwareNode & VectorizeToolNode): ImageTracerOptions {
    return {
      ltres: Number(this.properties.ltres ?? 1),
      qtres: Number(this.properties.qtres ?? 1),
      pathomit: Number(this.properties.pathomit ?? 8),
      rightangleenhance: Boolean(this.properties.rightangleenhance ?? true),
      colorsampling: Number(this.properties.colorsampling ?? 2),
      numberofcolors: clamp(Number(this.properties.numberofcolors ?? 16), 2, 64),
      mincolorratio: Number(this.properties.mincolorratio ?? 0),
      colorquantcycles: clamp(Number(this.properties.colorquantcycles ?? 3), 1, 10),
      layering: Number(this.properties.layering ?? 0),
      strokewidth: Number(this.properties.strokewidth ?? 1),
      linefilter: Boolean(this.properties.linefilter ?? false),
      roundcoords: Number(this.properties.roundcoords ?? 1),
      blurradius: Number(this.properties.blurradius ?? 0),
      blurdelta: Number(this.properties.blurdelta ?? 20),
    };
  }

  onExecute(this: PreviewAwareNode & VectorizeToolNode) {
    const start = performance.now();
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.executionMs = performance.now() - start;
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getVectorizeOptions();
    const optionsSignature = JSON.stringify(options);

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      this.isRendering = true;
      const context = input.getContext("2d", { willReadFrequently: true });
      if (context) {
        const imageData = context.getImageData(0, 0, input.width, input.height);
        const svg = getImageTracer().imagedataToSVG(imageData, options);
        this.svg = svg;

        const renderToken = ++this.renderToken;
        void rasterizeGraphSvg(svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.isRendering = false;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.svg = null;
            this.isRendering = false;
            this.executionMs = null;
            this.lastSignature = "";
            this.lastOptionsSignature = "";
            this.setDirtyCanvas(true, true);
          });
      }
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & VectorizeToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

class MarchingToolNode {
  size: [number, number] = [280, 520];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  pathCount = 0;
  sampledWidth = 0;
  sampledHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: MarchingToolNode, name: string, value: unknown) {
    const widgets = (this as unknown as LiteNode).widgets;
    if (!widgets?.length) {
      return;
    }
    const widget = widgets.find((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      return (item as { name?: unknown }).name === name;
    }) as { value?: unknown } | undefined;
    if (widget) {
      widget.value = value;
    }
  }

  applyPreset(
    this: PreviewAwareNode & MarchingToolNode,
    preset: "fast" | "quality",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            levels: 4,
            thresholdMin: 0.14,
            thresholdMax: 0.9,
            downscale: 4,
            blur: 0.4,
            simplify: 1.8,
            highQuality: false,
            lineWidth: 1.3,
            opacity: 0.82,
          }
        : {
            levels: 8,
            thresholdMin: 0.06,
            thresholdMax: 0.94,
            downscale: 2,
            blur: 1.1,
            simplify: 0.5,
            highQuality: true,
            lineWidth: 1.2,
            opacity: 0.78,
          };

    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Levels", values.levels);
    this.setWidgetValue("Thr min", values.thresholdMin);
    this.setWidgetValue("Thr max", values.thresholdMax);
    this.setWidgetValue("Downscale", values.downscale);
    this.setWidgetValue("Blur", values.blur);
    this.setWidgetValue("Simplify", values.simplify);
    this.setWidgetValue("Line width", values.lineWidth);
    this.setWidgetValue("Opacity", values.opacity);
    this.setWidgetValue("HQ simplify", values.highQuality);
    this.setWidgetValue("Mode", preset);
    if (notify) {
      notifyGraphStateChange(this);
    }
    this.setDirtyCanvas(true, true);
  }

  markCustom(this: PreviewAwareNode & MarchingToolNode) {
    if (String(this.properties.preset ?? "quality") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Mode", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & MarchingToolNode;
    getMarchingSquares();
    node.title = createToolTitle("Marching");
    node.properties = {
      preset: "quality",
      levels: 6,
      thresholdMin: 0.1,
      thresholdMax: 0.9,
      downscale: 2,
      blur: 0.8,
      simplify: 0.7,
      highQuality: true,
      lineWidth: 1.4,
      opacity: 0.8,
      invert: false,
      colorMode: "source",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Mode", "quality", (value) => {
      const mode = String(value);
      if (mode === "fast" || mode === "quality") {
        node.applyPreset(mode, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["quality", "fast", "custom"] });
    node.addWidget("button", "Apply preset", null, () => {
      const selected = String(node.properties.preset ?? "quality");
      const preset = selected === "fast" ? "fast" : "quality";
      node.applyPreset(preset, true);
    });
    node.addWidget("slider", "Levels", 6, (value) => {
      node.properties.levels = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 2, max: 8, step: 1 });
    node.addWidget("slider", "Thr min", 0.1, (value) => {
      node.properties.thresholdMin = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Thr max", 0.9, (value) => {
      node.properties.thresholdMax = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Downscale", 2, (value) => {
      node.properties.downscale = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 8, step: 1 });
    node.addWidget("slider", "Blur", 0.8, (value) => {
      node.properties.blur = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.1, precision: 1 });
    node.addWidget("slider", "Simplify", 0.7, (value) => {
      node.properties.simplify = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 1.4, (value) => {
      node.properties.lineWidth = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Opacity", 0.8, (value) => {
      node.properties.opacity = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 1, step: 0.05, precision: 2 });
    node.addWidget("combo", "Colors", "source", (value) => {
      node.properties.colorMode = String(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { values: ["source", "gray"] });
    node.addWidget("toggle", "Invert", false, (value) => {
      node.properties.invert = Boolean(value);
      node.markCustom();
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "HQ simplify", true, (value) => {
      node.properties.highQuality = Boolean(value);
      node.markCustom();
      notifyGraphStateChange(node);
    });

    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.applyPreset("quality", false);
    node.refreshPreviewLayout();
  }

  getMarchingOptions(this: PreviewAwareNode & MarchingToolNode) {
    return {
      levels: Math.round(Number(this.properties.levels ?? 6)),
      thresholdMin: Number(this.properties.thresholdMin ?? 0.1),
      thresholdMax: Number(this.properties.thresholdMax ?? 0.9),
      downscale: Math.round(Number(this.properties.downscale ?? 2)),
      blur: Number(this.properties.blur ?? 0.8),
      simplify: Number(this.properties.simplify ?? 0.7),
      highQuality: Boolean(this.properties.highQuality ?? true),
      lineWidth: Number(this.properties.lineWidth ?? 1.4),
      opacity: Number(this.properties.opacity ?? 0.8),
      invert: Boolean(this.properties.invert ?? false),
      colorMode: String(this.properties.colorMode ?? "source") as "gray" | "source",
    };
  }

  onExecute(this: PreviewAwareNode & MarchingToolNode) {
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.pathCount = 0;
      this.sampledWidth = 0;
      this.sampledHeight = 0;
      this.isRendering = false;
      this.executionMs = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getMarchingOptions();
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      this.isRendering = true;
      const start = performance.now();
      this.setDirtyCanvas(true, true);

      void marchingGraphImage(input, options, () => renderToken !== this.renderToken)
        .then((result) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          if (!result) {
            return;
          }
          this.svg = result.svg;
          this.pathCount = result.pathCount;
          this.sampledWidth = result.sampledWidth;
          this.sampledHeight = result.sampledHeight;
          this.executionMs = performance.now() - start;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview ?? null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch(() => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = null;
          this.svg = null;
          this.pathCount = 0;
          this.sampledWidth = 0;
          this.sampledHeight = 0;
          this.isRendering = false;
          this.executionMs = null;
          this.lastSignature = "";
          this.lastOptionsSignature = "";
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & MarchingToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const status = this.isRendering ? "rendering..." : "ready";
    const mode = String(this.properties.preset ?? "custom");
    context.fillText(`isolines: ${this.pathCount} | ${status} | ${mode}`, 10, layout.footerTop + 12);
    context.fillText(
      `sample: ${this.sampledWidth || "-"}x${this.sampledHeight || "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

class RoughToolNode {
  size: [number, number] = [280, 540];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  lastSvg = "";
  lastOptionsSignature = "";
  renderToken = 0;
  pathCount = 0;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & RoughToolNode;
    getRough();
    node.title = createToolTitle("Rough");
    node.properties = {
      roughness: 1.5,
      bowing: 1,
      strokeWidth: 1.2,
      fillStyle: "hachure",
      hachureAngle: -41,
      hachureGap: 4,
      fillWeight: 1,
      simplification: 0,
      curveStepCount: 9,
      maxRandomnessOffset: 2,
      seed: 1,
      disableMultiStroke: false,
      preserveStroke: true,
      preserveFill: true,
    };
    node.addInput("svg", "svg");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Roughness", 1.5, (value) => {
      node.properties.roughness = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.05, precision: 2 });
    node.addWidget("slider", "Bowing", 1, (value) => {
      node.properties.bowing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.05, precision: 2 });
    node.addWidget("slider", "Stroke", 1.2, (value) => {
      node.properties.strokeWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("combo", "Fill style", "hachure", (value) => {
      node.properties.fillStyle = String(value);
      notifyGraphStateChange(node);
    }, { values: ["hachure", "solid", "zigzag", "cross-hatch", "dots", "dashed", "zigzag-line"] });
    node.addWidget("slider", "Hach gap", 4, (value) => {
      node.properties.hachureGap = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 24, step: 0.5, precision: 1 });
    node.addWidget("slider", "Hach angle", -41, (value) => {
      node.properties.hachureAngle = Number(value);
      notifyGraphStateChange(node);
    }, { min: -180, max: 180, step: 1 });
    node.addWidget("slider", "Fill weight", 1, (value) => {
      node.properties.fillWeight = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Simplify", 0, (value) => {
      node.properties.simplification = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Curve steps", 9, (value) => {
      node.properties.curveStepCount = Number(value);
      notifyGraphStateChange(node);
    }, { min: 4, max: 30, step: 1 });
    node.addWidget("slider", "Random off", 2, (value) => {
      node.properties.maxRandomnessOffset = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 16, step: 0.1, precision: 1 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 9999, step: 1 });
    node.addWidget("toggle", "Mono stroke", false, (value) => {
      node.properties.disableMultiStroke = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Keep stroke", true, (value) => {
      node.properties.preserveStroke = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Keep fill", true, (value) => {
      node.properties.preserveFill = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  getRoughOptions(this: PreviewAwareNode & RoughToolNode) {
    return {
      roughness: Number(this.properties.roughness ?? 1.5),
      bowing: Number(this.properties.bowing ?? 1),
      strokeWidth: Number(this.properties.strokeWidth ?? 1.2),
      fillStyle: String(this.properties.fillStyle ?? "hachure") as RoughPathOptions["fillStyle"],
      hachureAngle: Number(this.properties.hachureAngle ?? -41),
      hachureGap: Number(this.properties.hachureGap ?? 4),
      fillWeight: Number(this.properties.fillWeight ?? 1),
      simplification: Number(this.properties.simplification ?? 0),
      curveStepCount: Math.round(Number(this.properties.curveStepCount ?? 9)),
      maxRandomnessOffset: Number(this.properties.maxRandomnessOffset ?? 2),
      seed: Math.round(Number(this.properties.seed ?? 1)),
      disableMultiStroke: Boolean(this.properties.disableMultiStroke ?? false),
      preserveStroke: Boolean(this.properties.preserveStroke ?? true),
      preserveFill: Boolean(this.properties.preserveFill ?? true),
      fallbackStroke: "#101010",
      fallbackFill: "none",
    };
  }

  onExecute(this: PreviewAwareNode & RoughToolNode) {
    const start = performance.now();
    const svg = this.getInputData(0);
    const inputSvg = typeof svg === "string" ? svg : null;
    if (!inputSvg) {
      this.svg = null;
      this.preview = null;
      this.pathCount = 0;
      this.lastSvg = "";
      this.lastOptionsSignature = "";
      this.executionMs = performance.now() - start;
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = this.getRoughOptions();
    const optionsSignature = JSON.stringify(options);

    if (inputSvg !== this.lastSvg || optionsSignature !== this.lastOptionsSignature) {
      this.lastSvg = inputSvg;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;

      try {
        const transformed = roughenGraphSvg(inputSvg, options);
        this.svg = transformed.svg;
        this.pathCount = transformed.pathCount;
        void rasterizeGraphSvg(transformed.svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.executionMs = null;
            this.setDirtyCanvas(true, true);
          });
      } catch {
        this.svg = null;
        this.preview = null;
        this.pathCount = 0;
        this.executionMs = null;
        this.lastSvg = "";
        this.lastOptionsSignature = "";
      }
    }

    this.setOutputData(0, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RoughToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`rough paths: ${this.pathCount}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

class SvgSimplifyToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  pathCount = 0;
  inputBytes = 0;
  outputBytes = 0;
  lastSvg = "";
  lastOptionsSignature = "";
  renderToken = 0;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & SvgSimplifyToolNode;
    getSimplify();
    node.title = createToolTitle("SVG Simplify");
    node.properties = {
      tolerance: 1.2,
      sampleStep: 2.5,
      precision: 2,
      highQuality: true,
      minify: true,
    };
    node.addInput("svg", "svg");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Tolerance", 1.2, (value) => {
      node.properties.tolerance = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.05, precision: 2 });
    node.addWidget("slider", "Sample step", 2.5, (value) => {
      node.properties.sampleStep = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 12, step: 0.1, precision: 1 });
    node.addWidget("slider", "Precision", 2, (value) => {
      node.properties.precision = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 1 });
    node.addWidget("toggle", "High quality", true, (value) => {
      node.properties.highQuality = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Minify", true, (value) => {
      node.properties.minify = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  getSimplifyOptions(this: PreviewAwareNode & SvgSimplifyToolNode) {
    return {
      tolerance: Number(this.properties.tolerance ?? 1.2),
      sampleStep: Number(this.properties.sampleStep ?? 2.5),
      precision: Math.round(Number(this.properties.precision ?? 2)),
      highQuality: Boolean(this.properties.highQuality ?? true),
      minify: Boolean(this.properties.minify ?? true),
    };
  }

  onExecute(this: PreviewAwareNode & SvgSimplifyToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const inputSvg = typeof input === "string" ? input : null;
    if (!inputSvg) {
      this.svg = null;
      this.preview = null;
      this.pathCount = 0;
      this.inputBytes = 0;
      this.outputBytes = 0;
      this.lastSvg = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.executionMs = performance.now() - start;
      this.refreshPreviewLayout();
      return;
    }

    const options = this.getSimplifyOptions();
    const optionsSignature = JSON.stringify(options);
    this.inputBytes = new Blob([inputSvg]).size;

    if (inputSvg !== this.lastSvg || optionsSignature !== this.lastOptionsSignature) {
      this.lastSvg = inputSvg;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;

      try {
        const result = simplifyGraphSvg(inputSvg, options);
        this.svg = result.svg;
        this.pathCount = result.pathCount;
        this.outputBytes = new Blob([result.svg]).size;
        void rasterizeGraphSvg(result.svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.executionMs = null;
            this.setDirtyCanvas(true, true);
          });
      } catch {
        this.svg = null;
        this.preview = null;
        this.pathCount = 0;
        this.outputBytes = 0;
        this.executionMs = null;
        this.lastSvg = "";
        this.lastOptionsSignature = "";
      }
    }

    this.setOutputData(0, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SvgSimplifyToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    const gain =
      this.inputBytes > 0
        ? Math.max(0, ((this.inputBytes - this.outputBytes) / this.inputBytes) * 100)
        : 0;
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${this.pathCount} paths | ${this.inputBytes} -> ${this.outputBytes} bytes`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(`size reduction: ${gain.toFixed(1)}%`, 10, layout.footerTop + 30);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

class BoldiniToolNode {
  size: [number, number] = [280, 430];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "idle";
  progress = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & BoldiniToolNode;
    node.title = createToolTitle("Boldini");
    node.properties = {
      canvasSize: 512,
      baseStrokes: 1500,
      middleStrokes: 4000,
      detailStrokes: 8000,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("slider", "Canvas", 512, (value) => {
      node.properties.canvasSize = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 1024, step: 32 });
    node.addWidget("slider", "Base", 1500, (value) => {
      node.properties.baseStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 200, max: 8000, step: 100 });
    node.addWidget("slider", "Middle", 4000, (value) => {
      node.properties.middleStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 500, max: 16000, step: 100 });
    node.addWidget("slider", "Detail", 8000, (value) => {
      node.properties.detailStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1000, max: 32000, step: 200 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & BoldiniToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      canvasSize: clamp(Math.round(Number(this.properties.canvasSize ?? 512)), 128, 1024),
      baseStrokes: clamp(Math.round(Number(this.properties.baseStrokes ?? 1500)), 200, 8000),
      middleStrokes: clamp(Math.round(Number(this.properties.middleStrokes ?? 4000)), 500, 16000),
      detailStrokes: clamp(Math.round(Number(this.properties.detailStrokes ?? 8000)), 1000, 32000),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.progress = 0;
      this.status = "fase 1/4 analisi";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void (async () => {
        const workingSource = fitSourceToSquareCanvas(input, options.canvasSize);
        const output = document.createElement("canvas");
        output.width = options.canvasSize;
        output.height = options.canvasSize;
        const outputContext = output.getContext("2d", { willReadFrequently: true });
        const sourceContext = workingSource.getContext("2d", { willReadFrequently: true });
        if (!outputContext || !sourceContext) {
          throw new Error("2D context not available.");
        }

        const originalColorData = sourceContext.getImageData(0, 0, options.canvasSize, options.canvasSize);
        const avg = getAverageColorFromImageData(originalColorData);
        outputContext.fillStyle = `rgb(${avg.r}, ${avg.g}, ${avg.b})`;
        outputContext.fillRect(0, 0, output.width, output.height);

        const gray = toGrayscaleImageData(originalColorData);
        const gradientMap = sobelOperatorFromGrayscale(gray);
        const blurredColorData = gaussianBlurImageData(originalColorData, 5);
        if (shouldCancel()) {
          return;
        }

        updateProgress(0.2, "fase 2/4 base");
        const baseCompleted = await renderBoldiniLayer({
          context: outputContext,
          numStrokes: options.baseStrokes,
          minSize: 20,
          maxSize: 50,
          colorSource: blurredColorData,
          gradientMap,
          opacity: 0.7,
          colorJitter: 15,
          shouldCancel,
          onProgress: (p) => updateProgress(0.2 + p * 0.3),
        });
        if (!baseCompleted || shouldCancel()) {
          return;
        }

        updateProgress(0.5, "fase 3/4 intermedie");
        const middleCompleted = await renderBoldiniLayer({
          context: outputContext,
          numStrokes: options.middleStrokes,
          minSize: 8,
          maxSize: 20,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.6,
          useCurve: true,
          colorJitter: 25,
          shouldCancel,
          onProgress: (p) => updateProgress(0.5 + p * 0.3),
        });
        if (!middleCompleted || shouldCancel()) {
          return;
        }

        updateProgress(0.8, "fase 4/4 dettagli");
        const detailCompleted = await renderBoldiniLayer({
          context: outputContext,
          numStrokes: options.detailStrokes,
          minSize: 2,
          maxSize: 8,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.9,
          sharpen: true,
          colorJitter: 10,
          shouldCancel,
          onProgress: (p) => updateProgress(0.8 + p * 0.2),
        });
        if (!detailCompleted || shouldCancel()) {
          return;
        }

        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = output;
        this.progress = 1;
        this.status = "ready";
        this.executionMs = performance.now() - start;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      })().catch((error) => {
        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = input;
        this.progress = 0;
        this.status = error instanceof Error ? error.message : "boldini error";
        this.executionMs = null;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      });
    }

    this.setOutputData(0, this.preview ?? input);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BoldiniToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${this.status}${this.isRendering ? "..." : ""}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | out ${this.preview ? `${this.preview.width}x${this.preview.height}` : "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

class CarboncinoToolNode {
  size: [number, number] = [280, 460];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "idle";
  progress = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & CarboncinoToolNode;
    node.title = createToolTitle("Carboncino");
    node.properties = {
      maxWidth: 500,
      upscale: 2,
      density: 1,
      pressure: 1,
      maxStrokes: 260000,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("slider", "Max width", 500, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 1400, step: 8 });
    node.addWidget("slider", "Upscale", 2, (value) => {
      node.properties.upscale = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 4, step: 0.5, precision: 1 });
    node.addWidget("slider", "Density", 1, (value) => {
      node.properties.density = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 2.5, step: 0.1, precision: 1 });
    node.addWidget("slider", "Pressure", 1, (value) => {
      node.properties.pressure = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.3, max: 2, step: 0.1, precision: 1 });
    node.addWidget("slider", "Max strokes", 260000, (value) => {
      node.properties.maxStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 20000, max: 600000, step: 5000 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & CarboncinoToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 500)), 128, 1400),
      upscale: clamp(Number(this.properties.upscale ?? 2), 1, 4),
      density: clamp(Number(this.properties.density ?? 1), 0.2, 2.5),
      pressure: clamp(Number(this.properties.pressure ?? 1), 0.3, 2),
      maxStrokes: clamp(Math.round(Number(this.properties.maxStrokes ?? 260000)), 20000, 600000),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.progress = 0;
      this.status = "inizializzazione";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void (async () => {
        const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
        const width = source.width;
        const height = source.height;
        const sourceContext = source.getContext("2d", { willReadFrequently: true });
        if (!sourceContext) {
          throw new Error("2D context not available.");
        }

        const originalImageData = sourceContext.getImageData(0, 0, width, height);
        const grayMap = createGrayMapFromImageData(originalImageData);
        const output = document.createElement("canvas");
        output.width = Math.max(1, Math.round(width * options.upscale));
        output.height = Math.max(1, Math.round(height * options.upscale));
        const outputContext = output.getContext("2d", { willReadFrequently: true });
        if (!outputContext) {
          throw new Error("2D context not available.");
        }
        outputContext.fillStyle = "white";
        outputContext.fillRect(0, 0, output.width, output.height);
        outputContext.lineCap = "round";

        const baseStrokes = width * height * options.density;
        let pass1Strokes = (baseStrokes / 3) * options.upscale * options.upscale;
        let pass2Strokes = (baseStrokes / 2.5) * options.upscale * options.upscale;
        let pass3Strokes = (baseStrokes / 2) * options.upscale * options.upscale;
        const totalRaw = pass1Strokes + pass2Strokes + pass3Strokes;
        if (totalRaw > options.maxStrokes) {
          const ratio = options.maxStrokes / totalRaw;
          pass1Strokes *= ratio;
          pass2Strokes *= ratio;
          pass3Strokes *= ratio;
        }

        const progressState = {
          drawn: 0,
          total: Math.max(1, Math.round(pass1Strokes + pass2Strokes + pass3Strokes)),
        };

        updateProgress(0, "passata: base tonale");
        const layer1Ok = await renderCarbonLayer({
          context: outputContext,
          passName: "base tonale",
          numStrokes: pass1Strokes,
          brightnessThreshold: 220,
          angle: 45,
          angleJitter: 15,
          scumbleChance: 0,
          getStrokeLength: (gray) => 15 + (gray / 255) * 25,
          getStrokeWidth: (gray) => 0.5 + (1 - gray / 255) * 1,
          getAlpha: (gray) => ((1 - gray / 255) ** 2) * 0.1,
          grayMap,
          width,
          height,
          upscaleFactor: options.upscale,
          alphaFactor: options.pressure,
          progressState,
          shouldCancel,
          onProgress: updateProgress,
        });
        if (!layer1Ok || shouldCancel()) {
          return;
        }

        updateProgress(progressState.drawn / progressState.total, "passata: ombreggiature");
        const layer2Ok = await renderCarbonLayer({
          context: outputContext,
          passName: "ombreggiature",
          numStrokes: pass2Strokes,
          brightnessThreshold: 160,
          angle: 135,
          angleJitter: 20,
          scumbleChance: 0.02,
          getStrokeLength: (gray) => 8 + (gray / 255) * 15,
          getStrokeWidth: (gray) => 0.8 + (1 - gray / 255) * 1.5,
          getAlpha: (gray) => ((1 - gray / 255) ** 2) * 0.3,
          grayMap,
          width,
          height,
          upscaleFactor: options.upscale,
          alphaFactor: options.pressure,
          progressState,
          shouldCancel,
          onProgress: updateProgress,
        });
        if (!layer2Ok || shouldCancel()) {
          return;
        }

        updateProgress(progressState.drawn / progressState.total, "passata: dettagli e texture");
        const layer3Ok = await renderCarbonLayer({
          context: outputContext,
          passName: "dettagli e texture",
          numStrokes: pass3Strokes,
          brightnessThreshold: 90,
          angle: "random",
          angleJitter: 180,
          scumbleChance: 0.05,
          getStrokeLength: (gray) => 3 + (gray / 255) * 8,
          getStrokeWidth: (gray) => 1 + (1 - gray / 255) * 2,
          getAlpha: (gray) => ((1 - gray / 255) ** 1.5) * 0.8,
          grayMap,
          width,
          height,
          upscaleFactor: options.upscale,
          alphaFactor: options.pressure,
          progressState,
          shouldCancel,
          onProgress: updateProgress,
        });
        if (!layer3Ok || shouldCancel()) {
          return;
        }

        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = output;
        this.progress = 1;
        this.status = "ready";
        this.executionMs = performance.now() - start;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      })().catch((error) => {
        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = input;
        this.progress = 0;
        this.status = error instanceof Error ? error.message : "carboncino error";
        this.executionMs = null;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      });
    }

    this.setOutputData(0, this.preview ?? input);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & CarboncinoToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | out ${this.preview ? `${this.preview.width}x${this.preview.height}` : "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

class SeargeantToolNode {
  size: [number, number] = [280, 450];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "idle";
  progress = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & SeargeantToolNode;
    node.title = createToolTitle("Seargeant");
    node.properties = {
      canvasSize: 512,
      blockingStrokes: 1000,
      formStrokes: 3000,
      detailStrokes: 6000,
      highlightsStrokes: 500,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("slider", "Canvas", 512, (value) => {
      node.properties.canvasSize = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 1024, step: 32 });
    node.addWidget("slider", "Blocking", 1000, (value) => {
      node.properties.blockingStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 200, max: 8000, step: 100 });
    node.addWidget("slider", "Form", 3000, (value) => {
      node.properties.formStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 500, max: 14000, step: 100 });
    node.addWidget("slider", "Detail", 6000, (value) => {
      node.properties.detailStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1000, max: 26000, step: 200 });
    node.addWidget("slider", "Highlights", 500, (value) => {
      node.properties.highlightsStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 100, max: 5000, step: 50 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & SeargeantToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      canvasSize: clamp(Math.round(Number(this.properties.canvasSize ?? 512)), 128, 1024),
      blockingStrokes: clamp(Math.round(Number(this.properties.blockingStrokes ?? 1000)), 200, 8000),
      formStrokes: clamp(Math.round(Number(this.properties.formStrokes ?? 3000)), 500, 14000),
      detailStrokes: clamp(Math.round(Number(this.properties.detailStrokes ?? 6000)), 1000, 26000),
      highlightsStrokes: clamp(Math.round(Number(this.properties.highlightsStrokes ?? 500)), 100, 5000),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.progress = 0;
      this.status = "fase 1/5 analisi";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void (async () => {
        const workingSource = fitSourceToSquareCanvas(input, options.canvasSize);
        const output = document.createElement("canvas");
        output.width = options.canvasSize;
        output.height = options.canvasSize;
        const outputContext = output.getContext("2d", { willReadFrequently: true });
        const sourceContext = workingSource.getContext("2d", { willReadFrequently: true });
        if (!outputContext || !sourceContext) {
          throw new Error("2D context not available.");
        }

        const originalColorData = sourceContext.getImageData(0, 0, options.canvasSize, options.canvasSize);
        const avg = getAverageColorFromImageData(originalColorData);
        outputContext.fillStyle = `rgb(${avg.r}, ${avg.g}, ${avg.b})`;
        outputContext.fillRect(0, 0, output.width, output.height);

        const gray = toGrayscaleImageData(originalColorData);
        const gradientMap = sobelOperatorFromGrayscale(gray);
        const blurredColorData = gaussianBlurImageData(originalColorData, 8);
        if (shouldCancel()) {
          return;
        }

        updateProgress(0.15, "fase 2/5 blocking-in");
        const blockingOk = await renderSargentLayer({
          context: outputContext,
          numStrokes: options.blockingStrokes,
          minSize: 30,
          maxSize: 60,
          colorSource: blurredColorData,
          gradientMap,
          opacity: 0.7,
          colorJitter: 20,
          shouldCancel,
          onProgress: (p) => updateProgress(0.15 + p * 0.25),
        });
        if (!blockingOk || shouldCancel()) {
          return;
        }

        updateProgress(0.4, "fase 3/5 costruzione forma");
        const formOk = await renderSargentLayer({
          context: outputContext,
          numStrokes: options.formStrokes,
          minSize: 10,
          maxSize: 25,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.75,
          colorJitter: 25,
          shouldCancel,
          onProgress: (p) => updateProgress(0.4 + p * 0.35),
        });
        if (!formOk || shouldCancel()) {
          return;
        }

        updateProgress(0.75, "fase 4/5 dettagli");
        const detailOk = await renderSargentLayer({
          context: outputContext,
          numStrokes: options.detailStrokes,
          minSize: 3,
          maxSize: 10,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.85,
          sharpen: true,
          colorJitter: 15,
          shouldCancel,
          onProgress: (p) => updateProgress(0.75 + p * 0.2),
        });
        if (!detailOk || shouldCancel()) {
          return;
        }

        updateProgress(0.95, "fase 5/5 luci speculari");
        const highlightsOk = await renderSargentLayer({
          context: outputContext,
          numStrokes: options.highlightsStrokes,
          minSize: 2,
          maxSize: 6,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.95,
          sharpen: true,
          colorJitter: 5,
          brightnessBoost: 40,
          shouldCancel,
          onProgress: (p) => updateProgress(0.95 + p * 0.05),
        });
        if (!highlightsOk || shouldCancel()) {
          return;
        }

        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = output;
        this.progress = 1;
        this.status = "ready";
        this.executionMs = performance.now() - start;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      })().catch((error) => {
        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = input;
        this.progress = 0;
        this.status = error instanceof Error ? error.message : "seargeant error";
        this.executionMs = null;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      });
    }

    this.setOutputData(0, this.preview ?? input);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SeargeantToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${this.status}${this.isRendering ? "..." : ""}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | out ${this.preview ? `${this.preview.width}x${this.preview.height}` : "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

class CrosshatchBnToolNode {
  size: [number, number] = [280, 520];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  lineCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & CrosshatchBnToolNode;
    node.title = createToolTitle("Crosshatch BN");
    node.properties = {
      maxWidth: 700,
      levels: 8,
      upscale: 2,
      whiteThreshold: 250,
      lineSpacing: 5,
      lineThickness: 1,
      lineColor: "#000000",
      lineAlpha: 1,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 700, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Levels", 8, (value) => {
      node.properties.levels = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 2, max: 128, step: 1 });
    node.addWidget("slider", "Upscale", 2, (value) => {
      node.properties.upscale = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 10, step: 1 });
    node.addWidget("slider", "White thr", 250, (value) => {
      node.properties.whiteThreshold = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 255, step: 1 });
    node.addWidget("slider", "Spacing", 5, (value) => {
      node.properties.lineSpacing = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 24, step: 1 });
    node.addWidget("slider", "Thickness", 1, (value) => {
      node.properties.lineThickness = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("text", "Line color", "#000000", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Line alpha", 1, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & CrosshatchBnToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.lineCount = 0;
      this.outputWidth = 0;
      this.outputHeight = 0;
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 700)), 128, 2400),
      levels: clamp(Math.round(Number(this.properties.levels ?? 8)), 2, 128),
      upscale: clamp(Math.round(Number(this.properties.upscale ?? 2)), 1, 10),
      whiteThreshold: clamp(Math.round(Number(this.properties.whiteThreshold ?? 250)), 0, 255),
      lineSpacing: clamp(Math.round(Number(this.properties.lineSpacing ?? 5)), 1, 24),
      lineThickness: clamp(Number(this.properties.lineThickness ?? 1), 0.1, 8),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#000000")),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 1), 0, 1),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.progress = 0;
      this.status = "generating crosshatch...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateCrosshatchBnSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return null;
          }
          this.svg = result.svg;
          this.lineCount = result.lineCount;
          this.outputWidth = result.outputWidth;
          this.outputHeight = result.outputHeight;
          this.status = `lines ${result.lineCount}`;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview ?? null;
          this.progress = 1;
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
          this.svg = null;
          this.lineCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "crosshatch error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & CrosshatchBnToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | lines ${this.lineCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

class MatitaToolNode {
  size: [number, number] = [280, 470];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & MatitaToolNode;
    node.title = createToolTitle("Matita");
    node.properties = {
      maxWidth: 500,
      iterations: 8,
      simplification: 1.2,
      lineWidth: 1,
      lineColor: "#000000",
      backgroundMode: "color",
      backgroundColor: "#FFFFFF",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 500, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Passes", 8, (value) => {
      node.properties.iterations = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 20, step: 1 });
    node.addWidget("slider", "Simplify", 1.2, (value) => {
      node.properties.simplification = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 20, step: 0.1, precision: 1 });
    node.addWidget("text", "Line color", "#000000", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("combo", "BG mode", "color", (value) => {
      node.properties.backgroundMode = String(value) === "transparent" ? "transparent" : "color";
      notifyGraphStateChange(node);
    }, { values: ["color", "transparent"] });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & MatitaToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.pathCount = 0;
      this.outputWidth = 0;
      this.outputHeight = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const backgroundMode: "transparent" | "color" =
      String(this.properties.backgroundMode ?? "color") === "transparent"
        ? "transparent"
        : "color";
    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 500)), 128, 2400),
      iterations: clamp(Math.round(Number(this.properties.iterations ?? 8)), 1, 20),
      simplification: clamp(Number(this.properties.simplification ?? 1.2), 0, 5),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 20),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#000000")),
      backgroundMode,
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.progress = 0;
      this.status = "generating matita...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateMatitaSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return null;
          }
          this.svg = result.svg;
          this.pathCount = result.pathCount;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.status = `paths ${result.pathCount}`;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview ?? null;
          this.progress = 1;
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
          this.svg = null;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "matita error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & MatitaToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | paths ${this.pathCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

class FaceLandmarkerToolNode {
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

class PoseDetectToolNode {
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

class BgRemoveToolNode {
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

class Ml5ExtractToolNode {
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

class OutputImageNode {
  image: GraphImage | null = null;
  size: [number, number] = [320, 300];
  infoText = "no image";
  lastSignature = "";

  constructor() {
    const node = this as unknown as PreviewAwareNode & OutputImageNode;
    node.title = "OUTPUT";
    node.properties = {};
    node.addInput("image", "image");
    node.addWidget("button", "Save image", null, () => {
      if (node.image) {
        downloadGraphImage(node.image, "plotterfun-output.png");
      }
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.image, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OutputImageNode) {
    this.image = this.getInputData(0) ?? null;
    const signature = getGraphImageSignature(this.image);
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.infoText = formatGraphImageInfo(this.image);
    }
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OutputImageNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.image, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(this.infoText, 10, layout.footerTop + 12);
    context.restore();
  }
}

class OutputSvgNode {
  svg: GraphSvg | null = null;
  preview: GraphImage | null = null;
  lastSvg = "";
  renderToken = 0;
  size: [number, number] = [320, 340];

  constructor() {
    const node = this as unknown as PreviewAwareNode & OutputSvgNode;
    node.title = "SVG";
    node.properties = {};
    node.addInput("svg", "svg");
    node.addWidget("button", "Save SVG", null, () => {
      if (node.svg) {
        downloadGraphSvg(node.svg, "plotterfun-output.svg");
      }
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OutputSvgNode) {
    const svg = this.getInputData(0);
    this.svg = typeof svg === "string" ? svg : null;

    if (!this.svg) {
      this.preview = null;
      this.lastSvg = "";
      this.refreshPreviewLayout();
      return;
    }

    if (this.svg !== this.lastSvg) {
      this.lastSvg = this.svg;
      const renderToken = ++this.renderToken;
      void rasterizeGraphSvg(this.svg)
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview;
          this.setDirtyCanvas(true, true);
        })
        .catch(() => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = null;
          this.setDirtyCanvas(true, true);
        });
    }

    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OutputSvgNode, context: CanvasRenderingContext2D) {
    drawImagePreview(context, this, this.preview);
  }
}

class OutputPaletteNode {
  palette: GraphPalette | null = null;
  size: [number, number] = [320, 220];

  constructor() {
    const node = this as unknown as PreviewAwareNode & OutputPaletteNode;
    node.title = "PALETTE";
    node.properties = {};
    node.addInput("palette", "palette");
    node.addWidget("button", "Save palette", null, () => {
      if (node.palette?.length) {
        downloadGraphPalette(node.palette, "plotterfun-palette.json");
      }
    });
    node.refreshPreviewLayout = () => {
      node.setDirtyCanvas(true, true);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OutputPaletteNode) {
    const palette = this.getInputData(0);
    this.palette = Array.isArray(palette)
      ? palette.filter((item): item is string => typeof item === "string")
      : null;
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OutputPaletteNode, context: CanvasRenderingContext2D) {
    drawPalettePreview(context, this, this.palette, `${this.palette?.length ?? 0} colors`);
  }
}

class OutputJsonNode {
  data: unknown = null;
  previewLines: string[] = [];
  size: [number, number] = [320, 240];

  constructor() {
    const node = this as unknown as PreviewAwareNode & OutputJsonNode;
    node.title = "JSON";
    node.properties = {};
    node.addInput("json", "*");
    node.addWidget("button", "Save JSON", null, () => {
      if (node.data) {
        downloadGraphJsonData(node.data, "plotterfun-output.json");
      }
    });
    node.refreshPreviewLayout = () => {
      node.setDirtyCanvas(true, true);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OutputJsonNode) {
    const value = this.getInputData(0) as unknown;
    this.data = value ?? null;
    if (!this.data) {
      this.previewLines = ["no json data", "connect a JSON output"];
      this.refreshPreviewLayout();
      return;
    }

    try {
      const raw = JSON.stringify(this.data, null, 2) ?? "";
      const lines = raw.split("\n").slice(0, 14).map((line) => {
        if (line.length <= 54) {
          return line;
        }
        return `${line.slice(0, 51)}...`;
      });
      this.previewLines = lines.length ? lines : ["{}"];
    } catch {
      this.previewLines = ["cannot render json", "value is not serializable"];
    }
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OutputJsonNode, context: CanvasRenderingContext2D) {
    const padding = 10;
    const headerHeight = 34 + (this.widgets?.length ?? 0) * 28;
    const lines = this.previewLines.length ? this.previewLines : ["no json data", "connect a JSON output"];
    this.size = [320, headerHeight + padding * 2 + lines.length * 18 + 8];

    context.save();
    context.fillStyle = "#121212";
    context.fillRect(padding, headerHeight, this.size[0] - padding * 2, this.size[1] - headerHeight - padding);
    context.fillStyle = "rgba(255,255,255,0.75)";
    context.font = "12px sans-serif";
    lines.forEach((line, index) => {
      context.fillText(line, padding + 8, headerHeight + 18 + index * 18);
    });
    context.restore();
  }
}

export function registerImageNodes() {
  if (registered) {
    return;
  }

  const registerNodeType = LiteGraph.registerNodeType.bind(LiteGraph);

  registerInputNodes(registerNodeType, {
    InputImageNode: InputImageNode as unknown as NodeCtor,
    WebcamImageNode: WebcamImageNode as unknown as NodeCtor,
  });
  registerBasicToolNodes(registerNodeType, {
    BlurToolNode: BlurToolNode as unknown as NodeCtor,
    SharpenToolNode: SharpenToolNode as unknown as NodeCtor,
    SobelToolNode: SobelToolNode as unknown as NodeCtor,
    RotatePanZoomToolNode: RotatePanZoomToolNode as unknown as NodeCtor,
    ScaleToolNode: ScaleToolNode as unknown as NodeCtor,
    RotateToolNode: RotateToolNode as unknown as NodeCtor,
    BrightnessContrastToolNode: BrightnessContrastToolNode as unknown as NodeCtor,
  });
  registerColorToolNodes(registerNodeType, {
    InvertToolNode: InvertToolNode as unknown as NodeCtor,
    GrayscaleToolNode: GrayscaleToolNode as unknown as NodeCtor,
    ThresholdToolNode: ThresholdToolNode as unknown as NodeCtor,
    HistogramToolNode: HistogramToolNode as unknown as NodeCtor,
    LevelsToolNode: LevelsToolNode as unknown as NodeCtor,
    RgbSplitToolNode: RgbSplitToolNode as unknown as NodeCtor,
    CmykSplitToolNode: CmykSplitToolNode as unknown as NodeCtor,
    RgbCombineToolNode: RgbCombineToolNode as unknown as NodeCtor,
    CmykCombineToolNode: CmykCombineToolNode as unknown as NodeCtor,
    QuantizeToolNode: QuantizeToolNode as unknown as NodeCtor,
    BlendToolNode: BlendToolNode as unknown as NodeCtor,
    LayersToolNode: LayersToolNode as unknown as NodeCtor,
  });
  registerArtToolNodes(registerNodeType, {
    OilToolNode: OilToolNode as unknown as NodeCtor,
    VectorizeToolNode: VectorizeToolNode as unknown as NodeCtor,
    MarchingToolNode: MarchingToolNode as unknown as NodeCtor,
    BoldiniToolNode: BoldiniToolNode as unknown as NodeCtor,
    SeargeantToolNode: SeargeantToolNode as unknown as NodeCtor,
    CarboncinoToolNode: CarboncinoToolNode as unknown as NodeCtor,
    CrosshatchBnToolNode: CrosshatchBnToolNode as unknown as NodeCtor,
    MatitaToolNode: MatitaToolNode as unknown as NodeCtor,
  });
  registerAiToolNodes(registerNodeType, {
    PoseDetectToolNode: PoseDetectToolNode as unknown as NodeCtor,
    FaceLandmarkerToolNode: FaceLandmarkerToolNode as unknown as NodeCtor,
    BgRemoveToolNode: BgRemoveToolNode as unknown as NodeCtor,
    Ml5ExtractToolNode: Ml5ExtractToolNode as unknown as NodeCtor,
  });
  registerSvgToolNodes(registerNodeType, {
    RoughToolNode: RoughToolNode as unknown as NodeCtor,
    SvgSimplifyToolNode: SvgSimplifyToolNode as unknown as NodeCtor,
  });
  registerOutputNodes(registerNodeType, {
    OutputImageNode: OutputImageNode as unknown as NodeCtor,
    OutputPaletteNode: OutputPaletteNode as unknown as NodeCtor,
    OutputSvgNode: OutputSvgNode as unknown as NodeCtor,
    OutputJsonNode: OutputJsonNode as unknown as NodeCtor,
  });
  registered = true;
}
