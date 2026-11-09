import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/js/engine.js';
import { SCENARIOS, buildScenario, buildShift } from '../src/js/scenarios.js';

/** Simuliert einen perfekten Funker, der die Musterlösungen spricht. */
function runPerfect(scenario) {
  return new Promise((resolve, reject) => {
    let engine;
    let pendingStatus = null;
    const io = {
      transmit: async () => {},
      waitForTalkgroup: async () => {},
      statusIn: () => {},
      delay: () => Promise.resolve(),
      emit(ev, data) {
        if (ev === 'expect') engine._sample = data.sample;
        if (ev === 'step' && data.step.kind === 'status') pendingStatus = data.step.value;
        if (ev === 'await') {
          setTimeout(() => {
            if (data.type === 'tx') engine.userTransmission({ text: engine._sample, durationSec: 4, tg: engine.tg });
            if (data.type === 'status') engine.userStatus(pendingStatus);
          }, 0);
        }
        if (ev === 'finish') resolve(data);
        if (ev === 'error') reject(new Error(data.message));
      },
    };
    engine = new Engine(io, { answerTimeoutSec: 0 });
    engine.start(scenario).catch(reject);
  });
}

for (const def of SCENARIOS) {
  test(`Musterlösung erreicht volle Punktzahl: ${def.id}`, async () => {
    for (let seed = 1; seed <= 6; seed++) {
      const sc = buildScenario(def.id, seed * 7919);
      const sum = await runPerfect(sc);
      const bad = sum.results.filter((r) => r.score !== null && r.score < 100);
      assert.equal(bad.length, 0, `${def.id} seed ${seed}: ` + JSON.stringify(bad.map((b) => [b.label, b.text, b.findings.filter((f) => f.level !== 'ok')])));
      assert.ok(sum.results.length > 0);
    }
  });
}

test('Einsatzdienst läuft durch', async () => {
  const sum = await runPerfect(buildShift(42, 4));
  assert.ok(sum.score >= 95, String(sum.score));
});

test('Wiederholen spielt letzte Nachricht erneut ab', async () => {
  const sc = buildScenario('auftrag', 5);
  const said = [];
  let engine;
  let n = 0;
  await new Promise((resolve) => {
    engine = new Engine({
      transmit: async (who, text) => said.push(text),
      waitForTalkgroup: async () => {},
      statusIn() {},
      delay: () => Promise.resolve(),
      emit(ev, data) {
        if (ev === 'expect') engine._sample = data.sample;
        if (ev === 'await' && data.type === 'tx') {
          n++;
          const text = n === 2 ? 'Wiederholen, kommen' : engine._sample;
          setTimeout(() => engine.userTransmission({ text, durationSec: 2, tg: engine.tg }), 0);
        }
        if (ev === 'finish') resolve();
      },
    }, { answerTimeoutSec: 0 });
    engine.start(sc);
  });
  assert.ok(said.some((t) => t.startsWith('Ich wiederhole: Fahren Sie')), said.join(' | '));
});
