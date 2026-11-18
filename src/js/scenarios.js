// Übungsszenarien. Alle Rufnamen, Orte und Lagen sind fiktiv und werden zufällig variiert.
import { callsign } from './evaluator.js';
import { fold } from './normalize.js';

export const STATUS_TEXT = {
  0: 'Priorisierter Sprechwunsch',
  1: 'Einsatzbereit über Funk',
  2: 'Einsatzbereit auf Wache/Unterkunft',
  3: 'Einsatzauftrag übernommen',
  4: 'Am Einsatzort',
  5: 'Sprechwunsch',
  6: 'Nicht einsatzbereit',
  7: 'Patient aufgenommen',
  8: 'Am Transportziel',
  9: 'Fremdanmeldung',
};

export const TALKGROUPS = ['THW OV', 'THW EA 1', 'THW EA 2', 'LST Kreis', 'BOS Info'];

export function makeRng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  rnd.int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  return rnd;
}

const ORTE = ['Musterstadt', 'Neuhausen', 'Lindenberg', 'Steinbach', 'Waldheim', 'Rosenfeld', 'Birkenau', 'Talstadt', 'Eichenau', 'Bergheim'];
const STRASSEN = [
  'Hauptstraße', 'Bahnhofstraße', 'Lindenweg', 'Industriestraße', 'Mühlenweg', 'Schulstraße', 'Gartenstraße',
  'Kirchplatz', 'Raiffeisenstraße', 'Brunnenweg', 'Am Sportplatz', 'Ringstraße', 'Talweg', 'Kastanienallee',
];
const SPELL_ITEMS = [
  ['das Gehöft', 'Quast'],
  ['den Ortsteil', 'Pyrbaum'],
  ['die Firma', 'Kexel'],
  ['den Weiler', 'Zwyck'],
  ['den Hof', 'Vogtei'],
  ['das Gewerbegebiet', 'Ixheim'],
  ['das Waldstück', 'Jochwald'],
  ['die Firma', 'Brixner'],
];
const ABSCHNITTE = ['Nord', 'Süd', 'Ost', 'West'];

/** Suchmuster für eine Straße ("Hauptstraße" -> ["hauptstr*", "haupt strasse"]). */
export function streetAny(street) {
  const f = fold(street);
  const out = [f];
  const m = f.match(/^(.*?)(strasse|weg|platz|allee)$/);
  if (m && m[1]) {
    out.push(m[1] + (m[2] === 'strasse' ? 'str*' : m[2]));
    out.push(`${m[1]} ${m[2]}`);
  }
  if (f.startsWith('am ')) out.push(f.slice(3));
  return out;
}

/**
 * Ortsname aus den Einstellungen bereinigen: nur Buchstaben, Leerzeichen, Bindestrich und Punkt
 * (keine Ziffern – die würden mit den Kennzahlen der Rufnamen verwechselt). Leer = kein eigener Ort.
 */
export function cleanPlace(s) {
  return String(s || '')
    .replace(/[^\p{L}\s.-]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, 40);
}

/**
 * Erzeugt den Kontext (Rufnamen, Orte) für ein Szenario.
 * opts.ort = eigener Ortsverband, opts.lstOrt = Ort im Rufnamen der Leitstelle (Standard: wie der OV).
 */
export function makeContext(rnd, opts = {}) {
  const picked = rnd.pick(ORTE);
  const ort = cleanPlace(opts.ort) || picked;
  const lstOrt = cleanPlace(opts.lstOrt) || ort;
  const zug = rnd.int(1, 2);
  const own = callsign('Heros', ort, `2${zug}/52`);
  const ztr = callsign('Heros', ort, `2${zug}/10`);
  const sib = rnd() < 0.5 ? callsign('Heros', ort, `2${3 - zug}/52`) : callsign('Heros', ort, `2${zug}/53`);
  const fgr = callsign('Heros', ort, `2${zug}/62`);
  const lst = callsign('Florian', lstOrt);
  const street = rnd.pick(STRASSEN);
  const nr = rnd.int(2, 48);
  return {
    ort,
    zug,
    own,
    ztr,
    sib,
    fgr,
    lst,
    street,
    nr,
    tgEA: rnd.pick(['THW EA 1', 'THW EA 2']),
    unit: `GKW I, ${zug}. Technischer Zug, OV ${ort}`,
    rnd,
  };
}

// Textbausteine
const call = (to, from) => `${to.full} von ${from.full}, kommen.`;
const hier = (x) => `Hier ${x.full}, kommen.`;

function rxHier(who, cs) {
  return { kind: 'rx', who, text: hier(cs), isHier: true };
}

const ENDE_INFO =
  'In der Regel beendet die Stelle das Gespräch, die es begonnen hat. Ein "Verstanden, Ende" ist hier aber vertretbar.';

export function station(ctx) {
  return {
    ztr: { name: `Zugtrupp (${ctx.ztr.full})`, cs: ctx.ztr },
    lst: { name: `Leitstelle (${ctx.lst.full})`, cs: ctx.lst },
    sib: { name: ctx.sib.full, cs: ctx.sib },
    fgr: { name: ctx.fgr.full, cs: ctx.fgr },
  };
}

// --------------------------------------------------------------------------
export const SCENARIOS = [
  {
    id: 'auftrag',
    title: 'Einsatzauftrag empfangen',
    level: 'Grundlagen',
    desc: 'Der Zugtrupp ruft dich und erteilt einen Auftrag. Anruf beantworten und Auftrag quittieren.',
    build(ctx) {
      const { own, ztr, street, nr } = ctx;
      return {
        tg: ctx.tgEA,
        briefing: `Ihr steht im Bereitstellungsraum. Hörbereitschaft auf Gesprächsgruppe ${ctx.tgEA} – warte auf Anrufe.`,
        steps: [
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'ztr', text: call(own, ztr) },
          {
            kind: 'tx',
            label: 'Anruf beantworten',
            expect: { type: 'answer', own, target: ztr },
            sample: `Hier ${own.full}, kommen.`,
          },
          {
            kind: 'rx',
            who: 'ztr',
            text: `Fahren Sie zur Einsatzstelle ${street} ${nr}. Dort übernehmen Sie die Ausleuchtung der Einsatzstelle, kommen.`,
          },
          {
            kind: 'tx',
            label: 'Auftrag quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'kommen',
              endeOk: ENDE_INFO,
              content: [
                { label: `Einsatzstelle ${street} wiederholt`, any: streetAny(street), level: 'warn' },
                { label: `Hausnummer ${nr} wiederholt`, any: [`#${nr}`], level: 'warn' },
                { label: 'Auftrag (Ausleuchtung) wiederholt', any: ['ausleucht*', 'beleucht*', 'licht*'], level: 'minor' },
              ],
            },
            sample: `Verstanden, Einsatzstelle ${street} ${nr}, Ausleuchtung der Einsatzstelle, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Ende.', skipIfUserEnded: true },
        ],
      };
    },
  },
  {
    id: 'eintreffen',
    title: 'Eintreffen melden',
    level: 'Grundlagen',
    desc: 'Status setzen und dem Zugtrupp das Eintreffen an der Einsatzstelle melden.',
    build(ctx) {
      const { own, ztr, street, nr } = ctx;
      return {
        tg: ctx.tgEA,
        briefing: `Ihr seid an der Einsatzstelle ${street} ${nr} eingetroffen.`,
        steps: [
          { kind: 'task', text: 'Setze am Funkgerät den Status „Am Einsatzort“.' },
          { kind: 'status', value: 4 },
          { kind: 'task', text: `Melde dem Zugtrupp (${ztr.full}) euer Eintreffen an der Einsatzstelle.` },
          {
            kind: 'tx',
            label: 'Zugtrupp anrufen',
            expect: { type: 'call', own, target: ztr },
            sample: `${ztr.full} von ${own.full}, kommen.`,
          },
          rxHier('ztr', ztr),
          {
            kind: 'tx',
            label: 'Eintreffen melden',
            expect: {
              type: 'message',
              own,
              content: [
                {
                  label: 'Eintreffen gemeldet',
                  any: ['eingetroffen', 'angekommen', 'vor ort', 'am einsatzort', 'an der einsatzstelle', 'eintreffen', 'an einsatzstelle'],
                  level: 'error',
                  essential: true,
                },
                { label: `Einsatzstelle (${street}) genannt`, any: streetAny(street), level: 'minor' },
              ],
            },
            sample: `An Einsatzstelle ${street} ${nr} eingetroffen, kommen.`,
          },
          {
            kind: 'rx',
            who: 'ztr',
            text: 'Verstanden. Erkunden Sie die Lage und geben Sie anschließend eine Lagemeldung, kommen.',
          },
          {
            kind: 'tx',
            label: 'Quittieren und beenden',
            expect: {
              type: 'ack',
              own,
              ending: 'ende',
              content: [{ label: 'Auftrag (Erkundung/Lagemeldung) wiederholt', any: ['erkund*', 'lage*'], level: 'info' }],
            },
            sample: 'Verstanden, erkunden und Lagemeldung, Ende.',
          },
        ],
      };
    },
  },
  {
    id: 'lagemeldung',
    title: 'Lagemeldung abgeben',
    level: 'Fortgeschritten',
    desc: 'Erkundungsergebnis vollständig und knapp an den Zugtrupp übermitteln.',
    build(ctx) {
      const { own, ztr, street, rnd } = ctx;
      const variant = rnd.int(0, 2);
      let lage;
      let content;
      let reply;
      let sample;
      if (variant === 0) {
        const cm = rnd.pick([40, 60, 80, 120]);
        const p = rnd.int(2, 3);
        lage = `Keller eines Wohnhauses in der ${street} unter Wasser, Wasserstand ca. ${cm} cm. Keine Personen in Gefahr. Ihr benötigt ${p} zusätzliche Tauchpumpen.`;
        content = [
          { label: 'Keller unter Wasser', any: ['keller', 'wasser*', 'ueberflut*', 'vollgelaufen'], level: 'error', essential: true },
          { label: `Wasserstand ${cm} cm`, any: [`#${cm}`], level: 'warn' },
          { label: 'Keine Personen in Gefahr', any: ['keine personen', 'niemand', 'keine verletzten', 'personen', 'keine gefahr'], level: 'warn' },
          { label: `Bedarf: ${p} Tauchpumpen`, any: ['tauchpumpe*', 'pumpe*'], level: 'error', essential: true },
          { label: `Anzahl Pumpen (${p})`, any: [`#${p}`], level: 'warn' },
        ];
        reply = `Verstanden, ${p === 2 ? 'zwo' : p} Tauchpumpen werden nachgeführt, kommen.`;
        sample = `Lagemeldung: Keller ${street} unter Wasser, Wasserstand circa ${cm} Zentimeter, keine Personen in Gefahr. Benötigen ${p === 2 ? 'zwo' : p} weitere Tauchpumpen, kommen.`;
      } else if (variant === 1) {
        const m = rnd.pick([15, 20, 25, 30]);
        const min = rnd.pick([30, 45, 60]);
        lage = `Ein Baum (ca. ${m} m) liegt auf der Fahrbahn der ${street}. Die Straße ist voll gesperrt, keine Verletzten. Beseitigung dauert ca. ${min} Minuten.`;
        content = [
          { label: 'Baum auf Fahrbahn', any: ['baum', 'fahrbahn'], level: 'error', essential: true },
          { label: 'Straße gesperrt', any: ['gesperrt', 'sperrung', 'voll gesperrt', 'sperre'], level: 'warn' },
          { label: 'Keine Verletzten', any: ['keine verletzten', 'verletzt*', 'niemand'], level: 'warn' },
          { label: `Dauer ca. ${min} Minuten`, any: [`#${min}`], level: 'warn' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'minor' },
        ];
        reply = 'Verstanden, melden Sie, wenn die Fahrbahn wieder frei ist, kommen.';
        sample = `Lagemeldung: Baum auf Fahrbahn ${street}, Straße voll gesperrt, keine Verletzten. Beseitigung dauert circa ${min} Minuten, kommen.`;
      } else {
        const n = rnd.int(3, 9);
        lage = `Das Dach eines Wohnhauses in der ${street} ist durch Sturm beschädigt. ${n} Bewohner wurden in Sicherheit gebracht, keine Verletzten. Ihr benötigt Abdeckplanen.`;
        content = [
          { label: 'Dach beschädigt', any: ['dach*'], level: 'error', essential: true },
          { label: `${n} Bewohner in Sicherheit`, any: [`#${n}`], level: 'warn' },
          { label: 'Keine Verletzten', any: ['keine verletzten', 'verletzt*', 'niemand'], level: 'warn' },
          { label: 'Bedarf: Abdeckplanen', any: ['abdeckplane*', 'plane*', 'planen'], level: 'error', essential: true },
        ];
        reply = 'Verstanden, Abdeckplanen werden gebracht, kommen.';
        sample = `Lagemeldung: Dach Wohnhaus ${street} durch Sturm beschädigt, ${n} Bewohner in Sicherheit, keine Verletzten. Benötigen Abdeckplanen, kommen.`;
      }
      return {
        tg: ctx.tgEA,
        briefing: `Erkundungsergebnis: ${lage}`,
        steps: [
          { kind: 'task', text: `Gib dem Zugtrupp (${ztr.full}) eine Lagemeldung mit allen wichtigen Informationen.` },
          {
            kind: 'tx',
            label: 'Zugtrupp anrufen',
            expect: { type: 'call', own, target: ztr },
            sample: `${ztr.full} von ${own.full}, kommen.`,
          },
          rxHier('ztr', ztr),
          { kind: 'tx', label: 'Lagemeldung', expect: { type: 'message', own, content }, sample },
          { kind: 'rx', who: 'ztr', text: reply },
          {
            kind: 'tx',
            label: 'Gespräch beenden',
            expect: { type: 'end', own },
            sample: 'Verstanden, Ende.',
          },
        ],
      };
    },
  },
  {
    id: 'nachforderung',
    title: 'Nachforderung',
    level: 'Fortgeschritten',
    desc: 'Material beim Zugtrupp nachfordern – Menge, Art und Ort vollständig übermitteln.',
    build(ctx) {
      const { own, ztr, street, nr, rnd } = ctx;
      const n = rnd.pick([100, 150, 200, 300, 500]);
      const second = rnd.pick([
        { name: 'einen Radlader', key: ['radlader*'], say: 'ein Radlader' },
        { name: 'einen Stromerzeuger', key: ['stromerzeuger*', 'aggregat*', 'generator*'], say: 'ein Stromerzeuger' },
        { name: 'einen Lichtmast', key: ['lichtmast*'], say: 'ein Lichtmast' },
      ]);
      return {
        tg: ctx.tgEA,
        briefing: `Einsatzstelle ${street} ${nr}: Der Damm muss erhöht werden. Ihr benötigt ${n} gefüllte Sandsäcke und ${second.name}.`,
        steps: [
          { kind: 'task', text: `Fordere beim Zugtrupp (${ztr.full}) das benötigte Material nach.` },
          {
            kind: 'tx',
            label: 'Zugtrupp anrufen',
            expect: { type: 'call', own, target: ztr },
            sample: `${ztr.full} von ${own.full}, kommen.`,
          },
          rxHier('ztr', ztr),
          {
            kind: 'tx',
            label: 'Nachforderung',
            expect: {
              type: 'message',
              own,
              content: [
                { label: 'Sandsäcke', any: ['sandsa*', 'sandsack*', 'saecke'], level: 'error', essential: true },
                { label: `Menge (${n})`, any: [`#${n}`], level: 'error' },
                { label: second.name.replace(/^einen /, ''), any: second.key, level: 'error' },
                { label: `Ort (${street})`, any: streetAny(street), level: 'warn' },
              ],
            },
            sample: `Benötigen für Einsatzstelle ${street} ${nr}: ${n} gefüllte Sandsäcke und ${second.name}, kommen.`,
          },
          {
            kind: 'rx',
            who: 'ztr',
            text: `Verstanden, ${n} Sandsäcke und ${second.say} zur ${street}. Eintreffen in circa 30 Minuten, kommen.`,
          },
          { kind: 'tx', label: 'Gespräch beenden', expect: { type: 'end', own }, sample: 'Verstanden, Ende.' },
        ],
      };
    },
  },
  {
    id: 'buchstabieren',
    title: 'Buchstabieren',
    level: 'Grundlagen',
    desc: 'Die Leitstelle fragt einen schwierigen Namen ab. Mit der Buchstabiertafel (DIN 5009) antworten.',
    build(ctx) {
      const { own, lst, rnd } = ctx;
      const [art, name] = rnd.pick(SPELL_ITEMS);
      const artNom = art.replace(/^(das|den|die) /, '');
      return {
        tg: 'LST Kreis',
        briefing: `Ihr seid am Objekt „${artNom} ${name}“ eingesetzt. Gesprächsgruppe: LST Kreis.`,
        steps: [
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'lst', text: call(own, lst) },
          { kind: 'tx', label: 'Anruf beantworten', expect: { type: 'answer', own, target: lst }, sample: `Hier ${own.full}, kommen.` },
          {
            kind: 'rx',
            who: 'lst',
            text: `Nennen Sie den Namen für ${art}, an dem Sie eingesetzt sind. Buchstabieren Sie, kommen.`,
          },
          {
            kind: 'tx',
            label: 'Buchstabieren',
            expect: { type: 'message', own, spell: name },
            sampleSpell: name,
          },
          { kind: 'rx', who: 'lst', text: `Verstanden, ${name}. Ende.` },
        ],
      };
    },
  },
  {
    id: 'verstuemmelt',
    title: 'Verstümmelte Nachricht',
    level: 'Fortgeschritten',
    desc: 'Ein Teil der Nachricht geht im Rauschen unter. Richtig reagieren und Wiederholung anfordern.',
    build(ctx) {
      const { own, ztr, street, nr, rnd } = ctx;
      const ab = rnd.pick(ABSCHNITTE);
      const msg = `Wechseln Sie mit Ihrem Fahrzeug zum Abschnitt ${ab}, ${street} ${nr}. Melden Sie sich dort beim Abschnittsleiter, kommen.`;
      return {
        tg: ctx.tgEA,
        briefing: `Ihr seid im Einsatz. Hörbereitschaft auf ${ctx.tgEA}. Die Funkverbindung ist heute schlecht.`,
        steps: [
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'ztr', text: call(own, ztr) },
          { kind: 'tx', label: 'Anruf beantworten', expect: { type: 'answer', own, target: ztr }, sample: `Hier ${own.full}, kommen.` },
          { kind: 'rx', who: 'ztr', text: msg, garble: true },
          {
            kind: 'tx',
            label: 'Auf Störung reagieren',
            expect: { type: 'repeat', own },
            sample: 'Wiederholen, kommen.',
          },
          { kind: 'rx', who: 'ztr', text: `Ich wiederhole: ${msg}`, isRepeat: true },
          {
            kind: 'tx',
            label: 'Auftrag quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'kommen',
              endeOk: ENDE_INFO,
              content: [
                { label: `Abschnitt ${ab}`, any: [fold(ab)], level: 'warn' },
                { label: `${street} ${nr}`, any: streetAny(street), level: 'warn' },
              ],
            },
            sample: `Verstanden, Abschnitt ${ab}, ${street} ${nr}, beim Abschnittsleiter melden, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Ende.', skipIfUserEnded: true },
        ],
      };
    },
  },
  {
    id: 'funkprobe',
    title: 'Funkprobe',
    level: 'Grundlagen',
    desc: 'Zu Dienstbeginn die Funkverbindung prüfen – selbst durchführen und beantworten.',
    build(ctx) {
      const { own, ztr } = ctx;
      return {
        tg: ctx.tgEA,
        briefing: `Dienstbeginn. Prüfe die Funkverbindung auf Gesprächsgruppe ${ctx.tgEA}.`,
        steps: [
          { kind: 'task', text: `Führe eine Funkprobe mit dem Zugtrupp (${ztr.full}) durch.` },
          {
            kind: 'tx',
            label: 'Funkprobe anfordern',
            expect: { type: 'call', own, target: ztr, funkprobe: true },
            sample: `${ztr.full} von ${own.full}, Funkprobe, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: `Hier ${ztr.full}, verstehe Sie gut, kommen.` },
          { kind: 'tx', label: 'Beenden', expect: { type: 'end', own }, sample: 'Verstanden, Ende.' },
          { kind: 'task', text: 'Bleib auf Empfang – der Zugtrupp prüft nun auch deine Verbindung.' },
          { kind: 'pause', seconds: 3 },
          { kind: 'rx', who: 'ztr', text: `${own.full} von ${ztr.full}, Funkprobe, kommen.` },
          {
            kind: 'tx',
            label: 'Funkprobe beantworten',
            expect: { type: 'funkprobe', own, target: ztr },
            sample: `Hier ${own.full}, verstehe Sie gut, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Ende.', skipIfUserEnded: true },
        ],
      };
    },
  },
  {
    id: 'warten',
    title: 'Leitstelle: „Warten“',
    level: 'Fortgeschritten',
    desc: 'Einsatzbereitschaft an die Leitstelle melden. Die Leitstelle ist ausgelastet und ordnet „Warten“ an.',
    build(ctx) {
      const { own, lst } = ctx;
      return {
        tg: 'LST Kreis',
        briefing: 'Euer Einsatz ist beendet, Fahrzeug und Besatzung sind wieder einsatzbereit. Gesprächsgruppe: LST Kreis.',
        steps: [
          { kind: 'task', text: 'Setze den passenden Status: wieder einsatzbereit (über Funk erreichbar).' },
          { kind: 'status', value: 1 },
          { kind: 'task', text: `Melde der Leitstelle (${lst.full}) per Sprechfunk eure Einsatzbereitschaft.` },
          {
            kind: 'tx',
            label: 'Leitstelle anrufen',
            expect: { type: 'call', own, target: lst },
            sample: `${lst.full} von ${own.full}, kommen.`,
          },
          { kind: 'rx', who: 'lst', text: `Hier ${lst.full}, warten.`, noCombine: true },
          { kind: 'silence', seconds: 10, label: '„Warten“ eingehalten' },
          { kind: 'rx', who: 'lst', text: `${own.full}, kommen.` },
          {
            kind: 'tx',
            label: 'Meldung absetzen',
            expect: {
              type: 'message',
              own,
              content: [{ label: 'Einsatzbereitschaft gemeldet', any: ['einsatzbereit*', 'wieder bereit', 'bereit'], level: 'error', essential: true }],
            },
            sample: `${own.full} wieder einsatzbereit, kommen.`,
          },
          { kind: 'rx', who: 'lst', text: 'Verstanden, kommen.' },
          { kind: 'tx', label: 'Gespräch beenden', expect: { type: 'end', own }, sample: 'Ende.' },
        ],
      };
    },
  },
  {
    id: 'status',
    title: 'Status & Sprechwunsch',
    level: 'Grundlagen',
    desc: 'Statusmeldungen am Funkgerät bedienen, Sprechwunsch absetzen und auf die Sprechaufforderung reagieren.',
    build(ctx) {
      const { own, lst, street } = ctx;
      return {
        tg: 'LST Kreis',
        briefing: `Alarmierung: Unterstützung der Feuerwehr in der ${street}. Gesprächsgruppe: LST Kreis.`,
        steps: [
          { kind: 'task', text: 'Ihr habt den Einsatzauftrag übernommen und rückt aus – Status setzen.' },
          { kind: 'status', value: 3 },
          { kind: 'pause', seconds: 2 },
          { kind: 'task', text: 'Ihr seid an der Einsatzstelle angekommen – Status setzen.' },
          { kind: 'status', value: 4 },
          { kind: 'task', text: 'Vor Ort ist niemand zu sehen. Fordere per Status ein Gespräch mit der Leitstelle an (nicht dringend).' },
          { kind: 'status', value: 5 },
          { kind: 'pause', seconds: 3 },
          { kind: 'statusIn', code: 'J', text: 'Sprechaufforderung' },
          {
            kind: 'task',
            text: `Die Leitstelle hat mit „J – Sprechaufforderung“ geantwortet. Rufe die Leitstelle (${lst.full}) und frage nach dem Ansprechpartner vor Ort.`,
          },
          {
            kind: 'tx',
            label: 'Leitstelle anrufen',
            expect: { type: 'call', own, target: lst },
            sample: `${lst.full} von ${own.full}, kommen.`,
          },
          rxHier('lst', lst),
          {
            kind: 'tx',
            label: 'Frage stellen',
            expect: {
              type: 'message',
              own,
              content: [
                {
                  label: 'Nach Ansprechpartner gefragt',
                  any: ['ansprechpartner*', 'ansprechperson', 'einsatzleit*', 'kontakt*', 'wer', 'wo', 'melden'],
                  level: 'error',
                  essential: true,
                },
              ],
            },
            sample: 'Sind an Einsatzstelle, kein Ansprechpartner vor Ort. Wo und bei wem sollen wir uns melden, kommen.',
          },
          {
            kind: 'rx',
            who: 'lst',
            text: 'Melden Sie sich beim Einsatzleiter der Feuerwehr am Einsatzleitwagen, Einmündung Schulstraße, kommen.',
          },
          {
            kind: 'tx',
            label: 'Quittieren und beenden',
            expect: {
              type: 'ack',
              own,
              ending: 'ende',
              content: [{ label: 'Einsatzleiter/Einsatzleitwagen wiederholt', any: ['einsatzleit*', 'elw'], level: 'minor' }],
            },
            sample: 'Verstanden, Einsatzleiter am Einsatzleitwagen, Ende.',
          },
        ],
      };
    },
  },
  {
    id: 'hoerbereitschaft',
    title: 'Hörbereitschaft & Fremdverkehr',
    level: 'Fortgeschritten',
    desc: 'Auf dem Kanal herrscht Betrieb. Nur reagieren, wenn du wirklich gerufen wirst – Vorsicht bei ähnlichen Rufnamen!',
    build(ctx) {
      const { own, ztr, sib, fgr, street, nr, rnd } = ctx;
      const ab = rnd.pick(ABSCHNITTE);
      return {
        tg: ctx.tgEA,
        briefing: `Hörbereitschaft auf ${ctx.tgEA}. Mehrere Einheiten sind im Einsatz. Du bist ${own.full}.`,
        steps: [
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'ztr', text: call(sib, ztr), chatter: true },
          { kind: 'rx', who: 'sib', text: hier(sib), chatter: true },
          { kind: 'rx', who: 'ztr', text: `Bringen Sie zwo Stromerzeuger zum Abschnitt ${ab}, kommen.`, chatter: true },
          { kind: 'rx', who: 'sib', text: `Verstanden, zwo Stromerzeuger zum Abschnitt ${ab}, kommen.`, chatter: true },
          { kind: 'rx', who: 'ztr', text: 'Ende.', chatter: true },
          { kind: 'rx', who: 'fgr', text: call(ztr, fgr), chatter: true },
          { kind: 'rx', who: 'ztr', text: hier(ztr), chatter: true },
          { kind: 'rx', who: 'fgr', text: 'Pumpen laufen, Wasserstand sinkt, kommen.', chatter: true },
          { kind: 'rx', who: 'ztr', text: 'Verstanden, kommen.', chatter: true },
          { kind: 'rx', who: 'fgr', text: 'Ende.', chatter: true },
          { kind: 'chatterEnd', label: 'Fremdverkehr korrekt nicht gestört' },
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'ztr', text: call(own, ztr) },
          { kind: 'tx', label: 'Anruf beantworten', expect: { type: 'answer', own, target: ztr }, sample: `Hier ${own.full}, kommen.` },
          { kind: 'rx', who: 'ztr', text: `Unterstützen Sie die Fachgruppe am Abschnitt ${ab}, ${street} ${nr}, kommen.` },
          {
            kind: 'tx',
            label: 'Auftrag quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'kommen',
              endeOk: ENDE_INFO,
              content: [
                { label: `Abschnitt ${ab}`, any: [fold(ab)], level: 'warn' },
                { label: `${street} ${nr}`, any: streetAny(street), level: 'minor' },
              ],
            },
            sample: `Verstanden, Unterstützung Fachgruppe Abschnitt ${ab}, ${street} ${nr}, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Ende.', skipIfUserEnded: true },
        ],
      };
    },
  },
  {
    id: 'einruecken',
    title: 'Einsatzende & Einrücken',
    level: 'Grundlagen',
    desc: 'Der Zugtrupp beendet euren Auftrag. Quittieren und anschließend den richtigen Status setzen.',
    build(ctx) {
      const { own, ztr } = ctx;
      return {
        tg: ctx.tgEA,
        briefing: `Die Arbeiten an der Einsatzstelle sind fast abgeschlossen. Hörbereitschaft auf ${ctx.tgEA}.`,
        steps: [
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'ztr', text: call(own, ztr) },
          { kind: 'tx', label: 'Anruf beantworten', expect: { type: 'answer', own, target: ztr }, sample: `Hier ${own.full}, kommen.` },
          {
            kind: 'rx',
            who: 'ztr',
            text: 'Ihr Auftrag ist beendet. Rücken Sie in die Unterkunft ein und melden Sie sich dort einsatzbereit, kommen.',
          },
          {
            kind: 'tx',
            label: 'Auftrag quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'kommen',
              endeOk: ENDE_INFO,
              content: [{ label: 'Einrücken wiederholt', any: ['einruecken', 'einrueck*', 'unterkunft'], level: 'minor' }],
            },
            sample: 'Verstanden, rücken in Unterkunft ein, kommen.',
          },
          { kind: 'rx', who: 'ztr', text: 'Ende.', skipIfUserEnded: true },
          { kind: 'task', text: 'Ihr fahrt zurück und seid unterwegs über Funk erreichbar und einsatzbereit – Status setzen.' },
          { kind: 'status', value: 1 },
          { kind: 'pause', seconds: 2 },
          { kind: 'task', text: 'Ihr seid in der Unterkunft angekommen und wieder einsatzbereit – Status setzen.' },
          { kind: 'status', value: 2 },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'rueckfragen',
    title: 'Erkundung mit Rückfragen',
    level: 'Fortgeschritten',
    desc: 'Erstmeldung abgeben – danach fragt der Zugtrupp mehrfach nach. Jede Antwort muss sitzen.',
    build(ctx) {
      const { own, ztr, street, nr, rnd } = ctx;
      const pers = rnd.int(3, 12);
      const hours = rnd.pick([2, 3, 4]);
      const need = rnd.pick([
        { name: 'einen Stromerzeuger', key: ['stromerzeuger*', 'aggregat*', 'generator*'] },
        { name: 'einen Lichtmast', key: ['lichtmast*', 'beleucht*'] },
        { name: 'die Fachgruppe Räumen', key: ['raeum*', 'fachgruppe*'] },
      ]);
      const hstr = hours === 2 ? 'zwo' : hours;
      return {
        tg: ctx.tgEA,
        briefing: `Erkundung ${street} ${nr}: Sturmschaden an einem Mehrfamilienhaus, Teile der Fassade sind abgestürzt. ${pers} Bewohner wurden evakuiert, niemand verletzt. Die Statik ist unklar, ein Baufachberater wird benötigt. Arbeiten dauern ca. ${hours} Stunden. Zusätzlich braucht ihr ${need.name}.`,
        steps: [
          { kind: 'task', text: `Gib dem Zugtrupp (${ztr.full}) eine kurze Erstmeldung. Rechne mit Rückfragen – die Lage steht links.` },
          { kind: 'tx', label: 'Zugtrupp anrufen', expect: { type: 'call', own, target: ztr }, sample: `${ztr.full} von ${own.full}, kommen.` },
          rxHier('ztr', ztr),
          {
            kind: 'tx',
            label: 'Erstmeldung',
            expect: {
              type: 'message',
              own,
              content: [
                { label: 'Fassade/Gebäudeschaden', any: ['fassade*', 'gebaeude*', 'haus', 'sturmschaden', 'schaden'], level: 'error', essential: true },
                { label: `Ort (${street})`, any: streetAny(street), level: 'warn' },
              ],
            },
            sample: `Erstmeldung ${street} ${nr}: Sturmschaden an Mehrfamilienhaus, Fassadenteile abgestürzt, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden. Sind Personen betroffen, kommen.' },
          {
            kind: 'tx',
            label: 'Rückfrage 1: Personen',
            expect: {
              type: 'message',
              own,
              content: [
                { label: `${pers} Bewohner evakuiert`, any: [`#${pers}`], level: 'error', essential: true },
                { label: 'Keine Verletzten', any: ['keine verletzten', 'niemand', 'verletzt*', 'unverletzt'], level: 'warn' },
              ],
            },
            sample: `${pers} Bewohner evakuiert, keine Verletzten, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden. Wie ist die Statik des Gebäudes, kommen.' },
          {
            kind: 'tx',
            label: 'Rückfrage 2: Statik',
            expect: {
              type: 'message',
              own,
              content: [
                { label: 'Statik unklar', any: ['unklar', 'statik', 'unsicher', 'nicht beurteil*'], level: 'error', essential: true },
                { label: 'Baufachberater angefordert', any: ['baufachberater*', 'fachberater*', 'bfb', 'statiker*'], level: 'warn' },
              ],
            },
            sample: 'Statik unklar, benötigen Baufachberater, kommen.',
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden. Wie lange dauern die Arbeiten und was benötigen Sie noch, kommen.' },
          {
            kind: 'tx',
            label: 'Rückfrage 3: Dauer & Bedarf',
            expect: {
              type: 'message',
              own,
              content: [
                { label: `Dauer ca. ${hours} Stunden`, any: [`#${hours}`], level: 'warn' },
                { label: `Bedarf: ${need.name.replace(/^(einen|die) /, '')}`, any: need.key, level: 'error', essential: true },
              ],
            },
            sample: `Arbeiten dauern circa ${hstr} Stunden, benötigen zusätzlich ${need.name}, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden, Baufachberater und Nachforderung werden veranlasst, kommen.' },
          { kind: 'tx', label: 'Gespräch beenden', expect: { type: 'end', own }, sample: 'Verstanden, Ende.' },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'staerke',
    title: 'Stärkemeldung & Abmarsch',
    level: 'Grundlagen',
    desc: 'Stärke im Format Führer/Unterführer/Helfer/Gesamt melden, Auftrag aufnehmen und Abmarschzeit nennen.',
    build(ctx) {
      const { own, ztr, street, nr, rnd } = ctx;
      const uf = rnd.int(1, 2);
      const h = rnd.int(4, 8);
      const total = uf + h;
      const min = rnd.pick([5, 10, 15]);
      const say = (n) => (n === 2 ? 'zwo' : String(n));
      return {
        tg: ctx.tgEA,
        briefing: `Eure Besatzung: 0 Führer, ${uf} Unterführer, ${h} Helfer – Stärke 0/${uf}/${h}/${total}. Ihr seid in ${min} Minuten abmarschbereit.`,
        steps: [
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'ztr', text: call(own, ztr) },
          { kind: 'tx', label: 'Anruf beantworten', expect: { type: 'answer', own, target: ztr }, sample: `Hier ${own.full}, kommen.` },
          { kind: 'rx', who: 'ztr', text: 'Melden Sie Ihre Stärke, kommen.' },
          {
            kind: 'tx',
            label: 'Stärkemeldung',
            expect: {
              type: 'message',
              own,
              content: [{ label: `Stärke 0/${uf}/${h}/${total}`, any: [`#0${uf}${h}${total}`], level: 'error', essential: true }],
            },
            sample: `Stärke null, ${say(uf)}, ${say(h)}, ${say(total)}, kommen.`,
          },
          {
            kind: 'rx',
            who: 'ztr',
            text: `Verstanden. Ihr Auftrag: Absichern und Ausleuchten der Einsatzstelle ${street} ${nr}. Wann sind Sie abmarschbereit, kommen.`,
          },
          {
            kind: 'tx',
            label: 'Auftrag quittieren & Zeit melden',
            expect: {
              type: 'message',
              own,
              content: [
                { label: 'Auftrag quittiert', any: ['verstanden'], level: 'warn' },
                { label: `Einsatzstelle ${street}`, any: streetAny(street), level: 'warn' },
                { label: `Abmarschbereit in ${min} Minuten`, any: [`#${min}`], level: 'error', essential: true },
              ],
            },
            sample: `Verstanden, absichern und ausleuchten ${street} ${nr}. Abmarschbereit in ${min} Minuten, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden, melden Sie den Abmarsch, Ende.' },
          { kind: 'pause', seconds: 3 },
          { kind: 'task', text: `${min} Minuten später: Ihr rückt ab. Melde dem Zugtrupp den Abmarsch.` },
          { kind: 'tx', label: 'Zugtrupp anrufen', expect: { type: 'call', own, target: ztr }, sample: `${ztr.full} von ${own.full}, kommen.` },
          rxHier('ztr', ztr),
          {
            kind: 'tx',
            label: 'Abmarsch melden',
            expect: {
              type: 'message',
              own,
              content: [{ label: 'Abmarsch gemeldet', any: ['abmarsch*', 'abgeruckt', 'abgerueckt', 'unterwegs', 'ausgerueckt', 'rueck* ab', 'fahren los', 'marschieren'], level: 'error', essential: true }],
            },
            sample: `Abmarsch zur ${street} ${nr}, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden, kommen.' },
          { kind: 'tx', label: 'Gespräch beenden', expect: { type: 'end', own }, sample: 'Ende.' },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'marsch',
    title: 'Marsch zum Einsatzort',
    level: 'Fortgeschritten',
    desc: 'Marschauftrag aufnehmen, Kontrollpunkt melden, Verzögerung melden und Ankunft durchgeben – drei Gespräche am Stück.',
    build(ctx) {
      const { own, ztr, street, rnd } = ctx;
      const route = rnd.pick(['B 12', 'B 27', 'L 310', 'B 3']);
      const routeSay = route.replace(' ', ' ');
      const tp = rnd.pick(['Parkplatz Sporthalle', 'Feuerwehrhaus', 'Autohof', 'Parkplatz Baumarkt']);
      const tpKey = tp.split(' ').pop().toLowerCase().replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue');
      const delay = rnd.pick([10, 15, 20]);
      const umleitung = rnd.pick(['Industriestraße', 'Ringstraße', 'Talweg']);
      return {
        tg: ctx.tgEA,
        briefing: `Ihr verlegt im Verband zum Schadensgebiet. Hörbereitschaft auf ${ctx.tgEA}.`,
        steps: [
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'ztr', text: call(own, ztr) },
          { kind: 'tx', label: 'Anruf beantworten', expect: { type: 'answer', own, target: ztr }, sample: `Hier ${own.full}, kommen.` },
          {
            kind: 'rx',
            who: 'ztr',
            text: `Marschauftrag: Marschweg über die ${routeSay} zum Treffpunkt ${tp}. Melden Sie das Passieren von Kontrollpunkt eins am Ortsausgang, kommen.`,
          },
          {
            kind: 'tx',
            label: 'Marschauftrag quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'kommen',
              endeOk: ENDE_INFO,
              content: [
                { label: `Marschweg ${route}`, any: [`#${route.replace(/\D/g, '')}`], level: 'warn' },
                { label: `Treffpunkt ${tp}`, any: [tpKey, 'treffpunkt'], level: 'warn' },
                { label: 'Kontrollpunkt eins', any: ['kontrollpunkt*'], level: 'minor' },
              ],
            },
            sample: `Verstanden, Marschweg ${route}, Treffpunkt ${tp}, Kontrollpunkt eins melden, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Ende.', skipIfUserEnded: true },
          { kind: 'pause', seconds: 3 },
          { kind: 'task', text: 'Ihr passiert gerade Kontrollpunkt eins am Ortsausgang. Melde es dem Zugtrupp.' },
          { kind: 'tx', label: 'Zugtrupp anrufen', expect: { type: 'call', own, target: ztr }, sample: `${ztr.full} von ${own.full}, kommen.` },
          rxHier('ztr', ztr),
          {
            kind: 'tx',
            label: 'Kontrollpunkt melden',
            expect: {
              type: 'message',
              own,
              content: [{ label: 'Kontrollpunkt eins passiert', any: ['kontrollpunkt*', 'ortsausgang', 'passier*'], level: 'error', essential: true }],
            },
            sample: 'Kontrollpunkt eins passiert, kommen.',
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden, kommen.' },
          { kind: 'tx', label: 'Gespräch beenden', expect: { type: 'end', own }, sample: 'Ende.' },
          { kind: 'pause', seconds: 3 },
          { kind: 'task', text: `Stau auf der ${route}! Ihr kommt ca. ${delay} Minuten später an. Melde die Verzögerung.` },
          { kind: 'tx', label: 'Zugtrupp anrufen', expect: { type: 'call', own, target: ztr }, sample: `${ztr.full} von ${own.full}, kommen.` },
          rxHier('ztr', ztr),
          {
            kind: 'tx',
            label: 'Verzögerung melden',
            expect: {
              type: 'message',
              own,
              content: [
                { label: 'Stau/Verzögerung', any: ['stau*', 'verzoeger*', 'spaeter', 'verspaet*'], level: 'error', essential: true },
                { label: `ca. ${delay} Minuten`, any: [`#${delay}`], level: 'warn' },
              ],
            },
            sample: `Stau auf der ${route}, Verzögerung circa ${delay} Minuten, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: `Verstanden. Nehmen Sie die Umleitung über die ${umleitung}, kommen.` },
          {
            kind: 'tx',
            label: 'Umleitung quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'ende',
              content: [{ label: `Umleitung ${umleitung}`, any: streetAny(umleitung), level: 'warn' }],
            },
            sample: `Verstanden, Umleitung über ${umleitung}, Ende.`,
          },
          { kind: 'pause', seconds: 3 },
          { kind: 'task', text: `Ihr seid am Treffpunkt ${tp} angekommen. Melde die Ankunft.` },
          { kind: 'tx', label: 'Zugtrupp anrufen', expect: { type: 'call', own, target: ztr }, sample: `${ztr.full} von ${own.full}, kommen.` },
          rxHier('ztr', ztr),
          {
            kind: 'tx',
            label: 'Ankunft melden',
            expect: {
              type: 'message',
              own,
              content: [{ label: 'Ankunft am Treffpunkt', any: ['eingetroffen', 'angekommen', 'treffpunkt', 'vor ort', 'ankunft'], level: 'error', essential: true }],
            },
            sample: `Am Treffpunkt ${tp} eingetroffen, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: `Verstanden, warten Sie dort auf weitere Weisung, kommen.` },
          { kind: 'tx', label: 'Quittieren und beenden', expect: { type: 'ack', own, ending: 'ende' }, sample: 'Verstanden, Ende.' },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'unfall',
    title: 'Unfall eines Helfers',
    level: 'Fortgeschritten',
    desc: 'Notfall in den eigenen Reihen: schnell, vollständig und ruhig melden, Rückfragen beantworten, Einweiser stellen.',
    build(ctx) {
      const { own, ztr, street, nr, rnd } = ctx;
      const inj = rnd.pick([
        { text: 'Schnittverletzung am Unterarm, blutet stark', key: ['schnitt*', 'arm', 'blut*'] },
        { text: 'Sturz von der Leiter, Verdacht auf Beinbruch', key: ['sturz', 'gestuerzt', 'bein*', 'leiter', 'bruch'] },
        { text: 'Quetschung der Hand beim Heben', key: ['quetsch*', 'hand'] },
      ]);
      const zufahrt = rnd.pick(['Hofeinfahrt', 'Hintereingang', 'Garagenzufahrt']);
      const zKey = zufahrt.toLowerCase();
      return {
        tg: ctx.tgEA,
        briefing: `Einsatzstelle ${street} ${nr}: Ein Helfer hat sich verletzt – ${inj.text}. Er ist ansprechbar, Erste Hilfe läuft. Ihr braucht einen Rettungswagen. Die Zufahrt für den Rettungsdienst ist die ${zufahrt}.`,
        steps: [
          { kind: 'task', text: `Melde den Unfall sofort dem Zugtrupp (${ztr.full}) und fordere einen Rettungswagen an.` },
          { kind: 'tx', label: 'Zugtrupp anrufen', expect: { type: 'call', own, target: ztr }, sample: `${ztr.full} von ${own.full}, kommen.` },
          rxHier('ztr', ztr),
          {
            kind: 'tx',
            label: 'Unfallmeldung',
            expect: {
              type: 'message',
              own,
              content: [
                { label: 'Verletzter Helfer', any: ['verletz*', 'unfall', 'helfer'], level: 'error', essential: true },
                { label: 'Art der Verletzung', any: inj.key, level: 'warn' },
                { label: 'Rettungswagen angefordert', any: ['rettungswagen', 'rtw', 'rettungsdienst', 'notarzt'], level: 'error', essential: true },
                { label: `Ort (${street})`, any: streetAny(street), level: 'warn' },
              ],
            },
            sample: `Unfall ${street} ${nr}: ein Helfer verletzt, ${inj.text}. Benötigen Rettungswagen, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden. Ist der Verletzte ansprechbar und wird er versorgt, kommen.' },
          {
            kind: 'tx',
            label: 'Rückfrage: Zustand',
            expect: {
              type: 'message',
              own,
              content: [
                { label: 'Ansprechbar', any: ['ansprechbar', 'bei bewusstsein', 'wach'], level: 'error', essential: true },
                { label: 'Erste Hilfe läuft', any: ['erste hilfe', 'versorg*', 'verband', 'betreut'], level: 'warn' },
              ],
            },
            sample: 'Verletzter ist ansprechbar, Erste Hilfe läuft, kommen.',
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden. Wo soll der Rettungsdienst anfahren, kommen.' },
          {
            kind: 'tx',
            label: 'Rückfrage: Zufahrt',
            expect: {
              type: 'message',
              own,
              content: [{ label: `Zufahrt über ${zufahrt}`, any: [zKey, zKey.replace(/(ein|zu)(fahrt|gang)$/, ' $1$2')], level: 'error', essential: true }],
            },
            sample: `Anfahrt über die ${zufahrt}, ${street} ${nr}, kommen.`,
          },
          {
            kind: 'rx',
            who: 'ztr',
            text: 'Verstanden. Rettungswagen ist alarmiert, Eintreffen in circa acht Minuten. Stellen Sie einen Einweiser an die Straße, kommen.',
          },
          {
            kind: 'tx',
            label: 'Quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'ende',
              content: [
                { label: 'Einweiser wiederholt', any: ['einweiser*', 'einweisen'], level: 'warn' },
                { label: 'Eintreffen in 8 Minuten', any: ['#8'], level: 'minor' },
              ],
            },
            sample: 'Verstanden, Rettungswagen in acht Minuten, stellen Einweiser, Ende.',
          },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'alarmierung',
    title: 'Alarmierung durch die Leitstelle',
    level: 'Grundlagen',
    desc: 'Einsatzauftrag der Leitstelle vollständig aufnehmen, Ausrücken und Eintreffen per Sprechfunk melden.',
    build(ctx) {
      const { own, lst, street, nr, rnd } = ctx;
      const lage = rnd.pick([
        { text: 'umgestürzter Baum auf Wohnhaus', key: ['baum*', 'umgestuerzt*'] },
        { text: 'Wassereinbruch im Keller eines Pflegeheims', key: ['wasser*', 'keller', 'pflegeheim*'] },
        { text: 'Stromausfall im Gewerbegebiet, Notstrom benötigt', key: ['strom*', 'notstrom*'] },
      ]);
      const fw = callsign('Florian', ctx.ort, '1/11/1');
      return {
        tg: 'LST Kreis',
        briefing: 'Ihr seid in der Unterkunft und einsatzbereit. Hörbereitschaft auf „LST Kreis“.',
        steps: [
          { kind: 'pause', seconds: 2 },
          { kind: 'rx', who: 'lst', text: call(own, lst) },
          { kind: 'tx', label: 'Anruf beantworten', expect: { type: 'answer', own, target: lst }, sample: `Hier ${own.full}, kommen.` },
          {
            kind: 'rx',
            who: 'lst',
            text: `Einsatzauftrag: Technische Hilfe, ${lage.text}, ${street} ${nr}. Kommen Sie mit Ihrem Gerätekraftwagen. Melden Sie das Ausrücken, kommen.`,
          },
          {
            kind: 'tx',
            label: 'Einsatzauftrag quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'kommen',
              endeOk: ENDE_INFO,
              content: [
                { label: 'Lage wiederholt', any: lage.key, level: 'warn' },
                { label: `${street}`, any: streetAny(street), level: 'error' },
                { label: `Hausnummer ${nr}`, any: [`#${nr}`], level: 'error' },
              ],
            },
            sample: `Verstanden, Technische Hilfe, ${lage.text}, ${street} ${nr}, kommen.`,
          },
          { kind: 'rx', who: 'lst', text: 'Ende.', skipIfUserEnded: true },
          { kind: 'pause', seconds: 3 },
          { kind: 'task', text: 'Euer Fahrzeug rückt aus. Melde das Ausrücken der Leitstelle per Sprechfunk.' },
          { kind: 'tx', label: 'Leitstelle anrufen', expect: { type: 'call', own, target: lst }, sample: `${lst.full} von ${own.full}, kommen.` },
          rxHier('lst', lst),
          {
            kind: 'tx',
            label: 'Ausrücken melden',
            expect: {
              type: 'message',
              own,
              content: [{ label: 'Ausrücken gemeldet', any: ['ausgerueckt', 'rueck* aus', 'ausruecken', 'unterwegs', 'abmarsch*', 'auf anfahrt', 'anfahrt'], level: 'error', essential: true }],
            },
            sample: `Rücken aus zur ${street} ${nr}, kommen.`,
          },
          { kind: 'rx', who: 'lst', text: 'Verstanden, kommen.' },
          { kind: 'tx', label: 'Gespräch beenden', expect: { type: 'end', own }, sample: 'Ende.' },
          { kind: 'pause', seconds: 3 },
          { kind: 'task', text: 'Ihr seid an der Einsatzstelle eingetroffen, die Feuerwehr ist schon vor Ort. Melde das Eintreffen.' },
          { kind: 'tx', label: 'Leitstelle anrufen', expect: { type: 'call', own, target: lst }, sample: `${lst.full} von ${own.full}, kommen.` },
          rxHier('lst', lst),
          {
            kind: 'tx',
            label: 'Eintreffen melden',
            expect: {
              type: 'message',
              own,
              content: [{ label: 'Eintreffen gemeldet', any: ['eingetroffen', 'angekommen', 'vor ort', 'am einsatzort', 'an der einsatzstelle', 'an einsatzstelle'], level: 'error', essential: true }],
            },
            sample: `An Einsatzstelle ${street} ${nr} eingetroffen, kommen.`,
          },
          {
            kind: 'rx',
            who: 'lst',
            text: `Verstanden. Melden Sie sich beim Einsatzleiter der Feuerwehr, Rufname ${fw.full}, kommen.`,
          },
          {
            kind: 'tx',
            label: 'Quittieren und beenden',
            expect: {
              type: 'ack',
              own,
              ending: 'ende',
              content: [{ label: 'Einsatzleiter Feuerwehr', any: ['einsatzleit*', 'feuerwehr', 'florian'], level: 'warn' }],
            },
            sample: `Verstanden, melden uns bei ${fw.full}, Ende.`,
          },
        ],
      };
    },
  },
];

/** IDs von Übungen, die hauptsächlich Statusmeldungen trainieren. */
export const STATUS_SCENARIOS = ['status'];

/**
 * Entfernt alle Status-Aufgaben (Status setzen, eingehender Status, zugehörige Aufträge/Erklärungen).
 * Verändert das Szenario-Objekt und gibt es zurück.
 */
export function withoutStatus(scenario) {
  const steps = scenario.steps;
  scenario.steps = steps.filter((s, i) => {
    if (s.kind === 'status' || s.kind === 'statusIn' || s.about === 'status') return false;
    if (s.kind === 'task' && steps[i + 1] && steps[i + 1].kind === 'status') return false;
    return true;
  });
  return scenario;
}

/** Baut ein Szenario mit zufälligem Kontext. */
export function buildScenario(id, seed, opts = {}) {
  const rnd = makeRng(seed);
  const ctx = makeContext(rnd, opts);
  const def = SCENARIOS.find((s) => s.id === id);
  if (!def) throw new Error(`Unbekanntes Szenario: ${id}`);
  const built = def.build(ctx);
  return { id: def.id, title: def.title, level: def.level, desc: def.desc, ctx, stations: station(ctx), ...built };
}

/** "Einsatzdienst": mehrere zufällige Szenarien hintereinander (gleicher Kontext). */
export function buildShift(seed, count = 4, { exclude = [], ...opts } = {}) {
  const rnd = makeRng(seed);
  const ctx = makeContext(rnd, opts);
  const ids = SCENARIOS.map((s) => s.id).filter((id) => !exclude.includes(id));
  const chosen = [];
  while (chosen.length < count) {
    const id = rnd.pick(ids);
    if (!chosen.includes(id)) chosen.push(id);
  }
  const parts = chosen.map((id) => {
    const def = SCENARIOS.find((s) => s.id === id);
    return { def, built: def.build(ctx) };
  });
  const steps = [];
  parts.forEach(({ def, built }, i) => {
    steps.push({ kind: 'section', title: def.title, briefing: built.briefing, tg: built.tg });
    steps.push(...built.steps);
    if (i < parts.length - 1) steps.push({ kind: 'pause', seconds: 3 });
  });
  return {
    id: 'einsatzdienst',
    title: 'Einsatzdienst (Zufall)',
    level: 'Alle',
    desc: chosen.map((id) => SCENARIOS.find((s) => s.id === id).title).join(' → '),
    ctx,
    stations: station(ctx),
    tg: parts[0].built.tg,
    briefing: parts[0].built.briefing,
    steps,
  };
}
