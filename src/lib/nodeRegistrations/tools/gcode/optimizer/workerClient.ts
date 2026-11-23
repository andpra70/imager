import type { GcodeOptimizerOptions, GcodeOptimizerResult } from "./model";

export function startGcodeOptimizer(gcode: string, options: GcodeOptimizerOptions) {
  const worker=new Worker(new URL("./worker.ts",import.meta.url),{type:"module"});
  const promise=new Promise<GcodeOptimizerResult>((resolve,reject)=>{worker.onmessage=(event:MessageEvent<{type:"result";result:GcodeOptimizerResult}|{type:"error";message:string}>)=>{worker.terminate();event.data.type==="result"?resolve(event.data.result):reject(new Error(event.data.message));};worker.onerror=event=>{worker.terminate();reject(new Error(event.message));};worker.postMessage({gcode,options});});
  return {promise,cancel:()=>worker.terminate()};
}
