export type GraphNodeProgressStatus = "idle" | "running" | "complete" | "cached" | "bypassed" | "error";

export interface GraphNodeProgress {
  key: string;
  label: string;
  progress: number;
  status: GraphNodeProgressStatus;
  updatedAt: number;
  elapsedMs: number;
}

export interface GraphProgressSnapshot {
  progress: number;
  runningNodes: number;
  totalNodes: number;
  status: GraphNodeProgressStatus;
  slowestNode: GraphNodeProgress | null;
  nodes: GraphNodeProgress[];
}

const entries = new Map<string, GraphNodeProgress>();
const listeners = new Set<() => void>();
let frame: number | null = null;
let snapshot: GraphProgressSnapshot = { progress: 0, runningNodes: 0, totalNodes: 0, status: "idle", slowestNode: null, nodes: [] };

function rebuildSnapshot() {
  const values = [...entries.values()];
  const runningEntries = values.filter((entry) => entry.status === "running");
  const runningNodes = runningEntries.length;
  const hasError = values.some((entry) => entry.status === "error");
  const progressEntries = runningEntries.length ? runningEntries : values;
  const measuredNodes = values.filter((entry) => entry.elapsedMs > 0).sort((a, b) => b.elapsedMs - a.elapsedMs);
  snapshot = {
    progress: progressEntries.length ? progressEntries.reduce((sum, entry) => sum + entry.progress, 0) / progressEntries.length : 0,
    runningNodes,
    totalNodes: values.length,
    status: hasError ? "error" : runningNodes ? "running" : values.length ? "complete" : "idle",
    slowestNode: measuredNodes[0] ?? null,
    nodes: measuredNodes,
  };
}

function notify() {
  if (frame !== null) return;
  frame = window.requestAnimationFrame(() => {
    frame = null;
    rebuildSnapshot();
    listeners.forEach((listener) => listener());
  });
}

export function reportGraphNodeProgress(entry: Omit<GraphNodeProgress, "updatedAt">) {
  entries.set(entry.key, { ...entry, progress: Math.max(0, Math.min(1, entry.progress)), updatedAt: Date.now() });
  notify();
}

export function removeGraphNodeProgress(key: string) {
  if (entries.delete(key)) notify();
}

export function subscribeGraphProgress(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGraphProgressSnapshot() {
  return snapshot;
}
