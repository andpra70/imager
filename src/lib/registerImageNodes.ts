import { LiteGraph } from "litegraph.js";
import type { GraphImage } from "../models/graphImage";
import { resizeNodeForPreview } from "./imageUtils";
import { registerInputNodes, registerOutputNodes } from "./nodeRegistrations/io";
import { createIoNodeCtors } from "./nodeRegistrations/ioRuntime";
import { createToolsNodeCtors } from "./nodeRegistrations/toolsRuntime";
import { registerBasicToolNodes } from "./nodeRegistrations/basic";
import { registerFocusToolNodes } from "./nodeRegistrations/focus";
import { registerColorToolNodes } from "./nodeRegistrations/colors";
import { registerArtToolNodes } from "./nodeRegistrations/art";
import { registerAiToolNodes } from "./nodeRegistrations/ai";
import { registerSvgToolNodes } from "./nodeRegistrations/svg";
import type { LiteNode, NodeCtor, PreviewAwareNode } from "./nodeRegistrations/types";

let registered = false;

function asNodeCtor(ctor: new () => unknown): NodeCtor {
  return ctor as unknown as NodeCtor;
}

function refreshNode(node: PreviewAwareNode, image: CanvasImageSource | null, footerLines = 0) {
  resizeNodeForPreview(node, image, { footerLines });
  node.setDirtyCanvas(true, true);
}

function notifyGraphStateChange(node: LiteNode) {
  node.graph?.onGraphStateChange?.();
}

function getGraphImageSignature(image: GraphImage | null) {
  if (!image) {
    return "none";
  }

  const context = image.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return `${image.width}x${image.height}:nocontent`;
  }

  const samplePoints = [
    [0, 0],
    [Math.floor(image.width / 2), Math.floor(image.height / 2)],
    [Math.max(0, image.width - 1), Math.max(0, image.height - 1)],
    [Math.floor(image.width / 3), Math.floor(image.height * 0.7)],
  ];

  const values = samplePoints
    .map(([x, y]) => {
      const pixel = context.getImageData(x, y, 1, 1).data;
      return `${pixel[0]}-${pixel[1]}-${pixel[2]}-${pixel[3]}`;
    })
    .join("|");

  return `${image.width}x${image.height}:${values}`;
}

function estimateGraphImageColorCount(image: GraphImage) {
  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const sampleWidth = Math.max(1, Math.round(image.width * scale));
  const sampleHeight = Math.max(1, Math.round(image.height * scale));

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) {
    return { count: 0, isEstimated: true };
  }

  sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const unique = new Set<number>();
  for (let index = 0; index < pixels.length; index += 4) {
    const packed =
      pixels[index] |
      (pixels[index + 1] << 8) |
      (pixels[index + 2] << 16) |
      (pixels[index + 3] << 24);
    unique.add(packed >>> 0);
  }

  return {
    count: unique.size,
    isEstimated: sampleWidth !== image.width || sampleHeight !== image.height,
  };
}

function formatGraphImageInfo(image: GraphImage | null) {
  if (!image) {
    return "no image";
  }

  const colorInfo = estimateGraphImageColorCount(image);
  return `${image.width}x${image.height} | ${colorInfo.isEstimated ? "~" : ""}${colorInfo.count} colors`;
}

export function registerImageNodes() {
  if (registered) {
    return;
  }

  const registerNodeType = LiteGraph.registerNodeType.bind(LiteGraph);
  const ioNodeCtors = createIoNodeCtors({
    refreshNode,
    notifyGraphStateChange,
    getGraphImageSignature,
    formatGraphImageInfo,
  });
  const toolsNodeCtors = createToolsNodeCtors();

  registerInputNodes(registerNodeType, {
    InputImageNode: ioNodeCtors.InputImageNode,
    WebcamImageNode: ioNodeCtors.WebcamImageNode,
  });

  registerBasicToolNodes(registerNodeType, {
    RotatePanZoomToolNode: asNodeCtor(toolsNodeCtors.RotatePanZoomToolNode),
    ScaleToolNode: asNodeCtor(toolsNodeCtors.ScaleToolNode),
    RotateToolNode: asNodeCtor(toolsNodeCtors.RotateToolNode),
  });

  registerFocusToolNodes(registerNodeType, {
    BlurToolNode: asNodeCtor(toolsNodeCtors.BlurToolNode),
    SharpenToolNode: asNodeCtor(toolsNodeCtors.SharpenToolNode),
    SobelToolNode: asNodeCtor(toolsNodeCtors.SobelToolNode),
  });

  registerColorToolNodes(registerNodeType, {
    InvertToolNode: asNodeCtor(toolsNodeCtors.InvertToolNode),
    GrayscaleToolNode: asNodeCtor(toolsNodeCtors.GrayscaleToolNode),
    ThresholdToolNode: asNodeCtor(toolsNodeCtors.ThresholdToolNode),
    HalftoningToolNode: asNodeCtor(toolsNodeCtors.HalftoningToolNode),
    HistogramToolNode: asNodeCtor(toolsNodeCtors.HistogramToolNode),
    LevelsToolNode: asNodeCtor(toolsNodeCtors.LevelsToolNode),
    RgbSplitToolNode: asNodeCtor(toolsNodeCtors.RgbSplitToolNode),
    CmykSplitToolNode: asNodeCtor(toolsNodeCtors.CmykSplitToolNode),
    RgbCombineToolNode: asNodeCtor(toolsNodeCtors.RgbCombineToolNode),
    CmykCombineToolNode: asNodeCtor(toolsNodeCtors.CmykCombineToolNode),
    QuantizeToolNode: asNodeCtor(toolsNodeCtors.QuantizeToolNode),
    BlendToolNode: asNodeCtor(toolsNodeCtors.BlendToolNode),
    LayersToolNode: asNodeCtor(toolsNodeCtors.LayersToolNode),
    BrightnessContrastToolNode: asNodeCtor(toolsNodeCtors.BrightnessContrastToolNode),
  });

  registerArtToolNodes(registerNodeType, {
    OilToolNode: asNodeCtor(toolsNodeCtors.OilToolNode),
    Oil2ToolNode: asNodeCtor(toolsNodeCtors.Oil2ToolNode),
    Oil3ToolNode: asNodeCtor(toolsNodeCtors.Oil3ToolNode),
    LinesToolNode: asNodeCtor(toolsNodeCtors.LinesToolNode),
    DotsToolNode: asNodeCtor(toolsNodeCtors.DotsToolNode),
    AsciifyToolNode: asNodeCtor(toolsNodeCtors.AsciifyToolNode),
    SketchToolNode: asNodeCtor(toolsNodeCtors.SketchToolNode),
    DelanoyToolNode: asNodeCtor(toolsNodeCtors.DelanoyToolNode),
    Delanoy2ToolNode: asNodeCtor(toolsNodeCtors.Delanoy2ToolNode),
    LinefyToolNode: asNodeCtor(toolsNodeCtors.LinefyToolNode),
    Linefy2ToolNode: asNodeCtor(toolsNodeCtors.Linefy2ToolNode),
    GridDotToolNode: asNodeCtor(toolsNodeCtors.GridDotToolNode),
    StippleToolNode: asNodeCtor(toolsNodeCtors.StippleToolNode),
    VectorizeToolNode: asNodeCtor(toolsNodeCtors.VectorizeToolNode),
    MarchingToolNode: asNodeCtor(toolsNodeCtors.MarchingToolNode),
    BoldiniToolNode: asNodeCtor(toolsNodeCtors.BoldiniToolNode),
    SeargeantToolNode: asNodeCtor(toolsNodeCtors.SeargeantToolNode),
    CarboncinoToolNode: asNodeCtor(toolsNodeCtors.CarboncinoToolNode),
    CrosshatchBnToolNode: asNodeCtor(toolsNodeCtors.CrosshatchBnToolNode),
    MatitaToolNode: asNodeCtor(toolsNodeCtors.MatitaToolNode),
  });

  registerAiToolNodes(registerNodeType, {
    PoseDetectToolNode: asNodeCtor(toolsNodeCtors.PoseDetectToolNode),
    FaceLandmarkerToolNode: asNodeCtor(toolsNodeCtors.FaceLandmarkerToolNode),
    BgRemoveToolNode: asNodeCtor(toolsNodeCtors.BgRemoveToolNode),
    Ml5ExtractToolNode: asNodeCtor(toolsNodeCtors.Ml5ExtractToolNode),
  });

  registerSvgToolNodes(registerNodeType, {
    RoughToolNode: asNodeCtor(toolsNodeCtors.RoughToolNode),
    SvgSimplifyToolNode: asNodeCtor(toolsNodeCtors.SvgSimplifyToolNode),
  });

  registerOutputNodes(registerNodeType, {
    OutputImageNode: ioNodeCtors.OutputImageNode,
    OutputPaletteNode: ioNodeCtors.OutputPaletteNode,
    OutputSvgNode: ioNodeCtors.OutputSvgNode,
    OutputJsonNode: ioNodeCtors.OutputJsonNode,
    OutputTextNode: ioNodeCtors.OutputTextNode,
  });

  registered = true;
}
