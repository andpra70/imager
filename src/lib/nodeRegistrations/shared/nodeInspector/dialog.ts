const STYLE_ID = "plotterfun-node-inspector-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .node-inspector-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:24px}
    .node-inspector-dialog{width:min(760px,94vw);max-height:88vh;background:#202124;color:#eee;border:1px solid #555;border-radius:10px;box-shadow:0 18px 70px #000;padding:16px;display:flex;flex-direction:column;gap:12px}
    .node-inspector-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.node-inspector-header h2{font:600 16px sans-serif;margin:0}
    .node-inspector-text{width:100%;min-height:360px;resize:vertical;box-sizing:border-box;background:#111;color:#d8e6f3;border:1px solid #4d5358;border-radius:6px;padding:12px;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre}
    .node-inspector-actions{display:flex;justify-content:flex-end;gap:8px}.node-inspector-button{border:1px solid #646b72;border-radius:5px;background:#34383d;color:#fff;padding:7px 12px;cursor:pointer}.node-inspector-button:hover{background:#454b52}
  `;
  document.head.appendChild(style);
}

export function showInspectorDialog(title: string, content: string, copyEnabled: boolean) {
  installStyles();
  const backdrop = document.createElement("div");
  backdrop.className = "node-inspector-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  const dialog = document.createElement("section"); dialog.className = "node-inspector-dialog";
  const header = document.createElement("div"); header.className = "node-inspector-header";
  const heading = document.createElement("h2"); heading.textContent = title;
  const close = document.createElement("button"); close.className = "node-inspector-button"; close.textContent = "Chiudi";
  const textarea = document.createElement("textarea"); textarea.className = "node-inspector-text"; textarea.readOnly = true; textarea.value = content;
  const actions = document.createElement("div"); actions.className = "node-inspector-actions";
  const dismiss = () => backdrop.remove(); close.onclick = dismiss;
  backdrop.addEventListener("pointerdown", event => { if (event.target === backdrop) dismiss(); });
  document.addEventListener("keydown", function escape(event) { if (event.key === "Escape") { dismiss(); document.removeEventListener("keydown", escape); } });
  if (copyEnabled) {
    const copy = document.createElement("button"); copy.className = "node-inspector-button"; copy.textContent = "Copia";
    copy.onclick = async () => { try { await navigator.clipboard.writeText(textarea.value); copy.textContent = "Copiato"; } catch { textarea.focus(); textarea.select(); document.execCommand("copy"); copy.textContent = "Copiato"; } };
    actions.append(copy);
  }
  actions.append(close); header.append(heading, close); dialog.append(header, textarea, actions); backdrop.append(dialog); document.body.append(backdrop); textarea.focus();
}
