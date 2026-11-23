import { useEffect, useState } from "react";
import type { GraphProjectSummary } from "../../models/graphProject";

interface GraphProjectPickerProps {
  currentProjectName: string;
  projects: GraphProjectSummary[];
  onCancel: () => void;
  onLoad: (name: string) => void;
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "Data non disponibile";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data non disponibile";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function GraphProjectPicker({ currentProjectName, projects, onCancel, onLoad }: GraphProjectPickerProps) {
  const initialSelection = projects.some((project) => project.name === currentProjectName)
    ? currentProjectName
    : projects[0]?.name ?? "";
  const [selectedName, setSelectedName] = useState(initialSelection);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div className="project-picker-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section aria-labelledby="project-picker-title" aria-modal="true" className="project-picker" role="dialog">
        <header>
          <div>
            <h2 id="project-picker-title">Carica grafo</h2>
            <p>Scegli uno dei grafi salvati in questo browser.</p>
          </div>
          <button aria-label="Chiudi" className="project-picker-close" onClick={onCancel} type="button">×</button>
        </header>

        {projects.length > 0 ? (
          <div className="project-picker-list" role="radiogroup" aria-label="Grafi disponibili">
            {projects.map((project) => (
              <button
                aria-checked={selectedName === project.name}
                className={`project-picker-option${selectedName === project.name ? " selected" : ""}`}
                key={project.name}
                onClick={() => setSelectedName(project.name)}
                onDoubleClick={() => onLoad(project.name)}
                role="radio"
                type="button"
              >
                <span className="project-picker-radio" aria-hidden="true" />
                <span><strong>{project.name}</strong><small>Modificato: {formatUpdatedAt(project.updatedAt)}</small></span>
              </button>
            ))}
          </div>
        ) : (
          <p className="project-picker-empty">Non ci sono ancora grafi salvati.</p>
        )}

        <footer>
          <button className="project-picker-secondary" onClick={onCancel} type="button">Annulla</button>
          <button className="project-picker-primary" disabled={!selectedName} onClick={() => onLoad(selectedName)} type="button">
            Carica selezionato
          </button>
        </footer>
      </section>
    </div>
  );
}
