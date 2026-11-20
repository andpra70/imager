export type RemoteControlKind = "slider" | "number" | "toggle" | "combo" | "text";
export type RemoteControlValue = number | boolean | string;

export interface RemoteControlOptions {
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  values?: Array<string | number>;
}

export interface RemoteControlBinding {
  id: string;
  targetNodeId: number;
  targetNodeType: string;
  targetWidgetName: string;
  label: string;
  kind: RemoteControlKind;
  value: RemoteControlValue;
  options: RemoteControlOptions;
}

export const MAX_REMOTE_CONTROLS = 20;

export function isRemoteControlKind(value: unknown): value is RemoteControlKind {
  return value === "slider" || value === "number" || value === "toggle" || value === "combo" || value === "text";
}

export function normalizeRemoteValue(kind: RemoteControlKind, value: unknown): RemoteControlValue {
  if (kind === "toggle") return Boolean(value);
  if (kind === "slider" || kind === "number") return Number.isFinite(Number(value)) ? Number(value) : 0;
  return String(value ?? "");
}
