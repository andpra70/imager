import type { NodeCtor } from "../../shared";
import { GcodeCncToolNode, GcodeViewerToolNode, SvgToGcodeToolNode } from "./nodes";

interface ToolGcodeNodeCtors {
  SvgToGcodeToolNode: NodeCtor;
  GcodeViewerToolNode: NodeCtor;
  GcodeCncToolNode: NodeCtor;
}

export function createToolGcodeNodeCtors(): ToolGcodeNodeCtors {
  return {
    SvgToGcodeToolNode: SvgToGcodeToolNode as unknown as NodeCtor,
    GcodeViewerToolNode: GcodeViewerToolNode as unknown as NodeCtor,
    GcodeCncToolNode: GcodeCncToolNode as unknown as NodeCtor,
  };
}
