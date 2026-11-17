// Ablauf einer Aufgabe im freien Modus. Anders als die festen Übungen gibt es keine
// vorgegebene Schrittfolge: Die Gegenstelle reagiert auf das, was tatsächlich gesendet wird
// (falsche Stelle gerufen, Anruf und Nachricht in einer Sendung, fehlende Angaben → Rückfrage …).
import { evaluate, matchCallsign, isRepeatRequest } from './evaluator.js';
import { tokenize, containsAny } from './normalize.js';
import { identifyCalled } from './free.js';

const hit = (tokens, c) => !!containsAny(tokens, c.any);
const ENDE_OK = 'Die Gegenstelle hat das Gespräch begonnen und beendet es normalerweise auch. Ein „Verstanden, Ende“ ist hier aber vertretbar.';

function lastEnding(tokens) {
  const t = [...tokens].reverse().find((x) => x.t === 'ende' || x.t === 'kommen');
  return t ? t.t : null;
}

/** Führt einen Schritt { kind: 'free' } aus. E = Engine. */
export async function runFree(E, step, token) {
  const main = E.scenario.tg;
  E.emit('task', { text: step.task });
  try {
    if (step.dir === 'in') await incoming(E, step, token);
    else await outgoing(E, step, token);
  } finally {
    if (E.token === token) setTg(E, main);
  }
}

function setTg(E, tg) {
  if (E.tg === tg) return;
  E.tg = tg;
  E.emit('tg', { tg });
}

function say(E, token, who, text) {
  return E.doRx({ kind: 'rx', who, text }, token);
}

/**
 * Wartet auf die nächste eigene Sendung. Kümmert sich um Überspringen, falsche Gesprächsgruppe
 * und „Wiederholen“-Anforderungen. tg = null: jede Gesprächsgruppe (Anruf, Zuordnung erfolgt danach).
 */
async function nextTx(E, token, { label, sample, tg, sampleTg, timeoutSec = 0, onTimeout }) {
  E.emit('expect', { label, sample, tg: tg || sampleTg });
  let warned = false;
  for (;;) {
    const tr = await E.awaitTx(timeoutSec && !warned ? timeoutSec : 0);
    E.check(token);
    if (tr === null) {
      warned = true;
      if (onTimeout) await onTimeout();
      continue;
    }
    if (tr.skipped) return tr;
    if (tg && tr.tg !== tg) {
      E.record({
        label,
        text: tr.text,
        sample,
        findings: [{ level: 'error', text: `Falsche Gesprächsgruppe („${tr.tg}“) – deine Gegenstelle hört auf „${tg}“.` }],
      });
      E.emit('hint', { text: `Keine Antwort. Du sendest auf „${tr.tg}“, das Gespräch läuft auf „${tg}“.` });
      continue;
    }
    const tokens = tokenize(tr.text);
    if (tokens.length && isRepeatRequest(tokens) && E.lastRx && E.lastRx.who) {
      E.emit('log', { dir: 'note', text: 'Wiederholung angefordert.' });
      await E.doRx({ ...E.lastRx, text: `Ich wiederhole: ${E.lastRx.text}`, garble: false }, token, false);
      continue;
    }
    return { ...tr, tokens };
  }
}

function skipped(E, step) {
  E.record({ label: step.title, score: null, sample: step.message, findings: [{ level: 'info', text: 'Aufgabe übersprungen.' }] });
}

// ------------------------------------------------------------------ Du rufst
async function outgoing(E, step, token) {
  const { roster, ctx } = E.scenario;
  const own = ctx.own;
  const target = roster[step.target];
  const accepted = [step.target, ...(step.alt || [])];
  const evo = (tr) => ({ durationSec: tr.durationSec, spellTable: E.opts.spellTable });

  let phase = 'call';
  let partner = null;
  let wrong = false;
  let callFails = 0;
  let msgFails = 0;
  let asks = 0;
  let pending = step.content;
  let missing = [...step.content];
  let waited = false;

  const callSample = `${target.cs.full} von ${own.full}, kommen.`;
  const wrongReply = (st, withHier) => {
    const tgNote = target.tg !== st.tg ? ` auf Gesprächsgruppe ${target.tg}` : '';
    return `${withHier ? `Hier ${st.cs.full}. ` : ''}Dafür sind wir nicht zuständig. Wenden Sie sich an ${target.name}, ${target.cs.full}${tgNote}, kommen.`;
  };

  /** Inhalt einer Nachricht auswerten und passend reagieren. */
  const handleMessage = async (tr, { recordIt, label, sample }) => {
    const items = pending;
    if (recordIt) {
      const res = evaluate(tr.text, { type: 'message', own, content: items }, evo(tr));
      E.record({ label, text: tr.text, sample, findings: [...res.findings, ...(tr.issues || [])], understood: res.understood });
    }
    const anyHit = items.some((c) => hit(tr.tokens, c));
    missing = missing.filter((c) => !hit(tr.tokens, c));
    const st = roster[partner];
    if (!anyHit && msgFails < 2) {
      msgFails++;
      await say(E, token, partner, 'Wiederholen, kommen.');
      return;
    }
    if (!anyHit) E.emit('hint', { text: `Musterlösung: „${step.message}“` });
    const askable = missing.filter((c) => c.ask && ['error', 'warn'].includes(c.level));
    if (askable.length && asks < 2) {
      asks++;
      pending = [askable[0]];
      phase = 'ask';
      await say(E, token, partner, askable[0].ask);
      return;
    }
    await say(E, token, st.key, step.reply);
    phase = 'end';
  };

  for (;;) {
    E.check(token);
    if (phase === 'call') {
      const tr = await nextTx(E, token, { label: 'Anruf', sample: callSample, tg: null, sampleTg: target.tg });
      if (tr.skipped) return skipped(E, step);
      const called = identifyCalled(tr.tokens, roster, own);
      if (!called) {
        callFails++;
        E.record({
          label: 'Anruf',
          text: tr.text,
          sample: callSample,
          findings: [
            { level: 'error', text: 'Keine Gegenstelle aus dem Funkkreis erkannt. Rufe die zuständige Stelle mit ihrem vollständigen Rufnamen (siehe Funkteilnehmer).' },
            ...(tr.issues || []),
          ],
        });
        E.emit('hint', { text: callFails >= 3 ? `Musterlösung: „${callSample}“` : 'Keine Antwort. Wen willst du erreichen? Schau in die Übersicht der Funkteilnehmer.' });
        continue;
      }
      const st = roster[called.key];
      if (tr.tg !== st.tg) {
        E.record({
          label: 'Anruf',
          text: tr.text,
          sample: callSample,
          findings: [{ level: 'error', text: `${st.name} hört auf Gesprächsgruppe „${st.tg}“ – du sendest auf „${tr.tg}“.` }],
        });
        E.emit('hint', { text: `Keine Antwort. ${st.name} ist auf „${st.tg}“ erreichbar.` });
        continue;
      }
      const res = evaluate(tr.text, { type: 'call', own, target: st.cs }, evo(tr));
      const findings = [...res.findings, ...(tr.issues || [])];
      wrong = !accepted.includes(called.key);
      if (wrong) {
        findings.push({ level: 'error', text: `${st.name} ist für diese Aufgabe nicht zuständig – achte auf die Zuständigkeiten in der Übersicht.` });
      } else if (called.key !== step.target) {
        findings.push({ level: 'info', text: `Vertretbar. Am besten geeignet wäre ${target.name} (${target.cs.full}).${step.note ? ' ' + step.note : ''}` });
      }
      const ownOk = matchCallsign(tr.tokens, own).present;
      const essentials = step.content.filter((c) => c.essential);
      const combined = ownOk && essentials.some((c) => hit(tr.tokens, c));
      if (combined && !wrong) {
        const full = evaluate(tr.text, { type: 'message', own, content: step.content }, evo(tr));
        for (const f of full.findings.filter((x) => x.cat === 'content')) if (!findings.some((g) => g.text === f.text)) findings.push(f);
        findings.push({
          level: 'info',
          text: 'Anruf und Nachricht in einer Sendung – geht bei guter Verbindung. In der Ausbildung: erst Verbindung herstellen, dann die Nachricht.',
        });
      }
      E.record({ label: 'Anruf', text: tr.text, sample: callSample, findings, understood: res.understood });
      partner = called.key;
      setTg(E, st.tg);
      if (!ownOk) {
        await say(E, token, partner, `Hier ${st.cs.full}, wer ruft, kommen.`);
        phase = 'who';
        continue;
      }
      if (wrong) {
        if (combined) {
          await say(E, token, partner, wrongReply(st, true));
          phase = 'wrongEnd';
        } else {
          await say(E, token, partner, `Hier ${st.cs.full}, kommen.`);
          phase = 'wrong';
        }
        continue;
      }
      if (combined) {
        await handleMessage(tr, { recordIt: false });
        continue;
      }
      if (step.wait && !waited) {
        waited = true;
        await say(E, token, partner, `Hier ${st.cs.full}, warten.`);
        await E.doSilence({ seconds: step.wait, label: '„Warten“ eingehalten' }, token);
        await say(E, token, partner, `${own.full} von ${st.cs.full}, kommen.`);
        phase = 'msg';
        continue;
      }
      await say(E, token, partner, `Hier ${st.cs.full}, kommen.`);
      phase = 'msg';
      continue;
    }

    const st = roster[partner];

    if (phase === 'who') {
      const tr = await nextTx(E, token, { label: 'Eigenen Rufnamen nennen', sample: `Hier ${own.full}, kommen.`, tg: st.tg });
      if (tr.skipped) return skipped(E, step);
      const m = matchCallsign(tr.tokens, own);
      if (!m.present) {
        E.record({ label: 'Eigenen Rufnamen nennen', text: tr.text, findings: [{ level: 'error', text: `Die Gegenstelle weiß nicht, wer ruft. Eigenen Rufnamen nennen: „${own.full}“.` }] });
        callFails++;
        await say(E, token, partner, 'Wer ruft, kommen.');
        continue;
      }
      E.record({ label: 'Eigenen Rufnamen nennen', text: tr.text, findings: [{ level: 'ok', text: 'Rufname nachgereicht.' }], score: null });
      if (wrong) {
        await say(E, token, partner, wrongReply(st, false));
        phase = 'wrongEnd';
      } else if (step.content.some((c) => c.essential && hit(tr.tokens, c))) {
        await handleMessage(tr, { recordIt: true, label: 'Nachricht', sample: step.message });
      } else {
        await say(E, token, partner, 'Kommen.');
        phase = 'msg';
      }
      continue;
    }

    if (phase === 'wrong') {
      const tr = await nextTx(E, token, { label: 'Nachricht', sample: '', tg: st.tg });
      if (tr.skipped) return skipped(E, step);
      const res = evaluate(tr.text, { type: 'message', own, content: [] }, evo(tr));
      E.record({ label: 'Nachricht (an falsche Stelle)', text: tr.text, findings: [...res.findings, ...(tr.issues || [])] });
      await say(E, token, partner, wrongReply(st, false));
      phase = 'wrongEnd';
      continue;
    }

    if (phase === 'wrongEnd') {
      const tr = await nextTx(E, token, { label: 'Gespräch beenden', sample: 'Verstanden, Ende.', tg: st.tg });
      if (tr.skipped) return skipped(E, step);
      const res = evaluate(tr.text, { type: 'end', own }, evo(tr));
      E.record({ label: 'Gespräch beenden', text: tr.text, sample: 'Verstanden, Ende.', findings: [...res.findings, ...(tr.issues || [])] });
      setTg(E, E.scenario.tg);
      partner = null;
      wrong = false;
      phase = 'call';
      E.emit('hint', { text: `Jetzt die zuständige Stelle rufen: ${target.name}.` });
      continue;
    }

    if (phase === 'msg' || phase === 'ask') {
      const asked = phase === 'ask';
      const label = asked ? 'Rückfrage beantworten' : 'Nachricht';
      const tr = await nextTx(E, token, { label, sample: step.message, tg: st.tg });
      if (tr.skipped) return skipped(E, step);
      await handleMessage(tr, { recordIt: true, label, sample: step.message });
      continue;
    }

    if (phase === 'end') {
      const tr = await nextTx(E, token, { label: 'Quittieren und beenden', sample: step.ackSample, tg: st.tg });
      if (tr.skipped) return skipped(E, step);
      const res = evaluate(tr.text, { type: 'ack', own, ending: 'ende', verstandenLevel: step.ack && step.ack.length ? 'minor' : 'info', content: step.ack || [] }, evo(tr));
      const findings = [...res.findings, ...(tr.issues || [])];
      E.record({ label: 'Quittieren und beenden', text: tr.text, sample: step.ackSample, findings });
      if (lastEnding(tr.tokens) === 'kommen') await say(E, token, partner, 'Ende.');
      return;
    }
  }
}

// ------------------------------------------------------------------ Du wirst gerufen
async function incoming(E, step, token) {
  const { roster, ctx } = E.scenario;
  const own = ctx.own;
  const st = roster[step.target];
  const evo = (tr) => ({ durationSec: tr.durationSec, spellTable: E.opts.spellTable });
  setTg(E, st.tg);

  const callText = `${own.full} von ${st.cs.full}, kommen.`;
  await say(E, token, st.key, callText);

  // Anruf beantworten
  let fails = 0;
  for (;;) {
    const tr = await nextTx(E, token, {
      label: 'Anruf beantworten',
      sample: `Hier ${own.full}, kommen.`,
      tg: st.tg,
      timeoutSec: E.opts.answerTimeoutSec,
      onTimeout: async () => {
        E.record({ label: 'Anruf beantworten', score: null, findings: [{ level: 'warn', text: 'Keine Antwort – die Gegenstelle ruft erneut. Auf Anrufe zügig antworten.' }] });
        await say(E, token, st.key, callText);
      },
    });
    if (tr.skipped) return skipped(E, step);
    const res = evaluate(tr.text, { type: 'answer', own, target: st.cs }, evo(tr));
    E.record({ label: 'Anruf beantworten', text: tr.text, sample: `Hier ${own.full}, kommen.`, findings: [...res.findings, ...(tr.issues || [])] });
    if (res.understood || ++fails >= 3) break;
    await say(E, token, st.key, callText);
  }

  await say(E, token, st.key, step.opening);

  // Antwort / Quittung
  const type = step.inType || 'message';
  const label = type === 'ack' ? 'Auftrag quittieren' : 'Antworten';
  let ending = null;
  fails = 0;
  for (;;) {
    const tr = await nextTx(E, token, { label, sample: step.message, tg: st.tg });
    if (tr.skipped) return skipped(E, step);
    const res = evaluate(tr.text, { type, own, ending: 'kommen', endeOk: type === 'ack' ? ENDE_OK : undefined, content: step.content }, evo(tr));
    E.record({ label, text: tr.text, sample: step.message, findings: [...res.findings, ...(tr.issues || [])], understood: res.understood });
    ending = lastEnding(tr.tokens);
    if (!res.understood && ++fails < 3) {
      await say(E, token, st.key, 'Wiederholen, kommen.');
      continue;
    }
    break;
  }

  if (step.closingAck) {
    await say(E, token, st.key, step.closing);
    const tr = await nextTx(E, token, { label: 'Quittieren', sample: step.closingSample, tg: st.tg });
    if (tr.skipped) return;
    const res = evaluate(tr.text, { type: 'ack', own, ending: 'kommen', endeOk: ENDE_OK, content: step.closingAck }, evo(tr));
    E.record({ label: 'Quittieren', text: tr.text, sample: step.closingSample, findings: [...res.findings, ...(tr.issues || [])] });
    if (lastEnding(tr.tokens) !== 'ende') await say(E, token, st.key, 'Ende.');
    return;
  }
  if (ending === 'ende' && /^Ende\.?$/.test(step.closing)) return;
  await say(E, token, st.key, step.closing);
}
