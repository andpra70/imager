import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface GcodeToolNodeCtors {
  SvgToGcodeToolNode: NodeCtor;
  GcodeViewerToolNode: NodeCtor;
  GcodeCncToolNode: NodeCtor;
}

export function registerGcodeToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: GcodeToolNodeCtors) {
  registerNodeType("tools/gcode/svg-to-gcode", ctors.SvgToGcodeToolNode);
  registerNodeType("tools/gcode/viewer", ctors.GcodeViewerToolNode);
  registerNodeType("tools/gcode/cnc", ctors.GcodeCncToolNode);
}
