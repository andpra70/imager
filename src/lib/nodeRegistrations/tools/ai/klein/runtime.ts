import { drawSourceToCanvas } from "../../../../imageUtils";
import type { KleinImg2ImgRequest, KleinResult, KleinTxt2ImgRequest } from "./model";

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Impossibile codificare l'immagine per Klein.")),
    "image/png",
  ));
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
      reject(new Error("Klein non ha restituito un'immagine valida."));
    };
    image.src = url;
  });
}

function endpoint(baseUrl: string, path: string) {
  const configured = baseUrl.trim().replace(/\/$/, "");
  const root = /^http:\/\/(?:127\.0\.0\.1|localhost):8000$/i.test(configured) ? "/klein-api" : configured;
  return `${root}/${path}`;
}

async function readImageResponse(response: Response): Promise<KleinResult> {
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`Klein ${response.status}: ${detail || response.statusText}`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("La risposta di Klein non e un'immagine.");
  return { image: await blobToCanvas(blob) };
}

export async function kleinTxt2Img(request: KleinTxt2ImgRequest) {
  const body = new FormData();
  body.append("prompt", request.options.prompt);
  body.append("width", String(request.options.width));
  body.append("height", String(request.options.height));
  body.append("steps", String(request.options.steps));
  body.append("guidance_scale", String(request.options.guidanceScale));
  body.append("seed", String(request.options.seed));
  const response = await fetch(endpoint(request.options.baseUrl, "text2img"), { method: "POST", body, signal: request.signal });
  return readImageResponse(response);
}

export async function kleinImg2Img(request: KleinImg2ImgRequest) {
  const maxSize = Math.min(1024, Math.max(128, request.options.maxSize));
  const scale = Math.min(1, maxSize / request.image.width, maxSize / request.image.height);
  const resized = document.createElement("canvas");
  resized.width = Math.max(1, Math.round(request.image.width * scale));
  resized.height = Math.max(1, Math.round(request.image.height * scale));
  resized.getContext("2d")?.drawImage(request.image, 0, 0, resized.width, resized.height);

  const body = new FormData();
  body.append("image", await canvasToBlob(resized), "input.png");
  body.append("prompt", request.options.prompt);
  body.append("steps", String(request.options.steps));
  body.append("guidance_scale", String(request.options.guidanceScale));
  body.append("seed", String(request.options.seed));
  const response = await fetch(endpoint(request.options.baseUrl, "img2img"), { method: "POST", body, signal: request.signal });
  return readImageResponse(response);
}
