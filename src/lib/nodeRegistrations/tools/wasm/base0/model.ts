export interface WasmBase0Options { widthMm:number;heightMm:number;ppm:number;pen:number;alpha:number;white:number;margin:number;step:number;bend:number;chain:number;candidates:number;maxStrokes:number;target:number;minProgress:number;safeZ:number;drawZ:number;feed:number;feedZ:number }
export const wasmBase0Defaults:WasmBase0Options={widthMm:160,heightMm:200,ppm:3,pen:.5,alpha:.18,white:242,margin:.08,step:2.4,bend:32,chain:65,candidates:16,maxStrokes:5000,target:.007,minProgress:.45,safeZ:3,drawZ:-.12,feed:1200,feedZ:180};
export interface WasmBase0Result { gcode:string;svg:string;preview:ImageBitmap;strokes:number;curves:number;mse:number;reason:string;computeMs:number;loadMs:number;totalMs:number }
export type WasmBase0Request={width:number;height:number;pixels:Uint8ClampedArray;options:WasmBase0Options};
export type WasmBase0Response={type:"progress";strokes:number;curves:number;mse:number;preview?:ImageBitmap}|{type:"result";result:WasmBase0Result}|{type:"error";message:string};
