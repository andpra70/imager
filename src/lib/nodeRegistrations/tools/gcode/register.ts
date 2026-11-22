import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface GcodeToolNodeCtors {
  BaseGcodeToolNode: NodeCtor;
  Base2GcodeToolNode: NodeCtor;
  SvgToGcodeToolNode: NodeCtor;
  Svg2Gcode2ToolNode: NodeCtor;
  GcodeViewerToolNode: NodeCtor;
  GcodeCncToolNode: NodeCtor;
}

export function registerGcodeToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: GcodeToolNodeCtors) {
  registerNodeType("tools/gcode/base", ctors.BaseGcodeToolNode);
  registerNodeType("tools/gcode/base2", ctors.Base2GcodeToolNode);
  registerNodeType("tools/gcode/svg-to-gcode", ctors.SvgToGcodeToolNode);
  registerNodeType("tools/gcode/svg2gcode2", ctors.Svg2Gcode2ToolNode);
  registerNodeType("tools/gcode/viewer", ctors.GcodeViewerToolNode);
  registerNodeType("tools/gcode/cnc", ctors.GcodeCncToolNode);
}
