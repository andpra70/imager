import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface BasicToolNodeCtors {
  RotatePanZoomToolNode: NodeCtor;
  ScaleToolNode: NodeCtor;
  RotateToolNode: NodeCtor;
}

export function registerBasicToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: BasicToolNodeCtors) {
  registerNodeType("tools/basic/rotatePanZoom", ctors.RotatePanZoomToolNode);
  registerNodeType("tools/basic/scale", ctors.ScaleToolNode);
  registerNodeType("tools/basic/rotate", ctors.RotateToolNode);
}
