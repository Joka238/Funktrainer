// Mikrofonaufnahme während die Sprechtaste gedrückt ist + Analyse der Sprechtechnik.

const TARGET_RATE = 16000;

export class MicRecorder {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.recording = false;
    this.chunks = [];
    this.onLevel = null;
    this.deviceId = '';
  }

  async init(deviceId = this.deviceId) {
    if (this.stream && deviceId === this.deviceId) return;
    this.close();
    this.deviceId = deviceId;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        // Browser-Rauschunterdrückung verschluckt Silben – Whisper kommt mit Rauschen besser zurecht
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor: einfach und überall verfügbar
    const proc = this.ctx.createScriptProcessor(2048, 1, 1);
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    proc.onaudioprocess = (e) => {
      if (!this.recording) return;
      const data = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
      if (this.onLevel) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        this.onLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
      }
    };
    src.connect(proc);
    proc.connect(mute).connect(this.ctx.destination);
    this.proc = proc;
  }

  static async listDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  async start() {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.chunks = [];
    this.t0 = performance.now();
    this.recording = true;
  }

  /** Beendet die Aufnahme. Liefert { samples (16 kHz), durationSec, issues, hasSpeech }. */
  async stop() {
    if (!this.recording) return null;
    // kurzer Nachlauf, damit das letzte Puffer-Stück noch ankommt
    await new Promise((r) => setTimeout(r, 60));
    this.recording = false;
    if (this.onLevel) this.onLevel(0);
    const total = this.chunks.reduce((a, c) => a + c.length, 0);
    const pcm = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) {
      pcm.set(c, off);
      off += c.length;
    }
    const rate = this.ctx.sampleRate;
    const analysis = analyse(pcm, rate, { mode: this.mode || "digital" });
    const samples = prepareForAsr(await resample(pcm, rate, TARGET_RATE));
    return { samples, durationSec: pcm.length / rate, ...analysis };
  }

  close() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.stream = null;
    this.ctx = null;
  }
}

/** Pegel angleichen und kurze Stille vorn/hinten anfügen (verbessert die Erkennung). */
export function prepareForAsr(x) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const gain = peak > 0.001 && peak < 0.5 ? Math.min(8, 0.7 / peak) : 1;
  const pad = Math.round(TARGET_RATE * 0.3);
  const out = new Float32Array(x.length + 2 * pad);
  for (let i = 0; i < x.length; i++) out[pad + i] = Math.max(-1, Math.min(1, x[i] * gain));
  return out;
}

async function resample(pcm, from, to) {
  if (!pcm.length) return new Float32Array(0);
  if (from === to) return pcm;
  const len = Math.ceil((pcm.length * to) / from);
  const off = new OfflineAudioContext(1, len, to);
  const buf = off.createBuffer(1, pcm.length, from);
  buf.copyToChannel(pcm, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0).slice();
}

/** Prüft Sprechtechnik: zu früh gesprochen, Taste zu früh losgelassen, Pegel. */
export function analyse(pcm, rate, { mode = 'digital' } = {}) {
  const frame = Math.round(rate * 0.02);
  const rms = [];
  let peak = 0;
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let s = 0;
    for (let k = i; k < i + frame; k++) {
      const v = pcm[k];
      s += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    rms.push(Math.sqrt(s / frame));
  }
  if (!rms.length) return { hasSpeech: false, issues: [] };
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
  const thr = Math.max(0.012, floor * 4);
  const active = rms.map((v) => v > thr);
  const activeCount = active.filter(Boolean).length;
  const hasSpeech = activeCount >= 8; // mind. ~160 ms Sprache
  const issues = [];
  if (!hasSpeech) return { hasSpeech, issues, peak };

  const first = active.indexOf(true) * 0.02;
  const last = (active.lastIndexOf(true) + 1) * 0.02;
  const dur = rms.length * 0.02;
  if (first < 0.18) {
    issues.push({
      level: 'minor',
      text:
        mode === 'digital'
          ? 'Zu früh gesprochen: Nach dem Drücken der Sprechtaste den Sendeerlaubnis-Ton abwarten, sonst fehlt der Anfang.'
          : 'Zu früh gesprochen: Nach dem Drücken der Sprechtaste kurz warten, sonst fehlt der Anfang.',
    });
  }
  if (dur - last < 0.12) {
    issues.push({
      level: 'minor',
      text: 'Sprechtaste zu früh losgelassen: Erst nach dem letzten Wort loslassen, sonst wird das Ende abgeschnitten.',
    });
  }
  if (peak > 0.98) {
    issues.push({ level: 'info', text: 'Übersteuert – etwas mehr Abstand zum Mikrofon halten.' });
  }
  return { hasSpeech, issues, peak };
}
