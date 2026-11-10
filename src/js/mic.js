// Mikrofonaufnahme während die Sprechtaste gedrückt ist + Analyse der Sprechtechnik.

const TARGET_RATE = 16000;

export class MicRecorder {
  /**
   * capture: 'mediarecorder' (Standard, robust – nimmt im Browser-Audioprozess auf)
   *          'scriptprocessor' (alt – lief im UI-Thread und konnte Tonstücke verlieren)
   */
  constructor(capture = 'mediarecorder') {
    this.capture = capture;
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
    // Pegelanzeige über einen Analyser (keine Audioverarbeitung im UI-Thread)
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    if (this.capture === 'scriptprocessor') {
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      proc.onaudioprocess = (e) => {
        if (this.recording) this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      src.connect(proc);
      proc.connect(mute).connect(this.ctx.destination);
      this.proc = proc;
    }
  }

  static async listDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  startLevel() {
    const buf = new Float32Array(this.analyser.fftSize);
    this.levelTimer = setInterval(() => {
      if (!this.onLevel) return;
      this.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      this.onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
    }, 60);
  }

  async start() {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.chunks = [];
    this.t0 = performance.now();
    this.recording = true;
    if (this.capture !== 'scriptprocessor') {
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
      this.recorder = new MediaRecorder(this.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 });
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) this.chunks.push(e.data);
      };
      this.recorder.start();
    }
    this.startLevel();
  }

  /** Beendet die Aufnahme. Liefert { samples (16 kHz), durationSec, issues, hasSpeech }. */
  async stop() {
    if (!this.recording) return null;
    // kurzer Nachlauf, damit das Ende der letzten Silbe nicht abgeschnitten wird
    await new Promise((r) => setTimeout(r, 120));
    this.recording = false;
    clearInterval(this.levelTimer);
    if (this.onLevel) this.onLevel(0);

    let pcm;
    let rate;
    if (this.capture === 'scriptprocessor') {
      const total = this.chunks.reduce((a, c) => a + c.length, 0);
      pcm = new Float32Array(total);
      let off = 0;
      for (const c of this.chunks) {
        pcm.set(c, off);
        off += c.length;
      }
      rate = this.ctx.sampleRate;
    } else {
      const rec = this.recorder;
      await new Promise((resolve) => {
        rec.onstop = resolve;
        rec.stop();
      });
      const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
      const buf = await blob.arrayBuffer();
      if (!buf.byteLength) return { samples: new Float32Array(0), durationSec: 0, hasSpeech: false, issues: [] };
      const audio = await this.ctx.decodeAudioData(buf);
      pcm = audio.getChannelData(0).slice();
      rate = audio.sampleRate;
    }
    const analysis = analyse(pcm, rate, { mode: this.mode || 'digital' });
    const samples = prepareForAsr(await resample(pcm, rate, TARGET_RATE));
    return { samples, durationSec: pcm.length / rate, rate, ...analysis };
  }

  close() {
    clearInterval(this.levelTimer);
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
