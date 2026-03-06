import type { NodeCtor } from "../../shared";
import {
  OilToolNode,
  Oil2ToolNode,
  Oil3ToolNode,
  LinesToolNode,
  DotsToolNode,
  AsciifyToolNode,
  SketchToolNode,
  DelanoyToolNode,
  Delanoy2ToolNode,
  LinefyToolNode,
  Linefy2ToolNode,
  GridDotToolNode,
  StippleToolNode,
  VectorizeToolNode,
  MarchingToolNode,
  BoldiniToolNode,
  SeargeantToolNode,
  CarboncinoToolNode,
  CrosshatchBnToolNode,
  MatitaToolNode,
} from "./nodes";

export interface ToolArtNodeCtors {
  OilToolNode: NodeCtor;
  Oil2ToolNode: NodeCtor;
  Oil3ToolNode: NodeCtor;
  LinesToolNode: NodeCtor;
  DotsToolNode: NodeCtor;
  AsciifyToolNode: NodeCtor;
  SketchToolNode: NodeCtor;
  DelanoyToolNode: NodeCtor;
  Delanoy2ToolNode: NodeCtor;
  LinefyToolNode: NodeCtor;
  Linefy2ToolNode: NodeCtor;
  GridDotToolNode: NodeCtor;
  StippleToolNode: NodeCtor;
  VectorizeToolNode: NodeCtor;
  MarchingToolNode: NodeCtor;
  BoldiniToolNode: NodeCtor;
  SeargeantToolNode: NodeCtor;
  CarboncinoToolNode: NodeCtor;
  CrosshatchBnToolNode: NodeCtor;
  MatitaToolNode: NodeCtor;
}

export function createToolArtNodeCtors(): ToolArtNodeCtors {
  return {
    OilToolNode: OilToolNode as NodeCtor,
    Oil2ToolNode: Oil2ToolNode as NodeCtor,
    Oil3ToolNode: Oil3ToolNode as NodeCtor,
    LinesToolNode: LinesToolNode as NodeCtor,
    DotsToolNode: DotsToolNode as NodeCtor,
    AsciifyToolNode: AsciifyToolNode as NodeCtor,
    SketchToolNode: SketchToolNode as NodeCtor,
    DelanoyToolNode: DelanoyToolNode as NodeCtor,
    Delanoy2ToolNode: Delanoy2ToolNode as NodeCtor,
    LinefyToolNode: LinefyToolNode as NodeCtor,
    Linefy2ToolNode: Linefy2ToolNode as NodeCtor,
    GridDotToolNode: GridDotToolNode as NodeCtor,
    StippleToolNode: StippleToolNode as NodeCtor,
    VectorizeToolNode: VectorizeToolNode as NodeCtor,
    MarchingToolNode: MarchingToolNode as NodeCtor,
    BoldiniToolNode: BoldiniToolNode as NodeCtor,
    SeargeantToolNode: SeargeantToolNode as NodeCtor,
    CarboncinoToolNode: CarboncinoToolNode as NodeCtor,
    CrosshatchBnToolNode: CrosshatchBnToolNode as NodeCtor,
    MatitaToolNode: MatitaToolNode as NodeCtor,
  };
}
