import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle } from "../../shared";
import {
  isRemoteControlKind,
  MAX_REMOTE_CONTROLS,
  normalizeRemoteValue,
  type RemoteControlBinding,
  type RemoteControlKind,
  type RemoteControlOptions,
  type RemoteControlValue,
} from "./model";
import { NODE_ENABLED_PROPERTY, NODE_ENABLED_WIDGET } from "../../../shared/nodeRuntimeControls";

interface GraphWidget {
  name?: string;
  type?: string;
  value?: unknown;
  callback?: (...args: unknown[]) => void;
  options?: Record<string, unknown>;
}

interface GraphTargetNode {
  id: number;
  type?: string;
  title?: string;
  widgets?: GraphWidget[];
  setDirtyCanvas?: (foreground?: boolean, background?: boolean) => void;
  properties?: Record<string, unknown>;
  inputs?: unknown[];
  outputs?: unknown[];
}

interface ControlsGraph {
  _nodes?: GraphTargetNode[];
  getNodeById?: (id: number) => GraphTargetNode | undefined;
  onGraphStateChange?: () => void;
}

type ControlsNode = PreviewAwareNode & RemoteControlsToolNode & { id: number; graph?: ControlsGraph; widgets?: GraphWidget[] };
const BASE_WIDGET_COUNT = 6;

function newBindingId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `control-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function copiedOptions(widget: GraphWidget): RemoteControlOptions {
  const source = widget.options ?? {};
  const values = Array.isArray(source.values)
    ? source.values.filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    : undefined;
  return {
    ...(Number.isFinite(Number(source.min)) ? { min: Number(source.min) } : {}),
    ...(Number.isFinite(Number(source.max)) ? { max: Number(source.max) } : {}),
    ...(Number.isFinite(Number(source.step)) ? { step: Number(source.step) } : {}),
    ...(Number.isFinite(Number(source.precision)) ? { precision: Number(source.precision) } : {}),
    ...(values ? { values } : {}),
  };
}

export class RemoteControlsToolNode {
  size: [number, number] = [380, 280];
  properties!: Record<string, unknown>;
  bindings: RemoteControlBinding[] = [];
  status = "0 controlli";
  private selectedTargetId: number | null = null;
  private selectedWidgetName = "";
  private selectedBindingId = "";
  private needsInitialApply = false;

  constructor() {
    const node = this as unknown as ControlsNode;
    node.title = createToolTitle("IO / Controls");
    node.properties = { bindings: [] };
    node.addWidget("combo", "Nodo", "Seleziona nodo", (value) => node.selectTarget(String(value)), { values: () => node.targetLabels() });
    node.addWidget("combo", "Controllo", "Seleziona controllo", (value) => { node.selectedWidgetName = String(value); }, { values: () => node.targetWidgetNames() });
    node.addWidget("text", "Etichetta", "", () => undefined);
    node.addWidget("button", "Aggiungi controllo", null, () => node.addSelectedControl());
    node.addWidget("combo", "Rimuovi", "Nessun controllo", (value) => node.selectBinding(String(value)), { values: () => node.bindingLabels() });
    node.addWidget("button", "Elimina selezionato", null, () => node.removeSelectedControl());
    node.refreshPreviewLayout = () => node.refreshLayout();
    node.refreshLayout();
  }

  private graphNodes() {
    const node = this as unknown as ControlsNode;
    return (node.graph?._nodes ?? []).filter((candidate) => candidate.id !== node.id);
  }

  targetLabels() {
    const labels = this.graphNodes().map((target) => `#${target.id} · ${target.title || target.type || "Nodo"}`);
    return labels.length ? labels : ["Nessun nodo disponibile"];
  }

  private target() {
    const node = this as unknown as ControlsNode;
    return this.selectedTargetId === null ? undefined : node.graph?.getNodeById?.(this.selectedTargetId);
  }

  targetWidgetNames() {
    const target = this.target();
    const names = (target?.widgets ?? [])
      .filter((item) => isRemoteControlKind(item.type))
      .map((item) => item.name || "Controllo senza nome");
    if (target?.inputs?.length && target.outputs?.length) names.unshift(NODE_ENABLED_WIDGET);
    return names.length ? names : ["Nessun controllo compatibile"];
  }

  private selectedTargetControl() {
    const target = this.target();
    if (!target) return undefined;
    if (this.selectedWidgetName === NODE_ENABLED_WIDGET && target.inputs?.length && target.outputs?.length) {
      return { name: NODE_ENABLED_WIDGET, type: "toggle", value: target.properties?.[NODE_ENABLED_PROPERTY] !== false, options: {} } satisfies GraphWidget;
    }
    return target.widgets?.find((item) => item.name === this.selectedWidgetName && isRemoteControlKind(item.type));
  }

  bindingLabels() {
    return this.bindings.length ? this.bindings.map((binding) => `${binding.label} · #${binding.targetNodeId}`).concat() : ["Nessun controllo"];
  }

  selectTarget(label: string) {
    const match = label.match(/^#(\d+)/);
    this.selectedTargetId = match ? Number(match[1]) : null;
    this.selectedWidgetName = this.targetWidgetNames()[0] ?? "";
    const controlWidget = ((this as unknown as ControlsNode).widgets as GraphWidget[] | undefined)?.find((item) => item.name === "Controllo");
    if (controlWidget) controlWidget.value = this.selectedWidgetName;
  }

  selectBinding(label: string) {
    const index = this.bindingLabels().indexOf(label);
    this.selectedBindingId = this.bindings[index]?.id ?? "";
  }

  addSelectedControl() {
    const node = this as unknown as ControlsNode;
    if (this.bindings.length >= MAX_REMOTE_CONTROLS) { this.status = `massimo ${MAX_REMOTE_CONTROLS} controlli`; return; }
    const target = this.target();
    const targetWidget = this.selectedTargetControl();
    if (!target || !targetWidget || !isRemoteControlKind(targetWidget.type)) { this.status = "seleziona nodo e controllo"; return; }
    const duplicate = this.bindings.some((item) => item.targetNodeId === target.id && item.targetWidgetName === targetWidget.name);
    if (duplicate) { this.status = "controllo già presente"; return; }
    const aliasWidget = (node.widgets as GraphWidget[] | undefined)?.find((item) => item.name === "Etichetta");
    const label = String(aliasWidget?.value ?? "").trim() || String(targetWidget.name ?? "Controllo");
    this.bindings.push({
      id: newBindingId(), targetNodeId: target.id, targetNodeType: String(target.type ?? ""),
      targetWidgetName: String(targetWidget.name ?? ""), label, kind: targetWidget.type,
      value: normalizeRemoteValue(targetWidget.type, targetWidget.value), options: copiedOptions(targetWidget),
    });
    if (aliasWidget) aliasWidget.value = "";
    this.selectedBindingId = this.bindings[this.bindings.length - 1].id;
    this.commitBindings();
  }

  removeSelectedControl() {
    const index = this.bindings.findIndex((item) => item.id === this.selectedBindingId);
    if (index < 0) { this.status = "seleziona un controllo da rimuovere"; return; }
    this.bindings.splice(index, 1); this.selectedBindingId = this.bindings[0]?.id ?? ""; this.commitBindings();
  }

  private commitBindings() {
    const node = this as unknown as ControlsNode;
    node.properties.bindings = this.bindings.map((binding) => ({ ...binding, options: { ...binding.options } }));
    this.rebuildRemoteWidgets(); this.status = `${this.bindings.length} controlli`; node.graph?.onGraphStateChange?.();
  }

  private applyBinding(binding: RemoteControlBinding, value: RemoteControlValue) {
    const node = this as unknown as ControlsNode;
    const target = node.graph?.getNodeById?.(binding.targetNodeId);
    const isEnableControl = binding.targetWidgetName === NODE_ENABLED_WIDGET && Boolean(target?.inputs?.length && target.outputs?.length);
    const targetWidget = isEnableControl
      ? { name: NODE_ENABLED_WIDGET, type: "toggle", value: target?.properties?.[NODE_ENABLED_PROPERTY] !== false } as GraphWidget
      : target?.widgets?.find((item) => item.name === binding.targetWidgetName);
    if (!target || !targetWidget) { this.status = `disconnesso: ${binding.label}`; node.setDirtyCanvas(true, true); return; }
    binding.value = normalizeRemoteValue(binding.kind, value); targetWidget.value = binding.value;
    if (isEnableControl) {
      target.properties ??= {};
      target.properties[NODE_ENABLED_PROPERTY] = Boolean(binding.value);
    }
    try { targetWidget.callback?.call(target, binding.value, undefined, target); this.status = `${binding.label} → #${binding.targetNodeId}`; }
    catch (error) { this.status = error instanceof Error ? error.message : `errore: ${binding.label}`; }
    target.setDirtyCanvas?.(true, true); node.graph?.onGraphStateChange?.(); node.setDirtyCanvas(true, true);
  }

  private rebuildRemoteWidgets() {
    const node = this as unknown as ControlsNode;
    if (!node.widgets) return;
    const widgets = node.widgets as GraphWidget[];
    widgets.splice(BASE_WIDGET_COUNT);
    for (const binding of this.bindings) {
      node.addWidget(binding.kind, binding.label, binding.value, (value) => this.applyBinding(binding, normalizeRemoteValue(binding.kind, value)), { ...binding.options });
    }
    const removeWidget = widgets.find((item) => item.name === "Rimuovi");
    const selected = this.bindings.find((item) => item.id === this.selectedBindingId);
    if (removeWidget) removeWidget.value = selected ? `${selected.label} · #${selected.targetNodeId}` : "Nessun controllo";
    this.refreshLayout();
  }

  private refreshLayout() {
    const node = this as unknown as ControlsNode;
    node.size = [380, Math.max(280, 92 + (node.widgets?.length ?? BASE_WIDGET_COUNT) * 28)];
    node.setDirtyCanvas(true, true);
  }

  onSerialize(data: Record<string, unknown>) {
    data.remoteControlBindings = this.bindings.map((binding) => ({ ...binding, options: { ...binding.options } }));
  }

  onConfigure(data: Record<string, unknown>) {
    const raw = Array.isArray(data.remoteControlBindings) ? data.remoteControlBindings : this.properties.bindings;
    this.bindings = Array.isArray(raw) ? raw.slice(0, MAX_REMOTE_CONTROLS).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<RemoteControlBinding>;
      if (!Number.isInteger(candidate.targetNodeId) || typeof candidate.targetWidgetName !== "string" || !isRemoteControlKind(candidate.kind)) return [];
      return [{
        id: typeof candidate.id === "string" ? candidate.id : newBindingId(), targetNodeId: Number(candidate.targetNodeId),
        targetNodeType: String(candidate.targetNodeType ?? ""), targetWidgetName: candidate.targetWidgetName,
        label: String(candidate.label ?? candidate.targetWidgetName), kind: candidate.kind,
        value: normalizeRemoteValue(candidate.kind, candidate.value), options: (candidate.options ?? {}) as RemoteControlOptions,
      }];
    }) : [];
    this.selectedBindingId = this.bindings[0]?.id ?? ""; this.needsInitialApply = true; this.rebuildRemoteWidgets();
  }

  onExecute() {
    if (!this.needsInitialApply) return;
    this.needsInitialApply = false;
    for (const binding of this.bindings) this.applyBinding(binding, binding.value);
  }

  onDrawBackground(this: ControlsNode, context: CanvasRenderingContext2D) {
    context.save(); context.fillStyle = "rgba(255,255,255,.72)"; context.font = "12px sans-serif";
    context.fillText(this.status, 10, this.size[1] - 10); context.restore();
  }
}
