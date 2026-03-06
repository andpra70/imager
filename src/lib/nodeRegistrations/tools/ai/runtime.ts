import type { NodeCtor } from "../../shared";
import {
  PoseDetectToolNode,
  FaceLandmarkerToolNode,
  BgRemoveToolNode,
  Ml5ExtractToolNode,
} from "./nodes";

export interface ToolAiNodeCtors {
  PoseDetectToolNode: NodeCtor;
  FaceLandmarkerToolNode: NodeCtor;
  BgRemoveToolNode: NodeCtor;
  Ml5ExtractToolNode: NodeCtor;
}

export function createToolAiNodeCtors(): ToolAiNodeCtors {
  return {
    PoseDetectToolNode: PoseDetectToolNode as NodeCtor,
    FaceLandmarkerToolNode: FaceLandmarkerToolNode as NodeCtor,
    BgRemoveToolNode: BgRemoveToolNode as NodeCtor,
    Ml5ExtractToolNode: Ml5ExtractToolNode as NodeCtor,
  };
}
