/// <reference lib="webworker" />
import { MicroEngine } from "./engine";
import type { MicroRequest,MicroResponse } from "./model";
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async(event:MessageEvent<MicroRequest>)=>{try{const result=await new MicroEngine(event.data).run((strokes,mse,preview)=>scope.postMessage({type:"progress",strokes,mse,preview} satisfies MicroResponse,[preview]));scope.postMessage({type:"result",result} satisfies MicroResponse,[result.preview]);}catch(error){scope.postMessage({type:"error",message:error instanceof Error?error.message:"Errore Microtratti"} satisfies MicroResponse);}};
