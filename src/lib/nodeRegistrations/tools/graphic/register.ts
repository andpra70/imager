import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface GraphicToolNodeCtors {
  GraphicSketchToolNode: NodeCtor;
  GraphicPencilToolNode: NodeCtor;
  GraphicTonalShadingToolNode: NodeCtor;
  GraphicCrosshatichingToolNode: NodeCtor;
  GraphicScribblingToolNode: NodeCtor;
}

export function registerGraphicToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: GraphicToolNodeCtors) {
  registerNodeType("tools/graphic/sketch", ctors.GraphicSketchToolNode);
  registerNodeType("tools/graphic/pencil", ctors.GraphicPencilToolNode);
  registerNodeType("tools/graphic/tonalShading", ctors.GraphicTonalShadingToolNode);
  registerNodeType("tools/graphic/crosshatiching", ctors.GraphicCrosshatichingToolNode);
  registerNodeType("tools/graphic/scribbling", ctors.GraphicScribblingToolNode);
}
