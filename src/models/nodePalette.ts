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
  { type: "tools/scale", glyph: "SCL", shortLabel: "Scale", tooltip: "SCALE: ridimensiona l'immagine in percentuale." },
  { type: "tools/rotate", glyph: "ROT", shortLabel: "Rotate", tooltip: "ROTATE: ruota l'immagine dell'angolo impostato." },
  { type: "tools/brightness-contrast", glyph: "B/C", shortLabel: "Bri/Con", tooltip: "BRIGHTNESS/CONTRAST: regola luminosita e contrasto." },
  { type: "tools/rgb-split", glyph: "RGB", shortLabel: "RGB Split", tooltip: "RGB SPLIT: separa l'immagine in 3 uscite (R,G,B)." },
  { type: "tools/cmyk-split", glyph: "CMYK", shortLabel: "CMYK Split", tooltip: "CMYK SPLIT: separa l'immagine in 4 uscite (C,M,Y,K)." },
  { type: "tools/rgb-combine", glyph: "RGB+", shortLabel: "RGB Join", tooltip: "RGB COMBINE: ricompone immagine colore da 3 canali R,G,B." },
  { type: "tools/cmyk-combine", glyph: "CMY+", shortLabel: "CMYK Join", tooltip: "CMYK COMBINE: ricompone immagine colore da 4 canali C,M,Y,K." },
  { type: "tools/quantize", glyph: "QNT", shortLabel: "Quant", tooltip: "QUANTIZE: riduce la palette con PnnQuant, con output immagine e palette." },
  { type: "tools/blend", glyph: "B2", shortLabel: "Blend", tooltip: "BLEND: miscela due immagini con modalita, alpha, offset e scala." },
  { type: "tools/vectorize", glyph: "SVG", shortLabel: "Vector", tooltip: "VECTORIZE: vettorizza l'immagine con ImageTracer e produce raster+SVG." },
  { type: "tools/marching", glyph: "ISO", shortLabel: "Marching", tooltip: "MARCHING: estrae superfici di livello dall'immagine (output raster + SVG) con preset Fast/Quality." },
  { type: "tools/rough", glyph: "RFX", shortLabel: "Rough", tooltip: "ROUGH: applica stile rough a un SVG in ingresso e produce un nuovo SVG." },
  { type: "tools/svg-simplify", glyph: "SMP", shortLabel: "Simplify", tooltip: "SVG SIMPLIFY: semplifica path e minifica SVG riducendo il peso mantenendo i colori." },
  { type: "tools/bg-remove", glyph: "BGR", shortLabel: "BG Remove", tooltip: "BG REMOVE: rimuove lo sfondo con segmentazione persona AI (stile MediaPipe/selfie segmentation)." },
  { type: "tools/pose-detect", glyph: "POS", shortLabel: "Pose", tooltip: "POSE DETECT: rilevamento posa persona con box testa/torso/arti/collo/piedi (stile MoveNet tfjs)." },
  { type: "tools/face-landmarker", glyph: "FLC", shortLabel: "Face LM", tooltip: "FACE LANDMARKER: rileva mesh, occhi, labbra, iridi e blendshapes del volto (MediaPipe)." },
  { type: "tools/ml5-extract", glyph: "ML5", shortLabel: "ML5", tooltip: "ML5 EXTRACT: estrae bodypose/handpose/facemesh/imageclassifier (se disponibile) da un'immagine." },
  { type: "output/image", glyph: "OUT", shortLabel: "Output", tooltip: "OUTPUT: mostra il risultato finale e permette il download." },
  { type: "output/palette", glyph: "PAL", shortLabel: "Palette", tooltip: "PALETTE: visualizza e salva i colori in ingresso." },
  { type: "output/svg", glyph: "S/O", shortLabel: "SVG Out", tooltip: "SVG OUTPUT: mostra un SVG in input e permette il download." },
  { type: "output/ml5", glyph: "M/O", shortLabel: "ML5 Out", tooltip: "ML5 OUTPUT: mostra il riepilogo dei dati ML5 e permette il download JSON." },
];
