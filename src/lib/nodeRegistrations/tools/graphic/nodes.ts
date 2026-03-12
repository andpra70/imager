import { drawImagePreview, rasterizeGraphSvg } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { LiteNode, PreviewAwareNode } from "../../shared";
import potraceRuntime, { type PotraceTurnPolicy } from "../../../../vendor/potrace-runtime";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  generateBicPencilSingleLineSvg,
  generateGraphicHatchingSvg,
  generateGraphicScumblingSvg,
  generateGraphicCrosshatichingSvg,
  generateGraphicScribblingSvg,
  generateSketchSvg,
  generateTonalShadingSvg,
  getGraphImageSignature,
  isGraphImageReady,
  normalizeHexColor,
  notifyGraphStateChange,
  refreshNode,
} from "../shared";

function logNodeError(nodeKind: string, error: unknown, details?: Record<string, unknown>) {
  if (details) {
    console.error(`[${nodeKind}]`, error, details);
    return;
  }
  console.error(`[${nodeKind}]`, error);
}

const GRAPHIC_PENCIL_STORAGE_KEY = "plotterfun.tools.graphic.pencil.params.v1";

interface GraphicPencilPersistedProperties {
  maxWidth: number;
  pointCount: number;
  gamma: number;
  contrast: number;
  simplifyTolerance: number;
  lineWidth: number;
  lineAlpha: number;
  optimizePasses: number;
  maxGenerations: number;
  offspringPerGeneration: number;
  mutationRate: number;
  mutationStrength: number;
  minMse: number;
  mseDeltaThreshold: number;
  stableGenerations: number;
  workScale: number;
  penUpDistanceFactor: number;
  curveMode: "line" | "quadratic" | "cubic";
  curveTension: number;
  seed: number;
}

function getDefaultGraphicPencilProperties(): GraphicPencilPersistedProperties {
  return {
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
    penUpDistanceFactor: 2.2,
    curveMode: "line",
    curveTension: 0.45,
    seed: 1,
  };
}

function readGraphicPencilPropertiesFromStorage(): Partial<GraphicPencilPersistedProperties> {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(GRAPHIC_PENCIL_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Partial<GraphicPencilPersistedProperties>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const defaults = getDefaultGraphicPencilProperties();
    const safeNumber = (value: unknown, fallback: number) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    };
    const modeRaw = String(parsed.curveMode ?? "line");
    const curveMode: "line" | "quadratic" | "cubic" =
      modeRaw === "quadratic" || modeRaw === "cubic" ? modeRaw : "line";
    return {
      maxWidth: safeNumber(parsed.maxWidth, defaults.maxWidth),
      pointCount: safeNumber(parsed.pointCount, defaults.pointCount),
      gamma: safeNumber(parsed.gamma, defaults.gamma),
      contrast: safeNumber(parsed.contrast, defaults.contrast),
      simplifyTolerance: safeNumber(parsed.simplifyTolerance, defaults.simplifyTolerance),
      lineWidth: safeNumber(parsed.lineWidth, defaults.lineWidth),
      lineAlpha: safeNumber(parsed.lineAlpha, defaults.lineAlpha),
      optimizePasses: safeNumber(parsed.optimizePasses, defaults.optimizePasses),
      maxGenerations: safeNumber(parsed.maxGenerations, defaults.maxGenerations),
      offspringPerGeneration: safeNumber(parsed.offspringPerGeneration, defaults.offspringPerGeneration),
      mutationRate: safeNumber(parsed.mutationRate, defaults.mutationRate),
      mutationStrength: safeNumber(parsed.mutationStrength, defaults.mutationStrength),
      minMse: safeNumber(parsed.minMse, defaults.minMse),
      mseDeltaThreshold: safeNumber(parsed.mseDeltaThreshold, defaults.mseDeltaThreshold),
      stableGenerations: safeNumber(parsed.stableGenerations, defaults.stableGenerations),
      workScale: safeNumber(parsed.workScale, defaults.workScale),
      penUpDistanceFactor: safeNumber(parsed.penUpDistanceFactor, defaults.penUpDistanceFactor),
      curveMode,
      curveTension: safeNumber(parsed.curveTension, defaults.curveTension),
      seed: safeNumber(parsed.seed, defaults.seed),
    };
  } catch (error) {
    logNodeError("GraphicPencilToolNode/storage-read", error);
    return {};
  }
}

function saveGraphicPencilPropertiesToStorage(properties: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const defaults = getDefaultGraphicPencilProperties();
    const modeRaw = String(properties.curveMode ?? defaults.curveMode);
    const safeMode: "line" | "quadratic" | "cubic" =
      modeRaw === "quadratic" || modeRaw === "cubic" ? modeRaw : "line";
    const payload: GraphicPencilPersistedProperties = {
      maxWidth: Number(properties.maxWidth ?? defaults.maxWidth),
      pointCount: Number(properties.pointCount ?? defaults.pointCount),
      gamma: Number(properties.gamma ?? defaults.gamma),
      contrast: Number(properties.contrast ?? defaults.contrast),
      simplifyTolerance: Number(properties.simplifyTolerance ?? defaults.simplifyTolerance),
      lineWidth: Number(properties.lineWidth ?? defaults.lineWidth),
      lineAlpha: Number(properties.lineAlpha ?? defaults.lineAlpha),
      optimizePasses: Number(properties.optimizePasses ?? defaults.optimizePasses),
      maxGenerations: Number(properties.maxGenerations ?? defaults.maxGenerations),
      offspringPerGeneration: Number(properties.offspringPerGeneration ?? defaults.offspringPerGeneration),
      mutationRate: Number(properties.mutationRate ?? defaults.mutationRate),
      mutationStrength: Number(properties.mutationStrength ?? defaults.mutationStrength),
      minMse: Number(properties.minMse ?? defaults.minMse),
      mseDeltaThreshold: Number(properties.mseDeltaThreshold ?? defaults.mseDeltaThreshold),
      stableGenerations: Number(properties.stableGenerations ?? defaults.stableGenerations),
      workScale: Number(properties.workScale ?? defaults.workScale),
      penUpDistanceFactor: Number(properties.penUpDistanceFactor ?? defaults.penUpDistanceFactor),
      curveMode: safeMode,
      curveTension: Number(properties.curveTension ?? defaults.curveTension),
      seed: Number(properties.seed ?? defaults.seed),
    };
    window.localStorage.setItem(GRAPHIC_PENCIL_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    logNodeError("GraphicPencilToolNode/storage-write", error);
  }
}

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
          logNodeError("GraphicSketchToolNode", error, {
            options,
            inputSize: `${input.width}x${input.height}`,
          });
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
    const defaults = getDefaultGraphicPencilProperties();
    node.properties = {
      ...defaults,
      ...readGraphicPencilPropertiesFromStorage(),
    };
    const persistParams = () => saveGraphicPencilPropertiesToStorage(node.properties);
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", Number(node.properties.maxWidth), (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 256, max: 2600, step: 8 });
    node.addWidget("slider", "Points", Number(node.properties.pointCount), (value) => {
      node.properties.pointCount = Math.round(Number(value));
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 300, max: 25000, step: 1 });
    node.addWidget("slider", "Gamma", Number(node.properties.gamma), (value) => {
      node.properties.gamma = Number(value);
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", Number(node.properties.contrast), (value) => {
      node.properties.contrast = Number(value);
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Simplify", Number(node.properties.simplifyTolerance), (value) => {
      node.properties.simplifyTolerance = Number(value);
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 0, max: 10, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", Number(node.properties.lineWidth), (value) => {
      node.properties.lineWidth = Number(value);
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line alpha", Number(node.properties.lineAlpha), (value) => {
      node.properties.lineAlpha = Number(value);
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Optimize", Number(node.properties.optimizePasses), (value) => {
      node.properties.optimizePasses = Math.round(Number(value));
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 0, max: 20, step: 1 });
    node.addWidget("slider", "Pen-up jump", Number(node.properties.penUpDistanceFactor), (value) => {
      node.properties.penUpDistanceFactor = Number(value);
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 1, max: 12, step: 0.1, precision: 1 });
    node.addWidget("combo", "Curve", String(node.properties.curveMode), (value) => {
      const mode = String(value);
      node.properties.curveMode =
        mode === "quadratic" || mode === "cubic" ? mode : "line";
      persistParams();
      notifyGraphStateChange(node);
    }, { values: ["line", "quadratic", "cubic"] });
    node.addWidget("slider", "Curve T", Number(node.properties.curveTension), (value) => {
      node.properties.curveTension = Number(value);
      persistParams();
      notifyGraphStateChange(node);
    }, { min: 0, max: 1.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Seed", Number(node.properties.seed), (value) => {
      node.properties.seed = Math.round(Number(value));
      persistParams();
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
      penUpDistanceFactor: clamp(Number(this.properties.penUpDistanceFactor ?? 2.2), 1, 12),
      curveMode: ((modeRaw: unknown): "line" | "quadratic" | "cubic" => {
        const mode = String(modeRaw ?? "line");
        return mode === "quadratic" || mode === "cubic" ? mode : "line";
      })(this.properties.curveMode),
      curveTension: clamp(Number(this.properties.curveTension ?? 0.45), 0, 1.5),
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
          logNodeError("GraphicPencilToolNode", error, {
            options,
            inputSize: `${input.width}x${input.height}`,
          });
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

export class GraphicTonalShadingToolNode {
  size: [number, number] = [280, 760];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  strokeCount = 0;
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GraphicTonalShadingToolNode;
    node.title = createToolTitle("Graphic TonalShading");
    node.properties = {
      maxWidth: 1280,
      cellSize: 6,
      toneGamma: 1.1,
      contrast: 1.2,
      detailBoost: 0.7,
      lineWidth: 0.65,
      lineAlpha: 0.92,
      minStrokeLength: 2,
      maxStrokeLength: 14,
      maxLinesPerCell: 8,
      directionCount: 4,
      jitter: 0.65,
      angleJitter: 9,
      curveBend: 0.55,
      threshold: 0.08,
      maxStrokes: 35000,
      seed: 1,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 1280, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 256, max: 3200, step: 8 });
    node.addWidget("slider", "Cell", 6, (value) => {
      node.properties.cellSize = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 3, max: 32, step: 1 });
    node.addWidget("slider", "Tone gamma", 1.1, (value) => {
      node.properties.toneGamma = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.3, max: 3.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", 1.2, (value) => {
      node.properties.contrast = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Detail", 0.7, (value) => {
      node.properties.detailBoost = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 2.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Line width", 0.65, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.05, precision: 2 });
    node.addWidget("slider", "Line alpha", 0.92, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.02, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Min len", 2, (value) => {
      node.properties.minStrokeLength = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 80, step: 0.1, precision: 1 });
    node.addWidget("slider", "Max len", 14, (value) => {
      node.properties.maxStrokeLength = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 180, step: 0.5, precision: 1 });
    node.addWidget("slider", "Lines/cell", 8, (value) => {
      node.properties.maxLinesPerCell = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 32, step: 1 });
    node.addWidget("slider", "Directions", 4, (value) => {
      node.properties.directionCount = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 8, step: 1 });
    node.addWidget("slider", "Jitter", 0.65, (value) => {
      node.properties.jitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Angle jitter", 9, (value) => {
      node.properties.angleJitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 60, step: 0.5, precision: 1 });
    node.addWidget("slider", "Curve bend", 0.55, (value) => {
      node.properties.curveBend = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 2.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Threshold", 0.08, (value) => {
      node.properties.threshold = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.95, step: 0.01, precision: 2 });
    node.addWidget("slider", "Max strokes", 35000, (value) => {
      node.properties.maxStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 500, max: 250000, step: 100 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 5);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GraphicTonalShadingToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.strokeCount = 0;
      this.pathCount = 0;
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1280)), 256, 3200),
      cellSize: clamp(Math.round(Number(this.properties.cellSize ?? 6)), 3, 32),
      toneGamma: clamp(Number(this.properties.toneGamma ?? 1.1), 0.3, 3.5),
      contrast: clamp(Number(this.properties.contrast ?? 1.2), 0.2, 4),
      detailBoost: clamp(Number(this.properties.detailBoost ?? 0.7), 0, 2.5),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 0.65), 0.1, 8),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 0.92), 0.02, 1),
      minStrokeLength: clamp(Number(this.properties.minStrokeLength ?? 2), 0.5, 80),
      maxStrokeLength: clamp(Number(this.properties.maxStrokeLength ?? 14), 0.5, 180),
      maxLinesPerCell: clamp(Math.round(Number(this.properties.maxLinesPerCell ?? 8)), 1, 32),
      directionCount: clamp(Math.round(Number(this.properties.directionCount ?? 4)), 1, 8),
      jitter: clamp(Number(this.properties.jitter ?? 0.65), 0, 4),
      angleJitter: clamp(Number(this.properties.angleJitter ?? 9), 0, 60),
      curveBend: clamp(Number(this.properties.curveBend ?? 0.55), 0, 2.5),
      threshold: clamp(Number(this.properties.threshold ?? 0.08), 0, 0.95),
      maxStrokes: clamp(Math.round(Number(this.properties.maxStrokes ?? 35000)), 500, 250000),
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
      this.status = "generating tonal shading...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateTonalShadingSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) return;
          this.preview = result.preview;
          this.svg = result.svg;
          this.strokeCount = result.strokeCount;
          this.pathCount = result.pathCount;
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
          logNodeError("GraphicTonalShadingToolNode", error, {
            options,
            inputSize: `${input.width}x${input.height}`,
          });
          this.preview = input;
          this.svg = null;
          this.strokeCount = 0;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "graphic tonal shading error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GraphicTonalShadingToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 5 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | strokes ${this.strokeCount}`, 10, layout.footerTop + 30);
    context.fillText(`paths ${this.pathCount}`, 10, layout.footerTop + 48);
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 66);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 84);
    context.restore();
  }
}

export class GraphicHatchingToolNode {
  size: [number, number] = [280, 920];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  lineCount = 0;
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GraphicHatchingToolNode;
    node.title = createToolTitle("Graphic Hatching");
    node.properties = {
      maxWidth: 1500,
      preset: "NORMAL",
      angleCount: 6,
      baseSpacing: 5.6,
      sampleStep: 1.4,
      toneGamma: 1.08,
      contrast: 1.16,
      detailBoost: 0.88,
      threshold: 0.1,
      minSegmentLength: 3,
      lineWidth: 0.58,
      lineAlpha: 0.93,
      lineColor: "#101010",
      curveSmoothing: 0.68,
      penUpDistanceFactor: 2.35,
      maxPaths: 120000,
      seed: 1,
      simulateHand: false,
      handWobble: 0.6,
      handJitter: 0.35,
      handBreakProb: 0.02,
      handPressure: 0.24,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 1500, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 256, max: 3200, step: 8 });
    node.addWidget("combo", "Preset", "NORMAL", (value) => {
      const raw = String(value).toUpperCase();
      node.properties.preset = raw === "FAST" || raw === "SLOW" ? raw : "NORMAL";
      notifyGraphStateChange(node);
    }, { values: ["FAST", "NORMAL", "SLOW"] });
    node.addWidget("slider", "Angles", 6, (value) => {
      node.properties.angleCount = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 2, max: 14, step: 1 });
    node.addWidget("slider", "Spacing", 5.6, (value) => {
      node.properties.baseSpacing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1.4, max: 64, step: 0.1, precision: 1 });
    node.addWidget("slider", "Sample step", 1.4, (value) => {
      node.properties.sampleStep = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.45, max: 14, step: 0.05, precision: 2 });
    node.addWidget("slider", "Tone gamma", 1.08, (value) => {
      node.properties.toneGamma = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", 1.16, (value) => {
      node.properties.contrast = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Detail", 0.88, (value) => {
      node.properties.detailBoost = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3.2, step: 0.01, precision: 2 });
    node.addWidget("slider", "Threshold", 0.1, (value) => {
      node.properties.threshold = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.99, step: 0.01, precision: 2 });
    node.addWidget("slider", "Min seg", 3, (value) => {
      node.properties.minSegmentLength = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 180, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 0.58, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.08, max: 8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Line alpha", 0.93, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 1, step: 0.01, precision: 2 });
    node.addWidget("text", "Line color", "#101010", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Smoothing", 0.68, (value) => {
      node.properties.curveSmoothing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1.7, step: 0.01, precision: 2 });
    node.addWidget("slider", "Pen-up jump", 2.35, (value) => {
      node.properties.penUpDistanceFactor = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 16, step: 0.1, precision: 1 });
    node.addWidget("slider", "Max paths", 120000, (value) => {
      node.properties.maxPaths = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 300, max: 320000, step: 100 });
    node.addWidget("combo", "Manual", "off", (value) => {
      node.properties.simulateHand = String(value) === "on";
      notifyGraphStateChange(node);
    }, { values: ["off", "on"] });
    node.addWidget("slider", "Hand wobble", 0.6, (value) => {
      node.properties.handWobble = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Hand jitter", 0.35, (value) => {
      node.properties.handJitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Hand breaks", 0.02, (value) => {
      node.properties.handBreakProb = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.75, step: 0.001, precision: 3 });
    node.addWidget("slider", "Hand pressure", 0.24, (value) => {
      node.properties.handPressure = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 5);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GraphicHatchingToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.lineCount = 0;
      this.pathCount = 0;
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

    const presetRaw = String(this.properties.preset ?? "NORMAL").toUpperCase();
    const preset: "FAST" | "NORMAL" | "SLOW" =
      presetRaw === "FAST" || presetRaw === "SLOW" ? presetRaw : "NORMAL";
    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1500)), 256, 3200),
      preset,
      angleCount: clamp(Math.round(Number(this.properties.angleCount ?? 6)), 2, 14),
      baseSpacing: clamp(Number(this.properties.baseSpacing ?? 5.6), 1.4, 64),
      sampleStep: clamp(Number(this.properties.sampleStep ?? 1.4), 0.45, 14),
      toneGamma: clamp(Number(this.properties.toneGamma ?? 1.08), 0.2, 4),
      contrast: clamp(Number(this.properties.contrast ?? 1.16), 0.2, 4),
      detailBoost: clamp(Number(this.properties.detailBoost ?? 0.88), 0, 3.2),
      threshold: clamp(Number(this.properties.threshold ?? 0.1), 0, 0.99),
      minSegmentLength: clamp(Number(this.properties.minSegmentLength ?? 3), 0.5, 180),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 0.58), 0.08, 8),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 0.93), 0.01, 1),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#101010")),
      curveSmoothing: clamp(Number(this.properties.curveSmoothing ?? 0.68), 0, 1.7),
      penUpDistanceFactor: clamp(Number(this.properties.penUpDistanceFactor ?? 2.35), 1, 16),
      maxPaths: clamp(Math.round(Number(this.properties.maxPaths ?? 120000)), 300, 320000),
      seed: clamp(Math.round(Number(this.properties.seed ?? 1)), 1, 1000000),
      simulateHand: Boolean(this.properties.simulateHand),
      handWobble: clamp(Number(this.properties.handWobble ?? 0.6), 0, 8),
      handJitter: clamp(Number(this.properties.handJitter ?? 0.35), 0, 5),
      handBreakProb: clamp(Number(this.properties.handBreakProb ?? 0.02), 0, 0.75),
      handPressure: clamp(Number(this.properties.handPressure ?? 0.24), 0, 1),
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
      this.status = "generating hatching...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateGraphicHatchingSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) return;
          this.preview = result.preview;
          this.svg = result.svg;
          this.lineCount = result.lineCount;
          this.pathCount = result.pathCount;
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
          logNodeError("GraphicHatchingToolNode", error, {
            options,
            inputSize: `${input.width}x${input.height}`,
          });
          this.preview = input;
          this.svg = null;
          this.lineCount = 0;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "graphic hatching error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GraphicHatchingToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 5 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | lines ${this.lineCount}`, 10, layout.footerTop + 30);
    context.fillText(`paths ${this.pathCount}`, 10, layout.footerTop + 48);
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 66);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 84);
    context.restore();
  }
}

export class GraphicScumblingToolNode {
  size: [number, number] = [280, 940];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  strokeCount = 0;
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GraphicScumblingToolNode;
    node.title = createToolTitle("Graphic Scumbling");
    node.properties = {
      maxWidth: 1500,
      preset: "NORMAL",
      sampleGrid: 4.4,
      baseRadius: 1.7,
      radiusJitter: 0.8,
      loopTurns: 1.8,
      pointsPerTurn: 16,
      toneGamma: 1.06,
      contrast: 1.14,
      detailBoost: 0.92,
      threshold: 0.08,
      lineWidth: 0.48,
      lineAlpha: 0.92,
      lineColor: "#111111",
      curveSmoothing: 0.72,
      maxPaths: 140000,
      seed: 1,
      simulateHand: true,
      handWobble: 0.35,
      handJitter: 0.25,
      handBreakProb: 0.012,
      handPressure: 0.24,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 1500, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 256, max: 3200, step: 8 });
    node.addWidget("combo", "Preset", "NORMAL", (value) => {
      const raw = String(value).toUpperCase();
      node.properties.preset = raw === "FAST" || raw === "SLOW" ? raw : "NORMAL";
      notifyGraphStateChange(node);
    }, { values: ["FAST", "NORMAL", "SLOW"] });
    node.addWidget("slider", "Grid", 4.4, (value) => {
      node.properties.sampleGrid = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1.2, max: 24, step: 0.1, precision: 1 });
    node.addWidget("slider", "Base radius", 1.7, (value) => {
      node.properties.baseRadius = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.3, max: 12, step: 0.05, precision: 2 });
    node.addWidget("slider", "Radius jitter", 0.8, (value) => {
      node.properties.radiusJitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Turns", 1.8, (value) => {
      node.properties.loopTurns = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 5, step: 0.05, precision: 2 });
    node.addWidget("slider", "Pts/turn", 16, (value) => {
      node.properties.pointsPerTurn = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 4, max: 48, step: 1 });
    node.addWidget("slider", "Tone gamma", 1.06, (value) => {
      node.properties.toneGamma = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", 1.14, (value) => {
      node.properties.contrast = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Detail", 0.92, (value) => {
      node.properties.detailBoost = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3.2, step: 0.01, precision: 2 });
    node.addWidget("slider", "Threshold", 0.08, (value) => {
      node.properties.threshold = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.99, step: 0.01, precision: 2 });
    node.addWidget("slider", "Line width", 0.48, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Line alpha", 0.92, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 1, step: 0.01, precision: 2 });
    node.addWidget("text", "Line color", "#111111", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Smoothing", 0.72, (value) => {
      node.properties.curveSmoothing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1.8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Max paths", 140000, (value) => {
      node.properties.maxPaths = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 300, max: 320000, step: 100 });
    node.addWidget("combo", "Manual", "on", (value) => {
      node.properties.simulateHand = String(value) === "on";
      notifyGraphStateChange(node);
    }, { values: ["on", "off"] });
    node.addWidget("slider", "Hand wobble", 0.35, (value) => {
      node.properties.handWobble = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Hand jitter", 0.25, (value) => {
      node.properties.handJitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Hand breaks", 0.012, (value) => {
      node.properties.handBreakProb = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.6, step: 0.001, precision: 3 });
    node.addWidget("slider", "Hand pressure", 0.24, (value) => {
      node.properties.handPressure = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 5);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GraphicScumblingToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.strokeCount = 0;
      this.pathCount = 0;
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

    const presetRaw = String(this.properties.preset ?? "NORMAL").toUpperCase();
    const preset: "FAST" | "NORMAL" | "SLOW" =
      presetRaw === "FAST" || presetRaw === "SLOW" ? presetRaw : "NORMAL";
    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1500)), 256, 3200),
      preset,
      sampleGrid: clamp(Number(this.properties.sampleGrid ?? 4.4), 1.2, 24),
      baseRadius: clamp(Number(this.properties.baseRadius ?? 1.7), 0.3, 12),
      radiusJitter: clamp(Number(this.properties.radiusJitter ?? 0.8), 0, 3),
      loopTurns: clamp(Number(this.properties.loopTurns ?? 1.8), 0.5, 5),
      pointsPerTurn: clamp(Math.round(Number(this.properties.pointsPerTurn ?? 16)), 4, 48),
      toneGamma: clamp(Number(this.properties.toneGamma ?? 1.06), 0.2, 4),
      contrast: clamp(Number(this.properties.contrast ?? 1.14), 0.2, 4),
      detailBoost: clamp(Number(this.properties.detailBoost ?? 0.92), 0, 3.2),
      threshold: clamp(Number(this.properties.threshold ?? 0.08), 0, 0.99),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 0.48), 0.05, 8),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 0.92), 0.01, 1),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#111111")),
      curveSmoothing: clamp(Number(this.properties.curveSmoothing ?? 0.72), 0, 1.8),
      maxPaths: clamp(Math.round(Number(this.properties.maxPaths ?? 140000)), 300, 320000),
      seed: clamp(Math.round(Number(this.properties.seed ?? 1)), 1, 1000000),
      simulateHand: Boolean(this.properties.simulateHand),
      handWobble: clamp(Number(this.properties.handWobble ?? 0.35), 0, 4),
      handJitter: clamp(Number(this.properties.handJitter ?? 0.25), 0, 4),
      handBreakProb: clamp(Number(this.properties.handBreakProb ?? 0.012), 0, 0.6),
      handPressure: clamp(Number(this.properties.handPressure ?? 0.24), 0, 1),
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
      this.status = "generating scumbling...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateGraphicScumblingSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) return;
          this.preview = result.preview;
          this.svg = result.svg;
          this.strokeCount = result.strokeCount;
          this.pathCount = result.pathCount;
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
          logNodeError("GraphicScumblingToolNode", error, {
            options,
            inputSize: `${input.width}x${input.height}`,
          });
          this.preview = input;
          this.svg = null;
          this.strokeCount = 0;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "graphic scumbling error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GraphicScumblingToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 5 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | strokes ${this.strokeCount}`, 10, layout.footerTop + 30);
    context.fillText(`paths ${this.pathCount}`, 10, layout.footerTop + 48);
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 66);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 84);
    context.restore();
  }
}

export class GraphicCrosshatichingToolNode {
  size: [number, number] = [280, 860];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  lineCount = 0;
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GraphicCrosshatichingToolNode;
    node.title = createToolTitle("Graphic Crosshatiching");
    node.properties = {
      maxWidth: 1400,
      angleCount: 5,
      baseSpacing: 6,
      sampleStep: 1.6,
      toneGamma: 1.1,
      contrast: 1.18,
      detailBoost: 0.85,
      threshold: 0.11,
      minSegmentLength: 3,
      lineWidth: 0.62,
      lineAlpha: 0.93,
      lineColor: "#101010",
      curveSmoothing: 0.65,
      penUpDistanceFactor: 2.4,
      maxPaths: 90000,
      seed: 1,
      simulateHand: false,
      handWobble: 0.7,
      handJitter: 0.45,
      handBreakProb: 0.025,
      handPressure: 0.28,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 1400, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 256, max: 3200, step: 8 });
    node.addWidget("slider", "Angles", 5, (value) => {
      node.properties.angleCount = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 2, max: 10, step: 1 });
    node.addWidget("slider", "Spacing", 6, (value) => {
      node.properties.baseSpacing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 2, max: 48, step: 0.1, precision: 1 });
    node.addWidget("slider", "Sample step", 1.6, (value) => {
      node.properties.sampleStep = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.6, max: 12, step: 0.1, precision: 1 });
    node.addWidget("slider", "Tone gamma", 1.1, (value) => {
      node.properties.toneGamma = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", 1.18, (value) => {
      node.properties.contrast = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Detail", 0.85, (value) => {
      node.properties.detailBoost = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 2.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Threshold", 0.11, (value) => {
      node.properties.threshold = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.98, step: 0.01, precision: 2 });
    node.addWidget("slider", "Min seg", 3, (value) => {
      node.properties.minSegmentLength = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 140, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 0.62, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Line alpha", 0.93, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 1, step: 0.01, precision: 2 });
    node.addWidget("text", "Line color", "#101010", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Smoothing", 0.65, (value) => {
      node.properties.curveSmoothing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Pen-up jump", 2.4, (value) => {
      node.properties.penUpDistanceFactor = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 12, step: 0.1, precision: 1 });
    node.addWidget("slider", "Max paths", 90000, (value) => {
      node.properties.maxPaths = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 300, max: 300000, step: 100 });
    node.addWidget("combo", "Manual", "off", (value) => {
      node.properties.simulateHand = String(value) === "on";
      notifyGraphStateChange(node);
    }, { values: ["off", "on"] });
    node.addWidget("slider", "Hand wobble", 0.7, (value) => {
      node.properties.handWobble = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 6, step: 0.01, precision: 2 });
    node.addWidget("slider", "Hand jitter", 0.45, (value) => {
      node.properties.handJitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Hand breaks", 0.025, (value) => {
      node.properties.handBreakProb = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.6, step: 0.001, precision: 3 });
    node.addWidget("slider", "Hand pressure", 0.28, (value) => {
      node.properties.handPressure = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 5);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GraphicCrosshatichingToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.lineCount = 0;
      this.pathCount = 0;
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1400)), 256, 3200),
      angleCount: clamp(Math.round(Number(this.properties.angleCount ?? 5)), 2, 10),
      baseSpacing: clamp(Number(this.properties.baseSpacing ?? 6), 2, 48),
      sampleStep: clamp(Number(this.properties.sampleStep ?? 1.6), 0.6, 12),
      toneGamma: clamp(Number(this.properties.toneGamma ?? 1.1), 0.2, 4),
      contrast: clamp(Number(this.properties.contrast ?? 1.18), 0.2, 4),
      detailBoost: clamp(Number(this.properties.detailBoost ?? 0.85), 0, 2.5),
      threshold: clamp(Number(this.properties.threshold ?? 0.11), 0, 0.98),
      minSegmentLength: clamp(Number(this.properties.minSegmentLength ?? 3), 0.5, 140),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 0.62), 0.1, 8),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 0.93), 0.01, 1),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#101010")),
      curveSmoothing: clamp(Number(this.properties.curveSmoothing ?? 0.65), 0, 1.5),
      penUpDistanceFactor: clamp(Number(this.properties.penUpDistanceFactor ?? 2.4), 1, 12),
      maxPaths: clamp(Math.round(Number(this.properties.maxPaths ?? 90000)), 300, 300000),
      seed: clamp(Math.round(Number(this.properties.seed ?? 1)), 1, 1000000),
      simulateHand: Boolean(this.properties.simulateHand),
      handWobble: clamp(Number(this.properties.handWobble ?? 0.7), 0, 6),
      handJitter: clamp(Number(this.properties.handJitter ?? 0.45), 0, 4),
      handBreakProb: clamp(Number(this.properties.handBreakProb ?? 0.025), 0, 0.6),
      handPressure: clamp(Number(this.properties.handPressure ?? 0.28), 0, 1),
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
      this.status = "generating crosshatiching...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateGraphicCrosshatichingSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) return;
          this.preview = result.preview;
          this.svg = result.svg;
          this.lineCount = result.lineCount;
          this.pathCount = result.pathCount;
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
          logNodeError("GraphicCrosshatichingToolNode", error, {
            options,
            inputSize: `${input.width}x${input.height}`,
          });
          this.preview = input;
          this.svg = null;
          this.lineCount = 0;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "graphic crosshatiching error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GraphicCrosshatichingToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 5 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | lines ${this.lineCount}`, 10, layout.footerTop + 30);
    context.fillText(`paths ${this.pathCount}`, 10, layout.footerTop + 48);
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 66);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 84);
    context.restore();
  }
}

export class GraphicScribblingToolNode {
  size: [number, number] = [280, 900];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  strokeCount = 0;
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GraphicScribblingToolNode;
    node.title = createToolTitle("Graphic Scribbling");
    node.properties = {
      maxWidth: 1400,
      strokeCount: 2600,
      startCandidates: 140,
      maxStrokePoints: 60,
      stepSize: 2.2,
      toneGamma: 1.1,
      contrast: 1.22,
      minStartTone: 0.13,
      minContinueTone: 0.06,
      darknessFade: 0.11,
      lineWidth: 0.58,
      lineAlpha: 0.92,
      lineColor: "#0A0A0A",
      curveSmoothing: 0.75,
      jitter: 0.36,
      angleJitter: 11,
      flowBlend: 0.72,
      simplifyTolerance: 0.38,
      maxPaths: 120000,
      seed: 1,
      manualInk: true,
      manualWobble: 0.8,
      manualPressure: 0.32,
      manualBreakProb: 0.012,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 1400, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 256, max: 3200, step: 8 });
    node.addWidget("slider", "Strokes", 2600, (value) => {
      node.properties.strokeCount = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 10, max: 100000, step: 1 });
    node.addWidget("slider", "Start cands", 140, (value) => {
      node.properties.startCandidates = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 8, max: 2000, step: 1 });
    node.addWidget("slider", "Stroke pts", 60, (value) => {
      node.properties.maxStrokePoints = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 4, max: 400, step: 1 });
    node.addWidget("slider", "Step", 2.2, (value) => {
      node.properties.stepSize = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.5, max: 24, step: 0.1, precision: 1 });
    node.addWidget("slider", "Tone gamma", 1.1, (value) => {
      node.properties.toneGamma = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Contrast", 1.22, (value) => {
      node.properties.contrast = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Start tone", 0.13, (value) => {
      node.properties.minStartTone = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Cont tone", 0.06, (value) => {
      node.properties.minContinueTone = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Ink fade", 0.11, (value) => {
      node.properties.darknessFade = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.001, max: 1, step: 0.001, precision: 3 });
    node.addWidget("slider", "Line width", 0.58, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Line alpha", 0.92, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.02, max: 1, step: 0.01, precision: 2 });
    node.addWidget("text", "Line color", "#0A0A0A", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Smoothing", 0.75, (value) => {
      node.properties.curveSmoothing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1.5, step: 0.01, precision: 2 });
    node.addWidget("slider", "Jitter", 0.36, (value) => {
      node.properties.jitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 6, step: 0.01, precision: 2 });
    node.addWidget("slider", "Angle jit", 11, (value) => {
      node.properties.angleJitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 90, step: 0.5, precision: 1 });
    node.addWidget("slider", "Flow blend", 0.72, (value) => {
      node.properties.flowBlend = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Simplify", 0.38, (value) => {
      node.properties.simplifyTolerance = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 10, step: 0.01, precision: 2 });
    node.addWidget("slider", "Max paths", 120000, (value) => {
      node.properties.maxPaths = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 100, max: 300000, step: 100 });
    node.addWidget("combo", "Manual ink", "on", (value) => {
      node.properties.manualInk = String(value) === "on";
      notifyGraphStateChange(node);
    }, { values: ["on", "off"] });
    node.addWidget("slider", "Ink wobble", 0.8, (value) => {
      node.properties.manualWobble = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Ink pressure", 0.32, (value) => {
      node.properties.manualPressure = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Ink breaks", 0.012, (value) => {
      node.properties.manualBreakProb = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 0.6, step: 0.001, precision: 3 });
    node.addWidget("slider", "Seed", 1, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 1000000, step: 1 });
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 5);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GraphicScribblingToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.strokeCount = 0;
      this.pathCount = 0;
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1400)), 256, 3200),
      strokeCount: clamp(Math.round(Number(this.properties.strokeCount ?? 2600)), 10, 100000),
      startCandidates: clamp(Math.round(Number(this.properties.startCandidates ?? 140)), 8, 2000),
      maxStrokePoints: clamp(Math.round(Number(this.properties.maxStrokePoints ?? 60)), 4, 400),
      stepSize: clamp(Number(this.properties.stepSize ?? 2.2), 0.5, 24),
      toneGamma: clamp(Number(this.properties.toneGamma ?? 1.1), 0.2, 4),
      contrast: clamp(Number(this.properties.contrast ?? 1.22), 0.2, 4),
      minStartTone: clamp(Number(this.properties.minStartTone ?? 0.13), 0, 1),
      minContinueTone: clamp(Number(this.properties.minContinueTone ?? 0.06), 0, 1),
      darknessFade: clamp(Number(this.properties.darknessFade ?? 0.11), 0.001, 1),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 0.58), 0.05, 8),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 0.92), 0.02, 1),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#0A0A0A")),
      curveSmoothing: clamp(Number(this.properties.curveSmoothing ?? 0.75), 0, 1.5),
      jitter: clamp(Number(this.properties.jitter ?? 0.36), 0, 6),
      angleJitter: clamp(Number(this.properties.angleJitter ?? 11), 0, 90),
      flowBlend: clamp(Number(this.properties.flowBlend ?? 0.72), 0, 1),
      simplifyTolerance: clamp(Number(this.properties.simplifyTolerance ?? 0.38), 0, 10),
      maxPaths: clamp(Math.round(Number(this.properties.maxPaths ?? 120000)), 100, 300000),
      seed: clamp(Math.round(Number(this.properties.seed ?? 1)), 1, 1000000),
      manualInk: Boolean(this.properties.manualInk),
      manualWobble: clamp(Number(this.properties.manualWobble ?? 0.8), 0, 8),
      manualPressure: clamp(Number(this.properties.manualPressure ?? 0.32), 0, 1),
      manualBreakProb: clamp(Number(this.properties.manualBreakProb ?? 0.012), 0, 0.6),
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
      this.status = "generating scribbling...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateGraphicScribblingSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) return;
          this.preview = result.preview;
          this.svg = result.svg;
          this.strokeCount = result.strokeCount;
          this.pathCount = result.pathCount;
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
          logNodeError("GraphicScribblingToolNode", error, {
            options,
            inputSize: `${input.width}x${input.height}`,
          });
          this.preview = input;
          this.svg = null;
          this.strokeCount = 0;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "graphic scribbling error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GraphicScribblingToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 5 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`progress ${Math.round(this.progress * 100)}% | strokes ${this.strokeCount}`, 10, layout.footerTop + 30);
    context.fillText(`paths ${this.pathCount}`, 10, layout.footerTop + 48);
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 66);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 84);
    context.restore();
  }
}

export class GraphicPotraceToolNode {
  size: [number, number] = [320, 500];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  pendingRunSignature = "";
  debouncedRunSignature = "";
  debounceTimerId: number | null = null;
  renderToken = 0;
  isRendering = false;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GraphicPotraceToolNode;
    node.title = createToolTitle("Graphic Potrace");
    node.properties = {
      maxWidth: 1200,
      svgScale: 1,
      turnpolicy: "minority",
      turdsize: 2,
      optcurve: true,
      alphamax: 1,
      opttolerance: 0.2,
      curveOnly: false,
      bgColor: "#FFFFFF",
      traceColor: "#000000",
    };

    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");

    node.addWidget("slider", "Max width", 1200, (value) => {
      node.properties.maxWidth = clamp(Math.round(Number(value)), 128, 4096);
      notifyGraphStateChange(node);
    }, { min: 128, max: 4096, step: 1 });

    node.addWidget("slider", "SVG scale", 1, (value) => {
      node.properties.svgScale = clamp(Number(value), 0.1, 8);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });

    node.addWidget("combo", "Turnpolicy", "minority", (value) => {
      node.properties.turnpolicy = String(value);
      notifyGraphStateChange(node);
    }, { values: ["black", "white", "left", "right", "minority", "majority"] });

    node.addWidget("slider", "Turd size", 2, (value) => {
      node.properties.turdsize = clamp(Math.round(Number(value)), 0, 100);
      notifyGraphStateChange(node);
    }, { min: 0, max: 100, step: 1 });

    node.addWidget("toggle", "Optcurve", true, (value) => {
      node.properties.optcurve = Boolean(value);
      notifyGraphStateChange(node);
    });

    node.addWidget("slider", "Alpha max", 1, (value) => {
      node.properties.alphamax = clamp(Number(value), 0, 4);
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.05, precision: 2 });

    node.addWidget("slider", "Opt tolerance", 0.2, (value) => {
      node.properties.opttolerance = clamp(Number(value), 0, 2);
      notifyGraphStateChange(node);
    }, { min: 0, max: 2, step: 0.01, precision: 2 });

    node.addWidget("toggle", "Curve only", false, (value) => {
      node.properties.curveOnly = Boolean(value);
      notifyGraphStateChange(node);
    });

    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.bgColor = normalizeHexColor(String(value ?? "#FFFFFF"));
      notifyGraphStateChange(node);
    });

    node.addWidget("text", "Trace color", "#000000", (value) => {
      node.properties.traceColor = normalizeHexColor(String(value ?? "#000000"));
      notifyGraphStateChange(node);
    });

    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GraphicPotraceToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
        this.debounceTimerId = null;
      }
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.pathCount = 0;
      this.outputWidth = 0;
      this.outputHeight = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.pendingRunSignature = "";
      this.debouncedRunSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1200)), 128, 4096),
      svgScale: clamp(Number(this.properties.svgScale ?? 1), 0.1, 8),
      turnpolicy: String(this.properties.turnpolicy ?? "minority") as PotraceTurnPolicy,
      turdsize: clamp(Math.round(Number(this.properties.turdsize ?? 2)), 0, 100),
      optcurve: Boolean(this.properties.optcurve ?? true),
      alphamax: clamp(Number(this.properties.alphamax ?? 1), 0, 4),
      opttolerance: clamp(Number(this.properties.opttolerance ?? 0.2), 0, 2),
      curveOnly: Boolean(this.properties.curveOnly ?? false),
      bgColor: normalizeHexColor(String(this.properties.bgColor ?? "#FFFFFF")),
      traceColor: normalizeHexColor(String(this.properties.traceColor ?? "#000000")),
    };

    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify(options);
    const runSignature = `${signature}|${optionsSignature}`;

    if (runSignature !== this.pendingRunSignature) {
      this.pendingRunSignature = runSignature;
      this.status = "waiting debounce...";
      this.setDirtyCanvas(true, true);
      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
      }
      const queuedRunSignature = runSignature;
      this.debounceTimerId = window.setTimeout(() => {
        if (queuedRunSignature !== this.pendingRunSignature) {
          return;
        }
        this.debouncedRunSignature = queuedRunSignature;
        this.setDirtyCanvas(true, true);
      }, 600);
    }

    if (this.debouncedRunSignature !== runSignature) {
      this.setOutputData(0, this.preview ?? input);
      this.setOutputData(1, this.svg);
      this.refreshPreviewLayout();
      return;
    }

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      const start = performance.now();
      this.isRendering = true;
      this.status = "processing potrace...";
      this.setDirtyCanvas(true, true);

      const maxWidth = options.maxWidth;
      const scale = Math.min(1, maxWidth / Math.max(1, input.width));
      const sampledWidth = Math.max(1, Math.round(input.width * scale));
      const sampledHeight = Math.max(1, Math.round(input.height * scale));
      const sampledCanvas = document.createElement("canvas");
      sampledCanvas.width = sampledWidth;
      sampledCanvas.height = sampledHeight;
      const sampledContext = sampledCanvas.getContext("2d", { willReadFrequently: true });
      if (!sampledContext) {
        this.preview = input;
        this.svg = null;
        this.status = "2d context unavailable";
        this.isRendering = false;
        this.executionMs = null;
        this.setOutputData(0, this.preview);
        this.setOutputData(1, null);
        return;
      }
      sampledContext.drawImage(input, 0, 0, sampledWidth, sampledHeight);

      try {
        potraceRuntime.setParameter({
          turnpolicy: options.turnpolicy,
          turdsize: options.turdsize,
          optcurve: options.optcurve,
          alphamax: options.alphamax,
          opttolerance: options.opttolerance,
        });
        potraceRuntime.loadImageFromUrl(sampledCanvas.toDataURL("image/png"));
      } catch (error) {
        logNodeError("GraphicPotraceToolNode/init", error);
        this.preview = input;
        this.svg = null;
        this.status = error instanceof Error ? error.message : "potrace init error";
        this.pathCount = 0;
        this.outputWidth = sampledWidth;
        this.outputHeight = sampledHeight;
        this.executionMs = null;
        this.isRendering = false;
        this.setOutputData(0, this.preview);
        this.setOutputData(1, this.svg);
        this.refreshPreviewLayout();
        return;
      }

      const finishFailure = (reason: string) => {
        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = input;
        this.svg = null;
        this.pathCount = 0;
        this.outputWidth = sampledWidth;
        this.outputHeight = sampledHeight;
        this.status = reason;
        this.executionMs = null;
        this.isRendering = false;
        this.setOutputData(0, this.preview);
        this.setOutputData(1, this.svg);
        this.setDirtyCanvas(true, true);
      };

      try {
        potraceRuntime.process(() => {
          if (renderToken !== this.renderToken) {
            return;
          }

          try {
            const rawSvg = potraceRuntime.getSVG(options.svgScale, options.curveOnly ? "curve" : undefined);
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawSvg, "image/svg+xml");
            const root = doc.documentElement;
            if (root && root.tagName.toLowerCase() === "svg") {
              const widthAttr = root.getAttribute("width") ?? "0";
              const heightAttr = root.getAttribute("height") ?? "0";
              const widthValue = Number.parseFloat(widthAttr);
              const heightValue = Number.parseFloat(heightAttr);
              const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
              rect.setAttribute("x", "0");
              rect.setAttribute("y", "0");
              rect.setAttribute("width", Number.isFinite(widthValue) ? String(widthValue) : "100%");
              rect.setAttribute("height", Number.isFinite(heightValue) ? String(heightValue) : "100%");
              rect.setAttribute("fill", options.bgColor);
              root.insertBefore(rect, root.firstChild);

              const paths = Array.from(root.querySelectorAll("path"));
              for (const path of paths) {
                const styleRaw = path.getAttribute("style") ?? "";
                const styleWithoutColor = styleRaw
                  .replace(/(^|;)\s*fill\s*:[^;]*/gi, "")
                  .replace(/(^|;)\s*stroke\s*:[^;]*/gi, "")
                  .replace(/(^|;)\s*stroke-width\s*:[^;]*/gi, "")
                  .replace(/^;+|;+$/g, "");

                if (options.curveOnly) {
                  path.setAttribute("fill", "none");
                  path.setAttribute("stroke", options.traceColor);
                  path.setAttribute("stroke-width", "1");
                  const styleNext = [styleWithoutColor, `fill:none`, `stroke:${options.traceColor}`, "stroke-width:1"]
                    .filter((item) => item.length > 0)
                    .join(";");
                  path.setAttribute("style", styleNext);
                } else {
                  path.setAttribute("fill", options.traceColor);
                  path.setAttribute("stroke", "none");
                  const styleNext = [styleWithoutColor, `fill:${options.traceColor}`, "stroke:none"]
                    .filter((item) => item.length > 0)
                    .join(";");
                  path.setAttribute("style", styleNext);
                }
              }
            }
            const svg = new XMLSerializer().serializeToString(doc);
            this.svg = svg;
            this.pathCount = (svg.match(/<path\b/g) ?? []).length;
            const width = Number(root.getAttribute("width"));
            const height = Number(root.getAttribute("height"));
            this.outputWidth = Number.isFinite(width) ? width : sampledWidth;
            this.outputHeight = Number.isFinite(height) ? height : sampledHeight;

            const currentToken = renderToken;
            void rasterizeGraphSvg(svg)
              .then((preview) => {
                if (currentToken !== this.renderToken) {
                  return;
                }
                this.preview = preview;
                this.status = "ready";
                this.executionMs = performance.now() - start;
                this.isRendering = false;
                this.setOutputData(0, this.preview);
                this.setOutputData(1, this.svg);
                this.setDirtyCanvas(true, true);
              })
              .catch(() => {
                if (currentToken !== this.renderToken) {
                  return;
                }
                this.preview = input;
                this.status = "svg render failed";
                this.executionMs = performance.now() - start;
                this.isRendering = false;
                this.setOutputData(0, this.preview);
                this.setOutputData(1, this.svg);
                this.setDirtyCanvas(true, true);
              });
          } catch (error) {
            finishFailure(error instanceof Error ? error.message : "potrace process error");
          }
        });
      } catch (error) {
        finishFailure(error instanceof Error ? error.message : "potrace process error");
      }
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onRemoved(this: GraphicPotraceToolNode) {
    if (this.debounceTimerId !== null) {
      window.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }

  onDrawBackground(this: PreviewAwareNode & GraphicPotraceToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(`paths ${this.pathCount}`, 10, layout.footerTop + 30);
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
