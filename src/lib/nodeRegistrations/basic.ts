import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface BasicToolNodeCtors {
  BlurToolNode: NodeCtor;
  SharpenToolNode: NodeCtor;
  SobelToolNode: NodeCtor;
  RotatePanZoomToolNode: NodeCtor;
  ScaleToolNode: NodeCtor;
  RotateToolNode: NodeCtor;
  BrightnessContrastToolNode: NodeCtor;
}

export function registerBasicToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: BasicToolNodeCtors) {
  registerNodeType("tools/basic/blur", ctors.BlurToolNode);
  registerNodeType("tools/basic/sharpen", ctors.SharpenToolNode);
  registerNodeType("tools/basic/sobel", ctors.SobelToolNode);
  registerNodeType("tools/basic/rotatePanZoom", ctors.RotatePanZoomToolNode);
  registerNodeType("tools/basic/scale", ctors.ScaleToolNode);
  registerNodeType("tools/basic/rotate", ctors.RotateToolNode);
  registerNodeType("tools/basic/brightness-contrast", ctors.BrightnessContrastToolNode);
}
