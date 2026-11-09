// Web Worker: Offline-Spracherkennung mit Whisper (transformers.js / ONNX Runtime).
import { pipeline, env } from '../vendor/transformers.min.js';

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
let loadedModel = null;

// Typische Halluzinationen von Whisper bei Stille/Rauschen
const HALLUCINATIONS = [
  /untertitel/i,
  /amara\.org/i,
  /vielen dank für(s)? (zuschauen|ihre aufmerksamkeit)/i,
  /copyright/i,
  /swr|zdf|ard/i,
  /^\s*\[.*\]\s*$/,
  /^\s*\(.*\)\s*$/,
  /^\s*\*.*\*\s*$/,
];

async function load(model, device) {
  if (asr && loadedModel === model) {
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
  if (device === 'webgpu' && 'gpu' in navigator) {
    try {
      asr = await pipeline('automatic-speech-recognition', model, {
        device: 'webgpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
        progress_callback,
      });
      usedDevice = 'webgpu';
    } catch (e) {
      postMessage({ type: 'log', message: 'WebGPU nicht nutzbar, verwende CPU: ' + e.message });
      asr = null;
    }
  }
  if (!asr) {
    asr = await pipeline('automatic-speech-recognition', model, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback,
    });
  }
  loadedModel = model;
  postMessage({ type: 'ready', model, device: usedDevice, bundled });
}

async function transcribe(id, audio) {
  const out = await asr(audio, {
    language: 'german',
    task: 'transcribe',
    chunk_length_s: 30,
    return_timestamps: false,
  });
  let text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text || '').trim();
  if (HALLUCINATIONS.some((re) => re.test(text))) text = '';
  postMessage({ type: 'result', id, text });
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') await load(msg.model, msg.device);
    else if (msg.type === 'transcribe') await transcribe(msg.id, msg.audio);
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String(err && err.message ? err.message : err) });
  }
};
