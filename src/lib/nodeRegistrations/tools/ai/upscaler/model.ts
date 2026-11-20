export type UpscalerScale = 2 | 3 | 4;

export interface UpscalerOptions {
  scale: UpscalerScale;
  patchSize: number;
  padding: number;
  awaitNextFrame: boolean;
}

export interface UpscalerProgress {
  ratio: number;
  row: number | null;
  column: number | null;
}

export interface GraphUpscalerData {
  task: "image-upscaling";
  engine: {
    library: "UpscalerJS";
    modelFamily: "ESRGAN Slim";
    scale: UpscalerScale;
  };
  options: UpscalerOptions;
  input: { width: number; height: number };
  output: { width: number; height: number };
  timing: { totalMs: number };
  generatedAtIso: string;
}

export const defaultUpscalerOptions: UpscalerOptions = {
  scale: 2,
  patchSize: 64,
  padding: 4,
  awaitNextFrame: true,
};
