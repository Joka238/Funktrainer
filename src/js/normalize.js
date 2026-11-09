// Textnormalisierung für die Auswertung von Funksprüchen.
// Wandelt Transkripte (z. B. aus der Spracherkennung) in vergleichbare Token um,
// erkennt deutsche Zahlwörter und erlaubt unscharfe Wortvergleiche.

/** Kleinschreibung + Umlaute/ß auflösen. */
export function fold(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[àáâ]/g, 'a')
    .replace(/[èéê]/g, 'e')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

const UNITS = {
  null: 0, eins: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwoelf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15, sechzehn: 16, siebzehn: 17,
  achtzehn: 18, neunzehn: 19,
};
// Einheiten, die nur als Teil zusammengesetzter Zahlen vorkommen ("einundzwanzig", "einhundert")
const COMPOUND_UNITS = { ...UNITS, ein: 1, eine: 1, sieb: 7 };
const TENS = {
  zwanzig: 20, dreissig: 30, dreizig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
};

function parseBelowHundred(w) {
  if (w in COMPOUND_UNITS) return COMPOUND_UNITS[w];
  if (w in TENS) return TENS[w];
  const i = w.indexOf('und');
  if (i > 0) {
    const u = COMPOUND_UNITS[w.slice(0, i)];
    const t = TENS[w.slice(i + 3)];
    if (u !== undefined && u > 0 && u < 10 && t !== undefined) return u + t;
  }
  return null;
}

function parseBelowThousand(w) {
  const i = w.indexOf('hundert');
  if (i >= 0) {
    const left = w.slice(0, i);
    const right = w.slice(i + 7);
    const h = left === '' ? 1 : COMPOUND_UNITS[left];
    if (h === undefined || h < 1 || h > 9) return null;
    const r = right === '' ? 0 : right.startsWith('und') ? parseBelowHundred(right.slice(3)) : parseBelowHundred(right);
    if (r === null) return null;
    return h * 100 + r;
  }
  return parseBelowHundred(w);
}

/** Wandelt ein (gefaltetes) deutsches Zahlwort in eine Zahl um, sonst null. */
export function parseNumberWord(word) {
  const w = fold(word);
  if (!w) return null;
  // "ein"/"eine" stehen allein meist für einen Artikel – nicht als Zahl werten
  if (w === 'ein' || w === 'eine' || w === 'sieb') return null;
  if (w in UNITS) return UNITS[w];
  const i = w.indexOf('tausend');
  if (i >= 0) {
    const left = w.slice(0, i);
    const right = w.slice(i + 7);
    const t = left === '' ? 1 : parseBelowThousand(left);
    if (t === null || t < 1) return null;
    const r = right === '' ? 0 : parseBelowThousand(right.startsWith('und') ? right.slice(3) : right);
    if (r === null) return null;
    return t * 1000 + r;
  }
  return parseBelowThousand(w);
}

// Häufige Fehlerkennungen der Spracherkennung für BOS-Begriffe
const ALIASES = [
  [/\bherr ?ros+\b/g, 'heros'],
  [/\bhero'?s\b/g, 'heros'],
  [/\bheroes\b/g, 'heros'],
  [/\bher+us\b/g, 'heros'],
  [/\bhe ros\b/g, 'heros'],
  [/\bherros\b/g, 'heros'],
  [/\bkomm\b/g, 'kommen'],
  [/\bcommen\b/g, 'kommen'],
  [/\bkommend\b/g, 'kommen'],
  [/\bo\.? ?k\.?\b/g, 'okay'],
];

/**
 * Zerlegt einen Text in Token.
 * Jedes Token: { t: gefaltetes Wort, raw: Original, num: Ziffernfolge|null }
 */
export function tokenize(text) {
  let s = fold(text);
  for (const [re, rep] of ALIASES) s = s.replace(re, rep);
  // Zahlen wie 21/52, 21-52, 21.52 trennen
  s = s.replace(/(\d)[/\-.,:](\d)/g, '$1 $2');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  // Ziffern und Buchstaben trennen ("12a" bleibt, "21er" -> "21 er")
  s = s.replace(/(\d)([a-z]{2,})/g, '$1 $2');
  const out = [];
  for (const t of s.split(/\s+/)) {
    if (!t) continue;
    let num = null;
    if (/^\d+$/.test(t)) num = t;
    else {
      const n = parseNumberWord(t);
      if (n !== null) num = String(n);
    }
    out.push({ t, num });
  }
  return out;
}

const NUM_SEPARATORS = new Set(['strich', 'schraegstrich', 'slash']);

/**
 * Fasst aufeinanderfolgende Zahl-Token zu Ziffernfolgen zusammen
 * ("zwo eins fuenf zwo" -> "2152", "21 52" -> "2152").
 */
export function numberGroups(tokens) {
  const groups = [];
  let cur = null;
  tokens.forEach((tok, i) => {
    if (tok.num !== null) {
      if (cur) {
        cur.digits += tok.num;
        cur.parts.push(tok.num);
        cur.end = i;
      } else {
        cur = { digits: tok.num, parts: [tok.num], start: i, end: i };
      }
    } else if (cur && NUM_SEPARATORS.has(tok.t)) {
      // Trennwort innerhalb einer Zahl ignorieren
    } else if (cur) {
      groups.push(cur);
      cur = null;
    }
  });
  if (cur) groups.push(cur);
  return groups;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function tolerance(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

/**
 * Unscharfer Wortvergleich. Muster mit "*" am Ende = Präfixvergleich
 * ("eingetroff*" passt auf "eingetroffen").
 */
export function wordMatches(token, pattern) {
  const p = fold(pattern);
  if (p.endsWith('*')) {
    const stem = p.slice(0, -1);
    if (token.startsWith(stem)) return true;
    if (token.length < stem.length) return false;
    return levenshtein(token.slice(0, stem.length), stem) <= Math.min(1, tolerance(stem.length));
  }
  if (token === p) return true;
  return levenshtein(token, p) <= tolerance(p.length);
}

/**
 * Sucht eine Wortfolge (unscharf) in den Token. "#12" steht für die Zahl 12.
 * Liefert den Startindex oder -1.
 */
export function findPhrase(tokens, phrase) {
  if (phrase.startsWith('#')) {
    const want = phrase.slice(1);
    const i = tokens.findIndex((t) => t.num === want);
    if (i >= 0) return i;
    const g = numberGroups(tokens).find((gr) => gr.digits === want);
    return g ? g.start : -1;
  }
  const words = fold(phrase).split(/\s+/).filter(Boolean);
  if (!words.length) return -1;
  // Zusammengeschriebene Variante zulassen ("vor ort" ~ "vorort")
  const joined = words.join('');
  for (let i = 0; i < tokens.length; i++) {
    let ok = true;
    for (let k = 0; k < words.length; k++) {
      const tok = tokens[i + k];
      if (!tok || !wordMatches(tok.t, words[k])) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
    if (words.length > 1 && wordMatches(tokens[i].t, joined)) return i;
  }
  return -1;
}

export function containsAny(tokens, alternatives) {
  for (const alt of alternatives) {
    const i = findPhrase(tokens, alt);
    if (i >= 0) return { index: i, match: alt };
  }
  return null;
}

/** Zahl in Ziffernschreibweise ohne Trennzeichen ("21/52" -> "2152"). */
export function digitsOf(s) {
  return String(s || '').replace(/\D/g, '');
}
