const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut, nativeTheme, systemPreferences, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const IS_MAC = process.platform === 'darwin';
const winapi = IS_MAC ? require('./macapi') : require('./winapi');
const { listWindows } = winapi;
const { worldFor, neighbours, assignCats } = require('./layout');
const updater = require('./updater');
const HIDE_SHORTCUT = 'Control+Alt+H'; // Ctrl+Option+H on macOS (Cmd+Option+H is "hide others" there)

let tray, pollTimer, fullscreenTimer, settingsWin;
let hiddenByFullscreen = false;
// one transparent overlay per display; each cat lives on one of them at a time
const overlays = new Map(); // display id -> { win, display, hwnd }
const activeOverlays = new Set(); // displays whose cats are moving (they report it)
let windowsChangedAt = 0;
let lastWindowsKey = '';
let catOwners = new Map();  // cat id -> display id

// --- settings, saved in the user's app data folder ---
const DEFAULTS = {
  cats: [{ id: 'c1', coat: 'orange' }],
  hop: true, sleepOnWindows: true, offscreen: true, taskbar: true, speed: 1, size: 1,
  autoHide: true, hideFromCapture: true,
};
// live state shown in the settings window but never written to settings.json
const TRANSIENT = ['hidden', 'launchAtLogin'];
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { ...DEFAULTS };
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { /* first run */ }
  delete settings.style; // left over from the removed 3D mode
  // first run: follow the system display language
  if (!TRAY_TEXT[settings.lang]) settings.lang = app.getPreferredSystemLanguages()[0]?.startsWith('th') ? 'th' : 'en';
}
function saveSettings() {
  const saved = { ...settings };
  for (const k of TRANSIENT) delete saved[k];
  try { fs.writeFileSync(settingsFile(), JSON.stringify(saved, null, 2)); } catch (e) { console.warn('could not save settings', e); }
}
function broadcastSettings() {
  const live = { ...settings, launchAtLogin: launchesAtLogin() };
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings', live);
  catOwners = assignCats(settings.cats, catOwners, [...overlays.keys()], screen.getPrimaryDisplay().id);
  for (const [id, o] of overlays) sendTo(o.win, 'settings', overlaySettings(id));
}
// an overlay only hears about the cats that live on its display
const overlaySettings = (displayId) => ({ ...settings, cats: settings.cats.filter((c) => catOwners.get(c.id) === displayId) });

function sendTo(win, channel, data) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    try { win.webContents.send(channel, data); } catch { /* frame is being torn down */ }
  }
}
const toAllOverlays = (channel, data) => { for (const o of overlays.values()) sendTo(o.win, channel, data); };

const TRAY_TEXT = {
  th: { settings: 'การตั้งค่า…', hide: 'ซ่อนแมว', recall: 'เรียกแมวกลับมา', nap: 'ให้แมวนอน', quit: 'ออกจาก Moewki',
    updateReady: (v) => `รีสตาร์ตเพื่ออัปเดตเป็น ${v}`, updateAvailable: (v) => `ดาวน์โหลด Moewki ${v}…`,
    notifyReady: (v) => `เวอร์ชัน ${v} พร้อมแล้ว คลิกเพื่อรีสตาร์ตและอัปเดต`, notifyAvailable: (v) => `มี Moewki ${v} แล้ว คลิกเพื่อดาวน์โหลด` },
  en: { settings: 'Settings…', hide: 'Hide cats', recall: 'Call cats back', nap: 'Nap time', quit: 'Quit Moewki',
    updateReady: (v) => `Restart to update to ${v}`, updateAvailable: (v) => `Download Moewki ${v}…`,
    notifyReady: (v) => `Version ${v} is ready. Click to restart and update.`, notifyAvailable: (v) => `Moewki ${v} is out. Click to download.` },
};
function buildTrayMenu() {
  const tx = TRAY_TEXT[settings.lang] ?? TRAY_TEXT.en;
  const up = updater.getState();
  const updateItem = up.status === 'ready' ? [{ label: tx.updateReady(up.version), click: updater.install }, { type: 'separator' }]
    : up.status === 'available' ? [{ label: tx.updateAvailable(up.version), click: updater.install }, { type: 'separator' }] : [];
  tray.setContextMenu(Menu.buildFromTemplate([
    ...updateItem,
    { label: tx.settings, accelerator: IS_MAC ? 'Command+,' : undefined, click: openSettings },
    { type: 'separator' },
    { label: tx.hide, type: 'checkbox', checked: !!settings.hidden, accelerator: HIDE_SHORTCUT, registerAccelerator: false,
      click: (item) => setHidden(item.checked) },
    { label: tx.recall, click: () => toAllOverlays('command', 'recall') },
    { label: tx.nap, click: () => toAllOverlays('command', 'sleep') },
    { type: 'separator' },
    { label: tx.quit, accelerator: IS_MAC ? 'Command+Q' : undefined, click: () => app.quit() },
  ]));
}

// Menu bar on macOS wants a monochrome "template" image; Windows gets the colour icon in every size.
function trayIcon() {
  if (!IS_MAC) return nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'));
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png')); // @2x is picked up automatically
  img.setTemplateImage(true);
  return img;
}

// --- settings window: macOS-style UI on both platforms ---
// macOS keeps its real traffic lights and sidebar vibrancy; Windows gets a frameless window and the
// page draws matching traffic lights itself.
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); return settingsWin.focus(); }
  settingsWin = new BrowserWindow({
    width: 720, height: 480, resizable: false, maximizable: false, fullscreenable: false,
    title: 'Moewki', icon: path.join(__dirname, 'assets', IS_MAC ? 'icon.png' : 'icon.ico'),
    show: false,
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 }, vibrancy: 'sidebar',
          visualEffectState: 'followWindow', backgroundColor: '#00000000' }
      : { frame: false, backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f6f6' }),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'), { query: { platform: IS_MAC ? 'mac' : 'win' } });
  settingsWin.once('ready-to-show', () => settingsWin.show());
  if (IS_MAC) app.dock?.show(); // a window without a Dock icon is easy to lose behind others
  settingsWin.on('closed', () => { if (IS_MAC) app.dock?.hide(); });
}

// --- login item ---
// A packaged app registers itself; during development it is electron.exe plus this folder.
const loginItem = () => (app.isPackaged ? {} : { path: process.execPath, args: [path.resolve(__dirname)] });
const launchesAtLogin = () => app.getLoginItemSettings(loginItem()).openAtLogin;
function setLaunchAtLogin(on) {
  app.setLoginItemSettings({ openAtLogin: on, ...loginItem() });
}

// --- hiding the cats ---
// The overlay is hidden while the user asked for it (tray, shortcut) or while something runs full screen.
function setHidden(on) {
  settings.hidden = on;
  applyVisibility();
  broadcastSettings();
  buildTrayMenu();
}

function applyVisibility() {
  const show = !settings.hidden && !hiddenByFullscreen;
  for (const { win } of overlays.values()) {
    if (win.isDestroyed()) continue;
    if (show && !win.isVisible()) {
      win.showInactive(); // never take focus from what the user is doing
      win.setAlwaysOnTop(true, 'screen-saver');
      sendTo(win, 'overlay:visible', true);
    } else if (!show && win.isVisible()) {
      win.hide();
      sendTo(win, 'overlay:visible', false); // a hidden window would otherwise keep drawing at full speed
    }
  }
}

function fullscreenNow() {
  if (!IS_MAC) return winapi.isFullscreenBusy();
  // macOS: the frontmost app window fills a whole display (a full-screen Space)
  const front = listWindows()[0];
  return !!front && screen.getAllDisplays().some(({ bounds: d }) =>
    front.x <= d.x && front.y <= d.y && front.x + front.w >= d.x + d.width && front.y + front.h >= d.y + d.height);
}

function watchFullscreen() {
  clearInterval(fullscreenTimer);
  fullscreenTimer = setInterval(() => {
    const busy = settings.autoHide && fullscreenNow();
    if (busy !== hiddenByFullscreen) { hiddenByFullscreen = busy; applyVisibility(); }
  }, 500);
}

// macOS: the user's accent colour. Elsewhere the page uses the standard macOS blue.
function accentColor() {
  if (!IS_MAC) return null;
  try { return `#${systemPreferences.getAccentColor().slice(0, 6)}`; } catch { return null; }
}

// --- the overlays the cats live on ---
function createOverlay(display) {
  const b = display.bounds;
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: true,
    enableLargerThanScreen: true, roundedCorners: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setContentProtection(!!settings.hideFromCapture); // keep cats out of screen shares and recordings
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setBounds(b); // creating a window can nudge it (below the macOS menu bar, or across DPI on Windows)
  const query = {};
  if (process.argv.includes('--cat-debug')) query.debug = '1';
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query });
  if (process.argv.includes('--cat-debug')) win.webContents.on('console-message', (e) => console.log(`[${display.id}] ${e.message}`));
  if (process.argv.includes('--devtools')) win.webContents.openDevTools({ mode: 'detach' });
  win.webContents.on('did-finish-load', () => sendTo(win, 'settings', overlaySettings(display.id)));
  // Windows lists every top-level window, so ours are skipped by handle; macOS skips our process instead
  const hwnd = IS_MAC ? null : String(win.getNativeWindowHandle().readBigUInt64LE(0));
  return { win, display, hwnd };
}

// Match the overlays to the connected displays: add, remove, or move them as screens change.
function syncOverlays() {
  const displays = screen.getAllDisplays();
  for (const [id, o] of overlays) {
    if (!displays.some((d) => d.id === id)) { o.win.destroy(); overlays.delete(id); activeOverlays.delete(id); }
  }
  for (const d of displays) {
    const o = overlays.get(d.id);
    if (!o) overlays.set(d.id, createOverlay(d));
    else { o.display = d; o.win.setBounds(d.bounds); }
  }
  applyVisibility();
  broadcastSettings(); // re-home cats from screens that went away
}

// Poll window positions 30 times a second while cats are busy or windows are moving (cats ride along
// on dragged windows), 5 times a second otherwise, and not at all while the cats are hidden.
function schedulePoll() {
  const visible = [...overlays.values()].some((o) => o.win.isVisible());
  const busy = activeOverlays.size > 0 || Date.now() - windowsChangedAt < 1500;
  pollTimer = setTimeout(() => { if (visible) pollWindows(); schedulePoll(); }, !visible ? 500 : busy ? 33 : 200);
}

function pollWindows() {
  const displays = screen.getAllDisplays();
  const exclude = new Set([...overlays.values()].map((o) => o.hwnd).filter(Boolean));
  const windows = listWindows(exclude).map((w) => {
    // Windows reports physical pixels; macOS already reports points (= Electron DIPs)
    const r = IS_MAC ? { x: w.x, y: w.y, width: w.w, height: w.h }
      : screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h });
    return { id: w.id, title: w.title, x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const key = windows.map((w) => `${w.id}:${w.x},${w.y},${w.w},${w.h}`).join('|');
  if (key !== lastWindowsKey) { lastWindowsKey = key; windowsChangedAt = Date.now(); }
  for (const o of overlays.values()) {
    if (o.win.isVisible()) sendTo(o.win, 'world', worldFor(o.display, windows, displays));
  }
}

// A cat walked (or was thrown) off a side of its display that has a neighbour: move it over there.
function transferCat(fromDisplayId, catId, side) {
  const from = overlays.get(fromDisplayId);
  const toId = from && neighbours(from.display, screen.getAllDisplays())[side < 0 ? 'left' : 'right'];
  if (!toId || !overlays.has(toId)) return false;
  catOwners.set(catId, toId);
  // tell the new display first, so it knows which edge the cat comes in from when it appears in its settings
  sendTo(overlays.get(toId).win, 'cat:arrive', { id: catId, from: side < 0 ? 'right' : 'left' });
  for (const id of [fromDisplayId, toId]) sendTo(overlays.get(id).win, 'settings', overlaySettings(id));
  return true;
}

const overlayOf = (sender) => [...overlays.entries()].find(([, o]) => o.win.webContents === sender);

ipcMain.on('set-ignore-mouse', (e, ignore) => {
  overlayOf(e.sender)?.[1].win.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('activity', (e, active) => {
  const entry = overlayOf(e.sender);
  if (entry) active ? activeOverlays.add(entry[0]) : activeOverlays.delete(entry[0]);
});
ipcMain.handle('cat:leave', (e, { id, side }) => {
  const entry = overlayOf(e.sender);
  return !!entry && transferCat(entry[0], id, side);
});
ipcMain.handle('settings:get', (e) => {
  const entry = overlayOf(e.sender);
  return entry ? overlaySettings(entry[0]) : { ...settings, launchAtLogin: launchesAtLogin() };
});
ipcMain.handle('system:accent', accentColor);
ipcMain.on('settings:set', (_e, patch) => {
  if ('launchAtLogin' in patch) setLaunchAtLogin(patch.launchAtLogin);
  if ('hidden' in patch) return setHidden(patch.hidden);
  settings = { ...settings, ...patch };
  saveSettings();
  broadcastSettings();
  if ('lang' in patch) buildTrayMenu();
  if ('hideFromCapture' in patch) for (const o of overlays.values()) o.win.setContentProtection(!!patch.hideFromCapture);
  if ('autoHide' in patch && !patch.autoHide) { hiddenByFullscreen = false; applyVisibility(); }
});
ipcMain.on('command', (_e, c) => toAllOverlays('command', c));
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:get', () => updater.getState());
ipcMain.on('update:check', () => updater.check());
ipcMain.on('update:install', () => updater.install());

// Tell the settings window and tray about update progress; announce a new version once.
let announced = null;
function onUpdateState(state) {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('update', state);
  if (!tray) return;
  buildTrayMenu();
  if ((state.status === 'ready' || state.status === 'available') && announced !== state.version && Notification.isSupported()) {
    announced = state.version;
    const tx = TRAY_TEXT[settings.lang] ?? TRAY_TEXT.en;
    const note = new Notification({ title: 'Moewki', body: state.status === 'ready' ? tx.notifyReady(state.version) : tx.notifyAvailable(state.version) });
    note.on('click', updater.install);
    note.show();
  }
}
// title bar buttons drawn by the settings page on Windows
ipcMain.on('window', (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (action === 'close') w?.close();
  if (action === 'minimize') w?.minimize();
});

// One Moewki at a time: launching it again just opens the settings of the copy that is running.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => openSettings());

if (IS_MAC) app.dock?.hide(); // a menu bar app: no Dock icon while only the cats are showing
if (process.platform === 'win32') app.setAppUserModelId('com.phanumat.moewki'); // needed for notifications

app.whenReady().then(() => {
  loadSettings();
  syncOverlays();
  schedulePoll();
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, syncOverlays);
  tray = new Tray(trayIcon());
  tray.setToolTip('Moewki');
  buildTrayMenu();
  if (!IS_MAC) tray.on('click', openSettings); // on macOS a click opens the menu, as menu bar items do
  systemPreferences.on?.('accent-color-changed', () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('accent', accentColor());
  });
  if (process.argv.includes('--settings')) openSettings();
  watchFullscreen();
  updater.start(onUpdateState);
  const shortcuts = { 'CommandOrControl+Alt+Q': () => app.quit(), [HIDE_SHORTCUT]: () => setHidden(!settings.hidden) };
  for (const [keys, fn] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(keys, fn)) console.warn(`shortcut ${keys} is taken by another app`);
  }
});

// closing the settings window must not quit the app
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => { clearTimeout(pollTimer); clearInterval(fullscreenTimer); });
app.on('will-quit', () => globalShortcut.unregisterAll());
