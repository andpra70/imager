import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";

interface AiToolNodeCtors {
  PoseDetectToolNode: NodeCtor;
  FaceLandmarkerToolNode: NodeCtor;
  BgRemoveToolNode: NodeCtor;
  Ml5ExtractToolNode: NodeCtor;
  ChatGptImageToolNode: NodeCtor;
  FooocusToolNode: NodeCtor;
  NanoBananaToolNode: NodeCtor;
  KleinTxt2ImgToolNode: NodeCtor;
  KleinImg2ImgToolNode: NodeCtor;
}

export function registerAiToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: AiToolNodeCtors) {
  registerNodeType("tools/ai/pose-detect", ctors.PoseDetectToolNode);
  registerNodeType("tools/ai/face-landmarker", ctors.FaceLandmarkerToolNode);
  registerNodeType("tools/ai/bg-remove", ctors.BgRemoveToolNode);
  registerNodeType("tools/ai/ml5-extract", ctors.Ml5ExtractToolNode);
  registerNodeType("tools/ai/chatgpt-image", ctors.ChatGptImageToolNode);
  registerNodeType("tools/ai/fooocus", ctors.FooocusToolNode);
  registerNodeType("tools/ai/nanobanana", ctors.NanoBananaToolNode);
  registerNodeType("tools/ai/klein/txt2img", ctors.KleinTxt2ImgToolNode);
  registerNodeType("tools/ai/klein/img2img", ctors.KleinImg2ImgToolNode);
}
