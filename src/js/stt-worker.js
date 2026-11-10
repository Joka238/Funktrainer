// Web Worker: Offline-Spracherkennung mit Whisper (transformers.js / ONNX Runtime).
import * as T from '../vendor/transformers.min.js';
import { createAsr, buildPrompt } from './asr-core.js';

const { env } = T;
// Mitgeliefertes Modell (src/models) bevorzugen, sonst einmalig aus dem Internet laden
env.allowLocalModels = true;
env.localModelPath = new URL('../models/', import.meta.url).href;
env.useBrowserCache = true;
const VENDOR = new URL('../vendor/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = {
  mjs: VENDOR + 'ort-wasm-simd-threaded.asyncify.mjs',
  wasm: VENDOR + 'ort-wasm-simd-threaded.asyncify.wasm',
};
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated
  ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))
  : 1;

let asr = null;
let loadedKey = null;

// Typische Halluzinationen von Whisper bei Stille/Rauschen
const HALLUCINATIONS = [
  /untertitel/i,
  /amara\.org/i,
  /vielen dank für(s)? (zuschauen|ihre aufmerksamkeit)/i,
  /copyright/i,
  /\b(swr|zdf|ard)\b/i,
  /^\s*\[.*\]\s*$/,
  /^\s*\(.*\)\s*$/,
  /^\s*\*.*\*\s*$/,
];

/** dtype je Modell: Encoder unkomprimiert (wichtig für die Genauigkeit), Decoder komprimiert. */
function dtypeFor(model, gpuEncoder = false) {
  if (/large|turbo/.test(model)) {
    // Turbo: auf der GPU Encoder in fp16 (halber Speicher), sonst q8
    return { encoder_model: gpuEncoder ? 'fp16' : 'q8', decoder_model_merged: 'q8' };
  }
  return { encoder_model: 'fp32', decoder_model_merged: 'q8' };
}

async function gpuAvailable() {
  try {
    return !!('gpu' in navigator && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

/** Probelauf mit Stille: lädt/kompiliert alles vor, damit die erste echte Sendung schnell ist. */
async function warmUp(a) {
  const t0 = performance.now();
  await a.transcribe(new Float32Array(16000), {});
  return performance.now() - t0;
}

async function load(model, device) {
  const key = `${model}|${device}`;
  if (asr && loadedKey === key) {
    postMessage({ type: 'ready', model, device: 'cached' });
    return;
  }
  let bundled = false;
  try {
    const r = await fetch(`${env.localModelPath}${model}/config.json`, { method: 'HEAD' });
    bundled = r.ok;
  } catch {
    bundled = false;
  }
  postMessage({ type: 'source', bundled });
  const progress_callback = (p) => postMessage({ type: 'progress', data: p });
  let usedDevice = 'wasm';
  asr = null;
  let warm = 0;
  // Automatisch: rechenintensiven Encoder auf dem Grafikchip, Decoder (q8) auf der CPU –
  // gleiche Genauigkeit, deutlich schneller.
  if ((device === 'auto' || device === 'webgpu') && (await gpuAvailable())) {
    try {
      asr = await createAsr(T, model, {
        device: { encoder_model: 'webgpu', decoder_model_merged: 'wasm' },
        dtype: dtypeFor(model, true),
        progress_callback,
      });
      warm = await warmUp(asr);
      usedDevice = 'gpu+cpu';
    } catch (e) {
      postMessage({ type: 'log', message: 'Grafikchip nicht nutzbar, verwende CPU: ' + e.message });
      asr = null;
    }
  }
  if (!asr) {
    asr = await createAsr(T, model, { device: 'wasm', dtype: dtypeFor(model, false), progress_callback });
    warm = await warmUp(asr);
  }
  loadedKey = key;
  postMessage({ type: 'ready', model, device: usedDevice, bundled, warmMs: Math.round(warm) });
}

/** Notbremse gegen Whisper-Wiederholungsschleifen ("Lindenberg, Lindenberg, ..."). */
function collapseRepeats(text) {
  const words = text.split(/\s+/);
  const out = [];
  let run = 0;
  for (const w of words) {
    const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const prev = out.length ? out[out.length - 1].toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : null;
    run = k && k === prev ? run + 1 : 0;
    if (run < 2) out.push(w);
  }
  return out.join(' ');
}

async function transcribe(id, audio, words) {
  // Wortschatz-Prompt nur für große Modelle – kleine Modelle geraten dadurch in Wiederholungsschleifen (gemessen)
  const usePrompt = /large|turbo/.test(loadedKey || '');
  let text = await asr.transcribe(audio, { prompt: usePrompt ? buildPrompt(words || []) : null });
  text = collapseRepeats(text);
  if (HALLUCINATIONS.some((re) => re.test(text))) text = '';
  postMessage({ type: 'result', id, text });
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') await load(msg.model, msg.device);
    else if (msg.type === 'transcribe') await transcribe(msg.id, msg.audio, msg.words);
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String(err && err.message ? err.message : err) });
  }
};
