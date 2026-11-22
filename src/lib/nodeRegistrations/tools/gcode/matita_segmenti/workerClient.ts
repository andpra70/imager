import type { MatitaSegmentiRequest, MatitaSegmentiResponse, MatitaSegmentiResult } from "./model";
export function startMatitaSegmentiWorker(request:MatitaSegmentiRequest,onProgress:(strokes:number,segments:number,mse:number,preview:ImageBitmap)=>void){
  const worker=new Worker(new URL("./worker.ts",import.meta.url),{type:"module"});
  let settled=false,rejectJob:(reason?:unknown)=>void=()=>{};
  const promise=new Promise<MatitaSegmentiResult>((resolve,reject)=>{
    rejectJob=reject;
    worker.onmessage=(event:MessageEvent<MatitaSegmentiResponse>)=>{
      const data=event.data;
      if(data.type==="progress"){onProgress(data.strokes,data.segments,data.mse,data.preview);return;}
      settled=true;worker.terminate();
      if(data.type==="result")resolve(data.result);else reject(Error(data.message));
    };
    worker.onerror=event=>{settled=true;worker.terminate();reject(Error(event.message||"Errore worker MatitaSegmenti"));};
    worker.postMessage(request,[request.pixels.buffer]);
  });
  return {promise,cancel:()=>{if(settled)return;settled=true;worker.terminate();rejectJob(new DOMException("Annullato","AbortError"));}};
}
