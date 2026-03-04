import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { nodePalette } from "../models/nodePalette";

interface GraphToolbarProps {
  onAddNode: (type: string) => void;
  onResetGraph: () => void;
  onSaveGraph: () => void;
  onLoadGraph: () => void;
  onExportGraph: () => void;
  onImportGraph: () => void;
  onFitView: () => void;
  onPreviewWidthChange: (width: number) => void;
  previewWidth: number;
  previewWidthMax: number;
  previewWidthMin: number;
  statusMessage: string;
}

interface ToolbarPosition {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

function GraphToolbar({
  onAddNode,
  onResetGraph,
  onSaveGraph,
  onLoadGraph,
  onExportGraph,
  onImportGraph,
  onFitView,
  onPreviewWidthChange,
  previewWidth,
  previewWidthMax,
  previewWidthMin,
  statusMessage,
}: GraphToolbarProps) {
  const [position, setPosition] = useState<ToolbarPosition>({ x: 14, y: 14 });
  const dragStateRef = useRef<DragState | null>(null);
  const actionButtons = [
    {
      glyph: "SV",
      shortLabel: "Save",
      tooltip: "Salva il grafo in localStorage.",
      onClick: onSaveGraph,
    },
    {
      glyph: "LD",
      shortLabel: "Load",
      tooltip: "Carica il grafo salvato da localStorage.",
      onClick: onLoadGraph,
    },
    {
      glyph: "EX",
      shortLabel: "Export",
      tooltip: "Esporta il grafo come file JSON.",
      onClick: onExportGraph,
    },
    {
      glyph: "IM",
      shortLabel: "Import",
      tooltip: "Importa un grafo da file JSON.",
      onClick: onImportGraph,
    },
    {
      glyph: "FT",
      shortLabel: "Fit",
      tooltip: "Centra e adatta la vista per mostrare tutto il blueprint.",
      onClick: onFitView,
    },
    {
      glyph: "RS",
      shortLabel: "Reset",
      tooltip: "Ripristina il grafo iniziale.",
      onClick: onResetGraph,
      danger: true,
    },
  ];

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = event.currentTarget.closest(".toolbar") as HTMLDivElement | null;
    if (!panel) {
      return;
    }
    const panelRect = panel.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const updateDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const nextX = Math.max(0, event.clientX - dragState.offsetX);
    const nextY = Math.max(0, event.clientY - dragState.offsetY);
    setPosition({ x: nextX, y: nextY });
    event.preventDefault();
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="toolbar"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <div
        className="toolbar-header"
        onPointerDown={startDrag}
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="toolbar-title">Tools</span>
        <span className="toolbar-drag-hint">drag</span>
      </div>

      <div className="toolbar-group tool-grid">
        {nodePalette.map((item) => (
          <button
            aria-label={item.tooltip}
            className="toolbar-icon-button"
            data-tooltip={item.tooltip}
            key={item.type}
            onClick={() => onAddNode(item.type)}
            title={item.tooltip}
            type="button"
          >
            <span aria-hidden="true" className="toolbar-glyph">
              {item.glyph}
            </span>
            <span className="toolbar-text">{item.shortLabel}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-group action-grid">
        {actionButtons.map((item) => (
          <button
            aria-label={item.tooltip}
            className={`toolbar-icon-button${item.danger ? " danger" : ""}`}
            data-tooltip={item.tooltip}
            key={item.glyph}
            onClick={item.onClick}
            title={item.tooltip}
            type="button"
          >
            <span aria-hidden="true" className="toolbar-glyph">
              {item.glyph}
            </span>
            <span className="toolbar-text">{item.shortLabel}</span>
          </button>
        ))}
      </div>
      <label className="toolbar-setting">
        <span className="toolbar-setting-label" title="Larghezza preview dei nodi">
          W
        </span>
        <input
          className="toolbar-input"
          max={previewWidthMax}
          min={previewWidthMin}
          onChange={(event) => onPreviewWidthChange(Number(event.target.value))}
          step={10}
          title="Larghezza preview dei nodi"
          type="number"
          value={previewWidth}
        />
      </label>
      <p className="toolbar-status">{statusMessage}</p>
    </div>
  );
}

export default GraphToolbar;
