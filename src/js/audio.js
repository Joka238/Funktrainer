// Funkgeräte-Klänge: Sendeerlaubnis, Rauschen, Squelch, Statustöne, Störungen.
export class RadioAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.mode = 'digital'; // 'digital' (TETRA) | 'analog'
    this.hiss = null;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  tone(freq, dur, { at = 0, gain = 0.18, type = 'sine' } = {}) {
    const ctx = this.ensure();
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.setValueAtTime(gain, t + dur - 0.01);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
    return (at + dur) * 1000;
  }

  noise(dur, { at = 0, gain = 0.12, low = 300, high = 3400, chop = false } = {}) {
    const ctx = this.ensure();
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = low;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = high;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    if (chop) {
      // zerhackte Störung (Funkloch / Bitfehler)
      let x = t + 0.02;
      while (x < t + dur - 0.03) {
        const seg = 0.02 + Math.random() * 0.07;
        g.gain.setValueAtTime(Math.random() < 0.5 ? gain * 0.15 : gain * (0.6 + Math.random() * 0.6), x);
        x += seg;
      }
    }
    g.gain.setValueAtTime(gain, t + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(hp).connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    return (at + dur) * 1000;
  }

  wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Ton, wenn die Sprechtaste gedrückt wird. */
  async talkPermit() {
    if (this.mode === 'digital') {
      this.tone(880, 0.06, { gain: 0.12 });
      await this.wait(this.tone(1320, 0.08, { at: 0.08, gain: 0.12 }));
    } else {
      await this.wait(this.noise(0.05, { gain: 0.05 }));
    }
  }

  /** Kanal belegt (Sprechtaste während Empfang). */
  busy() {
    for (let i = 0; i < 3; i++) this.tone(420, 0.12, { at: i * 0.22, gain: 0.15, type: 'square' });
  }

  keyClick() {
    this.tone(2400, 0.015, { gain: 0.05, type: 'square' });
  }

  statusAck() {
    this.tone(1000, 0.08, { gain: 0.12 });
    this.tone(1000, 0.08, { at: 0.13, gain: 0.12 });
  }

  statusIn() {
    this.tone(1500, 0.1, { gain: 0.14 });
    this.tone(1100, 0.1, { at: 0.12, gain: 0.14 });
    this.tone(1500, 0.1, { at: 0.24, gain: 0.14 });
  }

  powerOn() {
    this.tone(660, 0.08, { gain: 0.1 });
    this.tone(990, 0.12, { at: 0.1, gain: 0.1 });
  }

  powerOff() {
    this.tone(990, 0.08, { gain: 0.1 });
    this.tone(660, 0.12, { at: 0.1, gain: 0.1 });
  }

  error() {
    this.tone(300, 0.25, { gain: 0.12, type: 'sawtooth' });
  }

  /** Beginn einer empfangenen Sendung. */
  async rxStart() {
    if (this.mode === 'analog') await this.wait(this.noise(0.14, { gain: 0.16 }));
    else await this.wait(this.tone(1800, 0.01, { gain: 0.03 }) + 120);
  }

  /** Ende einer empfangenen Sendung (Rauschfahne im Analogfunk). */
  async rxEnd() {
    if (this.mode === 'analog') await this.wait(this.noise(0.28, { gain: 0.2 }));
    else await this.wait(80);
  }

  /** Hintergrundrauschen während einer Sendung (nur analog). */
  startHiss() {
    if (this.mode !== 'analog' || this.hiss) return;
    const ctx = this.ensure();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    this.hiss = { src, g };
  }

  stopHiss() {
    if (!this.hiss) return;
    const { src, g } = this.hiss;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    src.stop(this.ctx.currentTime + 0.2);
    this.hiss = null;
  }

  /** Störung, die einen Teil der Nachricht überdeckt. */
  async garble(ms) {
    const sec = ms / 1000;
    if (this.mode === 'digital') {
      // TETRA: "blubbernde" Codec-Artefakte + Aussetzer
      const ctx = this.ensure();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(180, t);
      let x = t;
      while (x < t + sec) {
        o.frequency.setValueAtTime(120 + Math.random() * 380, x);
        g.gain.setValueAtTime(Math.random() < 0.35 ? 0 : 0.05, x);
        x += 0.03 + Math.random() * 0.05;
      }
      g.gain.setValueAtTime(0, t + sec);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;
      o.connect(lp).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + sec + 0.05);
      this.noise(sec, { gain: 0.05, chop: true });
    } else {
      this.noise(sec, { gain: 0.22, chop: true });
    }
    await this.wait(ms);
  }
}
