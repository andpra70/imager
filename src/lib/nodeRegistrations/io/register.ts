import type { NodeCtor, RegisterNodeTypeFn } from "../shared";

interface InputNodeCtors {
  InputImageNode: NodeCtor;
  InputSvgNode: NodeCtor;
  WebcamImageNode: NodeCtor;
}

interface OutputNodeCtors {
  OutputImageNode: NodeCtor;
  OutputPaletteNode: NodeCtor;
  OutputSvgNode: NodeCtor;
  OutputJsonNode: NodeCtor;
  OutputTextNode: NodeCtor;
}

export function registerInputNodes(registerNodeType: RegisterNodeTypeFn, ctors: InputNodeCtors) {
  registerNodeType("input/image", ctors.InputImageNode);
  registerNodeType("input/svg", ctors.InputSvgNode);
  registerNodeType("input/webcam", ctors.WebcamImageNode);
}

export function registerOutputNodes(registerNodeType: RegisterNodeTypeFn, ctors: OutputNodeCtors) {
  registerNodeType("output/image", ctors.OutputImageNode);
  registerNodeType("output/palette", ctors.OutputPaletteNode);
  registerNodeType("output/svg", ctors.OutputSvgNode);
  registerNodeType("output/ml5", ctors.OutputJsonNode);
  registerNodeType("output/txt", ctors.OutputTextNode);
}
