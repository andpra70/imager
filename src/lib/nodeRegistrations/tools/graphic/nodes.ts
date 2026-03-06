import { drawImagePreview } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { LiteNode, PreviewAwareNode } from "../../shared";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  generateBicPencilSingleLineSvg,
  generateSketchSvg,
  getGraphImageSignature,
  isGraphImageReady,
  notifyGraphStateChange,
  refreshNode,
} from "../shared";

export class GraphicSketchToolNode {
  size: [number, number] = [280, 760];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  pathCount = 0;
  iterations = 0;
  finalError = 255;
  stopReason = "-";
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  private setWidgetValue(this: GraphicSketchToolNode, name: string, value: unknown) {
    const widgets = (this as unknown as LiteNode).widgets;
    if (!widgets?.length) {
      return;
    }
    const widget = widgets.find((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      return (item as { name?: unknown }).name === name;
    }) as { value?: unknown } | undefined;
    if (widget) {
      widget.value = value;
    }
  }

  private applyPreset(
    this: PreviewAwareNode & GraphicSketchToolNode,
    preset: "fast" | "medium" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
          maxWidth: 640,
          lineLimit: 800,
          squiggleMaxLength: 240,
          gridCells: 36,
          darkestAreaCandidates: 2,
          simplifyTolerance: 2.4,
          refreshEvery: 40,
          minError: 34,
          errorStabilityDelta: 0.06,
          errorStabilityChecks: 4,
          errorCheckEvery: 30,
        }
        : preset === "slow"
          ? {
            maxWidth: 1400,
            lineLimit: 3600,
            squiggleMaxLength: 1000,
            gridCells: 76,
            darkestAreaCandidates: 7,
            simplifyTolerance: 1.1,
            refreshEvery: 12,
            minError: 11,
            errorStabilityDelta: 0.015,
            errorStabilityChecks: 8,
            errorCheckEvery: 18,
          }
          : {
            maxWidth: 980,
            lineLimit: 1800,
            squiggleMaxLength: 520,
            gridCells: 56,
            darkestAreaCandidates: 4,
            simplifyTolerance: 1.8,
            refreshEvery: 22,
            minError: 20,
            errorStabilityDelta: 0.03,
            errorStabilityChecks: 6,
            errorCheckEvery: 24,
          };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Lines", values.lineLimit);
    this.setWidgetValue("Path len", values.squiggleMaxLength);
    this.setWidgetValue("Grid", values.gridCells);
    this.setWidgetValue("Dark areas", values.darkestAreaCandidates);
    this.setWidgetValue("Simplify", values.simplifyTolerance);
    this.setWidgetValue("Refresh", values.refreshEvery);
    this.setWidgetValue("Min err", values.minError);
    this.setWidgetValue("Err delta", values.errorStabilityDelta);
    this.setWidgetValue("Stable n", values.errorStabilityChecks);
    this.setWidgetValue("Err check", values.errorCheckEvery);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  private markCustom(this: PreviewAwareNode & GraphicSketchToolNode) {
    if (String(this.properties.preset ?? "medium") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & GraphicSketchToolNode;
    node.title = createToolTitle("Graphic Sketch");
    node.properties = {
      preset: "medium",
      maxWidth: 980,
      lineLimit: 1800,
      squiggleMaxLength: 520,
      gridCells: 56,
      darkestAreaCandidates: 4,
      lineWidth: 1,
      lineAlpha: 0.14,
      simplifyTolerance: 1.8,
      lightenStep: 20,
      refreshEvery: 22,
      minError: 20,
      errorStabilityDelta: 0.03,
      errorStabilityChecks: 6,
      errorCheckEvery: 24,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "medium", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "medium" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "medium", "slow", "custom"] });
    node.addWidget("slider", "Max width", 980, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 2600, step: 8 });
    node.addWidget("slider", "Lines", 1800, (value) => {
      node.properties.lineLimit = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 10, max: 18000, step: 1 });
    node.addWidget("slider", "Path len", 520, (value) => {
      node.properties.squiggleMaxLength = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 8, max: 16000, step: 1 });
    node.addWidget("slider", "Grid", 56, (value) => {
      node.properties.gridCells = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 8, max: 500, step: 1 });
    node.addWidget("slider", "Dark areas", 4, (value) => {
      node.properties.darkestAreaCandidates = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 12, step: 1 });
    node.addWidget("slider", "Width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 20, step: 0.1, precision: 1 });
    node.addWidget("slider", "Alpha", 0.14, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Simplify", 1.8, (value) => {
      node.properties.simplifyTolerance = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Lighten", 20, (value) => {
      node.properties.lightenStep = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 255, step: 1 });
    node.addWidget("slider", "Refresh", 22, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 4, max: 256, step: 1 });
    node.addWidget("slider", "Min err", 20, (value) => {
      node.properties.minError = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 255, step: 0.1, precision: 1 });
    node.addWidget("slider", "Err delta", 0.03, (value) => {
      node.properties.errorStabilityDelta = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 10, step: 0.001, precision: 3 });
    node.addWidget("slider", "Stable n", 6, (value) => {
      node.properties.errorStabilityChecks = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 64, step: 1 });
    node.addWidget("slider", "Err check", 24, (value) => {
      node.properties.errorCheckEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 512, step: 1 });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 5);
    node.applyPreset("medium", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GraphicSketchToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.pathCount = 0;
      this.iterations = 0;
      this.finalError = 255;
      this.stopReason = "-";
      this.outputWidth = 0;
      this.outputHeight = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 980)), 128, 2600),
      lineLimit: clamp(Math.round(Number(this.properties.lineLimit ?? 1800)), 10, 18000),
      squiggleMaxLength: clamp(Math.round(Number(this.properties.squiggleMaxLength ?? 520)), 8, 16000),
      gridCells: clamp(Math.round(Number(this.properties.gridCells ?? 56)), 8, 500),
      darkestAreaCandidates: clamp(Math.round(Number(this.properties.darkestAreaCandidates ?? 4)), 1, 12),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 20),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 0.14), 0.01, 1),
      simplifyTolerance: clamp(Number(this.properties.simplifyTolerance ?? 1.8), 0, 8),
      lightenStep: clamp(Math.round(Number(this.properties.lightenStep ?? 20)), 1, 255),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 22)), 4, 256),
      minError: clamp(Number(this.properties.minError ?? 20), 0, 255),
      errorStabilityDelta: clamp(Number(this.properties.errorStabilityDelta ?? 0.03), 0, 10),
      errorStabilityChecks: clamp(Math.round(Number(this.properties.errorStabilityChecks ?? 6)), 1, 64),
      errorCheckEvery: clamp(Math.round(Number(this.properties.errorCheckEvery ?? 24)), 1, 512),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.progress = 0;
      this.status = "generating graphic sketch...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateSketchSvg(
        input,
        options,
        shouldCancel,
        updateProgress,
        (partialPreview) => {
          if (shouldCancel()) {
            return;
          }
          this.preview = partialPreview;
          this.setDirtyCanvas(true, true);
        },
      )
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return;
          }
          this.preview = result.preview;
          this.svg = result.svg;
          this.pathCount = result.pathCount;
          this.iterations = result.iterations;
          this.finalError = result.finalError;
          this.stopReason = result.stopReason;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.progress = 1;
          this.status = "ready";
          this.executionMs = performance.now() - start;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.pathCount = 0;
          this.iterations = 0;
          this.finalError = 255;
          this.stopReason = "-";
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "graphic sketch error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GraphicSketchToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 5 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | paths ${this.pathCount}`, 10, layout.footerTop + 30);
    context.fillText(`iter ${this.iterations} | err ${this.finalError.toFixed(2)} | stop ${this.stopReason}`, 10, layout.footerTop + 48);
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 66);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 84);
    context.restore();
  }
}

export class GraphicPencilToolNode {
  size: [number, number] = [280, 620];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  pointCount = 0;
  pathLength = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GraphicPencilToolNode;
    node.title = createToolTitle("Graphic Pencil");
    node.properties = {
      maxWidth: 1000,
      pointCount: 7000,
      gamma: 1.2,
      contrast: 1.25,
      simplifyTolerance: 1.1,
      lineWidth: 0.8,
      lineAlpha: 0.95,
      optimizePasses: 6,
      maxGenerations: 72,
      offspringPerGeneration: 8,
      mutationRate: 0.02,
      mutationStrength: 8,
      minMse: 1050,
      mseDeltaThreshold: 0.35,
      stableGenerations: 10,
      workScale: 0.55,
      seed: 1,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 1000, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 256, max: 2600, step: 8 });
    node.addWidget("slider", "Points", 7000, (value) => {
      node.properties.pointCount = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 300, max: 25000, step: 1 });
    node.addWidget("slider", "Gamma", 1.2, (value) => {
      node.properties.gamma = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", 1.25, (value) => {
      node.properties.contrast = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Simplify", 1.1, (value) => {
      node.properties.simplifyTolerance = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 10, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 0.8, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line alpha", 0.95, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Optimize", 6, (value) => {
      node.properties.optimizePasses = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 20, step: 1 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GraphicPencilToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.pointCount = 0;
      this.pathLength = 0;
      this.outputWidth = 0;
      this.outputHeight = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1000)), 256, 2600),
      pointCount: clamp(Math.round(Number(this.properties.pointCount ?? 7000)), 300, 25000),
      gamma: clamp(Number(this.properties.gamma ?? 1.2), 0.2, 3),
      contrast: clamp(Number(this.properties.contrast ?? 1.25), 0.2, 4),
      simplifyTolerance: clamp(Number(this.properties.simplifyTolerance ?? 1.1), 0, 10),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 0.8), 0.1, 8),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 0.95), 0.01, 1),
      optimizePasses: clamp(Math.round(Number(this.properties.optimizePasses ?? 6)), 0, 20),
      maxGenerations: clamp(Math.round(Number(this.properties.maxGenerations ?? 72)), 0, 240),
      offspringPerGeneration: clamp(Math.round(Number(this.properties.offspringPerGeneration ?? 8)), 2, 20),
      mutationRate: clamp(Number(this.properties.mutationRate ?? 0.02), 0.001, 0.5),
      mutationStrength: clamp(Number(this.properties.mutationStrength ?? 8), 0.25, 64),
      minMse: clamp(Number(this.properties.minMse ?? 1050), 0, 65025),
      mseDeltaThreshold: clamp(Number(this.properties.mseDeltaThreshold ?? 0.35), 0, 1000),
      stableGenerations: clamp(Math.round(Number(this.properties.stableGenerations ?? 10)), 1, 100),
      workScale: clamp(Number(this.properties.workScale ?? 0.55), 0.1, 1),
      seed: clamp(Math.round(Number(this.properties.seed ?? 1)), 1, 1000000),
    };
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.progress = 0;
      this.status = "generating single line...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) this.status = status;
        this.setDirtyCanvas(true, true);
      };

      void generateBicPencilSingleLineSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) return;
          this.preview = result.preview;
          this.svg = result.svg;
          this.pointCount = result.pointCount;
          this.pathLength = result.pathLength;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.progress = 1;
          this.status = "ready";
          this.executionMs = performance.now() - start;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) return;
          this.preview = input;
          this.svg = null;
          this.pointCount = 0;
          this.pathLength = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "graphic pencil error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GraphicPencilToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | points ${this.pointCount}`, 10, layout.footerTop + 30);
    context.fillText(`length ${Math.round(this.pathLength)} px`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
