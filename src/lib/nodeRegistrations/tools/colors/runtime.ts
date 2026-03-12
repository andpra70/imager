import type { NodeCtor } from "../../shared";
import {
  InvertToolNode,
  GrayscaleToolNode,
  ThresholdToolNode,
  HalftoningToolNode,
  HistogramToolNode,
  LevelsToolNode,
  RgbSplitToolNode,
  CmykSplitToolNode,
  RgbCombineToolNode,
  CmykCombineToolNode,
  QuantizeToolNode,
  QuantizeLevelsToolNode,
  BlendToolNode,
  LayersToolNode,
  BrightnessContrastToolNode,
} from "./nodes";

export interface ToolColorsNodeCtors {
  InvertToolNode: NodeCtor;
  GrayscaleToolNode: NodeCtor;
  ThresholdToolNode: NodeCtor;
  HalftoningToolNode: NodeCtor;
  HistogramToolNode: NodeCtor;
  LevelsToolNode: NodeCtor;
  RgbSplitToolNode: NodeCtor;
  CmykSplitToolNode: NodeCtor;
  RgbCombineToolNode: NodeCtor;
  CmykCombineToolNode: NodeCtor;
  QuantizeToolNode: NodeCtor;
  QuantizeLevelsToolNode: NodeCtor;
  BlendToolNode: NodeCtor;
  LayersToolNode: NodeCtor;
  BrightnessContrastToolNode: NodeCtor;
}

export function createToolColorsNodeCtors(): ToolColorsNodeCtors {
  return {
    InvertToolNode: InvertToolNode as NodeCtor,
    GrayscaleToolNode: GrayscaleToolNode as NodeCtor,
    ThresholdToolNode: ThresholdToolNode as NodeCtor,
    HalftoningToolNode: HalftoningToolNode as NodeCtor,
    HistogramToolNode: HistogramToolNode as NodeCtor,
    LevelsToolNode: LevelsToolNode as NodeCtor,
    RgbSplitToolNode: RgbSplitToolNode as NodeCtor,
    CmykSplitToolNode: CmykSplitToolNode as NodeCtor,
    RgbCombineToolNode: RgbCombineToolNode as NodeCtor,
    CmykCombineToolNode: CmykCombineToolNode as NodeCtor,
    QuantizeToolNode: QuantizeToolNode as NodeCtor,
    QuantizeLevelsToolNode: QuantizeLevelsToolNode as NodeCtor,
    BlendToolNode: BlendToolNode as NodeCtor,
    LayersToolNode: LayersToolNode as NodeCtor,
    BrightnessContrastToolNode: BrightnessContrastToolNode as NodeCtor,
  };
}
