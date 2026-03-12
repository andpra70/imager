import { LiteGraph } from "litegraph.js";
import type { GraphImage } from "../models/graphImage";
import { resizeNodeForPreview } from "./imageUtils";
import { registerInputNodes, registerOutputNodes, createIoNodeCtors } from "./nodeRegistrations/io";
import { createToolBasicNodeCtors, registerBasicToolNodes } from "./nodeRegistrations/tools/basic";
import { createToolFocusNodeCtors, registerFocusToolNodes } from "./nodeRegistrations/tools/focus";
import { createToolColorsNodeCtors, registerColorToolNodes } from "./nodeRegistrations/tools/colors";
import { createToolArtNodeCtors, registerArtToolNodes } from "./nodeRegistrations/tools/art";
import { createToolAiNodeCtors, registerAiToolNodes } from "./nodeRegistrations/tools/ai";
import { createToolSvgNodeCtors, registerSvgToolNodes } from "./nodeRegistrations/tools/svg";
import { createToolPlotterNodeCtors, registerPlotterToolNodes } from "./nodeRegistrations/tools/plotter";
import { createToolGraphicNodeCtors, registerGraphicToolNodes } from "./nodeRegistrations/tools/graphic";
import { createToolLinesartNodeCtors, registerLinesartToolNodes } from "./nodeRegistrations/tools/linesart";
import { createToolGcodeNodeCtors, registerGcodeToolNodes } from "./nodeRegistrations/tools/gcode";
import type { LiteNode, PreviewAwareNode } from "./nodeRegistrations/shared";

let registered = false;

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

  const basicToolCtors = createToolBasicNodeCtors();
  const focusToolCtors = createToolFocusNodeCtors();
  const colorsToolCtors = createToolColorsNodeCtors();
  const artToolCtors = createToolArtNodeCtors();
  const aiToolCtors = createToolAiNodeCtors();
  const svgToolCtors = createToolSvgNodeCtors();
  const plotterToolCtors = createToolPlotterNodeCtors();
  const graphicToolCtors = createToolGraphicNodeCtors();
  const linesartToolCtors = createToolLinesartNodeCtors();
  const gcodeToolCtors = createToolGcodeNodeCtors();

  registerInputNodes(registerNodeType, {
    InputImageNode: ioNodeCtors.InputImageNode,
    InputSvgNode: ioNodeCtors.InputSvgNode,
    WebcamImageNode: ioNodeCtors.WebcamImageNode,
  });

  registerBasicToolNodes(registerNodeType, {
    RotatePanZoomToolNode: basicToolCtors.RotatePanZoomToolNode,
    ScaleToolNode: basicToolCtors.ScaleToolNode,
    RotateToolNode: basicToolCtors.RotateToolNode,
  });

  registerFocusToolNodes(registerNodeType, {
    BlurToolNode: focusToolCtors.BlurToolNode,
    SharpenToolNode: focusToolCtors.SharpenToolNode,
    SobelToolNode: focusToolCtors.SobelToolNode,
  });

  registerColorToolNodes(registerNodeType, {
    InvertToolNode: colorsToolCtors.InvertToolNode,
    GrayscaleToolNode: colorsToolCtors.GrayscaleToolNode,
    ThresholdToolNode: colorsToolCtors.ThresholdToolNode,
    HalftoningToolNode: colorsToolCtors.HalftoningToolNode,
    HistogramToolNode: colorsToolCtors.HistogramToolNode,
    LevelsToolNode: colorsToolCtors.LevelsToolNode,
    RgbSplitToolNode: colorsToolCtors.RgbSplitToolNode,
    CmykSplitToolNode: colorsToolCtors.CmykSplitToolNode,
    RgbCombineToolNode: colorsToolCtors.RgbCombineToolNode,
    CmykCombineToolNode: colorsToolCtors.CmykCombineToolNode,
    QuantizeToolNode: colorsToolCtors.QuantizeToolNode,
    BlendToolNode: colorsToolCtors.BlendToolNode,
    LayersToolNode: colorsToolCtors.LayersToolNode,
    BrightnessContrastToolNode: colorsToolCtors.BrightnessContrastToolNode,
  });

  registerArtToolNodes(registerNodeType, {
    OilToolNode: artToolCtors.OilToolNode,
    Oil2ToolNode: artToolCtors.Oil2ToolNode,
    Oil3ToolNode: artToolCtors.Oil3ToolNode,
    WatercolourToolNode: artToolCtors.WatercolourToolNode,
    LinesToolNode: artToolCtors.LinesToolNode,
    DotsToolNode: artToolCtors.DotsToolNode,
    AsciifyToolNode: artToolCtors.AsciifyToolNode,
    SketchToolNode: artToolCtors.SketchToolNode,
    DelanoyToolNode: artToolCtors.DelanoyToolNode,
    Delanoy2ToolNode: artToolCtors.Delanoy2ToolNode,
    LinefyToolNode: artToolCtors.LinefyToolNode,
    Linefy2ToolNode: artToolCtors.Linefy2ToolNode,
    GridDotToolNode: artToolCtors.GridDotToolNode,
    StippleToolNode: artToolCtors.StippleToolNode,
    VectorizeToolNode: artToolCtors.VectorizeToolNode,
    MarchingToolNode: artToolCtors.MarchingToolNode,
    BoldiniToolNode: artToolCtors.BoldiniToolNode,
    SeargeantToolNode: artToolCtors.SeargeantToolNode,
    CarboncinoToolNode: artToolCtors.CarboncinoToolNode,
    CrosshatchBnToolNode: artToolCtors.CrosshatchBnToolNode,
    MatitaToolNode: artToolCtors.MatitaToolNode,
  });

  registerAiToolNodes(registerNodeType, {
    PoseDetectToolNode: aiToolCtors.PoseDetectToolNode,
    FaceLandmarkerToolNode: aiToolCtors.FaceLandmarkerToolNode,
    BgRemoveToolNode: aiToolCtors.BgRemoveToolNode,
    Ml5ExtractToolNode: aiToolCtors.Ml5ExtractToolNode,
  });

  registerSvgToolNodes(registerNodeType, {
    RoughToolNode: svgToolCtors.RoughToolNode,
    SvgSimplifyToolNode: svgToolCtors.SvgSimplifyToolNode,
  });

  registerPlotterToolNodes(registerNodeType, plotterToolCtors);

  registerGraphicToolNodes(registerNodeType, {
    GraphicSketchToolNode: graphicToolCtors.GraphicSketchToolNode,
    GraphicPencilToolNode: graphicToolCtors.GraphicPencilToolNode,
    GraphicTonalShadingToolNode: graphicToolCtors.GraphicTonalShadingToolNode,
    GraphicHatchingToolNode: graphicToolCtors.GraphicHatchingToolNode,
    GraphicScumblingToolNode: graphicToolCtors.GraphicScumblingToolNode,
    GraphicCrosshatichingToolNode: graphicToolCtors.GraphicCrosshatichingToolNode,
    GraphicScribblingToolNode: graphicToolCtors.GraphicScribblingToolNode,
  });

  registerLinesartToolNodes(registerNodeType, linesartToolCtors);

  registerGcodeToolNodes(registerNodeType, {
    SvgToGcodeToolNode: gcodeToolCtors.SvgToGcodeToolNode,
    GcodeViewerToolNode: gcodeToolCtors.GcodeViewerToolNode,
    GcodeCncToolNode: gcodeToolCtors.GcodeCncToolNode,
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
