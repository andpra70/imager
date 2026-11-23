import type { NodePaletteItem } from "./nodePalette";

export type EditorCommandId =
  | "save"
  | "load"
  | "export"
  | "import"
  | "fit"
  | "reset"
  | "copy"
  | "paste"
  | "cut";

export interface EditorCommand {
  id: EditorCommandId;
  label: string;
  shortcut?: string;
  danger?: boolean;
}

export interface NodePaletteCategory {
  id: NodePaletteItem["category"];
  label: string;
  nodes: NodePaletteItem[];
}

export type GraphLayoutMode = "hierarchical-horizontal" | "hierarchical-vertical" | "tree" | "grid";

export interface GraphLayoutSettings {
  spacing: number;
}

export const GRAPH_LAYOUT_SPACING = {
  default: 90,
  min: 20,
  max: 300,
  step: 10,
} as const;

export interface GraphLayoutOption {
  id: GraphLayoutMode;
  label: string;
  description: string;
  native: boolean;
}

export const graphLayoutOptions: GraphLayoutOption[] = [
  { id: "hierarchical-horizontal", label: "Gerarchico orizzontale", description: "Flusso da sinistra a destra", native: true },
  { id: "hierarchical-vertical", label: "Gerarchico verticale", description: "Flusso dall'alto verso il basso", native: true },
  { id: "tree", label: "Albero compatto", description: "Livelli centrati e ravvicinati", native: false },
  { id: "grid", label: "Griglia", description: "Nodi disposti in righe regolari", native: false },
];

export const fileCommands: EditorCommand[] = [
  { id: "save", label: "Salva grafo", shortcut: "Ctrl+S" },
  { id: "load", label: "Carica grafo" },
  { id: "export", label: "Esporta grafo JSON" },
  { id: "import", label: "Importa grafo JSON" },
  { id: "fit", label: "Adatta alla vista", shortcut: "F" },
  { id: "reset", label: "Ripristina grafo", danger: true },
];

export const editCommands: EditorCommand[] = [
  { id: "copy", label: "Copia nodo selezionato", shortcut: "Ctrl+C" },
  { id: "paste", label: "Incolla nodo", shortcut: "Ctrl+V" },
  { id: "cut", label: "Taglia nodo selezionato", shortcut: "Ctrl+X" },
];

const categoryLabels: Record<NodePaletteItem["category"], string> = {
  io: "Input / Output",
  basic: "Base",
  focus: "Fuoco",
  colors: "Colori",
  art: "Arte",
  artists: "Artisti",
  graphic: "Grafica",
  plotter: "Plotter",
  linesart: "Line Art",
  manual: "Manuale",
  opencv: "OpenCV",
  gcode: "GCode",
  wasm: "WASM",
  lua: "LUA",
  ai: "AI",
  svg: "SVG",
  print: "Stampa",
};

export function buildNodePaletteCategories(items: NodePaletteItem[]): NodePaletteCategory[] {
  const groups = new Map<NodePaletteItem["category"], NodePaletteItem[]>();
  items.forEach((item) => groups.set(item.category, [...(groups.get(item.category) ?? []), item]));
  return [...groups.entries()]
    .map(([id, nodes]) => ({
      id,
      label: categoryLabels[id],
      nodes: nodes.sort((a, b) => a.shortLabel.localeCompare(b.shortLabel, "it", { sensitivity: "base" })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "it", { sensitivity: "base" }));
}
