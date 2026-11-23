import type { GraphVideoSize } from "../../../../../models/graphVideo";

export type FaceSwapBackend = "auto" | "webgpu" | "webnn" | "wasm";

export interface FaceSwapOptions {
  backend: FaceSwapBackend;
  strength: number;
  occlusion: boolean;
  maxFps: number;
}

export interface FaceSwapProgress {
  model: string;
  loaded: number;
  total: number;
  ratio: number;
}

export interface FaceSwapDiagnostics {
  onStage?: (message: string) => void;
  onProgress?: (progress: FaceSwapProgress) => void;
}

export interface GraphFaceSwapData {
  task: "face-swap";
  mode: "image" | "video";
  engine: {
    library: "browser-inswapper";
    backend: Exclude<FaceSwapBackend, "auto">;
    model: "inswapper_128";
  };
  options: FaceSwapOptions;
  input: GraphVideoSize;
  output: GraphVideoSize;
  facesReplaced: number | null;
  timing: { totalMs: number };
  generatedAtIso: string;
}

export const defaultFaceSwapOptions: FaceSwapOptions = {
  backend: "auto",
  strength: 1,
  occlusion: true,
  maxFps: 30,
};
