import { drawImagePreview } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { NodeCtor, PreviewAwareNode } from "../../shared";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  getGraphImageSignature,
  notifyGraphStateChange,
  refreshNode,
} from "../shared";
import {
  lineArtAlgorithms,
  lineArtDefaultOptions,
  type LineArtAlgorithmOptions,
  type LineArtAlgorithmSpec,
  type LineArtControlSpec,
} from "./model";
import { countSvgElements, executeLineArtAlgorithm } from "./algorithmRuntime";

interface LineArtNodePayload {
  family: "linesart";
  schemaVersion: 1;
  algorithm: {
    id: string;
    type: string;
    label: string;
    description: string;
  };
  image: {
    width: number;
    height: number;
  } | null;
  options: LineArtAlgorithmOptions;
}

function getPrecisionFromStep(step: number | undefined) {
  if (step === undefined || Number.isInteger(step)) {
    return undefined;
  }
  const decimals = step.toString().split(".")[1];
  return decimals ? decimals.length : undefined;
}

function normalizeOptions(spec: LineArtAlgorithmSpec, properties: Record<string, unknown>): LineArtAlgorithmOptions {
  const options: LineArtAlgorithmOptions = { ...lineArtDefaultOptions };
  const mutableOptions = options as Record<keyof LineArtAlgorithmOptions, string | number | boolean>;

  for (const control of spec.controls) {
    const rawValue = properties[control.key];
    if (control.type === "toggle") {
      mutableOptions[control.key] = Boolean(rawValue);
      continue;
    }
    if (control.type === "text") {
      mutableOptions[control.key] = String(rawValue ?? control.defaultValue);
      continue;
    }

    const numericValue = Number(rawValue);
    const fallback = Number(control.defaultValue);
    const validNumber = Number.isFinite(numericValue) ? numericValue : fallback;
    mutableOptions[control.key] = clamp(validNumber, control.min, control.max);
  }

  return options;
}

function buildNodePayload(
  spec: LineArtAlgorithmSpec,
  properties: Record<string, unknown>,
  image: GraphImage | null,
): LineArtNodePayload {
  return {
    family: "linesart",
    schemaVersion: 1,
    algorithm: {
      id: spec.id,
      type: spec.type,
      label: spec.label,
      description: spec.description,
    },
    image: image
      ? {
        width: image.width,
        height: image.height,
      }
      : null,
    options: normalizeOptions(spec, properties),
  };
}

function createDefaultProperties(spec: LineArtAlgorithmSpec) {
  const properties: Record<string, unknown> = { ...lineArtDefaultOptions };
  for (const control of spec.controls) {
    properties[control.key] = control.defaultValue;
  }
  return properties;
}

function addControlWidget(node: PreviewAwareNode, control: LineArtControlSpec) {
  if (control.type === "toggle") {
    node.addWidget("toggle", control.label, control.defaultValue, (value) => {
      node.properties[control.key] = Boolean(value);
      notifyGraphStateChange(node);
    });
    return;
  }

  if (control.type === "text") {
    node.addWidget("text", control.label, control.defaultValue, (value) => {
      node.properties[control.key] = String(value ?? "");
      notifyGraphStateChange(node);
    });
    return;
  }

  const precision = getPrecisionFromStep(control.step);
  node.addWidget(
    "slider",
    control.label,
    control.defaultValue,
    (value) => {
      const numericValue = Number(value);
      const fallback = Number(control.defaultValue);
      const safeValue = Number.isFinite(numericValue) ? numericValue : fallback;
      node.properties[control.key] = clamp(safeValue, control.min, control.max);
      notifyGraphStateChange(node);
    },
    {
      min: control.min,
      max: control.max,
      step: control.step ?? 1,
      ...(precision !== undefined ? { precision } : {}),
    },
  );
}

function createNodeCtor(spec: LineArtAlgorithmSpec): NodeCtor {
  class LineArtToolNode {
    size: [number, number] = [320, 500];
    preview: GraphImage | null = null;
    svg: GraphSvg | null = null;
    payload: LineArtNodePayload | null = null;
    status = "idle";
    pathCount = 0;
    executionMs: number | null = null;
    lastSignature = "";
    lastOptionsSignature = "";

    constructor() {
      const node = this as unknown as PreviewAwareNode & LineArtToolNode;
      node.title = createToolTitle(`LinesArt/${spec.label}`);
      node.properties = createDefaultProperties(spec);
      node.addInput("image", "image");
      node.addOutput("image", "image");
      node.addOutput("svg", "svg");

      for (const control of spec.controls) {
        addControlWidget(node, control);
      }

      node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4);
      node.refreshPreviewLayout();
    }

    onExecute(this: PreviewAwareNode & LineArtToolNode) {
      const input = this.getInputData(0);
      const image = input ?? null;
      this.payload = buildNodePayload(spec, this.properties, image);

      if (!image) {
        this.preview = null;
        this.svg = null;
        this.status = "waiting image";
        this.pathCount = 0;
        this.executionMs = null;
        this.lastSignature = "";
        this.lastOptionsSignature = "";
        this.setOutputData(0, null);
        this.setOutputData(1, null);
        this.refreshPreviewLayout();
        return;
      }

      const signature = getGraphImageSignature(image);
      const optionsSignature = JSON.stringify(this.payload.options);
      if (signature === this.lastSignature && optionsSignature === this.lastOptionsSignature) {
        this.setOutputData(0, this.preview);
        this.setOutputData(1, this.svg);
        return;
      }

      const startedAt = performance.now();
      try {
        const result = executeLineArtAlgorithm({
          algorithmId: spec.id,
          image,
          options: this.payload.options,
        });
        this.preview = result.preview;
        this.svg = result.svg;
        this.pathCount = result.pathCount || countSvgElements(result.svg);
        this.status = "ready";
        this.executionMs = performance.now() - startedAt;
        this.lastSignature = signature;
        this.lastOptionsSignature = optionsSignature;
      } catch (error) {
        this.preview = image;
        this.svg = null;
        this.pathCount = 0;
        this.status = error instanceof Error ? error.message : "linesart runtime error";
        this.executionMs = null;
        this.lastSignature = "";
        this.lastOptionsSignature = "";
      }

      this.setOutputData(0, this.preview);
      this.setOutputData(1, this.svg);
      this.refreshPreviewLayout();
    }

    onDrawBackground(this: PreviewAwareNode & LineArtToolNode, context: CanvasRenderingContext2D) {
      const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
      context.save();
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.font = "12px sans-serif";
      context.fillText(`algo: ${spec.id} | ${this.status}`, 10, layout.footerTop + 12);
      context.fillText(`paths: ${this.pathCount}`, 10, layout.footerTop + 30);
      context.fillText(`size: ${this.preview ? `${this.preview.width}x${this.preview.height}` : "-"}`, 10, layout.footerTop + 48);
      context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
      context.restore();
    }
  }

  return LineArtToolNode as unknown as NodeCtor;
}

export function createLinesartNodeCtors(): Record<string, NodeCtor> {
  const ctors: Record<string, NodeCtor> = {};
  for (const spec of lineArtAlgorithms) {
    ctors[spec.type] = createNodeCtor(spec);
  }
  return ctors;
}
