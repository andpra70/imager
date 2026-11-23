import type { GraphImage } from "../../../../../models/graphImage";
import { ADDITIONAL_KLEIN_STYLE_PRESETS } from "./styles/additionalPresets";

export interface KleinCommonOptions {
  baseUrl: string;
  steps: number;
  guidanceScale: number;
  seed: number;
}

export interface KleinTxt2ImgOptions extends KleinCommonOptions {
  prompt: string;
  width: number;
  height: number;
}

export interface KleinImg2ImgOptions extends KleinCommonOptions {
  prompt: string;
  maxSize: number;
}

export interface KleinImg2ImgPromptSettings {
  preserveSource: boolean;
  preservationPrompt: string;
  useStylePreset: boolean;
  stylePrompt: string;
  textPrompt: string;
  promptSuffix: string;
}

export const KLEIN_IMG2IMG_FIDELITY_PROMPT =
  "Usa l'immagine 1 come riferimento principale e conservala con la massima fedelta. " +
  "Mantieni lo stesso soggetto e la sua identita, i lineamenti e le fattezze del volto, " +
  "la posa, l'espressione, le proporzioni, l'inquadratura, la composizione, la prospettiva " +
  "e la disposizione degli elementi. Modifica soltanto lo stile visivo richiesto. " +
  "Non sostituire il soggetto, non alterarne i tratti distintivi e non inventare una nuova posa.";

export function resolveKleinImg2ImgPrompt(settings: KleinImg2ImgPromptSettings) {
  const preservationPrompt = settings.preserveSource
    ? KLEIN_IMG2IMG_FIDELITY_PROMPT
    : settings.preservationPrompt.trim();
  const stylePrompt = settings.stylePrompt.trim();
  const textPrompt = settings.textPrompt.trim();
  const promptSuffix = settings.promptSuffix.trim();
  return [
    preservationPrompt,
    settings.useStylePreset ? stylePrompt : "",
    textPrompt,
    promptSuffix,
  ].filter(Boolean).join(" ");
}

export interface KleinTxt2ImgRequest {
  options: KleinTxt2ImgOptions;
  signal?: AbortSignal;
}

export interface KleinImg2ImgRequest {
  images: readonly GraphImage[];
  options: KleinImg2ImgOptions;
  signal?: AbortSignal;
}

export interface KleinResult {
  image: GraphImage;
}

export interface KleinStylePreset {
  id: string;
  label: string;
  prompt: string;
}

export const KLEIN_DEFAULTS = {
  baseUrl: "/klein-api",
  width: 512,
  height: 512,
  maxSize: 1024,
  steps: 4,
  guidanceScale: 1,
  seed: 42,
} as const;

const faithful = "";

export const KLEIN_STYLE_PRESETS: readonly KleinStylePreset[] = [
  { id: "custom", label: "Personalizzato", prompt: "" },
  { id: "line-art", label: "Line art a china", prompt: `${faithful}Trasforma in line art editoriale a china, contorni puliti, variazione naturale dello spessore, tratteggio fine, fondo carta bianca.` },
  { id: "engraving", label: "Incisione antica", prompt: `${faithful}Trasforma in incisione antica ottocentesca, bulino e acquaforte, tratteggio incrociato minuzioso, inchiostro nero su carta avorio, stampa artigianale.` },
  { id: "woodcut", label: "Xilografia", prompt: `${faithful}Trasforma in xilografia tradizionale, segni intagliati energici, campiture nere, texture del legno, stampa manuale ad alto contrasto.` },
  { id: "linocut", label: "Linoleografia", prompt: `${faithful}Trasforma in linoleografia moderna, forme semplificate, segni scavati decisi, nero pieno e imperfezioni di inchiostrazione.` },
  { id: "drypoint", label: "Punta secca", prompt: `${faithful}Trasforma in stampa a punta secca, linee nervose con barbe vellutate, toni profondi, carta cotone da calcografia.` },
  { id: "lithography", label: "Litografia", prompt: `${faithful}Trasforma in litografia d'arte, segno grasso e granuloso, delicate velature tonali, autentica texture di pietra e carta.` },
  { id: "screenprint", label: "Serigrafia", prompt: `${faithful}Trasforma in serigrafia artistica a pochi colori, separazioni nette, retino visibile, sovrapposizioni e lieve fuori registro.` },
  { id: "pencil", label: "Matita grafite", prompt: `${faithful}Trasforma in disegno realistico a matita grafite, costruzione accurata, tratteggio sensibile, sfumature e grana della carta.` },
  { id: "charcoal", label: "Carboncino", prompt: `${faithful}Trasforma in disegno a carboncino, masse tonali profonde, segni gestuali, sfumato e polvere sulla carta.` },
  { id: "sanguine", label: "Sanguigna", prompt: `${faithful}Trasforma in disegno rinascimentale a sanguigna, gesso rosso, tratteggio anatomico e carta calda.` },
  { id: "pastel", label: "Pastello", prompt: `${faithful}Trasforma in pastello morbido, pigmento polveroso, sovrapposizioni vellutate, colori ricchi su carta ruvida.` },
  { id: "watercolor", label: "Acquerello", prompt: `${faithful}Trasforma in acquerello trasparente, lavature luminose, bordi umidi, granulazione del pigmento e carta visibile.` },
  { id: "gouache", label: "Gouache", prompt: `${faithful}Trasforma in illustrazione a gouache, campiture opache, pennellate materiche, colori armonici e dettagli dipinti a mano.` },
  { id: "oil", label: "Olio classico", prompt: `${faithful}Trasforma in dipinto a olio classico, chiaroscuro, velature, impasto controllato e pennellate visibili su tela.` },
  { id: "impressionism", label: "Impressionismo", prompt: `${faithful}Trasforma in dipinto impressionista, pennellate spezzate, luce atmosferica, colori ottici e tela vibrante.` },
  { id: "expressionism", label: "Espressionismo", prompt: `${faithful}Trasforma in pittura espressionista, colore emotivo, pennellate energiche, forme intenzionalmente deformate ma soggetto riconoscibile.` },
  { id: "pointillism", label: "Puntinismo", prompt: `${faithful}Trasforma in dipinto pointillista, migliaia di piccoli tocchi cromatici, mescolanza ottica e luce vibrante.` },
  { id: "sumi-e", label: "Sumi-e", prompt: `${faithful}Trasforma in pittura sumi-e giapponese, inchiostro nero diluito, vuoti espressivi, pennellate calligrafiche su carta di riso.` },
  { id: "ukiyoe", label: "Ukiyo-e", prompt: `${faithful}Trasforma in stampa ukiyo-e, contorni netti, campiture piatte, motivi decorativi e texture da xilografia policroma.` },
  { id: "comic", label: "Fumetto a china", prompt: `${faithful}Trasforma in tavola a fumetti inchiostrata, outline dinamico, ombre nere, retini e tratteggio narrativo.` },
  { id: "graphic-novel", label: "Graphic novel", prompt: `${faithful}Trasforma in graphic novel cinematografica, inchiostrazione espressiva, chiaroscuro drammatico e palette limitata.` },
  { id: "cel-animation", label: "Animazione cel", prompt: `${faithful}Trasforma in animazione tradizionale su cel, contorni puliti, forme leggibili, colori piatti e ombre a due toni.` },
  { id: "pixel-art", label: "Pixel art", prompt: `${faithful}Trasforma in pixel art dettagliata, palette limitata, dithering intenzionale, bordi netti e nessun antialiasing.` },
  { id: "low-poly", label: "Low poly", prompt: `${faithful}Trasforma in illustrazione low-poly, piani geometrici sfaccettati, luce coerente e palette raffinata.` },
  { id: "paper-cut", label: "Paper cut", prompt: `${faithful}Trasforma in paper-cut art stratificata, sagome di carta ritagliata, fibre visibili, ombre morbide e profondita fisica.` },
  { id: "stained-glass", label: "Vetrata", prompt: `${faithful}Trasforma in vetrata artistica, tessere di vetro colorato, piombature scure, luce trasmessa e texture irregolare.` },
  { id: "mosaic", label: "Mosaico", prompt: `${faithful}Trasforma in mosaico artigianale, tessere irregolari di pietra e vetro, fughe visibili e colore modulato.` },
  { id: "ceramic", label: "Ceramica dipinta", prompt: `${faithful}Trasforma in decorazione su ceramica smaltata, pennellata artigianale, pigmenti minerali, craquelure sottile.` },
  { id: "embroidery", label: "Ricamo", prompt: `${faithful}Trasforma in ricamo tessile, punti visibili, fili colorati, rilievo e trama del tessuto.` },
  { id: "blueprint", label: "Cianotipia", prompt: `${faithful}Trasforma in cianotipia fotografica, blu di Prussia intenso, silhouette e dettagli bianchi, texture chimica su carta.` },
  { id: "vintage-poster", label: "Poster vintage", prompt: `${faithful}Trasforma in manifesto illustrato vintage, litografia a colori limitati, retino, carta invecchiata e tipica stampa d'epoca senza aggiungere testo.` },
  { id: "surreal", label: "Surrealismo", prompt: `${faithful}Trasforma in pittura surrealista onirica, dettagli precisi, accostamenti poetici e atmosfera sospesa, senza perdere il soggetto.` },
  { id: "abstract", label: "Astratto geometrico", prompt: `${faithful}Reinterpreta come arte astratta geometrica mantenendo leggibile la struttura del soggetto, forme ritmiche, campiture e composizione equilibrata.` },
  ...ADDITIONAL_KLEIN_STYLE_PRESETS,
];
