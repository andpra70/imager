import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface BasicToolNodeCtors {
  BlurToolNode: NodeCtor;
  ScaleToolNode: NodeCtor;
  RotateToolNode: NodeCtor;
  BrightnessContrastToolNode: NodeCtor;
}

export function registerBasicToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: BasicToolNodeCtors) {
  registerNodeType("tools/basic/blur", ctors.BlurToolNode);
  registerNodeType("tools/basic/scale", ctors.ScaleToolNode);
  registerNodeType("tools/basic/rotate", ctors.RotateToolNode);
  registerNodeType("tools/basic/brightness-contrast", ctors.BrightnessContrastToolNode);
}
