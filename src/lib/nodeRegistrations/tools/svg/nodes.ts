import { drawImagePreview, rasterizeGraphSvg } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../shared";
import type { RoughPathOptions } from "../../../../vendor/rough-runtime";
import {
  createToolTitle,
  formatExecutionInfo,
  notifyGraphStateChange,
  refreshNode,
  roughenGraphSvg,
  simplifyGraphSvg,
} from "../shared";

export class RoughToolNode {
  size: [number, number] = [280, 540];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  lastSvg = "";
  lastOptionsSignature = "";
  renderToken = 0;
  pathCount = 0;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & RoughToolNode;
    node.title = createToolTitle("Rough");
    node.properties = {
      roughness: 1.5,
      bowing: 1,
      strokeWidth: 1.2,
      fillStyle: "hachure",
      hachureAngle: -41,
      hachureGap: 4,
      fillWeight: 1,
      simplification: 0,
      curveStepCount: 9,
      maxRandomnessOffset: 2,
      seed: 1,
      disableMultiStroke: false,
      preserveStroke: true,
      preserveFill: true,
    };
    node.addInput("svg", "svg");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Roughness", 1.5, (value) => {
      node.properties.roughness = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.05, precision: 2 });
    node.addWidget("slider", "Bowing", 1, (value) => {
      node.properties.bowing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.05, precision: 2 });
    node.addWidget("slider", "Stroke", 1.2, (value) => {
      node.properties.strokeWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("combo", "Fill style", "hachure", (value) => {
      node.properties.fillStyle = String(value);
      notifyGraphStateChange(node);
    }, { values: ["hachure", "solid", "zigzag", "cross-hatch", "dots", "dashed", "zigzag-line"] });
    node.addWidget("slider", "Hach gap", 4, (value) => {
      node.properties.hachureGap = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 24, step: 0.5, precision: 1 });
    node.addWidget("slider", "Hach angle", -41, (value) => {
      node.properties.hachureAngle = Number(value);
      notifyGraphStateChange(node);
    }, { min: -180, max: 180, step: 1 });
    node.addWidget("slider", "Fill weight", 1, (value) => {
      node.properties.fillWeight = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Simplify", 0, (value) => {
      node.properties.simplification = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Curve steps", 9, (value) => {
      node.properties.curveStepCount = Number(value);
      notifyGraphStateChange(node);
    }, { min: 4, max: 30, step: 1 });
    node.addWidget("slider", "Random off", 2, (value) => {
      node.properties.maxRandomnessOffset = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 16, step: 0.1, precision: 1 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 9999, step: 1 });
    node.addWidget("toggle", "Mono stroke", false, (value) => {
      node.properties.disableMultiStroke = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Keep stroke", true, (value) => {
      node.properties.preserveStroke = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Keep fill", true, (value) => {
      node.properties.preserveFill = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  getRoughOptions(this: PreviewAwareNode & RoughToolNode) {
    return {
      roughness: Number(this.properties.roughness ?? 1.5),
      bowing: Number(this.properties.bowing ?? 1),
      strokeWidth: Number(this.properties.strokeWidth ?? 1.2),
      fillStyle: String(this.properties.fillStyle ?? "hachure") as RoughPathOptions["fillStyle"],
      hachureAngle: Number(this.properties.hachureAngle ?? -41),
      hachureGap: Number(this.properties.hachureGap ?? 4),
      fillWeight: Number(this.properties.fillWeight ?? 1),
      simplification: Number(this.properties.simplification ?? 0),
      curveStepCount: Math.round(Number(this.properties.curveStepCount ?? 9)),
      maxRandomnessOffset: Number(this.properties.maxRandomnessOffset ?? 2),
      seed: Math.round(Number(this.properties.seed ?? 1)),
      disableMultiStroke: Boolean(this.properties.disableMultiStroke ?? false),
      preserveStroke: Boolean(this.properties.preserveStroke ?? true),
      preserveFill: Boolean(this.properties.preserveFill ?? true),
      fallbackStroke: "#101010",
      fallbackFill: "none",
    };
  }

  onExecute(this: PreviewAwareNode & RoughToolNode) {
    const start = performance.now();
    const svg = this.getInputData(0);
    const inputSvg = typeof svg === "string" ? svg : null;
    if (!inputSvg) {
      this.svg = null;
      this.preview = null;
      this.pathCount = 0;
      this.lastSvg = "";
      this.lastOptionsSignature = "";
      this.executionMs = performance.now() - start;
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = this.getRoughOptions();
    const optionsSignature = JSON.stringify(options);

    if (inputSvg !== this.lastSvg || optionsSignature !== this.lastOptionsSignature) {
      this.lastSvg = inputSvg;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;

      try {
        const transformed = roughenGraphSvg(inputSvg, options);
        this.svg = transformed.svg;
        this.pathCount = transformed.pathCount;
        void rasterizeGraphSvg(transformed.svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.executionMs = null;
            this.setDirtyCanvas(true, true);
          });
      } catch {
        this.svg = null;
        this.preview = null;
        this.pathCount = 0;
        this.executionMs = null;
        this.lastSvg = "";
        this.lastOptionsSignature = "";
      }
    }

    this.setOutputData(0, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RoughToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`rough paths: ${this.pathCount}`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class SvgSimplifyToolNode {
  size: [number, number] = [280, 420];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  pathCount = 0;
  inputBytes = 0;
  outputBytes = 0;
  lastSvg = "";
  lastOptionsSignature = "";
  renderToken = 0;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & SvgSimplifyToolNode;
    node.title = createToolTitle("SVG Simplify");
    node.properties = {
      tolerance: 1.2,
      sampleStep: 2.5,
      precision: 2,
      highQuality: true,
      minify: true,
    };
    node.addInput("svg", "svg");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Tolerance", 1.2, (value) => {
      node.properties.tolerance = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.05, precision: 2 });
    node.addWidget("slider", "Sample step", 2.5, (value) => {
      node.properties.sampleStep = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 12, step: 0.1, precision: 1 });
    node.addWidget("slider", "Precision", 2, (value) => {
      node.properties.precision = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 1 });
    node.addWidget("toggle", "High quality", true, (value) => {
      node.properties.highQuality = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Minify", true, (value) => {
      node.properties.minify = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  getSimplifyOptions(this: PreviewAwareNode & SvgSimplifyToolNode) {
    return {
      tolerance: Number(this.properties.tolerance ?? 1.2),
      sampleStep: Number(this.properties.sampleStep ?? 2.5),
      precision: Math.round(Number(this.properties.precision ?? 2)),
      highQuality: Boolean(this.properties.highQuality ?? true),
      minify: Boolean(this.properties.minify ?? true),
    };
  }

  onExecute(this: PreviewAwareNode & SvgSimplifyToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const inputSvg = typeof input === "string" ? input : null;
    if (!inputSvg) {
      this.svg = null;
      this.preview = null;
      this.pathCount = 0;
      this.inputBytes = 0;
      this.outputBytes = 0;
      this.lastSvg = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.executionMs = performance.now() - start;
      this.refreshPreviewLayout();
      return;
    }

    const options = this.getSimplifyOptions();
    const optionsSignature = JSON.stringify(options);
    this.inputBytes = new Blob([inputSvg]).size;

    if (inputSvg !== this.lastSvg || optionsSignature !== this.lastOptionsSignature) {
      this.lastSvg = inputSvg;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;

      try {
        const result = simplifyGraphSvg(inputSvg, options);
        this.svg = result.svg;
        this.pathCount = result.pathCount;
        this.outputBytes = new Blob([result.svg]).size;
        void rasterizeGraphSvg(result.svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.executionMs = null;
            this.setDirtyCanvas(true, true);
          });
      } catch {
        this.svg = null;
        this.preview = null;
        this.pathCount = 0;
        this.outputBytes = 0;
        this.executionMs = null;
        this.lastSvg = "";
        this.lastOptionsSignature = "";
      }
    }

    this.setOutputData(0, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SvgSimplifyToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    const gain =
      this.inputBytes > 0
        ? Math.max(0, ((this.inputBytes - this.outputBytes) / this.inputBytes) * 100)
        : 0;
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${this.pathCount} paths | ${this.inputBytes} -> ${this.outputBytes} bytes`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(`size reduction: ${gain.toFixed(1)}%`, 10, layout.footerTop + 30);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}
