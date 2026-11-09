// Wrapper um den Spracherkennungs-Worker.
export const MODELS = {
  'Xenova/whisper-small': 'Whisper Small – genau (empfohlen, in der App enthalten)',
  'onnx-community/whisper-large-v3-turbo': 'Whisper Large-v3-Turbo – beste Erkennung, langsamer (Download ~1 GB)',
  'Xenova/whisper-base': 'Whisper Base – schnell, aber ungenau (Download ~130 MB)',
};

export class Recognizer {
  constructor(onStatus) {
    this.onStatus = onStatus || (() => {});
    this.state = 'idle'; // idle | loading | ready | error | off
    this.pending = new Map();
    this.nextId = 1;
    this.files = new Map();
    this.worker = null;
  }

  createWorker() {
    this.worker = new Worker(new URL('./stt-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.handle(e.data);
    this.worker.onerror = (e) => {
      this.state = 'error';
      this.onStatus({ state: 'error', message: e.message || 'Worker konnte nicht gestartet werden.' });
    };
  }

  load(model, device = 'wasm') {
    if (!model || model === 'off') {
      this.state = 'off';
      this.onStatus({ state: 'off' });
      return;
    }
    if (!this.worker) this.createWorker();
    this.state = 'loading';
    this.files.clear();
    this.onStatus({ state: 'loading', progress: 0, model });
    this.worker.postMessage({ type: 'load', model, device });
  }

  handle(msg) {
    switch (msg.type) {
      case 'progress': {
        const p = msg.data;
        if (p.status === 'progress' && p.file) {
          this.files.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
          let loaded = 0;
          let total = 0;
          for (const f of this.files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          this.onStatus({ state: 'loading', progress: total ? loaded / total : 0, loaded, total, bundled: this.bundled });
        }
        break;
      }
      case 'source':
        this.bundled = msg.bundled;
        this.onStatus({ state: 'loading', progress: 0, bundled: msg.bundled });
        break;
      case 'ready':
        this.state = 'ready';
        this.onStatus({ state: 'ready', device: msg.device, model: msg.model, bundled: msg.bundled });
        break;
      case 'result': {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.resolve(msg.text);
        }
        break;
      }
      case 'error': {
        const p = msg.id && this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.reject(new Error(msg.message));
        } else {
          this.state = 'error';
          this.onStatus({ state: 'error', message: msg.message });
        }
        break;
      }
      case 'log':
        console.info('[STT]', msg.message);
        break;
      default:
        break;
    }
  }

  transcribe(samples, words = []) {
    if (this.state !== 'ready') return Promise.reject(new Error('Spracherkennung nicht bereit'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'transcribe', id, audio: samples, words }, [samples.buffer]);
    });
  }
}
