import type { KleinStylePreset } from "../model";

const faithful = "";
type PainterData = readonly [id: string, label: string, traits: string];
const make = (rows: readonly PainterData[]): readonly KleinStylePreset[] => rows.map(([id, label, traits]) => ({ id: `painter-${id}`, label, prompt: `${faithful}Trasforma in una pittura caratterizzata da ${traits}.` }));

export const MEDIEVAL_RENAISSANCE_PAINTERS = make([
  ["giotto", "Giotto", "affresco proto-rinascimentale, volumi solidi, gesti umani, azzurri minerali"],
  ["duccio", "Duccio di Buoninsegna", "tavola senese, fondo oro, linea elegante, tempera e colori preziosi"],
  ["fra-angelico", "Beato Angelico", "luce limpida, colori luminosi, prospettiva quieta e atmosfera contemplativa"],
  ["masaccio", "Masaccio", "figure monumentali, prospettiva rigorosa, chiaroscuro naturale e gravita"],
  ["piero", "Piero della Francesca", "geometria rinascimentale, luce cristallina, volumi puri e calma sospesa"],
  ["botticelli", "Sandro Botticelli", "linea melodica, figure eleganti, drappeggi mossi e poesia mitologica"],
  ["leonardo", "Leonardo da Vinci", "sfumato, chiaroscuro morbido, anatomia precisa, velature e paesaggio atmosferico"],
  ["michelangelo", "Michelangelo", "anatomie scultoree, torsioni potenti, disegno vigoroso e monumentalita"],
  ["raffaello", "Raffaello", "armonia classica, composizione equilibrata, bellezza ideale e colori limpidi"],
  ["tiziano", "Tiziano", "colore veneziano caldo, velature profonde, incarnati luminosi e pennellata sensuale"],
  ["tintoretto", "Tintoretto", "prospettive accelerate, diagonali, lampi di luce e movimento drammatico"],
  ["bruegel", "Pieter Bruegel il Vecchio", "paesaggio nordico, dettagli narrativi, vita quotidiana e colori stagionali"],
  ["durer", "Albrecht Dürer", "precisione nordica, dettaglio naturalistico, volume rigoroso e simbolismo"],
  ["el-greco", "El Greco", "figure allungate, luce soprannaturale, cieli tempestosi e colore incandescente"],
] as const);

export const BAROQUE_PAINTERS = make([
  ["caravaggio", "Caravaggio", "tenebrismo, luce radente teatrale, fondo scuro e realismo fisico"],
  ["artemisia", "Artemisia Gentileschi", "chiaroscuro intenso, figure determinate, azione drammatica e colori ricchi"],
  ["rubens", "Peter Paul Rubens", "movimento vorticoso, anatomie vigorose, colore caldo e composizione sontuosa"],
  ["rembrandt", "Rembrandt", "luce dorata dal buio, impasto, toni terrosi e introspezione psicologica"],
  ["velazquez", "Diego Velázquez", "pennellata libera, argenti e neri, spazio atmosferico e realismo ottico"],
  ["vermeer", "Johannes Vermeer", "luce laterale morbida, geometria quieta, blu e gialli e dettagli ottici"],
  ["frans-hals", "Frans Hals", "pennellata rapida, espressione viva, neri sfumati e spontaneita"],
] as const);

export const EIGHTEENTH_ROMANTIC_REALIST_PAINTERS = make([
  ["watteau", "Antoine Watteau", "Rococo malinconico, sete cangianti, paesaggio vaporoso e grazia"],
  ["fragonard", "Jean-Honoré Fragonard", "Rococo brillante, pennellata rapida, rosa e verdi e movimento giocoso"],
  ["goya", "Francisco Goya", "realismo penetrante, luce drammatica, toni terrosi e tensione visionaria"],
  ["david", "Jacques-Louis David", "Neoclassicismo severo, disegno netto, anatomia scultorea e luce tersa"],
  ["ingres", "Jean-Auguste-Dominique Ingres", "contorno purissimo, superfici levigate, eleganza e tessuti preziosi"],
  ["delacroix", "Eugène Delacroix", "Romanticismo, colore ardente, diagonali, azione e pennellata vibrante"],
  ["turner", "J. M. W. Turner", "luce atmosferica, tempesta di colore, foschia e sublime romantico"],
  ["friedrich", "Caspar David Friedrich", "paesaggio nordico, figura contemplativa, nebbia e silenzio metafisico"],
  ["courbet", "Gustave Courbet", "Realismo, materia robusta, toni terrosi, luce naturale e presenza fisica"],
] as const);

export const IMPRESSIONIST_POSTIMPRESSIONIST_PAINTERS = make([
  ["manet", "Édouard Manet", "modernita, neri ricchi, pennellata franca, luce diretta e composizione audace"],
  ["monet", "Claude Monet", "luce fugace, pennellate spezzate, ombre colorate e atmosfera"],
  ["renoir", "Pierre-Auguste Renoir", "luce calda filtrata, incarnati vibranti, colore gioioso e pennellata morbida"],
  ["degas", "Edgar Degas", "tagli fotografici, gesto osservato, pastello, interni e composizione asimmetrica"],
  ["morisot", "Berthe Morisot", "pennellata ariosa, bianchi luminosi, intimita e spontaneita"],
  ["cassatt", "Mary Cassatt", "composizione ravvicinata, disegno saldo, colori delicati e intimita"],
  ["van-gogh", "Vincent van Gogh", "pennellate vorticose, impasto, contorni ritmici e colore emotivo"],
  ["cezanne", "Paul Cézanne", "volumi a piani di colore, prospettive multiple e geometria naturale"],
  ["gauguin", "Paul Gauguin", "campiture piatte, contorni scuri, colore simbolico e sintetismo"],
  ["seurat", "Georges Seurat", "puntinismo cromatico, geometria, mescolanza ottica e luce"],
  ["toulouse-lautrec", "Henri de Toulouse-Lautrec", "linea rapida, colore piatto, taglio giapponese e vita notturna"],
] as const);

export const MODERN_AVANT_GARDE_PAINTERS = make([
  ["klimt", "Gustav Klimt", "oro, mosaici ornamentali, figura naturalistica e pattern decorativi"],
  ["munch", "Edvard Munch", "linee ondulate, colore emotivo, spazio psicologico e inquietudine"],
  ["matisse", "Henri Matisse", "Fauvismo, colore puro, contorni fluidi, spazio piatto e pattern"],
  ["picasso", "Pablo Picasso", "Cubismo, punti di vista simultanei, anatomia scomposta e piani geometrici"],
  ["kandinsky", "Vasilij Kandinskij", "astrazione lirica, forme musicali, linee dinamiche e colore spirituale"],
  ["klee", "Paul Klee", "segni poetici, griglie cromatiche, simboli e raffinata leggerezza"],
  ["modigliani", "Amedeo Modigliani", "figure allungate, volti ovali, occhi profondi, linea elegante e toni caldi"],
  ["chagall", "Marc Chagall", "figure fluttuanti, colore fiabesco, memoria, simboli e spazio onirico"],
  ["de-chirico", "Giorgio de Chirico", "piazze metafisiche, architetture, ombre lunghe e mistero"],
  ["mondrian", "Piet Mondrian", "griglia nera, rettangoli primari, bianco ed equilibrio asimmetrico"],
] as const);

export const SURREALIST_PAINTERS = make([
  ["dali", "Salvador Dalí", "Surrealismo levigato, paesaggio nitido, metamorfosi e ombre lunghe"],
  ["magritte", "René Magritte", "oggetti comuni in relazioni impossibili, cielo limpido e mistero calmo"],
  ["max-ernst", "Max Ernst", "frottage, grattage, texture organiche, ibridi e paesaggio visionario"],
  ["leonora-carrington", "Leonora Carrington", "creature alchemiche, interni misteriosi e dettagli minuti"],
  ["frida-kahlo", "Frida Kahlo", "frontalita, botanica, colore messicano, simboli e realismo minuzioso"],
  ["remedios-varo", "Remedios Varo", "architetture esoteriche, figure filiformi, macchine poetiche e velature dorate"],
] as const);

export const TWENTIETH_CENTURY_PAINTERS = make([
  ["hopper", "Edward Hopper", "luce netta, architettura silenziosa, figure isolate e tensione cinematografica"],
  ["okeeffe", "Georgia O'Keeffe", "forme naturali ingrandite, curve essenziali, gradienti e colore sensuale"],
  ["lempicka", "Tamara de Lempicka", "Art Déco, figure scultoree, geometrie eleganti e luce metallica"],
  ["morandi", "Giorgio Morandi", "oggetti essenziali, toni polverosi, luce quieta e minime variazioni"],
  ["pollock", "Jackson Pollock", "action painting, colature stratificate, gesto e ritmo all-over"],
  ["rothko", "Mark Rothko", "campi cromatici, rettangoli dai bordi vibranti e atmosfera meditativa"],
  ["francis-bacon", "Francis Bacon", "figure deformate, gabbie spaziali, materia strisciata e tensione psicologica"],
  ["burri", "Alberto Burri", "materia bruciata, sacchi, cretti, cuciture e astrazione tattile"],
  ["basquiat", "Jean-Michel Basquiat", "neo-espressionismo urbano, anatomie, corone, cancellature e colore crudo senza testo leggibile"],
] as const);

export const FAMOUS_PAINTER_PRESETS: readonly KleinStylePreset[] = [
  ...MEDIEVAL_RENAISSANCE_PAINTERS, ...BAROQUE_PAINTERS, ...EIGHTEENTH_ROMANTIC_REALIST_PAINTERS,
  ...IMPRESSIONIST_POSTIMPRESSIONIST_PAINTERS, ...MODERN_AVANT_GARDE_PAINTERS, ...SURREALIST_PAINTERS,
  ...TWENTIETH_CENTURY_PAINTERS,
];
