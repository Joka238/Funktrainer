// Buchstabiertafeln: DIN 5009 (2022, Städtenamen), traditionelle Tafel und NATO-Alphabet.
import { fold, levenshtein } from './normalize.js';

export const DIN_2022 = {
  A: 'Aachen', Ä: 'Umlaut Aachen', B: 'Berlin', C: 'Chemnitz', D: 'Düsseldorf', E: 'Essen', F: 'Frankfurt',
  G: 'Goslar', H: 'Hamburg', I: 'Ingelheim', J: 'Jena', K: 'Köln', L: 'Leipzig', M: 'München', N: 'Nürnberg',
  O: 'Offenbach', Ö: 'Umlaut Offenbach', P: 'Potsdam', Q: 'Quickborn', R: 'Rostock', S: 'Salzwedel',
  ß: 'Eszett', T: 'Tübingen', U: 'Unna', Ü: 'Umlaut Unna', V: 'Völklingen', W: 'Wuppertal', X: 'Xanten',
  Y: 'Ypsilon', Z: 'Zwickau',
};

export const DIN_TRAD = {
  A: 'Anton', Ä: 'Ärger', B: 'Berta', C: 'Cäsar', CH: 'Charlotte', D: 'Dora', E: 'Emil', F: 'Friedrich',
  G: 'Gustav', H: 'Heinrich', I: 'Ida', J: 'Julius', K: 'Kaufmann', L: 'Ludwig', M: 'Martha', N: 'Nordpol',
  O: 'Otto', Ö: 'Ökonom', P: 'Paula', Q: 'Quelle', R: 'Richard', S: 'Samuel', SCH: 'Schule', ß: 'Eszett',
  T: 'Theodor', U: 'Ulrich', Ü: 'Übermut', V: 'Viktor', W: 'Wilhelm', X: 'Xanthippe', Y: 'Ypsilon',
  Z: 'Zacharias',
};

export const NATO = {
  A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India',
  J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
  S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-Ray', Y: 'Yankee', Z: 'Zulu',
};

// Lookup: gefaltetes Wort -> { letters, table }
const LOOKUP = new Map();
function add(word, letters, table) {
  const key = fold(word).replace(/[^a-z]/g, '');
  if (!LOOKUP.has(key)) LOOKUP.set(key, { letters, table });
}
for (const [l, w] of Object.entries(DIN_2022)) if (!w.startsWith('Umlaut')) add(w, l, 'din2022');
for (const [l, w] of Object.entries(DIN_TRAD)) add(w, l, 'trad');
// Varianten der traditionellen Tafel
add('Siegfried', 'S', 'trad');
add('Zeppelin', 'Z', 'trad');
add('Bertha', 'B', 'trad');
add('Marta', 'M', 'trad');
add('Caesar', 'C', 'trad');
add('Xanthipe', 'X', 'trad');
add('Xantippe', 'X', 'trad');
add('Ypsilon', 'Y', 'din2022');
for (const [l, w] of Object.entries(NATO)) add(w, l, 'nato');
add('Alpha', 'A', 'nato');
add('Juliet', 'J', 'nato');
add('Oskar', 'O', 'nato');
add('Xray', 'X', 'nato');
add('Whisky', 'W', 'nato');

const UMLAUT = { A: 'Ä', O: 'Ö', U: 'Ü' };

function lookupWord(t) {
  if (LOOKUP.has(t)) return LOOKUP.get(t);
  if (t.length < 4) return null;
  let best = null;
  let bestD = 99;
  for (const [k, v] of LOOKUP) {
    if (Math.abs(k.length - t.length) > 2) continue;
    const d = levenshtein(k, t);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  const tol = t.length <= 5 ? 1 : 2;
  return bestD <= tol ? best : null;
}

/**
 * Extrahiert die längste zusammenhängende buchstabierte Folge aus Token.
 * Liefert { letters: 'QUAST', tables: Set, words: [...] }.
 */
export function extractSpelling(tokens) {
  let best = { letters: '', tables: new Set(), words: [] };
  let cur = { letters: '', tables: new Set(), words: [] };
  let umlautNext = false;
  const flush = () => {
    if (cur.letters.length > best.letters.length) best = cur;
    cur = { letters: '', tables: new Set(), words: [] };
  };
  for (const tok of tokens) {
    if (tok.t === 'umlaut') {
      umlautNext = true;
      continue;
    }
    const hit = tok.num === null ? lookupWord(tok.t) : null;
    if (hit) {
      let letters = hit.letters;
      if (umlautNext && UMLAUT[letters]) letters = UMLAUT[letters];
      cur.letters += letters;
      cur.tables.add(hit.table);
      cur.words.push(tok.t);
    } else if (['und', 'dann', 'ich', 'buchstabiere'].includes(tok.t) && cur.letters) {
      // Füllwörter innerhalb der Buchstabierung ignorieren
    } else {
      flush();
    }
    umlautNext = false;
  }
  flush();
  return best;
}

/** Buchstabierwörter für ein Wort nach gewählter Tafel (für Hilfetexte). */
export function spellOut(word, table = 'din2022') {
  const t = table === 'trad' ? DIN_TRAD : DIN_2022;
  const up = String(word).toUpperCase();
  const out = [];
  for (let i = 0; i < up.length; i++) {
    if (table === 'trad' && up.startsWith('SCH', i)) {
      out.push(t.SCH);
      i += 2;
      continue;
    }
    if (table === 'trad' && up.startsWith('CH', i)) {
      out.push(t.CH);
      i += 1;
      continue;
    }
    const c = up[i];
    if (t[c]) out.push(t[c]);
  }
  return out.join(', ');
}
