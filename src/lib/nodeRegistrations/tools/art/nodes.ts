import { drawImagePreview, rasterizeGraphSvg } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { ImageTracerOptions } from "../../../../vendor/imagetracer.1.2.6.js";
import type { LiteNode, PreviewAwareNode } from "../../shared";
import {
  clamp,
  createToolTitle,
  fitSourceToSquareCanvas,
  fitSourceToMaxWidthCanvas,
  formatExecutionInfo,
  formatImageErrorMetrics,
  gaussianBlurImageData,
  generateAsciifyOutput,
  generateCrosshatchBnSvg,
  generateDelanoy2Svg,
  generateDelanoySvg,
  generateDotsSvg,
  generateGridDotSvg,
  generateLinesSvg,
  generateLinefy2Svg,
  generateLinefySvg,
  generateOil2Svg,
  generateOil3Svg,
  generateWatercolourSvg,
  generateMatitaSvg,
  generateSketchSvg,
  generateStippleSvg,
  getAverageColorFromImageData,
  createGrayMapFromImageData,
  getGraphImageSignature,
  getImageTracer,
  getMarchingSquares,
  isGraphImageReady,
  marchingGraphImage,
  normalizeHexColor,
  notifyGraphStateChange,
  computeImageErrorMetrics,
  renderCarbonLayer,
  renderBoldiniLayer,
  renderSargentLayer,
  refreshNode,
  sobelOperatorFromGrayscale,
  toGrayscaleImageData,
  ASCIIFY_CHARSETS,
  ASCIIFY_CHARSET_PRESETS,
  type AsciifyCharsetPreset,
  oilPaintGraphImage,
} from "../shared";
import { OptimizedToolNode } from "../shared";

export class OilToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 360];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & OilToolNode;
    node.title = createToolTitle("Oil");
    node.properties = {
      radius: 6,
      intensity: 10,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Radius",
      6,
      (value) => {
        node.properties.radius = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 20, step: 1 },
    );
    node.addWidget(
      "slider",
      "Intensity",
      10,
      (value) => {
        node.properties.intensity = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 2, max: 50, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & OilToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const radius = Number(this.properties.radius ?? 6);
    const intensity = Number(this.properties.intensity ?? 10);
    const signature = getGraphImageSignature(input);
    const optionsSignature = `radius:${Math.round(radius)}|intensity:${Math.round(intensity)}`;
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = oilPaintGraphImage(input, radius, intensity);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & OilToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `radius:${Math.round(Number(this.properties.radius ?? 6))} | intensity:${Math.round(
        Number(this.properties.intensity ?? 10),
      )}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class VectorizeToolNode {
  size: [number, number] = [280, 540];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;
  properties!: Record<string, unknown>;
  isRendering = false;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & VectorizeToolNode;
    const imageTracer = getImageTracer();
    node.title = createToolTitle("Vectorize");
    node.properties = {
      preset: "default",
      ltres: 1,
      qtres: 1,
      pathomit: 8,
      rightangleenhance: true,
      colorsampling: 2,
      numberofcolors: 16,
      mincolorratio: 0,
      colorquantcycles: 3,
      layering: 0,
      strokewidth: 1,
      linefilter: false,
      roundcoords: 1,
      blurradius: 0,
      blurdelta: 20,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget(
      "combo",
      "Preset",
      "default",
      (value) => {
        const preset = String(value);
        node.properties.preset = preset;
        const presetOptions = imageTracer.checkoptions(preset);
        Object.assign(node.properties, presetOptions, { preset });
        notifyGraphStateChange(node);
      },
      {
        values: Object.keys(imageTracer.optionpresets),
      },
    );
    node.addWidget("slider", "Colors", 16, (value) => {
      node.properties.numberofcolors = Number(value);
      notifyGraphStateChange(node);
    }, { min: 2, max: 64, step: 1 });
    node.addWidget("slider", "Path omit", 8, (value) => {
      node.properties.pathomit = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 32, step: 1 });
    node.addWidget("slider", "Line thr", 1, (value) => {
      node.properties.ltres = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 10, step: 0.01, precision: 2 });
    node.addWidget("slider", "Quad thr", 1, (value) => {
      node.properties.qtres = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 10, step: 0.01, precision: 2 });
    node.addWidget("slider", "Color ratio", 0, (value) => {
      node.properties.mincolorratio = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Quant cycles", 3, (value) => {
      node.properties.colorquantcycles = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 10, step: 1 });
    node.addWidget("combo", "Sampling", 2, (value) => {
      node.properties.colorsampling = Number(value);
      notifyGraphStateChange(node);
    }, { values: [0, 1, 2] });
    node.addWidget("combo", "Layering", 0, (value) => {
      node.properties.layering = Number(value);
      notifyGraphStateChange(node);
    }, { values: [0, 1] });
    node.addWidget("slider", "Stroke", 1, (value) => {
      node.properties.strokewidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 0.1, precision: 1 });
    node.addWidget("slider", "Round", 1, (value) => {
      node.properties.roundcoords = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3, step: 1 });
    node.addWidget("slider", "Blur rad", 0, (value) => {
      node.properties.blurradius = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 1 });
    node.addWidget("slider", "Blur delta", 20, (value) => {
      node.properties.blurdelta = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 256, step: 1 });
    node.addWidget("toggle", "Right angle", true, (value) => {
      node.properties.rightangleenhance = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Line filter", false, (value) => {
      node.properties.linefilter = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview);
    };
    node.refreshPreviewLayout();
  }

  getVectorizeOptions(this: PreviewAwareNode & VectorizeToolNode): ImageTracerOptions {
    return {
      ltres: Number(this.properties.ltres ?? 1),
      qtres: Number(this.properties.qtres ?? 1),
      pathomit: Number(this.properties.pathomit ?? 8),
      rightangleenhance: Boolean(this.properties.rightangleenhance ?? true),
      colorsampling: Number(this.properties.colorsampling ?? 2),
      numberofcolors: clamp(Number(this.properties.numberofcolors ?? 16), 2, 64),
      mincolorratio: Number(this.properties.mincolorratio ?? 0),
      colorquantcycles: clamp(Number(this.properties.colorquantcycles ?? 3), 1, 10),
      layering: Number(this.properties.layering ?? 0),
      strokewidth: Number(this.properties.strokewidth ?? 1),
      linefilter: Boolean(this.properties.linefilter ?? false),
      roundcoords: Number(this.properties.roundcoords ?? 1),
      blurradius: Number(this.properties.blurradius ?? 0),
      blurdelta: Number(this.properties.blurdelta ?? 20),
    };
  }

  onExecute(this: PreviewAwareNode & VectorizeToolNode) {
    const start = performance.now();
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.executionMs = performance.now() - start;
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getVectorizeOptions();
    const optionsSignature = JSON.stringify(options);

    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      this.isRendering = true;
      const context = input.getContext("2d", { willReadFrequently: true });
      if (context) {
        const imageData = context.getImageData(0, 0, input.width, input.height);
        const svg = getImageTracer().imagedataToSVG(imageData, options);
        this.svg = svg;

        const renderToken = ++this.renderToken;
        void rasterizeGraphSvg(svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.isRendering = false;
            this.executionMs = performance.now() - start;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.svg = null;
            this.isRendering = false;
            this.executionMs = null;
            this.lastSignature = "";
            this.lastOptionsSignature = "";
            this.setDirtyCanvas(true, true);
          });
      }
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & VectorizeToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 12);
    context.restore();
  }
}

export class MarchingToolNode {
  size: [number, number] = [280, 520];
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  pathCount = 0;
  sampledWidth = 0;
  sampledHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: MarchingToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & MarchingToolNode,
    preset: "fast" | "quality",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            levels: 4,
            thresholdMin: 0.14,
            thresholdMax: 0.9,
            downscale: 4,
            blur: 0.4,
            simplify: 1.8,
            highQuality: false,
            lineWidth: 1.3,
            opacity: 0.82,
          }
        : {
            levels: 8,
            thresholdMin: 0.06,
            thresholdMax: 0.94,
            downscale: 2,
            blur: 1.1,
            simplify: 0.5,
            highQuality: true,
            lineWidth: 1.2,
            opacity: 0.78,
          };

    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Levels", values.levels);
    this.setWidgetValue("Thr min", values.thresholdMin);
    this.setWidgetValue("Thr max", values.thresholdMax);
    this.setWidgetValue("Downscale", values.downscale);
    this.setWidgetValue("Blur", values.blur);
    this.setWidgetValue("Simplify", values.simplify);
    this.setWidgetValue("Line width", values.lineWidth);
    this.setWidgetValue("Opacity", values.opacity);
    this.setWidgetValue("HQ simplify", values.highQuality);
    this.setWidgetValue("Mode", preset);
    if (notify) {
      notifyGraphStateChange(this);
    }
    this.setDirtyCanvas(true, true);
  }

  markCustom(this: PreviewAwareNode & MarchingToolNode) {
    if (String(this.properties.preset ?? "quality") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Mode", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & MarchingToolNode;
    getMarchingSquares();
    node.title = createToolTitle("Marching");
    node.properties = {
      preset: "quality",
      levels: 6,
      thresholdMin: 0.1,
      thresholdMax: 0.9,
      downscale: 2,
      blur: 0.8,
      simplify: 0.7,
      highQuality: true,
      lineWidth: 1.4,
      opacity: 0.8,
      invert: false,
      colorMode: "source",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Mode", "quality", (value) => {
      const mode = String(value);
      if (mode === "fast" || mode === "quality") {
        node.applyPreset(mode, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["quality", "fast", "custom"] });
    node.addWidget("button", "Apply preset", null, () => {
      const selected = String(node.properties.preset ?? "quality");
      const preset = selected === "fast" ? "fast" : "quality";
      node.applyPreset(preset, true);
    });
    node.addWidget("slider", "Levels", 6, (value) => {
      node.properties.levels = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 2, max: 8, step: 1 });
    node.addWidget("slider", "Thr min", 0.1, (value) => {
      node.properties.thresholdMin = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Thr max", 0.9, (value) => {
      node.properties.thresholdMax = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Downscale", 2, (value) => {
      node.properties.downscale = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 8, step: 1 });
    node.addWidget("slider", "Blur", 0.8, (value) => {
      node.properties.blur = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 4, step: 0.1, precision: 1 });
    node.addWidget("slider", "Simplify", 0.7, (value) => {
      node.properties.simplify = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 1.4, (value) => {
      node.properties.lineWidth = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Opacity", 0.8, (value) => {
      node.properties.opacity = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 1, step: 0.05, precision: 2 });
    node.addWidget("combo", "Colors", "source", (value) => {
      node.properties.colorMode = String(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { values: ["source", "gray"] });
    node.addWidget("toggle", "Invert", false, (value) => {
      node.properties.invert = Boolean(value);
      node.markCustom();
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "HQ simplify", true, (value) => {
      node.properties.highQuality = Boolean(value);
      node.markCustom();
      notifyGraphStateChange(node);
    });

    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 2);
    };
    node.applyPreset("quality", false);
    node.refreshPreviewLayout();
  }

  getMarchingOptions(this: PreviewAwareNode & MarchingToolNode) {
    return {
      levels: Math.round(Number(this.properties.levels ?? 6)),
      thresholdMin: Number(this.properties.thresholdMin ?? 0.1),
      thresholdMax: Number(this.properties.thresholdMax ?? 0.9),
      downscale: Math.round(Number(this.properties.downscale ?? 2)),
      blur: Number(this.properties.blur ?? 0.8),
      simplify: Number(this.properties.simplify ?? 0.7),
      highQuality: Boolean(this.properties.highQuality ?? true),
      lineWidth: Number(this.properties.lineWidth ?? 1.4),
      opacity: Number(this.properties.opacity ?? 0.8),
      invert: Boolean(this.properties.invert ?? false),
      colorMode: String(this.properties.colorMode ?? "source") as "gray" | "source",
    };
  }

  onExecute(this: PreviewAwareNode & MarchingToolNode) {
    const input = this.getInputData(0) ?? null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.pathCount = 0;
      this.sampledWidth = 0;
      this.sampledHeight = 0;
      this.isRendering = false;
      this.executionMs = null;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const signature = getGraphImageSignature(input);
    const options = this.getMarchingOptions();
    const optionsSignature = JSON.stringify(options);
    if (signature !== this.lastSignature || optionsSignature !== this.lastOptionsSignature) {
      this.lastSignature = signature;
      this.lastOptionsSignature = optionsSignature;
      const renderToken = ++this.renderToken;
      this.isRendering = true;
      const start = performance.now();
      this.setDirtyCanvas(true, true);

      void marchingGraphImage(input, options, () => renderToken !== this.renderToken)
        .then((result) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          if (!result) {
            return;
          }
          this.svg = result.svg;
          this.pathCount = result.pathCount;
          this.sampledWidth = result.sampledWidth;
          this.sampledHeight = result.sampledHeight;
          this.executionMs = performance.now() - start;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview ?? null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch(() => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = null;
          this.svg = null;
          this.pathCount = 0;
          this.sampledWidth = 0;
          this.sampledHeight = 0;
          this.isRendering = false;
          this.executionMs = null;
          this.lastSignature = "";
          this.lastOptionsSignature = "";
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & MarchingToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const status = this.isRendering ? "rendering..." : "ready";
    const mode = String(this.properties.preset ?? "custom");
    context.fillText(`isolines: ${this.pathCount} | ${status} | ${mode}`, 10, layout.footerTop + 12);
    context.fillText(
      `sample: ${this.sampledWidth || "-"}x${this.sampledHeight || "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

export class BoldiniToolNode {
  size: [number, number] = [280, 430];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "idle";
  progress = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & BoldiniToolNode;
    node.title = createToolTitle("Boldini");
    node.properties = {
      canvasSize: 512,
      baseStrokes: 1500,
      middleStrokes: 4000,
      detailStrokes: 8000,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("slider", "Canvas", 512, (value) => {
      node.properties.canvasSize = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 1024, step: 32 });
    node.addWidget("slider", "Base", 1500, (value) => {
      node.properties.baseStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 200, max: 8000, step: 100 });
    node.addWidget("slider", "Middle", 4000, (value) => {
      node.properties.middleStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 500, max: 16000, step: 100 });
    node.addWidget("slider", "Detail", 8000, (value) => {
      node.properties.detailStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1000, max: 32000, step: 200 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & BoldiniToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      canvasSize: clamp(Math.round(Number(this.properties.canvasSize ?? 512)), 128, 1024),
      baseStrokes: clamp(Math.round(Number(this.properties.baseStrokes ?? 1500)), 200, 8000),
      middleStrokes: clamp(Math.round(Number(this.properties.middleStrokes ?? 4000)), 500, 16000),
      detailStrokes: clamp(Math.round(Number(this.properties.detailStrokes ?? 8000)), 1000, 32000),
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
      this.status = "fase 1/4 analisi";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void (async () => {
        const workingSource = fitSourceToSquareCanvas(input, options.canvasSize);
        const output = document.createElement("canvas");
        output.width = options.canvasSize;
        output.height = options.canvasSize;
        const outputContext = output.getContext("2d", { willReadFrequently: true });
        const sourceContext = workingSource.getContext("2d", { willReadFrequently: true });
        if (!outputContext || !sourceContext) {
          throw new Error("2D context not available.");
        }

        const originalColorData = sourceContext.getImageData(0, 0, options.canvasSize, options.canvasSize);
        const avg = getAverageColorFromImageData(originalColorData);
        outputContext.fillStyle = `rgb(${avg.r}, ${avg.g}, ${avg.b})`;
        outputContext.fillRect(0, 0, output.width, output.height);

        const gray = toGrayscaleImageData(originalColorData);
        const gradientMap = sobelOperatorFromGrayscale(gray);
        const blurredColorData = gaussianBlurImageData(originalColorData, 5);
        if (shouldCancel()) {
          return;
        }

        updateProgress(0.2, "fase 2/4 base");
        const baseCompleted = await renderBoldiniLayer({
          context: outputContext,
          numStrokes: options.baseStrokes,
          minSize: 20,
          maxSize: 50,
          colorSource: blurredColorData,
          gradientMap,
          opacity: 0.7,
          colorJitter: 15,
          shouldCancel,
          onProgress: (p) => updateProgress(0.2 + p * 0.3),
        });
        if (!baseCompleted || shouldCancel()) {
          return;
        }

        updateProgress(0.5, "fase 3/4 intermedie");
        const middleCompleted = await renderBoldiniLayer({
          context: outputContext,
          numStrokes: options.middleStrokes,
          minSize: 8,
          maxSize: 20,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.6,
          useCurve: true,
          colorJitter: 25,
          shouldCancel,
          onProgress: (p) => updateProgress(0.5 + p * 0.3),
        });
        if (!middleCompleted || shouldCancel()) {
          return;
        }

        updateProgress(0.8, "fase 4/4 dettagli");
        const detailCompleted = await renderBoldiniLayer({
          context: outputContext,
          numStrokes: options.detailStrokes,
          minSize: 2,
          maxSize: 8,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.9,
          sharpen: true,
          colorJitter: 10,
          shouldCancel,
          onProgress: (p) => updateProgress(0.8 + p * 0.2),
        });
        if (!detailCompleted || shouldCancel()) {
          return;
        }

        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = output;
        this.progress = 1;
        this.status = "ready";
        this.executionMs = performance.now() - start;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      })().catch((error) => {
        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = input;
        this.progress = 0;
        this.status = error instanceof Error ? error.message : "boldini error";
        this.executionMs = null;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      });
    }

    this.setOutputData(0, this.preview ?? input);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & BoldiniToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${this.status}${this.isRendering ? "..." : ""}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | out ${this.preview ? `${this.preview.width}x${this.preview.height}` : "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

export class Oil2ToolNode {
  size: [number, number] = [280, 620];
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

  setWidgetValue(this: Oil2ToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & Oil2ToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            maxWidth: 720,
            density: 0.7,
            probabilityDiv: 20000,
            refreshEvery: 48,
            maxSvgPaths: 16000,
          }
        : preset === "slow"
          ? {
              maxWidth: 1400,
              density: 1.7,
              probabilityDiv: 20000,
              refreshEvery: 12,
              maxSvgPaths: 120000,
            }
          : {
              maxWidth: 1000,
              density: 1,
              probabilityDiv: 20000,
              refreshEvery: 24,
              maxSvgPaths: 50000,
            };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Density", values.density);
    this.setWidgetValue("Prob div", values.probabilityDiv);
    this.setWidgetValue("Refresh", values.refreshEvery);
    this.setWidgetValue("Max SVG", values.maxSvgPaths);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & Oil2ToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & Oil2ToolNode;
    node.title = createToolTitle("Oil2");
    node.properties = {
      preset: "normal",
      maxWidth: 1000,
      density: 1,
      probabilityDiv: 20000,
      seed: 1337,
      refreshEvery: 24,
      maxSvgPaths: 50000,
      backgroundColor: "#FFFFFF",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("slider", "Max width", 1000, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 2800, step: 8 });
    node.addWidget("slider", "Density", 1, (value) => {
      node.properties.density = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Prob div", 20000, (value) => {
      node.properties.probabilityDiv = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 2000, max: 120000, step: 100 });
    node.addWidget("number", "Seed", 1337, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { step: 1 });
    node.addWidget("slider", "Refresh", 24, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 512, step: 1 });
    node.addWidget("slider", "Max SVG", 50000, (value) => {
      node.properties.maxSvgPaths = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1000, max: 300000, step: 500 });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & Oil2ToolNode) {
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1000)), 128, 2800),
      density: clamp(Number(this.properties.density ?? 1), 0.05, 8),
      probabilityDiv: clamp(Math.round(Number(this.properties.probabilityDiv ?? 20000)), 2000, 120000),
      seed: Math.round(Number(this.properties.seed ?? 1337)),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 24)), 1, 512),
      maxSvgPaths: clamp(Math.round(Number(this.properties.maxSvgPaths ?? 50000)), 1000, 300000),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
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
      this.status = "generating oil2...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateOil2Svg(
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
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.strokeCount = 0;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "oil2 error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & Oil2ToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | strokes ${this.strokeCount} | paths ${this.pathCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class Oil3ToolNode {
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

  setWidgetValue(this: Oil3ToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & Oil3ToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            maxWidth: 720,
            density: 0.6,
            probabilityDiv: 3000,
            refreshEvery: 48,
            maxSvgPaths: 12000,
          }
        : preset === "slow"
          ? {
              maxWidth: 1400,
              density: 1.8,
              probabilityDiv: 3000,
              refreshEvery: 10,
              maxSvgPaths: 120000,
            }
          : {
              maxWidth: 1000,
              density: 1,
              probabilityDiv: 3000,
              refreshEvery: 24,
              maxSvgPaths: 50000,
            };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Density", values.density);
    this.setWidgetValue("Chance div", values.probabilityDiv);
    this.setWidgetValue("Refresh", values.refreshEvery);
    this.setWidgetValue("Max SVG", values.maxSvgPaths);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & Oil3ToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & Oil3ToolNode;
    node.title = createToolTitle("Oil3");
    node.properties = {
      preset: "normal",
      maxWidth: 1000,
      density: 1,
      probabilityDiv: 3000,
      seed: 1337,
      refreshEvery: 24,
      maxSvgPaths: 50000,
      backgroundColor: "#FFFFFF",
      rotationMin: -90,
      rotationMax: 90,
      alpha: 0.5,
      stepDiv: 22,
      tangentChance: 1,
      detailChance: 0,
      detailJitter: 50,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("slider", "Max width", 1000, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 2800, step: 8 });
    node.addWidget("slider", "Density", 1, (value) => {
      node.properties.density = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 8, step: 0.01, precision: 2 });
    node.addWidget("slider", "Chance div", 3000, (value) => {
      node.properties.probabilityDiv = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1000, max: 120000, step: 100 });
    node.addWidget("number", "Seed", 1337, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { step: 1 });
    node.addWidget("slider", "Rot min", -90, (value) => {
      node.properties.rotationMin = Number(value);
      notifyGraphStateChange(node);
    }, { min: -180, max: 180, step: 1 });
    node.addWidget("slider", "Rot max", 90, (value) => {
      node.properties.rotationMax = Number(value);
      notifyGraphStateChange(node);
    }, { min: -180, max: 180, step: 1 });
    node.addWidget("slider", "Alpha", 0.5, (value) => {
      node.properties.alpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Step div", 22, (value) => {
      node.properties.stepDiv = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 100, step: 0.5, precision: 1 });
    node.addWidget("slider", "Tangent %", 1, (value) => {
      node.properties.tangentChance = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Detail %", 0, (value) => {
      node.properties.detailChance = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Detail jitter", 50, (value) => {
      node.properties.detailJitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 255, step: 1 });
    node.addWidget("slider", "Refresh", 24, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 512, step: 1 });
    node.addWidget("slider", "Max SVG", 50000, (value) => {
      node.properties.maxSvgPaths = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1000, max: 300000, step: 500 });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & Oil3ToolNode) {
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1000)), 128, 2800),
      density: clamp(Number(this.properties.density ?? 1), 0.05, 8),
      probabilityDiv: clamp(Math.round(Number(this.properties.probabilityDiv ?? 3000)), 1000, 120000),
      seed: Math.round(Number(this.properties.seed ?? 1337)),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 24)), 1, 512),
      maxSvgPaths: clamp(Math.round(Number(this.properties.maxSvgPaths ?? 50000)), 1000, 300000),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
      rotationMin: clamp(Number(this.properties.rotationMin ?? -90), -180, 180),
      rotationMax: clamp(Number(this.properties.rotationMax ?? 90), -180, 180),
      alpha: clamp(Number(this.properties.alpha ?? 0.5), 0, 1),
      stepDiv: clamp(Number(this.properties.stepDiv ?? 22), 1, 100),
      tangentChance: clamp(Number(this.properties.tangentChance ?? 1), 0, 1),
      detailChance: clamp(Number(this.properties.detailChance ?? 0), 0, 1),
      detailJitter: clamp(Number(this.properties.detailJitter ?? 50), 0, 255),
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
      this.status = "generating oil3...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateOil3Svg(
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
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.strokeCount = 0;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "oil3 error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & Oil3ToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | strokes ${this.strokeCount} | paths ${this.pathCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class WatercolourToolNode {
  size: [number, number] = [280, 840];
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

  setWidgetValue(this: WatercolourToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & WatercolourToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            maxWidth: 800,
            baseCell: 14,
            washLayers: 2,
            bleedSteps: 2,
            strokeDensity: 0.35,
            maxSvgPaths: 35000,
            refreshEvery: 24,
          }
        : preset === "slow"
          ? {
              maxWidth: 1600,
              baseCell: 9,
              washLayers: 5,
              bleedSteps: 5,
              strokeDensity: 0.9,
              maxSvgPaths: 180000,
              refreshEvery: 8,
            }
          : {
              maxWidth: 1200,
              baseCell: 12,
              washLayers: 3,
              bleedSteps: 3,
              strokeDensity: 0.55,
              maxSvgPaths: 90000,
              refreshEvery: 14,
            };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Base cell", values.baseCell);
    this.setWidgetValue("Wash layers", values.washLayers);
    this.setWidgetValue("Bleed steps", values.bleedSteps);
    this.setWidgetValue("Stroke dens", values.strokeDensity);
    this.setWidgetValue("Max SVG", values.maxSvgPaths);
    this.setWidgetValue("Refresh", values.refreshEvery);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & WatercolourToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & WatercolourToolNode;
    node.title = createToolTitle("Watercolour");
    node.properties = {
      preset: "normal",
      maxWidth: 1200,
      baseCell: 12,
      washLayers: 3,
      bleedSteps: 3,
      bleedStrength: 0.65,
      transparency: 0.72,
      strokeDensity: 0.55,
      strokeLength: 12,
      lineWidth: 1.2,
      threshold: 0.08,
      colorBleed: 0.5,
      granulation: 0.4,
      seed: 1337,
      refreshEvery: 14,
      maxSvgPaths: 90000,
      backgroundColor: "#FFFFFF",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("slider", "Max width", 1200, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 3200, step: 8 });
    node.addWidget("slider", "Base cell", 12, (value) => {
      node.properties.baseCell = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 2, max: 64, step: 0.5, precision: 1 });
    node.addWidget("slider", "Wash layers", 3, (value) => {
      node.properties.washLayers = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 8, step: 1 });
    node.addWidget("slider", "Bleed steps", 3, (value) => {
      node.properties.bleedSteps = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 8, step: 1 });
    node.addWidget("slider", "Bleed strength", 0.65, (value) => {
      node.properties.bleedStrength = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 2, step: 0.01, precision: 2 });
    node.addWidget("slider", "Transparency", 0.72, (value) => {
      node.properties.transparency = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Stroke dens", 0.55, (value) => {
      node.properties.strokeDensity = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 2, step: 0.01, precision: 2 });
    node.addWidget("slider", "Stroke len", 12, (value) => {
      node.properties.strokeLength = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 80, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 1.2, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 12, step: 0.1, precision: 1 });
    node.addWidget("slider", "Threshold", 0.08, (value) => {
      node.properties.threshold = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Color bleed", 0.5, (value) => {
      node.properties.colorBleed = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Granulation", 0.4, (value) => {
      node.properties.granulation = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("number", "Seed", 1337, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { step: 1 });
    node.addWidget("slider", "Refresh", 14, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 512, step: 1 });
    node.addWidget("slider", "Max SVG", 90000, (value) => {
      node.properties.maxSvgPaths = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1000, max: 320000, step: 500 });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & WatercolourToolNode) {
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

    const presetRaw = String(this.properties.preset ?? "normal").toLowerCase();
    const preset: "fast" | "normal" | "slow" =
      presetRaw === "fast" || presetRaw === "slow" ? presetRaw : "normal";
    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1200)), 128, 3200),
      preset,
      baseCell: clamp(Number(this.properties.baseCell ?? 12), 2, 64),
      washLayers: clamp(Math.round(Number(this.properties.washLayers ?? 3)), 1, 8),
      bleedSteps: clamp(Math.round(Number(this.properties.bleedSteps ?? 3)), 0, 8),
      bleedStrength: clamp(Number(this.properties.bleedStrength ?? 0.65), 0, 2),
      transparency: clamp(Number(this.properties.transparency ?? 0.72), 0.05, 1),
      strokeDensity: clamp(Number(this.properties.strokeDensity ?? 0.55), 0, 2),
      strokeLength: clamp(Number(this.properties.strokeLength ?? 12), 1, 80),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1.2), 0.1, 12),
      threshold: clamp(Number(this.properties.threshold ?? 0.08), 0, 1),
      colorBleed: clamp(Number(this.properties.colorBleed ?? 0.5), 0, 1),
      granulation: clamp(Number(this.properties.granulation ?? 0.4), 0, 1),
      seed: Math.round(Number(this.properties.seed ?? 1337)),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 14)), 1, 512),
      maxSvgPaths: clamp(Math.round(Number(this.properties.maxSvgPaths ?? 90000)), 1000, 320000),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
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
      this.status = "generating watercolour...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateWatercolourSvg(
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
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.strokeCount = 0;
          this.pathCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "watercolour error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & WatercolourToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | strokes ${this.strokeCount} | paths ${this.pathCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class LinesToolNode {
  size: [number, number] = [280, 700];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  lineCount = 0;
  pointCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: LinesToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & LinesToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            maxWidth: 700,
            lineCount: 120,
            pointsPerLine: 220,
            refreshEvery: 12,
          }
        : preset === "slow"
          ? {
              maxWidth: 1400,
              lineCount: 420,
              pointsPerLine: 900,
              refreshEvery: 2,
            }
          : {
              maxWidth: 960,
              lineCount: 256,
              pointsPerLine: 512,
              refreshEvery: 6,
            };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Lines", values.lineCount);
    this.setWidgetValue("Points", values.pointsPerLine);
    this.setWidgetValue("Refresh", values.refreshEvery);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & LinesToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & LinesToolNode;
    node.title = createToolTitle("Lines");
    node.properties = {
      preset: "normal",
      maxWidth: 960,
      lineCount: 256,
      pointsPerLine: 512,
      amplitude: 32,
      channel: "red",
      invert: false,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      lineWidth: 1,
      lineAlpha: 1,
      lineColor: "#000000",
      backgroundColor: "#FFFFFF",
      refreshEvery: 6,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("slider", "Max width", 960, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 3000, step: 8 });
    node.addWidget("slider", "Lines", 256, (value) => {
      node.properties.lineCount = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 2, max: 4096, step: 1 });
    node.addWidget("slider", "Points", 512, (value) => {
      node.properties.pointsPerLine = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 4, max: 8192, step: 1 });
    node.addWidget("slider", "Interlinea amp", 32, (value) => {
      node.properties.amplitude = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1024, step: 1 });
    node.addWidget("combo", "Channel", "red", (value) => {
      const v = String(value);
      node.properties.channel = v === "luma" || v === "green" || v === "blue" ? v : "red";
      notifyGraphStateChange(node);
    }, { values: ["red", "green", "blue", "luma"] });
    node.addWidget("toggle", "Invert", false, (value) => {
      node.properties.invert = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Zoom", 1, (value) => {
      node.properties.zoom = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 20, step: 0.01, precision: 2 });
    node.addWidget("slider", "Offset X", 0, (value) => {
      node.properties.offsetX = Number(value);
      notifyGraphStateChange(node);
    }, { min: -5000, max: 5000, step: 1 });
    node.addWidget("slider", "Offset Y", 0, (value) => {
      node.properties.offsetY = Number(value);
      notifyGraphStateChange(node);
    }, { min: -5000, max: 5000, step: 1 });
    node.addWidget("slider", "Line width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 20, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line alpha", 1, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("text", "Line color", "#000000", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Refresh", 6, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 512, step: 1 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & LinesToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.lineCount = 0;
      this.pointCount = 0;
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

    const channelRaw = String(this.properties.channel ?? "red");
    const channel: "luma" | "red" | "green" | "blue" =
      channelRaw === "luma" || channelRaw === "green" || channelRaw === "blue"
        ? channelRaw
        : "red";
    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 960)), 128, 3000),
      lineCount: clamp(Math.round(Number(this.properties.lineCount ?? 256)), 2, 4096),
      pointsPerLine: clamp(Math.round(Number(this.properties.pointsPerLine ?? 512)), 4, 8192),
      amplitude: clamp(Number(this.properties.amplitude ?? 32), 0, 10000),
      channel,
      invert: Boolean(this.properties.invert ?? false),
      zoom: clamp(Number(this.properties.zoom ?? 1), 0.05, 20),
      offsetX: Number(this.properties.offsetX ?? 0),
      offsetY: Number(this.properties.offsetY ?? 0),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 20),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 1), 0, 1),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#000000")),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 6)), 1, 512),
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
      this.status = "generating lines...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateLinesSvg(
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
          this.lineCount = result.lineCount;
          this.pointCount = result.pointCount;
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
          this.lineCount = 0;
          this.pointCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "lines error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & LinesToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | lines ${this.lineCount} | points ${this.pointCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class DotsToolNode {
  size: [number, number] = [280, 640];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  dotCount = 0;
  gridInfo = "-";
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: DotsToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & DotsToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? { maxWidth: 800, tileSize: 14, refreshEvery: 10 }
        : preset === "slow"
          ? { maxWidth: 1600, tileSize: 5, refreshEvery: 2 }
          : { maxWidth: 1200, tileSize: 8, refreshEvery: 4 };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Tile size", values.tileSize);
    this.setWidgetValue("Refresh", values.refreshEvery);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & DotsToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & DotsToolNode;
    node.title = createToolTitle("Dots");
    node.properties = {
      preset: "normal",
      maxWidth: 1200,
      tileSize: 8,
      dotScale: 1,
      jitter: 0,
      sampleMode: "nearest",
      backgroundColor: "#000000",
      stroke: false,
      strokeColor: "#000000",
      strokeWidth: 0.4,
      refreshEvery: 4,
      seed: 1337,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("slider", "Max width", 1200, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 3000, step: 8 });
    node.addWidget("slider", "Tile size", 8, (value) => {
      node.properties.tileSize = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 2, max: 256, step: 0.5, precision: 1 });
    node.addWidget("slider", "Dot scale", 1, (value) => {
      node.properties.dotScale = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 2, step: 0.01, precision: 2 });
    node.addWidget("slider", "Jitter", 0, (value) => {
      node.properties.jitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("combo", "Sample", "nearest", (value) => {
      node.properties.sampleMode = String(value) === "average" ? "average" : "nearest";
      notifyGraphStateChange(node);
    }, { values: ["nearest", "average"] });
    node.addWidget("text", "BG color", "#000000", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("toggle", "Stroke", false, (value) => {
      node.properties.stroke = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "Stroke color", "#000000", (value) => {
      node.properties.strokeColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Stroke width", 0.4, (value) => {
      node.properties.strokeWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 20, step: 0.1, precision: 1 });
    node.addWidget("slider", "Refresh", 4, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 512, step: 1 });
    node.addWidget("number", "Seed", 1337, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { step: 1 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & DotsToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.dotCount = 0;
      this.gridInfo = "-";
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1200)), 128, 3000),
      tileSize: clamp(Number(this.properties.tileSize ?? 8), 2, 256),
      dotScale: clamp(Number(this.properties.dotScale ?? 1), 0.05, 2),
      jitter: clamp(Number(this.properties.jitter ?? 0), 0, 1),
      sampleMode: String(this.properties.sampleMode ?? "nearest") === "average" ? "average" as const : "nearest" as const,
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#000000")),
      stroke: Boolean(this.properties.stroke ?? false),
      strokeColor: normalizeHexColor(String(this.properties.strokeColor ?? "#000000")),
      strokeWidth: clamp(Number(this.properties.strokeWidth ?? 0.4), 0.1, 20),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 4)), 1, 512),
      seed: Math.round(Number(this.properties.seed ?? 1337)),
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
      this.status = "generating dots...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateDotsSvg(
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
          this.dotCount = result.dotCount;
          this.gridInfo = `${result.cols}x${result.rows}`;
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
          this.dotCount = 0;
          this.gridInfo = "-";
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "dots error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & DotsToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | dots ${this.dotCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`grid ${this.gridInfo}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
export class CarboncinoToolNode {
  size: [number, number] = [280, 460];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "idle";
  progress = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & CarboncinoToolNode;
    node.title = createToolTitle("Carboncino");
    node.properties = {
      maxWidth: 500,
      upscale: 2,
      density: 1,
      pressure: 1,
      maxStrokes: 260000,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("slider", "Max width", 500, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 1400, step: 8 });
    node.addWidget("slider", "Upscale", 2, (value) => {
      node.properties.upscale = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 4, step: 0.5, precision: 1 });
    node.addWidget("slider", "Density", 1, (value) => {
      node.properties.density = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 2.5, step: 0.1, precision: 1 });
    node.addWidget("slider", "Pressure", 1, (value) => {
      node.properties.pressure = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.3, max: 2, step: 0.1, precision: 1 });
    node.addWidget("slider", "Max strokes", 260000, (value) => {
      node.properties.maxStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 20000, max: 600000, step: 5000 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & CarboncinoToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 500)), 128, 1400),
      upscale: clamp(Number(this.properties.upscale ?? 2), 1, 4),
      density: clamp(Number(this.properties.density ?? 1), 0.2, 2.5),
      pressure: clamp(Number(this.properties.pressure ?? 1), 0.3, 2),
      maxStrokes: clamp(Math.round(Number(this.properties.maxStrokes ?? 260000)), 20000, 600000),
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
      this.status = "inizializzazione";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void (async () => {
        const source = fitSourceToMaxWidthCanvas(input, options.maxWidth);
        const width = source.width;
        const height = source.height;
        const sourceContext = source.getContext("2d", { willReadFrequently: true });
        if (!sourceContext) {
          throw new Error("2D context not available.");
        }

        const originalImageData = sourceContext.getImageData(0, 0, width, height);
        const grayMap = createGrayMapFromImageData(originalImageData);
        const output = document.createElement("canvas");
        output.width = Math.max(1, Math.round(width * options.upscale));
        output.height = Math.max(1, Math.round(height * options.upscale));
        const outputContext = output.getContext("2d", { willReadFrequently: true });
        if (!outputContext) {
          throw new Error("2D context not available.");
        }
        outputContext.fillStyle = "white";
        outputContext.fillRect(0, 0, output.width, output.height);
        outputContext.lineCap = "round";

        const baseStrokes = width * height * options.density;
        let pass1Strokes = (baseStrokes / 3) * options.upscale * options.upscale;
        let pass2Strokes = (baseStrokes / 2.5) * options.upscale * options.upscale;
        let pass3Strokes = (baseStrokes / 2) * options.upscale * options.upscale;
        const totalRaw = pass1Strokes + pass2Strokes + pass3Strokes;
        if (totalRaw > options.maxStrokes) {
          const ratio = options.maxStrokes / totalRaw;
          pass1Strokes *= ratio;
          pass2Strokes *= ratio;
          pass3Strokes *= ratio;
        }

        const progressState = {
          drawn: 0,
          total: Math.max(1, Math.round(pass1Strokes + pass2Strokes + pass3Strokes)),
        };

        updateProgress(0, "passata: base tonale");
        const layer1Ok = await renderCarbonLayer({
          context: outputContext,
          passName: "base tonale",
          numStrokes: pass1Strokes,
          brightnessThreshold: 220,
          angle: 45,
          angleJitter: 15,
          scumbleChance: 0,
          getStrokeLength: (gray) => 15 + (gray / 255) * 25,
          getStrokeWidth: (gray) => 0.5 + (1 - gray / 255) * 1,
          getAlpha: (gray) => ((1 - gray / 255) ** 2) * 0.1,
          grayMap,
          width,
          height,
          upscaleFactor: options.upscale,
          alphaFactor: options.pressure,
          progressState,
          shouldCancel,
          onProgress: updateProgress,
        });
        if (!layer1Ok || shouldCancel()) {
          return;
        }

        updateProgress(progressState.drawn / progressState.total, "passata: ombreggiature");
        const layer2Ok = await renderCarbonLayer({
          context: outputContext,
          passName: "ombreggiature",
          numStrokes: pass2Strokes,
          brightnessThreshold: 160,
          angle: 135,
          angleJitter: 20,
          scumbleChance: 0.02,
          getStrokeLength: (gray) => 8 + (gray / 255) * 15,
          getStrokeWidth: (gray) => 0.8 + (1 - gray / 255) * 1.5,
          getAlpha: (gray) => ((1 - gray / 255) ** 2) * 0.3,
          grayMap,
          width,
          height,
          upscaleFactor: options.upscale,
          alphaFactor: options.pressure,
          progressState,
          shouldCancel,
          onProgress: updateProgress,
        });
        if (!layer2Ok || shouldCancel()) {
          return;
        }

        updateProgress(progressState.drawn / progressState.total, "passata: dettagli e texture");
        const layer3Ok = await renderCarbonLayer({
          context: outputContext,
          passName: "dettagli e texture",
          numStrokes: pass3Strokes,
          brightnessThreshold: 90,
          angle: "random",
          angleJitter: 180,
          scumbleChance: 0.05,
          getStrokeLength: (gray) => 3 + (gray / 255) * 8,
          getStrokeWidth: (gray) => 1 + (1 - gray / 255) * 2,
          getAlpha: (gray) => ((1 - gray / 255) ** 1.5) * 0.8,
          grayMap,
          width,
          height,
          upscaleFactor: options.upscale,
          alphaFactor: options.pressure,
          progressState,
          shouldCancel,
          onProgress: updateProgress,
        });
        if (!layer3Ok || shouldCancel()) {
          return;
        }

        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = output;
        this.progress = 1;
        this.status = "ready";
        this.executionMs = performance.now() - start;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      })().catch((error) => {
        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = input;
        this.progress = 0;
        this.status = error instanceof Error ? error.message : "carboncino error";
        this.executionMs = null;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      });
    }

    this.setOutputData(0, this.preview ?? input);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & CarboncinoToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | out ${this.preview ? `${this.preview.width}x${this.preview.height}` : "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

export class SeargeantToolNode {
  size: [number, number] = [280, 450];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  status = "idle";
  progress = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & SeargeantToolNode;
    node.title = createToolTitle("Seargeant");
    node.properties = {
      canvasSize: 512,
      blockingStrokes: 1000,
      formStrokes: 3000,
      detailStrokes: 6000,
      highlightsStrokes: 500,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget("slider", "Canvas", 512, (value) => {
      node.properties.canvasSize = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 1024, step: 32 });
    node.addWidget("slider", "Blocking", 1000, (value) => {
      node.properties.blockingStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 200, max: 8000, step: 100 });
    node.addWidget("slider", "Form", 3000, (value) => {
      node.properties.formStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 500, max: 14000, step: 100 });
    node.addWidget("slider", "Detail", 6000, (value) => {
      node.properties.detailStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1000, max: 26000, step: 200 });
    node.addWidget("slider", "Highlights", 500, (value) => {
      node.properties.highlightsStrokes = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 100, max: 5000, step: 50 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & SeargeantToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      canvasSize: clamp(Math.round(Number(this.properties.canvasSize ?? 512)), 128, 1024),
      blockingStrokes: clamp(Math.round(Number(this.properties.blockingStrokes ?? 1000)), 200, 8000),
      formStrokes: clamp(Math.round(Number(this.properties.formStrokes ?? 3000)), 500, 14000),
      detailStrokes: clamp(Math.round(Number(this.properties.detailStrokes ?? 6000)), 1000, 26000),
      highlightsStrokes: clamp(Math.round(Number(this.properties.highlightsStrokes ?? 500)), 100, 5000),
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
      this.status = "fase 1/5 analisi";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void (async () => {
        const workingSource = fitSourceToSquareCanvas(input, options.canvasSize);
        const output = document.createElement("canvas");
        output.width = options.canvasSize;
        output.height = options.canvasSize;
        const outputContext = output.getContext("2d", { willReadFrequently: true });
        const sourceContext = workingSource.getContext("2d", { willReadFrequently: true });
        if (!outputContext || !sourceContext) {
          throw new Error("2D context not available.");
        }

        const originalColorData = sourceContext.getImageData(0, 0, options.canvasSize, options.canvasSize);
        const avg = getAverageColorFromImageData(originalColorData);
        outputContext.fillStyle = `rgb(${avg.r}, ${avg.g}, ${avg.b})`;
        outputContext.fillRect(0, 0, output.width, output.height);

        const gray = toGrayscaleImageData(originalColorData);
        const gradientMap = sobelOperatorFromGrayscale(gray);
        const blurredColorData = gaussianBlurImageData(originalColorData, 8);
        if (shouldCancel()) {
          return;
        }

        updateProgress(0.15, "fase 2/5 blocking-in");
        const blockingOk = await renderSargentLayer({
          context: outputContext,
          numStrokes: options.blockingStrokes,
          minSize: 30,
          maxSize: 60,
          colorSource: blurredColorData,
          gradientMap,
          opacity: 0.7,
          colorJitter: 20,
          shouldCancel,
          onProgress: (p) => updateProgress(0.15 + p * 0.25),
        });
        if (!blockingOk || shouldCancel()) {
          return;
        }

        updateProgress(0.4, "fase 3/5 costruzione forma");
        const formOk = await renderSargentLayer({
          context: outputContext,
          numStrokes: options.formStrokes,
          minSize: 10,
          maxSize: 25,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.75,
          colorJitter: 25,
          shouldCancel,
          onProgress: (p) => updateProgress(0.4 + p * 0.35),
        });
        if (!formOk || shouldCancel()) {
          return;
        }

        updateProgress(0.75, "fase 4/5 dettagli");
        const detailOk = await renderSargentLayer({
          context: outputContext,
          numStrokes: options.detailStrokes,
          minSize: 3,
          maxSize: 10,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.85,
          sharpen: true,
          colorJitter: 15,
          shouldCancel,
          onProgress: (p) => updateProgress(0.75 + p * 0.2),
        });
        if (!detailOk || shouldCancel()) {
          return;
        }

        updateProgress(0.95, "fase 5/5 luci speculari");
        const highlightsOk = await renderSargentLayer({
          context: outputContext,
          numStrokes: options.highlightsStrokes,
          minSize: 2,
          maxSize: 6,
          colorSource: originalColorData,
          gradientMap,
          opacity: 0.95,
          sharpen: true,
          colorJitter: 5,
          brightnessBoost: 40,
          shouldCancel,
          onProgress: (p) => updateProgress(0.95 + p * 0.05),
        });
        if (!highlightsOk || shouldCancel()) {
          return;
        }

        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = output;
        this.progress = 1;
        this.status = "ready";
        this.executionMs = performance.now() - start;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      })().catch((error) => {
        if (renderToken !== this.renderToken) {
          return;
        }
        this.preview = input;
        this.progress = 0;
        this.status = error instanceof Error ? error.message : "seargeant error";
        this.executionMs = null;
        this.isRendering = false;
        this.setDirtyCanvas(true, true);
      });
    }

    this.setOutputData(0, this.preview ?? input);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SeargeantToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      `${this.status}${this.isRendering ? "..." : ""}`,
      10,
      layout.footerTop + 12,
    );
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | out ${this.preview ? `${this.preview.width}x${this.preview.height}` : "-"}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}

export class DelanoyToolNode {
  size: [number, number] = [280, 500];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  pointCount = 0;
  edgeCount = 0;
  triangleCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & DelanoyToolNode;
    node.title = createToolTitle("Delanoy");
    node.properties = {
      maxWidth: 768,
      gridCells: 96,
      jitter: 0,
      scale: 3,
      lineWidth: 1,
      lineColor: "#000000",
      backgroundColor: "#FFFFFF",
      renderMode: "wireframe",
      fillOpacity: 0.9,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 768, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Grid cells", 96, (value) => {
      node.properties.gridCells = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 8, max: 320, step: 1 });
    node.addWidget("slider", "Jitter", 0, (value) => {
      node.properties.jitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Scale", 3, (value) => {
      node.properties.scale = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("combo", "Render", "wireframe", (value) => {
      const mode = String(value);
      node.properties.renderMode =
        mode === "fill" || mode === "both" ? mode : "wireframe";
      notifyGraphStateChange(node);
    }, { values: ["wireframe", "fill", "both"] });
    node.addWidget("slider", "Fill alpha", 0.9, (value) => {
      node.properties.fillOpacity = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("text", "Line color", "#000000", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & DelanoyToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.pointCount = 0;
      this.edgeCount = 0;
      this.triangleCount = 0;
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 768)), 128, 2400),
      gridCells: clamp(Math.round(Number(this.properties.gridCells ?? 96)), 8, 320),
      jitter: clamp(Number(this.properties.jitter ?? 0), 0, 1),
      scale: clamp(Number(this.properties.scale ?? 3), 1, 8),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 8),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#000000")),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
      renderMode:
        String(this.properties.renderMode ?? "wireframe") === "fill"
          ? "fill" as const
          : String(this.properties.renderMode ?? "wireframe") === "both"
            ? "both" as const
            : "wireframe" as const,
      fillOpacity: clamp(Number(this.properties.fillOpacity ?? 0.9), 0, 1),
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
      this.status = "generating delanoy...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateDelanoySvg(
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
          this.edgeCount = result.edgeCount;
          this.pointCount = result.pointCount;
          this.triangleCount = result.triangleCount;
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
          this.edgeCount = 0;
          this.pointCount = 0;
          this.triangleCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "delanoy error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & DelanoyToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | points ${this.pointCount} | tri ${this.triangleCount} | edges ${this.edgeCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class Delanoy2ToolNode {
  size: [number, number] = [280, 530];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  pointCount = 0;
  triangleCount = 0;
  circleCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & Delanoy2ToolNode;
    node.title = createToolTitle("Delanoy2");
    node.properties = {
      maxWidth: 768,
      gridCells: 20,
      jitter: 1,
      scale: 1,
      lineWidth: 1,
      lineColor: "#000000",
      backgroundColor: "#FFFFFF",
      radiusScale: 1,
      radiusMode: "vertex",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 768, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Grid cells", 20, (value) => {
      node.properties.gridCells = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 6, max: 220, step: 1 });
    node.addWidget("slider", "Jitter", 1, (value) => {
      node.properties.jitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Scale", 1, (value) => {
      node.properties.scale = Number(value);
      notifyGraphStateChange(node);
    }, { min: 1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("combo", "Radius mode", "vertex", (value) => {
      node.properties.radiusMode = String(value) === "inradius" ? "inradius" : "vertex";
      notifyGraphStateChange(node);
    }, { values: ["vertex", "inradius"] });
    node.addWidget("slider", "Radius scale", 1, (value) => {
      node.properties.radiusScale = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Line width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("text", "Line color", "#000000", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & Delanoy2ToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.pointCount = 0;
      this.triangleCount = 0;
      this.circleCount = 0;
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 768)), 128, 2400),
      gridCells: clamp(Math.round(Number(this.properties.gridCells ?? 20)), 6, 220),
      jitter: clamp(Number(this.properties.jitter ?? 1), 0, 1),
      scale: clamp(Number(this.properties.scale ?? 1), 1, 8),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 8),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#000000")),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
      radiusScale: clamp(Number(this.properties.radiusScale ?? 1), 0.1, 3),
      radiusMode: String(this.properties.radiusMode ?? "vertex") === "inradius" ? "inradius" as const : "vertex" as const,
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
      this.status = "generating delanoy2...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateDelanoy2Svg(
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
          this.pointCount = result.pointCount;
          this.triangleCount = result.triangleCount;
          this.circleCount = result.circleCount;
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
          this.pointCount = 0;
          this.triangleCount = 0;
          this.circleCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "delanoy2 error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & Delanoy2ToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | points ${this.pointCount} | tri ${this.triangleCount} | circles ${this.circleCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class AsciifyToolNode {
  size: [number, number] = [280, 590];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  text: string | null = null;
  status = "idle";
  progress = 0;
  rowCount = 0;
  colCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: AsciifyToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & AsciifyToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            maxWidth: 640,
            columns: 120,
            refreshEvery: 8,
          }
        : preset === "slow"
          ? {
              maxWidth: 1400,
              columns: 300,
              refreshEvery: 2,
            }
          : {
              maxWidth: 960,
              columns: 180,
              refreshEvery: 4,
            };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Columns", values.columns);
    this.setWidgetValue("Refresh", values.refreshEvery);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & AsciifyToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & AsciifyToolNode;
    node.title = createToolTitle("Asciify");
    node.properties = {
      preset: "normal",
      maxWidth: 960,
      columns: 180,
      charsetPreset: "extended",
      invert: false,
      charAspect: 0.5,
      fontScale: 1.1,
      foregroundColor: "#000000",
      backgroundColor: "#FFFFFF",
      refreshEvery: 4,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addOutput("txt", "string");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("slider", "Max width", 960, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 2800, step: 8 });
    node.addWidget("slider", "Columns", 180, (value) => {
      node.properties.columns = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 16, max: 800, step: 1 });
    node.addWidget("combo", "Charset", "extended", (value) => {
      const preset = String(value);
      if (ASCIIFY_CHARSET_PRESETS.includes(preset as AsciifyCharsetPreset)) {
        node.properties.charsetPreset = preset;
      } else {
        node.properties.charsetPreset = "extended";
      }
      notifyGraphStateChange(node);
    }, { values: ASCIIFY_CHARSET_PRESETS });
    node.addWidget("toggle", "Invert", false, (value) => {
      node.properties.invert = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Char aspect", 0.5, (value) => {
      node.properties.charAspect = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.25, max: 2, step: 0.01, precision: 2 });
    node.addWidget("slider", "Font scale", 1.1, (value) => {
      node.properties.fontScale = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.4, max: 2.2, step: 0.01, precision: 2 });
    node.addWidget("text", "FG color", "#000000", (value) => {
      node.properties.foregroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Refresh", 4, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 128, step: 1 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & AsciifyToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.text = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.rowCount = 0;
      this.colCount = 0;
      this.outputWidth = 0;
      this.outputHeight = 0;
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.setOutputData(2, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 960)), 128, 2800),
      columns: clamp(Math.round(Number(this.properties.columns ?? 180)), 16, 800),
      charset:
        ASCIIFY_CHARSETS[
          ASCIIFY_CHARSET_PRESETS.includes(String(this.properties.charsetPreset) as AsciifyCharsetPreset)
            ? (String(this.properties.charsetPreset) as AsciifyCharsetPreset)
            : "extended"
        ],
      invert: Boolean(this.properties.invert ?? false),
      charAspect: clamp(Number(this.properties.charAspect ?? 0.5), 0.25, 2),
      fontScale: clamp(Number(this.properties.fontScale ?? 1.1), 0.4, 2.2),
      foregroundColor: normalizeHexColor(String(this.properties.foregroundColor ?? "#000000")),
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 4)), 1, 128),
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
      this.status = "generating ascii...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateAsciifyOutput(
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
          this.text = result.text;
          this.rowCount = result.rowCount;
          this.colCount = result.colCount;
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
          this.text = null;
          this.rowCount = 0;
          this.colCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "asciify error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.setOutputData(2, this.text);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & AsciifyToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | grid ${this.colCount}x${this.rowCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class SketchToolNode {
  size: [number, number] = [280, 640];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: SketchToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & SketchToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            maxWidth: 640,
            lineLimit: 700,
            squiggleMaxLength: 220,
            gridCells: 36,
            darkestAreaCandidates: 2,
            simplifyTolerance: 2.2,
            refreshEvery: 48,
          }
        : preset === "slow"
          ? {
              maxWidth: 1200,
              lineLimit: 2800,
              squiggleMaxLength: 900,
              gridCells: 72,
              darkestAreaCandidates: 6,
              simplifyTolerance: 1.2,
              refreshEvery: 12,
            }
          : {
              maxWidth: 960,
              lineLimit: 1400,
              squiggleMaxLength: 480,
              gridCells: 52,
              darkestAreaCandidates: 4,
              simplifyTolerance: 1.8,
              refreshEvery: 24,
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
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & SketchToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & SketchToolNode;
    node.title = createToolTitle("Sketch");
    node.properties = {
      preset: "normal",
      maxWidth: 960,
      lineLimit: 1400,
      squiggleMaxLength: 480,
      gridCells: 52,
      darkestAreaCandidates: 4,
      lineWidth: 1,
      lineAlpha: 0.12,
      simplifyTolerance: 1.8,
      lightenStep: 22,
      refreshEvery: 24,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("slider", "Max width", 960, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Lines", 1400, (value) => {
      node.properties.lineLimit = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 10, max: 12000, step: 1 });
    node.addWidget("slider", "Path len", 480, (value) => {
      node.properties.squiggleMaxLength = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 8, max: 12000, step: 1 });
    node.addWidget("slider", "Grid", 52, (value) => {
      node.properties.gridCells = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 8, max: 400, step: 1 });
    node.addWidget("slider", "Dark areas", 4, (value) => {
      node.properties.darkestAreaCandidates = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 12, step: 1 });
    node.addWidget("slider", "Width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 20, step: 0.1, precision: 1 });
    node.addWidget("slider", "Alpha", 0.12, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.01, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Simplify", 1.8, (value) => {
      node.properties.simplifyTolerance = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 6, step: 0.1, precision: 1 });
    node.addWidget("slider", "Lighten", 22, (value) => {
      node.properties.lightenStep = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 255, step: 1 });
    node.addWidget("slider", "Refresh", 24, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 4, max: 256, step: 1 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & SketchToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 960)), 128, 2400),
      lineLimit: clamp(Math.round(Number(this.properties.lineLimit ?? 1400)), 10, 12000),
      squiggleMaxLength: clamp(Math.round(Number(this.properties.squiggleMaxLength ?? 480)), 8, 12000),
      gridCells: clamp(Math.round(Number(this.properties.gridCells ?? 52)), 8, 400),
      darkestAreaCandidates: clamp(Math.round(Number(this.properties.darkestAreaCandidates ?? 4)), 1, 12),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 20),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 0.12), 0.01, 1),
      simplifyTolerance: clamp(Number(this.properties.simplifyTolerance ?? 1.8), 0, 6),
      lightenStep: clamp(Math.round(Number(this.properties.lightenStep ?? 22)), 1, 255),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 24)), 4, 256),
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
      this.status = "generating sketch...";
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
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "sketch error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & SketchToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | paths ${this.pathCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class LinefyToolNode {
  size: [number, number] = [280, 600];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  lineCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  mse: number | null = null;
  psnr: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: LinefyToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & LinefyToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            maxWidth: 480,
            numLines: 700,
            testLines: 24,
            anchorSamples: 256,
          }
        : preset === "slow"
          ? {
              maxWidth: 960,
              numLines: 3200,
              testLines: 160,
              anchorSamples: 2048,
            }
          : {
              maxWidth: 640,
              numLines: 1600,
              testLines: 64,
              anchorSamples: 768,
            };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Num lines", values.numLines);
    this.setWidgetValue("Test lines", values.testLines);
    this.setWidgetValue("Anchor samples", values.anchorSamples);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & LinefyToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & LinefyToolNode;
    node.title = createToolTitle("Linefy");
    node.properties = {
      preset: "normal",
      maxWidth: 640,
      colorMode: "color",
      mixing: "subtractive",
      numLines: 1600,
      lineStep: 16,
      testLines: 64,
      anchorSamples: 768,
      lineWidth: 1,
      seed: 1337,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("combo", "Color mode", "color", (value) => {
      node.properties.colorMode = String(value) === "grayscale" ? "grayscale" : "color";
      notifyGraphStateChange(node);
    }, { values: ["color", "grayscale"] });
    node.addWidget("combo", "Mixing", "subtractive", (value) => {
      node.properties.mixing = String(value) === "additive" ? "additive" : "subtractive";
      notifyGraphStateChange(node);
    }, { values: ["subtractive", "additive"] });
    node.addWidget("slider", "Max width", 640, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Num lines", 1600, (value) => {
      node.properties.numLines = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 12000, step: 1 });
    node.addWidget("slider", "Line heaviness", 16, (value) => {
      node.properties.lineStep = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 255, step: 1 });
    node.addWidget("slider", "Test lines", 64, (value) => {
      node.properties.testLines = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 4, max: 4096, step: 1 });
    node.addWidget("slider", "Anchor samples", 768, (value) => {
      node.properties.anchorSamples = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 32, max: 65536, step: 32 });
    node.addWidget("slider", "Line width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("number", "Seed", 1337, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { step: 1 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & LinefyToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.lineCount = 0;
      this.outputWidth = 0;
      this.outputHeight = 0;
      this.executionMs = null;
      this.mse = null;
      this.psnr = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 640)), 128, 2400),
      colorMode: String(this.properties.colorMode ?? "color") === "grayscale" ? "grayscale" as const : "color" as const,
      mixing: String(this.properties.mixing ?? "subtractive") === "additive" ? "additive" as const : "subtractive" as const,
      numLines: clamp(Math.round(Number(this.properties.numLines ?? 1600)), 1, 12000),
      lineStep: clamp(Math.round(Number(this.properties.lineStep ?? 16)), 1, 255),
      testLines: clamp(Math.round(Number(this.properties.testLines ?? 64)), 4, 4096),
      anchorSamples: clamp(Math.round(Number(this.properties.anchorSamples ?? 768)), 32, 65536),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 8),
      seed: Math.round(Number(this.properties.seed ?? 1337)),
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
      this.status = "generating linefy...";
      this.mse = null;
      this.psnr = null;
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateLinefySvg(
        input,
        options,
        shouldCancel,
        updateProgress,
        (partialPreview) => {
          if (shouldCancel()) {
            return;
          }
          this.preview = partialPreview;
          const metrics = computeImageErrorMetrics(input, partialPreview);
          this.mse = metrics.mse;
          this.psnr = metrics.psnr;
          this.setDirtyCanvas(true, true);
        },
      )
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return;
          }
          this.preview = result.preview;
          this.svg = result.svg;
          this.lineCount = result.lineCount;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.progress = 1;
          this.status = "ready";
          this.executionMs = performance.now() - start;
          const metrics = computeImageErrorMetrics(input, result.preview);
          this.mse = metrics.mse;
          this.psnr = metrics.psnr;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.lineCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "linefy error";
          this.executionMs = null;
          this.mse = null;
          this.psnr = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & LinefyToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 5 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | lines ${this.lineCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.fillText(formatImageErrorMetrics(this.mse, this.psnr), 10, layout.footerTop + 84);
    context.restore();
  }
}

export class Linefy2ToolNode {
  size: [number, number] = [280, 620];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  lineCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  mse: number | null = null;
  psnr: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: Linefy2ToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & Linefy2ToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            maxWidth: 512,
            numLines: 800,
            testLines: 24,
            anchorSamples: 256,
            scoreSamples: 16,
            refreshEvery: 48,
          }
        : preset === "slow"
          ? {
              maxWidth: 1024,
              numLines: 3500,
              testLines: 160,
              anchorSamples: 2048,
              scoreSamples: 64,
              refreshEvery: 16,
            }
          : {
              maxWidth: 768,
              numLines: 1800,
              testLines: 64,
              anchorSamples: 768,
              scoreSamples: 32,
              refreshEvery: 24,
            };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Max width", values.maxWidth);
    this.setWidgetValue("Num lines", values.numLines);
    this.setWidgetValue("Test lines", values.testLines);
    this.setWidgetValue("Anchor samples", values.anchorSamples);
    this.setWidgetValue("Score samples", values.scoreSamples);
    this.setWidgetValue("Refresh", values.refreshEvery);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & Linefy2ToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & Linefy2ToolNode;
    node.title = createToolTitle("Linefy2");
    node.properties = {
      preset: "normal",
      maxWidth: 768,
      colorMode: "color",
      mixing: "subtractive",
      numLines: 1800,
      lineStep: 16,
      testLines: 64,
      anchorSamples: 768,
      scoreSamples: 32,
      refreshEvery: 24,
      lineWidth: 1,
      seed: 1337,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("combo", "Color mode", "color", (value) => {
      node.properties.colorMode = String(value) === "grayscale" ? "grayscale" : "color";
      notifyGraphStateChange(node);
    }, { values: ["color", "grayscale"] });
    node.addWidget("combo", "Mixing", "subtractive", (value) => {
      node.properties.mixing = String(value) === "additive" ? "additive" : "subtractive";
      notifyGraphStateChange(node);
    }, { values: ["subtractive", "additive"] });
    node.addWidget("slider", "Max width", 768, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Num lines", 1800, (value) => {
      node.properties.numLines = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 20000, step: 1 });
    node.addWidget("slider", "Line heaviness", 16, (value) => {
      node.properties.lineStep = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 255, step: 1 });
    node.addWidget("slider", "Test lines", 64, (value) => {
      node.properties.testLines = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 4, max: 4096, step: 1 });
    node.addWidget("slider", "Anchor samples", 768, (value) => {
      node.properties.anchorSamples = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 32, max: 65536, step: 32 });
    node.addWidget("slider", "Score samples", 32, (value) => {
      node.properties.scoreSamples = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 4, max: 256, step: 1 });
    node.addWidget("slider", "Refresh", 24, (value) => {
      node.properties.refreshEvery = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 4, max: 256, step: 1 });
    node.addWidget("slider", "Line width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("number", "Seed", 1337, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { step: 1 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & Linefy2ToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.lineCount = 0;
      this.outputWidth = 0;
      this.outputHeight = 0;
      this.executionMs = null;
      this.mse = null;
      this.psnr = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 768)), 128, 2400),
      colorMode: String(this.properties.colorMode ?? "color") === "grayscale" ? "grayscale" as const : "color" as const,
      mixing: String(this.properties.mixing ?? "subtractive") === "additive" ? "additive" as const : "subtractive" as const,
      numLines: clamp(Math.round(Number(this.properties.numLines ?? 1800)), 1, 20000),
      lineStep: clamp(Math.round(Number(this.properties.lineStep ?? 16)), 1, 255),
      testLines: clamp(Math.round(Number(this.properties.testLines ?? 64)), 4, 4096),
      anchorSamples: clamp(Math.round(Number(this.properties.anchorSamples ?? 768)), 32, 65536),
      scoreSamples: clamp(Math.round(Number(this.properties.scoreSamples ?? 32)), 4, 256),
      refreshEvery: clamp(Math.round(Number(this.properties.refreshEvery ?? 24)), 4, 256),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 8),
      seed: Math.round(Number(this.properties.seed ?? 1337)),
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
      this.status = "generating linefy2...";
      this.mse = null;
      this.psnr = null;
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateLinefy2Svg(
        input,
        options,
        shouldCancel,
        updateProgress,
        (partialPreview) => {
          if (shouldCancel()) {
            return;
          }
          this.preview = partialPreview;
          const metrics = computeImageErrorMetrics(input, partialPreview);
          this.mse = metrics.mse;
          this.psnr = metrics.psnr;
          this.setDirtyCanvas(true, true);
        },
      )
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return;
          }
          this.preview = result.preview;
          this.svg = result.svg;
          this.lineCount = result.lineCount;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.progress = 1;
          this.status = "ready";
          this.executionMs = performance.now() - start;
          const metrics = computeImageErrorMetrics(input, result.preview);
          this.mse = metrics.mse;
          this.psnr = metrics.psnr;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.lineCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "linefy2 error";
          this.executionMs = null;
          this.mse = null;
          this.psnr = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & Linefy2ToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 5 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | lines ${this.lineCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.fillText(formatImageErrorMetrics(this.mse, this.psnr), 10, layout.footerTop + 84);
    context.restore();
  }
}

export class GridDotToolNode {
  size: [number, number] = [280, 560];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  dotCount = 0;
  gridInfo = "-";
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  setWidgetValue(this: GridDotToolNode, name: string, value: unknown) {
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

  applyPreset(
    this: PreviewAwareNode & GridDotToolNode,
    preset: "fast" | "normal" | "slow",
    notify = true,
  ) {
    const values =
      preset === "fast"
        ? {
            gridCells: 80,
            samplesPerCell: 1,
            radiusMin: 0,
            radiusMax: 2.6,
            gamma: 1,
          }
        : preset === "slow"
          ? {
              gridCells: 220,
              samplesPerCell: 9,
              radiusMin: 0,
              radiusMax: 1.15,
              gamma: 1.1,
            }
          : {
              gridCells: 140,
              samplesPerCell: 4,
              radiusMin: 0,
              radiusMax: 1.7,
              gamma: 1.05,
            };
    Object.assign(this.properties, values, { preset });
    this.setWidgetValue("Preset", preset);
    this.setWidgetValue("Grid cells", values.gridCells);
    this.setWidgetValue("Samples", values.samplesPerCell);
    this.setWidgetValue("R min", values.radiusMin);
    this.setWidgetValue("R max", values.radiusMax);
    this.setWidgetValue("Gamma", values.gamma);
    this.setDirtyCanvas(true, true);
    if (notify) {
      notifyGraphStateChange(this);
    }
  }

  markCustom(this: PreviewAwareNode & GridDotToolNode) {
    if (String(this.properties.preset ?? "normal") !== "custom") {
      this.properties.preset = "custom";
      this.setWidgetValue("Preset", "custom");
    }
  }

  constructor() {
    const node = this as unknown as PreviewAwareNode & GridDotToolNode;
    node.title = createToolTitle("GridDot");
    node.properties = {
      preset: "normal",
      maxWidth: 1200,
      gridCells: 140,
      samplesPerCell: 4,
      radiusMin: 0,
      radiusMax: 1.7,
      gamma: 1.05,
      invert: false,
      dotColor: "#000000",
      dotOpacity: 1,
      backgroundMode: "color",
      backgroundColor: "#FFFFFF",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("combo", "Preset", "normal", (value) => {
      const preset = String(value);
      if (preset === "fast" || preset === "normal" || preset === "slow") {
        node.applyPreset(preset, true);
      } else {
        node.properties.preset = "custom";
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      }
    }, { values: ["fast", "normal", "slow", "custom"] });
    node.addWidget("slider", "Max width", 1200, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Grid cells", 140, (value) => {
      node.properties.gridCells = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 8, max: 1000, step: 1 });
    node.addWidget("slider", "Samples", 4, (value) => {
      node.properties.samplesPerCell = Math.round(Number(value));
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 1, max: 36, step: 1 });
    node.addWidget("slider", "R min", 0, (value) => {
      node.properties.radiusMin = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0, max: 12, step: 0.05, precision: 2 });
    node.addWidget("slider", "R max", 1.7, (value) => {
      node.properties.radiusMax = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.05, max: 12, step: 0.05, precision: 2 });
    node.addWidget("slider", "Gamma", 1.05, (value) => {
      node.properties.gamma = Number(value);
      node.markCustom();
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("toggle", "Invert", false, (value) => {
      node.properties.invert = Boolean(value);
      notifyGraphStateChange(node);
    });
    node.addWidget("text", "Dot color", "#000000", (value) => {
      node.properties.dotColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Dot alpha", 1, (value) => {
      node.properties.dotOpacity = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("combo", "BG mode", "color", (value) => {
      node.properties.backgroundMode = String(value) === "transparent" ? "transparent" : "color";
      notifyGraphStateChange(node);
    }, { values: ["color", "transparent"] });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.applyPreset("normal", false);
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GridDotToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.dotCount = 0;
      this.gridInfo = "-";
      this.executionMs = null;
      this.isRendering = false;
      this.lastSignature = "";
      this.lastOptionsSignature = "";
      this.setOutputData(0, null);
      this.setOutputData(1, null);
      this.refreshPreviewLayout();
      return;
    }

    const backgroundMode: "transparent" | "color" =
      String(this.properties.backgroundMode ?? "color") === "transparent"
        ? "transparent"
        : "color";
    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 1200)), 128, 2400),
      gridCells: clamp(Math.round(Number(this.properties.gridCells ?? 140)), 8, 1000),
      samplesPerCell: clamp(Math.round(Number(this.properties.samplesPerCell ?? 4)), 1, 36),
      radiusMin: clamp(Number(this.properties.radiusMin ?? 0), 0, 12),
      radiusMax: clamp(Number(this.properties.radiusMax ?? 1.7), 0.05, 12),
      gamma: clamp(Number(this.properties.gamma ?? 1.05), 0.2, 4),
      invert: Boolean(this.properties.invert ?? false),
      dotColor: normalizeHexColor(String(this.properties.dotColor ?? "#000000")),
      dotOpacity: clamp(Number(this.properties.dotOpacity ?? 1), 0, 1),
      backgroundMode,
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
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
      this.status = "generating griddot...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateGridDotSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return;
          }
          this.svg = result.svg;
          this.preview = result.preview;
          this.dotCount = result.dotCount;
          this.gridInfo = `${result.cols}x${result.rows}`;
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
          this.dotCount = 0;
          this.gridInfo = "-";
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "griddot error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & GridDotToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | dots ${this.dotCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`grid ${this.gridInfo}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class StippleToolNode {
  size: [number, number] = [280, 680];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  dotCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & StippleToolNode;
    node.title = createToolTitle("Stipple");
    node.properties = {
      maxWidth: 900,
      pointCount: 2200,
      darknessGamma: 1.25,
      minSpacing: 1.8,
      maxSpacing: 9.5,
      relaxIterations: 4,
      relaxRadius: 5,
      attraction: 0.48,
      repulsion: 0.62,
      jitter: 0.4,
      dotMinRadius: 0.3,
      dotMaxRadius: 1.6,
      dotGamma: 1,
      dotColor: "#000000",
      dotOpacity: 1,
      backgroundMode: "color",
      backgroundColor: "#FFFFFF",
      seed: 1337,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 900, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Points", 2200, (value) => {
      node.properties.pointCount = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 50, max: 20000, step: 10 });
    node.addWidget("slider", "Dark gamma", 1.25, (value) => {
      node.properties.darknessGamma = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 4, step: 0.01, precision: 2 });
    node.addWidget("slider", "Min spacing", 1.8, (value) => {
      node.properties.minSpacing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.25, max: 32, step: 0.05, precision: 2 });
    node.addWidget("slider", "Max spacing", 9.5, (value) => {
      node.properties.maxSpacing = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.25, max: 96, step: 0.1, precision: 1 });
    node.addWidget("slider", "Relax iter", 4, (value) => {
      node.properties.relaxIterations = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 24, step: 1 });
    node.addWidget("slider", "Relax radius", 5, (value) => {
      node.properties.relaxRadius = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 32, step: 1 });
    node.addWidget("slider", "Attraction", 0.48, (value) => {
      node.properties.attraction = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("slider", "Repulsion", 0.62, (value) => {
      node.properties.repulsion = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 2, step: 0.01, precision: 2 });
    node.addWidget("slider", "Jitter", 0.4, (value) => {
      node.properties.jitter = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 3, step: 0.01, precision: 2 });
    node.addWidget("slider", "Dot min", 0.3, (value) => {
      node.properties.dotMinRadius = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 20, step: 0.05, precision: 2 });
    node.addWidget("slider", "Dot max", 1.6, (value) => {
      node.properties.dotMaxRadius = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 24, step: 0.05, precision: 2 });
    node.addWidget("slider", "Dot gamma", 1, (value) => {
      node.properties.dotGamma = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 3, step: 0.01, precision: 2 });
    node.addWidget("text", "Dot color", "#000000", (value) => {
      node.properties.dotColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Dot alpha", 1, (value) => {
      node.properties.dotOpacity = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.addWidget("combo", "BG mode", "color", (value) => {
      node.properties.backgroundMode = String(value) === "transparent" ? "transparent" : "color";
      notifyGraphStateChange(node);
    }, { values: ["color", "transparent"] });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("number", "Seed", 1337, (value) => {
      node.properties.seed = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { step: 1 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & StippleToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.dotCount = 0;
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

    const backgroundMode: "transparent" | "color" =
      String(this.properties.backgroundMode ?? "color") === "transparent"
        ? "transparent"
        : "color";
    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 900)), 128, 2400),
      pointCount: clamp(Math.round(Number(this.properties.pointCount ?? 2200)), 50, 20000),
      darknessGamma: clamp(Number(this.properties.darknessGamma ?? 1.25), 0.2, 4),
      minSpacing: clamp(Number(this.properties.minSpacing ?? 1.8), 0.25, 32),
      maxSpacing: clamp(Number(this.properties.maxSpacing ?? 9.5), 0.25, 96),
      relaxIterations: clamp(Math.round(Number(this.properties.relaxIterations ?? 4)), 0, 24),
      relaxRadius: clamp(Math.round(Number(this.properties.relaxRadius ?? 5)), 1, 32),
      attraction: clamp(Number(this.properties.attraction ?? 0.48), 0, 1),
      repulsion: clamp(Number(this.properties.repulsion ?? 0.62), 0, 2),
      jitter: clamp(Number(this.properties.jitter ?? 0.4), 0, 3),
      dotMinRadius: clamp(Number(this.properties.dotMinRadius ?? 0.3), 0.1, 20),
      dotMaxRadius: clamp(Number(this.properties.dotMaxRadius ?? 1.6), 0.1, 24),
      dotGamma: clamp(Number(this.properties.dotGamma ?? 1), 0.2, 3),
      dotColor: normalizeHexColor(String(this.properties.dotColor ?? "#000000")),
      dotOpacity: clamp(Number(this.properties.dotOpacity ?? 1), 0, 1),
      backgroundMode,
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
      seed: Math.round(Number(this.properties.seed ?? 1337)),
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
      this.status = "generating stipple...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateStippleSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return;
          }
          this.svg = result.svg;
          this.preview = result.preview;
          this.dotCount = result.dotCount;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.progress = 1;
          this.executionMs = performance.now() - start;
          this.status = "ready";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.dotCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "stipple error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & StippleToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | dots ${this.dotCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(`out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`, 10, layout.footerTop + 48);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class CrosshatchBnToolNode {
  size: [number, number] = [280, 520];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  lineCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & CrosshatchBnToolNode;
    node.title = createToolTitle("Crosshatch BN");
    node.properties = {
      maxWidth: 700,
      levels: 8,
      upscale: 2,
      whiteThreshold: 250,
      lineSpacing: 5,
      lineThickness: 1,
      lineColor: "#000000",
      lineAlpha: 1,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 700, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Levels", 8, (value) => {
      node.properties.levels = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 2, max: 128, step: 1 });
    node.addWidget("slider", "Upscale", 2, (value) => {
      node.properties.upscale = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 10, step: 1 });
    node.addWidget("slider", "White thr", 250, (value) => {
      node.properties.whiteThreshold = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 0, max: 255, step: 1 });
    node.addWidget("slider", "Spacing", 5, (value) => {
      node.properties.lineSpacing = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 24, step: 1 });
    node.addWidget("slider", "Thickness", 1, (value) => {
      node.properties.lineThickness = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 8, step: 0.1, precision: 1 });
    node.addWidget("text", "Line color", "#000000", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("slider", "Line alpha", 1, (value) => {
      node.properties.lineAlpha = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 1, step: 0.01, precision: 2 });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & CrosshatchBnToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
      this.lineCount = 0;
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
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 700)), 128, 2400),
      levels: clamp(Math.round(Number(this.properties.levels ?? 8)), 2, 128),
      upscale: clamp(Math.round(Number(this.properties.upscale ?? 2)), 1, 10),
      whiteThreshold: clamp(Math.round(Number(this.properties.whiteThreshold ?? 250)), 0, 255),
      lineSpacing: clamp(Math.round(Number(this.properties.lineSpacing ?? 5)), 1, 24),
      lineThickness: clamp(Number(this.properties.lineThickness ?? 1), 0.1, 8),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#000000")),
      lineAlpha: clamp(Number(this.properties.lineAlpha ?? 1), 0, 1),
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
      this.status = "generating crosshatch...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateCrosshatchBnSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return null;
          }
          this.svg = result.svg;
          this.lineCount = result.lineCount;
          this.outputWidth = result.outputWidth;
          this.outputHeight = result.outputHeight;
          this.status = `lines ${result.lineCount}`;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview ?? null;
          this.progress = 1;
          this.executionMs = performance.now() - start;
          this.status = "ready";
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        })
        .catch((error) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = input;
          this.svg = null;
          this.lineCount = 0;
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "crosshatch error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & CrosshatchBnToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | lines ${this.lineCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}

export class MatitaToolNode {
  size: [number, number] = [280, 470];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null;
  svg: GraphSvg | null = null;
  status = "idle";
  progress = 0;
  pathCount = 0;
  outputWidth = 0;
  outputHeight = 0;
  isRendering = false;
  executionMs: number | null = null;
  lastSignature = "";
  lastOptionsSignature = "";
  renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & MatitaToolNode;
    node.title = createToolTitle("Matita");
    node.properties = {
      maxWidth: 500,
      iterations: 8,
      simplification: 1.2,
      lineWidth: 1,
      lineColor: "#000000",
      backgroundMode: "color",
      backgroundColor: "#FFFFFF",
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addOutput("svg", "svg");
    node.addWidget("slider", "Max width", 500, (value) => {
      node.properties.maxWidth = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 128, max: 2400, step: 8 });
    node.addWidget("slider", "Passes", 8, (value) => {
      node.properties.iterations = Math.round(Number(value));
      notifyGraphStateChange(node);
    }, { min: 1, max: 20, step: 1 });
    node.addWidget("slider", "Simplify", 1.2, (value) => {
      node.properties.simplification = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0, max: 5, step: 0.1, precision: 1 });
    node.addWidget("slider", "Line width", 1, (value) => {
      node.properties.lineWidth = Number(value);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 20, step: 0.1, precision: 1 });
    node.addWidget("text", "Line color", "#000000", (value) => {
      node.properties.lineColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.addWidget("combo", "BG mode", "color", (value) => {
      node.properties.backgroundMode = String(value) === "transparent" ? "transparent" : "color";
      notifyGraphStateChange(node);
    }, { values: ["color", "transparent"] });
    node.addWidget("text", "BG color", "#FFFFFF", (value) => {
      node.properties.backgroundColor = normalizeHexColor(String(value));
      notifyGraphStateChange(node);
    });
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 4);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & MatitaToolNode) {
    const inputValue = this.getInputData(0);
    const input = isGraphImageReady(inputValue) ? inputValue : null;
    if (!input) {
      this.preview = null;
      this.svg = null;
      this.status = "waiting valid image";
      this.progress = 0;
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

    const backgroundMode: "transparent" | "color" =
      String(this.properties.backgroundMode ?? "color") === "transparent"
        ? "transparent"
        : "color";
    const options = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 500)), 128, 2400),
      iterations: clamp(Math.round(Number(this.properties.iterations ?? 8)), 1, 20),
      simplification: clamp(Number(this.properties.simplification ?? 1.2), 0, 5),
      lineWidth: clamp(Number(this.properties.lineWidth ?? 1), 0.1, 20),
      lineColor: normalizeHexColor(String(this.properties.lineColor ?? "#000000")),
      backgroundMode,
      backgroundColor: normalizeHexColor(String(this.properties.backgroundColor ?? "#FFFFFF")),
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
      this.status = "generating matita...";
      this.setDirtyCanvas(true, true);

      const shouldCancel = () => renderToken !== this.renderToken;
      const updateProgress = (value: number, status?: string) => {
        this.progress = clamp(value, 0, 1);
        if (status) {
          this.status = status;
        }
        this.setDirtyCanvas(true, true);
      };

      void generateMatitaSvg(input, options, shouldCancel, updateProgress)
        .then((result) => {
          if (renderToken !== this.renderToken || !result) {
            return null;
          }
          this.svg = result.svg;
          this.pathCount = result.pathCount;
          this.outputWidth = result.width;
          this.outputHeight = result.height;
          this.status = `paths ${result.pathCount}`;
          return rasterizeGraphSvg(result.svg);
        })
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = preview ?? null;
          this.progress = 1;
          this.executionMs = performance.now() - start;
          this.status = "ready";
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
          this.outputWidth = 0;
          this.outputHeight = 0;
          this.progress = 0;
          this.status = error instanceof Error ? error.message : "matita error";
          this.executionMs = null;
          this.isRendering = false;
          this.setDirtyCanvas(true, true);
        });
    }

    this.setOutputData(0, this.preview ?? input);
    this.setOutputData(1, this.svg);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & MatitaToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 4 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${this.status}${this.isRendering ? "..." : ""}`, 10, layout.footerTop + 12);
    context.fillText(
      `progress ${Math.round(this.progress * 100)}% | paths ${this.pathCount}`,
      10,
      layout.footerTop + 30,
    );
    context.fillText(
      `out ${this.outputWidth || "-"}x${this.outputHeight || "-"}`,
      10,
      layout.footerTop + 48,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 66);
    context.restore();
  }
}
