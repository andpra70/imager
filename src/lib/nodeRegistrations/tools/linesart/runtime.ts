import type { NodeCtor } from "../../shared";
import { createLinesartNodeCtors } from "./nodes";

export interface ToolLinesartNodeCtors {
  [nodeType: string]: NodeCtor;
}

export function createToolLinesartNodeCtors(): ToolLinesartNodeCtors {
  return createLinesartNodeCtors();
}
