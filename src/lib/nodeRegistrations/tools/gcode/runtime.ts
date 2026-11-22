import { BaseGcodeToolNode } from "./base/node";
import { Base2GcodeToolNode } from "./base2/node";
import type { NodeCtor } from "../../shared";
import { GcodeCncToolNode, GcodeViewerToolNode, SvgToGcodeToolNode } from "./nodes";
import { Svg2Gcode2ToolNode } from "./svg2gcode2/node";

interface ToolGcodeNodeCtors {
  BaseGcodeToolNode: NodeCtor;
  Base2GcodeToolNode: NodeCtor;
  SvgToGcodeToolNode: NodeCtor;
  Svg2Gcode2ToolNode: NodeCtor;
  GcodeViewerToolNode: NodeCtor;
  GcodeCncToolNode: NodeCtor;
}

export function createToolGcodeNodeCtors(): ToolGcodeNodeCtors {
  return {
    BaseGcodeToolNode: BaseGcodeToolNode as unknown as NodeCtor,
    Base2GcodeToolNode: Base2GcodeToolNode as unknown as NodeCtor,
    SvgToGcodeToolNode: SvgToGcodeToolNode as unknown as NodeCtor,
    Svg2Gcode2ToolNode: Svg2Gcode2ToolNode as unknown as NodeCtor,
    GcodeViewerToolNode: GcodeViewerToolNode as unknown as NodeCtor,
    GcodeCncToolNode: GcodeCncToolNode as unknown as NodeCtor,
  };
}
