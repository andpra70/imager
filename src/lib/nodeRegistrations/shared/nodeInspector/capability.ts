import { showInspectorDialog } from "./dialog";
import type { InspectorNodeLike, NodeInspectorInfo } from "./model";

const INSPECTOR = Symbol("node-inspector");
const MAX_LOG_LINES = 300;
const TITLE_HEIGHT = 30;
const INFO_WIDTH = 22;
const LOG_WIDTH = 34;

interface InspectorState { logs: string[]; lastStatus: string | null }
type InspectorNode = InspectorNodeLike & { [INSPECTOR]?: InspectorState };

function state(node: InspectorNode) { return node[INSPECTOR] ??= { logs: [], lastStatus: null }; }
function formatValue(value: unknown) { if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`.trim(); if (typeof value === "string") return value; try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
function timestamp() { return new Date().toLocaleTimeString(); }

export function appendNodeInspectorLog(node: InspectorNodeLike, message: unknown) {
  if (message === null || message === undefined || message === "") return;
  const target = state(node as InspectorNode); target.logs.push(`[${timestamp()}] ${formatValue(message)}`); target.logs = target.logs.slice(-MAX_LOG_LINES);
}

export function captureNodeInspectorState(node: InspectorNodeLike) {
  const target = state(node as InspectorNode);
  const status = node.status === null || node.status === undefined ? null : String(node.status);
  if (status && status !== target.lastStatus) { target.lastStatus = status; appendNodeInspectorLog(node, `status: ${status}`); }
}

function buildInfo(nodeType: string, node: InspectorNodeLike): NodeInspectorInfo {
  const parameters = { ...(node.properties ?? {}) };
  for (const widget of node.widgets ?? []) if (widget.name && !(widget.name in parameters)) parameters[widget.name] = widget.value;
  const ports = (items: Array<{ name?: string; type?: unknown }> | undefined) => (items ?? []).map(item => ({ name: item.name ?? "", type: String(item.type ?? "") }));
  return { nodeType, title: node.title ?? nodeType, inputs: ports(node.inputs), outputs: ports(node.outputs), parameters };
}

function collectLogs(node: InspectorNodeLike) {
  captureNodeInspectorState(node);
  const collected = [...state(node as InspectorNode).logs];
  for (const source of [node.logLines, node.logs]) {
    if (Array.isArray(source)) collected.push(...source.map(formatValue));
    else if (source) collected.push(formatValue(source));
  }
  if (node.error) collected.push(`error: ${formatValue(node.error)}`);
  if (node.lastError) collected.push(`lastError: ${formatValue(node.lastError)}`);
  return collected.length ? collected.join("\n") : "Nessun messaggio registrato per questo nodo.";
}

export function withNodeInspector<T extends new () => unknown>(nodeType: string, ctor: T): T {
  const prototype = (ctor as unknown as { prototype: InspectorNode }).prototype;
  const originalDrawTitle = prototype.onDrawTitle;
  const originalMouseDown = prototype.onMouseDown;
  prototype.onDrawTitle = function(this: InspectorNode, context: CanvasRenderingContext2D) {
    originalDrawTitle?.call(this, context);
    const width = this.size?.[0] ?? 160, y = -TITLE_HEIGHT / 2;
    context.save(); context.textAlign = "center"; context.textBaseline = "middle"; context.font = "15px 'Segoe UI Symbol','Noto Sans Symbols',sans-serif";
    context.fillStyle = "rgba(20,20,20,.72)"; context.fillRect(width - INFO_WIDTH - LOG_WIDTH - 4, -TITLE_HEIGHT + 4, INFO_WIDTH, TITLE_HEIGHT - 8); context.fillRect(width - LOG_WIDTH - 2, -TITLE_HEIGHT + 4, LOG_WIDTH, TITLE_HEIGHT - 8);
    context.fillStyle = "#e8eef4"; context.fillText("ⓘ", width - LOG_WIDTH - INFO_WIDTH / 2 - 4, y); context.fillText("▤", width - LOG_WIDTH / 2 - 2, y); context.restore();
  };
  prototype.onMouseDown = function(this: InspectorNode, event: PointerEvent, position?: [number, number], ...args: unknown[]) {
    if (position && position[1] >= -TITLE_HEIGHT && position[1] <= 0) {
      const width = this.size?.[0] ?? 160;
      if (position[0] >= width - LOG_WIDTH - 2) { event.preventDefault(); event.stopPropagation(); showInspectorDialog(`${this.title ?? nodeType} · log`, collectLogs(this), true); return true; }
      if (position[0] >= width - INFO_WIDTH - LOG_WIDTH - 4) { event.preventDefault(); event.stopPropagation(); showInspectorDialog(`${this.title ?? nodeType} · informazioni`, JSON.stringify(buildInfo(nodeType, this), null, 2), true); return true; }
    }
    return originalMouseDown?.call(this, event, position, ...args);
  };
  return ctor;
}
