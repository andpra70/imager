import type { KleinStylePreset } from "../model";

const adultGuard =
  "Rappresenta esclusivamente persone adulte chiaramente maggiorenni, consenzienti e in una situazione volontaria; " +
  "nessuna coercizione, violenza, incesto o ambiguita sull'eta. ";

const preset = (id: string, label: string, prompt: string): KleinStylePreset => ({
  id: `adult-${id}`,
  label,
  prompt: `${adultGuard}${prompt}`,
});

/** Generi fotografici e cinematografici per adulti. */
export const ADULT_GENRE_PRESETS: readonly KleinStylePreset[] = [
  preset("softcore", "Softcore cinematografico", "Trasforma in una scena erotica softcore, sensuale ma non grafica, luce cinematografica, pelle naturale, pose eleganti e atmosfera intima."),
  preset("hardcore", "Hardcore esplicito", "Trasforma in fotografia pornografica esplicita fra adulti, anatomia credibile, azione sessuale leggibile, luce professionale e resa realistica senza elementi degradanti."),
  preset("glamour", "Glamour per adulti", "Trasforma in editoriale glamour per adulti, nudita sofisticata, styling lussuoso, luce scolpita, pelle curata e composizione da rivista patinata."),
  preset("amateur", "Amatoriale autentico", "Trasforma in contenuto amatoriale per adulti, ambiente domestico credibile, luce disponibile, camera spontanea, imperfezioni naturali e intimita realistica."),
  preset("gonzo", "Gonzo immersivo", "Trasforma in scena gonzo per adulti, camera ravvicinata e immersiva, prospettiva soggettiva, luce diretta, energia documentaria e azione centrale chiaramente visibile."),
  preset("feature", "Feature narrativa", "Trasforma in cinema pornografico narrativo, set curato, fotografia cinematografica, personaggi adulti, atmosfera drammatica e continuita visiva da lungometraggio."),
  preset("art-house", "Pornografia d'autore", "Trasforma in cinema erotico esplicito d'autore, composizione rigorosa, simbolismo, luce espressiva, grana da pellicola e sensualita adulta trattata con eleganza."),
  preset("vintage", "Vintage anni 70", "Trasforma in cinema per adulti degli anni Settanta, pellicola 16/35 mm, grana calda, colori tabacco, arredamento d'epoca, zoom ottici e luce morbida."),
  preset("retro-80s", "Video anni 80", "Trasforma in produzione per adulti anni Ottanta, look VHS pulito, luce al tungsteno, colori saturi, styling d'epoca e morbidezza analogica."),
  preset("modern-studio", "Studio contemporaneo", "Trasforma in produzione pornografica contemporanea di alto livello, luce uniforme, nitidezza 4K, set minimale, incarnati naturali e composizione molto pulita."),
];

/** Sottogeneri e codici visivi, descritti senza categorie illegali o non consensuali. */
export const ADULT_SUBGENRE_PRESETS: readonly KleinStylePreset[] = [
  preset("couple", "Coppia intima", "Trasforma in scena intima fra due adulti, forte connessione reciproca, gesti consensuali, vicinanza emotiva, luce calda e inquadrature naturali."),
  preset("ensemble", "Ensemble di adulti", "Trasforma in scena erotica corale fra adulti consenzienti, composizione leggibile, interazioni armoniche, anatomie coerenti e illuminazione cinematografica."),
  preset("queer", "Queer erotico", "Trasforma in erotismo queer adulto, autentico e inclusivo, corpi e identita rappresentati con rispetto, styling contemporaneo e luce editoriale espressiva."),
  preset("lesbian", "Saffico", "Trasforma in scena erotica saffica fra donne adulte consenzienti, intimita reciproca, gesti naturali, sguardo non voyeuristico e luce morbida."),
  preset("gay", "Gay maschile", "Trasforma in scena erotica fra uomini adulti consenzienti, fisicita autentica, connessione reciproca, fotografia elegante e luce contrastata."),
  preset("mature", "Adulti maturi", "Trasforma in erotismo fra persone adulte mature, corpi realistici, sicurezza, complicita, luce lusinghiera e rappresentazione rispettosa dell'eta adulta."),
  preset("bdsm", "BDSM consensuale", "Trasforma in scena BDSM fra adulti con consenso evidente, accessori professionali, controllo e sicurezza, estetica fetish raffinata, latex e luce drammatica; nessuna lesione."),
  preset("fetish", "Fetish editoriale", "Trasforma in editoriale fetish per adulti, latex, pelle e accessori scenografici, pose dominanti, superfici lucide, nero profondo e luce grafica."),
  preset("boudoir-explicit", "Boudoir esplicito", "Trasforma in boudoir adulto esplicito, camera elegante, tessuti morbidi, luce finestra, incarnati delicati e composizione intima sofisticata."),
  preset("outdoor", "Naturismo erotico", "Trasforma in scena erotica adulta all'aperto, ambiente naturale appartato, luce solare credibile, liberta corporea e fotografia organica."),
  preset("surreal", "Erotismo surreale", "Trasforma in arte pornografica surrealista fra adulti, anatomia onirica ma coerente, simboli sensuali, set impossibili, colore intenso e atmosfera visionaria."),
  preset("illustration", "Illustrazione erotica", "Trasforma in illustrazione erotica esplicita per adulti, anatomia accurata, linea elegante, colore pittorico, composizione narrativa e finitura editoriale."),
];

/** Autori storici e contemporanei rilevanti per il linguaggio erotico cinematografico. */
export const ADULT_MASTER_PRESETS: readonly KleinStylePreset[] = [
  preset("master-metzger", "Radley Metzger", "Trasforma nel linguaggio erotico cinematografico associato a Radley Metzger: eleganza europea, interni sofisticati, composizione classica, luce morbida e sensualita narrativa."),
  preset("master-brass", "Tinto Brass", "Trasforma nel linguaggio erotico associato a Tinto Brass: grandangoli giocosi, colori caldi e saturi, interni italiani, ironia voyeuristica e movimento di macchina sensuale."),
  preset("master-borowczyk", "Walerian Borowczyk", "Trasforma nel linguaggio erotico associato a Walerian Borowczyk: oggetti simbolici, texture tattili, composizioni pittoriche, atmosfera decadente e surrealismo sensuale."),
  preset("master-poole", "Wakefield Poole", "Trasforma nel linguaggio cinematografico adulto associato a Wakefield Poole: corpi coreografati, luce teatrale, montaggio poetico, colore da pellicola e sensibilita artistica."),
  preset("master-damiano", "Gerard Damiano", "Trasforma nel linguaggio del cinema adulto narrativo associato a Gerard Damiano: messa in scena anni Settanta, personaggi definiti, luce cinematografica, grana analogica e montaggio classico."),
  preset("master-candida-royalle", "Candida Royalle", "Trasforma nel linguaggio adulto associato a Candida Royalle: prospettiva centrata sul desiderio reciproco, intimita, consenso evidente, luce accogliente e narrazione emotiva."),
  preset("master-andrew-blake", "Andrew Blake", "Trasforma nel linguaggio visivo associato ad Andrew Blake: lusso minimalista, architetture moderne, luce patinata, corpi scultorei, colori ricchi e composizioni grafiche."),
  preset("master-erika-lust", "Erika Lust", "Trasforma nel linguaggio cinematografico adulto associato a Erika Lust: sguardo inclusivo, consenso e desiderio reciproco, ambienti contemporanei, luce naturale e racconto realistico."),
  preset("master-petra-joy", "Petra Joy", "Trasforma nel linguaggio erotico associato a Petra Joy: prospettiva femminile, intimita autentica, corpi naturali, luce delicata e atmosfera personale non stereotipata."),
  preset("master-peter-de-rome", "Peter de Rome", "Trasforma nel linguaggio erotico associato a Peter de Rome: cinema gay d'autore, osservazione intima, composizione lirica, ambienti reali e grana calda da pellicola."),
];

export const ADULT_STYLE_PRESETS: readonly KleinStylePreset[] = [
  ...ADULT_GENRE_PRESETS,
  ...ADULT_SUBGENRE_PRESETS,
  ...ADULT_MASTER_PRESETS,
];
