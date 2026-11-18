import type { KleinStylePreset } from "../model";

const faithful = "Mantieni con la massima fedelta soggetto, identita, posa, proporzioni, composizione, prospettiva e ambiente dell'immagine originale. ";
const preset = (id: string, label: string, prompt: string): KleinStylePreset => ({ id, label, prompt: `${faithful}${prompt}` });

export const COMIC_MASTER_PRESETS: readonly KleinStylePreset[] = [
  preset("comic-winsor-mccay", "Winsor McCay", "Reinterpreta nel linguaggio delle tavole oniriche di Winsor McCay: linee eleganti, architetture fantastiche, prospettive teatrali, colori litografici delicati e dettaglio finissimo."),
  preset("comic-george-herriman", "George Herriman", "Reinterpreta nel linguaggio grafico di George Herriman: linea libera e poetica, paesaggio desertico mutevole, forme surreali, ritmo da striscia e inchiostrazione spontanea."),
  preset("comic-herge", "Hergé", "Reinterpreta secondo la ligne claire associata a Hergé: contorni uniformi e puliti, colori piatti, ambienti documentati, grande leggibilita e assenza di tratteggio."),
  preset("comic-osamu-tezuka", "Osamu Tezuka", "Reinterpreta nel linguaggio manga di Osamu Tezuka: disegno fluido, recitazione espressiva, regia cinematografica, forme leggibili e bianco e nero dinamico."),
  preset("comic-jack-kirby", "Jack Kirby", "Reinterpreta con l'energia grafica di Jack Kirby: anatomie monumentali, scorci esplosivi, neri decisi, macchinari cosmici, linee cinetiche e texture Kirby dots."),
  preset("comic-will-eisner", "Will Eisner", "Reinterpreta nel linguaggio di Will Eisner: inchiostrazione espressiva, chiaroscuro urbano, composizione narrativa della pagina, lettering solo astratto e forte recitazione dei personaggi."),
  preset("comic-moebius", "Mœbius", "Reinterpreta nel linguaggio visionario di Mœbius: linea sottile e precisa, paesaggi vasti, fantascienza contemplativa, colori limpidi e dettagli immaginifici."),
  preset("comic-hugo-pratt", "Hugo Pratt", "Reinterpreta nel linguaggio di Hugo Pratt: pennello sintetico, neri profondi, acquerello essenziale, atmosfera d'avventura e grande economia del segno."),
  preset("comic-sergio-toppi", "Sergio Toppi", "Reinterpreta nel linguaggio di Sergio Toppi: tratteggio ricchissimo, texture decorative, composizione verticale frammentata, volti scolpiti e inchiostro ad altissimo dettaglio."),
  preset("comic-dino-battaglia", "Dino Battaglia", "Reinterpreta nel linguaggio di Dino Battaglia: pennellata atmosferica, graffi, spugna e retini, neri nebbiosi, segno letterario ed evocativo."),
  preset("comic-alberto-breccia", "Alberto Breccia", "Reinterpreta nel linguaggio sperimentale di Alberto Breccia: collage, macchie, raschiature, contrasti violenti, materia grafica e atmosfera inquieta."),
  preset("comic-andrea-pazienza", "Andrea Pazienza", "Reinterpreta nel linguaggio di Andrea Pazienza: linea nervosa e virtuosistica, pennarello, acquerello acceso, deformazione espressiva e spontaneita da taccuino."),
  preset("comic-tove-jansson", "Tove Jansson", "Reinterpreta nel linguaggio illustrativo di Tove Jansson: linea a china sensibile, tratteggio fiabesco, natura nordica, forme morbide e atmosfera intima."),
  preset("comic-charles-schulz", "Charles M. Schulz", "Reinterpreta nel linguaggio minimale di Charles M. Schulz: linea semplice e tremolante, forme essenziali, recitazione sottile, sfondo ridotto e grande chiarezza narrativa."),
  preset("comic-wallace-wood", "Wally Wood", "Reinterpreta nel linguaggio di Wally Wood: fantascienza retro, pennello e pennino meticolosi, neri lucidi, tecnologia dettagliata e illuminazione drammatica."),
  preset("comic-bernie-wrightson", "Bernie Wrightson", "Reinterpreta nel linguaggio horror di Bernie Wrightson: pennino minuzioso, cross-hatching, luce gotica, anatomia espressiva e atmosfera da incisione ottocentesca."),
];

export const PHOTOGRAPHY_MASTER_PRESETS: readonly KleinStylePreset[] = [
  preset("photo-nadar", "Nadar", "Trasforma in ritratto fotografico ottocentesco associato a Nadar: luce laterale morbida, fondale essenziale, posa autorevole, profondita psicologica e stampa all'albumina."),
  preset("photo-julia-cameron", "Julia Margaret Cameron", "Trasforma in ritratto preraffaellita associato a Julia Margaret Cameron: fuoco morbido, luce avvolgente, primo piano intimo, texture al collodio e intensita spirituale."),
  preset("photo-muybridge", "Eadweard Muybridge", "Trasforma in studio cronofotografico associato a Eadweard Muybridge: sequenza analitica del movimento, fondale a griglia, luce uniforme e stampa monocromatica storica."),
  preset("photo-alfred-stieglitz", "Alfred Stieglitz", "Trasforma in fotografia pittorialista e modernista associata ad Alfred Stieglitz: atmosfera, gamma tonale raffinata, grana, clima urbano e stampa al platino."),
  preset("photo-edward-steichen", "Edward Steichen", "Trasforma in fotografia associata a Edward Steichen: eleganza modernista, illuminazione da studio scolpita, geometria raffinata e ricca stampa monocromatica."),
  preset("photo-august-sander", "August Sander", "Trasforma in ritratto documentario associato ad August Sander: posa frontale, neutralita rigorosa, ambiente sociale leggibile, dettaglio oggettivo e bianco e nero."),
  preset("photo-man-ray", "Man Ray", "Trasforma in fotografia surrealista associata a Man Ray: solarizzazione, rayograph, contrasti netti, composizione sperimentale e mistero da camera oscura."),
  preset("photo-dorothea-lange", "Dorothea Lange", "Trasforma in fotografia documentaria associata a Dorothea Lange: empatia, gesto umano, luce disponibile, composizione diretta e bianco e nero ricco di contesto."),
  preset("photo-walker-evans", "Walker Evans", "Trasforma in fotografia documentaria associata a Walker Evans: frontalita, architettura vernacolare, precisione descrittiva, tono sobrio e grande formato monocromatico."),
  preset("photo-cartier-bresson", "Henri Cartier-Bresson", "Trasforma in fotografia di strada associata a Henri Cartier-Bresson: istante decisivo, geometria spontanea, luce naturale, piccolo formato e bianco e nero elegante."),
  preset("photo-robert-capa", "Robert Capa", "Trasforma in reportage associato a Robert Capa: vicinanza all'azione, energia, grana evidente, mosso autentico e forte immediatezza narrativa."),
  preset("photo-ansel-adams", "Ansel Adams", "Trasforma in paesaggio fotografico associato ad Ansel Adams: sistema zonale, nitidezza da grande formato, neri profondi, alte luci dettagliate e monumentalita naturale."),
  preset("photo-w-eugene-smith", "W. Eugene Smith", "Trasforma in saggio fotografico associato a W. Eugene Smith: chiaroscuro intenso, stampa scura e materica, umanismo e narrazione visiva concentrata."),
  preset("photo-diane-arbus", "Diane Arbus", "Trasforma in ritratto quadrato associato a Diane Arbus: flash frontale, sguardo diretto, dettaglio spietato, ambiente quotidiano e bianco e nero inquieto."),
  preset("photo-vivian-maier", "Vivian Maier", "Trasforma in street photography associata a Vivian Maier: formato quadrato, riflessi, autoritratti indiretti, vita urbana colta al volo e toni analogici."),
  preset("photo-gordon-parks", "Gordon Parks", "Trasforma in fotografia umanista associata a Gordon Parks: racconto sociale, composizione cinematografica, dignita del soggetto, luce espressiva e colore o bianco e nero editoriale."),
  preset("photo-richard-avedon", "Richard Avedon", "Trasforma in ritratto da studio associato a Richard Avedon: fondale bianco assoluto, luce uniforme, dettaglio incisivo, gesto psicologico e grande formato."),
  preset("photo-irving-penn", "Irving Penn", "Trasforma in fotografia associata a Irving Penn: composizione austera, fondale neutro ad angolo, luce nordica, texture sofisticata e stampa al platino."),
  preset("photo-helmut-newton", "Helmut Newton", "Trasforma in fotografia editoriale associata a Helmut Newton: luce dura, eleganza provocatoria non esplicita, ambienti di lusso, prospettiva decisa e bianco e nero contrastato."),
  preset("photo-fan-ho", "Fan Ho", "Trasforma in street photography associata a Fan Ho: raggi di luce volumetrici, ombre geometriche, foschia urbana, figure isolate e bianco e nero lirico."),
  preset("photo-saul-leiter", "Saul Leiter", "Trasforma in fotografia a colori associata a Saul Leiter: vetri appannati, riflessi, compressione da teleobiettivo, campiture cromatiche e poesia urbana intima."),
];
