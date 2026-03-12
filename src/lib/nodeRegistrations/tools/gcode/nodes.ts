import type { GraphGcode } from "../../../../models/graphGcode";
import type { NodeCtor, PreviewAwareNode } from "../../shared";
import { clamp, createToolTitle, formatExecutionInfo, notifyGraphStateChange } from "../shared";
import { type SvgToGcodeOptions, svgToGcodeDefaults } from "./model";
import { convertSvgToGcodeAsync } from "./svgToGcodeRuntime";

interface GcodeConverterPayload {
  family: "gcode";
  schemaVersion: 1;
  options: SvgToGcodeOptions;
  stats: {
    pathCount: number;
    pointCount: number;
    commandCount: number;
    bounds: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    } | null;
  };
}

function getPrecisionFromStep(step: number | undefined) {
  if (step === undefined || Number.isInteger(step)) {
    return undefined;
  }
  const decimals = step.toString().split(".")[1];
  return decimals ? decimals.length : undefined;
}

function normalizeConverterOptions(properties: Record<string, unknown>): SvgToGcodeOptions {
  return {
    sampleStep: clamp(Number(properties.sampleStep ?? svgToGcodeDefaults.sampleStep), 0.1, 20),
    fastDraft: Boolean(properties.fastDraft ?? svgToGcodeDefaults.fastDraft),
    maxPointsPerPath: clamp(Math.round(Number(properties.maxPointsPerPath ?? svgToGcodeDefaults.maxPointsPerPath)), 50, 20000),
    scale: clamp(Number(properties.scale ?? svgToGcodeDefaults.scale), 0.001, 100),
    offsetX: clamp(Number(properties.offsetX ?? svgToGcodeDefaults.offsetX), -100000, 100000),
    offsetY: clamp(Number(properties.offsetY ?? svgToGcodeDefaults.offsetY), -100000, 100000),
    drawFeedRate: clamp(Number(properties.drawFeedRate ?? svgToGcodeDefaults.drawFeedRate), 1, 100000),
    travelFeedRate: clamp(Number(properties.travelFeedRate ?? svgToGcodeDefaults.travelFeedRate), 1, 100000),
    safeZ: clamp(Number(properties.safeZ ?? svgToGcodeDefaults.safeZ), -1000, 1000),
    drawZ: clamp(Number(properties.drawZ ?? svgToGcodeDefaults.drawZ), -1000, 1000),
    closePaths: Boolean(properties.closePaths ?? svgToGcodeDefaults.closePaths),
    includeHeader: Boolean(properties.includeHeader ?? svgToGcodeDefaults.includeHeader),
    decimals: clamp(Math.round(Number(properties.decimals ?? svgToGcodeDefaults.decimals)), 0, 6),
  };
}

function downloadGcode(gcode: GraphGcode, filename: string) {
  const blob = new Blob([gcode], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export class SvgToGcodeToolNode {
  size: [number, number] = [360, 430];
  gcode: GraphGcode = "";
  payload: GcodeConverterPayload | null = null;
  status = "idle";
  executionMs: number | null = null;
  lastCompletedSignature = "";
  lastQueuedSignature = "";
  isRendering = false;
  progress = 0;
  progressLabel = "idle";
  debounceTimerId: number | null = null;
  abortController: AbortController | null = null;
  pendingSvg = "";
  pendingOptions: SvgToGcodeOptions | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & SvgToGcodeToolNode;
    node.title = createToolTitle("GCode/SVG to GCode");
    node.properties = {
      ...svgToGcodeDefaults,
    };

    node.addInput("svg", "svg");
    node.addOutput("gcode", "gcode");

    node.addWidget("slider", "Sample step", svgToGcodeDefaults.sampleStep, (value) => {
      node.properties.sampleStep = clamp(Number(value), 0.1, 20);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 20, step: 0.1, precision: 1 });

    node.addWidget("toggle", "Fast draft", svgToGcodeDefaults.fastDraft, (value) => {
      node.properties.fastDraft = Boolean(value);
      notifyGraphStateChange(node);
    });

    node.addWidget("slider", "Max pts/path", svgToGcodeDefaults.maxPointsPerPath, (value) => {
      node.properties.maxPointsPerPath = clamp(Math.round(Number(value)), 50, 20000);
      notifyGraphStateChange(node);
    }, { min: 50, max: 20000, step: 1 });

    node.addWidget("slider", "Scale", svgToGcodeDefaults.scale, (value) => {
      node.properties.scale = clamp(Number(value), 0.001, 100);
      notifyGraphStateChange(node);
    }, { min: 0.001, max: 100, step: 0.01, precision: 3 });

    node.addWidget("slider", "Offset X", svgToGcodeDefaults.offsetX, (value) => {
      node.properties.offsetX = clamp(Number(value), -100000, 100000);
      notifyGraphStateChange(node);
    }, { min: -1000, max: 1000, step: 0.1, precision: 1 });

    node.addWidget("slider", "Offset Y", svgToGcodeDefaults.offsetY, (value) => {
      node.properties.offsetY = clamp(Number(value), -100000, 100000);
      notifyGraphStateChange(node);
    }, { min: -1000, max: 1000, step: 0.1, precision: 1 });

    node.addWidget("slider", "Draw feed", svgToGcodeDefaults.drawFeedRate, (value) => {
      node.properties.drawFeedRate = clamp(Number(value), 1, 100000);
      notifyGraphStateChange(node);
    }, { min: 1, max: 10000, step: 1 });

    node.addWidget("slider", "Travel feed", svgToGcodeDefaults.travelFeedRate, (value) => {
      node.properties.travelFeedRate = clamp(Number(value), 1, 100000);
      notifyGraphStateChange(node);
    }, { min: 1, max: 30000, step: 1 });

    node.addWidget("slider", "Safe Z", svgToGcodeDefaults.safeZ, (value) => {
      node.properties.safeZ = clamp(Number(value), -1000, 1000);
      notifyGraphStateChange(node);
    }, { min: -50, max: 50, step: 0.1, precision: 1 });

    node.addWidget("slider", "Draw Z", svgToGcodeDefaults.drawZ, (value) => {
      node.properties.drawZ = clamp(Number(value), -1000, 1000);
      notifyGraphStateChange(node);
    }, { min: -50, max: 50, step: 0.1, precision: 1 });

    node.addWidget("toggle", "Close paths", svgToGcodeDefaults.closePaths, (value) => {
      node.properties.closePaths = Boolean(value);
      notifyGraphStateChange(node);
    });

    node.addWidget("toggle", "Header", svgToGcodeDefaults.includeHeader, (value) => {
      node.properties.includeHeader = Boolean(value);
      notifyGraphStateChange(node);
    });

    node.addWidget("slider", "Decimals", svgToGcodeDefaults.decimals, (value) => {
      node.properties.decimals = clamp(Math.round(Number(value)), 0, 6);
      notifyGraphStateChange(node);
    }, {
      min: 0,
      max: 6,
      step: 1,
      ...(getPrecisionFromStep(1) ? { precision: getPrecisionFromStep(1) } : {}),
    });

    node.addWidget("button", "Save GCODE", null, () => {
      if (node.gcode) {
        downloadGcode(node.gcode, "plotterfun-output.gcode");
      }
    });

    node.refreshPreviewLayout = () => {
      node.setDirtyCanvas(true, true);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & SvgToGcodeToolNode) {
    const svgValue = this.getInputData(0);
    const svg = typeof svgValue === "string" ? svgValue : "";
    const options = normalizeConverterOptions(this.properties);
    const signature = `${svg}\n---\n${JSON.stringify(options)}`;

    if (!svg) {
      this.gcode = "";
      this.payload = null;
      this.status = "waiting svg";
      this.executionMs = null;
      this.lastCompletedSignature = "";
      this.lastQueuedSignature = "";
      this.isRendering = false;
      this.progress = 0;
      this.progressLabel = "idle";
      this.pendingSvg = "";
      this.pendingOptions = null;
      this.abortController?.abort();
      this.abortController = null;
      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
        this.debounceTimerId = null;
      }
      this.setOutputData(0, null);
      this.setDirtyCanvas(true, true);
      return;
    }

    if (signature === this.lastCompletedSignature) {
      this.setOutputData(0, this.gcode);
      return;
    }

    if (signature !== this.lastQueuedSignature) {
      this.lastQueuedSignature = signature;
      this.pendingSvg = svg;
      this.pendingOptions = options;
      this.gcode = "";
      this.payload = null;
      this.progress = 0;
      this.progressLabel = "waiting 1s stable input";
      this.status = "pending";
      this.executionMs = null;
      this.lastCompletedSignature = "";

      this.abortController?.abort();
      this.abortController = null;
      this.isRendering = false;

      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
      }

      const queuedSignature = signature;
      this.debounceTimerId = window.setTimeout(() => {
        if (
          queuedSignature !== this.lastQueuedSignature
          || !this.pendingSvg
          || !this.pendingOptions
        ) {
          return;
        }

        this.abortController?.abort();
        const controller = new AbortController();
        this.abortController = controller;
        this.isRendering = true;
        this.progress = 0;
        this.progressLabel = "prepare";
        this.status = "processing";
        const startedAt = performance.now();

        void convertSvgToGcodeAsync(this.pendingSvg, this.pendingOptions, {
          signal: controller.signal,
          onProgress: ({ stage, progress }) => {
            if (controller.signal.aborted) {
              return;
            }
            this.progress = progress;
            this.progressLabel = stage;
            this.status = "processing";
            this.setDirtyCanvas(true, true);
          },
        })
          .then((converted) => {
            if (controller.signal.aborted || queuedSignature !== this.lastQueuedSignature) {
              return;
            }
            this.gcode = converted.gcode;
            this.payload = {
              family: "gcode",
              schemaVersion: 1,
              options: this.pendingOptions as SvgToGcodeOptions,
              stats: converted.stats,
            };
            this.status = converted.stats.pathCount > 0 ? "ready" : "empty";
            this.executionMs = performance.now() - startedAt;
            this.progress = 1;
            this.progressLabel = "done";
            this.lastCompletedSignature = queuedSignature;
            this.setOutputData(0, this.gcode || null);
            this.setDirtyCanvas(true, true);
          })
          .catch((error) => {
            if (controller.signal.aborted) {
              return;
            }
            this.gcode = "";
            this.payload = null;
            this.status = error instanceof Error ? error.message : "svg to gcode error";
            this.executionMs = null;
            this.progress = 0;
            this.progressLabel = "error";
            this.lastCompletedSignature = "";
            this.setOutputData(0, null);
            this.setDirtyCanvas(true, true);
          })
          .finally(() => {
            if (this.abortController === controller) {
              this.abortController = null;
            }
            if (queuedSignature === this.lastQueuedSignature) {
              this.isRendering = false;
            }
          });
      }, 1000);
    }

    this.setOutputData(0, this.gcode || null);
    this.setDirtyCanvas(true, true);
  }

  onDrawBackground(this: PreviewAwareNode & SvgToGcodeToolNode, context: CanvasRenderingContext2D) {
    const padding = 10;
    const headerHeight = 34 + (this.widgets?.length ?? 0) * 28;
    const lines = [
      `status: ${this.status}`,
      this.payload
        ? `paths: ${this.payload.stats.pathCount} | points: ${this.payload.stats.pointCount}`
        : "paths: -- | points: --",
      this.payload ? `commands: ${this.payload.stats.commandCount}` : "commands: --",
      this.payload && this.payload.stats.bounds
        ? `bounds: ${this.payload.stats.bounds.minX.toFixed(2)},${this.payload.stats.bounds.minY.toFixed(2)} -> ${this.payload.stats.bounds.maxX.toFixed(2)},${this.payload.stats.bounds.maxY.toFixed(2)}`
        : "bounds: --",
      `progress: ${(this.progress * 100).toFixed(1)}% (${this.progressLabel})`,
      formatExecutionInfo(this.executionMs),
    ];

    this.size = [360, headerHeight + padding * 2 + lines.length * 18 + 12];

    context.save();
    context.fillStyle = "#101010";
    context.fillRect(padding, headerHeight, this.size[0] - padding * 2, this.size[1] - headerHeight - padding);
    context.fillStyle = "rgba(255,255,255,0.9)";
    context.font = "12px monospace";
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].length > 54 ? `${lines[index].slice(0, 51)}...` : lines[index];
      context.fillText(line, padding + 8, headerHeight + 18 + index * 18);
    }
    context.restore();
  }

  onRemoved(this: SvgToGcodeToolNode) {
    if (this.debounceTimerId !== null) {
      window.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }
}

export class GcodeViewerToolNode {
  size: [number, number] = [380, 320];
  gcode: GraphGcode = "";
  previewLines: string[] = [];
  lineCount = 0;
  byteCount = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GcodeViewerToolNode;
    node.title = createToolTitle("GCode/Viewer");
    node.properties = {};
    node.addInput("gcode", "gcode");
    node.addOutput("txt", "string");
    node.addWidget("button", "Save GCODE", null, () => {
      if (node.gcode.length > 0) {
        downloadGcode(node.gcode, "plotterfun-viewer-output.gcode");
      }
    });
    node.refreshPreviewLayout = () => {
      node.setDirtyCanvas(true, true);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & GcodeViewerToolNode) {
    const value = this.getInputData(0);
    this.gcode = typeof value === "string" ? value : "";
    this.byteCount = this.gcode ? new Blob([this.gcode]).size : 0;

    if (!this.gcode) {
      this.previewLines = ["no gcode", "connect gcode input"];
      this.lineCount = 0;
      this.setOutputData(0, null);
      this.setDirtyCanvas(true, true);
      return;
    }

    const lines = this.gcode.split(/\r?\n/);
    this.lineCount = lines.length;
    this.previewLines = lines.slice(0, 24).map((line) => (line.length <= 88 ? line : `${line.slice(0, 85)}...`));
    if (lines.length > 24) {
      this.previewLines.push(`... (${lines.length - 24} more lines)`);
    }

    this.setOutputData(0, this.gcode);
    this.setDirtyCanvas(true, true);
  }

  onDrawBackground(this: PreviewAwareNode & GcodeViewerToolNode, context: CanvasRenderingContext2D) {
    const padding = 10;
    const headerHeight = 34 + (this.widgets?.length ?? 0) * 28;
    const lines = [
      `lines: ${this.lineCount} | bytes: ${this.byteCount}`,
      ...this.previewLines,
    ];

    const lineHeight = 12;
    this.size = [380, headerHeight + padding * 2 + lines.length * lineHeight + 12];

    context.save();
    context.fillStyle = "#101010";
    context.fillRect(padding, headerHeight, this.size[0] - padding * 2, this.size[1] - headerHeight - padding);
    context.fillStyle = "rgba(255,255,255,0.9)";
    context.font = "8pt monospace";
    for (let index = 0; index < lines.length; index += 1) {
      context.fillText(lines[index], padding + 8, headerHeight + 14 + index * lineHeight);
    }
    context.restore();
  }
}

interface CncPoint {
  x: number;
  y: number;
}

interface CncSegment {
  start: CncPoint;
  end: CncPoint;
  startZ: number;
  endZ: number;
  rapid: boolean;
  feedRate: number;
  startTimeSec: number;
  endTimeSec: number;
}

interface CncProgram {
  segments: CncSegment[];
  totalTimeSec: number;
  commandCount: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
}

function parseGcodeProgram(gcode: GraphGcode): CncProgram {
  const lines = gcode.split(/\r?\n/);
  const segments: CncSegment[] = [];
  let commandCount = 0;
  let absoluteMode = true;
  let x = 0;
  let y = 0;
  let z = 0;
  let feedRate = 1200;
  let timeCursorSec = 0;
  let bounds: CncProgram["bounds"] = null;

  const updateBounds = (point: CncPoint) => {
    if (!bounds) {
      bounds = {
        minX: point.x,
        minY: point.y,
        maxX: point.x,
        maxY: point.y,
      };
      return;
    }
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  };

  updateBounds({ x, y });

  for (const rawLine of lines) {
    const cleanLine = rawLine.replace(/\(.*?\)/g, "");
    const commandText = cleanLine.split(";")[0].trim().toUpperCase();
    if (!commandText) {
      continue;
    }

    const tokens = commandText.match(/([A-Z])([-+]?(?:\d+(?:\.\d+)?|\.\d+))/g) ?? [];
    let gCode: number | null = null;
    let nextX: number | null = null;
    let nextY: number | null = null;
    let nextZ: number | null = null;
    let nextFeed: number | null = null;

    for (const token of tokens) {
      const code = token[0];
      const value = Number(token.slice(1));
      if (!Number.isFinite(value)) {
        continue;
      }
      if (code === "G") {
        gCode = Math.round(value);
      } else if (code === "X") {
        nextX = value;
      } else if (code === "Y") {
        nextY = value;
      } else if (code === "Z") {
        nextZ = value;
      } else if (code === "F") {
        nextFeed = value;
      }
    }

    if (gCode === 90) {
      absoluteMode = true;
      continue;
    }
    if (gCode === 91) {
      absoluteMode = false;
      continue;
    }
    if (nextFeed !== null && nextFeed > 0) {
      feedRate = nextFeed;
    }

    const isMotion = gCode === 0 || gCode === 1;
    if (!isMotion) {
      continue;
    }
    commandCount += 1;

    const targetX = nextX === null ? x : absoluteMode ? nextX : x + nextX;
    const targetY = nextY === null ? y : absoluteMode ? nextY : y + nextY;
    const targetZ = nextZ === null ? z : absoluteMode ? nextZ : z + nextZ;

    const dx = targetX - x;
    const dy = targetY - y;
    const dz = targetZ - z;
    const distance = Math.hypot(dx, dy, dz);
    const moveFeed = feedRate > 0 ? feedRate : 1200;
    const durationSec = distance > 0 ? distance / (moveFeed / 60) : 0;

    if (distance > 0) {
      const segment: CncSegment = {
        start: { x, y },
        end: { x: targetX, y: targetY },
        startZ: z,
        endZ: targetZ,
        rapid: gCode === 0,
        feedRate: moveFeed,
        startTimeSec: timeCursorSec,
        endTimeSec: timeCursorSec + durationSec,
      };
      segments.push(segment);
      updateBounds(segment.start);
      updateBounds(segment.end);
      timeCursorSec += durationSec;
    }

    x = targetX;
    y = targetY;
    z = targetZ;
  }

  return {
    segments,
    totalTimeSec: timeCursorSec,
    commandCount,
    bounds,
  };
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00";
  }
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function normalizeHexColor(value: unknown, fallback: string) {
  const raw = String(value ?? "").trim();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex
      .split("")
      .map((channel) => `${channel}${channel}`)
      .join("");
    return `#${expanded.toUpperCase()}`;
  }
  return fallback;
}

export class GcodeCncToolNode {
  size: [number, number] = [420, 520];
  program: CncProgram | null = null;
  gcode: GraphGcode = "";
  status = "idle";
  progressSec = 0;
  currentSegmentIndex = 0;
  currentSegmentT = 0;
  isPlaying = false;
  lastTickAtMs = 0;
  lastInputSignature = "";
  pendingSignature = "";
  pendingGcode: GraphGcode = "";
  debounceTimerId: number | null = null;
  executionMs: number | null = null;

  constructor() {
    const node = this as unknown as PreviewAwareNode & GcodeCncToolNode;
    node.title = createToolTitle("GCode/CNC");
    node.properties = {
      speedMultiplier: 1,
      penDownThreshold: 0.1,
      showTravelMoves: true,
      invertX: false,
      invertY: false,
      bgColor: "#000000",
      traceColor: "#00AA00",
      travelColor: "#303030",
      drawWidth: 1.4,
      travelWidth: 0.8,
    };
    node.addInput("gcode", "gcode");
    node.addOutput("gcode", "gcode");

    node.addWidget("button", "Play/Pause", null, () => {
      if (!node.program || node.program.segments.length === 0) {
        node.status = "no path";
        return;
      }
      node.isPlaying = !node.isPlaying;
      node.lastTickAtMs = performance.now();
      node.status = node.isPlaying ? "playing" : "paused";
      node.setDirtyCanvas(true, true);
    });

    node.addWidget("button", "Reset", null, () => {
      node.isPlaying = false;
      node.progressSec = 0;
      node.currentSegmentIndex = 0;
      node.currentSegmentT = 0;
      node.status = node.program ? "ready" : "idle";
      node.setDirtyCanvas(true, true);
    });

    node.addWidget("slider", "Speed x", 1, (value) => {
      node.properties.speedMultiplier = clamp(Number(value), 0.1, 1000);
      notifyGraphStateChange(node);
    }, { min: 0.1, max: 1000, step: 0.1, precision: 1 });

    node.addWidget("slider", "Pen Z thr", 0.1, (value) => {
      node.properties.penDownThreshold = clamp(Number(value), -50, 50);
      notifyGraphStateChange(node);
    }, { min: -10, max: 10, step: 0.1, precision: 1 });

    node.addWidget("toggle", "Show travel", true, (value) => {
      node.properties.showTravelMoves = Boolean(value);
      notifyGraphStateChange(node);
    });

    node.addWidget("toggle", "Invert X", false, (value) => {
      node.properties.invertX = Boolean(value);
      notifyGraphStateChange(node);
    });

    node.addWidget("toggle", "Invert Y", false, (value) => {
      node.properties.invertY = Boolean(value);
      notifyGraphStateChange(node);
    });

    node.addWidget("text", "BG color", "#000000", (value) => {
      node.properties.bgColor = normalizeHexColor(value, "#000000");
      notifyGraphStateChange(node);
    });

    node.addWidget("text", "Trace color", "#00AA00", (value) => {
      node.properties.traceColor = normalizeHexColor(value, "#00AA00");
      notifyGraphStateChange(node);
    });

    node.addWidget("text", "Travel color", "#303030", (value) => {
      node.properties.travelColor = normalizeHexColor(value, "#303030");
      notifyGraphStateChange(node);
    });

    node.addWidget("slider", "Draw width", 1.4, (value) => {
      node.properties.drawWidth = clamp(Number(value), 0.3, 8);
      notifyGraphStateChange(node);
    }, { min: 0.3, max: 8, step: 0.1, precision: 1 });

    node.addWidget("slider", "Travel width", 0.8, (value) => {
      node.properties.travelWidth = clamp(Number(value), 0.2, 6);
      notifyGraphStateChange(node);
    }, { min: 0.2, max: 6, step: 0.1, precision: 1 });

    node.refreshPreviewLayout = () => {
      node.setDirtyCanvas(true, true);
    };
    node.refreshPreviewLayout();
  }

  private updatePlaybackState(this: PreviewAwareNode & GcodeCncToolNode, nowMs: number) {
    if (!this.program || this.program.segments.length === 0 || !this.isPlaying) {
      return;
    }

    const totalTime = this.program.totalTimeSec;
    if (totalTime <= 0) {
      this.isPlaying = false;
      this.status = "done";
      return;
    }

    const speedMultiplier = clamp(Number(this.properties.speedMultiplier ?? 1), 0.1, 1000);
    const deltaSec = Math.max(0, (nowMs - this.lastTickAtMs) / 1000) * speedMultiplier;
    this.lastTickAtMs = nowMs;
    this.progressSec = clamp(this.progressSec + deltaSec, 0, totalTime);

    const segments = this.program.segments;
    while (
      this.currentSegmentIndex < segments.length
      && this.progressSec >= segments[this.currentSegmentIndex].endTimeSec
    ) {
      this.currentSegmentIndex += 1;
    }

    if (this.currentSegmentIndex >= segments.length) {
      this.currentSegmentIndex = segments.length;
      this.currentSegmentT = 1;
      this.isPlaying = false;
      this.status = "done";
      return;
    }

    const activeSegment = segments[this.currentSegmentIndex];
    const duration = Math.max(1e-9, activeSegment.endTimeSec - activeSegment.startTimeSec);
    this.currentSegmentT = clamp((this.progressSec - activeSegment.startTimeSec) / duration, 0, 1);
    this.status = "playing";
  }

  onExecute(this: PreviewAwareNode & GcodeCncToolNode) {
    const value = this.getInputData(0);
    const gcode = typeof value === "string" ? value : "";
    const signature = gcode;

    if (!gcode) {
      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
        this.debounceTimerId = null;
      }
      this.gcode = "";
      this.program = null;
      this.status = "waiting gcode";
      this.isPlaying = false;
      this.progressSec = 0;
      this.currentSegmentIndex = 0;
      this.currentSegmentT = 0;
      this.executionMs = null;
      this.lastInputSignature = "";
      this.pendingSignature = "";
      this.pendingGcode = "";
      this.setOutputData(0, null);
      this.setDirtyCanvas(true, true);
      return;
    }

    if (signature !== this.pendingSignature) {
      this.pendingSignature = signature;
      this.pendingGcode = gcode;
      this.program = null;
      this.gcode = "";
      this.progressSec = 0;
      this.currentSegmentIndex = 0;
      this.currentSegmentT = 0;
      this.isPlaying = false;
      this.status = "waiting 2s stable input";
      this.executionMs = null;
      this.lastInputSignature = "";

      if (this.debounceTimerId !== null) {
        window.clearTimeout(this.debounceTimerId);
      }

      const queuedSignature = signature;
      this.debounceTimerId = window.setTimeout(() => {
        if (queuedSignature !== this.pendingSignature) {
          return;
        }

        const startedAt = performance.now();
        try {
          this.program = parseGcodeProgram(this.pendingGcode);
          this.gcode = this.pendingGcode;
          this.progressSec = 0;
          this.currentSegmentIndex = 0;
          this.currentSegmentT = 0;
          this.isPlaying = this.program.segments.length > 0;
          this.status = this.program.segments.length > 0 ? "playing" : "empty";
          this.lastTickAtMs = performance.now();
          this.executionMs = performance.now() - startedAt;
          this.lastInputSignature = queuedSignature;
        } catch (error) {
          this.program = null;
          this.gcode = "";
          this.status = error instanceof Error ? error.message : "gcode parse error";
          this.isPlaying = false;
          this.executionMs = null;
          this.lastInputSignature = "";
        }

        this.setOutputData(0, this.gcode || null);
        this.setDirtyCanvas(true, true);
      }, 2000);
    }

    const nowMs = performance.now();
    if (this.lastTickAtMs <= 0) {
      this.lastTickAtMs = nowMs;
    }
    this.updatePlaybackState(nowMs);
    if (this.isPlaying) {
      this.setDirtyCanvas(true, true);
    }

    this.setOutputData(0, this.gcode || null);
  }

  onRemoved(this: GcodeCncToolNode) {
    if (this.debounceTimerId !== null) {
      window.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }

  onDrawBackground(this: PreviewAwareNode & GcodeCncToolNode, context: CanvasRenderingContext2D) {
    const padding = 10;
    const headerHeight = 34 + (this.widgets?.length ?? 0) * 28;
    const footerLines = 7;
    const footerHeight = footerLines * 16 + 14;
    const plotLeft = padding;
    const plotTop = headerHeight;
    const plotWidth = this.size[0] - padding * 2;
    const plotHeight = Math.max(120, this.size[1] - headerHeight - footerHeight - 8);

    context.save();
    const bgColor = normalizeHexColor(this.properties.bgColor, "#000000");
    const traceColor = normalizeHexColor(this.properties.traceColor, "#00AA00");
    const travelColor = normalizeHexColor(this.properties.travelColor, "#303030");

    context.fillStyle = bgColor;
    context.fillRect(plotLeft, plotTop, plotWidth, plotHeight);

    if (this.program && this.program.bounds && this.program.segments.length > 0) {
      const bounds = this.program.bounds;
      const rangeX = Math.max(1e-6, bounds.maxX - bounds.minX);
      const rangeY = Math.max(1e-6, bounds.maxY - bounds.minY);
      const scale = Math.min((plotWidth - 16) / rangeX, (plotHeight - 16) / rangeY);
      const offsetX = plotLeft + (plotWidth - rangeX * scale) * 0.5 - bounds.minX * scale;
      const offsetY = plotTop + (plotHeight - rangeY * scale) * 0.5 + bounds.maxY * scale;
      const penDownThreshold = Number(this.properties.penDownThreshold ?? 0.1);
      const showTravelMoves = Boolean(this.properties.showTravelMoves ?? true);
      const invertX = Boolean(this.properties.invertX ?? false);
      const invertY = Boolean(this.properties.invertY ?? false);
      const drawWidth = clamp(Number(this.properties.drawWidth ?? 1.4), 0.3, 8);
      const travelWidth = clamp(Number(this.properties.travelWidth ?? 0.8), 0.2, 6);

      const project = (point: CncPoint) => {
        const transformedX = invertX ? bounds.maxX - (point.x - bounds.minX) : point.x;
        const transformedY = invertY ? bounds.maxY - (point.y - bounds.minY) : point.y;
        return {
          x: offsetX + transformedX * scale,
          y: offsetY - transformedY * scale,
        };
      };

      const completedCount = Math.min(this.currentSegmentIndex, this.program.segments.length);
      for (let index = 0; index < completedCount; index += 1) {
        const segment = this.program.segments[index];
        const penDown = Math.min(segment.startZ, segment.endZ) <= penDownThreshold;
        if (!penDown && !showTravelMoves) {
          continue;
        }
        const start = project(segment.start);
        const end = project(segment.end);
        context.beginPath();
        context.lineWidth = penDown ? drawWidth : travelWidth;
        context.strokeStyle = penDown ? traceColor : travelColor;
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }

      let penPoint: CncPoint | null = null;
      let penDown = false;
      let feedRate = 0;
      if (this.currentSegmentIndex < this.program.segments.length) {
        const segment = this.program.segments[this.currentSegmentIndex];
        const t = clamp(this.currentSegmentT, 0, 1);
        const partialPoint: CncPoint = {
          x: segment.start.x + (segment.end.x - segment.start.x) * t,
          y: segment.start.y + (segment.end.y - segment.start.y) * t,
        };
        const currentZ = segment.startZ + (segment.endZ - segment.startZ) * t;
        penDown = currentZ <= penDownThreshold;
        feedRate = segment.feedRate;
        penPoint = partialPoint;

        if (t > 0 && (penDown || showTravelMoves)) {
          const start = project(segment.start);
          const partial = project(partialPoint);
          context.beginPath();
          context.lineWidth = penDown ? drawWidth : travelWidth;
          context.strokeStyle = penDown ? traceColor : travelColor;
          context.moveTo(start.x, start.y);
          context.lineTo(partial.x, partial.y);
          context.stroke();
        }
      } else if (this.program.segments.length > 0) {
        const last = this.program.segments[this.program.segments.length - 1];
        penPoint = { x: last.end.x, y: last.end.y };
        penDown = Math.min(last.startZ, last.endZ) <= penDownThreshold;
        feedRate = last.feedRate;
      }

      if (penPoint) {
        const penProjected = project(penPoint);
        context.beginPath();
        context.fillStyle = penDown ? "#ffcf5f" : "#f4f6fb";
        context.strokeStyle = penDown ? "#2b1a00" : "#2f3c50";
        context.lineWidth = 1.2;
        context.arc(penProjected.x, penProjected.y, 4.2, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }

      const totalTimeSec = this.program.totalTimeSec;
      const remainingSec = Math.max(0, totalTimeSec - this.progressSec);
      const progressRatio = totalTimeSec > 0 ? clamp(this.progressSec / totalTimeSec, 0, 1) : 0;
      const currentState = penDown ? "DOWN" : "UP";
      const lineItems = [
        `status: ${this.status}${this.isPlaying ? " | run" : ""}`,
        `progress: ${(progressRatio * 100).toFixed(1)}% (${this.currentSegmentIndex}/${this.program.segments.length})`,
        `pen: ${currentState} | speed: F${feedRate.toFixed(0)}`,
        `elapsed: ${formatDuration(this.progressSec)} | remain: ${formatDuration(remainingSec)}`,
        `estimate: ${formatDuration(totalTimeSec)} @x${Number(this.properties.speedMultiplier ?? 1).toFixed(1)}`,
        `pos: ${penPoint ? `${penPoint.x.toFixed(2)}, ${penPoint.y.toFixed(2)}` : "--, --"}`,
        formatExecutionInfo(this.executionMs),
      ];

      const textBaseY = plotTop + plotHeight + 18;
      context.fillStyle = "rgba(255,255,255,0.88)";
      context.font = "12px monospace";
      for (let index = 0; index < lineItems.length; index += 1) {
        context.fillText(lineItems[index], plotLeft + 4, textBaseY + index * 16);
      }
    } else {
      context.fillStyle = "rgba(255,255,255,0.75)";
      context.font = "12px monospace";
      context.fillText("No CNC path", plotLeft + 12, plotTop + 18);
      context.fillText("Connect GCode input", plotLeft + 12, plotTop + 36);
      context.fillText(`status: ${this.status}`, plotLeft + 12, plotTop + 54);
      context.fillText(formatExecutionInfo(this.executionMs), plotLeft + 12, plotTop + 72);
    }

    context.restore();
  }
}
