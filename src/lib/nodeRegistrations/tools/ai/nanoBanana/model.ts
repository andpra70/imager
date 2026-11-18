import type { GraphImage } from "../../../../../models/graphImage";

export type NanoBananaModel = "gemini-nano-banana-2.1" | "gemini-3.1-flash-image" | "gemini-3.1-flash-lite-image" | "gemini-3-pro-image" | "gemini-2.5-flash-image";
export interface NanoBananaOptions {
  prompt: string;
  model: NanoBananaModel;
  aspectRatio: "auto" | "1:1" | "3:2" | "2:3" | "4:3" | "3:4" | "5:4" | "4:5" | "16:9" | "9:16" | "21:9";
  imageSize: "1K" | "2K" | "4K";
}
export interface NanoBananaRequest { image:GraphImage; options:NanoBananaOptions; apiKey:string; signal?:AbortSignal; }
export interface NanoBananaResult { image:GraphImage; cacheKey:string; cacheHit:boolean; responseText:string|null; }
export interface NanoBananaProgress { progress:number; stage:string; }
export interface NanoBananaStatus { state:"idle"|"running"|"complete"|"error"|"cancelled"; message:string; progress:number; executionMs:number|null; cacheHit:boolean|null; }
export const NANO_BANANA_DEFAULTS:NanoBananaOptions={prompt:"Modifica questa immagine mantenendo riconoscibili soggetto e composizione: ",model:"gemini-nano-banana-2.1",aspectRatio:"auto",imageSize:"1K"};
