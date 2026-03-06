import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

export interface PlotterToolNodeCtors {
  [nodeType: string]: NodeCtor;
}

export function registerPlotterToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: PlotterToolNodeCtors) {
  for (const [nodeType, ctor] of Object.entries(ctors)) {
    registerNodeType(nodeType, ctor);
  }
}
