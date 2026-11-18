import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/js/engine.js';
import { SCENARIOS, buildScenario, cleanPlace, makeContext, makeRng } from '../src/js/scenarios.js';
import { buildFree, freeRoster, identifyCalled } from '../src/js/free.js';
import { buildLesson, LESSONS } from '../src/js/tutorial.js';
import { tokenize } from '../src/js/normalize.js';

/** Perfekter Funker: spricht die Musterlösungen, setzt geforderte Status. */
function runPerfect(scenario) {
  return new Promise((resolve, reject) => {
    let engine;
    let expect = {};
    let pendingStatus = null;
    engine = new Engine(
      {
        transmit: async () => {},
        waitForTalkgroup: async () => {},
        statusIn: () => {},
        actionDone: () => true,
        delay: () => Promise.resolve(),
        emit(ev, data) {
          if (ev === 'expect') expect = data;
          if (ev === 'step' && data.step.kind === 'status') pendingStatus = data.step.value;
          if (ev === 'await') {
            setTimeout(() => {
              if (data.type === 'tx') engine.userTransmission({ text: expect.sample, durationSec: 4, tg: expect.tg || engine.tg });
              if (data.type === 'status') engine.userStatus(pendingStatus);
              if (data.type === 'continue') engine.continue();
            }, 0);
          }
          if (ev === 'coach' && data.needContinue) setTimeout(() => engine.continue(), 0);
          if (ev === 'finish') resolve(data);
          if (ev === 'error') reject(new Error(data.message));
        },
      },
      { answerTimeoutSec: 0 }
    );
    engine.start(scenario).catch(reject);
  });
}

const bad = (sum) => sum.results.filter((r) => r.score !== null && r.score < 100);
const PLACES = [
  { ort: 'Bad Kreuznach', lstOrt: 'Main-Kinzig' },
  { ort: 'Neustadt-Glewe', lstOrt: '' },
  { ort: 'Frankfurt am Main', lstOrt: 'Frankfurt' },
  { ort: 'Görlitz', lstOrt: 'Ostsachsen' },
];

test('Ortsname wird bereinigt', () => {
  assert.equal(cleanPlace('  Bad   Kreuznach 2 '), 'Bad Kreuznach');
  assert.equal(cleanPlace('Görlitz!'), 'Görlitz');
  assert.equal(cleanPlace('21/52'), '');
  assert.equal(cleanPlace(''), '');
});

test('Eigener Ort landet in allen Rufnamen', () => {
  const ctx = makeContext(makeRng(3), { ort: 'Görlitz', lstOrt: 'Ostsachsen' });
  assert.equal(ctx.own.full.startsWith('Heros Görlitz '), true);
  assert.equal(ctx.ztr.place, 'Görlitz');
  assert.equal(ctx.lst.full, 'Florian Ostsachsen');
  assert.match(ctx.unit, /OV Görlitz/);
  const r = freeRoster(ctx);
  assert.equal(r.elfw.cs.place, 'Görlitz');
});

test('Leer = zufälliger Ort wie bisher', () => {
  assert.deepEqual(makeContext(makeRng(9), {}).own, makeContext(makeRng(9)).own);
});

for (const place of PLACES) {
  test(`Musterlösungen volle Punktzahl mit Ort „${place.ort}“`, async () => {
    for (const def of SCENARIOS) {
      const sum = await runPerfect(buildScenario(def.id, 4242, place));
      assert.equal(bad(sum).length, 0, `${def.id}: ` + JSON.stringify(bad(sum).map((b) => [b.label, b.text, b.findings.filter((f) => f.level !== 'ok')])));
    }
    for (let seed = 1; seed <= 4; seed++) {
      const sum = await runPerfect(buildFree(seed * 31, { count: 8, ...place }));
      assert.equal(bad(sum).length, 0, 'frei: ' + JSON.stringify(bad(sum).map((b) => [b.label, b.text, b.findings.filter((f) => f.level !== 'ok')])));
    }
  });

  test(`Freier Modus erkennt Leitstelle und Stationen mit Ort „${place.ort}“`, () => {
    const ctx = makeContext(makeRng(5), place);
    const r = freeRoster(ctx);
    for (const key of Object.keys(r)) {
      const hit = identifyCalled(tokenize(`${r[key].cs.full} von ${ctx.own.full}, kommen`), r, ctx.own);
      assert.equal(hit && hit.key, key, `${key}: ${r[key].cs.full}`);
    }
  });
}

test('Tutorial übernimmt den Ort', () => {
  const l = buildLesson(LESSONS[1].id, { ort: 'Görlitz' });
  assert.equal(l.ctx.own.full, 'Heros Görlitz 21/52');
  assert.equal(l.ctx.lst.full, 'Florian Görlitz');
});
