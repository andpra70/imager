/// <reference lib="webworker" />
import { CalligraphyEngine } from "./engine";
import type { CalligraphyRequest,CalligraphyResponse } from "./model";
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async(event:MessageEvent<CalligraphyRequest>)=>{try{const result=await new CalligraphyEngine(event.data).run((strokes,curves,mse,preview)=>scope.postMessage({type:"progress",strokes,curves,mse,preview} satisfies CalligraphyResponse,[preview]));scope.postMessage({type:"result",result} satisfies CalligraphyResponse,[result.preview]);}catch(error){scope.postMessage({type:"error",message:error instanceof Error?error.message:"Errore Matita Calligrafica"} satisfies CalligraphyResponse);}};
