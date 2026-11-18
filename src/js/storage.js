// Einstellungen und Verlauf im lokalen Speicher.
const KEY_SETTINGS = 'funktrainer.settings.v1';
const KEY_HISTORY = 'funktrainer.history.v1';

export const DEFAULT_SETTINGS = {
  mode: 'digital',
  showText: false,
  voice: '',
  rate: 1,
  model: 'Xenova/whisper-small',
  device: 'auto',
  mic: '',
  spellTable: 'din2022',
  answerTimeout: 15,
  traffic: 'normal',
  statusPractice: true,
  volume: 0.7,
  freeCount: 5,
  ort: '',
  lstOrt: '',
  freeKinds: ['mitteilen', 'anfordern', 'erfragen', 'angerufen'],
};

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) };
  // Einmalige Umstellung: das alte Standardmodell "Base" erkennt deutlich schlechter als "Small"
  if (!s.modelV2) {
    if (s.model === 'Xenova/whisper-base' || s.model === 'Xenova/whisper-tiny') s.model = DEFAULT_SETTINGS.model;
    s.modelV2 = true;
    saveSettings(s);
  }
  // Einmalige Umstellung auf automatische GPU-Nutzung (deutlich schneller)
  if (!s.deviceV2) {
    s.device = 'auto';
    s.deviceV2 = true;
    saveSettings(s);
  }
  return s;
}

export function saveSettings(s) {
  write(KEY_SETTINGS, s);
}

export function loadHistory() {
  return read(KEY_HISTORY, []);
}

export function addHistory(entry) {
  const h = loadHistory();
  h.unshift(entry);
  write(KEY_HISTORY, h.slice(0, 200));
  return h;
}

export function clearHistory() {
  write(KEY_HISTORY, []);
}
