import type { NodeCtor } from "../../shared";
import { GraphicPencilToolNode, GraphicSketchToolNode, GraphicTonalShadingToolNode } from "./nodes";

export interface ToolGraphicNodeCtors {
  GraphicSketchToolNode: NodeCtor;
  GraphicPencilToolNode: NodeCtor;
  GraphicTonalShadingToolNode: NodeCtor;
}

export function createToolGraphicNodeCtors(): ToolGraphicNodeCtors {
  return {
    GraphicSketchToolNode: GraphicSketchToolNode as NodeCtor,
    GraphicPencilToolNode: GraphicPencilToolNode as NodeCtor,
    GraphicTonalShadingToolNode: GraphicTonalShadingToolNode as NodeCtor,
  };
}
