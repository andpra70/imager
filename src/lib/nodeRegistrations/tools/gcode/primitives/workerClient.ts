import type { PrimitiveRequest, PrimitiveResponse, PrimitiveResult } from "./model";
export function startPrimitiveWorker(request:PrimitiveRequest,onProgress:(shapes:number,mse:number,preview:ImageBitmap)=>void){
  const worker=new Worker(new URL("./worker.ts",import.meta.url),{type:"module"});let settled=false;let rejectJob:(reason?:unknown)=>void=()=>{};
  const promise=new Promise<PrimitiveResult>((resolve,reject)=>{
    rejectJob=reject;
    worker.onmessage=(event:MessageEvent<PrimitiveResponse>)=>{const data=event.data;if(data.type==="progress"){onProgress(data.shapes,data.mse,data.preview);return;}settled=true;worker.terminate();if(data.type==="result")resolve(data.result);else reject(Error(data.message));};
    worker.onerror=event=>{settled=true;worker.terminate();reject(Error(event.message||"Errore worker"));};
    worker.postMessage(request,[request.pixels.buffer]);
  });
  return {promise,cancel:()=>{if(settled)return;settled=true;worker.terminate();rejectJob(new DOMException("Annullato","AbortError"));}};
}
