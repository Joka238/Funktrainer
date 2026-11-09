// Misst die Erkennungsqualität verschiedener Whisper-Varianten mit typischen Funksprüchen.
// Läuft auf macOS (Sprachausgabe "say" erzeugt die Testaufnahmen).
// Aufruf: node scripts/eval-stt.mjs [config-ids...]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as T from '@huggingface/transformers';
import { createAsr, buildPrompt } from '../src/js/asr-core.js';
import { tokenize, numberGroups, levenshtein } from '../src/js/normalize.js';

const SENTENCES = [
  'Heros Lindenberg 22/52 von Heros Lindenberg 22/10, kommen.',
  'Hier Heros Lindenberg 22/52, kommen.',
  'Florian Lindenberg von Heros Lindenberg 22/52, kommen.',
  'Verstanden, Einsatzstelle Mühlenweg 17, Ausleuchtung, kommen.',
  'An Einsatzstelle Bahnhofstraße 23 eingetroffen, kommen.',
  'Verstanden, Ende.',
  'Wiederholen, kommen.',
  'Heros Lindenberg 22/10 von Heros Lindenberg 22/52, Funkprobe, kommen.',
  'Hier Heros Lindenberg 22/52, verstehe Sie gut, kommen.',
  'Lagemeldung: Keller unter Wasser, Wasserstand circa 80 Zentimeter, keine Personen in Gefahr. Benötigen zwo weitere Tauchpumpen, kommen.',
  'Benötigen für Einsatzstelle Lindenweg 12 zweihundert Sandsäcke und einen Radlader, kommen.',
  'Ich buchstabiere: Quickborn, Unna, Aachen, Salzwedel, Tübingen, kommen.',
  'Ich buchstabiere: Quelle, Ulrich, Anton, Samuel, Theodor, kommen.',
  'Wieder einsatzbereit, kommen.',
  'Sind an Einsatzstelle, kein Ansprechpartner vor Ort, kommen.',
];

const CONFIGS = {
  'base-q8': { model: 'Xenova/whisper-base', dtype: 'q8', prompt: false },
  'base-q8-prompt': { model: 'Xenova/whisper-base', dtype: 'q8', prompt: true },
  'base-fp32enc-prompt': { model: 'Xenova/whisper-base', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, prompt: true },
  'small-q8-prompt': { model: 'Xenova/whisper-small', dtype: 'q8', prompt: true },
  'small-fp32enc-prompt': { model: 'Xenova/whisper-small', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, prompt: true },
  'small-fp32enc': { model: 'Xenova/whisper-small', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, prompt: false },
  'turbo-q8-prompt': { model: 'onnx-community/whisper-large-v3-turbo', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, prompt: true },
  'turbo-q4-prompt': { model: 'onnx-community/whisper-large-v3-turbo', dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' }, prompt: true },
};

function readWavF32(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  let fmt = null;
  while (off < b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(off + 8), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') {
      const data = b.subarray(off + 8, off + 8 + size);
      if (fmt.format === 3 && fmt.bits === 32) return new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length));
      const out = new Float32Array(data.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
      return out;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('kein data-Chunk');
}

function pickVoice() {
  const list = execFileSync('say', ['-v', '?']).toString();
  const de = list.split('\n').filter((l) => /\sde_DE\s/.test(l));
  const pref = de.find((l) => l.startsWith('Anna')) || de[0];
  if (!pref) throw new Error('Keine deutsche Stimme für "say" gefunden:\n' + list);
  return pref.split(/\s{2,}/)[0].trim();
}

function synth(dir) {
  const voice = pickVoice();
  console.log(`Stimme: ${voice}`);
  return SENTENCES.map((text, i) => {
    const spoken = text.replace(/(\d+)\/(\d+)/g, '$1 $2');
    const f = path.join(dir, `s${i}.wav`);
    execFileSync('say', ['-v', voice, '-o', f, '--file-format=WAVE', '--data-format=LEI16@16000', spoken]);
    return { text, audio: readWavF32(f) };
  });
}

function wer(ref, hyp) {
  const r = tokenize(ref).map((t) => t.num ?? t.t);
  const h = tokenize(hyp).map((t) => t.num ?? t.t);
  // Wortfolgen-Levenshtein
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] || levenshtein(r[i - 1], h[j - 1]) <= 1 ? 0 : 1));
  return d[r.length][h.length] / Math.max(1, r.length);
}

function keyOk(ref, hyp) {
  const g = (s) => numberGroups(tokenize(s)).map((x) => x.digits).join('|');
  const end = (s) => tokenize(s).slice(-1)[0]?.t;
  return g(ref) === g(hyp) && end(ref) === end(hyp);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stt-eval-'));
const samples = synth(dir);
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CONFIGS);
const prompt = buildPrompt(['Lindenberg', 'Mühlenweg', 'Bahnhofstraße', 'Lindenweg']);
const rows = [];

for (const id of wanted) {
  const c = CONFIGS[id];
  console.log(`\n=== ${id} ===`);
  let asr;
  const t0 = Date.now();
  try {
    asr = await createAsr(T, c.model, { dtype: c.dtype });
  } catch (e) {
    console.log(`  Laden fehlgeschlagen: ${e.message}`);
    rows.push({ id, error: e.message.slice(0, 80) });
    continue;
  }
  const load = (Date.now() - t0) / 1000;
  let sumWer = 0;
  let keys = 0;
  let time = 0;
  for (const s of samples) {
    const t = Date.now();
    const hyp = await asr.transcribe(s.audio, { prompt: c.prompt ? prompt : null });
    time += (Date.now() - t) / 1000;
    const w = wer(s.text, hyp);
    sumWer += w;
    if (keyOk(s.text, hyp)) keys++;
    console.log(`  ${(w * 100).toFixed(0).padStart(3)}% | ${hyp}`);
  }
  rows.push({
    id,
    wer: ((sumWer / samples.length) * 100).toFixed(1),
    keys: `${keys}/${samples.length}`,
    sec: (time / samples.length).toFixed(2),
    load: load.toFixed(0),
  });
}

const table = [
  '| Variante | Wortfehler | Rufnamen/Zahlen/Ende korrekt | Sek. pro Spruch | Ladezeit s |',
  '|---|---|---|---|---|',
  ...rows.map((r) => (r.error ? `| ${r.id} | Fehler: ${r.error} | | | |` : `| ${r.id} | ${r.wer}% | ${r.keys} | ${r.sec} | ${r.load} |`)),
].join('\n');
console.log('\n' + table);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Spracherkennung\n\n' + table + '\n');
