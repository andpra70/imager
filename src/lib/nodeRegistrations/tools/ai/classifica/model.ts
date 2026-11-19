export const MOBILENET_V4_MODEL_ID = "onnx-community/mobilenetv4_conv_small.e2400_r224_in1k";

export type ClassificationBackend = "auto" | "webgpu" | "wasm";
export type ResolvedClassificationBackend = Exclude<ClassificationBackend, "auto">;

export interface ClassificationOptions {
  backend: ClassificationBackend;
  topK: number;
}

export interface ClassificationLoadProgress {
  status: string;
  file: string | null;
  percent: number | null;
}

export interface ClassificationPrediction {
  label: string;
  score: number;
}

export interface ClassificationTiming {
  modelLoadMs: number;
  inferenceMs: number;
  totalMs: number;
}

export interface GraphClassificationData {
  task: "image-classification";
  model: {
    family: "MobileNetV4";
    id: string;
  };
  backend: {
    requested: ClassificationBackend;
    used: ResolvedClassificationBackend;
    fallbackReason: string | null;
  };
  image: {
    width: number;
    height: number;
  };
  predictions: ClassificationPrediction[];
  timing: ClassificationTiming;
  generatedAtIso: string;
}

export const defaultClassificationOptions: ClassificationOptions = {
  backend: "wasm",
  topK: 5,
};
