import type { GraphImage } from "../../../../../models/graphImage";

export const FOOOCUS_DEFAULTS = {
  baseUrl: "http://127.0.0.1:7865",
  prompt: "mantieni soggetto e inquadratura ma trasforma in cartoon illustration, cel shading, bold outlines, simplified shapes, non-photorealistic",
  negativePrompt: "photo, photorealistic, realistic skin, camera, lens",
  promptExpansion: false,
  baseModel: "",
  loras: Array.from({ length: 5 }, () => ({ enabled: false, model: "None", weight: 1 })),
  stop: 0.4,
  weight: 0.5,
} as const;

export interface FooocusOptions {
  baseUrl: string;
  prompt: string;
  negativePrompt: string;
  promptExpansion: boolean;
  baseModel: string;
  loras: FooocusLoraSlot[];
  stop: number;
  weight: number;
}

export interface FooocusLoraSlot {
  enabled: boolean;
  model: string;
  weight: number;
}

export interface FooocusRequest {
  image: GraphImage;
  options: FooocusOptions;
}

export interface FooocusResult {
  image: GraphImage;
  cacheHit: boolean;
  seed: string | number | null;
}

export interface FooocusProgress {
  progress: number | null;
  status: string;
  image?: GraphImage;
}
