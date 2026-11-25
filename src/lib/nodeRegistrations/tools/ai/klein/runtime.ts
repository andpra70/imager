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
  const root = /^http:\/\/(?:127\.0\.0\.1|localhost|192\.168\.1\.127):8000$/i.test(configured)
    ? "/klein-api"
    : configured;
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
  if (request.images.length < 1 || request.images.length > 4) {
    throw new Error("Klein richiede da 1 a 4 immagini.");
  }
  const maxSize = Math.min(1024, Math.max(128, request.options.maxSize));
  const primary = request.images[0];
  const scale = Math.min(1, maxSize / primary.width, maxSize / primary.height);
  const width = Math.max(128, Math.round(Math.max(1, primary.width * scale) / 16) * 16);
  const height = Math.max(128, Math.round(Math.max(1, primary.height * scale) / 16) * 16);

  const normalizeImage = (image: HTMLCanvasElement) => {
    const normalized = document.createElement("canvas");
    normalized.width = width;
    normalized.height = height;
    const context = normalized.getContext("2d");
    if (!context) throw new Error("Impossibile preparare le immagini per Klein.");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    const imageScale = Math.min(width / image.width, height / image.height);
    const drawWidth = Math.max(1, Math.round(image.width * imageScale));
    const drawHeight = Math.max(1, Math.round(image.height * imageScale));
    context.drawImage(image, Math.round((width - drawWidth) / 2), Math.round((height - drawHeight) / 2), drawWidth, drawHeight);
    return normalized;
  };

  const body = new FormData();
  if (request.images.length === 1) {
    body.append("image", await canvasToBlob(normalizeImage(primary)), "input-1.png");
  } else {
    const blobs = await Promise.all(request.images.map((image) => canvasToBlob(normalizeImage(image))));
    blobs.forEach((blob, index) => body.append("images", blob, `input-${index + 1}.png`));
    body.append("width", String(width));
    body.append("height", String(height));
  }
  body.append("prompt", request.options.prompt);
  body.append("steps", String(request.options.steps));
  body.append("guidance_scale", String(request.options.guidanceScale));
  body.append("seed", String(request.options.seed));
  const route = request.images.length === 1 ? "img2img" : "multi-img2img";
  const response = await fetch(endpoint(request.options.baseUrl, route), { method: "POST", body, signal: request.signal });
  return readImageResponse(response);
}
