import { useMemo, useState, useSyncExternalStore } from "react";
import { buildNodePaletteCategories, editCommands, fileCommands, graphLayoutOptions, GRAPH_LAYOUT_SPACING } from "../../models/editorChrome";
import type { EditorCommandId, GraphLayoutMode } from "../../models/editorChrome";
import { nodePalette } from "../../models/nodePalette";
import EditorMenu from "./EditorMenu";
import { getGraphProgressSnapshot, subscribeGraphProgress } from "../../models/graphProgress";

interface TopBarProps {
  onAddNode: (type: string) => void;
  onCommand: (command: EditorCommandId) => void;
  onLayout: (mode: GraphLayoutMode) => void;
  layoutSpacing: number;
  onLayoutSpacingChange: (spacing: number) => void;
  workImageSize: number;
  workImageSizeMin: number;
  workImageSizeMax: number;
  workImageSizeStep: number;
  onWorkImageSizeChange: (size: number) => void;
  onTogglePalette: () => void;
  paletteOpen: boolean;
  statusMessage: string;
  projectName: string;
}

export default function TopBar(props: TopBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const categories = useMemo(() => buildNodePaletteCategories(nodePalette), []);
  const graphProgress = useSyncExternalStore(subscribeGraphProgress, getGraphProgressSnapshot, getGraphProgressSnapshot);
  const formatMetricDuration = (milliseconds: number) => milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(milliseconds >= 10_000 ? 1 : 2)} s`
    : `${milliseconds.toFixed(milliseconds >= 100 ? 0 : 1)} ms`;
  const commandMenu = (commands: typeof fileCommands) => commands.map((command) => (
    <button
      className={`editor-menu-item${command.danger ? " danger" : ""}`}
      key={command.id}
      onClick={() => { props.onCommand(command.id); setOpenMenu(null); }}
      role="menuitem"
      type="button"
    >
      <span>{command.label}</span><kbd>{command.shortcut ?? ""}</kbd>
    </button>
  ));

  return (
    <header className="editor-topbar">
      <div className="topbar-brand" aria-label="Plotterfun">PLOTTER<span>FUN</span><strong>{props.projectName}</strong></div>
      <nav aria-label="Menu editor" className="topbar-navigation">
        <EditorMenu label="File" open={openMenu === "file"} onOpenChange={(open) => setOpenMenu(open ? "file" : null)}>
          {commandMenu(fileCommands)}
        </EditorMenu>
        <EditorMenu label="Edit" open={openMenu === "edit"} onOpenChange={(open) => setOpenMenu(open ? "edit" : null)}>
          {commandMenu(editCommands)}
          <div className="editor-menu-separator" />
          <div className="work-image-size-control">
            <label htmlFor="work-image-size">Dimensione immagine di lavoro</label>
            <div>
              <input
                id="work-image-size"
                max={props.workImageSizeMax}
                min={props.workImageSizeMin}
                onChange={(event) => props.onWorkImageSizeChange(Number(event.target.value))}
                step={props.workImageSizeStep}
                type="range"
                value={props.workImageSize}
              />
              <input
                aria-label="Dimensione immagine di lavoro in pixel"
                className="work-image-size-number"
                max={props.workImageSizeMax}
                min={props.workImageSizeMin}
                onChange={(event) => props.onWorkImageSizeChange(Number(event.target.value))}
                step={props.workImageSizeStep}
                type="number"
                value={props.workImageSize}
              />
              <span>px</span>
            </div>
            <small>Da 128 a 1024, multipli di 16</small>
          </div>
          <div className="editor-menu-separator" />
          <div className="editor-submenu">
            <button className="editor-menu-item submenu-trigger" role="menuitem" type="button">
              <span>Riorganizza nodi</span><span aria-hidden="true">›</span>
            </button>
            <div className="editor-submenu-popover layout-submenu" role="menu">
              <div className="layout-spacing-control">
                <label htmlFor="layout-spacing">Spaziatura tra nodi</label>
                <div>
                  <input
                    id="layout-spacing"
                    max={GRAPH_LAYOUT_SPACING.max}
                    min={GRAPH_LAYOUT_SPACING.min}
                    onChange={(event) => props.onLayoutSpacingChange(Number(event.target.value))}
                    step={GRAPH_LAYOUT_SPACING.step}
                    type="range"
                    value={props.layoutSpacing}
                  />
                  <input
                    aria-label="Spaziatura in pixel"
                    className="layout-spacing-number"
                    max={GRAPH_LAYOUT_SPACING.max}
                    min={GRAPH_LAYOUT_SPACING.min}
                    onChange={(event) => props.onLayoutSpacingChange(Number(event.target.value))}
                    step={GRAPH_LAYOUT_SPACING.step}
                    type="number"
                    value={props.layoutSpacing}
                  />
                  <span>px</span>
                </div>
              </div>
              <div className="editor-menu-separator" />
              {graphLayoutOptions.map((layout) => (
                <button
                  className="editor-menu-item layout-menu-item"
                  key={layout.id}
                  onClick={() => { props.onLayout(layout.id); setOpenMenu(null); }}
                  role="menuitem"
                  title={layout.description}
                  type="button"
                >
                  <span><strong>{layout.label}</strong><small>{layout.description}</small></span>
                  {layout.native && <span className="native-badge">LiteGraph</span>}
                </button>
              ))}
            </div>
          </div>
        </EditorMenu>
        <EditorMenu label="Palette" open={openMenu === "palette"} onOpenChange={(open) => setOpenMenu(open ? "palette" : null)}>
          <button className="editor-menu-item" onClick={props.onTogglePalette} role="menuitem" type="button">
            <span>{props.paletteOpen ? "Nascondi palette laterale" : "Mostra palette laterale"}</span>
          </button>
          <div className="editor-menu-separator" />
          {categories.map((category) => (
            <div className="editor-submenu" key={category.id}>
              <button className="editor-menu-item submenu-trigger" role="menuitem" type="button">
                <span>{category.label}</span><span aria-hidden="true">›</span>
              </button>
              <div className="editor-submenu-popover" role="menu">
                {category.nodes.map((node) => (
                  <button className="editor-menu-item" key={node.type} onClick={() => { props.onAddNode(node.type); setOpenMenu(null); }} role="menuitem" type="button">
                    <span>{node.shortLabel}</span><span className="menu-glyph">{node.glyph}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </EditorMenu>
      </nav>
      <p className="topbar-status" title={props.statusMessage}>{props.statusMessage}</p>
      {graphProgress.totalNodes > 0 && (
        <div className={`topbar-progress-summary ${graphProgress.status}`} aria-live="polite" tabIndex={0}>
          <span>
            {graphProgress.runningNodes > 0
              ? `${graphProgress.runningNodes} in lavorazione · ${Math.round(graphProgress.progress * 100)}%`
              : `${Math.round(graphProgress.progress * 100)}%`}
          </span>
          {graphProgress.slowestNode && (
            <span className="topbar-slowest">
              lento: {graphProgress.slowestNode.label} · {formatMetricDuration(graphProgress.slowestNode.elapsedMs)}
            </span>
          )}
          {graphProgress.nodes.length > 0 && (
            <div className="topbar-metrics-popover" role="tooltip">
              <strong>Tempi dei nodi</strong>
              <div className="topbar-metrics-list">
                {graphProgress.nodes.map((node, index) => (
                  <div className={index === 0 ? "slowest" : ""} key={node.key}>
                    <span>{node.label}</span>
                    <time>{formatMetricDuration(node.elapsedMs)}</time>
                    <small>{node.status}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div aria-hidden="true" className={`topbar-progress-track ${graphProgress.status}`}>
        <span style={{ transform: `scaleX(${graphProgress.progress})` }} />
      </div>
    </header>
  );
}
