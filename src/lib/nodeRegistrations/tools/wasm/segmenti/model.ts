import type { MatitaSegmentiOptions,MatitaSegmentiRequest,MatitaSegmentiResult } from "../../gcode/matita_segmenti/model";
export type WasmSegmentiOptions=MatitaSegmentiOptions;
export type WasmSegmentiRequest=MatitaSegmentiRequest;
export interface WasmSegmentiResult extends MatitaSegmentiResult{computeMs:number;loadMs:number;totalMs:number}
export type WasmSegmentiResponse={type:"progress";strokes:number;segments:number;mse:number;preview:ImageBitmap}|{type:"result";result:WasmSegmentiResult}|{type:"error";message:string};
