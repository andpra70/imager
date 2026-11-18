import type { KleinStylePreset } from "../model";

const faithful = "Mantieni con la massima fedelta soggetto adulto, identita, posa, proporzioni, composizione, prospettiva e ambiente dell'immagine originale. ";
const preset = (id: string, label: string, prompt: string): KleinStylePreset => ({ id, label, prompt: `${faithful}${prompt}` });

export const VOGUE_HIGH_FASHION_PRESETS: readonly KleinStylePreset[] = [
  preset("photo-adolphe-de-meyer", "Adolphe de Meyer", "Trasforma in ritratto di alta moda pittorialista associato ad Adolphe de Meyer: controluce morbido, atmosfera eterea, gioielli luminosi, grana delicata ed eleganza primo Novecento."),
  preset("photo-george-hoyningen-huene", "George Hoyningen-Huene", "Trasforma in editoriale Vogue associato a George Hoyningen-Huene: classicismo scultoreo, geometria Art Deco, luce solare netta, pose aristocratiche e bianco e nero impeccabile."),
  preset("photo-horst-p-horst", "Horst P. Horst", "Trasforma in fotografia Vogue associata a Horst P. Horst: luce da studio scolpita, drappeggi, corsetteria elegante, ombre grafiche e glamour classico non esplicito."),
  preset("photo-cecil-beaton", "Cecil Beaton", "Trasforma in ritratto di moda associato a Cecil Beaton: scenografia teatrale, fondali decorativi, luce sofisticata, alta societa e fantasia editoriale."),
  preset("photo-erwin-blumenfeld", "Erwin Blumenfeld", "Trasforma in copertina sperimentale associata a Erwin Blumenfeld: solarizzazione, sovrimpressione, colore audace, silhouette, frammentazione grafica e surrealismo da rivista."),
  preset("photo-louise-dahl-wolfe", "Louise Dahl-Wolfe", "Trasforma in editoriale associato a Louise Dahl-Wolfe: moda in esterni, luce naturale, colore raffinato, ambientazione narrativa e indipendenza moderna del soggetto."),
  preset("photo-toni-frissell", "Toni Frissell", "Trasforma in fotografia di moda associata a Toni Frissell: movimento spontaneo, esterni luminosi, angolazioni basse, eleganza sportiva e atmosfera libera."),
  preset("photo-norman-parkinson", "Norman Parkinson", "Trasforma in editoriale Vogue associato a Norman Parkinson: moda dinamica in location, humour elegante, colore brillante, pose vive e composizione ariosa."),
  preset("photo-clifford-coffin", "Clifford Coffin", "Trasforma in fotografia Vogue associata a Clifford Coffin: composizione modernista, moda ambientata, luce netta, tensione grafica e sofisticazione del dopoguerra."),
  preset("photo-henry-clarke", "Henry Clarke", "Trasforma in editoriale di alta moda associato a Henry Clarke: location internazionali, linee couture precise, colore sontuoso e luce naturale controllata."),
  preset("photo-frances-mclaughlin-gill", "Frances McLaughlin-Gill", "Trasforma in fotografia Vogue associata a Frances McLaughlin-Gill: eleganza narrativa, gesti naturali, interni moderni, luce morbida e moda americana del dopoguerra."),
  preset("photo-lillian-bassman", "Lillian Bassman", "Trasforma in editoriale associato a Lillian Bassman: bianco e nero lirico, figure allungate, sfocature da camera oscura, contrasti vellutati ed eleganza astratta."),
];

export const FASHION_80S_90S_PRESETS: readonly KleinStylePreset[] = [
  preset("photo-bill-king", "Bill King", "Trasforma in editoriale fashion anni Ottanta associato a Bill King: movimento atletico, energia da studio, abiti in volo, luce pulita e composizione dinamica."),
  preset("photo-chris-von-wangenheim", "Chris von Wangenheim", "Trasforma in fashion photography tardo anni Settanta e Ottanta associata a Chris von Wangenheim: flash duro, lusso provocatorio, tensione cinematografica e glamour adulto non esplicito."),
  preset("photo-guy-bourdin", "Guy Bourdin", "Trasforma in editoriale fashion associato a Guy Bourdin: colore saturo, composizione surrealista, suspense narrativa, flash controllato e glamour adulto enigmatico non esplicito."),
  preset("photo-herb-ritts", "Herb Ritts", "Trasforma in fashion photography anni Ottanta-Novanta associata a Herb Ritts: corpi adulti scultorei, sole californiano, fondali naturali, bianco e nero pulito e sensualita elegante non esplicita."),
  preset("photo-peter-lindbergh", "Peter Lindbergh", "Trasforma in editoriale anni Novanta associato a Peter Lindbergh: bianco e nero cinematografico, bellezza naturale, vento, location industriale e ritratto autentico."),
  preset("photo-patrick-demarchelier", "Patrick Demarchelier", "Trasforma in editoriale Vogue anni Ottanta-Novanta associato a Patrick Demarchelier: eleganza spontanea, luce naturale o flash morbido, movimento e lusso sobrio."),
  preset("photo-francesco-scavullo", "Francesco Scavullo", "Trasforma in beauty e fashion portrait associato a Francesco Scavullo: luce levigata, colore ricco, pelle luminosa, trucco grafico e glamour editoriale."),
  preset("photo-terence-donovan", "Terence Donovan", "Trasforma in moda londinese associata a Terence Donovan: energia urbana, contrasto deciso, pose grafiche, strada e studio con spirito anni Sessanta-Ottanta."),
  preset("photo-brian-duffy", "Brian Duffy", "Trasforma in fashion portrait associato a Brian Duffy: grafica britannica, luce netta, colore pop, ironia e composizione editoriale audace."),
  preset("photo-william-klein-fashion", "William Klein — Fashion", "Trasforma in editoriale di moda associato a William Klein: grandangolo, grana, mosso, strada, contatto diretto, flash e layout visivo energico."),
  preset("photo-gian-paolo-barbieri", "Gian Paolo Barbieri", "Trasforma in alta moda italiana associata a Gian Paolo Barbieri: teatralita, luce scolpita, citazioni cinematografiche, colore sontuoso e composizione impeccabile."),
  preset("photo-corinne-day", "Corinne Day", "Trasforma in fashion editoriale anni Novanta associato a Corinne Day: luce disponibile, grana, styling minimale, interni quotidiani e realismo intimo non esplicito."),
  preset("photo-davide-sorrenti", "Davide Sorrenti", "Trasforma in editoriale anni Novanta associato a Davide Sorrenti: luce naturale bassa, grana analogica, vicinanza emotiva, colore desaturato e atmosfera giovanile con soggetti esclusivamente adulti."),
];

export const BOUDOIR_GLAMOUR_PRESETS: readonly KleinStylePreset[] = [
  preset("photo-ruth-bernhard", "Ruth Bernhard", "Trasforma in studio del corpo adulto associato a Ruth Bernhard: bianco e nero formale, luce scultorea, geometria, tessuti e sensualita contemplativa non esplicita."),
  preset("photo-bunny-yeager", "Bunny Yeager", "Trasforma in glamour fotografico associato a Bunny Yeager: pin-up adulta sicura di se, luce solare, colore vintage, pose giocose e styling anni Cinquanta non esplicito."),
  preset("photo-george-hurrell", "George Hurrell", "Trasforma in glamour hollywoodiano associato a George Hurrell: key light teatrale, pelle luminosa, ombre profonde, posa da diva o divo e bianco e nero lussuoso."),
  preset("photo-bruno-bernard", "Bruno Bernard", "Trasforma in glamour hollywoodiano associato a Bruno Bernard: ritratto adulto elegante, luce da studio classica, posa pin-up raffinata e atmosfera vintage non esplicita."),
  preset("photo-andre-de-dienes", "André de Dienes", "Trasforma in glamour outdoor associato ad André de Dienes: luce naturale, spiaggia o paesaggio, spontaneita, toni analogici e sensualita adulta non esplicita."),
  preset("photo-jeanloup-sieff", "Jeanloup Sieff", "Trasforma in fotografia sensuale associata a Jeanloup Sieff: grandangolo, bianco e nero elegante, luce naturale, ombre lunghe, moda e boudoir adulto non esplicito."),
  preset("photo-deborah-turbeville", "Deborah Turbeville", "Trasforma in boudoir editoriale associato a Deborah Turbeville: interni decadenti, luce diffusa, grana, colori polverosi, distanza psicologica e sensualita adulta atmosferica."),
];

export const FETISH_UNDERGROUND_PRESETS: readonly KleinStylePreset[] = [
  preset("photo-john-willie", "John Willie", "Trasforma in illustrazione fotografica fetish vintage associata a John Willie: corsetteria, guanti, tacchi e pose teatrali tra adulti consenzienti, grafica rétro e contenuto non esplicito."),
  preset("photo-irving-klaw", "Irving Klaw", "Trasforma in fotografia fetish pin-up anni Cinquanta associata a Irving Klaw: set da studio semplice, calze, tacchi, corde solo decorative e adulti consenzienti, resa non esplicita."),
  preset("photo-elmer-batters", "Elmer Batters", "Trasforma in fotografia fetish vintage associata a Elmer Batters: attenzione editoriale a calze, scarpe e gambe adulte, colore analogico caldo, set domestico e posa non esplicita."),
  preset("photo-robert-mapplethorpe", "Robert Mapplethorpe", "Trasforma in ritratto da studio associato a Robert Mapplethorpe: bianco e nero formale, simmetria, luce scultorea, pelle e materiali lucidi, soggetti adulti e risultato non esplicito."),
  preset("photo-bob-carlos-clarke", "Bob Carlos Clarke", "Trasforma in fotografia fetish fashion associata a Bob Carlos Clarke: latex nero, riflessi metallici, contrasto lucido, eleganza dark, modelli adulti e contenuto non esplicito."),
  preset("photo-carlo-mollino", "Carlo Mollino", "Trasforma in polaroid boudoir associata a Carlo Mollino: interni progettati, posa adulta costruita, colore istantaneo caldo, specchi e atmosfera privata non esplicita."),
  preset("photo-pierre-molinier", "Pierre Molinier", "Trasforma in fotomontaggio surrealista fetish associato a Pierre Molinier: bianco e nero, specchi, silhouette adulte, calze e maschere, composizione onirica non esplicita."),
];

export const NEWTON_FASHION_CIRCLE_PRESETS: readonly KleinStylePreset[] = [
  preset("photo-alice-springs", "Alice Springs", "Trasforma in ritratto fashion associato ad Alice Springs: sguardo psicologico diretto, luce naturale o flash sobrio, composizione asciutta, eleganza adulta e bianco e nero intimo."),
  preset("photo-mario-testino", "Mario Testino", "Trasforma in grande editoriale glamour contemporaneo: luce solare brillante o flash sofisticato, colore saturo, lusso spontaneo, energia mondana e sensualita adulta non esplicita."),
  preset("photo-ellen-von-unwerth", "Ellen von Unwerth", "Trasforma in editoriale fashion giocoso e provocatorio: bianco e nero contrastato o colore vivace, flash, movimento, humour, autonomia del soggetto adulto e sensualita non esplicita."),
  preset("photo-bettina-rheims", "Bettina Rheims", "Trasforma in ritratto fashion intimo e diretto: luce frontale, pelle naturale, fondale essenziale, tensione psicologica, identita adulta e glamour non esplicito."),
  preset("photo-sante-dorazio", "Sante D'Orazio", "Trasforma in fotografia fashion da diario: grana analogica, luce disponibile e flash, segno spontaneo, backstage, intimita adulta e glamour rilassato non esplicito."),
  preset("photo-jean-baptiste-mondino", "Jean-Baptiste Mondino", "Trasforma in immagine fashion e musicale fortemente grafica: luce da studio scolpita, monocromia o colore audace, styling teatrale, energia pop e posa adulta non esplicita."),
];

export const FASHION_DECADES_PRESETS: readonly KleinStylePreset[] = [
  preset("fashion-1910s", "Moda anni 1910", "Trasforma in editoriale di moda anni 1910: silhouette edoardiana tarda, linea a S semplificata, cappelli importanti, abiti lunghi, sartoria raffinata e fotografia d'atelier pittorialista."),
  preset("fashion-1920s", "Moda anni 1920", "Trasforma in editoriale Jazz Age anni Venti: silhouette dritta, vita bassa, abiti flapper, frange, perline Art Deco, bob haircut e fotografia glamour in bianco e nero."),
  preset("fashion-1930s", "Moda anni 1930", "Trasforma in editoriale anni Trenta: taglio in sbieco, abiti lunghi fluidi, spalle definite, eleganza hollywoodiana, raso luminoso e luce da studio scolpita."),
  preset("fashion-1940s", "Moda anni 1940", "Trasforma in editoriale anni Quaranta: sartoria utility, vita segnata, spalle strutturate, gonne al ginocchio, cappelli compatti e fotografia monocromatica sobria da rivista."),
  preset("fashion-1950s", "Moda anni 1950", "Trasforma in editoriale anni Cinquanta: New Look, vita stretta, gonne ampie o tubini, guanti, couture impeccabile, colore Technicolor e glamour fotografico elegante."),
  preset("fashion-1960s", "Moda anni 1960", "Trasforma in editoriale Swinging Sixties: minigonna, linee ad A, geometrie mod, stivali, colori pop, grafica optical e posa dinamica da rivista."),
  preset("fashion-1970s", "Moda anni 1970", "Trasforma in editoriale anni Settanta: pantaloni a zampa, jersey, suede, boho, disco glamour, stampe psichedeliche, luce calda e fotografia analogica libera."),
  preset("fashion-1980s", "Moda anni 1980", "Trasforma in editoriale power fashion anni Ottanta: spalle importanti, tailoring oversize, colori saturi, pelle, gioielli bold, capelli voluminosi e flash da studio energico."),
  preset("fashion-1990s", "Moda anni 1990", "Trasforma in editoriale anni Novanta: minimalismo, slip dress, tailoring pulito, grunge controllato, palette neutra, supermodel era e fotografia analogica cinematografica."),
  preset("fashion-2000s", "Moda anni 2000", "Trasforma in editoriale Y2K anni Duemila: vita bassa, denim, metallizzati, occhiali colorati, accessori tech, flash digitale diretto e glamour pop lucido."),
  preset("fashion-2010s", "Moda anni 2010", "Trasforma in editoriale anni 2010: street style globale, athleisure, layering, silhouette slim e oversize, social-media polish, luce pulita e color grading editoriale."),
  preset("fashion-2020s", "Moda anni 2020–oggi", "Trasforma in editoriale fashion contemporaneo anni 2020: gender-fluid tailoring, sostenibilita, upcycling, silhouette scultoree, mix couture-streetwear, casting inclusivo di soli adulti e fotografia digitale sofisticata."),
];

export const FASHION_PHOTOGRAPHY_PRESETS: readonly KleinStylePreset[] = [
  ...VOGUE_HIGH_FASHION_PRESETS,
  ...FASHION_80S_90S_PRESETS,
  ...BOUDOIR_GLAMOUR_PRESETS,
  ...FETISH_UNDERGROUND_PRESETS,
  ...NEWTON_FASHION_CIRCLE_PRESETS,
  ...FASHION_DECADES_PRESETS,
];
