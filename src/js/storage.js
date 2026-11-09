// Einstellungen und Verlauf im lokalen Speicher.
const KEY_SETTINGS = 'funktrainer.settings.v1';
const KEY_HISTORY = 'funktrainer.history.v1';

export const DEFAULT_SETTINGS = {
  mode: 'digital',
  showText: false,
  voice: '',
  rate: 1,
  model: 'Xenova/whisper-base',
  device: 'wasm',
  mic: '',
  spellTable: 'din2022',
  answerTimeout: 15,
  volume: 0.7,
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
  return { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) };
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
