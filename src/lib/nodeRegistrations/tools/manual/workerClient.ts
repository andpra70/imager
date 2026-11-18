import type { ManualStageProgress, ManualWorkerInput, ManualWorkerResult } from "./model";
import type { ManualWorkerRequest, ManualWorkerResponse } from "./workerProtocol";

export interface ManualWorkerJob { promise: Promise<ManualWorkerResult>; cancel: () => void; }
let nextJobId = 1;

export function startManualPrepareWorker(input: ManualWorkerInput, onProgress: (progress: ManualStageProgress) => void): ManualWorkerJob {
  const worker=new Worker(new URL("./prepare.worker.ts",import.meta.url),{type:"module"}),jobId=nextJobId++; let settled=false,rejectJob:((reason?:unknown)=>void)|null=null;
  const promise=new Promise<ManualWorkerResult>((resolve,reject)=>{rejectJob=reject;worker.onmessage=(event:MessageEvent<ManualWorkerResponse>)=>{if(event.data.jobId!==jobId)return;if(event.data.type==="progress"){onProgress(event.data.progress);return;}settled=true;worker.terminate();event.data.type==="result"?resolve(event.data.result):reject(new Error(event.data.message));};worker.onerror=(event)=>{settled=true;worker.terminate();reject(new Error(event.message||"Manual worker error"));};worker.postMessage({type:"prepare",jobId,input} satisfies ManualWorkerRequest,[input.rgba.buffer]);});
  return {promise,cancel:()=>{if(settled)return;settled=true;worker.terminate();rejectJob?.(new DOMException("Preparation cancelled","AbortError"));}};
}
