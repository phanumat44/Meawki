const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moewki', {
  onWorld: (cb) => ipcRenderer.on('world', (_e, w) => cb(w)),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),
  resetSettings: () => ipcRenderer.send('settings:reset'),
  openExternal: (url) => ipcRenderer.send('open:external', url),
  getAccent: () => ipcRenderer.invoke('system:accent'),
  onAccent: (cb) => ipcRenderer.on('accent', (_e, c) => cb(c)),
  command: (c) => ipcRenderer.send('command', c),
  windowAction: (action) => ipcRenderer.send('window', action),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getUpdate: () => ipcRenderer.invoke('update:get'),
  onUpdate: (cb) => ipcRenderer.on('update', (_e, s) => cb(s)),
  checkForUpdate: () => ipcRenderer.send('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  setActivity: (active) => ipcRenderer.send('activity', active),
  onVisible: (cb) => ipcRenderer.on('overlay:visible', (_e, v) => cb(v)),
  // multi-monitor: hand a cat to the display next door / hear that one is coming in
  leaveCat: (id, side) => ipcRenderer.invoke('cat:leave', { id, side }),
  onCatArrive: (cb) => ipcRenderer.on('cat:arrive', (_e, a) => cb(a)),
});
