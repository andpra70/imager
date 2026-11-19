import { KLEIN_STYLE_PRESETS, type KleinStylePreset } from "../model";
import {
  DIGITAL_ILLUSTRATION_PRESETS,
  DRAWING_AND_PRINT_PRESETS,
  MATERIAL_AND_CRAFT_PRESETS,
  PAINTING_AND_MOVEMENT_PRESETS,
  PHOTO_CINEMA_PRESETS,
  WORLD_TRADITION_PRESETS,
} from "./additionalPresets";
import { COMIC_MASTER_PRESETS, PHOTOGRAPHY_MASTER_PRESETS } from "./famousArtistsPresets";
import { BOUDOIR_GLAMOUR_PRESETS, FASHION_80S_90S_PRESETS, FASHION_DECADES_PRESETS, FETISH_UNDERGROUND_PRESETS, NEWTON_FASHION_CIRCLE_PRESETS, VOGUE_HIGH_FASHION_PRESETS } from "./fashionPhotographyPresets";
import { BAROQUE_PAINTERS, EIGHTEENTH_ROMANTIC_REALIST_PAINTERS, IMPRESSIONIST_POSTIMPRESSIONIST_PAINTERS, MEDIEVAL_RENAISSANCE_PAINTERS, MODERN_AVANT_GARDE_PAINTERS, SURREALIST_PAINTERS, TWENTIETH_CENTURY_PAINTERS } from "./famousPaintersPresets";

export interface KleinStyleSubgenre {
  id: string;
  label: string;
  styles: readonly KleinStylePreset[];
}

export interface KleinStyleGenre {
  id: string;
  label: string;
  subgenres: readonly KleinStyleSubgenre[];
}

export interface KleinStylePath {
  genre: KleinStyleGenre;
  subgenre: KleinStyleSubgenre;
  style: KleinStylePreset;
}

const ids = (values: readonly KleinStylePreset[]) => new Set(values.map((item) => item.id));
const compareLabels = <T extends { label: string }>(left: T, right: T) =>
  left.label.localeCompare(right.label, "it", { sensitivity: "base", numeric: true });
const alphabetically = <T extends { label: string }>(values: readonly T[]) => [...values].sort(compareLabels);
const drawingIds = ids(DRAWING_AND_PRINT_PRESETS);
const paintingIds = ids(PAINTING_AND_MOVEMENT_PRESETS);
const worldIds = ids(WORLD_TRADITION_PRESETS);
const digitalIds = ids(DIGITAL_ILLUSTRATION_PRESETS);
const photoIds = ids(PHOTO_CINEMA_PRESETS);
const materialIds = ids(MATERIAL_AND_CRAFT_PRESETS);

const baseGroups: Record<string, string> = {
  custom: "custom", "line-art": "drawing", engraving: "drawing", woodcut: "drawing", linocut: "drawing", drypoint: "drawing",
  lithography: "drawing", screenprint: "drawing", pencil: "drawing", charcoal: "drawing", sanguine: "drawing", pastel: "drawing",
  watercolor: "painting", gouache: "painting", oil: "painting", impressionism: "painting", expressionism: "painting", pointillism: "painting",
  "sumi-e": "world", ukiyoe: "world", comic: "digital", "graphic-novel": "digital", "cel-animation": "digital", "pixel-art": "digital",
  "low-poly": "digital", "paper-cut": "material", "stained-glass": "material", mosaic: "material", ceramic: "material",
  embroidery: "material", blueprint: "photo", "vintage-poster": "drawing", surreal: "painting", abstract: "painting",
};

function genreFor(style: KleinStylePreset) {
  if (drawingIds.has(style.id)) return "drawing";
  if (paintingIds.has(style.id)) return "painting";
  if (worldIds.has(style.id)) return "world";
  if (digitalIds.has(style.id)) return "digital";
  if (photoIds.has(style.id)) return "photo";
  if (materialIds.has(style.id)) return "material";
  return baseGroups[style.id] ?? "custom";
}

const groupSets: Record<string, Array<{ id: string; label: string; ids: Set<string> }>> = {
  drawing: [
    { id: "line", label: "Linea e inchiostro", ids: new Set(["line-art", "technical-pen", "ballpoint", "fountain-pen", "brush-ink", "contour", "blind-contour", "gesture"]) },
    { id: "dry", label: "Matita, gesso e pastello", ids: new Set(["pencil", "charcoal", "sanguine", "pastel", "silverpoint", "chalk", "soft-pastel", "oil-pastel", "colored-pencil", "marker"]) },
    { id: "intaglio", label: "Calcografia e incisione", ids: new Set(["engraving", "drypoint", "scratchboard", "mezzotint", "aquatint", "etching", "copperplate", "metal-engraving"]) },
    { id: "relief", label: "Stampa in rilievo", ids: new Set(["woodcut", "linocut", "rubber-stamp", "african-linocut"]) },
    { id: "print", label: "Stampa piana e seriale", ids: new Set(["lithography", "screenprint", "monotype", "risograph", "newspaper", "vintage-poster"]) },
  ],
  painting: [
    { id: "water", label: "Tecniche ad acqua", ids: new Set(["watercolor", "gouache", "tempera", "fresco"]) },
    { id: "oil", label: "Olio e tecniche materiche", ids: new Set(["oil", "acrylic", "encaustic", "palette-knife", "alla-prima"]) },
    { id: "classic", label: "Movimenti classici", ids: new Set(["renaissance", "baroque", "rococo", "romanticism", "realism", "pre-raphaelite", "symbolism"]) },
    { id: "modern", label: "Avanguardie moderne", ids: new Set(["impressionism", "expressionism", "pointillism", "art-nouveau", "art-deco", "fauvism", "cubism", "synthetic-cubism", "futurism", "dada", "bauhaus", "constructivism", "suprematism", "metaphysical", "surreal"]) },
    { id: "contemporary", label: "Arte contemporanea", ids: new Set(["abstract", "abstract-expressionism", "color-field", "pop-art", "op-art", "minimalism", "neo-expressionism", "street-art"]) },
    { id: "masters-medieval", label: "Maestri · Medioevo e Rinascimento", ids: ids(MEDIEVAL_RENAISSANCE_PAINTERS) },
    { id: "masters-baroque", label: "Maestri · Barocco", ids: ids(BAROQUE_PAINTERS) },
    { id: "masters-18-19", label: "Maestri · Settecento e Ottocento", ids: ids(EIGHTEENTH_ROMANTIC_REALIST_PAINTERS) },
    { id: "masters-impressionist", label: "Maestri · Impressionismo e oltre", ids: ids(IMPRESSIONIST_POSTIMPRESSIONIST_PAINTERS) },
    { id: "masters-avant-garde", label: "Maestri · Avanguardie moderne", ids: ids(MODERN_AVANT_GARDE_PAINTERS) },
    { id: "masters-surrealist", label: "Maestri · Surrealismo", ids: ids(SURREALIST_PAINTERS) },
    { id: "masters-20th", label: "Maestri · Novecento", ids: ids(TWENTIETH_CENTURY_PAINTERS) },
  ],
  world: [
    { id: "east-asia", label: "Asia orientale", ids: new Set(["sumi-e", "ukiyoe", "chinese-ink", "gongbi", "korean-minhwa"]) },
    { id: "south-asia", label: "Asia meridionale e centrale", ids: new Set(["tibetan-thangka", "indian-miniature", "mughal-miniature", "persian-miniature"]) },
    { id: "europe", label: "Europa storica", ids: new Set(["byzantine-mosaic", "medieval-illumination", "celtic-illumination", "azulejo"]) },
    { id: "americas", label: "Americhe", ids: new Set(["mexican-mural", "alebrije", "talavera"]) },
    { id: "patterns", label: "Pattern, tessuti e tradizioni", ids: new Set(["islamic-geometric", "aboriginal-dot", "batik", "ikat", "tapestry"]) },
  ],
  digital: [
    { id: "graphic", label: "Grafica e vettoriale", ids: new Set(["vector-flat", "vector-gradient", "editorial", "fashion", "architectural"]) },
    { id: "comics", label: "Fumetto e animazione", ids: new Set(["comic", "graphic-novel", "cel-animation", "anime", "manga", "retro-anime", "storybook", "childrens-crayon"]) },
    { id: "pixel-3d", label: "Pixel e 3D", ids: new Set(["pixel-art", "low-poly", "isometric", "voxel", "clay-render", "three-d-toon"]) },
    { id: "concept", label: "Concept e intrattenimento", ids: new Set(["concept-art", "matte-painting", "fantasy", "science-fiction", "cyberpunk", "solarpunk", "steampunk"]) },
    { id: "experimental", label: "Digitale sperimentale", ids: new Set(["synthwave", "glitch", "generative-lines"]) },
    { id: "comic-masters", label: "Maestri del fumetto", ids: ids(COMIC_MASTER_PRESETS) },
  ],
  photo: [
    { id: "historic", label: "Processi fotografici storici", ids: new Set(["blueprint", "cyanotype", "daguerreotype", "wet-plate", "albumen"]) },
    { id: "film", label: "Pellicola e cinema", ids: new Set(["film-noir", "technicolor", "super8", "instant-film", "cinematic", "lomography"]) },
    { id: "effects", label: "Effetti fotografici", ids: new Set(["infrared", "duotone", "tilt-shift"]) },
    { id: "photo-masters", label: "Maestri della fotografia", ids: ids(PHOTOGRAPHY_MASTER_PRESETS) },
    { id: "vogue-fashion", label: "Vogue e alta moda", ids: ids(VOGUE_HIGH_FASHION_PRESETS) },
    { id: "fashion-80s-90s", label: "Fashion anni 80–90", ids: ids(FASHION_80S_90S_PRESETS) },
    { id: "boudoir-glamour", label: "Boudoir e glamour", ids: ids(BOUDOIR_GLAMOUR_PRESETS) },
    { id: "fetish-underground", label: "Fetish e underground", ids: ids(FETISH_UNDERGROUND_PRESETS) },
    { id: "newton-circle", label: "Newton e fashion provocatorio", ids: new Set(["photo-helmut-newton", "photo-guy-bourdin", "photo-chris-von-wangenheim", "photo-bob-carlos-clarke", ...ids(NEWTON_FASHION_CIRCLE_PRESETS)]) },
    { id: "fashion-decades", label: "Storia moda per decennio", ids: ids(FASHION_DECADES_PRESETS) },
  ],
  material: [
    { id: "paper", label: "Carta e collage", ids: new Set(["paper-cut", "collage", "photomontage", "origami", "quilling", "stained-paper"]) },
    { id: "textile", label: "Tessile", ids: new Set(["embroidery", "hand-embroidery", "cross-stitch", "knitted", "felt"]) },
    { id: "hard", label: "Pietra, legno e metallo", ids: new Set(["mosaic", "marquetry", "metal-engraving", "bas-relief", "marble", "bronze"]) },
    { id: "glass-ceramic", label: "Vetro e ceramica", ids: new Set(["stained-glass", "ceramic", "glass", "neon"]) },
    { id: "organic", label: "Materiali naturali", ids: new Set(["sand-art", "pressed-flowers"]) },
  ],
  custom: [{ id: "manual", label: "Prompt libero", ids: new Set(["custom"]) }],
};

const genreLabels: Record<string, string> = {
  custom: "Personalizzato", drawing: "Disegno e stampa", painting: "Pittura e movimenti", world: "Tradizioni dal mondo",
  digital: "Illustrazione digitale", photo: "Fotografia e cinema", material: "Materiali e artigianato",
};

export const KLEIN_STYLE_CATALOG: readonly KleinStyleGenre[] = Object.entries(genreLabels).map(([genreId, label]) => {
  const genreStyles = KLEIN_STYLE_PRESETS.filter((style) => genreFor(style) === genreId);
  const definitions = groupSets[genreId] ?? [];
  const assigned = new Set(definitions.flatMap((item) => [...item.ids]));
  const subgenres = definitions
    .map((definition) => ({ id: definition.id, label: definition.label, styles: alphabetically(genreStyles.filter((style) => definition.ids.has(style.id))) }))
    .filter((item) => item.styles.length > 0);
  const others = genreStyles.filter((style) => !assigned.has(style.id));
  if (others.length) subgenres.push({ id: "other", label: "Altri stili", styles: alphabetically(others) });
  return { id: genreId, label, subgenres: alphabetically(subgenres) };
}).filter((genre) => genre.subgenres.length > 0).sort(compareLabels);

export function findKleinStylePath(styleId: string): KleinStylePath | null {
  for (const genre of KLEIN_STYLE_CATALOG) for (const subgenre of genre.subgenres) {
    const style = subgenre.styles.find((item) => item.id === styleId);
    if (style) return { genre, subgenre, style };
  }
  return null;
}
