import { drawSourceToCanvas } from "../../../../imageUtils";
import type { ChatGptImageCacheRecord, ChatGptImageRequest, ChatGptImageResult } from "./model";

const CACHE_NAME = "plotterfun-chatgpt-image-v1";
const CACHE_ORIGIN = "https://plotterfun-cache.invalid";

interface OpenAiImageResponse {
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { message?: string };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Impossibile codificare l'immagine in PNG.")), "image/png");
  });
}

function blobToCanvas(blob: Blob) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try { resolve(drawSourceToCanvas(image)); } finally { URL.revokeObjectURL(url); }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("La risposta non contiene un'immagine valida."));
    };
    image.src = url;
  });
}

async function sha256(parts: Array<string | Blob>) {
  const buffers = await Promise.all(parts.map(async (part) =>
    typeof part === "string" ? new TextEncoder().encode(part) : new Uint8Array(await part.arrayBuffer()),
  ));
  const length = buffers.reduce((sum, value) => sum + value.byteLength, 0);
  const merged = new Uint8Array(length);
  let offset = 0;
  buffers.forEach((value) => { merged.set(value, offset); offset += value.byteLength; });
  const digest = await crypto.subtle.digest("SHA-256", merged);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function cacheUrls(cacheKey: string): ChatGptImageCacheRecord {
  return {
    cacheKey,
    inputUrl: `${CACHE_ORIGIN}/input/${cacheKey}`,
    outputUrl: `${CACHE_ORIGIN}/output/${cacheKey}`,
  };
}

async function readCachedOutput(record: ChatGptImageCacheRecord) {
  if (!("caches" in globalThis)) return null;
  const response = await (await caches.open(CACHE_NAME)).match(record.outputUrl);
  return response ? response.blob() : null;
}

async function writeCache(record: ChatGptImageCacheRecord, input: Blob, output: Blob) {
  if (!("caches" in globalThis)) return;
  const cache = await caches.open(CACHE_NAME);
  await Promise.all([
    cache.put(record.inputUrl, new Response(input, { headers: { "Content-Type": input.type } })),
    cache.put(record.outputUrl, new Response(output, { headers: { "Content-Type": output.type } })),
  ]);
}

function base64ToBlob(value: string, contentType: string) {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: contentType });
}

async function responseImageBlob(payload: OpenAiImageResponse, outputFormat: string) {
  const item = payload.data?.[0];
  if (item?.b64_json) return base64ToBlob(item.b64_json, `image/${outputFormat}`);
  if (item?.url) {
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(`Download immagine fallito (${response.status}).`);
    return response.blob();
  }
  throw new Error(payload.error?.message ?? "ChatGPT Image non ha restituito un'immagine.");
}

export async function transformWithChatGptImage(request: ChatGptImageRequest): Promise<ChatGptImageResult> {
  const inputBlob = await canvasToBlob(request.image);
  const cacheKey = await sha256([JSON.stringify(request.options), inputBlob]);
  const record = cacheUrls(cacheKey);
  const cachedOutput = await readCachedOutput(record);
  if (cachedOutput) {
    return { image: await blobToCanvas(cachedOutput), cacheKey, cacheHit: true, revisedPrompt: null };
  }

  const body = new FormData();
  body.append("model", request.options.model);
  body.append("prompt", request.options.prompt);
  body.append("quality", request.options.quality);
  body.append("size", request.options.size);
  body.append("output_format", request.options.outputFormat);
  body.append("image", inputBlob, "input.png");
  const response = await fetch(request.options.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${request.apiKey}` },
    body,
  });
  const payload = await response.json() as OpenAiImageResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? `OpenAI API error (${response.status}).`);
  const outputBlob = await responseImageBlob(payload, request.options.outputFormat);
  await writeCache(record, inputBlob, outputBlob);
  return {
    image: await blobToCanvas(outputBlob), cacheKey, cacheHit: false,
    revisedPrompt: payload.data?.[0]?.revised_prompt ?? null,
  };
}
