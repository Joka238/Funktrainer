// Electron-Hauptprozess des BOS Funktrainers
const { app, BrowserWindow, protocol, session, systemPreferences, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, 'src');

// Eigenes Protokoll app:// – liefert sichere Origin (Cache-API, Worker, Mikrofon)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav',
};

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(SRC, rel));
    if (!file.startsWith(SRC)) return new Response('Forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          // Cross-Origin-Isolation: erlaubt Multithreading in der Spracherkennung
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#11161c',
    title: 'BOS Funktrainer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Externe Links im Standardbrowser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL('app://funktrainer/index.html');
}

app.whenReady().then(async () => {
  registerAppProtocol();

  // Mikrofon-Zugriff erlauben (nur für die eigene App-Origin)
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const origin = details.requestingUrl || '';
    cb(origin.startsWith('app://') && (permission === 'media' || permission === 'speaker-selection'));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => {
    return (origin || '').startsWith('app://');
  });

  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch {
      /* ignorieren */
    }
  }

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
