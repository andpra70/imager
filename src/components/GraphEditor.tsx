import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { LGraph, LGraphCanvas, LiteGraph } from "litegraph.js";
import "litegraph.js/css/litegraph.css";
import TopBar from "./editorChrome/TopBar";
import NodePaletteSidebar from "./editorChrome/NodePaletteSidebar";
import { GRAPH_LAYOUT_SPACING } from "../models/editorChrome";
import type { EditorCommandId, GraphLayoutMode } from "../models/editorChrome";
import { registerImageNodes } from "../lib/registerImageNodes";
import { drawActiveKleinStylePreviewOverlay } from "../lib/nodeRegistrations/tools/ai/klein/stylePreview/overlay";
import { installKleinStyleMenuPreview } from "../lib/nodeRegistrations/tools/ai/klein/stylePreview/menuHover";
import {
  getPreviewWidth,
  getPreviewWidthBounds,
  setPreviewWidth,
} from "../lib/nodePreviewSettings";
import sampleGraph from "../data/sample.json";
import {
  getProjectNameFromUrl,
  listGraphProjects,
  loadGraphProject,
  saveGraphProject,
  setProjectNameInUrl,
  UNTITLED_PROJECT_NAME,
} from "../models/graphProject";

const GRAPH_STORAGE_KEY = "plotterfun.graph";
const AUTO_SAVE_INTERVAL_MS = 60_000;
const GRAPH_TICK_FAST_MS = 33;
const GRAPH_TICK_MEDIUM_MS = 50;
const GRAPH_TICK_SLOW_MS = 80;
const GRAPH_LAYOUT_SPACING_KEY = "plotterfun.layoutSpacing";

function getSavedLayoutSpacing() {
  const saved = Number(localStorage.getItem(GRAPH_LAYOUT_SPACING_KEY));
  return Number.isFinite(saved)
    ? Math.min(GRAPH_LAYOUT_SPACING.max, Math.max(GRAPH_LAYOUT_SPACING.min, saved))
    : GRAPH_LAYOUT_SPACING.default;
}

interface GraphNodeInstance {
  id?: number;
  _level?: number;
  type?: string;
  pos: [number, number];
  size?: [number, number];
  preview?: unknown;
  connect: (slot: number, targetNode: GraphNodeInstance, targetSlot: number) => void;
  refreshPreviewLayout?: () => void;
}

interface GraphRuntime extends InstanceType<typeof LGraph> {
  _nodes?: GraphNodeInstance[];
  onNodeAdded?: () => void;
  onNodeRemoved?: () => void;
  onConnectionChange?: () => void;
  onGraphStateChange?: () => void;
  arrange: (margin?: number, layout?: string) => void;
  computeExecutionOrder: (onlyOnExecute: boolean, setLevel: boolean) => GraphNodeInstance[];
}

interface GraphCanvasRuntime extends InstanceType<typeof LGraphCanvas> {
  onNodeMoved?: () => void;
  onDrawForeground?: (context: CanvasRenderingContext2D) => void;
  ds: {
    scale: number;
    offset: [number, number];
  };
  setZoom: (value: number, zoomingCenter?: [number, number]) => void;
  setDirty: (foreground?: boolean, background?: boolean) => void;
  render_shadows?: boolean;
  highquality_render?: boolean;
  use_gradients?: boolean;
  clear_background_color?: string;
  background_image?: string;
  default_link_color?: string;
  copyToClipboard: () => void;
  pasteFromClipboard: () => void;
  deleteSelectedNodes: () => void;
  selected_nodes: Record<number, GraphNodeInstance>;
}

interface SerializedGraph {
  last_node_id?: number;
  last_link_id?: number;
  nodes?: unknown[];
  links?: unknown[];
  groups?: unknown[];
  config?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  version?: number;
}

interface SerializedViewportState {
  scale: number;
  offset: [number, number];
}

function createDefaultGraph(graph: InstanceType<typeof LGraph>) {
  const inputNode = LiteGraph.createNode("input/image") as GraphNodeInstance;
  const invertNode = LiteGraph.createNode("tools/colors/invert") as GraphNodeInstance;
  const outputNode = LiteGraph.createNode("output/image") as GraphNodeInstance;
  const webcamNode = LiteGraph.createNode("input/webcam") as GraphNodeInstance;

  inputNode.pos = [60, 80];
  webcamNode.pos = [60, 360];
  invertNode.pos = [380, 140];
  outputNode.pos = [740, 120];

  graph.add(inputNode);
  graph.add(webcamNode);
  graph.add(invertNode);
  graph.add(outputNode);

  inputNode.connect(0, invertNode, 0);
  invertNode.connect(0, outputNode, 0);
}

function getAdaptiveGraphTickMs(nodeCount: number) {
  if (nodeCount > 80) {
    return GRAPH_TICK_SLOW_MS;
  }
  if (nodeCount > 35) {
    return GRAPH_TICK_MEDIUM_MS;
  }
  return GRAPH_TICK_FAST_MS;
}

function extractViewportFromSerializedGraph(serializedGraph: SerializedGraph) {
  const viewport = serializedGraph.extra && typeof serializedGraph.extra === "object"
    ? (serializedGraph.extra as Record<string, unknown>).viewport
    : null;
  if (!viewport || typeof viewport !== "object") {
    return null;
  }
  const candidate = viewport as { scale?: unknown; offset?: unknown };
  const scale = Number(candidate.scale);
  const offset = candidate.offset;
  if (
    !Number.isFinite(scale) ||
    !Array.isArray(offset) ||
    offset.length !== 2 ||
    !Number.isFinite(Number(offset[0])) ||
    !Number.isFinite(Number(offset[1]))
  ) {
    return null;
  }
  return {
    scale,
    offset: [Number(offset[0]), Number(offset[1])] as [number, number],
  } satisfies SerializedViewportState;
}

function GraphEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<GraphRuntime | null>(null);
  const graphCanvasRef = useRef<GraphCanvasRuntime | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveIntervalRef = useRef<number | null>(null);
  const previewWidthBounds = getPreviewWidthBounds();
  const [previewWidthValue, setPreviewWidthValue] = useState(getPreviewWidth());
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [projectName, setProjectName] = useState(() => getProjectNameFromUrl() || UNTITLED_PROJECT_NAME);
  const [layoutSpacing, setLayoutSpacing] = useState(getSavedLayoutSpacing);
  const [statusMessage, setStatusMessage] = useState(
    "Create nodes from the toolbar or from the LiteGraph context menu.",
  );

  const restartGraphWithAdaptiveTick = () => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }
    const nodeCount = graph._nodes?.length ?? 0;
    const tickMs = getAdaptiveGraphTickMs(nodeCount);
    graph.stop();
    graph.start(tickMs);
  };

  const refreshCanvas = () => {
    graphCanvasRef.current?.setDirty(true, true);
  };

  const applyViewportState = (viewportState: SerializedViewportState | null) => {
    const graphCanvas = graphCanvasRef.current;
    if (!graphCanvas || !viewportState) {
      return;
    }
    graphCanvas.ds.scale = viewportState.scale;
    graphCanvas.ds.offset[0] = viewportState.offset[0];
    graphCanvas.ds.offset[1] = viewportState.offset[1];
    graphCanvas.setDirty(true, true);
  };

  const serializeGraphWithViewport = () => {
    const graph = graphRef.current;
    if (!graph) {
      return null;
    }

    const serialized = graph.serialize() as SerializedGraph;
    const graphCanvas = graphCanvasRef.current;
    const nextExtra =
      serialized.extra && typeof serialized.extra === "object"
        ? { ...serialized.extra }
        : {};
    if (graphCanvas?.ds) {
      nextExtra.viewport = {
        scale: graphCanvas.ds.scale,
        offset: [graphCanvas.ds.offset[0], graphCanvas.ds.offset[1]],
      } satisfies SerializedViewportState;
    }
    serialized.extra = nextExtra;
    return serialized;
  };

  const refreshNodeLayouts = () => {
    const graph = graphRef.current;
    if (!graph?._nodes) {
      return;
    }

    graph._nodes.forEach((node: GraphNodeInstance) => {
      node.refreshPreviewLayout?.();
    });
  };

  const persistGraph = (message?: string) => {
    try {
      const serialized = serializeGraphWithViewport();
      if (!serialized) {
        return;
      }
      localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(serialized));
      if (message) {
        setStatusMessage(message);
      }
    } catch {
      if (message) {
        setStatusMessage("Graph save failed.");
      }
    }
  };

  const resetGraph = (message = "Default graph restored.") => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    graph.stop();
    graph.clear();
    createDefaultGraph(graph);
    graph.start(getAdaptiveGraphTickMs(graph._nodes?.length ?? 0));
    refreshCanvas();
    persistGraph(message);
  };

  const addNode = (type: string) => {
    const graph = graphRef.current;
    const graphCanvas = graphCanvasRef.current;
    if (!graph) {
      return;
    }

    let node: GraphNodeInstance | null = null;
    try {
      node = LiteGraph.createNode(type) as GraphNodeInstance | null;
    } catch (error) {
      const details = error instanceof Error ? error.message : "unknown error";
      setStatusMessage(`Cannot create node ${type}: ${details}`);
      return;
    }
    if (!node) {
      setStatusMessage(`Cannot create node ${type}.`);
      return;
    }

    node.refreshPreviewLayout?.();
    const nodeWidth = node.size?.[0] ?? 160;
    const nodeHeight = node.size?.[1] ?? 120;
    if (graphCanvas?.ds && graphCanvas.canvas) {
      const centerX = graphCanvas.canvas.width * 0.5 / graphCanvas.ds.scale - graphCanvas.ds.offset[0];
      const centerY = graphCanvas.canvas.height * 0.5 / graphCanvas.ds.scale - graphCanvas.ds.offset[1];
      node.pos = [centerX - nodeWidth * 0.5, centerY - nodeHeight * 0.5];
    } else {
      node.pos = [120, 120];
    }
    graph.add(node);
    restartGraphWithAdaptiveTick();
    node.refreshPreviewLayout?.();
    refreshCanvas();
    persistGraph(`${type} added.`);
  };

  const fitView = () => {
    const graph = graphRef.current;
    const graphCanvas = graphCanvasRef.current;
    if (!graph?._nodes?.length || !graphCanvas?.canvas || !graphCanvas.ds) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    graph._nodes.forEach((node) => {
      const width = node.size?.[0] ?? 160;
      const height = node.size?.[1] ?? 120;
      const x = node.pos?.[0] ?? 0;
      const y = node.pos?.[1] ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return;
    }

    const padding = 90;
    const boundsWidth = Math.max(1, maxX - minX);
    const boundsHeight = Math.max(1, maxY - minY);
    const targetScaleX = Math.max(0.05, (graphCanvas.canvas.width - padding * 2) / boundsWidth);
    const targetScaleY = Math.max(0.05, (graphCanvas.canvas.height - padding * 2) / boundsHeight);
    const targetScale = Math.min(1.5, Math.max(0.1, Math.min(targetScaleX, targetScaleY)));
    graphCanvas.setZoom(targetScale, [graphCanvas.canvas.width * 0.5, graphCanvas.canvas.height * 0.5]);

    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    graphCanvas.ds.offset[0] = -centerX + (graphCanvas.canvas.width * 0.5) / graphCanvas.ds.scale;
    graphCanvas.ds.offset[1] = -centerY + (graphCanvas.canvas.height * 0.5) / graphCanvas.ds.scale;
    graphCanvas.setDirty(true, true);
    setStatusMessage("Blueprint fitted in view.");
  };

  const updatePreviewWidth = (width: number) => {
    const nextWidth = setPreviewWidth(width);
    setPreviewWidthValue(nextWidth);
    refreshNodeLayouts();
    refreshCanvas();
    setStatusMessage(`Preview width set to ${nextWidth}px.`);
  };

  const saveGraph = () => {
    const requestedName = window.prompt("Nome del progetto", projectName === UNTITLED_PROJECT_NAME ? "" : projectName);
    if (requestedName === null) return;
    const serialized = serializeGraphWithViewport();
    if (!serialized) return;
    try {
      const project = saveGraphProject(requestedName, serialized);
      setProjectName(project.name);
      setProjectNameInUrl(project.name);
      document.title = `${project.name} · Plotterfun`;
      localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(serialized));
      setStatusMessage(`Progetto “${project.name}” salvato.`);
    } catch {
      setStatusMessage("Inserisci un nome valido per salvare il progetto.");
    }
  };

  const loadGraphFromData = (serializedGraph: SerializedGraph, message: string) => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    graph.stop();
    graph.clear();
    graph.configure(serializedGraph);
    applyViewportState(extractViewportFromSerializedGraph(serializedGraph));
    graph.start(getAdaptiveGraphTickMs(graph._nodes?.length ?? 0));
    refreshCanvas();
    persistGraph(message);
  };

  const loadProjectByName = (name: string) => {
    const project = loadGraphProject<SerializedGraph>(name);
    if (!project) {
      setStatusMessage(`Progetto “${name}” non trovato.`);
      return false;
    }
    loadGraphFromData(project.graph, `Progetto “${project.name}” caricato.`);
    setProjectName(project.name);
    setProjectNameInUrl(project.name);
    document.title = `${project.name} · Plotterfun`;
    return true;
  };

  const loadGraph = () => {
    const projects = listGraphProjects();
    const suggestion = projectName !== UNTITLED_PROJECT_NAME ? projectName : projects[0] ?? "";
    const requestedName = window.prompt(
      projects.length ? `Nome del progetto\nDisponibili: ${projects.join(", ")}` : "Nome del progetto",
      suggestion,
    );
    if (requestedName !== null) loadProjectByName(requestedName);
  };

  const exportGraph = () => {
    const serialized = serializeGraphWithViewport();
    if (!serialized) {
      return;
    }

    const blob = new Blob([JSON.stringify(serialized, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeProjectName = projectName.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "plotterfun-graph";
    link.download = `${safeProjectName}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Graph JSON exported.");
  };

  const importGraph = () => {
    importInputRef.current?.click();
  };

  const copySelectedNodes = () => {
    const graphCanvas = graphCanvasRef.current;
    const count = Object.keys(graphCanvas?.selected_nodes ?? {}).length;
    if (!graphCanvas || count === 0) {
      setStatusMessage("Seleziona almeno un nodo da copiare.");
      return;
    }
    graphCanvas.copyToClipboard();
    setStatusMessage(`${count} ${count === 1 ? "nodo copiato" : "nodi copiati"}.`);
  };

  const pasteNodes = () => {
    const graphCanvas = graphCanvasRef.current;
    if (!graphCanvas || !localStorage.getItem("litegrapheditor_clipboard")) {
      setStatusMessage("Gli appunti dei nodi sono vuoti.");
      return;
    }
    graphCanvas.pasteFromClipboard();
    restartGraphWithAdaptiveTick();
    refreshCanvas();
    persistGraph("Nodo incollato.");
  };

  const cutSelectedNodes = () => {
    const graphCanvas = graphCanvasRef.current;
    const count = Object.keys(graphCanvas?.selected_nodes ?? {}).length;
    if (!graphCanvas || count === 0) {
      setStatusMessage("Seleziona almeno un nodo da tagliare.");
      return;
    }
    graphCanvas.copyToClipboard();
    graphCanvas.deleteSelectedNodes();
    restartGraphWithAdaptiveTick();
    refreshCanvas();
    persistGraph(`${count} ${count === 1 ? "nodo tagliato" : "nodi tagliati"}.`);
  };

  const runCommand = (command: EditorCommandId) => {
    const actions: Record<EditorCommandId, () => void> = {
      save: saveGraph,
      load: loadGraph,
      export: exportGraph,
      import: importGraph,
      fit: fitView,
      reset: () => resetGraph(),
      copy: copySelectedNodes,
      paste: pasteNodes,
      cut: cutSelectedNodes,
    };
    actions[command]();
  };

  const applyGraphLayout = (mode: GraphLayoutMode) => {
    const graph = graphRef.current;
    if (!graph?._nodes?.length) {
      setStatusMessage("Il grafo non contiene nodi da organizzare.");
      return;
    }

    if (mode === "hierarchical-horizontal") {
      graph.arrange(layoutSpacing);
    } else if (mode === "hierarchical-vertical") {
      graph.arrange(layoutSpacing, LiteGraph.VERTICAL_LAYOUT);
    } else if (mode === "tree") {
      const orderedNodes = graph.computeExecutionOrder(false, true);
      const levels = new Map<number, GraphNodeInstance[]>();
      orderedNodes.forEach((node) => {
        const level = node._level ?? 1;
        levels.set(level, [...(levels.get(level) ?? []), node]);
      });
      const levelEntries = [...levels.entries()].sort(([a], [b]) => a - b);
      const maxLevelHeight = Math.max(...levelEntries.map(([, nodes]) =>
        nodes.reduce((height, node) => height + (node.size?.[1] ?? 120) + layoutSpacing, 0),
      ));
      let x = 80;
      levelEntries.forEach(([, nodes]) => {
        const levelHeight = nodes.reduce((height, node) => height + (node.size?.[1] ?? 120) + layoutSpacing, 0);
        let y = 60 + Math.max(0, (maxLevelHeight - levelHeight) / 2);
        let maxWidth = 160;
        nodes.forEach((node) => {
          node.pos = [x, y];
          y += (node.size?.[1] ?? 120) + layoutSpacing;
          maxWidth = Math.max(maxWidth, node.size?.[0] ?? 160);
        });
        x += maxWidth + layoutSpacing;
      });
    } else {
      const nodes = [...graph._nodes].sort((a, b) => (a.type ?? "").localeCompare(b.type ?? "", "it"));
      const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
      const columnWidths = Array.from({ length: columns }, () => 180);
      nodes.forEach((node, index) => {
        const column = index % columns;
        columnWidths[column] = Math.max(columnWidths[column], node.size?.[0] ?? 160);
      });
      const columnX = columnWidths.map((_, index) => 70 + columnWidths.slice(0, index).reduce((sum, width) => sum + width + layoutSpacing, 0));
      const rowHeights: number[] = [];
      nodes.forEach((node, index) => {
        const row = Math.floor(index / columns);
        rowHeights[row] = Math.max(rowHeights[row] ?? 0, node.size?.[1] ?? 120);
      });
      nodes.forEach((node, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const y = 60 + rowHeights.slice(0, row).reduce((sum, height) => sum + height + layoutSpacing, 0);
        node.pos = [columnX[column], y];
      });
    }

    refreshCanvas();
    fitView();
    persistGraph(`Nodi riorganizzati: ${mode}.`);
  };

  const updateLayoutSpacing = (spacing: number) => {
    const nextSpacing = Math.min(
      GRAPH_LAYOUT_SPACING.max,
      Math.max(GRAPH_LAYOUT_SPACING.min, Number.isFinite(spacing) ? spacing : GRAPH_LAYOUT_SPACING.default),
    );
    setLayoutSpacing(nextSpacing);
    localStorage.setItem(GRAPH_LAYOUT_SPACING_KEY, String(nextSpacing));
  };

  const getNodePreview = (type: string) => {
    const matchingNodes = (graphRef.current?._nodes ?? []).filter((node) => node.type === type).reverse();
    for (const node of matchingNodes) {
      const source = node.preview;
      try {
        if (source instanceof HTMLCanvasElement) return source.toDataURL("image/jpeg", 0.72);
        if (source instanceof HTMLImageElement) return source.currentSrc || source.src || null;
        if (source instanceof ImageData) {
          const canvas = document.createElement("canvas");
          canvas.width = source.width;
          canvas.height = source.height;
          canvas.getContext("2d")?.putImageData(source, 0, 0);
          return canvas.toDataURL("image/jpeg", 0.72);
        }
      } catch {
        // A tainted or unavailable source simply has no sidebar thumbnail.
      }
    }
    return null;
  };

  useEffect(() => {
    const onEditorShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveGraph();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
        event.preventDefault();
        cutSelectedNodes();
      } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        fitView();
      }
    };
    window.addEventListener("keydown", onEditorShortcut);
    return () => window.removeEventListener("keydown", onEditorShortcut);
  });

  const onImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      loadGraphFromData(JSON.parse(text) as SerializedGraph, "Graph JSON imported.");
    } catch {
      setStatusMessage("Imported file is not valid JSON.");
    }

    event.target.value = "";
  };

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      return;
    }

    registerImageNodes();

    const graph = new LGraph();
    const graphCanvas = new LGraphCanvas(canvasElement, graph);
    const runtimeGraph = graph as GraphRuntime;
    const runtimeCanvas = graphCanvas as GraphCanvasRuntime;
    graphRef.current = runtimeGraph;
    graphCanvasRef.current = runtimeCanvas;
    graphCanvas.ds.scale = 0.9;
    graphCanvas.allow_dragcanvas = true;
    runtimeGraph.onGraphStateChange = undefined;
    runtimeGraph.onNodeAdded = undefined;
    runtimeGraph.onNodeRemoved = undefined;
    runtimeGraph.onConnectionChange = undefined;
    runtimeCanvas.onNodeMoved = undefined;
    runtimeCanvas.onDrawForeground = (context) => drawActiveKleinStylePreviewOverlay(context);
    const uninstallStyleMenuPreview = installKleinStyleMenuPreview();


    // LiteGraph drop handlers can throw if graph is temporarily null (e.g. teardown races).
    // Guard them locally to avoid crashing the editor on external drops.
    const originalProcessDrop = runtimeCanvas.processDrop?.bind(runtimeCanvas);
    if (originalProcessDrop) {
      runtimeCanvas.processDrop = (event: DragEvent) => {
        if (!runtimeCanvas.graph) {
          event.preventDefault();
          return false;
        }
        return originalProcessDrop(event);
      };
    }

    const originalCheckDropItem = runtimeCanvas.checkDropItem?.bind(runtimeCanvas);
    if (originalCheckDropItem) {
      runtimeCanvas.checkDropItem = (event: DragEvent) => {
        if (!runtimeCanvas.graph) {
          return false;
        }
        return originalCheckDropItem(event);
      };
    }

    const requestedProjectName = getProjectNameFromUrl();
    const requestedProject = requestedProjectName
      ? loadGraphProject<SerializedGraph>(requestedProjectName)
      : null;
    const savedGraph = localStorage.getItem(GRAPH_STORAGE_KEY);
    let initialViewportState: SerializedViewportState | null = null;
    if (requestedProject) {
      graph.configure(requestedProject.graph);
      initialViewportState = extractViewportFromSerializedGraph(requestedProject.graph);
      setProjectName(requestedProject.name);
      document.title = `${requestedProject.name} · Plotterfun`;
      setStatusMessage(`Progetto “${requestedProject.name}” aperto dal link.`);
    } else if (requestedProjectName) {
      try {
        const serialized = sampleGraph as SerializedGraph;
        graph.configure(serialized);
        initialViewportState = extractViewportFromSerializedGraph(serialized);
        setStatusMessage(`Progetto “${requestedProjectName}” non trovato. Caricato il grafo di esempio.`);
      } catch {
        createDefaultGraph(graph);
        setStatusMessage(`Progetto “${requestedProjectName}” non trovato.`);
      }
    } else if (savedGraph) {
      try {
        const serialized = JSON.parse(savedGraph) as SerializedGraph;
        graph.configure(serialized);
        initialViewportState = extractViewportFromSerializedGraph(serialized);
        setStatusMessage("Saved graph restored from localStorage.");
      } catch {
        try {
          const serialized = sampleGraph as SerializedGraph;
          graph.configure(serialized);
          initialViewportState = extractViewportFromSerializedGraph(serialized);
          setStatusMessage("Saved graph invalid. Loaded sample graph.");
          persistGraph();
        } catch {
          createDefaultGraph(graph);
          persistGraph("Saved graph invalid and sample graph unavailable. Default graph restored.");
        }
      }
    } else {
      try {
        const serialized = sampleGraph as SerializedGraph;
        graph.configure(serialized);
        initialViewportState = extractViewportFromSerializedGraph(serialized);
        setStatusMessage("Sample graph loaded.");
        persistGraph();
      } catch {
        createDefaultGraph(graph);
        persistGraph("Sample graph unavailable. Default graph restored.");
      }
    }

    const resizeCanvas = () => {
      const width = Math.max(1, Math.floor(canvasElement.clientWidth || canvasElement.getBoundingClientRect().width));
      const height = Math.max(
        1,
        Math.floor(canvasElement.clientHeight || canvasElement.getBoundingClientRect().height || window.innerHeight),
      );
      canvasElement.width = width;
      canvasElement.height = height;
      graphCanvas.resize(width, height);
      graphCanvas.setDirty(true, true);
    };

    resizeCanvas();
    applyViewportState(initialViewportState);
    window.addEventListener("resize", resizeCanvas);
    graph.start(getAdaptiveGraphTickMs(graph._nodes?.length ?? 0));
    autoSaveIntervalRef.current = window.setInterval(() => {
      persistGraph();
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      if (autoSaveIntervalRef.current !== null) {
        window.clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
      window.removeEventListener("resize", resizeCanvas);
      uninstallStyleMenuPreview();
      graph.stop();
      graph.clear();
      runtimeCanvas.onDrawForeground = undefined;
      graphCanvas.setGraph(null);
      graphRef.current = null;
      graphCanvasRef.current = null;
    };
  }, []);

  return (
    <section className="editor-panel">
      <TopBar
        onAddNode={addNode}
        onCommand={runCommand}
        onLayout={applyGraphLayout}
        layoutSpacing={layoutSpacing}
        onLayoutSpacingChange={updateLayoutSpacing}
        onWorkImageSizeChange={updatePreviewWidth}
        workImageSize={previewWidthValue}
        workImageSizeMax={previewWidthBounds.max}
        workImageSizeMin={previewWidthBounds.min}
        workImageSizeStep={previewWidthBounds.step}
        onTogglePalette={() => setPaletteOpen((open) => !open)}
        paletteOpen={paletteOpen}
        projectName={projectName}
        statusMessage={statusMessage}
      />
      <div className="editor-workspace">
        {paletteOpen && (
          <NodePaletteSidebar
            getNodePreview={getNodePreview}
            onAddNode={addNode}
            onClose={() => setPaletteOpen(false)}
          />
        )}
        <canvas className="editor-stage" ref={canvasRef} />
      </div>
      <input
        accept="application/json"
        className="visually-hidden"
        onChange={onImportFileChange}
        ref={importInputRef}
        type="file"
      />
    </section>
  );
}

export default GraphEditor;
