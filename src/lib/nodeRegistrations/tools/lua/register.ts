import type { NodeCtor,RegisterNodeTypeFn } from "../../shared";
export function registerLuaToolNodes(registerNodeType:RegisterNodeTypeFn,ctors:{LuaBase0ToolNode:NodeCtor}){registerNodeType("tools/LUA/base0",ctors.LuaBase0ToolNode);}
