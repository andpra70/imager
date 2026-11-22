/// <reference lib="webworker" />
import { MatitaSegmentiEngine } from "./engine";
import type { MatitaSegmentiRequest, MatitaSegmentiResponse } from "./model";
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async(event:MessageEvent<MatitaSegmentiRequest>)=>{
  try{
    const engine=new MatitaSegmentiEngine(event.data);
    const result=await engine.run((strokes,segments,mse,preview)=>scope.postMessage({type:"progress",strokes,segments,mse,preview} satisfies MatitaSegmentiResponse,[preview]));
    scope.postMessage({type:"result",result} satisfies MatitaSegmentiResponse,[result.preview]);
  }catch(error){scope.postMessage({type:"error",message:error instanceof Error?error.message:"Errore Matita Segmenti"} satisfies MatitaSegmentiResponse);}
};
