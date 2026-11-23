import type { WasmBase0Options } from "../../wasm/base0/model";
import type { CalligraphyResult } from "../../gcode/matita_calligrafica/model";
export type LuaBase0Options=WasmBase0Options;
export interface LuaBase0Request{width:number;height:number;pixels:Uint8ClampedArray;options:LuaBase0Options}
export interface LuaBase0Result extends CalligraphyResult{vmMs:number;computeMs:number;exportMs:number;totalMs:number;backend:"Fengari Lua 5.3"}
export type LuaBase0Response={type:"progress";status:string;preview?:ImageBitmap}|{type:"result";result:LuaBase0Result}|{type:"error";message:string};
