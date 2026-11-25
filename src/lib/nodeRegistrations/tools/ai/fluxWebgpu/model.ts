export type FluxWebGpuLevel = "mint" | "weathered" | "off-the-rails";
export type FluxWebGpuResidency = "all" | "lean";

export interface FluxWebGpuOptions {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number;
  level: FluxWebGpuLevel;
  residency: FluxWebGpuResidency;
}

export interface FluxWebGpuProgress {
  phase: "checking" | "loading" | "text" | "denoise" | "decode" | "complete";
  label: string;
  ratio: number;
  loadedBytes?: number;
  totalBytes?: number;
  step?: number;
  steps?: number;
}

export interface GraphFluxWebGpuData {
  task: "text-to-image";
  engine: {
    runtime: "@kaminos/flux2-klein";
    architecture: "FLUX.2 Klein 4B + Qwen3-4B";
    backend: "WebGPU";
    weightsRepository: string;
    requestedReference: "gandamu/flux2-klein-4b-qwen3-4b-webgpu";
  };
  options: FluxWebGpuOptions;
  output: { width: number; height: number };
  timing: { totalMs: number; stages: Record<string, number | number[]> };
  generatedAtIso: string;
}

export const FLUX_WEBGPU_DEFAULTS: FluxWebGpuOptions = {
  prompt: "A cinematic portrait painted with dramatic light, highly detailed",
  width: 512,
  height: 512,
  steps: 4,
  seed: 42,
  level: "mint",
  residency: "all",
};
