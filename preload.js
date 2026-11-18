const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moewki', {
  onWorld: (cb) => ipcRenderer.on('world', (_e, w) => cb(w)),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),
  getAccent: () => ipcRenderer.invoke('system:accent'),
  onAccent: (cb) => ipcRenderer.on('accent', (_e, c) => cb(c)),
  command: (c) => ipcRenderer.send('command', c),
  windowAction: (action) => ipcRenderer.send('window', action),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
});
