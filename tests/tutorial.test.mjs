import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/js/engine.js';
import { LESSONS, buildLesson } from '../src/js/tutorial.js';

function run(lesson, answer) {
  return new Promise((resolve, reject) => {
    let engine;
    let pendingStatus = null;
    let n = 0;
    const coach = [];
    const io = {
      transmit: async () => {},
      waitForTalkgroup: async () => {},
      statusIn: () => {},
      delay: () => Promise.resolve(),
      actionDone: () => false, // erst nach Benutzeraktion erledigt
      emit(ev, data) {
        if (ev === 'expect') engine._sample = data.sample;
        if (ev === 'step' && data.step.kind === 'status') pendingStatus = data.step.value;
        if (ev.startsWith('coach')) coach.push([ev, data]);
        if (ev === 'coach' && data.needContinue) setTimeout(() => engine.continue(), 0);
        if (ev === 'coach' && data.kind === 'action') {
          setTimeout(() => {
            if (data.what === 'ptt') engine.userTransmission({ text: 'Probesendung', durationSec: 2, tg: engine.tg, issues: [] });
            else {
              io.actionDone = () => true;
              engine.userAction(data.what);
              io.actionDone = () => false;
            }
          }, 0);
        }
        if (ev === 'await') {
          setTimeout(() => {
            if (data.type === 'tx') engine.userTransmission({ text: answer(engine._sample, n++), durationSec: 3, tg: engine.tg });
            if (data.type === 'status') engine.userStatus(pendingStatus);
          }, 0);
        }
        if (ev === 'finish') resolve({ summary: data, coach });
        if (ev === 'error') reject(new Error(data.message));
      },
    };
    engine = new Engine(io, { answerTimeoutSec: 0 });
    engine.start(lesson).catch(reject);
  });
}

for (const def of LESSONS) {
  test(`Lektion mit Musterlösungen: ${def.id}`, async () => {
    const { summary, coach } = await run(buildLesson(def.id), (s) => s);
    const bad = summary.results.filter((r) => r.score !== null && r.score < 100);
    assert.equal(bad.length, 0, JSON.stringify(bad.map((b) => [b.label, b.text, b.findings])));
    assert.ok(!coach.some(([ev]) => ev === 'coach-retry'));
  });
}

test('Strenger Modus verlangt Wiederholung bei Fehlern', async () => {
  // erster Versuch jeder Sendung ohne "kommen"/"Ende" -> Fehler -> Wiederholung
  const seen = new Set();
  const { summary, coach } = await run(buildLesson('tut-melden'), (s) => {
    if (!seen.has(s)) {
      seen.add(s);
      return s.replace(/,?\s*(kommen|Ende)\.?$/i, '');
    }
    return s;
  });
  assert.ok(coach.filter(([ev]) => ev === 'coach-retry').length >= 2);
  assert.ok(summary.results.some((r) => r.score === 100));
});
