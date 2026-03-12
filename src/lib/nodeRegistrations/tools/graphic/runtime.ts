import type { NodeCtor } from "../../shared";
import {
  GraphicHatchingToolNode,
  GraphicScumblingToolNode,
  GraphicCrosshatichingToolNode,
  GraphicPencilToolNode,
  GraphicSketchToolNode,
  GraphicScribblingToolNode,
  GraphicTonalShadingToolNode,
  GraphicPotraceToolNode,
} from "./nodes";

export interface ToolGraphicNodeCtors {
  GraphicSketchToolNode: NodeCtor;
  GraphicPencilToolNode: NodeCtor;
  GraphicTonalShadingToolNode: NodeCtor;
  GraphicHatchingToolNode: NodeCtor;
  GraphicScumblingToolNode: NodeCtor;
  GraphicCrosshatichingToolNode: NodeCtor;
  GraphicScribblingToolNode: NodeCtor;
  GraphicPotraceToolNode: NodeCtor;
}

export function createToolGraphicNodeCtors(): ToolGraphicNodeCtors {
  return {
    GraphicSketchToolNode: GraphicSketchToolNode as NodeCtor,
    GraphicPencilToolNode: GraphicPencilToolNode as NodeCtor,
    GraphicTonalShadingToolNode: GraphicTonalShadingToolNode as NodeCtor,
    GraphicHatchingToolNode: GraphicHatchingToolNode as NodeCtor,
    GraphicScumblingToolNode: GraphicScumblingToolNode as NodeCtor,
    GraphicCrosshatichingToolNode: GraphicCrosshatichingToolNode as NodeCtor,
    GraphicScribblingToolNode: GraphicScribblingToolNode as NodeCtor,
    GraphicPotraceToolNode: GraphicPotraceToolNode as NodeCtor,
  };
}
