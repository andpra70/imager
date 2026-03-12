import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

export interface LinesartToolNodeCtors {
  [nodeType: string]: NodeCtor;
}

export function registerLinesartToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: LinesartToolNodeCtors) {
  for (const [nodeType, ctor] of Object.entries(ctors)) {
    registerNodeType(nodeType, ctor);
  }
}
