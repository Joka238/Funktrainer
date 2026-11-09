// Bewertung einzelner Funksprüche nach den Regeln der Sprechfunk-Dienstvorschrift (DV 810.3).
import { tokenize, numberGroups, wordMatches, findPhrase, containsAny, digitsOf, fold } from './normalize.js';
import { extractSpelling, spellOut } from './spelling.js';

export const PENALTY = { error: 25, warn: 10, minor: 5, info: 0, ok: 0 };

/** Erzeugt ein Rufnamen-Objekt. */
export function callsign(prefix, place, num = '') {
  return {
    prefix,
    place,
    num,
    digits: digitsOf(num),
    full: `${prefix} ${place}${num ? ' ' + num : ''}`,
    short: num || `${prefix} ${place}`,
  };
}

/** Sucht einen Rufnamen im Text. */
export function matchCallsign(tokens, cs) {
  if (!cs) return { present: false };
  const placeWords = fold(cs.place).split(/\s+/);
  const near = (start, back = 4) => {
    // nur bis zum vorherigen Rufnamen/Trennwort zurückschauen
    let from = start;
    while (from > 0 && start - from < back) {
      const t = tokens[from - 1];
      if (t.num !== null || ['von', 'hier', 'fuer', 'an'].includes(t.t)) break;
      from--;
    }
    const before = tokens.slice(from, start);
    const prefixIdx = before.findIndex((t) => wordMatches(t.t, cs.prefix));
    const placeIdx = before.findIndex((t) => placeWords.some((p) => wordMatches(t.t, p)));
    const offset = from;
    const idxs = [prefixIdx, placeIdx].filter((i) => i >= 0).map((i) => i + offset);
    return {
      hasPrefix: prefixIdx >= 0,
      hasPlace: placeIdx >= 0,
      first: idxs.length ? Math.min(...idxs) : start,
    };
  };

  if (cs.digits) {
    const groups = numberGroups(tokens);
    let g = groups.find((gr) => gr.digits === cs.digits);
    let shortForm = false;
    if (!g) g = groups.find((gr) => gr.digits.length > cs.digits.length && gr.digits.includes(cs.digits));
    if (!g) {
      // Kurzform, z. B. nur "52" statt "21/52"
      const last = digitsOf(cs.num.split('/').pop());
      if (last && last !== cs.digits) {
        g = groups.find((gr) => gr.digits === last);
        shortForm = !!g;
      }
    }
    if (!g) return { present: false, pos: -1 };
    const n = near(g.start);
    return {
      present: true,
      full: n.hasPrefix && n.hasPlace && !shortForm,
      shortForm,
      pos: n.first,
      end: g.end,
    };
  }
  // Rufname ohne Nummer (z. B. Leitstelle "Florian Musterstadt")
  const isPlace = (t) => t && placeWords.some((p) => wordMatches(t.t, p));
  const j = tokens.findIndex((t) => wordMatches(t.t, cs.prefix));
  if (j >= 0 && isPlace(tokens[j + 1])) return { present: true, full: true, pos: j, end: j + 1 };
  // Ort ohne direkt folgende Nummer (sonst gehört er zu einem anderen Rufnamen)
  const i = tokens.findIndex((t, k) => isPlace(t) && !(tokens[k + 1] && tokens[k + 1].num !== null));
  if (i < 0 && j < 0) return { present: false, pos: -1 };
  return {
    present: true,
    full: i >= 0 && j >= 0,
    pos: Math.min(...[i, j].filter((x) => x >= 0)),
    end: Math.max(i, j),
  };
}

const UNWANTED = [
  { words: ['bitte'], text: 'Höflichkeitsformeln ("bitte") weglassen – sie verlängern die Sendung.' },
  { words: ['danke', 'dankeschoen', 'vielen dank'], text: 'Höflichkeitsformeln ("danke") weglassen.' },
  { words: ['hallo', 'moin', 'servus', 'tschuess', 'ciao', 'guten tag', 'gruess gott'], text: 'Keine Grußformeln im Funkverkehr.' },
  { words: ['okay', 'ok', 'oki', 'alles klar'], text: '"Okay" / "Alles klar" ist kein Betriebswort – "Verstanden" verwenden.' },
  { words: ['roger', 'copy', 'over', 'out', 'affirmativ', 'negativ'], text: 'Englische/militärische Betriebsworte ("Roger", "Over") gibt es im BOS-Funk nicht.' },
  { words: ['aeh', 'aehm', 'ehm', 'oehm', 'hm', 'hmm', 'aeh'], text: 'Füllwörter ("äh", "ähm") vermeiden – erst denken, dann drücken, dann sprechen.' },
  { words: ['genau', 'sozusagen', 'quasi', 'irgendwie'], text: 'Umgangssprachliche Füllwörter vermeiden.' },
];

function exactWord(tokens, phrase) {
  const words = phrase.split(' ');
  for (let i = 0; i <= tokens.length - words.length; i++) {
    if (words.every((w, k) => tokens[i + k].t === w)) return true;
  }
  return false;
}

function commonChecks(tokens, findings, opts) {
  const seen = new Set();
  for (const u of UNWANTED) {
    if (u.words.some((w) => exactWord(tokens, w)) && !seen.has(u.text)) {
      seen.add(u.text);
      findings.push({ level: 'warn', text: u.text });
    }
  }
  const zwei = tokens.some((t) => /zwei/.test(t.t));
  if (zwei) {
    findings.push({ level: 'minor', text: 'Im Sprechfunk "zwo" statt "zwei" sagen (Verwechslungsgefahr mit "drei").' });
  }
  const dur = opts.durationSec || 0;
  if (tokens.length > 45 || dur > 25) {
    findings.push({
      level: 'warn',
      text: 'Sendung zu lang – kurz und präzise funken, lange Nachrichten aufteilen (max. ca. 20 Sekunden).',
    });
  }
}

function lastWordIndex(tokens, word) {
  for (let i = tokens.length - 1; i >= 0; i--) if (wordMatches(tokens[i].t, word)) return i;
  return -1;
}

function checkEnding(tokens, spec, findings) {
  const want = spec.ending || 'kommen';
  const iK = lastWordIndex(tokens, 'kommen');
  const iE = lastWordIndex(tokens, 'ende');
  const last = tokens.length - 1;
  let got = null;
  if (iK === last) got = 'kommen';
  else if (iE === last) got = 'ende';
  else if (iK >= 0 || iE >= 0) {
    got = iK > iE ? 'kommen' : 'ende';
    findings.push({ level: 'minor', text: `"${got === 'kommen' ? 'Kommen' : 'Ende'}" gehört an das Ende der Sendung.` });
  }

  if (!got) {
    findings.push({
      level: 'error',
      text:
        want === 'ende'
          ? 'Abschluss fehlt: Gespräch mit "Ende" beenden.'
          : 'Übergabe fehlt: Sendung mit "kommen" abschließen, damit die Gegenstelle weiß, dass sie antworten soll.',
    });
    return null;
  }
  if (want === 'either' || got === want) {
    findings.push({ level: 'ok', text: `Sendung korrekt mit "${got === 'kommen' ? 'kommen' : 'Ende'}" abgeschlossen.` });
    return got;
  }
  if (want === 'kommen' && got === 'ende') {
    if (spec.endeOk) {
      findings.push({ level: 'info', text: spec.endeOk });
    } else {
      findings.push({ level: 'error', text: 'Gespräch zu früh mit "Ende" beendet – hier wird eine Antwort erwartet ("kommen").' });
    }
  } else if (want === 'ende' && got === 'kommen') {
    findings.push({
      level: 'warn',
      text: 'Hier wäre "Ende" richtig gewesen – du hast das Gespräch begonnen und beendest es auch.',
    });
  }
  return got;
}

function checkContent(tokens, spec, findings) {
  let essentialOk = true;
  for (const c of spec.content || []) {
    const hit = containsAny(tokens, c.any);
    if (hit) {
      findings.push({ level: 'ok', text: `Inhalt: ${c.label}`, cat: 'content' });
    } else {
      findings.push({ level: c.level || 'warn', text: c.missing || `Inhalt fehlt: ${c.label}`, cat: 'content' });
      if (c.essential) essentialOk = false;
    }
  }
  return essentialOk;
}

function checkSpelling(tokens, spec, findings, opts) {
  const want = spec.spell.toUpperCase();
  const got = extractSpelling(tokens);
  const table = opts.spellTable || 'din2022';
  if (!got.letters) {
    findings.push({ cat: 'content',
      level: 'error',
      text: `Nicht buchstabiert – nach DIN 5009: ${spellOut(want, table)}.`,
    });
    return false;
  }
  if (findPhrase(tokens, 'buchstabiere') < 0) {
    findings.push({ cat: 'content', level: 'minor', text: 'Buchstabieren mit "Ich buchstabiere" ankündigen.' });
  }
  if (got.tables.size > 1) {
    findings.push({ cat: 'content', level: 'info', text: 'Verschiedene Buchstabiertafeln gemischt – besser bei einer bleiben.' });
  }
  if (got.letters === want) {
    findings.push({ cat: 'content', level: 'ok', text: `Korrekt buchstabiert: ${want}` });
    return true;
  }
  findings.push({ cat: 'content',
    level: 'error',
    text: `Buchstabierung fehlerhaft: verstanden "${got.letters}", richtig wäre "${want}" (${spellOut(want, table)}).`,
  });
  return got.letters.length >= want.length - 1;
}

export function isRepeatRequest(tokens) {
  if (tokens.length > 10) return false;
  return (
    tokens.some((t) => wordMatches(t.t, 'wiederholen') || wordMatches(t.t, 'wiederholung')) ||
    findPhrase(tokens, 'nicht verstanden') >= 0
  );
}

function score(findings) {
  let s = 100;
  for (const f of findings) s -= PENALTY[f.level] || 0;
  return Math.max(0, s);
}

/**
 * Bewertet einen Funkspruch.
 * @param {string} text   Transkript der eigenen Sendung
 * @param {object} spec   Erwartung (siehe scenarios.js)
 * @param {object} opts   { durationSec, spellTable }
 */
export function evaluate(text, spec, opts = {}) {
  const tokens = tokenize(text);
  const findings = [];

  if (!tokens.length) {
    findings.push({ level: 'error', text: 'Es wurde nichts verstanden. Deutlich und nach dem Sendeton sprechen.' });
    return { tokens, findings, score: 0, understood: false, intent: 'empty' };
  }

  const repeat = isRepeatRequest(tokens);
  if (spec.type === 'repeat') {
    if (repeat) {
      findings.push({ level: 'ok', text: 'Richtig: Unvollständig empfangene Nachricht mit "Wiederholen" neu anfordern.' });
      checkEnding(tokens, { ending: 'kommen' }, findings);
      commonChecks(tokens, findings, opts);
      return { tokens, findings, score: score(findings), understood: true, intent: 'repeat' };
    }
    findings.push({
      level: 'error',
      text: 'Die Nachricht war verstümmelt! Nicht raten oder quittieren – mit "Wiederholen, kommen" neu anfordern.',
    });
    commonChecks(tokens, findings, opts);
    return { tokens, findings, score: score(findings), understood: true, intent: 'normal' };
  }
  if (repeat) {
    return { tokens, findings: [], score: null, understood: true, intent: 'repeat' };
  }

  let understood = true;
  const own = spec.own ? matchCallsign(tokens, spec.own) : null;
  const target = spec.target ? matchCallsign(tokens, spec.target) : null;

  switch (spec.type) {
    case 'call': {
      if (!target.present) {
        findings.push({ level: 'error', text: `Gerufene Stelle nicht genannt: "${spec.target.full}".` });
        understood = false;
      } else if (!target.full && !spec.shortOk) {
        findings.push({ level: 'warn', text: `Gerufene Stelle beim Anruf vollständig nennen: "${spec.target.full}".` });
      } else {
        findings.push({ level: 'ok', text: 'Gerufene Stelle genannt.' });
      }
      if (!own.present) {
        findings.push({ level: 'error', text: `Eigener Rufname fehlt: "${spec.own.full}".` });
        understood = false;
      } else if (!own.full && !spec.shortOk) {
        findings.push({ level: 'warn', text: `Eigenen Rufnamen beim Anruf vollständig nennen: "${spec.own.full}".` });
      } else {
        findings.push({ level: 'ok', text: 'Eigener Rufname genannt.' });
      }
      if (target.present && own.present) {
        if (target.pos < own.pos) {
          findings.push({ level: 'ok', text: 'Richtige Reihenfolge: gerufene Stelle – von – eigener Rufname.' });
          const between = tokens.slice(target.end + 1, own.pos);
          if (between.some((t) => t.t === 'von')) {
            /* korrekt */
          } else if (between.some((t) => t.t === 'hier')) {
            findings.push({ level: 'minor', text: 'Beim Anruf: "[Gerufene Stelle] von [eigener Rufname]" – nicht "hier".' });
          } else {
            findings.push({ level: 'warn', text: '"von" zwischen den Rufnamen fehlt.' });
          }
        } else {
          findings.push({
            level: 'error',
            text: 'Falsche Reihenfolge: Zuerst die gerufene Stelle, dann "von" und dann der eigene Rufname.',
          });
        }
      }
      // fremde Rufnamen
      const known = [spec.target.digits, spec.own.digits];
      for (const g of numberGroups(tokens)) {
        if (g.digits.length >= 3 && !known.some((k) => k && (g.digits === k || g.digits.includes(k)))) {
          findings.push({ level: 'warn', text: `Unbekannter Rufname/Nummer "${g.parts.join(' ')}" genannt – Rufnamen prüfen.` });
        }
      }
      if (spec.funkprobe) {
        if (findPhrase(tokens, 'funkprobe') >= 0) findings.push({ level: 'ok', text: '"Funkprobe" angekündigt.' });
        else {
          findings.push({ level: 'error', text: 'Das Wort "Funkprobe" fehlt im Anruf.' });
          understood = false;
        }
      }
      if (spec.content) checkContent(tokens, spec, findings);
      checkEnding(tokens, spec, findings);
      break;
    }
    case 'answer':
    case 'funkprobe': {
      const hier = tokens[0] && wordMatches(tokens[0].t, 'hier');
      const hierAny = tokens.some((t) => t.t === 'hier');
      if (own.present) {
        findings.push(
          own.full || spec.shortOk
            ? { level: 'ok', text: 'Eigener Rufname genannt.' }
            : { level: 'minor', text: `Rufname vollständig nennen: "${spec.own.full}".` }
        );
      } else {
        const other = numberGroups(tokens).find((g) => g.digits.length >= 3 && g.digits !== spec.own.digits);
        if (other && !(spec.target && other.digits === spec.target.digits)) {
          findings.push({ level: 'error', text: `Falscher Rufname "${other.parts.join('/')}" – du bist "${spec.own.full}".` });
        } else {
          findings.push({ level: 'error', text: `Beim Antworten den eigenen Rufnamen nennen: "Hier ${spec.own.full}, kommen".` });
        }
      }
      if (hier) findings.push({ level: 'ok', text: 'Antwort mit "Hier …" begonnen.' });
      else if (hierAny) findings.push({ level: 'minor', text: 'Die Antwort beginnt mit "Hier …".' });
      else findings.push({ level: 'warn', text: 'Antwort auf einen Anruf: "Hier [eigener Rufname], kommen".' });
      understood = own.present || hierAny;
      if (spec.type === 'funkprobe') {
        const q = containsAny(tokens, ['verstehe', 'gut', 'klar', 'laut', 'lesbar', 'empfange', 'schlecht', 'verstaendlich']);
        if (q) findings.push({ level: 'ok', text: 'Verständlichkeit der Funkprobe zurückgemeldet.' });
        else
          findings.push({
            level: 'error',
            text: 'Bei einer Funkprobe die Verständigung zurückmelden, z. B. "Verstehe gut" bzw. "Verstehe schlecht".',
          });
      }
      checkEnding(tokens, spec, findings);
      break;
    }
    case 'message': {
      const ok = checkContent(tokens, spec, findings);
      let spellOk = true;
      if (spec.spell) spellOk = checkSpelling(tokens, spec, findings, opts);
      understood = ok && spellOk;
      checkEnding(tokens, spec, findings);
      break;
    }
    case 'ack': {
      const v = findPhrase(tokens, 'verstanden') >= 0;
      if (v) findings.push({ level: 'ok', text: 'Empfang mit "Verstanden" bestätigt.' });
      else findings.push({ level: spec.verstandenLevel || 'warn', text: 'Empfang mit "Verstanden" bestätigen.' });
      const contentOk = spec.content ? checkContent(tokens, spec, findings) : true;
      understood = v || (spec.content && contentOk);
      checkEnding(tokens, spec, findings);
      break;
    }
    case 'end': {
      const got = checkEnding(tokens, { ending: 'ende' }, findings);
      understood = got !== null;
      if (got === 'kommen') understood = true;
      if (spec.content) checkContent(tokens, spec, findings);
      break;
    }
    default:
      break;
  }

  commonChecks(tokens, findings, opts);
  return { tokens, findings, score: score(findings), understood, intent: 'normal' };
}
