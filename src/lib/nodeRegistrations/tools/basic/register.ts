import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface BasicToolNodeCtors {
  RotatePanZoomToolNode: NodeCtor;
  ScaleToolNode: NodeCtor;
  RotateToolNode: NodeCtor;
  CropToolNode: NodeCtor;
}

export function registerBasicToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: BasicToolNodeCtors) {
  registerNodeType("tools/basic/rotatePanZoom", ctors.RotatePanZoomToolNode);
  registerNodeType("tools/basic/scale", ctors.ScaleToolNode);
  registerNodeType("tools/basic/rotate", ctors.RotateToolNode);
  registerNodeType("tools/basic/crop", ctors.CropToolNode);
}
