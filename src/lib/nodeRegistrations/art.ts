import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface ArtToolNodeCtors {
  OilToolNode: NodeCtor;
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
  registerNodeType("tools/art/vectorize", ctors.VectorizeToolNode);
  registerNodeType("tools/art/marching", ctors.MarchingToolNode);
  registerNodeType("tools/art/boldini", ctors.BoldiniToolNode);
  registerNodeType("tools/art/seargeant", ctors.SeargeantToolNode);
  registerNodeType("tools/art/carboncino", ctors.CarboncinoToolNode);
  registerNodeType("tools/art/crosshatch-bn", ctors.CrosshatchBnToolNode);
  registerNodeType("tools/art/matita", ctors.MatitaToolNode);
}
