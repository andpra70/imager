import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface FocusToolNodeCtors {
  BlurToolNode: NodeCtor;
  SharpenToolNode: NodeCtor;
  SobelToolNode: NodeCtor;
}

export function registerFocusToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: FocusToolNodeCtors) {
  registerNodeType("tools/focus/blur", ctors.BlurToolNode);
  registerNodeType("tools/focus/sharpen", ctors.SharpenToolNode);
  registerNodeType("tools/focus/sobel", ctors.SobelToolNode);
}
