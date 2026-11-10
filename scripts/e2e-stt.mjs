// End-to-End-Test der Spracherkennung in der echten Electron-App (macOS, CI):
// 1) Aufnahme über ein "falsches Mikrofon" (Chromium spielt eine WAV-Datei ab) + Sprechtaste
// 2) Dieselbe Aufnahme direkt an die Erkennung (ohne Mikrofon)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stt-'));
const SENT = [
  'Hier Heros Lindenberg 22 52, kommen.',
  'Heros Lindenberg 22 10 von Heros Lindenberg 22 52, kommen.',
  'An Einsatzstelle Bahnhofstraße 23 eingetroffen, kommen.',
];
const voice = execFileSync('say', ['-v', '?']).toString().split('\n').find((l) => /\sde_DE\s/.test(l)).split(/\s{2,}/)[0];

const results = [];
let timing = null;
for (let i = 0; i < SENT.length; i++) {
  const wav = path.join(dir, `s${i}.wav`);
  // vorne/hinten Stille, damit Sprechtaste "rechtzeitig" gedrückt ist
  execFileSync('say', ['-v', voice, '-o', wav, '--file-format=WAVE', '--data-format=LEI16@48000', `[[slnc 800]] ${SENT[i]} [[slnc 800]]`]);
  const durMs = Math.round((fs.statSync(wav).size - 44) / 2 / 48000 * 1000);

  const app = await electron.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, root],
  });
  const w = await app.firstWindow();
  const logs = [];
  w.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  w.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await w.waitForTimeout(1500);
  await w.evaluate(() => {
    const d = document.querySelector('#dlg-welcome');
    if (d && d.open) d.close('skip');
  });
  // auf Spracherkennung warten
  let st = null;
  for (let k = 0; k < 300; k++) {
    st = await w.evaluate(() => ({ state: window.__funktrainer.recognizer.state, last: window.__funktrainer.recognizer.last }));
    if (st.state === 'ready' || st.state === 'error') break;
    await w.waitForTimeout(1000);
  }
  console.log(`\n### Satz ${i + 1}: "${SENT[i]}"  (Erkennung: ${JSON.stringify(st)})`);

  // 2) direkt an die Erkennung
  const direct = await w.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 16000, 16000);
    const buf = await ctx.decodeAudioData(bin.buffer);
    const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    const r = await off.startRendering();
    const t0 = performance.now();
    try {
      const text = await window.__funktrainer.recognizer.transcribe(r.getChannelData(0).slice(), []);
      return { text, sec: ((performance.now() - t0) / 1000).toFixed(1) };
    } catch (e) {
      return { error: String(e) };
    }
  }, fs.readFileSync(wav).toString('base64'));
  console.log(`  direkt:   ${JSON.stringify(direct)}`);

  // Zeitvergleich: zweite Erkennung (warm) mit automatischer Wahl vs. nur Prozessor
  const timeIt = () =>
    w.evaluate(async () => {
      const { recognizer } = window.__funktrainer;
      const audio = new Float32Array(16000 * 4);
      for (let k = 0; k < audio.length; k++) audio[k] = Math.sin(k / 8) * 0.1 * Math.sin(k / 4000);
      const t0 = performance.now();
      await recognizer.transcribe(audio, []);
      return { device: recognizer.device, sec: ((performance.now() - t0) / 1000).toFixed(2) };
    });
  if (i === 0) {
    const auto = await timeIt();
    await w.evaluate(() => window.__funktrainer.recognizer.load('Xenova/whisper-small', 'wasm'));
    for (let k = 0; k < 300; k++) {
      const s2 = await w.evaluate(() => window.__funktrainer.recognizer.state);
      if (s2 === 'ready') break;
      await w.waitForTimeout(1000);
    }
    const cpu = await timeIt();
    console.log(`  Zeit pro Sendung – automatisch: ${JSON.stringify(auto)}, nur Prozessor: ${JSON.stringify(cpu)}`);
    timing = { auto, cpu };
    await w.evaluate(() => window.__funktrainer.recognizer.load('Xenova/whisper-small', 'auto'));
    for (let k = 0; k < 300; k++) {
      const s2 = await w.evaluate(() => window.__funktrainer.recognizer.state);
      if (s2 === 'ready') break;
      await w.waitForTimeout(1000);
    }
  }

  // 1a) beide Aufnahmewege direkt vergleichen
  const methods = {};
  for (const method of ['scriptprocessor', 'mediarecorder']) {
    methods[method] = await w.evaluate(async ([method, ms]) => {
      const { MicRecorder, recognizer } = window.__funktrainer;
      const m = new MicRecorder(method);
      try {
        await m.start();
        await new Promise((r) => setTimeout(r, ms));
        const rec = await m.stop();
        m.close();
        let peak = 0;
        for (const v of rec.samples) peak = Math.max(peak, Math.abs(v));
        const stats = { dur: rec.durationSec.toFixed(2), rate: rec.rate, peak: peak.toFixed(3), hasSpeech: rec.hasSpeech };
        const text = rec.samples.length ? await recognizer.transcribe(rec.samples, []) : '';
        return { stats, text };
      } catch (e) {
        return { error: String(e) };
      }
    }, [method, durMs + 300]);
    console.log(`  ${method}: ${JSON.stringify(methods[method])}`);
  }

  // 1b) über Mikrofon + Sprechtaste (kompletter App-Weg)
  await w.evaluate(() => window.__funktrainer.mic.close());
  await w.evaluate(() => window.__funktrainer.radio.setPower(true));
  await w.waitForTimeout(2000);
  const before = await w.$$eval('.msg.out', (e) => e.length);
  const notesBefore = await w.$$eval('.msg.note', (e) => e.length);
  await w.evaluate(() => window.__funktrainer.radio.pttDown());
  await w.waitForTimeout(durMs + 400);
  await w.evaluate(() => window.__funktrainer.radio.pttUp());
  let mic = null;
  for (let k = 0; k < 120; k++) {
    const outs = await w.$$eval('.msg.out', (e) => e.map((x) => x.textContent));
    const notes = await w.$$eval('.msg.note', (e) => e.map((x) => x.textContent));
    const toast = await w.evaluate(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : null; });
    if (outs.length > before) { mic = outs[outs.length - 1]; break; }
    if (notes.length > notesBefore) { mic = 'HINWEIS: ' + notes[notes.length - 1]; break; }
    if (toast) { mic = 'TOAST: ' + toast; break; }
    await w.waitForTimeout(500);
  }
  console.log(`  mikrofon: ${mic}`);
  const errs = logs.filter((l) => /error|warn|STT/i.test(l)).slice(0, 8);
  if (errs.length) console.log('  console:\n    ' + errs.join('\n    '));
  results.push({ sentence: SENT[i], direct, mic, sp: methods.scriptprocessor.text ?? methods.scriptprocessor.error, mr: methods.mediarecorder.text ?? methods.mediarecorder.error });
  await app.close();
}
const md = [
  '| Satz | direkt | ScriptProcessor | MediaRecorder | App (PTT) |',
  '|---|---|---|---|---|',
  ...results.map((r) => `| ${r.sentence} | ${r.direct.text ?? r.direct.error} | ${r.sp} | ${r.mr} | ${r.mic} |`),
].join('\n');
console.log('\n' + md);
console.log('\nZeitmessung: ' + JSON.stringify(timing));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
