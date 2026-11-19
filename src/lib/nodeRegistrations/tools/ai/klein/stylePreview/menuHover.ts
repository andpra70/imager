import { KLEIN_STYLE_PRESETS } from "../model";
import { getKleinStylePreview } from "./cache";

const PREVIEW_SIZE = 128;
const POINTER_OFFSET = 20;
const stylesByLabel = new Map(KLEIN_STYLE_PRESETS.map((style) => [style.label, style.id]));

function menuEntry(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(".litecontextmenu .litemenu-entry") : null;
}

export function installKleinStyleMenuPreview() {
  const overlay = document.createElement("canvas");
  overlay.width = PREVIEW_SIZE;
  overlay.height = PREVIEW_SIZE;
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    display: "none",
    width: `${PREVIEW_SIZE}px`,
    height: `${PREVIEW_SIZE}px`,
    pointerEvents: "none",
    zIndex: "2147483647",
    border: "2px solid rgba(255,255,255,.9)",
    borderRadius: "4px",
    background: "#111318",
    boxShadow: "0 8px 24px rgba(0,0,0,.75)",
  });
  document.body.appendChild(overlay);
  const context = overlay.getContext("2d");
  let activeEntry: HTMLElement | null = null;

  const hide = () => { activeEntry = null; overlay.style.display = "none"; };
  const position = (event: PointerEvent) => {
    const left = event.clientX + POINTER_OFFSET;
    const top = Math.min(window.innerHeight - PREVIEW_SIZE - 8, Math.max(8, event.clientY - PREVIEW_SIZE / 2));
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
  };
  const show = (event: PointerEvent, entry: HTMLElement) => {
    const styleId = stylesByLabel.get(entry.textContent?.trim() ?? "");
    const preview = styleId ? getKleinStylePreview(styleId) : null;
    if (!preview || !context) { hide(); return; }
    activeEntry = entry;
    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    context.drawImage(preview.thumbnail, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    position(event);
    overlay.style.display = "block";
  };
  const onPointerOver = (event: PointerEvent) => {
    const entry = menuEntry(event.target);
    if (entry) show(event, entry); else hide();
  };
  const onPointerMove = (event: PointerEvent) => {
    const entry = menuEntry(event.target);
    if (!entry) { hide(); return; }
    if (entry !== activeEntry) show(event, entry);
    else if (overlay.style.display !== "none") position(event);
  };
  const onPointerOut = (event: PointerEvent) => {
    if (!menuEntry(event.relatedTarget)) hide();
  };

  document.addEventListener("pointerover", onPointerOver, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerout", onPointerOut, true);
  return () => {
    document.removeEventListener("pointerover", onPointerOver, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerout", onPointerOut, true);
    overlay.remove();
  };
}
