import type { OpenCvImagePayload, OpenCvJobRequest, OpenCvJobResponse, OpenCvOperationId, OpenCvParams } from "./model";

export interface OpenCvWorkerJob {
  promise: Promise<{ image: OpenCvImagePayload; elapsedMs: number }>;
  cancel: () => void;
}
interface QueueItem { jobId:number; operation:OpenCvOperationId; params:OpenCvParams; image:OpenCvImagePayload; onProgress:(progress:number,stage:string)=>void; resolve:(value:{image:OpenCvImagePayload;elapsedMs:number})=>void; reject:(reason?:unknown)=>void; cancelled:boolean; }
interface PoolSlot { worker:Worker; item:QueueItem|null; }

const poolSize=Math.max(1,Math.min(4,(navigator.hardwareConcurrency||4)-1));
const queue:QueueItem[]=[];const slots:PoolSlot[]=[];let nextJobId=1;

function createSlot():PoolSlot {
  const slot={worker:new Worker(new URL("./opencv.worker.ts",import.meta.url),{type:"module"}),item:null} as PoolSlot;
  slot.worker.onmessage=(event:MessageEvent<OpenCvJobResponse>)=>{
    const item=slot.item;if(!item||("jobId" in event.data&&event.data.jobId!==item.jobId))return;
    if(event.data.type==="progress"){item.onProgress(event.data.progress,event.data.stage);return;}
    if(event.data.type==="result")item.resolve({image:event.data.image,elapsedMs:event.data.elapsedMs});
    else if(event.data.type==="error")item.reject(new Error(event.data.message));else return;
    slot.item=null;pump();
  };
  slot.worker.onerror=(event)=>{slot.item?.reject(new Error(event.message||"OpenCV worker failure"));slot.item=null;slot.worker.terminate();const index=slots.indexOf(slot);if(index>=0)slots[index]=createSlot();pump();};
  return slot;
}
function ensurePool(){while(slots.length<poolSize)slots.push(createSlot());}
function pump(){ensurePool();for(const slot of slots){if(slot.item)continue;let item=queue.shift();while(item?.cancelled)item=queue.shift();if(!item)return;slot.item=item;const request={type:"process",jobId:item.jobId,operation:item.operation,params:item.params,image:item.image} satisfies OpenCvJobRequest;slot.worker.postMessage(request,[item.image.rgba.buffer]);}}

export function runOpenCvJob(operation:OpenCvOperationId,params:OpenCvParams,image:OpenCvImagePayload,onProgress:(progress:number,stage:string)=>void):OpenCvWorkerJob {
  let item:QueueItem;
  const promise=new Promise<{image:OpenCvImagePayload;elapsedMs:number}>((resolve,reject)=>{item={jobId:nextJobId++,operation,params,image,onProgress,resolve,reject,cancelled:false};queue.push(item);pump();});
  return {promise,cancel:()=>{if(item.cancelled)return;item.cancelled=true;const queuedIndex=queue.indexOf(item);if(queuedIndex>=0){queue.splice(queuedIndex,1);item.reject(new DOMException("OpenCV job cancelled","AbortError"));return;}const slot=slots.find(candidate=>candidate.item===item);if(slot){slot.worker.terminate();slot.item=null;item.reject(new DOMException("OpenCV job cancelled","AbortError"));const index=slots.indexOf(slot);slots[index]=createSlot();pump();}}};
}
