import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface GraphicToolNodeCtors {
  GraphicSketchToolNode: NodeCtor;
  GraphicPencilToolNode: NodeCtor;
  GraphicTonalShadingToolNode: NodeCtor;
}

export function registerGraphicToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: GraphicToolNodeCtors) {
  registerNodeType("tools/graphic/sketch", ctors.GraphicSketchToolNode);
  registerNodeType("tools/graphic/pencil", ctors.GraphicPencilToolNode);
  registerNodeType("tools/graphic/tonalShading", ctors.GraphicTonalShadingToolNode);
}
