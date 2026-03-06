import type { NodeCtor } from "../../shared";
import { BlurToolNode, SharpenToolNode, SobelToolNode } from "./nodes";

export interface ToolFocusNodeCtors {
  BlurToolNode: NodeCtor;
  SharpenToolNode: NodeCtor;
  SobelToolNode: NodeCtor;
}

export function createToolFocusNodeCtors(): ToolFocusNodeCtors {
  return {
    BlurToolNode: BlurToolNode as NodeCtor,
    SharpenToolNode: SharpenToolNode as NodeCtor,
    SobelToolNode: SobelToolNode as NodeCtor,
  };
}
