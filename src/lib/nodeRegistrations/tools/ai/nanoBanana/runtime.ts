import { drawSourceToCanvas } from "../../../../imageUtils";
import type { NanoBananaProgress, NanoBananaRequest, NanoBananaResult } from "./model";

const CACHE_NAME="plotterfun-nano-banana-v1",CACHE_ORIGIN="https://plotterfun-nano-cache.invalid";
interface GeminiPayload { candidates?:Array<{content?:{parts?:Array<{text?:string;inlineData?:{mimeType?:string;data?:string};inline_data?:{mime_type?:string;data?:string}}>}}> ; error?:{message?:string}; }

function canvasBlob(canvas:HTMLCanvasElement){return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Impossibile codificare l'immagine.")),"image/png"));}
function blobBase64(blob:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]??"");reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
function blobCanvas(blob:Blob){return new Promise<HTMLCanvasElement>((resolve,reject)=>{const url=URL.createObjectURL(blob),image=new Image();image.onload=()=>{try{resolve(drawSourceToCanvas(image));}finally{URL.revokeObjectURL(url);}};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Nano Banana non ha restituito un'immagine valida."));};image.src=url;});}
function base64Blob(value:string,type:string){const bytes=Uint8Array.from(atob(value),char=>char.charCodeAt(0));return new Blob([bytes],{type});}
async function digest(parts:Array<string|Blob>){const chunks=await Promise.all(parts.map(async part=>typeof part==="string"?new TextEncoder().encode(part):new Uint8Array(await part.arrayBuffer()))),length=chunks.reduce((sum,chunk)=>sum+chunk.length,0),merged=new Uint8Array(length);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}const hash=await crypto.subtle.digest("SHA-256",merged);return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,"0")).join("");}
async function cached(key:string){if(!("caches" in globalThis))return null;const response=await(await caches.open(CACHE_NAME)).match(`${CACHE_ORIGIN}/${key}`);return response?.blob()??null;}
async function cache(key:string,blob:Blob){if("caches" in globalThis)await(await caches.open(CACHE_NAME)).put(`${CACHE_ORIGIN}/${key}`,new Response(blob,{headers:{"Content-Type":blob.type}}));}

export async function transformWithNanoBanana(request:NanoBananaRequest,onProgress:(value:NanoBananaProgress)=>void=()=>{}):Promise<NanoBananaResult>{
  onProgress({progress:.05,stage:"codifica immagine"});const input=await canvasBlob(request.image);onProgress({progress:.12,stage:"verifica cache"});const cacheKey=await digest([JSON.stringify(request.options),input]),hit=await cached(cacheKey);if(hit){onProgress({progress:.85,stage:"decodifica cache"});return{image:await blobCanvas(hit),cacheKey,cacheHit:true,responseText:null};}
  const base64=await blobBase64(input),imageConfig:Record<string,string>={};if(request.options.aspectRatio!=="auto")imageConfig.aspectRatio=request.options.aspectRatio;if(request.options.model!=="gemini-2.5-flash-image")imageConfig.imageSize=request.options.imageSize;
  const body={contents:[{role:"user",parts:[{text:request.options.prompt},{inline_data:{mime_type:"image/png",data:base64}}]}],generationConfig:{responseModalities:["IMAGE"],...(Object.keys(imageConfig).length?{imageConfig}:{})}};
  const endpoint=`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(request.options.model)}:generateContent`;
  onProgress({progress:.2,stage:"invio a Gemini"});const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":request.apiKey},body:JSON.stringify(body),signal:request.signal});
  onProgress({progress:.72,stage:"lettura risposta"});const raw=await response.text();let payload:GeminiPayload;try{payload=JSON.parse(raw) as GeminiPayload;}catch{throw new Error(`Risposta Gemini non valida (${response.status}): ${raw.slice(0,240)}`);}if(!response.ok)throw new Error(payload.error?.message??`Gemini API error (${response.status}).`);
  const parts=payload.candidates?.flatMap(candidate=>candidate.content?.parts??[])??[],imagePart=parts.find(part=>part.inlineData?.data||part.inline_data?.data),data=imagePart?.inlineData?.data??imagePart?.inline_data?.data,mime=imagePart?.inlineData?.mimeType??imagePart?.inline_data?.mime_type??"image/png";
  if(!data)throw new Error(payload.error?.message??`Nano Banana non ha restituito alcuna immagine. ${parts.find(part=>part.text)?.text??""}`.trim());onProgress({progress:.85,stage:"decodifica immagine"});const output=base64Blob(data,mime);await cache(cacheKey,output);const image=await blobCanvas(output);onProgress({progress:1,stage:"completata"});
  return{image,cacheKey,cacheHit:false,responseText:parts.find(part=>part.text)?.text??null};
}
