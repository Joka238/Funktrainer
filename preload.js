// Preload: stellt Plattforminfos und die Update-Funktion bereit.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('funktrainer', {
  platform: process.platform,
  isElectron: true,
  version: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleasePage: () => ipcRenderer.invoke('update:open-page'),
  onUpdateProgress: (fn) => {
    const h = (_e, p) => fn(p);
    ipcRenderer.on('update:progress', h);
    return () => ipcRenderer.removeListener('update:progress', h);
  },
});
