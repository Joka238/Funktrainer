import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveTranscriber } from '../src/js/live-stt.js';

const RATE = 16000;

/** Tonspur aus Abschnitten: ['s', 0.8] = 0,8 s "Sprache" (Sinus), ['p', 0.5] = Pause (leises Rauschen). */
function signal(parts) {
  const out = [];
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.002;
  for (const [kind, sec] of parts) {
    const n = Math.round(sec * RATE);
    for (let i = 0; i < n; i++) out.push(kind === 's' ? 0.3 * Math.sin(i / 3) + noise() : noise());
  }
  return Float32Array.from(out);
}

/** Simulierte Erkennung: ein Wort je zusammenhängendem lauten Abschnitt ("w1 w2 …" nach Position). */
function fakeAsr(log, delayMs = 0) {
  return async (samples) => {
    log.push(samples.length);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const words = [];
    let inSpeech = false;
    let quiet = 0;
    for (let i = 0; i < samples.length; i += 160) {
      let s = 0;
      for (let k = i; k < Math.min(samples.length, i + 160); k++) s += samples[k] * samples[k];
      const loud = Math.sqrt(s / 160) > 0.05;
      if (loud && !inSpeech) {
        words.push('w');
        inSpeech = true;
      }
      quiet = loud ? 0 : quiet + 1;
      if (quiet > 10) inSpeech = false;
    }
    return words.join(' ');
  };
}

/** Speist die Tonspur in Echtzeit-ähnlichen Stücken ein (2048 Samples, ohne echtes Warten). */
async function feed(live, pcm, { realtime = false } = {}) {
  for (let i = 0; i < pcm.length; i += 2048) {
    live.push(pcm.subarray(i, i + 2048));
    // anderen Promises (laufende Erkennung) Gelegenheit geben
    await new Promise((r) => (realtime ? setTimeout(r, (2048 / RATE) * 1000) : setImmediate(r)));
  }
}

const make = (log, delayMs, partials = []) =>
  new LiveTranscriber({ rate: RATE, toAsr: async (pcm) => pcm, transcribe: fakeAsr(log, delayMs), onPartial: (t) => partials.push(t) });

test('Pause vor dem Loslassen: Ergebnis ist sofort fertig (keine weitere Erkennung)', async () => {
  const log = [];
  const partials = [];
  const live = make(log, 0, partials);
  await feed(live, signal([['p', 0.3], ['s', 0.8], ['p', 0.15], ['s', 0.6], ['p', 0.6]]));
  await new Promise((r) => setImmediate(r));
  const before = log.length;
  const res = await live.finish();
  assert.equal(res.mode, 'live');
  assert.equal(res.text, 'w w');
  assert.equal(log.length, before, 'nach dem Loslassen keine weitere Erkennung');
  assert.ok(partials.length >= 1);
});

test('Sprache nach der letzten Pause: nur der Rest wird nacherkannt', async () => {
  const log = [];
  const live = make(log);
  const pcm = signal([['p', 0.3], ['s', 1.0], ['p', 0.5], ['s', 0.5], ['p', 0.1]]);
  await feed(live, pcm);
  const res = await live.finish();
  assert.equal(res.mode, 'tail');
  assert.equal(res.text, 'w w');
  const tailLen = log[log.length - 1];
  assert.ok(tailLen < pcm.length / 2, `Rest (${tailLen}) deutlich kürzer als die Sendung (${pcm.length})`);
});

test('Ohne Pause: ganze Sendung wird erkannt', async () => {
  const log = [];
  const live = make(log);
  const pcm = signal([['p', 0.2], ['s', 1.5], ['p', 0.1]]);
  await feed(live, pcm);
  const res = await live.finish();
  assert.equal(res.mode, 'full');
  assert.equal(res.text, 'w');
  assert.deepEqual(log, [pcm.length]);
});

test('Kurzes Geräusch vor dem Sprechen löst noch keine Erkennung aus', async () => {
  const log = [];
  const live = make(log);
  await feed(live, signal([['p', 0.2], ['s', 0.15], ['p', 0.6]]));
  assert.equal(log.length, 0);
  live.cancel();
});

test('Langsame Erkennung: laufender Durchlauf wird abgewartet, Zwischenpausen werden zusammengefasst', async () => {
  const log = [];
  const live = make(log, 400);
  // drei Abschnitte mit Pausen, Einspeisung in Echtzeit – die Erkennung (400 ms) hinkt hinterher
  await feed(live, signal([['p', 0.3], ['s', 0.7], ['p', 0.4], ['s', 0.7], ['p', 0.4], ['s', 0.7], ['p', 0.4]]), { realtime: true });
  const t0 = Date.now();
  const res = await live.finish();
  assert.equal(res.text, 'w w w');
  assert.ok(log.length <= 4, `höchstens 4 Durchläufe, waren ${log.length}`);
  assert.ok(Date.now() - t0 < 900, 'Ergebnis spätestens nach einem Durchlauf + Rest');
});

test('Abbrechen verhindert weitere Erkennungen', async () => {
  const log = [];
  const live = make(log, 50);
  live.cancel();
  await feed(live, signal([['p', 0.3], ['s', 0.8], ['p', 0.6]]));
  assert.equal(log.length, 0);
});
