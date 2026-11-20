export type YoloBackendPreference = "auto" | "webgpu" | "cpu";
export type YoloRuntimeBackend = "webgpu" | "cpu";

export interface YoloOptions {
  backend: YoloBackendPreference;
  confidence: number;
  iou: number;
  showLabels: boolean;
  lineWidth: number;
}

export interface YoloBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface YoloDetection {
  classId: number;
  label: string;
  confidence: number;
  color: string;
  box: YoloBoundingBox;
}

export interface GraphYoloData {
  task: "object-detection";
  engine: {
    library: "Ultralytics YOLO Browser";
    family: "YOLO26";
    model: "YOLO26n";
    backend: YoloRuntimeBackend;
  };
  image: { width: number; height: number };
  detections: YoloDetection[];
  timing: {
    preprocessMs: number;
    inferenceMs: number;
    postprocessMs: number;
    totalMs: number;
  };
  options: YoloOptions;
  generatedAtIso: string;
}

export const defaultYoloOptions: YoloOptions = {
  backend: "auto",
  confidence: 0.25,
  iou: 0.5,
  showLabels: true,
  lineWidth: 3,
};
