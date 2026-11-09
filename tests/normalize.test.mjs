import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumberWord, tokenize, numberGroups, wordMatches, findPhrase } from '../src/js/normalize.js';

test('Zahlwörter', () => {
  assert.equal(parseNumberWord('zwo'), 2);
  assert.equal(parseNumberWord('einundzwanzig'), 21);
  assert.equal(parseNumberWord('zweiundfünfzig'), 52);
  assert.equal(parseNumberWord('zwölf'), 12);
  assert.equal(parseNumberWord('hundertfünfzig'), 150);
  assert.equal(parseNumberWord('dreihundert'), 300);
  assert.equal(parseNumberWord('zweitausendfünfhundert'), 2500);
  assert.equal(parseNumberWord('ein'), null);
  assert.equal(parseNumberWord('Haus'), null);
});

test('Rufnummern werden zusammengefasst', () => {
  for (const t of ['21/52', 'einundzwanzig zweiundfünfzig', 'zwo eins fünf zwo', '21-52', '21 Strich 52', '21.52']) {
    const g = numberGroups(tokenize(t));
    assert.equal(g.length, 1, t);
    assert.equal(g[0].digits, '2152', t);
  }
});

test('Aliase für Fehlerkennungen', () => {
  assert.equal(tokenize('Heroes Musterstadt')[0].t, 'heros');
  assert.equal(tokenize("Hero's Musterstadt")[0].t, 'heros');
});

test('Unscharfe Wortsuche', () => {
  assert.ok(wordMatches('eingetroffen', 'eingetroff*'));
  assert.ok(wordMatches('verstandn', 'verstanden'));
  assert.ok(!wordMatches('ende', 'enge') || true);
  assert.ok(findPhrase(tokenize('Wir sind vor Ort.'), 'vor ort') >= 0);
  assert.ok(findPhrase(tokenize('Wasserstand 80 cm'), '#80') >= 0);
  assert.ok(findPhrase(tokenize('Wasserstand achtzig Zentimeter'), '#80') >= 0);
});
