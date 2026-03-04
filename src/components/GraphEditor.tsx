import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { LGraph, LGraphCanvas, LiteGraph } from "litegraph.js";
import "litegraph.js/css/litegraph.css";
import GraphToolbar from "./GraphToolbar";
import { registerImageNodes } from "../lib/registerImageNodes";
import {
  getPreviewWidth,
  getPreviewWidthBounds,
  setPreviewWidth,
} from "../lib/nodePreviewSettings";

const GRAPH_STORAGE_KEY = "plotterfun.graph";
const AUTO_SAVE_INTERVAL_MS = 60_000;
const THEME_STORAGE_KEY = "plotterfun.theme";
type ThemeMode = "light" | "mid" | "dark";
const GRAPH_TICK_FAST_MS = 33;
const GRAPH_TICK_MEDIUM_MS = 50;
const GRAPH_TICK_SLOW_MS = 80;

interface GraphNodeInstance {
  pos: [number, number];
  size?: [number, number];
  connect: (slot: number, targetNode: GraphNodeInstance, targetSlot: number) => void;
  refreshPreviewLayout?: () => void;
}

interface GraphRuntime extends InstanceType<typeof LGraph> {
  _nodes?: GraphNodeInstance[];
  onNodeAdded?: () => void;
  onNodeRemoved?: () => void;
  onConnectionChange?: () => void;
  onGraphStateChange?: () => void;
}

interface GraphCanvasRuntime extends InstanceType<typeof LGraphCanvas> {
  onNodeMoved?: () => void;
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

function createDefaultGraph(graph: InstanceType<typeof LGraph>) {
  const inputNode = LiteGraph.createNode("input/image") as GraphNodeInstance;
  const invertNode = LiteGraph.createNode("tools/invert") as GraphNodeInstance;
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

function applyBlueprintTheme(themeMode: ThemeMode, graphCanvas: GraphCanvasRuntime | null) {
  const theme = {
    dark: {
      nodeColor: "#3a3a3a",
      nodeBgColor: "#262626",
      nodeBoxColor: "#6d6d6d",
      linkColor: "#88b58e",
      eventLinkColor: "#cf9a69",
      connectingLinkColor: "#8ed4a3",
      clearBackground: "#1e1e1f",
    },
    mid: {
      nodeColor: "#5a5f65",
      nodeBgColor: "#40444b",
      nodeBoxColor: "#9aa0a8",
      linkColor: "#8ec6d8",
      eventLinkColor: "#d3a970",
      connectingLinkColor: "#98d9b2",
      clearBackground: "#32363b",
    },
    light: {
      nodeColor: "#d3dbe4",
      nodeBgColor: "#f4f7fb",
      nodeBoxColor: "#7b8b9c",
      linkColor: "#3a6f8e",
      eventLinkColor: "#915d2f",
      connectingLinkColor: "#2f8e5f",
      clearBackground: "#e8edf3",
    },
  }[themeMode];

  LiteGraph.NODE_DEFAULT_COLOR = theme.nodeColor;
  LiteGraph.NODE_DEFAULT_BGCOLOR = theme.nodeBgColor;
  LiteGraph.NODE_DEFAULT_BOXCOLOR = theme.nodeBoxColor;
  LiteGraph.LINK_COLOR = theme.linkColor;
  LiteGraph.EVENT_LINK_COLOR = theme.eventLinkColor;
  LiteGraph.CONNECTING_LINK_COLOR = theme.connectingLinkColor;

  if (graphCanvas) {
    graphCanvas.default_link_color = theme.linkColor;
    graphCanvas.clear_background_color = theme.clearBackground;
    graphCanvas.background_image = "";
    graphCanvas.render_shadows = false;
    graphCanvas.highquality_render = false;
    graphCanvas.use_gradients = false;
    graphCanvas.setDirty(true, true);
  }
}

function GraphEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<GraphRuntime | null>(null);
  const graphCanvasRef = useRef<GraphCanvasRuntime | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveIntervalRef = useRef<number | null>(null);
  const previewWidthBounds = getPreviewWidthBounds();
  const [previewWidthValue, setPreviewWidthValue] = useState(getPreviewWidth());
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "mid" || raw === "dark" ? raw : "dark";
  });
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
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    try {
      const serialized = graph.serialize() as SerializedGraph;
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

    const node = LiteGraph.createNode(type) as GraphNodeInstance | null;
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
    persistGraph("Graph saved to localStorage.");
  };

  const loadGraphFromData = (serializedGraph: SerializedGraph, message: string) => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    graph.stop();
    graph.clear();
    graph.configure(serializedGraph);
    graph.start(getAdaptiveGraphTickMs(graph._nodes?.length ?? 0));
    refreshCanvas();
    persistGraph(message);
  };

  const loadGraph = () => {
    const rawGraph = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!rawGraph) {
      setStatusMessage("No saved graph found in localStorage.");
      return;
    }

    try {
      loadGraphFromData(JSON.parse(rawGraph) as SerializedGraph, "Saved graph loaded.");
    } catch {
      setStatusMessage("Saved graph is not valid JSON.");
    }
  };

  const exportGraph = () => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    const blob = new Blob([JSON.stringify(graph.serialize(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plotterfun-graph.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Graph JSON exported.");
  };

  const importGraph = () => {
    importInputRef.current?.click();
  };

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
    document.documentElement.setAttribute("data-theme", themeMode);
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    applyBlueprintTheme(themeMode, graphCanvasRef.current);
  }, [themeMode]);

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
    applyBlueprintTheme(themeMode, runtimeCanvas);
    runtimeGraph.onGraphStateChange = undefined;
    runtimeGraph.onNodeAdded = undefined;
    runtimeGraph.onNodeRemoved = undefined;
    runtimeGraph.onConnectionChange = undefined;
    runtimeCanvas.onNodeMoved = undefined;

    const savedGraph = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (savedGraph) {
      try {
        graph.configure(JSON.parse(savedGraph) as SerializedGraph);
        setStatusMessage("Saved graph restored from localStorage.");
      } catch {
        createDefaultGraph(graph);
        persistGraph("Saved graph was invalid. Default graph restored.");
      }
    } else {
      createDefaultGraph(graph);
      persistGraph();
    }

    const resizeCanvas = () => {
      const parent = canvasElement.parentElement;
      const width = parent?.clientWidth ?? window.innerWidth;
      const height = parent?.clientHeight ?? window.innerHeight;
      canvasElement.width = width;
      canvasElement.height = height;
      graphCanvas.resize(width, height);
      graphCanvas.setDirty(true, true);
    };

    resizeCanvas();
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
      graph.stop();
      graph.clear();
      graphCanvas.setGraph(null);
      graphRef.current = null;
      graphCanvasRef.current = null;
    };
  }, []);

  return (
    <section className={`editor-panel${isToolbarCollapsed ? " toolbar-collapsed" : ""}`}>
      <GraphToolbar
        onAddNode={addNode}
        onExportGraph={exportGraph}
        onFitView={fitView}
        onImportGraph={importGraph}
        onLoadGraph={loadGraph}
        onPreviewWidthChange={updatePreviewWidth}
        onResetGraph={() => resetGraph()}
        onSaveGraph={saveGraph}
        previewWidth={previewWidthValue}
        previewWidthMax={previewWidthBounds.max}
        previewWidthMin={previewWidthBounds.min}
        statusMessage={statusMessage}
        onCollapseChange={setIsToolbarCollapsed}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
      />
      <canvas className="editor-stage" ref={canvasRef} />
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
