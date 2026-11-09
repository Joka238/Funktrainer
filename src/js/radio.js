// Simuliertes Handfunkgerät (HRT) – Darstellung und Bedienung.
import { STATUS_TEXT } from './scenarios.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export class Radio {
  constructor(root, audio, talkgroups) {
    this.root = root;
    this.audio = audio;
    this.talkgroups = talkgroups;
    this.tgIndex = 1;
    this.power = false;
    this.booting = false;
    this.volume = 0.7;
    this.mode = 'digital';
    this.rx = null;
    this.tx = false;
    this.statusEntry = null;
    this.flashMsg = null;
    this.lastStatus = null;
    this.incoming = null;
    this.listeners = {};
    this.build();
    this.render();
  }

  get tg() {
    return this.talkgroups[this.tgIndex];
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  fire(ev, data) {
    for (const fn of this.listeners[ev] || []) fn(data);
  }

  build() {
    this.root.innerHTML = `
      <div class="radio">
        <div class="radio-top">
          <div class="antenna"></div>
          <button class="knob knob-tg" title="Gesprächsgruppe wählen (links/rechts klicken oder scrollen)" aria-label="Gesprächsgruppe"><span class="knob-mark"></span></button>
          <button class="btn-emergency" title="Notruftaste" aria-label="Notruf"></button>
          <button class="knob knob-vol" title="Lautstärke (links/rechts klicken oder scrollen)" aria-label="Lautstärke"><span class="knob-mark"></span></button>
        </div>
        <div class="radio-body">
          <button class="ptt" title="Sprechtaste (PTT) – gedrückt halten oder Leertaste" aria-label="Sprechtaste">
            <span>PTT</span>
          </button>
          <div class="side-btn side-btn-1"></div>
          <div class="led" title="Sende-/Empfangsanzeige"></div>
          <div class="brand">HRT&nbsp;&nbsp;BOS-Digital</div>
          <div class="display"><div class="display-inner"></div></div>
          <div class="softkeys">
            <button class="soft soft-l" data-soft="l"></button>
            <button class="nav nav-left" data-nav="-1" title="Vorherige Gesprächsgruppe">◀</button>
            <button class="nav nav-right" data-nav="1" title="Nächste Gesprächsgruppe">▶</button>
            <button class="soft soft-r" data-soft="r"></button>
          </div>
          <div class="callkeys">
            <button class="key-ok" title="Senden / Bestätigen">✓</button>
            <button class="key-power" title="Ein/Aus">⏻</button>
            <button class="key-cancel" title="Abbrechen">✕</button>
          </div>
          <div class="keypad">
            ${KEYS.map((k) => `<button class="key" data-key="${k}">${k}<small>${k === '0' ? 'Notr.' : /\d/.test(k) ? 'St' : ''}</small></button>`).join('')}
          </div>
          <div class="grille">${'<span></span>'.repeat(7)}</div>
        </div>
      </div>`;
    // Tasten des Geräts sollen keinen Tastaturfokus übernehmen (sonst lösen Leertaste/Enter sie aus)
    this.root.querySelectorAll('button').forEach((b) => b.setAttribute('tabindex', '-1'));
    this.root.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) e.preventDefault();
    });
    const $ = (s) => this.root.querySelector(s);
    this.el = {
      display: $('.display-inner'),
      led: $('.led'),
      ptt: $('.ptt'),
      tgKnob: $('.knob-tg'),
      volKnob: $('.knob-vol'),
      softL: $('.soft-l'),
      softR: $('.soft-r'),
      radio: $('.radio'),
    };

    // Sprechtaste
    const down = (e) => {
      e.preventDefault();
      this.pttDown();
    };
    const up = (e) => {
      e.preventDefault();
      this.pttUp();
    };
    this.el.ptt.addEventListener('pointerdown', (e) => {
      this.el.ptt.setPointerCapture(e.pointerId);
      down(e);
    });
    this.el.ptt.addEventListener('pointerup', up);
    this.el.ptt.addEventListener('pointercancel', up);

    // Drehknöpfe
    const knob = (el, fn) => {
      el.addEventListener('click', (e) => {
        const r = el.getBoundingClientRect();
        fn(e.clientX < r.left + r.width / 2 ? -1 : 1);
      });
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        fn(e.deltaY > 0 ? -1 : 1);
      });
    };
    knob(this.el.tgKnob, (d) => this.changeTg(d));
    knob(this.el.volKnob, (d) => this.changeVolume(d * 0.1));

    this.root.querySelectorAll('.nav').forEach((b) => b.addEventListener('click', () => this.changeTg(Number(b.dataset.nav))));
    this.root.querySelector('.key-power').addEventListener('click', () => this.togglePower());
    this.root.querySelector('.key-ok').addEventListener('click', () => this.confirm());
    this.root.querySelector('.key-cancel').addEventListener('click', () => this.cancel());
    this.el.softL.addEventListener('click', () => this.softkey('l'));
    this.el.softR.addEventListener('click', () => this.softkey('r'));
    this.root.querySelectorAll('.key').forEach((b) => b.addEventListener('click', () => this.keypress(b.dataset.key)));
    this.root.querySelector('.btn-emergency').addEventListener('click', () => this.emergency());
  }

  // ------------------------------------------------------------ Bedienung
  click() {
    if (this.power) this.audio.keyClick();
  }

  togglePower() {
    if (this.tx) return;
    this.power = !this.power;
    this.statusEntry = null;
    if (this.power) {
      this.audio.ensure();
      this.audio.powerOn();
      this.booting = true;
      this.render();
      setTimeout(() => {
        this.booting = false;
        this.render();
        this.fire('power', true);
      }, 1400);
    } else {
      this.audio.powerOff();
      this.rx = null;
      this.render();
      this.fire('power', false);
    }
  }

  setPower(on) {
    if (on !== this.power) this.togglePower();
  }

  get usable() {
    return this.power && !this.booting;
  }

  changeTg(d) {
    if (!this.usable || this.tx) return;
    this.click();
    this.tgIndex = (this.tgIndex + d + this.talkgroups.length) % this.talkgroups.length;
    this.statusEntry = null;
    this.render();
    this.fire('tg', this.tg);
  }

  setTg(name) {
    const i = this.talkgroups.indexOf(name);
    if (i >= 0) {
      this.tgIndex = i;
      this.render();
    }
  }

  changeVolume(d) {
    this.volume = Math.max(0, Math.min(1, Math.round((this.volume + d) * 10) / 10));
    this.click();
    this.flash(`Lautstärke ${Math.round(this.volume * 10)}`);
    this.fire('volume', this.volume);
    this.render();
  }

  keypress(k) {
    if (!this.usable) return;
    this.click();
    if (/\d/.test(k)) {
      this.statusEntry = k;
      this.render();
    }
  }

  softkey(side) {
    if (!this.usable) return;
    this.click();
    if (this.statusEntry !== null) {
      if (side === 'l') this.confirm();
      else this.cancel();
      return;
    }
    if (side === 'l') {
      this.flash('Status: Ziffer wählen, dann Senden');
    } else {
      this.fire('help');
    }
  }

  confirm() {
    if (!this.usable) return;
    if (this.statusEntry !== null) {
      const n = Number(this.statusEntry);
      this.statusEntry = null;
      this.lastStatus = n;
      this.audio.statusAck();
      this.flash(`Status ${n} gesendet ✓`, 2000);
      this.fire('status', n);
    } else {
      this.click();
    }
  }

  cancel() {
    if (!this.usable) return;
    this.click();
    this.statusEntry = null;
    this.incoming = null;
    this.render();
  }

  emergency() {
    if (!this.usable) return;
    this.audio.error();
    this.flash('NOTRUF ausgelöst!', 2500, true);
    this.fire('emergency');
  }

  pttDown() {
    if (this.pttHeld) return;
    this.pttHeld = true;
    this.el.ptt.classList.add('pressed');
    if (!this.usable) return;
    if (this.rx) {
      if (this.mode === 'digital') this.audio.busy();
      this.flash('Kanal belegt', 1500, true);
      this.fire('ptt-busy');
      return;
    }
    this.tx = true;
    this.render();
    this.fire('ptt-down');
  }

  pttUp() {
    if (!this.pttHeld) return;
    this.pttHeld = false;
    this.el.ptt.classList.remove('pressed');
    if (!this.tx) return;
    this.tx = false;
    this.level = 0;
    this.render();
    this.fire('ptt-up');
  }

  // ------------------------------------------------------------ Anzeige
  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  setRx(label) {
    this.rx = label;
    this.render();
  }

  setLevel(v) {
    this.level = v;
    const bar = this.root.querySelector('.vu-fill');
    if (bar) bar.style.width = `${Math.round(v * 100)}%`;
  }

  statusIncoming(code, text) {
    this.incoming = { code, text };
    this.audio.statusIn();
    this.render();
  }

  flash(text, ms = 1500, alert = false) {
    this.flashMsg = { text, alert };
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashMsg = null;
      this.render();
    }, ms);
    this.render();
  }

  render() {
    const d = this.el.display;
    this.el.radio.classList.toggle('on', this.power);
    this.el.led.className = 'led' + (this.tx ? ' tx' : this.rx ? ' rx' : this.power ? ' idle' : '');
    this.el.tgKnob.style.setProperty('--rot', `${-120 + (this.tgIndex / (this.talkgroups.length - 1)) * 240}deg`);
    this.el.volKnob.style.setProperty('--rot', `${-135 + this.volume * 270}deg`);

    if (!this.power) {
      d.innerHTML = '';
      this.el.softL.textContent = '';
      this.el.softR.textContent = '';
      return;
    }
    if (this.booting) {
      d.innerHTML = `<div class="d-boot"><div class="d-logo">THW</div><div>Selbsttest …</div></div>`;
      return;
    }
    const net = this.mode === 'digital' ? 'TMO' : 'ANALOG';
    const bars = '<i></i><i></i><i></i><i class="dim"></i>';
    let main = `<div class="d-tg-label">Gesprächsgruppe</div><div class="d-tg">${this.tg}</div>`;
    let info = '';
    let softL = 'Status';
    let softR = 'Hilfe';

    if (this.tx) {
      main = `<div class="d-tx">● SENDEN</div><div class="d-tg small">${this.tg}</div><div class="vu"><div class="vu-fill"></div></div>`;
    } else if (this.rx) {
      info = `<div class="d-rx">◀ ${this.mode === 'digital' ? this.rx : 'Empfang'}</div>`;
    }
    if (this.statusEntry !== null) {
      const n = Number(this.statusEntry);
      main = `<div class="d-tg-label">Status senden?</div><div class="d-status"><b>${n}</b> ${STATUS_TEXT[n]}</div>`;
      softL = 'Senden';
      softR = 'Abbr.';
    } else if (this.incoming && !this.tx) {
      info = `<div class="d-in">✉ Status ${this.incoming.code}: ${this.incoming.text}</div>`;
    }
    if (this.flashMsg) {
      info = `<div class="d-flash ${this.flashMsg.alert ? 'alert' : ''}">${this.flashMsg.text}</div>`;
    }
    const st = this.lastStatus !== null ? `St ${this.lastStatus}` : '';
    d.innerHTML = `
      <div class="d-bar"><span class="d-sig">${bars}</span><span>${net}</span><span>${st}</span><span class="d-bat"><i></i></span></div>
      <div class="d-main">${main}</div>
      <div class="d-info">${info}</div>
      <div class="d-soft"><span>${softL}</span><span>${softR}</span></div>`;
    this.el.softL.textContent = '';
    this.el.softR.textContent = '';
    if (this.tx) this.setLevel(this.level || 0);
  }
}
