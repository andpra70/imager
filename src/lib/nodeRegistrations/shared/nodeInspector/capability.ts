import { showInspectorDialog } from "./dialog";
import type { InspectorNodeLike, NodeInspectorInfo } from "./model";
import { NODE_ENABLED_PROPERTY } from "../nodeRuntimeControls";
import { exportNodeOutputs } from "../nodeOutputExport";

const INSPECTOR = Symbol("node-inspector");
const MAX_LOG_LINES = 300;
const TITLE_HEIGHT = 30;
const INFO_WIDTH = 22;
const LOG_WIDTH = 34;
const SAVE_WIDTH = 28;
const ENABLE_WIDTH = 28;
const DELETE_WIDTH = 28;

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
    const logX = width - LOG_WIDTH - 2, infoX = logX - INFO_WIDTH - 2, saveX = infoX - SAVE_WIDTH - 2, enableX = saveX - ENABLE_WIDTH - 2, deleteX = enableX - DELETE_WIDTH - 2;
    context.fillStyle = "rgba(20,20,20,.72)"; context.fillRect(infoX, -TITLE_HEIGHT + 4, INFO_WIDTH, TITLE_HEIGHT - 8); context.fillRect(logX, -TITLE_HEIGHT + 4, LOG_WIDTH, TITLE_HEIGHT - 8);
    if (this.outputs?.length) context.fillRect(saveX, -TITLE_HEIGHT + 4, SAVE_WIDTH, TITLE_HEIGHT - 8);
    if (NODE_ENABLED_PROPERTY in (this.properties ?? {})) context.fillRect(enableX, -TITLE_HEIGHT + 4, ENABLE_WIDTH, TITLE_HEIGHT - 8);
    context.fillRect(deleteX, -TITLE_HEIGHT + 4, DELETE_WIDTH, TITLE_HEIGHT - 8);
    context.fillStyle = "#e8eef4"; context.fillText("ⓘ", infoX + INFO_WIDTH / 2, y); context.fillText("▤", logX + LOG_WIDTH / 2, y);
    if (this.outputs?.length) context.fillText("⇩", saveX + SAVE_WIDTH / 2, y);
    if (NODE_ENABLED_PROPERTY in (this.properties ?? {})) { context.fillStyle = this.properties?.[NODE_ENABLED_PROPERTY] === false ? "#e4776f" : "#75c987"; context.fillText(this.properties?.[NODE_ENABLED_PROPERTY] === false ? "○" : "●", enableX + ENABLE_WIDTH / 2, y); }
    context.fillStyle = "#e88b84"; context.font = "bold 13px 'Segoe UI',sans-serif"; context.fillText("×", deleteX + DELETE_WIDTH / 2, y);
    context.restore();
  };
  prototype.onMouseDown = function(this: InspectorNode, event: PointerEvent, position?: [number, number], ...args: unknown[]) {
    if (position && position[1] >= -TITLE_HEIGHT && position[1] <= 0) {
      const width = this.size?.[0] ?? 160;
      const logX = width - LOG_WIDTH - 2, infoX = logX - INFO_WIDTH - 2, saveX = infoX - SAVE_WIDTH - 2, enableX = saveX - ENABLE_WIDTH - 2, deleteX = enableX - DELETE_WIDTH - 2;
      if (position[0] >= logX) { event.preventDefault(); event.stopPropagation(); showInspectorDialog(`${this.title ?? nodeType} · log`, collectLogs(this), true); return true; }
      if (position[0] >= infoX) { event.preventDefault(); event.stopPropagation(); showInspectorDialog(`${this.title ?? nodeType} · informazioni`, JSON.stringify(buildInfo(nodeType, this), null, 2), true); return true; }
      if (this.outputs?.length && position[0] >= saveX) { event.preventDefault(); event.stopPropagation(); if (this.getOutputData) exportNodeOutputs(this as Required<Pick<InspectorNode, "getOutputData">> & InspectorNode); return true; }
      if (NODE_ENABLED_PROPERTY in (this.properties ?? {}) && position[0] >= enableX) {
        event.preventDefault(); event.stopPropagation();
        const enabled = this.properties?.[NODE_ENABLED_PROPERTY] !== false;
        if (this.properties) this.properties[NODE_ENABLED_PROPERTY] = !enabled;
        this.graph?.onGraphStateChange?.(); this.setDirtyCanvas?.(true, true); return true;
      }
      if (position[0] >= deleteX) {
        event.preventDefault(); event.stopPropagation();
        this.graph?.remove?.(this); this.graph?.onGraphStateChange?.(); return true;
      }
    }
    return originalMouseDown?.call(this, event, position, ...args);
  };
  return ctor;
}
