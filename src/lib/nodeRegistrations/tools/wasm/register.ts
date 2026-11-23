import type { NodeCtor,RegisterNodeTypeFn } from "../../shared";
export function registerWasmToolNodes(registerNodeType:RegisterNodeTypeFn,ctors:{WasmBase0ToolNode:NodeCtor;WasmSegmentiToolNode:NodeCtor}){registerNodeType("tools/wasm/base0",ctors.WasmBase0ToolNode);registerNodeType("tools/wasm/segmenti",ctors.WasmSegmentiToolNode);}
