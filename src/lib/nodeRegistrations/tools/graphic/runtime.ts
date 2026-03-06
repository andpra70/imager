import type { NodeCtor } from "../../shared";
import {
  GraphicCrosshatichingToolNode,
  GraphicPencilToolNode,
  GraphicSketchToolNode,
  GraphicScribblingToolNode,
  GraphicTonalShadingToolNode,
} from "./nodes";

export interface ToolGraphicNodeCtors {
  GraphicSketchToolNode: NodeCtor;
  GraphicPencilToolNode: NodeCtor;
  GraphicTonalShadingToolNode: NodeCtor;
  GraphicCrosshatichingToolNode: NodeCtor;
  GraphicScribblingToolNode: NodeCtor;
}

export function createToolGraphicNodeCtors(): ToolGraphicNodeCtors {
  return {
    GraphicSketchToolNode: GraphicSketchToolNode as NodeCtor,
    GraphicPencilToolNode: GraphicPencilToolNode as NodeCtor,
    GraphicTonalShadingToolNode: GraphicTonalShadingToolNode as NodeCtor,
    GraphicCrosshatichingToolNode: GraphicCrosshatichingToolNode as NodeCtor,
    GraphicScribblingToolNode: GraphicScribblingToolNode as NodeCtor,
  };
}
