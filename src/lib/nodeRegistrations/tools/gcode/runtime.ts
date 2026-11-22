import { MicrotrattiVeloceGcodeToolNode,MicrotrattiTurboGcodeToolNode } from "./microtratti/node";
import { MatitaCalligraficaGcodeToolNode } from "./matita_calligrafica/node";
import { MatitaRettangoliGcodeToolNode } from "./matita_rettangoli/node";
import { MatitaCerchiGcodeToolNode } from "./matita_cerchi/node";
import { BaseGcodeToolNode } from "./base/node";
import { Base2GcodeToolNode } from "./base2/node";
import { MatitaGcodeToolNode } from "./matita/node";
import { MatitaSplineGcodeToolNode } from "./matita_spline/node";
import { LegacyMatita2GcodeToolNode, MatitaSegmentiGcodeToolNode } from "./matita_segmenti/node";
import type { NodeCtor } from "../../shared";
import { GcodeCncToolNode, GcodeViewerToolNode, SvgToGcodeToolNode } from "./nodes";
import { Svg2Gcode2ToolNode } from "./svg2gcode2/node";

interface ToolGcodeNodeCtors {
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
}

export function createToolGcodeNodeCtors(): ToolGcodeNodeCtors {
  return {
    BaseGcodeToolNode: BaseGcodeToolNode as unknown as NodeCtor,
    Base2GcodeToolNode: Base2GcodeToolNode as unknown as NodeCtor,
    MatitaGcodeToolNode: MatitaGcodeToolNode as unknown as NodeCtor,
    MatitaSplineGcodeToolNode: MatitaSplineGcodeToolNode as unknown as NodeCtor,
    MatitaCalligraficaGcodeToolNode: MatitaCalligraficaGcodeToolNode as unknown as NodeCtor,
    MicrotrattiVeloceGcodeToolNode: MicrotrattiVeloceGcodeToolNode as unknown as NodeCtor,
    MicrotrattiTurboGcodeToolNode: MicrotrattiTurboGcodeToolNode as unknown as NodeCtor,
    MatitaRettangoliGcodeToolNode: MatitaRettangoliGcodeToolNode as unknown as NodeCtor,
    MatitaCerchiGcodeToolNode: MatitaCerchiGcodeToolNode as unknown as NodeCtor,
    MatitaSegmentiGcodeToolNode: MatitaSegmentiGcodeToolNode as unknown as NodeCtor,
    LegacyMatita2GcodeToolNode: LegacyMatita2GcodeToolNode as unknown as NodeCtor,
    SvgToGcodeToolNode: SvgToGcodeToolNode as unknown as NodeCtor,
    Svg2Gcode2ToolNode: Svg2Gcode2ToolNode as unknown as NodeCtor,
    GcodeViewerToolNode: GcodeViewerToolNode as unknown as NodeCtor,
    GcodeCncToolNode: GcodeCncToolNode as unknown as NodeCtor,
  };
}
