import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface SvgToolNodeCtors {
  RoughToolNode: NodeCtor;
  SvgSimplifyToolNode: NodeCtor;
}

export function registerSvgToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: SvgToolNodeCtors) {
  registerNodeType("tools/svg/rough", ctors.RoughToolNode);
  registerNodeType("tools/svg/svg-simplify", ctors.SvgSimplifyToolNode);
}
