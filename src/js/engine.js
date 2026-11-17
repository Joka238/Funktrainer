// Ablaufsteuerung einer Übung. Unabhängig von DOM/Audio – die Ein-/Ausgabe läuft über "io".
import { evaluate, PENALTY } from './evaluator.js';
import { STATUS_TEXT } from './scenarios.js';
import { spellOut } from './spelling.js';
import { runFree } from './free-engine.js';

class Aborted extends Error {}

function scoreOf(findings) {
  let s = 100;
  for (const f of findings) s -= PENALTY[f.level] || 0;
  return Math.max(0, s);
}

/**
 * io-Schnittstelle:
 *   transmit(who, text, { garble, chatter }) -> Promise   Gegenstelle spricht
 *   waitForTalkgroup(tg) -> Promise                      wartet, bis das Gerät auf der TG steht
 *   statusIn(code, text)                                 eingehender Status (z. B. "J")
 *   delay(ms) -> Promise
 *   emit(event, data)                                    UI-Ereignisse
 */
export class Engine {
  constructor(io, opts = {}) {
    this.io = io;
    this.opts = { answerTimeoutSec: 15, spellTable: 'din2022', ...opts };
    this.running = false;
    this.waiting = null;
    this.results = [];
  }

  // ---------------------------------------------------------------- Steuerung
  async start(scenario) {
    this.stop();
    this.scenario = scenario;
    this.results = [];
    this.running = true;
    this.token = {};
    const token = this.token;
    this.tg = scenario.tg;
    this.lastRx = null;
    this.lastUserEnding = null;
    this.inChatter = false;
    this.chatterViolation = false;
    this.rxActive = false;
    this.emit('start', { scenario });
    this.emit('briefing', { text: scenario.briefing, tg: scenario.tg });
    try {
      await this.run(token);
      if (token === this.token) {
        this.running = false;
        this.emit('finish', this.summary());
      }
    } catch (e) {
      if (!(e instanceof Aborted)) {
        this.running = false;
        this.emit('error', { message: e.message });
        throw e;
      }
    }
  }

  stop() {
    if (this.running) this.emit('stopped', {});
    this.running = false;
    this.token = null;
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w.reject(new Aborted());
    }
  }

  skip() {
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w.resolve({ skipped: true });
    }
  }

  emit(ev, data) {
    if (this.io.emit) this.io.emit(ev, data);
  }

  check(token) {
    if (token !== this.token) throw new Aborted();
  }

  summary() {
    const scored = this.results.filter((r) => typeof r.score === 'number');
    const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : 0;
    const errors = this.results.flatMap((r) => r.findings.filter((f) => f.level === 'error'));
    return { scenario: this.scenario, results: this.results, score: avg, errorCount: errors.length };
  }

  record(entry) {
    const e = { time: Date.now(), ...entry };
    if (e.score === undefined) e.score = scoreOf(e.findings || []);
    this.results.push(e);
    this.emit('result', { entry: e, summary: this.summary() });
    return e;
  }

  // ---------------------------------------------------------------- Eingaben
  /** Eigene Sendung (Transkript). tr = { text, durationSec, tg, issues: [findings] } */
  userTransmission(tr) {
    if (!this.running) return;
    if (this.waiting && (this.waiting.type === 'tx' || (this.waiting.type === 'action' && this.waiting.what === 'ptt'))) {
      const w = this.waiting;
      this.waiting = null;
      w.resolve(tr);
      return;
    }
    if (tr.tg !== this.tg) return; // niemand hört zu – kein Funkdisziplin-Fehler
    if (this.inChatter) {
      this.chatterViolation = true;
      this.record({
        label: 'Fremdverkehr gestört',
        text: tr.text,
        findings: [
          {
            level: 'error',
            text: 'Du wurdest nicht gerufen! Gespräche anderer Teilnehmer nicht stören – genau auf den eigenen Rufnamen achten.',
          },
        ],
      });
      return;
    }
    if (this.waiting && this.waiting.type === 'silence') {
      this.waiting.violated = true;
      this.record({
        label: '„Warten“ missachtet',
        text: tr.text,
        findings: [{ level: 'error', text: 'Nach „Warten“ nicht senden, bis die Gegenstelle dich ruft.' }],
      });
      return;
    }
    this.record({
      label: 'Unaufgeforderte Sendung',
      text: tr.text,
      findings: [{ level: 'warn', text: 'Gerade erwartet niemand eine Sendung von dir. Auftrag/Lage beachten.' }],
    });
  }

  /** Status über die Tastatur des Funkgeräts. */
  userStatus(n) {
    if (!this.running) return;
    if (this.waiting && this.waiting.type === 'status') {
      this.waiting.onStatus(n);
      return;
    }
    this.record({
      label: `Status ${n}`,
      findings: [{ level: 'warn', text: `Status ${n} (${STATUS_TEXT[n]}) gesendet, obwohl gerade kein Status gefordert war.` }],
    });
  }

  /** Tutorial: "Weiter" wurde gedrückt. */
  continue() {
    if (this.waiting && this.waiting.type === 'continue') {
      const w = this.waiting;
      this.waiting = null;
      w.resolve();
    }
  }

  /** Tutorial: Bedienhandlung am Funkgerät (power, tg, volume). */
  userAction(what) {
    const w = this.waiting;
    if (w && w.type === 'action' && w.what === what && this.io.actionDone(w.step)) {
      this.waiting = null;
      w.resolve({});
    }
  }

  /** PTT gedrückt, während eine Gegenstelle spricht. */
  pttWhileReceiving() {
    if (!this.running || this.rxPttWarned) return;
    this.rxPttWarned = true;
    this.record({
      label: 'Funkdisziplin',
      findings: [
        {
          level: 'warn',
          text: 'Sprechtaste gedrückt, während eine andere Stelle sendet. Erst das Ende der Sendung abwarten.',
        },
      ],
    });
  }

  // ---------------------------------------------------------------- Ablauf
  async run(token) {
    const steps = this.scenario.steps;
    for (let i = 0; i < steps.length; i++) {
      this.check(token);
      const step = steps[i];
      this.emit('step', { index: i, step, total: steps.length });
      switch (step.kind) {
        case 'section':
          this.tg = step.tg;
          this.emit('briefing', { text: step.briefing, tg: step.tg, title: step.title });
          break;
        case 'task':
          this.emit('task', { text: step.text });
          break;
        case 'explain':
          await this.doExplain(step, token);
          break;
        case 'action':
          await this.doAction(step, token);
          break;
        case 'setTg':
          this.tg = step.tg;
          this.emit('briefing', { text: step.briefing || '', tg: step.tg });
          break;
        case 'pause':
          await this.io.delay(step.seconds * 1000);
          break;
        case 'rx':
          if (step.skipIfUserEnded && this.lastUserEnding === 'ende') break;
          await this.doRx(step, token);
          break;
        case 'chatterEnd':
          this.inChatter = false;
          await this.io.delay(1500);
          if (!this.chatterViolation && !step.silent) {
            this.record({ label: step.label, findings: [{ level: 'ok', text: 'Nicht auf fremde Anrufe reagiert.' }] });
          }
          this.chatterViolation = false;
          break;
        case 'statusIn':
          this.io.statusIn(step.code, step.text);
          this.emit('log', { dir: 'status-in', text: `Status ${step.code} empfangen: ${step.text}` });
          break;
        case 'status':
          await this.doStatus(step, token);
          break;
        case 'silence':
          await this.doSilence(step, token);
          break;
        case 'free':
          await runFree(this, step, token);
          break;
        case 'tx': {
          const skip = await this.doTx(step, i, token);
          i += skip;
          break;
        }
        default:
          break;
      }
    }
  }

  async doExplain(step, token) {
    this.emit('coach', { ...step, needContinue: true });
    await new Promise((resolve, reject) => {
      this.waiting = { type: 'continue', resolve, reject };
    });
    this.check(token);
  }

  async doAction(step, token) {
    this.emit('coach', { ...step, needContinue: false });
    if (step.what !== 'ptt' && this.io.actionDone(step)) {
      this.emit('coach-ok', { text: step.done || 'Erledigt ✓' });
      return;
    }
    const res = await new Promise((resolve, reject) => {
      this.waiting = { type: 'action', what: step.what, step, resolve, reject };
    });
    this.check(token);
    if (res && res.skipped) return;
    if (step.what === 'ptt') {
      const issues = res.issues || [];
      const findings = [
        { level: 'ok', text: res.text ? `Sendung empfangen – verstanden wurde: „${res.text}“` : 'Sendung empfangen.' },
        ...issues,
      ];
      this.record({ label: step.label || 'Probesendung', text: res.text, findings, score: issues.length ? 80 : 100 });
      this.emit('coach-ok', {
        text: issues.length
          ? 'Gesendet – aber schau dir die Hinweise zur Sprechtechnik rechts an.'
          : step.done || 'Sauber gesendet ✓',
      });
    } else {
      this.emit('coach-ok', { text: step.done || 'Erledigt ✓' });
    }
    await this.io.delay(900);
  }

  async doRx(step, token, remember = true) {
    await this.io.waitForTalkgroup(this.tg);
    this.check(token);
    if (step.chatter) this.inChatter = true;
    else this.inChatter = false;
    const station = this.scenario.stations[step.who];
    this.rxActive = true;
    this.rxPttWarned = false;
    this.emit('log', { dir: 'in', who: step.who, name: station ? station.cs.full : step.who, text: step.text, garble: step.garble, chatter: step.chatter });
    try {
      await this.io.transmit(step.who, step.text, { garble: !!step.garble, chatter: !!step.chatter });
    } finally {
      this.rxActive = false;
    }
    this.check(token);
    if (!step.chatter && remember) this.lastRx = step;
  }

  async doStatus(step, token) {
    let done = false;
    while (!done) {
      const n = await new Promise((resolve, reject) => {
        this.waiting = { type: 'status', resolve, reject, onStatus: (v) => resolve(v) };
        this.emit('await', { type: 'status' });
      });
      this.waiting = null;
      this.check(token);
      if (n && n.skipped) {
        this.record({ label: `Status ${step.value}`, score: null, findings: [{ level: 'info', text: 'Übersprungen.' }] });
        return;
      }
      if (n === step.value) {
        this.record({
          label: `Status ${n}`,
          findings: [{ level: 'ok', text: `Status ${n} „${STATUS_TEXT[n]}“ korrekt gesetzt.` }],
        });
        done = true;
      } else {
        this.record({
          label: `Status ${n}`,
          findings: [
            {
              level: 'error',
              text: `Falscher Status: ${n} bedeutet „${STATUS_TEXT[n] ?? '?'}“. Gesucht ist der passende Status – versuche es erneut.`,
            },
          ],
        });
      }
    }
  }

  async doSilence(step, token) {
    const w = { type: 'silence', violated: false };
    const p = new Promise((resolve, reject) => {
      w.resolve = resolve;
      w.reject = reject;
    });
    this.waiting = w;
    this.emit('await', { type: 'silence' });
    const timer = this.io.delay(step.seconds * 1000).then(() => w.resolve());
    await Promise.race([p, timer]);
    if (this.waiting === w) this.waiting = null;
    this.check(token);
    if (!w.violated) this.record({ label: step.label, findings: [{ level: 'ok', text: 'Gewartet, bis die Gegenstelle ruft.' }] });
  }

  awaitTx(timeoutSec) {
    return new Promise((resolve, reject) => {
      const w = { type: 'tx', resolve, reject };
      this.waiting = w;
      this.emit('await', { type: 'tx' });
      if (timeoutSec) {
        this.io.delay(timeoutSec * 1000).then(() => {
          if (this.waiting === w) {
            this.waiting = null;
            resolve(null);
          }
        });
      }
    });
  }

  sampleFor(step) {
    if (step.sample) return step.sample;
    if (step.sampleSpell) return `Ich buchstabiere: ${spellOut(step.sampleSpell, this.opts.spellTable)}, kommen.`;
    return '';
  }

  /** Wartet auf eine Sendung und bewertet sie. Gibt zurück, wie viele Folgeschritte übersprungen werden. */
  async doTx(step, index, token) {
    const steps = this.scenario.steps;
    const sample = this.sampleFor(step);
    this.emit('expect', { label: step.label, sample });
    let failures = 0;
    let timeoutWarned = false;
    const isAnswer = step.expect.type === 'answer' || step.expect.type === 'funkprobe';

    for (;;) {
      const tr = await this.awaitTx(isAnswer && !timeoutWarned ? this.opts.answerTimeoutSec : 0);
      this.check(token);

      if (tr === null) {
        // Keine Antwort auf Anruf -> Gegenstelle ruft erneut
        timeoutWarned = true;
        this.record({
          label: step.label,
          score: null,
          findings: [{ level: 'warn', text: 'Keine Antwort – die Gegenstelle ruft erneut. Auf Anrufe zügig antworten.' }],
        });
        if (this.lastRx) await this.doRx(this.lastRx, token);
        continue;
      }
      if (tr.skipped) {
        this.record({ label: step.label, score: null, sample, findings: [{ level: 'info', text: 'Übersprungen.' }] });
        return 0;
      }


      if (tr.tg !== this.tg) {
        this.record({
          label: step.label,
          text: tr.text,
          sample,
          findings: [
            {
              level: 'error',
              text: `Falsche Gesprächsgruppe („${tr.tg}“) – die Gegenstelle hört dich nicht. Wechsle auf „${this.tg}“.`,
            },
          ],
        });
        this.emit('hint', { text: `Keine Antwort. Du sendest auf „${tr.tg}“, die Übung läuft auf „${this.tg}“.` });
        continue;
      }

      const res = evaluate(tr.text, step.expect, { durationSec: tr.durationSec, spellTable: this.opts.spellTable });

      if (res.intent === 'repeat' && step.expect.type !== 'repeat') {
        this.emit('log', { dir: 'note', text: 'Wiederholung angefordert.' });
        if (this.lastRx) {
          const rep = { ...this.lastRx, text: `Ich wiederhole: ${this.lastRx.text}`, garble: false };
          await this.doRx(rep, token, false);
        }
        continue;
      }

      let findings = [...res.findings, ...(tr.issues || [])];
      let skip = 0;

      // Anruf mit Nachricht verbunden?
      const n1 = steps[index + 1];
      const n2 = steps[index + 2];
      if (step.expect.type === 'call' && res.understood && n1 && n1.kind === 'rx' && n1.isHier && n2 && n2.kind === 'tx' && n2.expect.type === 'message') {
        const r2 = evaluate(tr.text, { ...n2.expect, content: (n2.expect.content || []).filter((c) => c.essential) }, {
          durationSec: tr.durationSec,
          spellTable: this.opts.spellTable,
        });
        if (r2.understood && (n2.expect.content || []).some((c) => c.essential)) {
          const full = evaluate(tr.text, n2.expect, { durationSec: tr.durationSec, spellTable: this.opts.spellTable });
          const contentFindings = full.findings.filter((f) => f.cat === 'content');
          findings = [
            ...findings,
            ...contentFindings.filter((f) => !findings.some((g) => g.text === f.text)),
            {
              level: 'info',
              text: 'Anruf und Nachricht in einer Sendung – geht bei guter Verbindung. In der Ausbildung: erst Verbindung herstellen, dann die Nachricht.',
            },
          ];
          skip = 2;
        }
      }

      const entry = this.record({
        label: step.label,
        text: tr.text,
        sample,
        findings,
        understood: res.understood,
      });

      // Tutorial: wiederholen, bis es ohne Fehler klappt
      if (step.strict && res.understood && failures < 2 && (entry.findings.some((f) => f.level === 'error') || entry.score < 70)) {
        failures++;
        const first = entry.findings.find((f) => f.level === 'error') || entry.findings.find((f) => f.level === 'warn');
        this.emit('coach-retry', {
          text: `Noch nicht ganz: ${first ? first.text : 'schau dir die Bewertung an.'} Versuch es gleich nochmal – die Gegenstelle wartet.`,
          sample: failures >= 2 ? sample : '',
        });
        continue;
      }
      if (step.strict) this.emit('coach-ok', { text: entry.score >= 90 ? 'Sehr gut! ✓' : 'Gut – die Hinweise rechts helfen beim nächsten Mal.' });

      const endIdx = [...res.tokens].reverse().find((t) => t.t === 'ende' || t.t === 'kommen');
      this.lastUserEnding = endIdx ? endIdx.t : null;

      if (!res.understood) {
        failures++;
        if (step.strict && failures < 3) {
          const first = entry.findings.find((f) => f.level === 'error');
          this.emit('coach-retry', {
            text: `${first ? first.text : 'Das wurde nicht verstanden.'} Versuch es nochmal.`,
            sample: failures >= 2 ? sample : '',
          });
        }
        if (failures >= 3) {
          this.emit('hint', { text: `Musterlösung: „${sample}“ – die Übung geht weiter.` });
          return skip;
        }
        if (step.expect.type === 'call') {
          // Ohne korrekten Anruf meldet sich niemand
          this.emit('hint', { text: 'Keine Antwort. Wurde die Gegenstelle richtig gerufen? Versuche es erneut.' });
        } else {
          const who = this.lastRx ? this.lastRx.who : 'ztr';
          await this.doRx({ kind: 'rx', who, text: 'Wiederholen, kommen.' }, token, false);
        }
        continue;
      }
      return skip;
    }
  }
}
