export interface ExportableNodeOutput {
  name?: string;
  type?: unknown;
}

export interface ExportableNode {
  title?: string;
  type?: string;
  outputs?: ExportableNodeOutput[];
  getOutputData(slot: number): unknown;
}

function safeName(value: string) {
  return value.normalize("NFKD").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "node-output";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function stringFormat(name: string, type: string, value: string) {
  const normalized = `${name} ${type}`.toLowerCase();
  if (normalized.includes("svg") || /^\s*<svg[\s>]/i.test(value)) return { extension: "svg", mime: "image/svg+xml" };
  if (normalized.includes("gcode") || /^(?:G|M)\d+/m.test(value)) return { extension: "gcode", mime: "text/x-gcode" };
  if (normalized.includes("json")) return { extension: "json", mime: "application/json" };
  return { extension: "txt", mime: "text/plain" };
}

export function exportNodeOutputs(node: ExportableNode) {
  const baseName = safeName(node.title || node.type || "node-output");
  let exported = 0;
  (node.outputs ?? []).forEach((output, slot) => {
    const value = node.getOutputData(slot);
    if (value === null || value === undefined) return;
    const outputName = safeName(output.name || `output-${slot + 1}`);
    const filename = `${baseName}-${outputName}`;
    if (value instanceof HTMLCanvasElement) {
      value.toBlob((blob) => { if (blob) download(blob, `${filename}.jpg`); }, "image/jpeg", 0.92);
      exported += 1;
      return;
    }
    if (typeof value === "string") {
      const format = stringFormat(String(output.name ?? ""), String(output.type ?? ""), value);
      download(new Blob([value], { type: `${format.mime};charset=utf-8` }), `${filename}.${format.extension}`);
      exported += 1;
      return;
    }
    try {
      download(new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" }), `${filename}.json`);
      exported += 1;
    } catch {
      // Non-serializable runtime outputs are intentionally skipped.
    }
  });
  return exported;
}
