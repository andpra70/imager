export interface NodePaletteItem {
  type: string;
  glyph: string;
  shortLabel: string;
  tooltip: string;
}

export const nodePalette: NodePaletteItem[] = [
  { type: "input/image", glyph: "IN", shortLabel: "Image", tooltip: "INPUT: carica o trascina un'immagine." },
  { type: "input/webcam", glyph: "CAM", shortLabel: "Webcam", tooltip: "WEBCAM: mostra il live video e cattura con Grab." },
  { type: "tools/invert", glyph: "INV", shortLabel: "Invert", tooltip: "INVERT: inverte i colori dell'immagine." },
  { type: "tools/grayscale", glyph: "GRY", shortLabel: "Gray", tooltip: "GRAYSCALE: converte l'immagine in scala di grigi." },
  { type: "tools/threshold", glyph: "THR", shortLabel: "Thresh", tooltip: "THRESHOLD: binarizza l'immagine con una soglia." },
  { type: "tools/blur", glyph: "BLR", shortLabel: "Blur", tooltip: "BLUR: sfoca l'immagine in ingresso." },
  { type: "tools/quantize", glyph: "QNT", shortLabel: "Quant", tooltip: "QUANTIZE: riduce la palette con PnnQuant, con output immagine e palette." },
  { type: "tools/blend", glyph: "B2", shortLabel: "Blend", tooltip: "BLEND: miscela due immagini con modalita, alpha, offset e scala." },
  { type: "tools/vectorize", glyph: "SVG", shortLabel: "Vector", tooltip: "VECTORIZE: vettorizza l'immagine con ImageTracer e produce raster+SVG." },
  { type: "output/image", glyph: "OUT", shortLabel: "Output", tooltip: "OUTPUT: mostra il risultato finale e permette il download." },
  { type: "output/palette", glyph: "PAL", shortLabel: "Palette", tooltip: "PALETTE: visualizza e salva i colori in ingresso." },
  { type: "output/svg", glyph: "S/O", shortLabel: "SVG Out", tooltip: "SVG OUTPUT: mostra un SVG in input e permette il download." },
];
