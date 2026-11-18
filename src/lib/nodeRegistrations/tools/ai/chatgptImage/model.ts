import type { GraphImage } from "../../../../../models/graphImage";

export const CHATGPT_IMAGE_DEFAULTS = {
  model: "chatgpt-image-latest",
  quality: "auto",
  size: "auto",
  outputFormat: "png",
  endpoint: "https://api.openai.com/v1/images/edits",
} as const;

export interface ChatGptImageOptions {
  prompt: string;
  model: string;
  quality: "auto" | "low" | "medium" | "high";
  size: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
  outputFormat: "png" | "webp" | "jpeg";
  endpoint: string;
}

export interface ChatGptImageRequest {
  image: GraphImage;
  options: ChatGptImageOptions;
  apiKey: string;
}

export interface ChatGptImageResult {
  image: GraphImage;
  cacheKey: string;
  cacheHit: boolean;
  revisedPrompt: string | null;
}

export interface ChatGptImageCacheRecord {
  cacheKey: string;
  inputUrl: string;
  outputUrl: string;
}
