import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface GraphicToolNodeCtors {
  GraphicSketchToolNode: NodeCtor;
  GraphicPencilToolNode: NodeCtor;
}

export function registerGraphicToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: GraphicToolNodeCtors) {
  registerNodeType("tools/graphic/sketch", ctors.GraphicSketchToolNode);
  registerNodeType("tools/graphic/pencil", ctors.GraphicPencilToolNode);
}
