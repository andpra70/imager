import type { CalligraphyOptions,CalligraphyResult,Curve } from "../matita_calligrafica/model";
export type MicroKind="veloce"|"turbo";
export interface MicroOptions extends CalligraphyOptions{spacing:number;maxLen:number;minLen:number;locality:number;failMax:number}
export const microDefaults:MicroOptions={widthMm:160,heightMm:200,ppm:3,pen:.5,alpha:.18,white:242,margin:.08,candidates:12,step:2.4,bend:38,chain:2,maxStrokes:100000,target:.007,minProgress:.45,safeZ:3,drawZ:-.12,feed:1200,feedZ:180,spacing:.12,maxLen:3.2,minLen:.65,locality:3,failMax:1500};
export interface MicroRequest{kind:MicroKind;width:number;height:number;pixels:Uint8ClampedArray;options:MicroOptions}
export type MicroResult=CalligraphyResult;
export type MicroResponse={type:"progress";strokes:number;mse:number;preview:ImageBitmap}|{type:"result";result:MicroResult}|{type:"error";message:string};
export interface MicroCandidate{curve:Curve;length:number;distance:number;score:number;gain:number}
export function validateMicroOptions(c:MicroOptions){if((Object.keys(microDefaults) as Array<keyof MicroOptions>).some(k=>!Number.isFinite(c[k])))throw Error("Parametri numerici non validi");if(c.widthMm<30||c.widthMm>400||c.heightMm<30||c.heightMm>400||c.ppm<1||c.ppm>8||c.pen<.1||c.pen>2||c.alpha<.01||c.alpha>.9||c.white<100||c.white>255||c.margin<0||c.margin>1||c.spacing<0||c.spacing>3||c.maxLen<.3||c.maxLen>30||c.minLen<.2||c.minLen>20||c.minLen>c.maxLen||c.bend<0||c.bend>85||c.locality<0||c.locality>10||c.maxStrokes<10||c.maxStrokes>1000000||c.candidates<4||c.candidates>100||c.target<0||c.target>.2||c.failMax<50||c.failMax>100000||c.safeZ<=0||c.drawZ>=c.safeZ||c.feed<50||c.feedZ<20)throw Error("Parametri Microtratti fuori intervallo");}
