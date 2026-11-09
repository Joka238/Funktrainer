// Minimaler Preload: stellt nur Plattforminformationen bereit.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('funktrainer', {
  platform: process.platform,
  isElectron: true,
});
