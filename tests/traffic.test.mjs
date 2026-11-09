import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/js/engine.js';
import { SCENARIOS, buildScenario, buildShift, withoutStatus } from '../src/js/scenarios.js';
import { addTraffic } from '../src/js/traffic.js';

function runPerfect(scenario, { interruptChatter = false } = {}) {
  return new Promise((resolve, reject) => {
    let engine;
    let pendingStatus = null;
    let interrupted = false;
    const io = {
      transmit: async () => {
        if (interruptChatter && engine.inChatter && !interrupted) {
          interrupted = true;
          engine.userTransmission({ text: 'Hier Heros, kommen', durationSec: 2, tg: engine.tg });
        }
      },
      waitForTalkgroup: async () => {},
      statusIn: () => {},
      delay: () => Promise.resolve(),
      actionDone: () => true,
      emit(ev, data) {
        if (ev === 'expect') engine._sample = data.sample;
        if (ev === 'step' && data.step.kind === 'status') pendingStatus = data.step.value;
        if (ev === 'await') {
          setTimeout(() => {
            if (data.type === 'tx') engine.userTransmission({ text: engine._sample, durationSec: 3, tg: engine.tg });
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

test('Ohne Status: keine Status-Schritte, Musterlösung weiterhin 100', async () => {
  for (const def of SCENARIOS.filter((s) => s.id !== 'status')) {
    const sc = withoutStatus(buildScenario(def.id, 11));
    assert.ok(!sc.steps.some((s) => s.kind === 'status' || s.kind === 'statusIn'), def.id);
    const sum = await runPerfect(sc);
    assert.equal(sum.score, 100, def.id);
  }
});

test('Einsatzdienst ohne Status-Übung', () => {
  for (let seed = 1; seed < 30; seed++) {
    const sc = buildShift(seed, 4, { exclude: ['status'] });
    assert.ok(!sc.desc.includes('Status & Sprechwunsch'));
  }
});

test('Fremdverkehr wird eingefügt und bei "viel" häufig', () => {
  let total = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const sc = addTraffic(buildShift(seed, 4), 'viel', seed);
    const chatter = sc.steps.filter((s) => s.kind === 'rx' && s.chatter);
    total += chatter.length;
    for (const c of chatter) assert.ok(sc.stations[c.who], `Station ${c.who} fehlt`);
  }
  assert.ok(total / 10 >= 12, `zu wenig Fremdverkehr: ${total / 10}`);
  const none = addTraffic(buildScenario('auftrag', 1), 'aus', 1);
  assert.ok(!none.steps.some((s) => s.chatter));
});

test('Fremdverkehr beeinträchtigt korrekte Lösungen nicht', async () => {
  for (const def of SCENARIOS) {
    const sc = addTraffic(buildScenario(def.id, 5), 'viel', 5);
    const sum = await runPerfect(sc);
    assert.equal(sum.score, 100, def.id);
  }
});

test('Dazwischenfunken im Fremdverkehr wird als Fehler gewertet', async () => {
  const sc = addTraffic(buildScenario('auftrag', 3), 'viel', 3);
  const sum = await runPerfect(sc, { interruptChatter: true });
  assert.ok(sum.results.some((r) => r.label === 'Fremdverkehr gestört'));
});
