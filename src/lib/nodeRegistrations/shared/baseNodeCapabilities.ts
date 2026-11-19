import type { NodeCtor, RegisterNodeTypeFn } from "./types";

interface ExecutionStats {
  signature: string;
  outputs: Map<number, unknown>;
  startedAt: number;
  elapsedMs: number;
  progress: number;
  running: boolean;
  cached: boolean;
  hasResult: boolean;
  durations: number[];
  initialExecutionMs: number | null;
  observedWork: boolean;
}

interface RuntimeNode {
  inputs?: unknown[];
  properties?: Record<string, unknown>;
  getInputData(slot: number): unknown;
  setOutputData(slot: number, value: unknown): void;
  setDirtyCanvas?(foreground?: boolean, background?: boolean): void;
  onExecute?(): unknown;
  onDrawForeground?(context: CanvasRenderingContext2D, ...args: unknown[]): void;
  onRemoved?(): void;
  size?: [number, number];
  isRendering?: boolean;
  isProcessing?: boolean;
  processing?: boolean;
  loading?: boolean;
  isRunning?: boolean;
  isPlaying?: boolean;
  pendingRun?: boolean;
  executionMs?: number | null;
  progress?: number | { overall?: number; progress?: number } | null;
  job?: unknown;
}

const CAPABILITY = Symbol("base-node-capability");
const ORIGINAL_SET_OUTPUT = Symbol("base-node-original-set-output");
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
const HISTORY_LIMIT = 8;
const STORAGE_PREFIX = "plotterfun.node-duration.";
const MIN_RECORDED_DURATION_MS = 0.01;

function objectId(value: object) {
  let id = objectIds.get(value);
  if (!id) { id = nextObjectId++; objectIds.set(value, id); }
  return id;
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canvasSignature(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width <= 0 || canvas.height <= 0) return `canvas:${objectId(canvas)}:${canvas.width}x${canvas.height}`;
  const sampleSize = 8, sample = document.createElement("canvas"); sample.width = sampleSize; sample.height = sampleSize;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return `canvas:${objectId(canvas)}:${canvas.width}x${canvas.height}`;
  sampleContext.drawImage(canvas, 0, 0, sampleSize, sampleSize);
  const pixels = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 1) { hash ^= pixels[index]; hash = Math.imul(hash, 16777619); }
  return `canvas:${canvas.width}x${canvas.height}:${(hash >>> 0).toString(36)}`;
}

function valueSignature(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return `s:${value.length}:${hashText(value)}`;
  if (typeof value === "number" || typeof value === "boolean") return `${typeof value}:${String(value)}`;
  if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) return canvasSignature(value);
  if (ArrayBuffer.isView(value)) return `view:${value.constructor.name}:${value.byteLength}:${objectId(value)}`;
  if (typeof value === "object") return `object:${objectId(value)}`;
  return `${typeof value}:${String(value)}`;
}

function stableProperties(properties: Record<string, unknown> | undefined) {
  if (!properties) return "{}";
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(properties).sort()) {
    const value = properties[key];
    if (typeof value !== "function") normalized[key] = value;
  }
  try { return JSON.stringify(normalized); } catch { return Object.keys(normalized).join("|"); }
}

function executionSignature(node: RuntimeNode) {
  const count = node.inputs?.length ?? 0;
  const inputs = Array.from({ length: count }, (_, slot) => valueSignature(node.getInputData(slot)));
  return `${inputs.join(";")}#${hashText(stableProperties(node.properties))}#pending:${Boolean(node.pendingRun)}`;
}

function readDurations(nodeType: string) {
  try {
    const value = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${nodeType}`) ?? "[]");
    return Array.isArray(value) ? value.filter(item => Number.isFinite(item) && item >= MIN_RECORDED_DURATION_MS).slice(-HISTORY_LIMIT) : [];
  } catch { return []; }
}

function saveDurations(nodeType: string, durations: number[]) {
  try { localStorage.setItem(`${STORAGE_PREFIX}${nodeType}`, JSON.stringify(durations.slice(-HISTORY_LIMIT))); } catch { /* storage is optional */ }
}

function lastDuration(values: number[]) { return values.length ? values[values.length - 1] : 0; }
function formatDurationMs(value: number) {
  if (value < 10) return `${value.toFixed(2)} ms`;
  return `${value.toFixed(0)} ms`;
}
function asyncBusy(node: RuntimeNode) { return Boolean(node.isRendering || node.isProcessing || node.processing || node.loading || node.isRunning || node.job); }
function nativeProgress(node: RuntimeNode) {
  if (typeof node.progress === "number") return Math.max(0, Math.min(1, node.progress));
  if (node.progress && typeof node.progress === "object") {
    const value = Number(node.progress.overall ?? node.progress.progress);
    if (Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  }
  return null;
}

function drawProgress(node: RuntimeNode, context: CanvasRenderingContext2D, state: ExecutionStats) {
  const width = Math.max(80, node.size?.[0] ?? 160), barX = 8, barWidth = width - 16, barHeight = 5, y = 24;
  const elapsed = state.running ? performance.now() - state.startedAt : state.elapsedMs;
  const estimate = lastDuration(state.durations);
  const reportedProgress = nativeProgress(node);
  const estimatedProgress = estimate > 0 ? Math.min(.95, elapsed / estimate) : state.progress;
  const derivedProgress = state.running ? Math.max(reportedProgress ?? 0, estimatedProgress) : state.progress;
  // ETA is based on the complete duration of the last generation. Native stage
  // progress may advance the bar, but must not shorten the learned total time.
  const remaining = state.running && estimate > 0 ? Math.max(0, estimate - elapsed) : null;
  context.save();
  context.fillStyle = "rgba(0,0,0,.35)"; context.fillRect(barX, y, barWidth, barHeight);
  context.fillStyle = state.cached ? "#69b578" : state.running ? "#e7ad47" : "#62a8e5";
  context.fillRect(barX, y, barWidth * Math.max(0, Math.min(1, derivedProgress)), barHeight);
  context.font = "9px sans-serif"; context.fillStyle = "rgba(255,255,255,.82)";
  const label = state.cached
    ? `cache · ${formatDurationMs(elapsed)}`
    : state.running
      ? `${Math.round(derivedProgress * 100)}% · ${formatDurationMs(elapsed)} · ETA ${remaining === null ? "--" : formatDurationMs(remaining)}`
      : `100% · ${formatDurationMs(elapsed)}`;
  context.fillText(label, barX, y - 2); context.restore();
}

function finish(node: RuntimeNode, nodeType: string, state: ExecutionStats) {
  if (!state.running) return;
  const measuredElapsedMs = performance.now() - state.startedAt;
  const nodeExecutionMs = Number(node.executionMs);
  const hasFreshNodeDuration = Number.isFinite(nodeExecutionMs)
    && nodeExecutionMs >= MIN_RECORDED_DURATION_MS
    && nodeExecutionMs !== state.initialExecutionMs;
  state.elapsedMs = hasFreshNodeDuration ? nodeExecutionMs : measuredElapsedMs;
  state.progress = 1; state.running = false; state.cached = false;
  state.hasResult = true;
  state.signature = executionSignature(node);
  if ((state.observedWork || hasFreshNodeDuration) && state.elapsedMs >= MIN_RECORDED_DURATION_MS) {
    state.durations.push(state.elapsedMs); state.durations = state.durations.slice(-HISTORY_LIMIT); saveDurations(nodeType, state.durations);
  }
  node.setDirtyCanvas?.(true, true);
}

function waitForAsyncCompletion(node: RuntimeNode, nodeType: string, state: ExecutionStats) {
  if (!state.running) return;
  if (asyncBusy(node)) state.observedWork = true;
  if (!asyncBusy(node)) { finish(node, nodeType, state); return; }
  state.elapsedMs = performance.now() - state.startedAt;
  const estimate = lastDuration(state.durations), reportedProgress = nativeProgress(node);
  state.progress = reportedProgress ?? (estimate > 0 ? Math.min(.95, state.elapsedMs / estimate) : Math.min(.9, state.progress + .02));
  node.setDirtyCanvas?.(true, true);
  window.setTimeout(() => waitForAsyncCompletion(node, nodeType, state), 50);
}

export function withBaseNodeCapabilities(nodeType: string, ctor: NodeCtor): NodeCtor {
  type DecoratedNode = RuntimeNode & {
    [CAPABILITY]?: ExecutionStats;
    [ORIGINAL_SET_OUTPUT]?: (slot: number, value: unknown) => void;
  };
  const prototype = (ctor as unknown as { prototype: DecoratedNode }).prototype;
  const originalExecute = prototype.onExecute;
  const originalDrawForeground = prototype.onDrawForeground;
  const originalRemoved = prototype.onRemoved;

  prototype.onExecute = function(this: DecoratedNode) {
    const state = this[CAPABILITY] ??= { signature: "", outputs: new Map(), startedAt: 0, elapsedMs: 0, progress: 0, running: false, cached: false, hasResult: false, durations: readDurations(nodeType), initialExecutionMs: null, observedWork: false };
    if (!this[ORIGINAL_SET_OUTPUT]) {
      const setOutput = this.setOutputData.bind(this);
      this[ORIGINAL_SET_OUTPUT] = setOutput;
      this.setOutputData = (slot: number, value: unknown) => { state.outputs.set(slot, value); setOutput(slot, value); };
    }
    const setOutput = this[ORIGINAL_SET_OUTPUT];
    const signature = executionSignature(this);
    if (state.running && asyncBusy(this)) {
      for (const [slot, value] of state.outputs) setOutput(slot, value);
      return;
    }
    if (this.isPlaying) {
      const result = originalExecute?.call(this);
      this.setDirtyCanvas?.(true, true);
      return result;
    }
    if (state.signature === signature && state.hasResult) {
      state.cached = true;
      for (const [slot, value] of state.outputs) setOutput(slot, value);
      this.setDirtyCanvas?.(true, true);
      return;
    }
    state.signature = signature; state.outputs.clear(); state.startedAt = performance.now(); state.elapsedMs = 0; state.progress = 0; state.running = true; state.cached = false; state.hasResult = false;
    state.initialExecutionMs = Number.isFinite(Number(this.executionMs)) ? Number(this.executionMs) : null;
    state.observedWork = false;
    const result = originalExecute?.call(this);
    state.observedWork = asyncBusy(this);
    if (result instanceof Promise) { state.observedWork = true; void result.finally(() => finish(this, nodeType, state)); }
    else window.setTimeout(() => waitForAsyncCompletion(this, nodeType, state), 0);
    return result;
  };
  prototype.onDrawForeground = function(this: DecoratedNode, context: CanvasRenderingContext2D, ...args: unknown[]) {
    originalDrawForeground?.call(this, context, ...args);
    const state = this[CAPABILITY]; if (state) drawProgress(this, context, state);
  };
  prototype.onRemoved = function(this: DecoratedNode) {
    originalRemoved?.call(this); const state = this[CAPABILITY]; if (state) state.running = false;
  };
  return ctor;
}

export function createBaseNodeRegister(registerNodeType: RegisterNodeTypeFn): RegisterNodeTypeFn {
  return (nodeType, ctor) => registerNodeType(nodeType, nodeType.startsWith("input/") ? ctor : withBaseNodeCapabilities(nodeType, ctor));
}
