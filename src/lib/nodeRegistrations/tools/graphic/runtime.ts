import type { NodeCtor } from "../../shared";
import { GraphicPencilToolNode, GraphicSketchToolNode } from "./nodes";

export interface ToolGraphicNodeCtors {
  GraphicSketchToolNode: NodeCtor;
  GraphicPencilToolNode: NodeCtor;
}

export function createToolGraphicNodeCtors(): ToolGraphicNodeCtors {
  return {
    GraphicSketchToolNode: GraphicSketchToolNode as NodeCtor,
    GraphicPencilToolNode: GraphicPencilToolNode as NodeCtor,
  };
}
