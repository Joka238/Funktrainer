import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/js/engine.js';
import { makeRng, makeContext } from '../src/js/scenarios.js';
import { buildFree, buildFreeTask, freeRoster, identifyCalled, FREE_TEMPLATE_IDS } from '../src/js/free.js';
import { tokenize } from '../src/js/normalize.js';
import { addTraffic } from '../src/js/traffic.js';

/** Szenario mit genau einer freien Aufgabe. */
function single(id, seed = 3) {
  const rnd = makeRng(seed);
  const ctx = makeContext(rnd);
  const roster = freeRoster(ctx);
  const step = { ...buildFreeTask(id, ctx), wait: 0 };
  return {
    id: 'frei',
    title: 'Freier Modus',
    free: true,
    ctx,
    roster,
    stations: Object.fromEntries(Object.values(roster).map((r) => [r.key, { name: r.name, cs: r.cs }])),
    tg: ctx.tgEA,
    briefing: '',
    steps: [step],
  };
}

/**
 * Lässt eine Übung laufen. reply(data, n) liefert den Funkspruch für die n-te Sendung
 * (data = { label, sample, tg }), oder ein Objekt { text, tg }.
 */
function run(scenario, reply) {
  return new Promise((resolve, reject) => {
    let engine;
    let expect = {};
    let n = 0;
    let pendingStatus = null;
    const said = [];
    const io = {
      transmit: async (who, text) => said.push({ who, text }),
      waitForTalkgroup: async () => {},
      statusIn: () => {},
      delay: () => Promise.resolve(),
      emit(ev, data) {
        if (ev === 'expect') expect = data;
        if (ev === 'step' && data.step.kind === 'status') pendingStatus = data.step.value;
        if (ev === 'await') {
          setTimeout(() => {
            if (data.type === 'tx') {
              n++;
              const tg = expect.tg || engine.tg;
              const r = reply({ ...expect, tg, said }, n);
              const tr = typeof r === 'string' ? { text: r, tg } : { tg, ...r };
              engine.userTransmission({ durationSec: 4, issues: [], ...tr });
            }
            if (data.type === 'status') engine.userStatus(pendingStatus);
          }, 0);
        }
        if (ev === 'finish') resolve({ ...data, said });
        if (ev === 'error') reject(new Error(data.message));
      },
    };
    engine = new Engine(io, { answerTimeoutSec: 0 });
    engine.start(scenario).catch(reject);
  });
}

const perfect = (d) => d.sample;
const bad = (sum) => sum.results.filter((r) => r.score !== null && r.score < 100);

for (const id of FREE_TEMPLATE_IDS) {
  test(`Freier Modus – Musterlösung volle Punktzahl: ${id}`, async () => {
    for (let seed = 1; seed <= 5; seed++) {
      const sum = await run(single(id, seed * 7919), perfect);
      assert.equal(bad(sum).length, 0, `${id} seed ${seed}: ` + JSON.stringify(bad(sum).map((b) => [b.label, b.text, b.findings.filter((f) => f.level !== 'ok')])));
      assert.ok(sum.results.length >= 2);
    }
  });
}

test('Freier Modus komplett (mit Fremdverkehr, Status, Warten)', async () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sc = addTraffic(buildFree(seed * 101, { count: 6 }), 'viel', seed);
    const sum = await run(sc, perfect);
    assert.equal(bad(sum).length, 0, JSON.stringify(bad(sum).map((b) => [b.label, b.text, b.findings.filter((f) => f.level !== 'ok')])));
  }
});

test('Aufgabenauswahl nach Art', () => {
  const sc = buildFree(5, { count: 4, kinds: ['angerufen'] });
  const free = sc.steps.filter((s) => s.kind === 'free');
  assert.equal(free.length, 4);
  assert.ok(free.every((s) => s.dir === 'in'));
});

test('Rufnamen werden eindeutig zugeordnet', () => {
  const ctx = makeContext(makeRng(11));
  const r = freeRoster(ctx);
  const who = (text) => (identifyCalled(tokenize(text), r, ctx.own) || {}).key;
  assert.equal(who(`${r.ztr.cs.full} von ${ctx.own.full}, kommen`), 'ztr');
  assert.equal(who(`${r.elfw.cs.full} von ${ctx.own.full}, kommen`), 'elfw');
  assert.equal(who(`${r.lst.cs.full} von ${ctx.own.full}, kommen`), 'lst');
  assert.equal(who(`${r.log.cs.full} von ${ctx.own.full}, kommen`), 'log');
  assert.equal(who(`${r.rtw.cs.full} von ${ctx.own.full}, kommen`), 'rtw');
  assert.equal(who('Heros Irgendwo 99/99 von mir, kommen'), undefined);
});

test('Falsche Stelle gerufen: Gegenstelle verweist weiter, danach richtige Stelle', async () => {
  const sc = single('a-baufach'); // zuständig: Zugtrupp
  const { roster, ctx } = sc;
  const sum = await run(sc, (d, n) => {
    if (n === 1) return `${roster.log.cs.full} von ${ctx.own.full}, kommen.`;
    if (n === 2) return 'Benötigen Baufachberater, kommen.';
    if (n === 3) return 'Verstanden, Ende.';
    return d.sample;
  });
  assert.ok(sum.said.some((s) => s.who === 'log' && /nicht zuständig/.test(s.text)), JSON.stringify(sum.said));
  assert.ok(sum.said.some((s) => s.who === 'ztr' && s.text.startsWith('Hier')));
  const err = sum.results[0].findings.find((f) => f.level === 'error');
  assert.match(err.text, /nicht zuständig/);
});

test('Fehlende Angaben lösen Rückfragen aus', async () => {
  const sc = single('a-betriebsstoff');
  const { roster, ctx } = sc;
  const sum = await run(sc, (d, n) => {
    if (n === 1) return `${roster.log.cs.full} von ${ctx.own.full}, kommen.`;
    if (n === 2) return 'Benötigen Benzin, kommen.';
    return d.sample;
  });
  const asked = sum.said.filter((s) => s.who === 'log').map((s) => s.text);
  assert.ok(asked.includes('Welche Menge, kommen.'), asked.join(' | '));
  assert.ok(sum.results.some((r) => r.label === 'Rückfrage beantworten'));
});

test('Anruf und Nachricht in einer Sendung', async () => {
  const sc = single('a-polizei');
  const { roster, ctx } = sc;
  const street = ctx.street;
  const sum = await run(sc, (d, n) => {
    if (n === 1) return { text: `${roster.lst.cs.full} von ${ctx.own.full}, benötigen Polizei zur Absperrung in der ${street}, Schaulustige, kommen.`, tg: 'LST Kreis' };
    return { text: d.sample, tg: 'LST Kreis' };
  });
  assert.ok(!sum.said.some((s) => s.text.startsWith('Hier')), JSON.stringify(sum.said));
  assert.ok(sum.results[0].findings.some((f) => /in einer Sendung/.test(f.text)));
  assert.equal(bad(sum).length, 0, JSON.stringify(bad(sum)));
});

test('Leitstelle auf falscher Gesprächsgruppe gerufen: keine Antwort', async () => {
  const sc = single('a-rtw');
  const { roster, ctx } = sc;
  const sum = await run(sc, (d, n) => {
    if (n === 1) return { text: `${roster.lst.cs.full} von ${ctx.own.full}, kommen.`, tg: ctx.tgEA }; // auf EA statt LST
    return { text: d.sample, tg: 'LST Kreis' };
  });
  assert.match(sum.results[0].findings[0].text, /Gesprächsgruppe/);
  assert.ok(sum.said.some((s) => s.who === 'lst'));
});
