// Sprachausgabe der Gegenstellen über die Systemstimmen (Web Speech API).

/** Text für die Sprachausgabe funkgerecht aufbereiten. */
export function toSpoken(text) {
  return String(text)
    .replace(/(\d+)\/(\d+)/g, '$1 $2')
    .replace(/\bca\.\s*/g, 'circa ')
    .replace(/(\d+)\s*cm\b/g, '$1 Zentimeter')
    .replace(/(\d+)\s*m\b/g, '$1 Meter')
    .replace(/\b2\b/g, 'zwo')
    .replace(/„|“/g, '');
}

const PROFILES = [
  { pitch: 1.0, rate: 1.05 },
  { pitch: 0.85, rate: 1.0 },
  { pitch: 1.15, rate: 1.1 },
  { pitch: 0.95, rate: 1.15 },
  { pitch: 0.75, rate: 0.98 },
  { pitch: 1.25, rate: 1.0 },
  { pitch: 0.9, rate: 1.2 },
  { pitch: 1.05, rate: 0.92 },
  { pitch: 0.8, rate: 1.1 },
];
const SPEAKERS = ['ztr', 'lst', 'sib', 'fgr', 'o1', 'o2', 'f1', 'f2', 'r1'];

export class Voice {
  constructor(audio) {
    this.audio = audio;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voices = [];
    this.preferred = '';
    this.rate = 1;
    this.volume = 0.8;
    this.current = null;
    this.ready = this.loadVoices();
  }

  loadVoices() {
    return new Promise((resolve) => {
      if (!this.synth) return resolve([]);
      const done = () => {
        const all = this.synth.getVoices();
        this.voices = all.filter((v) => /^de/i.test(v.lang));
        resolve(this.voices);
      };
      if (this.synth.getVoices().length) return done();
      this.synth.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }

  get available() {
    return !!this.synth && this.voices.length > 0;
  }

  profileFor(who) {
    const idx = Math.max(0, SPEAKERS.indexOf(who));
    const prof = PROFILES[idx % PROFILES.length];
    let voice = null;
    if (this.voices.length) {
      const pref = this.voices.find((v) => v.name === this.preferred);
      // Leitstelle bekommt nach Möglichkeit eine andere Stimme als der Zugtrupp
      const rotated = this.voices[idx % this.voices.length];
      voice = idx === 0 && pref ? pref : this.voices.length > 1 ? rotated : pref || this.voices[0];
    }
    return { voice, pitch: prof.pitch, rate: prof.rate * this.rate };
  }

  speakChunk(text, prof) {
    return new Promise((resolve) => {
      if (!this.available) {
        // Ohne Stimme: Lesezeit simulieren
        setTimeout(resolve, Math.max(800, text.length * 60));
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      if (prof.voice) u.voice = prof.voice;
      u.pitch = prof.pitch;
      u.rate = prof.rate;
      u.volume = this.volume;
      let finished = false;
      const fin = () => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        resolve();
      };
      u.onend = fin;
      u.onerror = fin;
      // Sicherheitsnetz, falls onend nicht feuert
      const guard = setTimeout(fin, 4000 + text.length * 120);
      this.current = u; // Referenz halten (GC-Bug in Chromium)
      this.synth.speak(u);
    });
  }

  /** Spricht einen Funkspruch. garble = mittleren Teil durch Störung ersetzen. */
  async speak(text, { who = 'ztr', garble = false } = {}) {
    await this.ready;
    const prof = this.profileFor(who);
    const spoken = toSpoken(text);
    if (this.synth) this.synth.cancel();
    if (garble) {
      const words = spoken.split(/\s+/);
      const a = Math.max(2, Math.floor(words.length * 0.3));
      const b = Math.max(a + 1, Math.min(words.length - 3, Math.floor(words.length * 0.7)));
      const lost = words.slice(a, b).join(' ');
      await this.speakChunk(words.slice(0, a).join(' '), prof);
      await this.audio.garble(Math.max(1200, lost.length * 65));
      await this.speakChunk(words.slice(b).join(' '), prof);
      return;
    }
    // In Sätze teilen (Chromium bricht lange Äußerungen sonst ab)
    const parts = spoken.match(/[^.!?]+[.!?]*/g) || [spoken];
    for (const p of parts) {
      if (p.trim()) await this.speakChunk(p.trim(), prof);
    }
  }

  cancel() {
    if (this.synth) this.synth.cancel();
  }
}
