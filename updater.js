// Update-Funktion: neueste Version von GitHub-Releases laden und installieren.
// Windows: Installer herunterladen und ausführen (ersetzt die App, startet neu).
// macOS:   DMG laden, App austauschen und neu starten. Da die App die Datei selbst
//          lädt (nicht der Browser), erscheint danach keine Apple-Warnung.
const { app, net, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = 'Joka238/Funktrainer';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function assetName() {
  if (process.platform === 'darwin') return 'BOS-Funktrainer.dmg';
  if (process.platform === 'win32') return 'BOS-Funktrainer-Setup.exe';
  return null;
}

/** Wie wurde die App installiert – und kann sie sich selbst ersetzen? */
function installMode() {
  if (!app.isPackaged) return { canInstall: false, reason: 'Entwicklungsmodus – Updates nur in der installierten App.' };
  if (process.platform === 'win32') {
    if (process.env.PORTABLE_EXECUTABLE_FILE) {
      return { canInstall: false, reason: 'Portable Version – bitte die neue Datei manuell herunterladen.' };
    }
    return { canInstall: true };
  }
  if (process.platform === 'darwin') {
    const bundle = path.resolve(process.execPath, '..', '..', '..');
    if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) {
      return { canInstall: false, reason: 'Die App läuft nicht aus dem Ordner „Programme“. Bitte zuerst dorthin verschieben.' };
    }
    try {
      fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    } catch {
      return { canInstall: false, reason: 'Keine Schreibrechte im Programme-Ordner.' };
    }
    return { canInstall: true, bundle };
  }
  return { canInstall: false, reason: 'Automatische Updates gibt es nur für macOS und Windows.' };
}

async function check() {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BOS-Funktrainer' },
  });
  if (res.status === 404) throw new Error('Keine Veröffentlichung gefunden (ist das Repository öffentlich?).');
  if (!res.ok) throw new Error(`GitHub antwortet mit Fehler ${res.status}.`);
  const rel = await res.json();
  const latest = String(rel.tag_name || '').replace(/^v/, '');
  const current = app.getVersion();
  const asset = (rel.assets || []).find((a) => a.name === assetName());
  const mode = installMode();
  return {
    current,
    latest,
    newer: compareVersions(latest, current) > 0,
    notes: rel.body || '',
    size: asset ? asset.size : 0,
    downloadUrl: asset ? asset.browser_download_url : null,
    canInstall: mode.canInstall && !!asset,
    reason: mode.canInstall ? (asset ? '' : 'Für dieses System liegt keine Update-Datei vor.') : mode.reason,
  };
}

async function download(url, dest, onProgress) {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'BOS-Funktrainer' } });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(dest);
  const reader = res.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
    if (onProgress) onProgress(total ? loaded / total : 0);
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
}

const run = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)))
  );

async function install(onProgress) {
  const info = await check();
  if (!info.newer) throw new Error('Du hast bereits die neueste Version.');
  if (!info.canInstall) throw new Error(info.reason || 'Update kann nicht automatisch installiert werden.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'funktrainer-update-'));
  const file = path.join(dir, assetName());
  await download(info.downloadUrl, file, onProgress);

  if (process.platform === 'win32') {
    // Ein-Klick-Installer: still installieren und App danach neu starten
    spawn(file, ['/S', '--force-run', '--updated'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 500);
    return { restarting: true };
  }

  // macOS: DMG einhängen, neue App kopieren, nach dem Beenden austauschen und starten
  const { bundle } = installMode();
  const mnt = path.join(dir, 'mnt');
  fs.mkdirSync(mnt);
  await run('hdiutil', ['attach', file, '-nobrowse', '-readonly', '-quiet', '-mountpoint', mnt]);
  const newApp = path.join(dir, 'new.app');
  try {
    const src = fs.readdirSync(mnt).find((f) => f.endsWith('.app'));
    if (!src) throw new Error('Keine App im Update gefunden.');
    await run('ditto', [path.join(mnt, src), newApp]);
  } finally {
    await run('hdiutil', ['detach', mnt, '-quiet']).catch(() => {});
  }
  await run('xattr', ['-dr', 'com.apple.quarantine', newApp]).catch(() => {});
  const script = path.join(dir, 'swap.sh');
  fs.writeFileSync(
    script,
    [
      '#!/bin/bash',
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
      `rm -rf "${bundle}"`,
      `mv "${newApp}" "${bundle}"`,
      `open "${bundle}"`,
      `rm -rf "${dir}"`,
    ].join('\n')
  );
  spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 300);
  return { restarting: true };
}

function register(ipcMain) {
  ipcMain.handle('update:check', () => check());
  ipcMain.handle('update:install', (e) =>
    install((p) => {
      if (!e.sender.isDestroyed()) e.sender.send('update:progress', p);
    })
  );
  ipcMain.handle('update:open-page', () => shell.openExternal(RELEASES_PAGE));
  ipcMain.handle('app:version', () => app.getVersion());
}

module.exports = { register, compareVersions };
