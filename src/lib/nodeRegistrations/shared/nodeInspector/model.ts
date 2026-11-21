export interface InspectorPortInfo {
  name: string;
  type: string;
}

export interface NodeInspectorInfo {
  nodeType: string;
  title: string;
  inputs: InspectorPortInfo[];
  outputs: InspectorPortInfo[];
  parameters: Record<string, unknown>;
}

export interface InspectorNodeLike {
  title?: string;
  size?: [number, number];
  properties?: Record<string, unknown>;
  inputs?: Array<{ name?: string; type?: unknown }>;
  outputs?: Array<{ name?: string; type?: unknown }>;
  widgets?: Array<{ name?: string; value?: unknown; callback?: (...args: unknown[]) => void }>;
  status?: unknown;
  error?: unknown;
  lastError?: unknown;
  logLines?: unknown;
  logs?: unknown;
  setDirtyCanvas?(foreground?: boolean, background?: boolean): void;
  getOutputData?(slot: number): unknown;
  graph?: { onGraphStateChange?: () => void };
  onDrawTitle?(context: CanvasRenderingContext2D): void;
  onMouseDown?(event: PointerEvent, position?: [number, number], ...args: unknown[]): unknown;
}
