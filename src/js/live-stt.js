// Live-Spracherkennung während die Sprechtaste gedrückt ist.
//
// Whisper ist kein Streaming-Modell: Jede Erkennung verarbeitet einen ganzen Ausschnitt.
// Damit das Ergebnis trotzdem praktisch sofort nach dem Loslassen da ist, wird schon
// während des Sprechens erkannt:
//  - Eine einfache Sprachaktivitätserkennung (Pegel je 20 ms) findet Sprechpausen.
//  - Bei jeder Pause wird alles bisher Gesagte (vom Anfang an, also mit vollem Kontext)
//    im Hintergrund erkannt. Läuft schon eine Erkennung, wird nur die neueste Pause nachgeholt.
//  - Beim Loslassen: Kam nach der letzten erkannten Pause keine Sprache mehr, ist das
//    Ergebnis schon fertig. Sonst wird nur der kurze Rest nach der Pause erkannt und angehängt.
//  - Ohne jede Pause wird wie bisher die ganze Sendung erkannt.

const FRAME_SEC = 0.02;

export class LiveTranscriber {
  /**
   * @param {object} o
   * @param {number} o.rate             Abtastrate der gelieferten Tonstücke
   * @param {(pcm: Float32Array, rate: number) => Promise<Float32Array>} o.toAsr  Aufbereitung für die Erkennung (16 kHz)
   * @param {(samples: Float32Array) => Promise<string>} o.transcribe
   * @param {(text: string) => void} [o.onPartial]   Zwischenergebnis während des Sprechens
   */
  constructor({ rate, toAsr, transcribe, onPartial, pauseSec = 0.22, firstSpeechSec = 0.5 }) {
    this.rate = rate;
    this.toAsr = toAsr;
    this.transcribeFn = transcribe;
    this.onPartial = onPartial || (() => {});
    this.frame = Math.max(1, Math.round(rate * FRAME_SEC));
    this.pauseFrames = Math.round(pauseSec / FRAME_SEC);
    this.firstFrames = Math.round(firstSpeechSec / FRAME_SEC);
    this.tailFrames = 8; // 160 ms nach dem letzten lauten Stück mitnehmen (Ausklang der Silbe)

    this.buf = new Float32Array(rate * 4);
    this.len = 0;
    this.acc = 0;
    this.accN = 0;
    this.rms = [];
    this.floor = 0;
    this.lastActive = -1;
    this.activeSinceCut = 0;
    this.cut = 0; // Frame, bis zu dem zuletzt eine Erkennung angestoßen wurde
    this.job = null; // laufende Erkennung { cut, promise }
    this.done = null; // letzte fertige Erkennung { cut, text }
    this.wantCut = null; // angeforderte, noch nicht gestartete Erkennung
    this.finishing = false;
    this.cancelled = false;
    this.runs = 0;
  }

  /** Neues Tonstück (Float32, Abtastrate this.rate). */
  push(chunk) {
    if (this.cancelled) return;
    if (this.len + chunk.length > this.buf.length) {
      const nb = new Float32Array(Math.max(this.buf.length * 2, this.len + chunk.length));
      nb.set(this.buf.subarray(0, this.len));
      this.buf = nb;
    }
    this.buf.set(chunk, this.len);
    this.len += chunk.length;
    for (let i = 0; i < chunk.length; i++) {
      this.acc += chunk[i] * chunk[i];
      if (++this.accN === this.frame) {
        this.onFrame(Math.sqrt(this.acc / this.frame));
        this.acc = 0;
        this.accN = 0;
      }
    }
  }

  /** Gleiche Schwelle wie die Auswertung der Sprechtechnik (mic.js / analyse). */
  threshold() {
    return Math.max(0.012, this.floor * 4);
  }

  updateFloor() {
    const sorted = [...this.rms].sort((a, b) => a - b);
    this.floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
  }

  onFrame(r) {
    const i = this.rms.length;
    this.rms.push(r);
    if (i < 50 || i % 10 === 0) this.updateFloor();
    if (r > this.threshold()) {
      this.lastActive = i;
      this.activeSinceCut++;
    }
    const need = this.cut === 0 ? this.firstFrames : 8;
    if (!this.finishing && this.activeSinceCut >= need && i - this.lastActive >= this.pauseFrames) {
      const cut = Math.min(i + 1, this.lastActive + 1 + this.tailFrames);
      this.cut = cut;
      this.activeSinceCut = 0;
      this.wantCut = cut;
      this.pump();
    }
  }

  /** Startet die neueste angeforderte Erkennung, wenn gerade keine läuft. */
  pump() {
    if (this.job || this.wantCut === null || this.cancelled || this.finishing) return;
    const cut = this.wantCut;
    this.wantCut = null;
    const promise = this.run(0, cut)
      .then((text) => {
        if (!this.done || cut > this.done.cut) this.done = { cut, text };
        if (!this.cancelled && !this.finishing) this.onPartial(text);
      })
      .catch(() => {})
      .finally(() => {
        this.job = null;
        this.pump();
      });
    this.job = { cut, promise };
  }

  async run(fromFrame, toFrame) {
    this.runs++;
    const a = Math.min(this.len, fromFrame * this.frame);
    const b = toFrame === null ? this.len : Math.min(this.len, toFrame * this.frame);
    const pcm = this.buf.slice(a, b);
    const samples = await this.toAsr(pcm, this.rate);
    return this.transcribeFn(samples);
  }

  /**
   * Sprechtaste losgelassen: liefert das Endergebnis.
   * mode: 'live' (schon fertig), 'tail' (nur Rest erkannt), 'full' (ganze Sendung erkannt)
   */
  async finish() {
    this.finishing = true;
    this.wantCut = null;
    if (this.job) await this.job.promise;
    const base = this.done;
    if (!base) return { text: await this.run(0, null), mode: 'full' };
    // Kam nach der erkannten Stelle noch Sprache? (Schwelle über die ganze Aufnahme)
    this.updateFloor();
    const thr = this.threshold();
    let active = 0;
    for (let i = base.cut; i < this.rms.length; i++) if (this.rms[i] > thr) active++;
    if (active < 5) return { text: base.text, mode: 'live' };
    const tail = await this.run(base.cut, null);
    return { text: `${base.text} ${tail}`.replace(/\s+/g, ' ').trim(), mode: 'tail' };
  }

  cancel() {
    this.cancelled = true;
    this.wantCut = null;
  }
}
