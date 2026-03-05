export interface NodePaletteItem {
  type: string;
  category: "io" | "basic" | "focus" | "colors" | "art" | "ai" | "svg";
  glyph: string;
  shortLabel: string;
  tooltip: string;
}

export const nodePalette: NodePaletteItem[] = [
  { type: "input/image", category: "io", glyph: "IN", shortLabel: "Image", tooltip: "INPUT: carica o trascina un'immagine." },
  { type: "input/webcam", category: "io", glyph: "CAM", shortLabel: "Webcam", tooltip: "WEBCAM: mostra il live video e cattura con Grab." },
  { type: "tools/colors/invert", category: "colors", glyph: "INV", shortLabel: "Invert", tooltip: "INVERT: inverte i colori dell'immagine." },
  { type: "tools/colors/grayscale", category: "colors", glyph: "GRY", shortLabel: "Gray", tooltip: "GRAYSCALE: converte l'immagine in scala di grigi." },
  { type: "tools/colors/threshold", category: "colors", glyph: "THR", shortLabel: "Thresh", tooltip: "THRESHOLD: binarizza l'immagine con una soglia." },
  { type: "tools/colors/histogram", category: "colors", glyph: "HST", shortLabel: "Hist", tooltip: "HISTOGRAM: mostra istogramma dell'immagine con modalita RGB, HSV o scala di grigi." },
  { type: "tools/colors/levels", category: "colors", glyph: "LVL", shortLabel: "Levels", tooltip: "LEVELS: regola livelli con controlli in/out e gamma su RGB, HSV, Gray o Alpha." },
  { type: "tools/focus/blur", category: "focus", glyph: "BLR", shortLabel: "Blur", tooltip: "BLUR: sfoca l'immagine in ingresso." },
  { type: "tools/focus/sharpen", category: "focus", glyph: "SHP", shortLabel: "Sharpen", tooltip: "SHARPEN: aumenta nitidezza con preset e amount." },
  { type: "tools/focus/sobel", category: "focus", glyph: "SBL", shortLabel: "Sobel", tooltip: "SOBEL: edge detection con modalita magnitude/horizontal/vertical/threshold." },
  { type: "tools/basic/rotatePanZoom", category: "basic", glyph: "RPZ", shortLabel: "RPZ", tooltip: "ROTATE PAN ZOOM: ruota, zooma e croppa con pan sliders e bird-eye della zona di crop." },
  { type: "tools/basic/scale", category: "basic", glyph: "SCL", shortLabel: "Scale", tooltip: "SCALE: ridimensiona l'immagine in percentuale." },
  { type: "tools/basic/rotate", category: "basic", glyph: "ROT", shortLabel: "Rotate", tooltip: "ROTATE: ruota l'immagine dell'angolo impostato." },
  { type: "tools/colors/brightness-contrast", category: "colors", glyph: "B/C", shortLabel: "Bri/Con", tooltip: "BRIGHTNESS/CONTRAST: regola luminosita e contrasto." },
  { type: "tools/colors/rgb-split", category: "colors", glyph: "RGB", shortLabel: "RGB Split", tooltip: "RGB SPLIT: separa l'immagine in 3 uscite (R,G,B)." },
  { type: "tools/colors/cmyk-split", category: "colors", glyph: "CMYK", shortLabel: "CMYK Split", tooltip: "CMYK SPLIT: separa l'immagine in 4 uscite (C,M,Y,K)." },
  { type: "tools/colors/rgb-combine", category: "colors", glyph: "RGB+", shortLabel: "RGB Join", tooltip: "RGB COMBINE: ricompone immagine colore da 3 canali R,G,B." },
  { type: "tools/colors/cmyk-combine", category: "colors", glyph: "CMY+", shortLabel: "CMYK Join", tooltip: "CMYK COMBINE: ricompone immagine colore da 4 canali C,M,Y,K." },
  { type: "tools/colors/quantize", category: "colors", glyph: "QNT", shortLabel: "Quant", tooltip: "QUANTIZE: riduce la palette con PnnQuant, con output immagine e palette." },
  { type: "tools/colors/blend", category: "colors", glyph: "B2", shortLabel: "Blend", tooltip: "BLEND: miscela due immagini con modalita, alpha, offset e scala." },
  { type: "tools/colors/layers", category: "colors", glyph: "LYR", shortLabel: "Layers", tooltip: "LAYERS: blend in stack di N immagini con alpha e blend mode per layer." },
  { type: "tools/art/oil", category: "art", glyph: "OIL", shortLabel: "Oil", tooltip: "OIL: effetto pittura a olio con parametri radius e intensity." },
  { type: "tools/art/vectorize", category: "art", glyph: "SVG", shortLabel: "Vector", tooltip: "VECTORIZE: vettorizza l'immagine con ImageTracer e produce raster+SVG." },
  { type: "tools/art/marching", category: "art", glyph: "ISO", shortLabel: "Marching", tooltip: "MARCHING: estrae superfici di livello dall'immagine (output raster + SVG) con preset Fast/Quality." },
  { type: "tools/art/boldini", category: "art", glyph: "BOL", shortLabel: "Boldini", tooltip: "BOLDINI: pittura stilizzata a pennellate multi-layer (base/intermedie/dettagli) da immagine input." },
  { type: "tools/art/seargeant", category: "art", glyph: "SRG", shortLabel: "Searg", tooltip: "SEARGEANT: pittura a blocchi e piani con pennellata rettangolare + luci speculari (stile Sargent)." },
  { type: "tools/art/carboncino", category: "art", glyph: "CRB", shortLabel: "Carbon", tooltip: "CARBONCINO: disegno a tratti e scumble in 3 passate con controlli upscale/densita/pressione." },
  { type: "tools/art/crosshatch-bn", category: "art", glyph: "XHB", shortLabel: "XH BN", tooltip: "CROSSHATCH BN: line art b/n multi-angolo (0-90) con output raster + SVG." },
  { type: "tools/art/matita", category: "art", glyph: "MAT", shortLabel: "Matita", tooltip: "MATITA: single-line painter ottimizzato con passate, semplificazione RDP e output raster + SVG." },
  { type: "tools/svg/rough", category: "svg", glyph: "RFX", shortLabel: "Rough", tooltip: "ROUGH: applica stile rough a un SVG in ingresso e produce un nuovo SVG." },
  { type: "tools/svg/svg-simplify", category: "svg", glyph: "SMP", shortLabel: "Simplify", tooltip: "SVG SIMPLIFY: semplifica path e minifica SVG riducendo il peso mantenendo i colori." },
  { type: "tools/ai/bg-remove", category: "ai", glyph: "BGR", shortLabel: "BG Remove", tooltip: "BG REMOVE: rimuove lo sfondo con segmentazione persona AI (stile MediaPipe/selfie segmentation)." },
  { type: "tools/ai/pose-detect", category: "ai", glyph: "POS", shortLabel: "Pose", tooltip: "POSE DETECT: rilevamento posa persona con box testa/torso/arti/collo/piedi (stile MoveNet tfjs)." },
  { type: "tools/ai/face-landmarker", category: "ai", glyph: "FLC", shortLabel: "Face LM", tooltip: "FACE LANDMARKER: rileva mesh, occhi, labbra, iridi e blendshapes del volto (MediaPipe)." },
  { type: "tools/ai/ml5-extract", category: "ai", glyph: "ML5", shortLabel: "ML5", tooltip: "ML5 EXTRACT: estrae bodypose/handpose/facemesh/imageclassifier (se disponibile) da un'immagine." },
  { type: "output/image", category: "io", glyph: "OUT", shortLabel: "Output", tooltip: "OUTPUT: mostra il risultato finale e permette il download." },
  { type: "output/palette", category: "colors", glyph: "PAL", shortLabel: "Palette", tooltip: "PALETTE: visualizza e salva i colori in ingresso." },
  { type: "output/svg", category: "io", glyph: "S/O", shortLabel: "SVG Out", tooltip: "SVG OUTPUT: mostra un SVG in input e permette il download." },
  { type: "output/ml5", category: "io", glyph: "J/O", shortLabel: "JSON Out", tooltip: "JSON OUTPUT: mostra i dati in formato JSON e permette il download." },
];
