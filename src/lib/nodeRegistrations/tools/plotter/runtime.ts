import type { NodeCtor } from "../../shared";
import { createPlotterNodeCtors } from "./nodes";

export interface ToolPlotterNodeCtors {
  [nodeType: string]: NodeCtor;
}

export function createToolPlotterNodeCtors(): ToolPlotterNodeCtors {
  return createPlotterNodeCtors();
}
