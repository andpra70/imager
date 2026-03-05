import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface AiToolNodeCtors {
  PoseDetectToolNode: NodeCtor;
  FaceLandmarkerToolNode: NodeCtor;
  BgRemoveToolNode: NodeCtor;
  Ml5ExtractToolNode: NodeCtor;
}

export function registerAiToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: AiToolNodeCtors) {
  registerNodeType("tools/ai/pose-detect", ctors.PoseDetectToolNode);
  registerNodeType("tools/ai/face-landmarker", ctors.FaceLandmarkerToolNode);
  registerNodeType("tools/ai/bg-remove", ctors.BgRemoveToolNode);
  registerNodeType("tools/ai/ml5-extract", ctors.Ml5ExtractToolNode);
}
