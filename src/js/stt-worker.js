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
  ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
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
function dtypeFor(model, device) {
  if (device === 'webgpu') return { encoder_model: 'fp32', decoder_model_merged: 'q4' };
  if (/large|turbo/.test(model)) return { encoder_model: 'q8', decoder_model_merged: 'q8' };
  return { encoder_model: 'fp32', decoder_model_merged: 'q8' };
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
  if (device === 'webgpu' && 'gpu' in navigator) {
    try {
      asr = await createAsr(T, model, { device: 'webgpu', dtype: dtypeFor(model, 'webgpu'), progress_callback });
      usedDevice = 'webgpu';
    } catch (e) {
      postMessage({ type: 'log', message: 'WebGPU nicht nutzbar, verwende CPU: ' + e.message });
      asr = null;
    }
  }
  if (!asr) {
    asr = await createAsr(T, model, { device: 'wasm', dtype: dtypeFor(model, 'wasm'), progress_callback });
  }
  loadedKey = key;
  postMessage({ type: 'ready', model, device: usedDevice, bundled });
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
