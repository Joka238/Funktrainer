// Hauptsteuerung der Oberfläche: verbindet Funkgerät, Audio, Spracherkennung und Übungsablauf.
import { RadioAudio } from './audio.js';
import { Voice } from './voice.js';
import { MicRecorder } from './mic.js';
import { Recognizer, MODELS } from './stt.js';
import { Radio } from './radio.js';
import { Engine } from './engine.js';
import { SCENARIOS, TALKGROUPS, STATUS_TEXT, STATUS_SCENARIOS, buildScenario, buildShift, withoutStatus } from './scenarios.js';
import { addTraffic } from './traffic.js';
import { loadSettings, saveSettings, loadHistory, addHistory, clearHistory } from './storage.js';
import { DIN_2022, DIN_TRAD } from './spelling.js';
import { LESSONS, buildLesson } from './tutorial.js';

const KEY_TUT = 'funktrainer.tutorial.v1';
function loadTutorialDone() {
  try {
    return JSON.parse(localStorage.getItem(KEY_TUT) || '[]');
  } catch {
    return [];
  }
}
function markTutorialDone(id) {
  const d = new Set(loadTutorialDone());
  d.add(id);
  try {
    localStorage.setItem(KEY_TUT, JSON.stringify([...d]));
  } catch {
    /* ignorieren */
  }
}

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ Setup
const settings = loadSettings();
const audio = new RadioAudio();
audio.mode = settings.mode;
const voice = new Voice(audio);
voice.preferred = settings.voice;
voice.rate = settings.rate;
const mic = new MicRecorder();
mic.mode = settings.mode;
mic.deviceId = settings.mic;
const radio = new Radio($('#radio-root'), audio, TALKGROUPS);
radio.setMode(settings.mode);
radio.volume = settings.volume;
audio.setVolume(settings.volume);
voice.volume = settings.volume;
radio.render();

let scenario = null;
let currentId = null;
let currentSample = '';
let sttBusy = false;

const recognizer = new Recognizer(renderSttStatus);

// ------------------------------------------------------------------ Engine-IO
const io = {
  delay,
  async waitForTalkgroup(tg) {
    const t0 = Date.now();
    let hinted = false;
    while (!(radio.usable && radio.tg === tg)) {
      if (!engine.running) return;
      if (!hinted && Date.now() - t0 > 4000) {
        hinted = true;
        showHint(
          radio.power
            ? `Du hörst nichts? Die Übung läuft auf Gesprächsgruppe „${tg}“ – stelle sie am Funkgerät ein (Drehknopf oder ◀ ▶).`
            : `Du hörst nichts? Schalte das Funkgerät mit ⏻ ein und wähle die Gesprächsgruppe „${tg}“.`
        );
      }
      await delay(250);
    }
    if (hinted) hideHint();
  },
  async transmit(who, text, opts) {
    while (radio.tx) await delay(150);
    const st = scenario && scenario.stations[who];
    radio.setRx(st ? st.cs.full : 'Unbekannt');
    try {
      await audio.rxStart();
      audio.startHiss();
      await voice.speak(text, { who, garble: opts.garble });
    } finally {
      audio.stopHiss();
      await audio.rxEnd();
      radio.setRx(null);
    }
  },
  statusIn(code, text) {
    radio.statusIncoming(code, text);
  },
  actionDone(step) {
    if (step.what === 'power') return radio.usable;
    if (step.what === 'tg') return radio.usable && radio.tg === step.value;
    if (step.what === 'volume') return volumeTouched;
    return false;
  },
  emit(ev, data) {
    const h = handlers[ev];
    if (h) h(data);
  },
};

const engine = new Engine(io, { answerTimeoutSec: settings.answerTimeout, spellTable: settings.spellTable });

const handlers = {
  start({ scenario: sc }) {
    $('#cur-title').textContent = sc.title;
    $('#cur-progress').style.width = '0%';
    $('#session-score').textContent = '–';
    $('#lage-empty').hidden = true;
    $('#lage').hidden = false;
    $('#own-callsign').textContent = sc.ctx.own.full;
    $('#own-unit').textContent = sc.ctx.unit;
    $('#stations').innerHTML = Object.values(sc.stations)
      .map((s) => `<li>${esc(s.name)}</li>`)
      .join('');
    $('#task').hidden = true;
    $('#eval').hidden = true;
    $('#eval-empty').hidden = false;
    $('#log').innerHTML = '';
    hideHint();
    $('#coach').hidden = !sc.tutorial;
    radio.highlight(null);
    setRunning(true);
    addLog('note', `Übung „${sc.title}“ gestartet.`);
  },
  briefing({ text, tg, title }) {
    $('#briefing').textContent = text;
    scenario.tg = tg;
    updateTgReq();
    if (title) addLog('note', `— ${title} —`);
  },
  step({ index, total }) {
    $('#cur-progress').style.width = `${Math.round((index / total) * 100)}%`;
  },
  task({ text }) {
    const t = $('#task');
    t.hidden = false;
    t.textContent = text;
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
  },
  expect({ sample }) {
    currentSample = sample;
    hideHint();
  },
  await() {},
  log(d) {
    if (d.dir === 'in') addLog('in', d.text, { who: d.name, chatter: d.chatter, garble: d.garble });
    else addLog(d.dir, d.text);
  },
  result({ entry, summary }) {
    showEval(entry);
    $('#session-score').textContent = summary.score;
  },
  hint({ text }) {
    showHint(text);
  },
  coach(d) {
    if (d.what === 'volume') volumeTouched = false;
    $('#coach').hidden = false;
    $('#coach-title').textContent = d.title || '';
    $('#coach-text').textContent = d.text || '';
    const exEl = $('#coach-example');
    exEl.hidden = !d.example;
    exEl.textContent = d.example || '';
    $('#coach-feedback').hidden = true;
    $('#coach-next').hidden = !d.needContinue;
    $('#coach-todo').hidden = !!d.needContinue;
    radio.highlight(d.highlight || null);
  },
  'coach-ok'({ text }) {
    coachFeedback(text, false);
    radio.highlight(null);
  },
  'coach-retry'({ text, sample }) {
    coachFeedback(sample ? `${text}\nMusterlösung: „${sample}“` : text, true);
  },
  finish(summary) {
    $('#cur-progress').style.width = '100%';
    setRunning(false);
    $('#task').hidden = true;
    const issues = summary.results.flatMap((r) => r.findings.filter((f) => ['error', 'warn'].includes(f.level)).map((f) => f.text));
    addHistory({
      date: Date.now(),
      id: summary.scenario.id,
      title: summary.scenario.title,
      score: summary.score,
      issues: issues.slice(0, 30),
    });
    if (summary.scenario.tutorial) markTutorialDone(summary.scenario.id);
    radio.highlight(null);
    renderScenarioList();
    showFinish(summary);
  },
  stopped() {
    setRunning(false);
    radio.highlight(null);
    $('#coach').hidden = true;
  },
  error({ message }) {
    toast(`Fehler im Übungsablauf: ${message}`);
  },
};

// ------------------------------------------------------------------ Funkgerät-Ereignisse
let volumeTouched = false;
radio.on('volume', (v) => {
  volumeTouched = true;
  engine.userAction('volume');
  audio.setVolume(v);
  voice.volume = v;
  settings.volume = v;
  saveSettings(settings);
});
radio.on('tg', () => {
  updateTgReq();
  engine.userAction('tg');
});
radio.on('power', () => {
  updateTgReq();
  engine.userAction('power');
});
radio.on('status', (n) => {
  addLog('out', `Status ${n} – ${STATUS_TEXT[n]}`, { status: true });
  engine.userStatus(n);
});
radio.on('ptt-busy', () => engine.pttWhileReceiving());
radio.on('help', () => openRules());
radio.on('emergency', () => {
  addLog('note', 'Notruftaste betätigt!');
  if (engine.running) {
    engine.record({
      label: 'Notruftaste',
      findings: [{ level: 'warn', text: 'Die Notruftaste nur bei akuter Gefahr für die eigenen Einsatzkräfte betätigen.' }],
    });
  }
});

let pttSession = 0;
radio.on('ptt-down', async () => {
  const id = ++pttSession;
  audio.talkPermit();
  try {
    mic.onLevel = (v) => radio.setLevel(v);
    await mic.start();
    if (!radio.tx || id !== pttSession) await mic.stop();
  } catch (e) {
    toast(`Mikrofon nicht verfügbar (${e.message}). Bitte Mikrofonzugriff erlauben oder die Texteingabe nutzen.`);
  }
});

radio.on('ptt-up', async () => {
  let rec;
  try {
    rec = await mic.stop();
  } catch {
    rec = null;
  }
  if (!rec) return;
  if (!rec.hasSpeech) {
    addLog('note', 'Sendung ohne erkennbare Sprache (zu leise oder Sprechtaste zu kurz gedrückt).');
    if (engine.running && engine.waiting && engine.waiting.type === 'action') {
      coachFeedback('Da kam nichts an. Ist das Mikrofon erlaubt und richtig gewählt (Einstellungen)? Halte die Taste gedrückt, solange du sprichst.', true);
    }
    return;
  }
  const probe = engine.running && engine.waiting && engine.waiting.type === 'action' && engine.waiting.what === 'ptt';
  if (probe && recognizer.state !== 'ready') {
    submitTransmission('', rec.durationSec, rec.issues);
    return;
  }
  if (recognizer.state !== 'ready') {
    toast(
      recognizer.state === 'loading'
        ? 'Die Spracherkennung lädt noch – bitte kurz warten oder die Texteingabe nutzen.'
        : 'Spracherkennung nicht verfügbar – bitte die Texteingabe unter dem Funkgerät nutzen.'
    );
    return;
  }
  sttBusy = true;
  renderSttStatus();
  let text = '';
  try {
    text = await recognizer.transcribe(rec.samples, vocabulary());
  } catch (e) {
    toast(`Spracherkennung fehlgeschlagen: ${e.message}`);
    sttBusy = false;
    renderSttStatus();
    return;
  }
  sttBusy = false;
  renderSttStatus();
  submitTransmission(text, rec.durationSec, rec.issues);
});

/** Wortschatz der laufenden Übung (Orte, Straßen, Rufnamen) für die Spracherkennung. */
function vocabulary() {
  if (!scenario) return [];
  const c = scenario.ctx;
  const words = [c.ort, c.street, c.own && c.own.full, c.ztr && c.ztr.full, c.lst && c.lst.full];
  const brief = `${scenario.briefing || ''} ${$('#task').textContent || ''}`;
  for (const m of brief.matchAll(/„([^“]+)“/g)) words.push(m[1]);
  return words;
}

function submitTransmission(text, durationSec, issues = []) {
  addLog('out', text || '(nicht verständlich)', { tg: radio.tg });
  if (!engine.running) {
    addLog('note', 'Keine Übung aktiv – wähle links eine Übung, um bewertet zu werden.');
    return;
  }
  engine.userTransmission({ text, durationSec, tg: radio.tg, issues });
}

// Texteingabe als Alternative zum Sprechen
$('#type-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#type-input');
  const text = input.value.trim();
  if (!text) return;
  if (!radio.usable) {
    toast('Das Funkgerät ist ausgeschaltet. Mit ⏻ einschalten.');
    return;
  }
  if (radio.rx) {
    radio.pttDown();
    radio.pttUp();
    return;
  }
  input.value = '';
  radio.tx = true;
  radio.render();
  await audio.talkPermit();
  await delay(350);
  radio.tx = false;
  radio.render();
  const words = text.split(/\s+/).length;
  submitTransmission(text, words * 0.45, []);
});

// Tastatur: Leertaste = PTT, Ziffern = Status
function typingTarget(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
window.addEventListener('keydown', (e) => {
  if (typingTarget(e) || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!e.repeat) radio.pttDown();
  } else if (/^\d$/.test(e.key)) {
    radio.keypress(e.key);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (engine.waiting && engine.waiting.type === 'continue') engine.continue();
    else radio.confirm();
  } else if (e.key === 'Escape') {
    radio.cancel();
  } else if (e.key === 'ArrowLeft') {
    radio.changeTg(-1);
  } else if (e.key === 'ArrowRight') {
    radio.changeTg(1);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !typingTarget(e)) {
    e.preventDefault();
    radio.pttUp();
  }
});
window.addEventListener('blur', () => radio.pttUp());

// ------------------------------------------------------------------ UI-Helfer
function setRunning(on) {
  $('#btn-hint').disabled = !on;
  $('#btn-skip').disabled = !on;
  $('#btn-stop').disabled = !on;
}

function updateTgReq() {
  const el = $('#tg-req');
  if (!scenario) return;
  const ok = radio.usable && radio.tg === scenario.tg;
  el.className = 'tg-req ' + (ok ? 'ok' : 'bad');
  el.innerHTML = `Gesprächsgruppe: <b>${esc(scenario.tg)}</b> ${
    ok ? '✓' : radio.power ? `– am Gerät eingestellt: ${esc(radio.tg)}` : '– Funkgerät ist aus'
  }`;
}

function addLog(dir, text, opts = {}) {
  const log = $('#log');
  const div = document.createElement('div');
  div.className = `msg ${dir}`;
  if (dir === 'in') {
    if (opts.chatter) div.classList.add('chatter');
    div.innerHTML = `<div class="who">◀ ${esc(opts.who || '')}</div><span class="hidden-text" title="Klicken zum Aufdecken">${esc(text)}${
      opts.garble ? ' <em>(gestört)</em>' : ''
    }</span>`;
    div.querySelector('.hidden-text').addEventListener('click', (e) => e.currentTarget.classList.add('revealed'));
  } else if (dir === 'out') {
    div.innerHTML = `<div class="who">▶ Du${opts.tg ? ' · ' + esc(opts.tg) : ''}</div>${esc(text)}`;
  } else {
    div.textContent = text;
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

const LEVEL_ORDER = { error: 0, warn: 1, minor: 2, info: 3, ok: 4 };

function showEval(entry) {
  $('#eval-empty').hidden = true;
  $('#eval').hidden = false;
  const sc = $('#eval-score');
  sc.textContent = entry.score === null || entry.score === undefined ? '–' : entry.score;
  sc.className = 'eval-score' + (entry.score === null ? '' : entry.score >= 80 ? '' : entry.score >= 50 ? ' mid' : ' low');
  $('#eval-label').textContent = entry.label;
  $('#eval-text').textContent = entry.text ? `„${entry.text}“` : '';
  const items = [...(entry.findings || [])].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  $('#eval-findings').innerHTML = items.map((f) => `<li class="${f.level}">${esc(f.text)}</li>`).join('');
  $('#eval-sample').innerHTML = entry.sample && entry.score !== 100 ? `Musterlösung: <b>${esc(entry.sample)}</b>` : '';
}

function coachFeedback(text, retry) {
  const f = $('#coach-feedback');
  f.hidden = false;
  f.textContent = text;
  f.style.whiteSpace = 'pre-line';
  f.className = 'coach-feedback' + (retry ? ' retry' : '');
}

function showHint(text) {
  const h = $('#hint-box');
  h.hidden = false;
  h.textContent = text;
}
function hideHint() {
  $('#hint-box').hidden = true;
}

let toastTimer;
function toast(text, kind = '') {
  const t = $('#toast');
  t.textContent = text;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 6000);
}

function renderSttStatus(st) {
  if (st) recognizer.last = st;
  const s = recognizer.last || {};
  const el = $('#stt-status');
  el.classList.toggle('busy', sttBusy);
  if (sttBusy) {
    el.textContent = '⏳ Sendung wird ausgewertet …';
    return;
  }
  switch (s.state) {
    case 'loading': {
      const pct = Math.round((s.progress || 0) * 100);
      const mb = s.total ? ` (${Math.round(s.loaded / 1e6)} / ${Math.round(s.total / 1e6)} MB)` : '';
      el.innerHTML = s.bundled
        ? `Spracherkennung wird gestartet … ${pct}%<div class="bar"><div style="width:${pct}%"></div></div>`
        : `Sprachmodell wird einmalig heruntergeladen … ${pct}%${mb}<div class="bar"><div style="width:${pct}%"></div></div>`;
      break;
    }
    case 'ready':
      el.textContent = `🎙 Spracherkennung bereit – offline (${(s.model || '').split('/').pop()}, ${s.device === 'webgpu' ? 'GPU' : 'CPU'})`;
      break;
    case 'error': {
      const net = /fetch|network|load/i.test(s.message || '');
      el.innerHTML = `⚠ Spracherkennung nicht verfügbar${
        net ? ' – das Sprachmodell konnte nicht heruntergeladen werden (beim ersten Start ist Internet nötig).' : `: ${esc(s.message)}.`
      } Bis dahin die Texteingabe nutzen. <a href="#" id="stt-retry">Erneut versuchen</a>`;
      $('#stt-retry').addEventListener('click', (e) => {
        e.preventDefault();
        recognizer.load(settings.model, settings.device);
      });
      break;
    }
    case 'off':
      el.textContent = 'Spracherkennung ausgeschaltet – Funksprüche bitte eintippen.';
      break;
    default:
      el.textContent = '';
  }
}

// ------------------------------------------------------------------ Szenarien
function bestScores() {
  const best = {};
  for (const h of loadHistory()) best[h.id] = Math.max(best[h.id] ?? 0, h.score);
  return best;
}

function renderScenarioList() {
  const best = bestScores();
  const items = [
    { id: 'einsatzdienst', title: 'Einsatzdienst (Zufall)', level: 'Alle', desc: 'Vier zufällige Übungen hintereinander – wie eine Schicht im Einsatz.' },
    ...visibleScenarios(),
  ];
  $('#scenario-list').innerHTML = items
    .map((s) => {
      const cls = s.level === 'Fortgeschritten' ? 'adv' : s.level === 'Alle' ? 'all' : '';
      const b = best[s.id] !== undefined ? `<span class="best">Bestwert ${best[s.id]}</span>` : '';
      return `<button class="scenario ${s.id === currentId ? 'active' : ''}" data-id="${s.id}">
        <div class="s-title"><span>${esc(s.title)} ${b}</span><span class="badge ${cls}">${esc(s.level)}</span></div>
        <div class="s-desc">${esc(s.desc)}</div></button>`;
    })
    .join('');
  document.querySelectorAll('#scenario-list .scenario').forEach((b) => b.addEventListener('click', () => startScenario(b.dataset.id)));
  renderTutorialList();
}

function renderTutorialList() {
  const done = new Set(loadTutorialDone());
  $('#tut-progress').textContent = `${LESSONS.filter((l) => done.has(l.id)).length} / ${LESSONS.length}`;
  $('#tutorial-list').innerHTML = LESSONS.map(
    (l) => `<button class="scenario ${l.id === currentId ? 'active' : ''}" data-id="${l.id}">
      <div class="s-title"><span>${esc(l.title)}</span>${done.has(l.id) ? '<span class="done">✓</span>' : ''}</div>
      <div class="s-desc">${esc(l.desc)}</div></button>`
  ).join('');
  document.querySelectorAll('#tutorial-list .scenario').forEach((b) => b.addEventListener('click', () => startScenario(b.dataset.id)));
}

function visibleScenarios() {
  return settings.statusPractice ? SCENARIOS : SCENARIOS.filter((s) => !STATUS_SCENARIOS.includes(s.id));
}

function startScenario(id) {
  currentId = id;
  const seed = Math.floor(Math.random() * 1e9);
  const isLesson = id.startsWith('tut-');
  const exclude = settings.statusPractice ? [] : STATUS_SCENARIOS;
  scenario = isLesson ? buildLesson(id) : id === 'einsatzdienst' ? buildShift(seed, 4, { exclude }) : buildScenario(id, seed);
  if (!settings.statusPractice) withoutStatus(scenario);
  // Fremdverkehr (nicht im Tutorial – dort soll nichts ablenken)
  addTraffic(scenario, isLesson ? 'aus' : settings.traffic, seed + 1);
  // Lektion 1 beginnt bewusst mit ausgeschaltetem Gerät
  if (id === LESSONS[0].id) radio.setPower(false);
  engine.opts.answerTimeoutSec = Number(settings.answerTimeout) || 15;
  engine.opts.spellTable = settings.spellTable;
  voice.cancel();
  renderScenarioList();
  engine.start(scenario).catch((e) => console.error(e));
  updateTgReq();
}

$('#btn-hint').addEventListener('click', () => {
  if (currentSample) showHint(`Musterlösung: „${currentSample}“`);
  else showHint('Gerade ist keine Sendung von dir gefordert – achte auf den Auftrag und das Funkgerät.');
});
$('#btn-skip').addEventListener('click', () => engine.skip());
$('#btn-stop').addEventListener('click', () => {
  engine.stop();
  voice.cancel();
  addLog('note', 'Übung abgebrochen.');
});

// ------------------------------------------------------------------ Abschluss / Statistik
function verdict(score) {
  if (score >= 90) return 'Hervorragend – das sitzt!';
  if (score >= 75) return 'Gut gemacht – nur kleine Verbesserungen möglich.';
  if (score >= 50) return 'Ausbaufähig – schau dir die Hinweise an und wiederhole die Übung.';
  return 'Das üben wir nochmal – lies das Merkblatt und versuche es erneut.';
}

function showFinish(summary) {
  const list = summary.results
    .map((r) => {
      const bad = r.findings.filter((f) => !['ok', 'info'].includes(f.level));
      return `<div class="finish-item"><div class="fi-head"><span>${esc(r.label)}</span><span>${r.score ?? '–'}</span></div>
        ${r.text ? `<div class="muted small">„${esc(r.text)}“</div>` : ''}
        ${bad.length ? `<ul>${bad.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>` : ''}</div>`;
    })
    .join('');
  const lesson = summary.scenario.tutorial;
  $('#finish-next').textContent = lesson ? 'Nächste Lektion ▶' : 'Nächste Übung ▶';
  $('#finish-again').textContent = lesson ? '↻ Lektion wiederholen' : '↻ Nochmal (neue Lage)';
  $('#finish-content').innerHTML = `<div class="finish-score">${summary.score}</div>
    <div class="finish-verdict">${verdict(summary.score)} · ${summary.errorCount} Fehler</div>
    <div class="finish-list">${list}</div>`;
  const dlg = $('#dlg-finish');
  dlg.returnValue = '';
  dlg.showModal();
}

$('#dlg-finish').addEventListener('close', () => {
  const v = $('#dlg-finish').returnValue;
  if (v === 'again') startScenario(currentId);
  if (v === 'next' && currentId.startsWith('tut-')) {
    const i = LESSONS.findIndex((l) => l.id === currentId);
    startScenario(i + 1 < LESSONS.length ? LESSONS[i + 1].id : SCENARIOS[0].id);
  } else if (v === 'next') {
    const ids = visibleScenarios().map((s) => s.id);
    const i = ids.indexOf(currentId);
    startScenario(currentId === 'einsatzdienst' ? 'einsatzdienst' : ids[(i + 1) % ids.length]);
  }
});

function openStats() {
  const h = loadHistory();
  const last10 = h.slice(0, 10);
  const avg = last10.length ? Math.round(last10.reduce((a, x) => a + x.score, 0) / last10.length) : '–';
  const best = h.length ? Math.max(...h.map((x) => x.score)) : '–';
  const counts = {};
  for (const x of h.slice(0, 30)) for (const t of x.issues || []) counts[t] = (counts[t] || 0) + 1;
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  $('#stats-content').innerHTML = `
    <div class="stats-grid">
      <div class="stat"><b>${h.length}</b>Übungen</div>
      <div class="stat"><b>${avg}</b>Ø der letzten 10</div>
      <div class="stat"><b>${best}</b>Bestwert</div>
    </div>
    ${
      top.length
        ? `<h3>Häufigste Fehler</h3><ul>${top.map(([t, n]) => `<li>${esc(t)} <span class="muted">(${n}×)</span></li>`).join('')}</ul>`
        : ''
    }
    <h3>Verlauf</h3>
    ${
      h.length
        ? `<table class="table"><tr><th>Datum</th><th>Übung</th><th>Punkte</th></tr>${h
            .slice(0, 25)
            .map((x) => `<tr><td>${new Date(x.date).toLocaleString('de-DE')}</td><td>${esc(x.title)}</td><td>${x.score}</td></tr>`)
            .join('')}</table>`
        : '<p class="muted">Noch keine Übungen abgeschlossen.</p>'
    }`;
  $('#dlg-stats').showModal();
}
$('#btn-stats').addEventListener('click', openStats);
$('#dlg-stats').addEventListener('close', () => {
  if ($('#dlg-stats').returnValue === 'clear' && confirm('Gesamten Verlauf löschen?')) {
    clearHistory();
    renderScenarioList();
  }
});

// ------------------------------------------------------------------ Merkblatt
function openRules() {
  const statusRows = Object.entries(STATUS_TEXT)
    .map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`)
    .join('');
  const spellRows = Object.keys(DIN_2022)
    .map((k) => `<tr><td><b>${k}</b></td><td>${DIN_2022[k]}</td><td>${DIN_TRAD[k] || ''}</td></tr>`)
    .join('');
  $('#rules-content').innerHTML = `
    <section>
      <h3>Grundsätze</h3>
      <ul>
        <li><b>Erst denken, dann drücken, dann sprechen.</b></li>
        <li>Sprechtaste drücken, Sendeerlaubnis-Ton abwarten (Digitalfunk), dann sprechen.</li>
        <li>Taste erst nach dem letzten Wort loslassen.</li>
        <li>Kurz, klar, deutlich – max. ca. 20 Sekunden pro Sendung.</li>
        <li>Keine Höflichkeitsformeln, Grüße oder Füllwörter („bitte“, „danke“, „äh“, „okay“).</li>
        <li>„<b>zwo</b>“ statt „zwei“.</li>
        <li>Personenbezogene Daten vermeiden.</li>
        <li>Nicht in laufende Gespräche anderer hineinsenden.</li>
      </ul>
    </section>
    <section>
      <h3>Gesprächsablauf</h3>
      <div>Anruf:</div>
      <div class="ex">Heros Musterstadt 21/10 von Heros Musterstadt 21/52, kommen.</div>
      <div>Antwort:</div>
      <div class="ex">Hier Heros Musterstadt 21/10, kommen.</div>
      <div>Nachricht:</div>
      <div class="ex">An Einsatzstelle Hauptstraße 12 eingetroffen, kommen.</div>
      <div>Quittung:</div>
      <div class="ex">Verstanden, beginnen Sie mit der Erkundung, kommen.</div>
      <div>Abschluss (durch die Stelle, die das Gespräch begonnen hat):</div>
      <div class="ex">Verstanden, Ende.</div>
    </section>
    <section>
      <h3>Betriebsworte</h3>
      <table>
        <tr><td><b>kommen</b></td><td>Sendung beendet, Gegenstelle soll antworten</td></tr>
        <tr><td><b>Ende</b></td><td>Gespräch beendet</td></tr>
        <tr><td><b>Verstanden</b></td><td>Nachricht vollständig aufgenommen</td></tr>
        <tr><td><b>Wiederholen</b></td><td>Bitte um Wiederholung (z. B. bei Störung)</td></tr>
        <tr><td><b>Ich wiederhole</b></td><td>Leitet die Wiederholung ein</td></tr>
        <tr><td><b>Ich buchstabiere</b></td><td>Leitet eine Buchstabierung ein</td></tr>
        <tr><td><b>Warten</b></td><td>Nicht senden, bis man gerufen wird</td></tr>
        <tr><td><b>Funkprobe</b></td><td>Prüfung der Verbindung – Antwort „Verstehe gut/schlecht“</td></tr>
      </table>
    </section>
    <section>
      <h3>Status (FMS / Digitalfunk)</h3>
      <table>${statusRows}<tr><td><b>J</b></td><td>Sprechaufforderung (von der Leitstelle)</td></tr></table>
    </section>
    <section style="grid-column: 1 / -1">
      <h3>Buchstabiertafel</h3>
      <table><tr><td></td><td class="muted">DIN 5009 (2022)</td><td class="muted">Traditionell</td></tr>${spellRows}
      <tr><td><b>Ch</b></td><td>– (C, H)</td><td>Charlotte</td></tr><tr><td><b>Sch</b></td><td>– (S, C, H)</td><td>Schule</td></tr></table>
    </section>
    <p class="muted small" style="grid-column: 1 / -1">
      Dieses Merkblatt ersetzt keine Ausbildung nach der Sprechfunk-Dienstvorschrift (DV 810) bzw. den THW-Ausbildungsunterlagen.
      Regionale Regelungen (z. B. Statusbedeutungen, Rufnamensystematik) können abweichen. Alle Rufnamen im Trainer sind fiktiv.
    </p>`;
  $('#dlg-rules').showModal();
}
$('#btn-rules').addEventListener('click', openRules);

// ------------------------------------------------------------------ Einstellungen
async function openSettings() {
  await voice.ready;
  $('#set-mode').value = settings.mode;
  $('#set-voice').innerHTML =
    (voice.voices.length ? '' : '<option value="">(keine deutsche Systemstimme gefunden)</option>') +
    voice.voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  if (settings.voice) $('#set-voice').value = settings.voice;
  $('#set-rate').value = settings.rate;
  $('#set-model').innerHTML =
    Object.entries(MODELS)
      .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`)
      .join('') + '<option value="off">Aus – nur Texteingabe</option>';
  $('#set-model').value = settings.model;
  $('#set-device').value = settings.device;
  const mics = await MicRecorder.listDevices();
  $('#set-mic').innerHTML =
    '<option value="">Standardmikrofon</option>' +
    mics
      .filter((m) => m.deviceId && m.deviceId !== 'default')
      .map((m, i) => `<option value="${esc(m.deviceId)}">${esc(m.label || `Mikrofon ${i + 1}`)}</option>`)
      .join('');
  $('#set-mic').value = settings.mic;
  $('#set-spell').value = settings.spellTable;
  $('#set-timeout').value = settings.answerTimeout;
  $('#set-traffic').value = settings.traffic;
  $('#set-status').checked = settings.statusPractice;
  initUpdateBox();
  $('#dlg-settings').showModal();
}
$('#btn-settings').addEventListener('click', openSettings);
$('#dlg-settings').addEventListener('close', () => {
  if ($('#dlg-settings').returnValue !== 'ok') return;
  const prevModel = settings.model;
  const prevDevice = settings.device;
  settings.mode = $('#set-mode').value;
  settings.voice = $('#set-voice').value;
  settings.rate = Number($('#set-rate').value);
  settings.model = $('#set-model').value;
  settings.device = $('#set-device').value;
  settings.mic = $('#set-mic').value;
  settings.spellTable = $('#set-spell').value;
  settings.answerTimeout = Math.max(5, Math.min(60, Number($('#set-timeout').value) || 15));
  settings.traffic = $('#set-traffic').value;
  settings.statusPractice = $('#set-status').checked;
  renderScenarioList();
  saveSettings(settings);

  audio.mode = settings.mode;
  mic.mode = settings.mode;
  radio.setMode(settings.mode);
  voice.preferred = settings.voice;
  voice.rate = settings.rate;
  engine.opts.spellTable = settings.spellTable;
  engine.opts.answerTimeoutSec = settings.answerTimeout;
  if (settings.mic !== mic.deviceId) {
    mic.close();
    mic.deviceId = settings.mic;
  }
  if (settings.model !== prevModel || settings.device !== prevDevice) recognizer.load(settings.model, settings.device);
});

$('#toggle-text').checked = settings.showText;
document.body.classList.toggle('show-text', settings.showText);
$('#toggle-text').addEventListener('change', (e) => {
  settings.showText = e.target.checked;
  document.body.classList.toggle('show-text', settings.showText);
  saveSettings(settings);
});

// ------------------------------------------------------------------ Updates
const desktop = window.funktrainer && window.funktrainer.checkUpdate ? window.funktrainer : null;
let updateInfo = null;
const cleanErr = (e) => String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function updateStatus(text) {
  $('#update-status').textContent = text;
}

async function initUpdateBox() {
  if (!desktop) {
    $('#update-box').hidden = true;
    return;
  }
  $('#update-version').textContent = `– installiert: Version ${await desktop.version()}`;
  await renderTokenState();
  if (updateInfo && updateInfo.newer) showUpdateInfo(updateInfo);
}

async function renderTokenState() {
  const has = await desktop.hasToken();
  $('#token-state').textContent = has ? '– Schlüssel hinterlegt ✓' : '– kein Schlüssel';
  $('#token-remove').hidden = !has;
  $('#token-input').value = '';
}

$('#token-save').addEventListener('click', async () => {
  const t = $('#token-input').value.trim();
  if (!t) return;
  if (!/^(github_pat_|ghp_)/.test(t)) {
    updateStatus('⚠ Das sieht nicht wie ein GitHub-Schlüssel aus (beginnt mit „github_pat_“).');
    return;
  }
  await desktop.setToken(t);
  await renderTokenState();
  $('#token-box').open = false;
  checkForUpdates(false);
});
$('#token-remove').addEventListener('click', async () => {
  await desktop.setToken('');
  await renderTokenState();
  updateStatus('Schlüssel entfernt.');
});

function showUpdateInfo(info) {
  updateInfo = info;
  const btn = $('#update-install');
  if (!info.newer) {
    updateStatus(`✓ Du hast die neueste Version (${info.current}).`);
    btn.hidden = true;
    return;
  }
  const mb = info.size ? ` (${Math.round(info.size / 1e6)} MB)` : '';
  if (info.canInstall) {
    updateStatus(`Neue Version ${info.latest} verfügbar${mb}. Die App startet nach der Installation automatisch neu.`);
    btn.textContent = 'Update herunterladen & installieren';
  } else {
    updateStatus(`Neue Version ${info.latest} verfügbar. ${info.reason}`);
    btn.textContent = 'Download-Seite öffnen';
  }
  btn.hidden = false;
}

async function checkForUpdates(silent = false) {
  if (!desktop) return null;
  if (!silent) updateStatus('Suche nach Updates …');
  try {
    const info = await desktop.checkUpdate();
    if (!silent || info.newer) showUpdateInfo(info);
    return info;
  } catch (e) {
    if (!silent) updateStatus(`⚠ Update-Prüfung fehlgeschlagen: ${cleanErr(e)}`);
    return null;
  }
}

$('#update-check').addEventListener('click', () => checkForUpdates(false));
$('#update-install').addEventListener('click', async () => {
  if (!updateInfo) return;
  if (!updateInfo.canInstall) {
    desktop.openReleasePage();
    return;
  }
  const btn = $('#update-install');
  btn.disabled = true;
  $('#update-check').disabled = true;
  $('#update-bar').hidden = false;
  updateStatus(`Lade Version ${updateInfo.latest} herunter …`);
  const off = desktop.onUpdateProgress((p) => {
    $('#update-bar-fill').style.width = `${Math.round(p * 100)}%`;
    if (p >= 1) updateStatus('Installiere … die App startet gleich neu.');
  });
  try {
    await desktop.installUpdate();
    updateStatus('Installiere … die App startet gleich neu.');
  } catch (e) {
    off();
    btn.disabled = false;
    $('#update-check').disabled = false;
    $('#update-bar').hidden = true;
    updateStatus(`⚠ Update fehlgeschlagen: ${cleanErr(e)}`);
  }
});

$('#coach-next').addEventListener('click', () => engine.continue());

// ------------------------------------------------------------------ Start
renderScenarioList();
if (!loadTutorialDone().length && !loadHistory().length && !localStorage.getItem('funktrainer.welcomed')) {
  try {
    localStorage.setItem('funktrainer.welcomed', '1');
  } catch {
    /* ignorieren */
  }
  $('#dlg-welcome').showModal();
}
$('#dlg-welcome').addEventListener('close', () => {
  if ($('#dlg-welcome').returnValue === 'tutorial') startScenario(LESSONS[0].id);
});
addLog('note', 'Willkommen beim BOS Funktrainer! Wähle eine Übung, schalte das Funkgerät mit ⏻ ein und stelle die Gesprächsgruppe ein.');
recognizer.load(settings.model, settings.device);
setTimeout(async () => {
  const info = await checkForUpdates(true);
  if (info && info.newer) toast(`Neue Version ${info.latest} verfügbar – in den Einstellungen mit einem Klick installieren.`, 'info');
}, 4000);
voice.ready.then(() => {
  if (!voice.available) {
    toast('Keine deutsche Systemstimme gefunden – Funksprüche werden nur als Text angezeigt. Unter macOS/Windows kann eine deutsche Stimme in den Systemeinstellungen installiert werden.', 'info');
    $('#toggle-text').checked = true;
    document.body.classList.add('show-text');
  }
});

// für Tests/Debugging
window.__funktrainer = { engine, radio, recognizer, voice, settings, startScenario, submitTransmission };
