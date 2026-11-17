// Freier Modus: realitätsnahe Aufgaben ohne vorgegebenen Gesprächsablauf.
// Du bekommst nur eine frei formulierte Anweisung (etwas mitteilen, anfordern oder erfragen)
// und eine Übersicht der Funkteilnehmer. Wen du rufst und wie du die Nachricht formulierst,
// entscheidest du selbst – die Gegenstellen reagieren darauf (Rückfragen, „nicht zuständig“, „warten“ …).
import { callsign, matchCallsign } from './evaluator.js';
import { numberGroups, wordMatches, fold, digitsOf } from './normalize.js';
import { makeRng, makeContext, streetAny } from './scenarios.js';

export const FREE_KINDS = {
  mitteilen: 'Mitteilen',
  anfordern: 'Anfordern',
  erfragen: 'Erfragen',
  angerufen: 'Angerufen werden',
};

const STRASSEN2 = ['Uferstraße', 'Gartenstraße', 'Schillerstraße', 'Feldweg', 'Bachstraße', 'Goethestraße', 'Mühlenweg', 'Kirchgasse'];
const zwo = (n) => (n === 2 ? 'zwo' : String(n));

/** Funkteilnehmer im Funkkreis des freien Modus. */
export function freeRoster(ctx) {
  const { ort, zug } = ctx;
  const ea = ctx.tgEA;
  const mk = (key, name, cs, role, tg = ea) => ({ key, name, cs, role, tg });
  return {
    ztr: mk('ztr', 'Zugtrupp', ctx.ztr, 'Zugführung: Aufträge, Lagemeldungen, Nachforderungen von Einheiten und Gerät'),
    sib: mk('sib', 'Nachbargruppe', ctx.sib, 'Bergungsgruppe im Nachbarabschnitt'),
    fgr: mk('fgr', 'Fachgruppe Notversorgung', ctx.fgr, 'Stromerzeuger, Beleuchtung, Elektroversorgung'),
    log: mk('log', 'Fachgruppe Logistik', callsign('Heros', ort, `2${zug}/82`), 'Verpflegung, Betriebsstoff, Verbrauchsmaterial, Fahrzeugschäden'),
    elfw: mk('elfw', 'Einsatzleitung Feuerwehr', callsign('Florian', ort, '1/10/1'), 'Gesamteinsatzleitung an der Einsatzstelle, Brandschutz, Gefahrstoffe'),
    rtw: mk('rtw', 'Rettungswagen (Sanitätsdienst)', callsign('Rotkreuz', ort, '83/2'), 'Steht an der Einsatzstelle bereit: medizinische Versorgung der Einsatzkräfte'),
    lst: mk('lst', 'Leitstelle', ctx.lst, 'Alarmierung weiterer Kräfte: Rettungsdienst für Dritte, Polizei, Versorger', 'LST Kreis'),
  };
}

/**
 * Welche Station wird in einer Sendung gerufen? Liefert die zuerst genannte Station (außer dem eigenen Rufnamen).
 * Numerische Rufnamen werden nur bei exakter Übereinstimmung erkannt, damit ähnliche Nummern
 * (z. B. 21/10 und 1/10/1) nicht verwechselt werden.
 */
export function identifyCalled(tokens, roster, own) {
  const groups = numberGroups(tokens);
  const found = [];
  for (const st of Object.values(roster)) {
    const cs = st.cs;
    if (cs.digits) {
      const g = groups.find((gr) => gr.digits === cs.digits);
      if (g) {
        found.push({ key: st.key, pos: g.start });
        continue;
      }
    } else {
      // Rufname ohne Nummer (Leitstelle): Präfix + Ort, danach keine Nummer
      const place = fold(cs.place);
      for (let i = 0; i < tokens.length - 1; i++) {
        if (wordMatches(tokens[i].t, cs.prefix) && wordMatches(tokens[i + 1].t, place) && !(tokens[i + 2] && tokens[i + 2].num !== null)) {
          found.push({ key: st.key, pos: i });
          break;
        }
      }
    }
  }
  // Kurzform (nur die letzte Zahl, z. B. "10"), wenn sie eindeutig ist
  if (!found.length) {
    const shorts = {};
    for (const st of Object.values(roster)) {
      const last = st.cs.num ? digitsOf(st.cs.num.split('/').filter(Boolean).pop()) : '';
      if (last.length >= 2) (shorts[last] = shorts[last] || []).push(st.key);
    }
    for (const g of groups) {
      const keys = shorts[g.digits];
      if (keys && keys.length === 1) found.push({ key: keys[0], pos: g.start, shortForm: true });
    }
  }
  const ownM = own ? matchCallsign(tokens, own) : { present: false };
  const others = found.filter((f) => !(ownM.present && own.digits && roster[f.key].cs.digits === own.digits));
  others.sort((a, b) => a.pos - b.pos);
  return others[0] || null;
}

// ------------------------------------------------------------------ Aufgaben
// Jede Vorlage liefert eine Aufgabe für den Schritt { kind: 'free', ... } der Engine.
//  dir: 'out' = du beginnst das Gespräch, 'in' = du wirst gerufen
//  target: zuständige Station, alt: ebenfalls vertretbare Stationen
//  content: Inhalte der Nachricht (ask = Rückfrage der Gegenstelle, wenn es fehlt)
//  reply: Antwort der Gegenstelle, ack: was du beim Quittieren wiederholen solltest

const EINTREFFEN = ['eingetroffen', 'angekommen', 'vor ort', 'am einsatzort', 'an der einsatzstelle', 'an einsatzstelle', 'eintreffen'];

const TEMPLATES = [
  // ---------------------------------------------------------------- Mitteilen
  {
    id: 'm-eintreffen',
    type: 'mitteilen',
    make({ street, nr }) {
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Eintreffen melden',
        task: `Ihr seid an der Einsatzstelle ${street} ${nr} angekommen. Gib das an die Zugführung weiter.`,
        content: [
          { label: 'Eintreffen gemeldet', any: EINTREFFEN, level: 'error', essential: true, ask: 'Was wollen Sie melden, kommen.' },
          { label: `Einsatzstelle (${street})`, any: streetAny(street), level: 'minor' },
        ],
        message: `An Einsatzstelle ${street} ${nr} eingetroffen, kommen.`,
        reply: 'Verstanden. Erkunden Sie die Lage und geben Sie eine Lagemeldung, kommen.',
        ack: [{ label: 'Auftrag (Erkundung) wiederholt', any: ['erkund*', 'lage*'], level: 'info' }],
        ackSample: 'Verstanden, Erkundung und Lagemeldung, Ende.',
      };
    },
  },
  {
    id: 'm-keller',
    type: 'mitteilen',
    make({ street, rnd }) {
      const cm = rnd.pick([30, 50, 80, 120]);
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Lagemeldung Keller',
        task: `Erkundungsergebnis: Der Keller des Wohnhauses in der ${street} steht ca. ${cm} cm unter Wasser. Es sind keine Personen in Gefahr. Mit euren eigenen Pumpen schafft ihr das. Gib eine Lagemeldung ab.`,
        content: [
          { label: 'Keller unter Wasser', any: ['keller', 'wasser*', 'vollgelaufen', 'ueberflut*'], level: 'error', essential: true, ask: 'Wie ist die Lage, kommen.' },
          { label: `Wasserstand ${cm} cm`, any: [`#${cm}`], level: 'warn', ask: 'Wie hoch steht das Wasser, kommen.' },
          { label: 'Keine Personen in Gefahr', any: ['personen', 'niemand', 'verletzt*', 'keine gefahr'], level: 'warn', ask: 'Sind Personen in Gefahr, kommen.' },
        ],
        message: `Lagemeldung: Keller ${street} unter Wasser, Wasserstand circa ${cm} Zentimeter, keine Personen in Gefahr. Beginnen mit Pumparbeiten, kommen.`,
        reply: 'Verstanden. Melden Sie, wenn der Keller leer ist, kommen.',
        ack: [{ label: 'Auftrag wiederholt (Rückmeldung, wenn leer)', any: ['leer', 'melden', 'abgepumpt'], level: 'info' }],
        ackSample: 'Verstanden, melden wenn leer, Ende.',
      };
    },
  },
  {
    id: 'm-fertig',
    type: 'mitteilen',
    make({ street }) {
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Arbeiten abgeschlossen',
        task: `Die Arbeiten an der Einsatzstelle ${street} sind abgeschlossen, die Ausstattung ist verlastet und ihr seid wieder einsatzbereit. Melde das.`,
        content: [
          { label: 'Arbeiten abgeschlossen', any: ['abgeschlossen', 'beendet', 'fertig', 'erledigt', 'abgearbeitet'], level: 'error', essential: true, ask: 'Was wollen Sie melden, kommen.' },
          { label: 'Wieder einsatzbereit', any: ['einsatzbereit', 'einsatzklar', 'verfuegbar', 'frei'], level: 'warn', ask: 'Sind Sie wieder einsatzbereit, kommen.' },
          { label: `Einsatzstelle (${street})`, any: streetAny(street), level: 'minor' },
        ],
        message: `Arbeiten Einsatzstelle ${street} abgeschlossen, Gerät verlastet, wieder einsatzbereit, kommen.`,
        reply: 'Verstanden. Rücken Sie in den Bereitstellungsraum ein, kommen.',
        ack: [{ label: 'Auftrag (Bereitstellungsraum) wiederholt', any: ['bereitstellung*', 'einruecken', 'ruecken'], level: 'minor' }],
        ackSample: 'Verstanden, rücken in den Bereitstellungsraum, Ende.',
      };
    },
  },
  {
    id: 'm-gas',
    type: 'mitteilen',
    make({ ctx, rnd }) {
      const str = rnd.pick(STRASSEN2);
      return {
        dir: 'out',
        target: 'sib',
        alt: ['ztr', 'elfw'],
        title: 'Warnung an Nachbargruppe',
        task: `Ihr riecht in der ${str} deutlich Gas – genau dort arbeitet gerade die Nachbargruppe (${ctx.sib.full}). Warne sie sofort.`,
        content: [
          { label: 'Gasgeruch / Gefahr', any: ['gas*', 'gasgeruch', 'gasaustritt'], level: 'error', essential: true, ask: 'Was ist los, kommen.' },
          { label: `Ort (${str})`, any: streetAny(str), level: 'warn', ask: 'Wo genau, kommen.' },
          { label: 'Handlungsanweisung (Bereich verlassen)', any: ['verlassen', 'raeumen', 'zurueck*', 'rausgehen', 'raus', 'evakuier*', 'abbrechen', 'einstellen'], level: 'minor' },
        ],
        message: `Achtung, Gasgeruch in der ${str}. Bereich sofort verlassen, kommen.`,
        reply: 'Verstanden, verlassen den Bereich sofort, kommen.',
        ack: [],
        ackSample: 'Verstanden, Ende.',
        note: 'Bei Gefahr für eine andere Einheit darfst du sie direkt warnen. Zusätzlich die Zugführung bzw. Feuerwehr informieren.',
      };
    },
  },
  {
    id: 'm-brand',
    type: 'mitteilen',
    make({ street, nr }) {
      return {
        dir: 'out',
        target: 'elfw',
        alt: ['ztr'],
        title: 'Schwelbrand entdeckt',
        task: `Beim Räumen entdeckt ihr in der ${street} ${nr} einen Schwelbrand im Schuttberg, es raucht stark. Informiere die Stelle, die für den Brandschutz zuständig ist.`,
        content: [
          { label: 'Schwelbrand / Rauch', any: ['brand*', 'schwelbrand', 'feuer', 'rauch*', 'glut*', 'qualm*'], level: 'error', essential: true, ask: 'Was wollen Sie melden, kommen.' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'warn', ask: 'Wo genau, kommen.' },
          { label: `Hausnummer ${nr}`, any: [`#${nr}`], level: 'minor' },
        ],
        message: `Schwelbrand im Schuttberg ${street} ${nr}, starke Rauchentwicklung, kommen.`,
        reply: 'Verstanden, schicken einen Trupp. Unterbrechen Sie dort die Räumarbeiten, kommen.',
        ack: [{ label: 'Räumarbeiten unterbrechen', any: ['unterbrech*', 'einstellen', 'stoppen', 'raeum*'], level: 'minor' }],
        ackSample: 'Verstanden, Räumarbeiten unterbrochen, Ende.',
      };
    },
  },
  {
    id: 'm-standort',
    type: 'mitteilen',
    make({ rnd }) {
      const str = rnd.pick(STRASSEN2);
      const nr = rnd.int(3, 40);
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Neuer Standort',
        task: `Die Zufahrt ist gesperrt. Ihr stellt euer Fahrzeug deshalb in der ${str} ${nr} ab. Teile der Zugführung den neuen Standort mit.`,
        content: [
          { label: `Neuer Standort ${str}`, any: streetAny(str), level: 'error', essential: true, ask: 'Wo stehen Sie jetzt, kommen.' },
          { label: `Hausnummer ${nr}`, any: [`#${nr}`], level: 'warn', ask: 'Welche Hausnummer, kommen.' },
        ],
        message: `Neuer Standort Fahrzeug: ${str} ${nr}, Zufahrt gesperrt, kommen.`,
        reply: `Verstanden, ${str} ${nr}, kommen.`,
        ack: [],
        ackSample: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'm-unfall',
    type: 'mitteilen',
    make({ street, nr }) {
      return {
        dir: 'out',
        target: 'rtw',
        alt: ['ztr', 'lst'],
        title: 'Verletzter Helfer',
        task: `Ein Helfer deiner Gruppe hat sich mit der Säge am Unterarm verletzt. Er blutet stark, ist aber ansprechbar. Ihr seid in der ${street} ${nr}. Sorge dafür, dass schnell medizinische Hilfe kommt.`,
        content: [
          { label: 'Verletzter Helfer', any: ['verletz*', 'unfall', 'schnittverletzung', 'blut*'], level: 'error', essential: true, ask: 'Was ist passiert, kommen.' },
          { label: 'Ansprechbar', any: ['ansprechbar', 'bei bewusstsein', 'wach'], level: 'warn', ask: 'Ist der Verletzte ansprechbar, kommen.' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'error', ask: 'Wo genau befinden Sie sich, kommen.' },
        ],
        message: `Verletzter Helfer, Schnittverletzung Unterarm, starke Blutung, ansprechbar. Einsatzstelle ${street} ${nr}, kommen.`,
        reply: 'Verstanden, kommen sofort. Drücken Sie die Wunde ab, kommen.',
        ack: [{ label: 'Anweisung (Wunde abdrücken) wiederholt', any: ['abdrueck*', 'druck*', 'wunde'], level: 'minor' }],
        ackSample: 'Verstanden, Wunde wird abgedrückt, Ende.',
        note: 'Für die eigenen Einsatzkräfte ist der Rettungswagen an der Einsatzstelle am schnellsten. Die Zugführung danach informieren.',
      };
    },
  },
  {
    id: 'm-strom',
    type: 'mitteilen',
    make({ street }) {
      return {
        dir: 'out',
        target: 'fgr',
        alt: ['ztr'],
        title: 'Stromerzeuger ausgefallen',
        task: `Euer Stromerzeuger an der Einsatzstelle ${street} ist ausgefallen, die Einsatzstelle ist dunkel. Ihr braucht schnell Ersatz.`,
        content: [
          { label: 'Stromerzeuger ausgefallen', any: ['stromerzeuger', 'aggregat', 'generator', 'strom*', 'ausgefallen'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: 'Ersatz / Beleuchtung angefordert', any: ['ersatz', 'benoetig*', 'brauchen', 'anforder*', 'beleucht*', 'licht'], level: 'warn' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'warn', ask: 'Wohin, kommen.' },
        ],
        message: `Stromerzeuger an Einsatzstelle ${street} ausgefallen, benötigen Ersatz für die Beleuchtung, kommen.`,
        reply: 'Verstanden, Ersatz-Stromerzeuger ist in zehn Minuten bei Ihnen, kommen.',
        ack: [{ label: 'Zeit (10 Minuten) wiederholt', any: ['#10'], level: 'info' }],
        ackSample: 'Verstanden, zehn Minuten, Ende.',
      };
    },
  },
  // ---------------------------------------------------------------- Anfordern
  {
    id: 'a-betriebsstoff',
    type: 'anfordern',
    make({ street, rnd }) {
      const l = rnd.pick([20, 30, 40, 60]);
      const art = rnd.pick(['Benzin', 'Diesel']);
      return {
        dir: 'out',
        target: 'log',
        alt: ['ztr'],
        title: 'Betriebsstoff anfordern',
        task: `Der Kraftstoff für eure Pumpen reicht nur noch eine Stunde. Ihr braucht ${l} Liter ${art} an der Einsatzstelle ${street}.`,
        content: [
          { label: `Betriebsstoff (${art})`, any: ['betriebsstoff', 'kraftstoff', 'benzin', 'diesel', 'sprit', 'treibstoff'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: `Menge ${l} Liter`, any: [`#${l}`], level: 'warn', ask: 'Welche Menge, kommen.' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'warn', ask: 'Wohin, kommen.' },
        ],
        message: `Benötigen ${l} Liter ${art} an Einsatzstelle ${street}, kommen.`,
        reply: `Verstanden, ${l} Liter ${art} kommen in circa dreißig Minuten, kommen.`,
        ack: [{ label: 'Lieferzeit wiederholt', any: ['#30'], level: 'info' }],
        ackSample: 'Verstanden, dreißig Minuten, Ende.',
      };
    },
  },
  {
    id: 'a-verpflegung',
    type: 'anfordern',
    make({ street, rnd }) {
      const n = rnd.int(6, 12);
      return {
        dir: 'out',
        target: 'log',
        alt: ['ztr'],
        title: 'Verpflegung anfordern',
        task: `Deine Leute arbeiten seit dem Morgen ohne Pause. Fordere Verpflegung für ${n} Helfer an die Einsatzstelle ${street} an.`,
        content: [
          { label: 'Verpflegung', any: ['verpflegung', 'essen', 'mittagessen', 'nahrung', 'versorgung'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: `Anzahl (${n})`, any: [`#${n}`], level: 'warn', ask: 'Für wie viele Personen, kommen.' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'warn', ask: 'Wohin, kommen.' },
        ],
        message: `Benötigen Verpflegung für ${zwo(n)} Helfer an Einsatzstelle ${street}, kommen.`,
        reply: 'Verstanden, Verpflegung kommt in circa vierzig Minuten, kommen.',
        ack: [],
        ackSample: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'a-sandsaecke',
    type: 'anfordern',
    make({ rnd }) {
      const n = rnd.pick([200, 300, 500, 800]);
      const ab = rnd.pick(['Nord', 'Süd', 'Ost', 'West']);
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Sandsäcke nachfordern',
        task: `Der Deich im Abschnitt ${ab} weicht durch. Zum Verbauen braucht ihr ${n} gefüllte Sandsäcke.`,
        content: [
          { label: 'Sandsäcke', any: ['sandsack*', 'sandsaecke', 'sandsaeck*', 'saecke'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: `Menge (${n})`, any: [`#${n}`], level: 'warn', ask: 'Welche Menge, kommen.' },
          { label: `Abschnitt ${ab}`, any: [fold(ab), `abschnitt ${fold(ab)}`], level: 'warn', ask: 'Wohin, kommen.' },
        ],
        message: `Benötigen ${n} gefüllte Sandsäcke im Abschnitt ${ab}, Deich weicht durch, kommen.`,
        reply: `Verstanden, ${n} Sandsäcke zum Abschnitt ${ab}, kommen.`,
        ack: [],
        ackSample: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'a-licht',
    type: 'anfordern',
    make({ street, nr }) {
      return {
        dir: 'out',
        target: 'fgr',
        alt: ['ztr'],
        title: 'Beleuchtung anfordern',
        task: `In einer Stunde wird es dunkel, die Arbeiten in der ${street} ${nr} dauern noch bis in die Nacht. Organisiere Beleuchtung für die Einsatzstelle.`,
        content: [
          { label: 'Beleuchtung', any: ['beleucht*', 'licht*', 'flutlicht', 'lichtmast', 'ausleucht*', 'scheinwerfer'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'warn', ask: 'Wohin, kommen.' },
          { label: 'Zeitpunkt / Dauer', any: ['stunde', 'dunkel*', 'nacht', 'abend', 'sofort', 'bis'], level: 'minor' },
        ],
        message: `Benötigen Beleuchtung für Einsatzstelle ${street} ${nr} in einer Stunde, Arbeiten dauern bis in die Nacht, kommen.`,
        reply: 'Verstanden, Lichtmast wird in einer Stunde aufgebaut, kommen.',
        ack: [],
        ackSample: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'a-rtw',
    type: 'anfordern',
    make({ street, nr }) {
      return {
        dir: 'out',
        target: 'lst',
        alt: ['rtw'],
        title: 'Rettungsdienst für Anwohner',
        task: `Ein älterer Anwohner in der ${street} ${nr} klagt über starke Brustschmerzen. Fordere über die zuständige Stelle einen Rettungswagen mit Notarzt an.`,
        content: [
          { label: 'Rettungswagen / Notarzt', any: ['rettungswagen', 'rtw', 'notarzt', 'rettungsdienst', 'nef', 'krankenwagen'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: `Adresse (${street})`, any: streetAny(street), level: 'error', ask: 'Wie ist die genaue Adresse, kommen.' },
          { label: `Hausnummer ${nr}`, any: [`#${nr}`], level: 'warn' },
          { label: 'Grund (Brustschmerzen)', any: ['brustschmerz*', 'brust*', 'herz*', 'schmerz*'], level: 'warn', ask: 'Was ist passiert, kommen.' },
        ],
        message: `Benötigen Rettungswagen mit Notarzt, ${street} ${nr}, Anwohner mit starken Brustschmerzen, kommen.`,
        reply: `Verstanden, Rettungswagen und Notarzt sind alarmiert zur ${street} ${nr}, kommen.`,
        ack: [],
        ackSample: 'Verstanden, Ende.',
        note: 'Rettungsdienst für Dritte alarmiert die Leitstelle (Gesprächsgruppe der Leitstelle). Der RTW an der Einsatzstelle ist für die Einsatzkräfte da.',
      };
    },
  },
  {
    id: 'a-polizei',
    type: 'anfordern',
    make({ street }) {
      return {
        dir: 'out',
        target: 'lst',
        alt: ['elfw', 'ztr'],
        title: 'Polizei anfordern',
        task: `Schaulustige drängen in den Gefahrenbereich in der ${street} und behindern die Arbeiten. Ihr braucht Polizei zum Absperren.`,
        content: [
          { label: 'Polizei', any: ['polizei', 'streife*', 'absperr*'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'warn', ask: 'Wohin, kommen.' },
          { label: 'Grund (Schaulustige)', any: ['schaulustig*', 'gaffer', 'zuschauer', 'personen', 'passanten'], level: 'minor' },
        ],
        message: `Benötigen Polizei zur Absperrung in der ${street}, Schaulustige im Gefahrenbereich, kommen.`,
        reply: 'Verstanden, Polizei ist informiert, kommen.',
        ack: [],
        ackSample: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'a-baufach',
    type: 'anfordern',
    make({ street, nr }) {
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Baufachberater anfordern',
        task: `Das Wohnhaus ${street} ${nr} zeigt frische Risse im tragenden Mauerwerk. Ihr betretet es nicht mehr und braucht eine fachliche Beurteilung der Statik.`,
        content: [
          { label: 'Baufachberater / Statik', any: ['baufach*', 'statik*', 'baufachberater', 'fachberater', 'statiker'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: 'Risse im Mauerwerk', any: ['riss*', 'mauerwerk', 'einsturz*'], level: 'warn', ask: 'Was ist der Grund, kommen.' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'warn', ask: 'Wohin, kommen.' },
        ],
        message: `Wohnhaus ${street} ${nr} zeigt Risse im tragenden Mauerwerk, wird nicht betreten. Benötigen Baufachberater, kommen.`,
        reply: 'Verstanden, Baufachberater ist in zwanzig Minuten bei Ihnen. Sperren Sie den Bereich ab, kommen.',
        ack: [{ label: 'Anweisung (absperren) wiederholt', any: ['absperr*', 'abgesperrt', 'sperr*'], level: 'minor' }],
        ackSample: 'Verstanden, Bereich wird abgesperrt, Ende.',
      };
    },
  },
  {
    id: 'a-ablösung',
    type: 'anfordern',
    make({ rnd }) {
      const h = rnd.int(5, 8);
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Ablösung anfordern',
        task: `Deine Gruppe ist seit ${h} Stunden ununterbrochen im Einsatz, die Leute sind erschöpft. Fordere eine Ablösung an.`,
        content: [
          { label: 'Ablösung', any: ['abloes*', 'abloesung', 'ersetz*', 'austausch*'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' },
          { label: `Einsatzdauer (${h} Stunden)`, any: [`#${h}`], level: 'warn', ask: 'Wie lange sind Sie schon im Einsatz, kommen.' },
        ],
        message: `Benötigen Ablösung, Gruppe seit ${h} Stunden im Einsatz, kommen.`,
        reply: 'Verstanden, Ablösung trifft in einer Stunde ein, kommen.',
        ack: [],
        ackSample: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'a-reifen',
    type: 'anfordern',
    make({ street }) {
      return {
        dir: 'out',
        target: 'log',
        alt: ['ztr'],
        title: 'Fahrzeugschaden',
        task: `Euer GKW hat in der ${street} einen Reifenschaden und ist nicht mehr fahrbereit. Ihr braucht Hilfe für das Fahrzeug.`,
        content: [
          { label: 'Reifenschaden / Fahrzeug nicht fahrbereit', any: ['reifen*', 'panne', 'fahrzeug*', 'gkw', 'fahrbereit', 'defekt'], level: 'error', essential: true, ask: 'Was ist passiert, kommen.' },
          { label: `Ort (${street})`, any: streetAny(street), level: 'warn', ask: 'Wo steht das Fahrzeug, kommen.' },
        ],
        message: `GKW mit Reifenschaden in der ${street}, nicht fahrbereit. Benötigen Unterstützung, kommen.`,
        reply: 'Verstanden, Materialerhaltung ist unterwegs, kommen.',
        ack: [],
        ackSample: 'Verstanden, Ende.',
      };
    },
  },
  // ---------------------------------------------------------------- Erfragen
  {
    id: 'e-abloesung',
    type: 'erfragen',
    make({ rnd }) {
      const hh = rnd.pick([14, 16, 18, 20]);
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Ablösezeit erfragen',
        task: 'Du möchtest wissen, wann deine Gruppe abgelöst wird. Erfrage es.',
        content: [{ label: 'Frage nach Ablösung', any: ['abloes*', 'abgeloest', 'abgeloest werden'], level: 'error', essential: true, ask: 'Was ist Ihre Frage, kommen.' }],
        message: 'Wann erfolgt unsere Ablösung, kommen.',
        reply: `Ablösung erfolgt um ${hh} Uhr, kommen.`,
        ack: [{ label: `Uhrzeit (${hh} Uhr) wiederholt`, any: [`#${hh}`], level: 'warn' }],
        ackSample: `Verstanden, ${hh} Uhr, Ende.`,
      };
    },
  },
  {
    id: 'e-bereitstellung',
    type: 'erfragen',
    make({ rnd }) {
      const str = rnd.pick(STRASSEN2);
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Bereitstellungsraum erfragen',
        task: 'Nach dem Auftrag sollt ihr in den Bereitstellungsraum – aber niemand in deiner Gruppe weiß, wo der ist. Frag nach.',
        content: [{ label: 'Frage nach dem Bereitstellungsraum', any: ['bereitstellung*', 'wo', 'sammelraum', 'sammelplatz'], level: 'error', essential: true, ask: 'Was ist Ihre Frage, kommen.' }],
        message: 'Wo befindet sich der Bereitstellungsraum, kommen.',
        reply: `Bereitstellungsraum ist ${str}, Parkplatz am Sportplatz, kommen.`,
        ack: [{ label: `Ort (${str}) wiederholt`, any: streetAny(str), level: 'warn' }],
        ackSample: `Verstanden, ${str}, Parkplatz am Sportplatz, Ende.`,
      };
    },
  },
  {
    id: 'e-stromlos',
    type: 'erfragen',
    make({ street, nr }) {
      return {
        dir: 'out',
        target: 'elfw',
        alt: ['ztr'],
        title: 'Freigabe erfragen',
        task: `Bevor ihr in den überfluteten Keller ${street} ${nr} geht, musst du sicher wissen, ob das Gebäude stromlos geschaltet ist. Die Feuerwehr war vor euch dort.`,
        content: [
          { label: 'Frage: stromlos?', any: ['stromlos', 'strom*', 'abgeschaltet', 'spannungsfrei', 'freigeschaltet'], level: 'error', essential: true, ask: 'Was ist Ihre Frage, kommen.' },
          { label: `Gebäude (${street})`, any: streetAny(street), level: 'warn', ask: 'Welches Gebäude, kommen.' },
        ],
        message: `Ist das Gebäude ${street} ${nr} stromlos geschaltet, kommen.`,
        reply: 'Gebäude ist stromlos, der Energieversorger hat abgeschaltet, kommen.',
        ack: [{ label: 'Antwort (stromlos) wiederholt', any: ['stromlos', 'abgeschaltet'], level: 'minor' }],
        ackSample: 'Verstanden, Gebäude stromlos, Ende.',
      };
    },
  },
  {
    id: 'e-auftrag',
    type: 'erfragen',
    make({ rnd }) {
      const str = rnd.pick(STRASSEN2);
      const nr = rnd.int(2, 30);
      return {
        dir: 'out',
        target: 'ztr',
        title: 'Neuen Auftrag erfragen',
        task: 'Ihr seid fertig und steht bereit. Bisher habt ihr keinen neuen Auftrag bekommen – frage nach.',
        content: [{ label: 'Frage nach neuem Auftrag', any: ['auftrag', 'auftraege', 'aufgabe', 'weiter', 'einsatzbereit'], level: 'error', essential: true, ask: 'Was ist Ihre Frage, kommen.' }],
        message: 'Sind einsatzbereit, erbitten neuen Auftrag, kommen.',
        reply: `Fahren Sie in die ${str} ${nr} und unterstützen Sie beim Abstützen eines Giebels, kommen.`,
        ack: [
          { label: `Einsatzstelle (${str}) wiederholt`, any: streetAny(str), level: 'warn' },
          { label: `Hausnummer ${nr} wiederholt`, any: [`#${nr}`], level: 'warn' },
          { label: 'Auftrag (Abstützen) wiederholt', any: ['abstuetz*', 'stuetz*', 'giebel'], level: 'minor' },
        ],
        ackSample: `Verstanden, ${str} ${nr}, Abstützen Giebel, Ende.`,
      };
    },
  },
  {
    id: 'e-saege',
    type: 'erfragen',
    make({ ctx }) {
      return {
        dir: 'out',
        target: 'sib',
        title: 'Gerät ausleihen',
        task: `Eure Motorkettensäge ist defekt. Die Nachbargruppe (${ctx.sib.full}) arbeitet gleich nebenan. Frag, ob ihr deren Säge kurz bekommen könnt.`,
        content: [{ label: 'Frage nach der Kettensäge', any: ['saege', 'kettensaege', 'motorkettensaege', 'motorsaege', 'mks'], level: 'error', essential: true, ask: 'Was benötigen Sie, kommen.' }],
        message: 'Können Sie uns kurzfristig eine Motorkettensäge leihen, kommen.',
        reply: 'Ja, holen Sie die Säge in fünf Minuten an unserem Fahrzeug ab, kommen.',
        ack: [{ label: 'Abholung (5 Minuten) wiederholt', any: ['#5', 'abhol*'], level: 'minor' }],
        ackSample: 'Verstanden, in fünf Minuten am Fahrzeug, Ende.',
      };
    },
  },
  {
    id: 'e-betriebsstoff',
    type: 'erfragen',
    make() {
      return {
        dir: 'out',
        target: 'log',
        alt: ['ztr'],
        title: 'Lieferung erfragen',
        task: 'Vor über einer Stunde wurde für euch Betriebsstoff angefordert, er ist noch nicht da. Erkundige dich, wann er kommt.',
        content: [{ label: 'Frage nach Betriebsstoff', any: ['betriebsstoff', 'kraftstoff', 'benzin', 'diesel', 'sprit', 'lieferung'], level: 'error', essential: true, ask: 'Was ist Ihre Frage, kommen.' }],
        message: 'Wann kommt der angeforderte Betriebsstoff, kommen.',
        reply: 'Betriebsstoff ist unterwegs, Ankunft in zehn Minuten, kommen.',
        ack: [{ label: 'Ankunftszeit wiederholt', any: ['#10'], level: 'minor' }],
        ackSample: 'Verstanden, zehn Minuten, Ende.',
      };
    },
  },
  {
    id: 'e-krankenhaus',
    type: 'erfragen',
    make() {
      return {
        dir: 'out',
        target: 'rtw',
        alt: ['ztr'],
        title: 'Verbleib des Verletzten',
        task: 'Ein Helfer deiner Gruppe wurde vorhin vom Rettungswagen versorgt und abtransportiert. Die Gruppe will wissen, in welches Krankenhaus er gebracht wird.',
        content: [{ label: 'Frage nach dem Krankenhaus', any: ['krankenhaus', 'klinik*', 'wohin', 'transportziel'], level: 'error', essential: true, ask: 'Was ist Ihre Frage, kommen.' }],
        message: 'In welches Krankenhaus wird unser Helfer gebracht, kommen.',
        reply: 'Transport ins Kreisklinikum, kommen.',
        ack: [{ label: 'Kreisklinikum wiederholt', any: ['klinik*', 'kreisklinikum', 'krankenhaus'], level: 'minor' }],
        ackSample: 'Verstanden, Kreisklinikum, Ende.',
        note: 'Keine Namen von Verletzten über Funk nennen (Datenschutz).',
      };
    },
  },
  // ---------------------------------------------------------------- Angerufen werden
  {
    id: 'i-staerke',
    type: 'angerufen',
    make({ rnd }) {
      const h = rnd.int(6, 8);
      return {
        dir: 'in',
        target: 'ztr',
        title: 'Stärke melden',
        task: `Hörbereitschaft halten. Zur Info: Deine Gruppe hat die Stärke 0/1/${h}/${h + 1} (ein Gruppenführer, ${h} Helfer).`,
        opening: 'Melden Sie Ihre aktuelle Stärke, kommen.',
        content: [
          { label: 'Unterführer (1)', any: ['#1'], level: 'warn' },
          { label: `Helfer (${h})`, any: [`#${h}`], level: 'error', essential: true },
          { label: `Gesamt (${h + 1})`, any: [`#${h + 1}`], level: 'warn' },
        ],
        message: `Stärke null, eins, ${h}, ${h + 1}, kommen.`,
        closing: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'i-standort',
    type: 'angerufen',
    make({ street, nr }) {
      return {
        dir: 'in',
        target: 'ztr',
        title: 'Standort durchgeben',
        task: `Hörbereitschaft halten. Zur Info: Ihr arbeitet gerade in der ${street} ${nr}.`,
        opening: 'Wo befinden Sie sich, kommen.',
        content: [
          { label: `Standort (${street})`, any: streetAny(street), level: 'error', essential: true },
          { label: `Hausnummer ${nr}`, any: [`#${nr}`], level: 'warn' },
        ],
        message: `Standort ${street} ${nr}, kommen.`,
        closing: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'i-fortschritt',
    type: 'angerufen',
    make({ rnd }) {
      const min = rnd.pick([30, 45, 60, 90]);
      return {
        dir: 'in',
        target: 'ztr',
        title: 'Sachstand melden',
        task: `Hörbereitschaft halten. Zur Info: Ihr pumpt einen Keller leer. Etwa die Hälfte ist geschafft, ihr braucht noch ca. ${min} Minuten.`,
        opening: 'Wie ist der Sachstand bei Ihnen, kommen.',
        content: [
          { label: 'Fortschritt (Hälfte)', any: ['haelfte', '#50', 'halb*', 'prozent'], level: 'warn' },
          { label: `Restdauer ${min} Minuten`, any: [`#${min}`, ...(min === 60 ? ['stunde'] : []), ...(min === 90 ? ['anderthalb', 'eineinhalb'] : [])], level: 'error', essential: true },
        ],
        message: `Keller zur Hälfte leer gepumpt, benötigen noch circa ${min} Minuten, kommen.`,
        closing: 'Verstanden, Ende.',
      };
    },
  },
  {
    id: 'i-auftrag',
    type: 'angerufen',
    make({ rnd }) {
      const str = rnd.pick(STRASSEN2);
      const nr = rnd.int(2, 40);
      const what = rnd.pick([
        ['einen umgestürzten Baum von der Fahrbahn zu räumen', 'Baum räumen', ['baum', 'raeum*']],
        ['einen Keller leer zu pumpen', 'Keller auspumpen', ['keller', 'pump*']],
        ['eine Hauswand abzustützen', 'Abstützen', ['abstuetz*', 'stuetz*', 'wand']],
      ]);
      return {
        dir: 'in',
        target: 'ztr',
        title: 'Auftrag aufnehmen',
        task: 'Hörbereitschaft halten.',
        opening: `Neuer Auftrag: Fahren Sie in die ${str} ${nr}, um ${what[0]}, kommen.`,
        inType: 'ack',
        content: [
          { label: `Einsatzstelle (${str}) wiederholt`, any: streetAny(str), level: 'warn' },
          { label: `Hausnummer ${nr} wiederholt`, any: [`#${nr}`], level: 'warn' },
          { label: `Auftrag (${what[1]}) wiederholt`, any: what[2], level: 'minor' },
        ],
        message: `Verstanden, ${str} ${nr}, ${what[1]}, kommen.`,
        closing: 'Ende.',
      };
    },
  },
  {
    id: 'i-feuerwehr',
    type: 'angerufen',
    make({ rnd }) {
      const n = rnd.int(2, 4);
      return {
        dir: 'in',
        target: 'elfw',
        title: 'Personen im Gebäude',
        task: `Hörbereitschaft halten. Zur Info: ${n} Helfer deiner Gruppe sind gerade im Gebäude und sichern die Decke ab.`,
        opening: 'Wie viele Einsatzkräfte Ihrer Einheit sind im Gebäude, kommen.',
        content: [
          { label: `Anzahl (${n})`, any: [`#${n}`], level: 'error', essential: true },
          { label: 'Tätigkeit genannt', any: ['decke', 'sicher*', 'abstuetz*', 'stuetz*'], level: 'minor' },
        ],
        message: `${zwo(n)} Helfer im Gebäude, sichern die Decke ab, kommen.`,
        closing: 'Verstanden. Ziehen Sie Ihre Kräfte in zehn Minuten heraus, wir beginnen dann mit dem Abriss, kommen.',
        closingAck: [{ label: 'Zeit (10 Minuten) wiederholt', any: ['#10'], level: 'warn' }],
        closingSample: 'Verstanden, Kräfte in zehn Minuten heraus, kommen.',
      };
    },
  },
  {
    id: 'i-verpflegung',
    type: 'angerufen',
    make({ rnd }) {
      const n = rnd.int(6, 12);
      return {
        dir: 'in',
        target: 'log',
        title: 'Verpflegungsbedarf',
        task: `Hörbereitschaft halten. Zur Info: An eurer Einsatzstelle sind ${n} Helfer, zwei davon essen vegetarisch.`,
        opening: 'Wir planen die Verpflegung. Für wie viele Personen benötigen Sie Essen, kommen.',
        content: [
          { label: `Anzahl (${n})`, any: [`#${n}`], level: 'error', essential: true },
          { label: 'Vegetarisch erwähnt', any: ['vegetarisch*', 'vegetarier', 'ohne fleisch', 'veggie'], level: 'warn' },
        ],
        message: `${zwo(n)} Personen, davon zwo vegetarisch, kommen.`,
        closing: 'Verstanden, Ende.',
      };
    },
  },
];

const STATUS_TASKS = [
  { value: 3, text: 'Ihr habt den Auftrag angenommen und fahrt los. Teile das per Status mit.' },
  { value: 4, text: 'Ihr seid an der Einsatzstelle angekommen. Teile das per Status mit.' },
  { value: 1, text: 'Der Auftrag ist erledigt, ihr seid auf der Rückfahrt wieder einsatzbereit. Teile das per Status mit.' },
];

export const FREE_TASK_COUNT = TEMPLATES.length;

/** Erzeugt eine einzelne Aufgabe (für Tests). */
export function buildFreeTask(id, ctx) {
  const t = TEMPLATES.find((x) => x.id === id);
  return { kind: 'free', id: t.id, type: t.type, ...t.make({ ...ctx, ctx, rnd: ctx.rnd }) };
}
export const FREE_TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

/**
 * Baut eine Übung im freien Modus: mehrere zufällige Aufgaben in einem gemeinsamen Einsatz.
 * opts: { count, kinds: ['mitteilen', …], statusPractice }
 */
export function buildFree(seed, { count = 5, kinds = Object.keys(FREE_KINDS), statusPractice = true } = {}) {
  const rnd = makeRng(seed);
  const ctx = makeContext(rnd);
  const roster = freeRoster(ctx);
  const pool = TEMPLATES.filter((t) => kinds.includes(t.type));
  const usable = pool.length ? pool : TEMPLATES;
  const chosen = [];
  const bag = [...usable];
  while (chosen.length < Math.min(count, usable.length) && bag.length) {
    const i = Math.floor(rnd() * bag.length);
    chosen.push(bag.splice(i, 1)[0]);
  }
  const steps = [];
  const statusPool = [...STATUS_TASKS];
  chosen.forEach((t, i) => {
    if (i > 0) steps.push({ kind: 'pause', seconds: 2 + rnd() * 3 });
    if (statusPractice && i > 0 && rnd() < 0.25 && statusPool.length) {
      const s = statusPool.splice(rnd.int(0, statusPool.length - 1), 1)[0];
      steps.push({ kind: 'task', text: s.text });
      steps.push({ kind: 'status', value: s.value });
      steps.push({ kind: 'pause', seconds: 2 });
    }
    const task = t.make({ ...ctx, ctx, rnd });
    // Gelegentlich lässt die Gegenstelle warten (realistisch bei viel Funkverkehr)
    const wait = task.dir === 'out' && rnd() < 0.2 ? 6 + rnd.int(0, 4) : 0;
    steps.push({ kind: 'free', id: t.id, type: t.type, wait, ...task });
  });
  const kindText = [...new Set(chosen.map((t) => FREE_KINDS[t.type]))].join(', ');
  return {
    id: 'frei',
    title: 'Freier Modus',
    level: 'Frei',
    desc: `${chosen.length} Aufgaben: ${kindText}`,
    free: true,
    ctx,
    roster,
    stations: Object.fromEntries(Object.values(roster).map((r) => [r.key, { name: `${r.name} (${r.cs.full})`, cs: r.cs }])),
    tg: ctx.tgEA,
    briefing: `Unwettereinsatz in ${ctx.ort}. Deine Gruppe arbeitet an der Einsatzstelle ${ctx.street} ${ctx.nr}. Hörbereitschaft auf ${ctx.tgEA}. Du bekommst nach und nach Aufträge – wen du rufst und wie du es formulierst, entscheidest du selbst. Die Funkteilnehmer stehen unten.`,
    steps,
  };
}
