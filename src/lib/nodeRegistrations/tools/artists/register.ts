import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface ArtistsToolNodeCtors {
  PatrickToolNode: NodeCtor;
  StoppelToolNode: NodeCtor;
  U111166ToolNode: NodeCtor;
  LineGeneratorToolNode: NodeCtor;
}

export function registerArtistsToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: ArtistsToolNodeCtors) {
  registerNodeType("tools/artists/patrick", ctors.PatrickToolNode);
  registerNodeType("tools/artists/stoppel", ctors.StoppelToolNode);
  registerNodeType("tools/artists/u111166", ctors.U111166ToolNode);
  registerNodeType("tools/artists/linegenerator", ctors.LineGeneratorToolNode);
}
