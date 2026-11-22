export interface CalligraphyOptions {
  widthMm:number;heightMm:number;ppm:number;pen:number;alpha:number;white:number;margin:number;candidates:number;step:number;bend:number;chain:number;maxStrokes:number;target:number;minProgress:number;safeZ:number;drawZ:number;feed:number;feedZ:number;
}
export const calligraphyDefaults:CalligraphyOptions={widthMm:160,heightMm:200,ppm:3,pen:.5,alpha:.18,white:242,margin:.08,candidates:16,step:2.4,bend:32,chain:65,maxStrokes:5000,target:.007,minProgress:.45,safeZ:3,drawZ:-.12,feed:1200,feedZ:180};
export interface Point{x:number;y:number}
export interface Curve{p0:Point;p1:Point;p2:Point;p3:Point;points:Point[];end:Point;angle:number}
export interface Stroke{curves:Curve[];gain:number}
export interface CalligraphyRequest{width:number;height:number;pixels:Uint8ClampedArray;options:CalligraphyOptions}
export interface CalligraphyResult{gcode:string;svg:string;preview:ImageBitmap;strokes:number;curves:number;mse:number;reason:string}
export type CalligraphyResponse={type:"progress";strokes:number;curves:number;mse:number;preview:ImageBitmap}|{type:"result";result:CalligraphyResult}|{type:"error";message:string};
export function validateCalligraphyOptions(c:CalligraphyOptions){if((Object.keys(calligraphyDefaults) as Array<keyof CalligraphyOptions>).some(k=>!Number.isFinite(c[k])))throw Error("Parametri numerici non validi");if(c.widthMm<30||c.widthMm>400||c.heightMm<30||c.heightMm>400||c.ppm<1||c.ppm>8||c.pen<.1||c.pen>2||c.alpha<.01||c.alpha>.9||c.white<100||c.white>255||c.margin<0||c.margin>1||c.candidates<4||c.candidates>64||c.step<.4||c.step>12||c.bend<5||c.bend>85||c.chain<2||c.chain>400||c.maxStrokes<10||c.maxStrokes>100000||c.target<0||c.target>.2||c.minProgress<.01||c.minProgress>20||c.safeZ<=0||c.drawZ>=c.safeZ||c.feed<50||c.feedZ<20)throw Error("Parametri calligrafici fuori intervallo");}
