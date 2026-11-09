// Tutorial: Schritt-für-Schritt-Lektionen mit Ausbilder-Erklärungen und geführter Praxis.
import { callsign } from './evaluator.js';
import { station, streetAny } from './scenarios.js';

function tutorialContext() {
  const ort = 'Musterstadt';
  const own = callsign('Heros', ort, '21/52');
  const ztr = callsign('Heros', ort, '21/10');
  const sib = callsign('Heros', ort, '21/53');
  const fgr = callsign('Heros', ort, '21/62');
  const lst = callsign('Florian', ort);
  return {
    ort,
    own,
    ztr,
    sib,
    fgr,
    lst,
    street: 'Lindenweg',
    nr: 12,
    tgEA: 'THW EA 1',
    unit: 'GKW I, 1. Technischer Zug, OV Musterstadt (Tutorial)',
  };
}

const ex = (...lines) => lines.join('\n');

export const LESSONS = [
  // ------------------------------------------------------------------------
  {
    id: 'tut-geraet',
    title: '1 · Das Funkgerät',
    desc: 'Einschalten, Gesprächsgruppe, Lautstärke, Sprechtaste und Status – die Bedienung in 3 Minuten.',
    build(c) {
      return {
        tg: 'THW EA 1',
        briefing: 'Lerne dein Handfunkgerät kennen. Folge einfach den Anweisungen des Ausbilders.',
        steps: [
          {
            kind: 'explain',
            title: 'Willkommen!',
            text: 'Ich bin dein Ausbilder. In diesem Tutorial lernst du Schritt für Schritt, wie Sprechfunk im Einsatz funktioniert – erst die Bedienung des Geräts, dann die Gesprächsregeln. Alles, was du hier lernst, übst du sofort selbst am Gerät.',
          },
          {
            kind: 'action',
            what: 'power',
            title: 'Gerät einschalten',
            text: 'Schalte das Funkgerät mit der orangefarbenen Taste ⏻ ein. Das Gerät macht kurz einen Selbsttest.',
            highlight: 'power',
            done: 'Das Gerät ist an ✓',
          },
          {
            kind: 'explain',
            title: 'Das Display',
            text: 'Oben siehst du Empfangsstärke, Netz (TMO = über das Netz der Leitstelle) und Akku. In der Mitte steht die eingestellte Gesprächsgruppe – das ist der „Kanal“, auf dem du sprichst und hörst. Nur wer in derselben Gesprächsgruppe ist, hört dich!',
            highlight: 'display',
          },
          {
            kind: 'action',
            what: 'tg',
            value: 'THW EA 1',
            title: 'Gesprächsgruppe wählen',
            text: 'Stelle die Gesprächsgruppe „THW EA 1“ ein. Dafür den linken Drehknopf links/rechts anklicken (oder scrollen) – oder die Tasten ◀ ▶ bzw. die Pfeiltasten deiner Tastatur benutzen.',
            highlight: 'tg',
            done: 'Richtige Gesprächsgruppe ✓ – prüfe das vor jedem Funkspruch!',
          },
          {
            kind: 'action',
            what: 'volume',
            title: 'Lautstärke',
            text: 'Stelle mit dem rechten Drehknopf eine angenehme Lautstärke ein (links/rechts klicken oder scrollen). Im Einsatz lieber etwas lauter – du musst Anrufe auch bei Lärm hören.',
            highlight: 'vol',
            done: 'Lautstärke eingestellt ✓',
          },
          {
            kind: 'explain',
            title: 'Die Sprechtaste (PTT)',
            text: 'Gesendet wird nur, solange die Sprechtaste gedrückt ist – hier die Taste links am Gerät oder die LEERTASTE. Die goldene Regel: Erst denken, dann drücken, dann sprechen.',
            example: ex('1. Überlegen, was du sagen willst', '2. Taste drücken und Sendeerlaubnis-Ton abwarten', '3. Deutlich sprechen, Mikrofon ca. 5–10 cm vor dem Mund', '4. Erst nach dem letzten Wort loslassen'),
            highlight: 'ptt',
          },
          {
            kind: 'action',
            what: 'ptt',
            label: 'Probesendung',
            title: 'Probesendung',
            text: 'Halte die Leertaste (oder PTT) gedrückt, warte auf den Ton und sage: „Probesendung, Probesendung“. Dann loslassen. Ohne Mikrofon kannst du den Text auch unten eintippen.',
            highlight: 'ptt',
            done: 'Sauber gesendet ✓',
          },
          {
            kind: 'explain',
            about: 'status',
            title: 'Status senden',
            text: 'Statusmeldungen sind kurze Zahlencodes, die ohne Sprechen an die Leitstelle gehen – das entlastet den Funkverkehr. Ziffer drücken, im Display prüfen, mit ✓ (oder Enter) senden.',
            example: ex('1 = Einsatzbereit über Funk', '2 = Einsatzbereit auf Wache/Unterkunft', '3 = Einsatzauftrag übernommen', '4 = Am Einsatzort', '5 = Sprechwunsch', '6 = Nicht einsatzbereit'),
            highlight: 'keypad',
          },
          { kind: 'task', text: 'Ihr seid in der Unterkunft und einsatzbereit. Sende den passenden Status.' },
          { kind: 'status', value: 2 },
          {
            kind: 'explain',
            title: 'Geschafft!',
            text: 'Du kannst dein Funkgerät bedienen. In der nächsten Lektion führst du dein erstes Funkgespräch.',
          },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'tut-anruf',
    title: '2 · Angerufen werden',
    desc: 'Wie ein Anruf klingt, wie du richtig antwortest und einen Auftrag quittierst.',
    build(c) {
      const { own, ztr, sib } = c;
      return {
        tg: c.tgEA,
        briefing: `Du bist ${own.full}. Gesprächsgruppe ${c.tgEA}.`,
        steps: [
          { kind: 'action', what: 'power', title: 'Gerät an', text: 'Schalte zuerst das Funkgerät ein (⏻).', highlight: 'power' },
          { kind: 'action', what: 'tg', value: c.tgEA, title: 'Gesprächsgruppe', text: `Stelle die Gesprächsgruppe „${c.tgEA}“ ein.`, highlight: 'tg' },
          {
            kind: 'explain',
            title: 'Rufnamen',
            text: `Jede Funkstelle hat einen Rufnamen. Beim THW beginnt er mit „Heros“, dann Ort und Kennzahl. Dein Rufname in diesem Tutorial: ${own.full}. Der Zugtrupp heißt ${ztr.full}.`,
            example: ex(`„${own.full}“  →  gesprochen: Heros Musterstadt einundzwanzig zweiundfünfzig`),
          },
          {
            kind: 'explain',
            title: 'Wie ein Anruf aufgebaut ist',
            text: 'Wer jemanden ruft, nennt zuerst die gerufene Stelle, dann „von“ und den eigenen Rufnamen, am Ende „kommen“. „Kommen“ heißt: Ich bin fertig, du bist dran. Hör dir gleich ein Beispiel zwischen zwei anderen Stellen an.',
            example: ex('[Gerufene Stelle]  von  [Rufende Stelle],  kommen.'),
          },
          { kind: 'rx', who: 'ztr', text: `${sib.full} von ${ztr.full}, kommen.`, chatter: true },
          { kind: 'rx', who: 'sib', text: `Hier ${sib.full}, kommen.`, chatter: true },
          { kind: 'chatterEnd', label: 'Zugehört, nicht dazwischengefunkt' },
          {
            kind: 'explain',
            title: 'So antwortest du',
            text: 'Die gerufene Stelle antwortet mit „Hier“, dem eigenen Rufnamen und „kommen“. Achte genau auf die Kennzahl: 21/53 war nicht für dich! Gleich ruft dich der Zugtrupp – antworte dann selbst.',
            example: ex(`Hier ${own.full}, kommen.`),
          },
          { kind: 'rx', who: 'ztr', text: `${own.full} von ${ztr.full}, kommen.` },
          {
            kind: 'tx',
            strict: true,
            label: 'Anruf beantworten',
            expect: { type: 'answer', own, target: ztr },
            sample: `Hier ${own.full}, kommen.`,
          },
          {
            kind: 'explain',
            title: 'Aufträge quittieren',
            text: 'Gleich erteilt der Zugtrupp einen Auftrag. Bestätige ihn mit „Verstanden“ und wiederhole die wichtigsten Eckdaten (Ort, Zahlen) – so fallen Hörfehler sofort auf. Danach „kommen“.',
            example: ex('Verstanden, [Kerninhalt], kommen.'),
          },
          { kind: 'rx', who: 'ztr', text: `Fahren Sie zum Bereitstellungsraum ${c.street} ${c.nr}, kommen.` },
          {
            kind: 'tx',
            strict: true,
            label: 'Auftrag quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'kommen',
              endeOk: 'In der Regel beendet die Stelle das Gespräch, die es begonnen hat – hier der Zugtrupp. Besser: „kommen“.',
              content: [
                { label: `${c.street} wiederholt`, any: streetAny(c.street), level: 'warn' },
                { label: `Hausnummer ${c.nr} wiederholt`, any: [`#${c.nr}`], level: 'warn' },
              ],
            },
            sample: `Verstanden, Bereitstellungsraum ${c.street} ${c.nr}, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Ende.', skipIfUserEnded: true },
          {
            kind: 'explain',
            title: 'Merke',
            text: 'Der Zugtrupp hat das Gespräch begonnen – also beendet er es auch mit „Ende“. Kurz und ohne „bitte“, „danke“ oder „okay“: So klingt professioneller Funk.',
          },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'tut-melden',
    title: '3 · Selbst anrufen & melden',
    desc: 'Verbindung herstellen, Meldung absetzen und das Gespräch korrekt beenden.',
    build(c) {
      const { own, ztr } = c;
      return {
        tg: c.tgEA,
        briefing: `Ihr seid an der Einsatzstelle ${c.street} ${c.nr} angekommen.`,
        steps: [
          { kind: 'action', what: 'power', title: 'Gerät an', text: 'Funkgerät einschalten (⏻).', highlight: 'power' },
          { kind: 'action', what: 'tg', value: c.tgEA, title: 'Gesprächsgruppe', text: `Gesprächsgruppe „${c.tgEA}“ einstellen.`, highlight: 'tg' },
          {
            kind: 'explain',
            title: 'Erst die Verbindung',
            text: 'Wenn du etwas melden willst, stellst du zuerst die Verbindung her – mit dem Anruf. Erst wenn die Gegenstelle mit „Hier …, kommen“ antwortet, folgt die eigentliche Nachricht. Beim ersten Anruf beide Rufnamen vollständig nennen.',
            example: ex(`${ztr.full} von ${own.full}, kommen.`),
          },
          { kind: 'task', text: `Rufe den Zugtrupp (${ztr.full}).` },
          {
            kind: 'tx',
            strict: true,
            label: 'Zugtrupp anrufen',
            expect: { type: 'call', own, target: ztr },
            sample: `${ztr.full} von ${own.full}, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: `Hier ${ztr.full}, kommen.`, isHier: true },
          {
            kind: 'explain',
            title: 'Die Nachricht',
            text: 'Jetzt kommt deine Meldung: kurz, nur das Wesentliche, am Ende „kommen“. Melde, dass ihr an der Einsatzstelle eingetroffen seid.',
            example: ex(`An Einsatzstelle ${c.street} ${c.nr} eingetroffen, kommen.`),
          },
          {
            kind: 'tx',
            strict: true,
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
              ],
            },
            sample: `An Einsatzstelle ${c.street} ${c.nr} eingetroffen, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden, kommen.' },
          {
            kind: 'explain',
            title: 'Gespräch beenden',
            text: 'Du hast das Gespräch begonnen – also beendest du es: mit „Ende“. Danach ist der Kanal wieder frei für andere.',
            example: ex('Ende.'),
          },
          {
            kind: 'tx',
            strict: true,
            label: 'Gespräch beenden',
            expect: { type: 'end', own },
            sample: 'Ende.',
          },
          {
            kind: 'explain',
            title: 'Das ganze Gespräch',
            text: 'Das war ein vollständiges Funkgespräch. Dieser Ablauf ist die Grundlage für alles weitere.',
            example: ex(
              `Du:  ${ztr.full} von ${own.full}, kommen.`,
              `ZTr: Hier ${ztr.full}, kommen.`,
              `Du:  An Einsatzstelle ${c.street} ${c.nr} eingetroffen, kommen.`,
              'ZTr: Verstanden, kommen.',
              'Du:  Ende.'
            ),
          },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'tut-betriebsworte',
    title: '4 · Wiederholen & Warten',
    desc: 'Was tun bei gestörtem Empfang – und wenn die Leitstelle „Warten“ sagt.',
    build(c) {
      const { own, ztr, lst } = c;
      const msg = `Wechseln Sie zum Abschnitt Nord, ${c.street} ${c.nr}, kommen.`;
      return {
        tg: c.tgEA,
        briefing: `Du bist ${own.full}. Die Verbindung ist heute schlecht.`,
        steps: [
          { kind: 'action', what: 'power', title: 'Gerät an', text: 'Funkgerät einschalten (⏻).', highlight: 'power' },
          { kind: 'action', what: 'tg', value: c.tgEA, title: 'Gesprächsgruppe', text: `Gesprächsgruppe „${c.tgEA}“ einstellen.`, highlight: 'tg' },
          {
            kind: 'explain',
            title: 'Nie raten!',
            text: 'Wenn eine Nachricht gestört oder unvollständig ankommt, wird sie NICHT quittiert. Stattdessen forderst du sie neu an: „Wiederholen, kommen“. Die Gegenstelle antwortet mit „Ich wiederhole: …“. Gleich wird es eine Störung geben.',
            example: ex('Wiederholen, kommen.'),
          },
          { kind: 'rx', who: 'ztr', text: `${own.full} von ${ztr.full}, kommen.` },
          { kind: 'tx', strict: true, label: 'Anruf beantworten', expect: { type: 'answer', own, target: ztr }, sample: `Hier ${own.full}, kommen.` },
          { kind: 'rx', who: 'ztr', text: msg, garble: true },
          { kind: 'tx', strict: true, label: 'Wiederholung anfordern', expect: { type: 'repeat', own }, sample: 'Wiederholen, kommen.' },
          { kind: 'rx', who: 'ztr', text: `Ich wiederhole: ${msg}` },
          {
            kind: 'tx',
            strict: true,
            label: 'Auftrag quittieren',
            expect: {
              type: 'ack',
              own,
              ending: 'kommen',
              endeOk: 'Der Zugtrupp hat begonnen und beendet das Gespräch – besser „kommen“.',
              content: [
                { label: 'Abschnitt Nord', any: ['nord'], level: 'warn' },
                { label: c.street, any: streetAny(c.street), level: 'warn' },
              ],
            },
            sample: `Verstanden, Abschnitt Nord, ${c.street} ${c.nr}, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Ende.', skipIfUserEnded: true },
          {
            kind: 'explain',
            title: '„Warten“',
            text: 'Ist die Gegenstelle gerade beschäftigt, antwortet sie mit „Warten“. Dann sendest du nichts mehr, bis sie dich von selbst ruft – auch wenn es dauert. Probieren wir es mit der Leitstelle.',
          },
          {
            kind: 'action',
            what: 'tg',
            value: 'LST Kreis',
            title: 'Gesprächsgruppe wechseln',
            text: 'Die Leitstelle erreichst du auf „LST Kreis“. Stelle diese Gesprächsgruppe ein.',
            highlight: 'tg',
          },
          { kind: 'setTg', tg: 'LST Kreis', briefing: 'Melde der Leitstelle, dass ihr wieder einsatzbereit seid.' },
          { kind: 'task', text: `Rufe die Leitstelle (${lst.full}).` },
          { kind: 'tx', strict: true, label: 'Leitstelle anrufen', expect: { type: 'call', own, target: lst }, sample: `${lst.full} von ${own.full}, kommen.` },
          { kind: 'rx', who: 'lst', text: `Hier ${lst.full}, warten.` },
          { kind: 'task', text: '„Warten“ – jetzt nicht senden, bis die Leitstelle dich ruft.' },
          { kind: 'silence', seconds: 8, label: '„Warten“ eingehalten' },
          { kind: 'rx', who: 'lst', text: `${own.full}, kommen.` },
          { kind: 'task', text: 'Jetzt bist du dran: Melde, dass ihr wieder einsatzbereit seid.' },
          {
            kind: 'tx',
            strict: true,
            label: 'Einsatzbereitschaft melden',
            expect: {
              type: 'message',
              own,
              content: [{ label: 'Einsatzbereitschaft gemeldet', any: ['einsatzbereit*', 'wieder bereit', 'bereit'], level: 'error', essential: true }],
            },
            sample: 'Wieder einsatzbereit, kommen.',
          },
          { kind: 'rx', who: 'lst', text: 'Verstanden, kommen.' },
          { kind: 'tx', strict: true, label: 'Gespräch beenden', expect: { type: 'end', own }, sample: 'Ende.' },
          {
            kind: 'explain',
            title: 'Merke',
            text: '„Wiederholen“ statt raten, „Warten“ heißt Funkstille. Beides sorgt dafür, dass im Einsatz nichts verloren geht.',
          },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'tut-buchstabieren',
    title: '5 · Buchstabieren & Zahlen',
    desc: 'Die Buchstabiertafel nach DIN 5009 und „zwo“ statt „zwei“.',
    build(c) {
      const { own, lst } = c;
      return {
        tg: 'LST Kreis',
        briefing: 'Ihr seid am Gehöft „Quast“ eingesetzt.',
        steps: [
          { kind: 'action', what: 'power', title: 'Gerät an', text: 'Funkgerät einschalten (⏻).', highlight: 'power' },
          { kind: 'action', what: 'tg', value: 'LST Kreis', title: 'Gesprächsgruppe', text: 'Gesprächsgruppe „LST Kreis“ einstellen.', highlight: 'tg' },
          {
            kind: 'explain',
            title: 'Zahlen',
            text: 'Im Funk sagt man „zwo“ statt „zwei“ – „zwei“ und „drei“ klingen über Funk zu ähnlich. Wichtige Zahlen werden außerdem beim Quittieren wiederholt.',
            example: ex('22  →  „zwoundzwanzig“', '2 Pumpen  →  „zwo Pumpen“'),
          },
          {
            kind: 'explain',
            title: 'Buchstabieren',
            text: 'Namen, die man falsch verstehen kann, werden buchstabiert. Kündige es mit „Ich buchstabiere“ an und nutze eine Buchstabiertafel: DIN 5009 (neu mit Städtenamen oder traditionell mit Vornamen) oder das NATO-Alphabet. Welche du in den Musterlösungen sehen willst, stellst du in den Einstellungen ein – erkannt werden alle drei.',
            example: ex('QUAST:', 'DIN neu:  Quickborn, Unna, Aachen, Salzwedel, Tübingen', 'DIN alt:  Quelle, Ulrich, Anton, Samuel, Theodor', 'NATO:     Quebec, Uniform, Alfa, Sierra, Tango'),
          },
          { kind: 'rx', who: 'lst', text: `${own.full} von ${lst.full}, kommen.` },
          { kind: 'tx', strict: true, label: 'Anruf beantworten', expect: { type: 'answer', own, target: lst }, sample: `Hier ${own.full}, kommen.` },
          { kind: 'rx', who: 'lst', text: 'Nennen Sie den Namen des Gehöfts, an dem Sie eingesetzt sind. Buchstabieren Sie, kommen.' },
          { kind: 'task', text: 'Buchstabiere „Quast“ nach DIN 5009 (Hilfe: Merkblatt oben rechts).' },
          {
            kind: 'tx',
            strict: true,
            label: 'Buchstabieren',
            expect: { type: 'message', own, spell: 'Quast' },
            sampleSpell: 'Quast',
          },
          { kind: 'rx', who: 'lst', text: 'Verstanden, Quast. Ende.' },
          {
            kind: 'explain',
            title: 'Tipp',
            text: 'Die komplette Buchstabiertafel findest du jederzeit im Merkblatt. In der Übung „Buchstabieren“ kommen immer neue Namen.',
          },
        ],
      };
    },
  },
  // ------------------------------------------------------------------------
  {
    id: 'tut-lagemeldung',
    title: '6 · Lagemeldung',
    desc: 'Eine vollständige, knappe Meldung nach dem Schema Wo – Was – Wie viele – Was wird benötigt.',
    build(c) {
      const { own, ztr } = c;
      return {
        tg: c.tgEA,
        briefing: `Erkundung ${c.street} ${c.nr}: Keller unter Wasser, Wasserstand ca. 60 cm, keine Personen in Gefahr. Ihr braucht zwo zusätzliche Tauchpumpen.`,
        steps: [
          { kind: 'action', what: 'power', title: 'Gerät an', text: 'Funkgerät einschalten (⏻).', highlight: 'power' },
          { kind: 'action', what: 'tg', value: c.tgEA, title: 'Gesprächsgruppe', text: `Gesprächsgruppe „${c.tgEA}“ einstellen.`, highlight: 'tg' },
          {
            kind: 'explain',
            title: 'Aufbau einer Lagemeldung',
            text: 'Eine gute Lagemeldung ist vollständig UND kurz. Bewährt hat sich: Wo? – Was ist passiert? – Wie viele / wie groß? – Gefahr für Personen? – Was wird benötigt? Lies die Lage links und überlege dir die Meldung, bevor du drückst.',
            example: ex('Lagemeldung: [Wo], [Was], [Ausmaß], [Personen], benötigen [Was], kommen.'),
          },
          { kind: 'task', text: `Rufe den Zugtrupp (${ztr.full}) und gib die Lagemeldung ab.` },
          { kind: 'tx', strict: true, label: 'Zugtrupp anrufen', expect: { type: 'call', own, target: ztr }, sample: `${ztr.full} von ${own.full}, kommen.` },
          { kind: 'rx', who: 'ztr', text: `Hier ${ztr.full}, kommen.` },
          {
            kind: 'tx',
            strict: true,
            label: 'Lagemeldung',
            expect: {
              type: 'message',
              own,
              content: [
                { label: 'Keller unter Wasser', any: ['keller', 'wasser*', 'ueberflut*'], level: 'error', essential: true },
                { label: 'Wasserstand 60 cm', any: ['#60'], level: 'warn' },
                { label: 'Keine Personen in Gefahr', any: ['keine personen', 'niemand', 'personen', 'keine gefahr', 'keine verletzten'], level: 'warn' },
                { label: 'Bedarf: Tauchpumpen', any: ['tauchpumpe*', 'pumpe*'], level: 'error', essential: true },
                { label: 'Anzahl Pumpen (2)', any: ['#2'], level: 'warn' },
              ],
            },
            sample: `Lagemeldung: Keller ${c.street} ${c.nr} unter Wasser, Wasserstand circa 60 Zentimeter, keine Personen in Gefahr. Benötigen zwo weitere Tauchpumpen, kommen.`,
          },
          { kind: 'rx', who: 'ztr', text: 'Verstanden, zwo Tauchpumpen werden nachgeführt, kommen.' },
          { kind: 'tx', strict: true, label: 'Gespräch beenden', expect: { type: 'end', own }, sample: 'Verstanden, Ende.' },
          {
            kind: 'explain',
            title: 'Tutorial abgeschlossen! 🎉',
            text: 'Du kennst jetzt alle Grundlagen. Ab jetzt trainierst du in den Übungen mit zufälligen Lagen und Rufnamen – und im „Einsatzdienst“ mehrere Situationen am Stück, ganz ohne Ausbilder-Hilfe.',
          },
        ],
      };
    },
  },
];

export function buildLesson(id) {
  const def = LESSONS.find((l) => l.id === id);
  if (!def) throw new Error(`Unbekannte Lektion: ${id}`);
  const ctx = tutorialContext();
  const built = def.build(ctx);
  return { id: def.id, title: def.title, level: 'Tutorial', desc: def.desc, tutorial: true, ctx, stations: station(ctx), ...built };
}
