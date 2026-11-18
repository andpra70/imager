import type { NodeCtor } from "../../shared";
import {
  PoseDetectToolNode,
  FaceLandmarkerToolNode,
  BgRemoveToolNode,
  Ml5ExtractToolNode,
  ChatGptImageToolNode,
  FooocusToolNode,
  NanoBananaToolNode,
  KleinTxt2ImgToolNode,
  KleinImg2ImgToolNode,
} from "./nodes";

export interface ToolAiNodeCtors {
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

export function createToolAiNodeCtors(): ToolAiNodeCtors {
  return {
    PoseDetectToolNode: PoseDetectToolNode as NodeCtor,
    FaceLandmarkerToolNode: FaceLandmarkerToolNode as NodeCtor,
    BgRemoveToolNode: BgRemoveToolNode as NodeCtor,
    Ml5ExtractToolNode: Ml5ExtractToolNode as NodeCtor,
    ChatGptImageToolNode: ChatGptImageToolNode as NodeCtor,
    FooocusToolNode: FooocusToolNode as NodeCtor,
    NanoBananaToolNode: NanoBananaToolNode as NodeCtor,
    KleinTxt2ImgToolNode: KleinTxt2ImgToolNode as NodeCtor,
    KleinImg2ImgToolNode: KleinImg2ImgToolNode as NodeCtor,
  };
}
export * from "./chatgptImage/runtime";
export * from "./nanoBanana/runtime";
export * from "./klein/runtime";
