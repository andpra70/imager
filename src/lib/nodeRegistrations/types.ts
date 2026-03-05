import type { GraphImage } from "../../models/graphImage";

export type LiteNode = {
  addInput: (name: string, type?: string) => void;
  addOutput: (name: string, type?: string) => void;
  addWidget: (
    type: string,
    name: string,
    value: unknown,
    callback?: (value: number | string | boolean) => void,
    options?: Record<string, unknown>,
  ) => void;
  getInputData: (slot: number) => GraphImage | null | undefined;
  setOutputData: (slot: number, data: unknown) => void;
  setDirtyCanvas: (foreground?: boolean, background?: boolean) => void;
  size: [number, number];
  title: string;
  properties: Record<string, unknown>;
  widgets?: unknown[];
  graph?: {
    onGraphStateChange?: () => void;
  };
  onSerialize?: (data: Record<string, unknown>) => void;
  onConfigure?: (data: Record<string, unknown>) => void;
};

export interface PreviewAwareNode extends LiteNode {
  refreshPreviewLayout: () => void;
}

export type NodeCtor = new () => unknown;

export type RegisterNodeTypeFn = (type: string, ctor: NodeCtor) => void;
