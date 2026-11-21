import type { NodeCtor } from "../../shared";
import { CropToolNode, RotatePanZoomToolNode, ScaleToolNode, RotateToolNode } from "./nodes";

export interface ToolBasicNodeCtors {
  RotatePanZoomToolNode: NodeCtor;
  ScaleToolNode: NodeCtor;
  RotateToolNode: NodeCtor;
  CropToolNode: NodeCtor;
}

export function createToolBasicNodeCtors(): ToolBasicNodeCtors {
  return {
    RotatePanZoomToolNode: RotatePanZoomToolNode as NodeCtor,
    ScaleToolNode: ScaleToolNode as NodeCtor,
    RotateToolNode: RotateToolNode as NodeCtor,
    CropToolNode: CropToolNode as NodeCtor,
  };
}
