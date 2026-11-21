import { useMemo, useState } from "react";
import { buildNodePaletteCategories } from "../../models/editorChrome";
import { nodePalette } from "../../models/nodePalette";

interface NodePaletteSidebarProps {
  getNodePreview: (type: string) => string | null;
  onAddNode: (type: string) => void;
  onClose: () => void;
}

export default function NodePaletteSidebar({ getNodePreview, onAddNode, onClose }: NodePaletteSidebarProps) {
  const categories = useMemo(() => buildNodePaletteCategories(nodePalette), []);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id);
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const active = categories.find((category) => category.id === activeCategory) ?? categories[0];
  const hovered = nodePalette.find((node) => node.type === hoveredType) ?? null;
  const preview = hovered ? getNodePreview(hovered.type) : null;

  return (
    <aside aria-label="Palette nodi" className="node-palette-sidebar">
      <div className="palette-header">
        <div><span className="palette-kicker">LIBRERIA</span><h2>Nodi</h2></div>
        <button aria-label="Chiudi palette" className="palette-close" onClick={onClose} type="button">×</button>
      </div>
      <div className="palette-categories" role="tablist">
        {categories.map((category) => (
          <button aria-selected={active?.id === category.id} className={active?.id === category.id ? "active" : ""} key={category.id} onClick={() => setActiveCategory(category.id)} role="tab" type="button">
            {category.label}<span>{category.nodes.length}</span>
          </button>
        ))}
      </div>
      <div className="palette-node-list">
        <h3>{active?.label}</h3>
        {active?.nodes.map((node) => (
          <button className="palette-node" key={node.type} onClick={() => onAddNode(node.type)} onFocus={() => setHoveredType(node.type)} onMouseEnter={() => setHoveredType(node.type)} type="button">
            <span className="palette-node-glyph">{node.glyph}</span>
            <span><strong>{node.shortLabel}</strong><small>{node.type}</small></span>
            <span className="palette-node-add">+</span>
          </button>
        ))}
      </div>
      {hovered && (
        <div className="palette-preview" role="status">
          <div className="palette-preview-image">
            {preview ? <img alt={`Ultima preview di ${hovered.shortLabel}`} src={preview} /> : <span>{hovered.glyph}</span>}
          </div>
          <strong>{hovered.shortLabel}</strong>
          <p>{preview ? "Ultima miniatura in cache" : hovered.tooltip}</p>
        </div>
      )}
    </aside>
  );
}
