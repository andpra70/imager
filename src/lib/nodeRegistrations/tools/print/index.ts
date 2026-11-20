export * from "./model";
export * from "./runtime";
export * from "./nodes";
export * from "./register";
import type { NodeCtor } from "../../shared";
import { KodakPrintToolNode } from "./node";
export function createToolPrintNodeCtors(): { KodakPrintToolNode: NodeCtor } { return { KodakPrintToolNode: KodakPrintToolNode as NodeCtor }; }
