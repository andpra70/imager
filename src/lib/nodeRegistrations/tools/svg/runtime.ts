import type { NodeCtor } from "../../shared";
import { RoughToolNode, SvgSimplifyToolNode } from "./nodes";

export interface ToolSvgNodeCtors {
  RoughToolNode: NodeCtor;
  SvgSimplifyToolNode: NodeCtor;
}

export function createToolSvgNodeCtors(): ToolSvgNodeCtors {
  return {
    RoughToolNode: RoughToolNode as NodeCtor,
    SvgSimplifyToolNode: SvgSimplifyToolNode as NodeCtor,
  };
}
