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

interface GraphNodeInstance {
  pos: [number, number];
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

function GraphEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<GraphRuntime | null>(null);
  const graphCanvasRef = useRef<GraphCanvasRuntime | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const previewWidthBounds = getPreviewWidthBounds();
  const [previewWidthValue, setPreviewWidthValue] = useState(getPreviewWidth());
  const [statusMessage, setStatusMessage] = useState(
    "Create nodes from the toolbar or from the LiteGraph context menu.",
  );

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

  const scheduleAutoSave = () => {
    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      persistGraph();
      autoSaveTimeoutRef.current = null;
    }, 200);
  };

  const resetGraph = (message = "Default graph restored.") => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    graph.stop();
    graph.clear();
    createDefaultGraph(graph);
    graph.start();
    refreshCanvas();
    persistGraph(message);
  };

  const addNode = (type: string) => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    const node = LiteGraph.createNode(type) as GraphNodeInstance | null;
    if (!node) {
      setStatusMessage(`Cannot create node ${type}.`);
      return;
    }

    const nodeCount = graph._nodes?.length ?? 0;
    node.pos = [120 + (nodeCount % 4) * 70, 120 + nodeCount * 56];
    graph.add(node);
    node.refreshPreviewLayout?.();
    refreshCanvas();
    persistGraph(`${type} added.`);
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
    graph.start();
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
    runtimeGraph.onGraphStateChange = scheduleAutoSave;
    runtimeGraph.onNodeAdded = scheduleAutoSave;
    runtimeGraph.onNodeRemoved = scheduleAutoSave;
    runtimeGraph.onConnectionChange = scheduleAutoSave;
    runtimeCanvas.onNodeMoved = scheduleAutoSave;

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
    graph.start();

    return () => {
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
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
    <section className="editor-panel">
      <GraphToolbar
        onAddNode={addNode}
        onExportGraph={exportGraph}
        onImportGraph={importGraph}
        onLoadGraph={loadGraph}
        onPreviewWidthChange={updatePreviewWidth}
        onResetGraph={() => resetGraph()}
        onSaveGraph={saveGraph}
        previewWidth={previewWidthValue}
        previewWidthMax={previewWidthBounds.max}
        previewWidthMin={previewWidthBounds.min}
        statusMessage={statusMessage}
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
