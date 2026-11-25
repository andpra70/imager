declare module "@kaminos/flux2-klein" {
  export type KleinLevel = "mint" | "weathered" | "off-the-rails";
  export type KleinResidency = "all" | "lean";

  export interface KleinLoadProgress {
    loadedBytes: number;
    totalBytes: number;
  }

  export interface KleinGeneratedImage {
    rgba: Uint8ClampedArray;
    width: number;
    height: number;
    timings: Record<string, number | number[] | undefined>;
    promptTokens?: number;
    textTokens?: number;
  }

  export interface KleinGenerateOptions {
    prompt: string;
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    textLength?: number | `fit${number}`;
    signal?: AbortSignal;
    onPhase?: (phase: "weights" | "text" | "denoise" | "decode") => void;
    onStep?: (step: number, steps: number) => void;
    onPreview?: (preview: { width: number; height: number; rgba: Uint8ClampedArray; step: number; steps: number }) => void;
  }

  export interface KleinApp {
    load: (onProgress?: (part: string, file: string, progress: KleinLoadProgress) => void) => Promise<void>;
    generate: (options: KleinGenerateOptions) => Promise<KleinGeneratedImage>;
    stop: (reason?: string) => void;
    destroy: () => Promise<void>;
    snapshot: () => { loaded: boolean; phase: string; error: string | null };
  }

  export function createKleinApp(options?: {
    load?: boolean;
    onProgress?: (part: string, file: string, progress: KleinLoadProgress) => void;
    pipelineOptions?: {
      weightsBase?: string;
      level?: KleinLevel;
      residency?: KleinResidency;
    };
  }): Promise<KleinApp>;

  export const KLEIN_HOSTED_WEIGHTS: string;
}
