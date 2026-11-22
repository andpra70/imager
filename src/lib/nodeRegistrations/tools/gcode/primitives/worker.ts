/// <reference lib="webworker" />
import { PrimitiveEngine } from "./engine";
import type { PrimitiveRequest, PrimitiveResponse } from "./model";
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async(event:MessageEvent<PrimitiveRequest>)=>{
  try{const result=await new PrimitiveEngine(event.data).run((shapes,mse,preview)=>scope.postMessage({type:"progress",shapes,mse,preview} satisfies PrimitiveResponse,[preview]));scope.postMessage({type:"result",result} satisfies PrimitiveResponse,[result.preview]);}
  catch(error){scope.postMessage({type:"error",message:error instanceof Error?error.message:"Errore generazione"} satisfies PrimitiveResponse);}
};
