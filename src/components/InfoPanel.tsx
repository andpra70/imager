function InfoPanel() {
  return (
    <aside className="info-panel">
      <p className="eyebrow">LiteGraph.js</p>
      <h1>Image Node Editor</h1>
      <p className="lead">
        Collega nodi di input, strumenti e output per costruire una pipeline
        visuale di immagini.
      </p>
      <ul className="info-list">
        <li>`INPUT`: carica un file immagine dal disco.</li>
        <li>`WEBCAM`: cattura un frame con il pulsante grab.</li>
        <li>`TOOLS / Invert`: inverte i colori dell&apos;immagine in ingresso.</li>
        <li>`OUTPUT`: mostra il risultato finale e consente il download.</li>
      </ul>
      <p className="hint">
        Suggerimento: crea i nodi dal menu contestuale con click destro nel
        canvas.
      </p>
    </aside>
  );
}

export default InfoPanel;
