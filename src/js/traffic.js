// Fremdverkehr: Funkgespräche anderer Einheiten, die zwischen den eigenen Aufgaben
// auf dem Kanal laufen. Trainiert Hörbereitschaft und Funkdisziplin.
import { callsign } from './evaluator.js';
import { makeRng } from './scenarios.js';

const ORTE2 = ['Neuhausen', 'Lindenberg', 'Steinbach', 'Waldheim', 'Rosenfeld', 'Talstadt'];
const ABSCHNITTE = ['Nord', 'Süd', 'Ost', 'West'];
const STRASSEN = ['Bahnhofstraße', 'Industriestraße', 'Mühlenweg', 'Schulstraße', 'Ringstraße', 'Kastanienallee', 'Am Sportplatz'];
const ZAHLEN = ['zwo', 'drei', 'vier', 'fünf'];

export const DENSITY = {
  aus: { p: 0, max: 0, label: 'Aus' },
  wenig: { p: 0.35, max: 1, label: 'Wenig' },
  normal: { p: 0.65, max: 1, label: 'Normal' },
  viel: { p: 0.95, max: 2, label: 'Viel' },
};

/** Zusätzliche Funkstellen für den Fremdverkehr. */
export function trafficStations(ctx) {
  const z = ctx.zug || 1;
  const ort2 = ORTE2.find((o) => o !== ctx.ort) || 'Neuhausen';
  const mk = (cs, name) => ({ name: name || cs.full, cs });
  return {
    o1: mk(callsign('Heros', ctx.ort, `2${z}/19`)),
    o2: mk(callsign('Heros', ort2, ctx.own.num), `${callsign('Heros', ort2, ctx.own.num).full} (Nachbar-OV)`),
    f1: mk(callsign('Florian', ctx.ort, '1/46/1')),
    f2: mk(callsign('Florian', ctx.ort, '1/11/1')),
    r1: mk(callsign('Rotkreuz', ctx.ort, '83/1')),
  };
}

const call = (to, from) => `${to.full} von ${from.full}, kommen.`;
const hier = (x) => `Hier ${x.full}, kommen.`;

/** Erzeugt ein zufälliges Fremdgespräch für eine Gesprächsgruppe. */
export function conversation(ctx, st, tg, rnd) {
  const ab = rnd.pick(ABSCHNITTE);
  const str = rnd.pick(STRASSEN);
  const nr = rnd.int(2, 60);
  const n = rnd.pick(ZAHLEN);
  const lines = [];
  const say = (who, text) => lines.push({ kind: 'rx', who, text, chatter: true });

  if (tg === 'LST Kreis') {
    const lst = ctx.lst;
    const variant = rnd.int(0, 3);
    if (variant === 0) {
      say('r1', call(lst, st.r1.cs));
      say('lst', hier(lst));
      say('r1', `Patient aufgenommen, Transport ins Klinikum ${ctx.ort}, kommen.`);
      say('lst', 'Verstanden, Ende.');
    } else if (variant === 1) {
      say('lst', call(st.f1.cs, lst));
      say('f1', hier(st.f1.cs));
      say('lst', `Fahren Sie zur ${str} ${nr}, Ölspur auf der Fahrbahn, kommen.`);
      say('f1', `Verstanden, ${str} ${nr}, Ölspur, kommen.`);
      say('lst', 'Ende.');
    } else if (variant === 2) {
      say('f2', call(lst, st.f2.cs));
      say('lst', hier(lst));
      say('f2', 'Lagemeldung: Feuer aus, Nachlöscharbeiten laufen, voraussichtlich noch dreißig Minuten, kommen.');
      say('lst', 'Verstanden, kommen.');
      say('f2', 'Ende.');
    } else {
      say('lst', call(st.r1.cs, lst));
      say('r1', hier(st.r1.cs));
      say('lst', 'Wie ist Ihre voraussichtliche Ankunftszeit am Klinikum, kommen.');
      say('r1', `Ankunft in circa ${rnd.pick(['fünf', 'zehn', 'fünfzehn'])} Minuten, kommen.`);
      say('lst', 'Verstanden, Ende.');
    }
    return lines;
  }

  // THW-Gesprächsgruppen: Zugtrupp und andere Einheiten
  const others = ['sib', 'fgr', 'o1', 'o2'];
  const u = rnd.pick(others);
  const ucs = (st[u] || {}).cs;
  const ztr = ctx.ztr;
  if (!ucs) return lines;
  const variant = rnd.int(0, 7);
  switch (variant) {
    case 0:
      say('ztr', call(ucs, ztr));
      say(u, hier(ucs));
      say('ztr', `Bringen Sie ${n} Stromerzeuger zum Abschnitt ${ab}, kommen.`);
      say(u, `Verstanden, ${n} Stromerzeuger zum Abschnitt ${ab}, kommen.`);
      say('ztr', 'Ende.');
      break;
    case 1:
      say(u, call(ztr, ucs));
      say('ztr', hier(ztr));
      say(u, 'Pumpen laufen, Wasserstand sinkt, kommen.');
      say('ztr', 'Verstanden, kommen.');
      say(u, 'Ende.');
      break;
    case 2:
      say(u, call(ztr, ucs));
      say('ztr', hier(ztr));
      say(u, `Benötigen Betriebsstoff für den Stromerzeuger, circa ${rnd.pick(['zwanzig', 'dreißig', 'vierzig'])} Liter, kommen.`);
      say('ztr', 'Verstanden, Betriebsstoff wird gebracht, kommen.');
      say(u, 'Ende.');
      break;
    case 3:
      say('ztr', call(ucs, ztr));
      say(u, hier(ucs));
      say('ztr', 'Melden Sie Ihren aktuellen Standort, kommen.');
      say(u, `Standort ${str}, Höhe Hausnummer ${nr}, kommen.`);
      say('ztr', 'Verstanden, Ende.');
      break;
    case 4:
      say(u, call(ztr, ucs));
      say('ztr', hier(ztr));
      say(u, `Abschnitt ${ab} abgearbeitet, rücken zum Bereitstellungsraum, kommen.`);
      say('ztr', 'Verstanden, kommen.');
      say(u, 'Ende.');
      break;
    case 5:
      say(u, `${ztr.full} von ${ucs.full}, Funkprobe, kommen.`);
      say('ztr', `Hier ${ztr.full}, verstehe Sie gut, kommen.`);
      say(u, 'Ende.');
      break;
    case 6:
      say('ztr', call(ucs, ztr));
      say(u, hier(ucs));
      say('ztr', `Unterstützen Sie die Fachgruppe Räumen in der ${str}, kommen.`);
      say(u, `Verstanden, Fachgruppe Räumen, ${str}, kommen.`);
      say('ztr', 'Ende.');
      break;
    default:
      say(u, call(ztr, ucs));
      say('ztr', 'Hier ' + ztr.full + ', warten.');
      say('ztr', `${ucs.full}, kommen.`);
      say(u, `Ausleuchtung Abschnitt ${ab} steht, kommen.`);
      say('ztr', 'Verstanden, Ende.');
      break;
  }
  return lines;
}

/** Beginnt mit diesem Schritt ein neues Gespräch? (Dort passt Fremdverkehr hin.) */
function startsConversation(step, own) {
  if (step.kind === 'free') return true;
  if (step.kind === 'tx' && step.expect && step.expect.type === 'call') return true;
  if (step.kind === 'rx' && !step.chatter && step.text.startsWith(own.full)) return true;
  if (step.kind === 'section') return false;
  return false;
}

/**
 * Fügt Fremdverkehr in ein Szenario ein (vor jedem neuen Gespräch, zufällig je nach Dichte).
 * Verändert das Szenario-Objekt und gibt es zurück.
 */
export function addTraffic(scenario, density = 'normal', seed = Date.now()) {
  const d = DENSITY[density] || DENSITY.normal;
  scenario.stations = { ...trafficStations(scenario.ctx), ...scenario.stations };
  if (!d.p) return scenario;
  const rnd = makeRng(seed);
  const out = [];
  let tg = scenario.tg;
  let lastWasChatter = false;
  for (const step of scenario.steps) {
    if (step.kind === 'section' || step.kind === 'setTg') tg = step.tg;
    if (startsConversation(step, scenario.ctx.own) && !lastWasChatter && rnd() < d.p) {
      const count = rnd.int(1, d.max);
      for (let k = 0; k < count; k++) {
        out.push(...conversation(scenario.ctx, scenario.stations, tg, rnd));
        out.push({ kind: 'pause', seconds: 1 + rnd() * 2 });
      }
      out.push({ kind: 'chatterEnd', silent: true });
    }
    out.push(step);
    lastWasChatter = step.kind === 'chatterEnd';
  }
  scenario.steps = out;
  return scenario;
}
