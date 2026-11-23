import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface GcodeToolNodeCtors {
  BaseGcodeToolNode: NodeCtor;
  Base2GcodeToolNode: NodeCtor;
  MatitaGcodeToolNode: NodeCtor;
  MatitaSplineGcodeToolNode: NodeCtor;
  MatitaCalligraficaGcodeToolNode: NodeCtor;
  MicrotrattiVeloceGcodeToolNode: NodeCtor;
  MicrotrattiTurboGcodeToolNode: NodeCtor;
  MatitaRettangoliGcodeToolNode: NodeCtor;
  MatitaCerchiGcodeToolNode: NodeCtor;
  MatitaSegmentiGcodeToolNode: NodeCtor;
  LegacyMatita2GcodeToolNode: NodeCtor;
  SvgToGcodeToolNode: NodeCtor;
  Svg2Gcode2ToolNode: NodeCtor;
  GcodeViewerToolNode: NodeCtor;
  GcodeCncToolNode: NodeCtor;
  GcodeOptimizerToolNode: NodeCtor;
}

export function registerGcodeToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: GcodeToolNodeCtors) {
  registerNodeType("tools/gcode/base", ctors.BaseGcodeToolNode);
  registerNodeType("tools/gcode/base2", ctors.Base2GcodeToolNode);
  registerNodeType("tools/gcode/matita", ctors.MatitaGcodeToolNode);
  registerNodeType("tools/gcode/matita_spline", ctors.MatitaSplineGcodeToolNode);
  registerNodeType("tools/gcode/matita_calligrafica", ctors.MatitaCalligraficaGcodeToolNode);
  registerNodeType("tools/gcode/microtratti_veloce", ctors.MicrotrattiVeloceGcodeToolNode);
  registerNodeType("tools/gcode/microtratti_turbo", ctors.MicrotrattiTurboGcodeToolNode);
  registerNodeType("tools/gcode/matita_rettangoli", ctors.MatitaRettangoliGcodeToolNode);
  registerNodeType("tools/gcode/matita_cerchi", ctors.MatitaCerchiGcodeToolNode);
  registerNodeType("tools/gcode/matita2", ctors.LegacyMatita2GcodeToolNode);
  registerNodeType("tools/gcode/matita_segmenti", ctors.MatitaSegmentiGcodeToolNode);
  registerNodeType("tools/gcode/svg-to-gcode", ctors.SvgToGcodeToolNode);
  registerNodeType("tools/gcode/svg2gcode2", ctors.Svg2Gcode2ToolNode);
  registerNodeType("tools/gcode/viewer", ctors.GcodeViewerToolNode);
  registerNodeType("tools/gcode/cnc", ctors.GcodeCncToolNode);
  registerNodeType("tools/gcode/optimizer", ctors.GcodeOptimizerToolNode);
}
