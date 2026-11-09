import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, callsign } from '../src/js/evaluator.js';
import { extractSpelling } from '../src/js/spelling.js';
import { tokenize } from '../src/js/normalize.js';

const own = callsign('Heros', 'Musterstadt', '21/52');
const ztr = callsign('Heros', 'Musterstadt', '21/10');
const lst = callsign('Florian', 'Musterstadt');
const levels = (r) => r.findings.map((f) => f.level);

test('Anruf korrekt', () => {
  const r = evaluate('Heros Musterstadt 21/10 von Heros Musterstadt 21/52, kommen.', { type: 'call', own, target: ztr });
  assert.equal(r.score, 100, JSON.stringify(r.findings));
  assert.ok(r.understood);
});

test('Anruf mit gesprochenen Zahlen', () => {
  const r = evaluate('Heros Musterstadt einundzwanzig zehn von Heros Musterstadt einundzwanzig zweiundfünfzig kommen', {
    type: 'call', own, target: ztr,
  });
  assert.ok(r.understood);
  assert.ok(!levels(r).includes('error'), JSON.stringify(r.findings));
});

test('Anruf in falscher Reihenfolge', () => {
  const r = evaluate('Heros Musterstadt 21/52 an Heros Musterstadt 21/10, kommen', { type: 'call', own, target: ztr });
  assert.ok(r.findings.some((f) => f.level === 'error' && /Reihenfolge/.test(f.text)));
});

test('Anruf an Leitstelle', () => {
  const r = evaluate('Florian Musterstadt von Heros Musterstadt 21/52 kommen', { type: 'call', own, target: lst });
  assert.equal(r.score, 100, JSON.stringify(r.findings));
});

test('Anruf ohne kommen', () => {
  const r = evaluate('Heros Musterstadt 21/10 von Heros Musterstadt 21/52', { type: 'call', own, target: ztr });
  assert.ok(r.findings.some((f) => f.level === 'error' && /kommen/.test(f.text)));
});

test('Kurzform des Rufnamens im Anruf -> Warnung, aber verstanden', () => {
  const r = evaluate('21/10 von 21/52 kommen', { type: 'call', own, target: ztr });
  assert.ok(r.understood);
  assert.ok(levels(r).includes('warn'));
});

test('Antwort auf Anruf', () => {
  const r = evaluate('Hier Heros Musterstadt 21/52, kommen.', { type: 'answer', own, target: ztr });
  assert.equal(r.score, 100, JSON.stringify(r.findings));
  const r2 = evaluate('Ja hallo, hier 21/53, kommen', { type: 'answer', own, target: ztr });
  assert.ok(r2.findings.some((f) => /Falscher Rufname/.test(f.text)));
  assert.ok(r2.findings.some((f) => /Grußformeln/.test(f.text)));
});

test('Höflichkeitsformeln und zwei', () => {
  const r = evaluate('Bitte zwei Pumpen, danke, kommen', { type: 'message', own, content: [] });
  assert.ok(r.findings.some((f) => /bitte/.test(f.text)));
  assert.ok(r.findings.some((f) => /danke/.test(f.text)));
  assert.ok(r.findings.some((f) => /zwo/.test(f.text)));
});

test('Quittung mit Inhalt', () => {
  const spec = {
    type: 'ack', own, ending: 'kommen',
    content: [
      { label: 'Straße', any: ['hauptstr*'], level: 'warn' },
      { label: 'Nr', any: ['#12'], level: 'warn' },
    ],
  };
  const r = evaluate('Verstanden, Hauptstraße zwölf, kommen', spec);
  assert.equal(r.score, 100, JSON.stringify(r.findings));
  const r2 = evaluate('Okay alles klar', spec);
  assert.ok(r2.score < 50);
});

test('Wiederholungsanforderung', () => {
  const r = evaluate('Wiederholen, kommen', { type: 'ack', own });
  assert.equal(r.intent, 'repeat');
  const r2 = evaluate('Wiederholen, kommen', { type: 'repeat', own });
  assert.equal(r2.score, 100);
  const r3 = evaluate('Verstanden, kommen', { type: 'repeat', own });
  assert.ok(levels(r3).includes('error'));
});

test('Buchstabieren', () => {
  assert.equal(extractSpelling(tokenize('Ich buchstabiere Quickborn Unna Aachen Salzwedel Tübingen kommen')).letters, 'QUAST');
  assert.equal(extractSpelling(tokenize('Quelle, Ulrich, Anton, Samuel, Theodor')).letters, 'QUAST');
  assert.equal(extractSpelling(tokenize('Julius Otto Charlotte Wilhelm Anton Ludwig Dora')).letters, 'JOCHWALD');
  const r = evaluate('Ich buchstabiere: Quickborn, Unna, Aachen, Salzwedel, Tübingen, kommen.', { type: 'message', own, spell: 'Quast' });
  assert.equal(r.score, 100, JSON.stringify(r.findings));
  const r2 = evaluate('Quast, kommen', { type: 'message', own, spell: 'Quast' });
  assert.ok(!r2.understood);
  const r3 = evaluate('Ich buchstabiere Quebec Uniform Alfa Sierra Tango kommen', { type: 'message', own, spell: 'Quast' });
  assert.equal(r3.score, 100, JSON.stringify(r3.findings));
  const r4 = evaluate('Ich buchstabiere Quebec Ulrich Aachen Sierra Tango kommen', { type: 'message', own, spell: 'Quast' });
  assert.ok(r4.findings.some((f) => /gemischt/.test(f.text)));
});

test('Ende statt kommen', () => {
  const r = evaluate('Verstanden, Ende', { type: 'end', own });
  assert.equal(r.score, 100);
  const r2 = evaluate('Verstanden, Ende', { type: 'message', own, content: [] });
  assert.ok(levels(r2).includes('error'));
});

test('Funkprobe', () => {
  const r = evaluate('Heros Musterstadt 21/10 von Heros Musterstadt 21/52, Funkprobe, kommen', { type: 'call', own, target: ztr, funkprobe: true });
  assert.equal(r.score, 100, JSON.stringify(r.findings));
  const r2 = evaluate('Hier Heros Musterstadt 21/52, verstehe gut, kommen', { type: 'funkprobe', own, target: ztr });
  assert.equal(r2.score, 100, JSON.stringify(r2.findings));
});

test('NATO-Musterlösung wird voll akzeptiert', async () => {
  const { spellOut } = await import('../src/js/spelling.js');
  const s = spellOut('Brixner', 'nato');
  assert.equal(s, 'Bravo, Romeo, India, X-Ray, November, Echo, Romeo');
  const r = evaluate(`Ich buchstabiere: ${s}, kommen.`, { type: 'message', own, spell: 'Brixner' });
  assert.equal(r.score, 100, JSON.stringify(r.findings));
});
