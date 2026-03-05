import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface ColorToolNodeCtors {
  InvertToolNode: NodeCtor;
  GrayscaleToolNode: NodeCtor;
  ThresholdToolNode: NodeCtor;
  HistogramToolNode: NodeCtor;
  LevelsToolNode: NodeCtor;
  RgbSplitToolNode: NodeCtor;
  CmykSplitToolNode: NodeCtor;
  RgbCombineToolNode: NodeCtor;
  CmykCombineToolNode: NodeCtor;
  QuantizeToolNode: NodeCtor;
  BlendToolNode: NodeCtor;
}

export function registerColorToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: ColorToolNodeCtors) {
  registerNodeType("tools/colors/invert", ctors.InvertToolNode);
  registerNodeType("tools/colors/grayscale", ctors.GrayscaleToolNode);
  registerNodeType("tools/colors/threshold", ctors.ThresholdToolNode);
  registerNodeType("tools/colors/histogram", ctors.HistogramToolNode);
  registerNodeType("tools/colors/levels", ctors.LevelsToolNode);
  registerNodeType("tools/colors/rgb-split", ctors.RgbSplitToolNode);
  registerNodeType("tools/colors/cmyk-split", ctors.CmykSplitToolNode);
  registerNodeType("tools/colors/cymk-split", ctors.CmykSplitToolNode);
  registerNodeType("tools/colors/rgb-combine", ctors.RgbCombineToolNode);
  registerNodeType("tools/colors/cmyk-combine", ctors.CmykCombineToolNode);
  registerNodeType("tools/colors/cymk-combine", ctors.CmykCombineToolNode);
  registerNodeType("tools/colors/quantize", ctors.QuantizeToolNode);
  registerNodeType("tools/colors/blend", ctors.BlendToolNode);
}
