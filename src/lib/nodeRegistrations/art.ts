import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface ArtToolNodeCtors {
  OilToolNode: NodeCtor;
  Oil2ToolNode: NodeCtor;
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

export function registerArtToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: ArtToolNodeCtors) {
  registerNodeType("tools/art/oil", ctors.OilToolNode);
  registerNodeType("tools/art/oil2", ctors.Oil2ToolNode);
  registerNodeType("tools/art/asciify", ctors.AsciifyToolNode);
  registerNodeType("tools/art/sketch", ctors.SketchToolNode);
  registerNodeType("tools/art/delanoy", ctors.DelanoyToolNode);
  registerNodeType("tools/art/delanoy2", ctors.Delanoy2ToolNode);
  registerNodeType("tools/art/linefy", ctors.LinefyToolNode);
  registerNodeType("tools/art/linefy2", ctors.Linefy2ToolNode);
  registerNodeType("tools/art/griddot", ctors.GridDotToolNode);
  registerNodeType("tools/art/stipple", ctors.StippleToolNode);
  registerNodeType("tools/art/vectorize", ctors.VectorizeToolNode);
  registerNodeType("tools/art/marching", ctors.MarchingToolNode);
  registerNodeType("tools/art/boldini", ctors.BoldiniToolNode);
  registerNodeType("tools/art/seargeant", ctors.SeargeantToolNode);
  registerNodeType("tools/art/carboncino", ctors.CarboncinoToolNode);
  registerNodeType("tools/art/crosshatch-bn", ctors.CrosshatchBnToolNode);
  registerNodeType("tools/art/matita", ctors.MatitaToolNode);
}
