import type { NodeCtor } from "../../shared";
import { WasmBase0ToolNode } from "./base0/node";
import { WasmSegmentiToolNode } from "./segmenti/node";
export function createWasmToolNodeCtors(){return {WasmBase0ToolNode:WasmBase0ToolNode as unknown as NodeCtor,WasmSegmentiToolNode:WasmSegmentiToolNode as unknown as NodeCtor};}
