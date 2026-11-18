const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut, nativeTheme, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');

const IS_MAC = process.platform === 'darwin';
const { listWindows } = IS_MAC ? require('./macapi') : require('./winapi');

let overlay, tray, pollTimer, settingsWin;

// --- settings, saved in the user's app data folder ---
const DEFAULTS = {
  cats: [{ id: 'c1', coat: 'orange' }],
  hop: true, sleepOnWindows: true, offscreen: true, taskbar: true, speed: 1, size: 1,
};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { ...DEFAULTS };
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { /* first run */ }
  delete settings.style; // left over from the removed 3D mode
  // first run: follow the system display language
  if (!TRAY_TEXT[settings.lang]) settings.lang = app.getPreferredSystemLanguages()[0]?.startsWith('th') ? 'th' : 'en';
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { console.warn('could not save settings', e); }
}
function broadcastSettings() {
  for (const w of [overlay, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('settings', settings);
}

const TRAY_TEXT = {
  th: { settings: 'การตั้งค่า…', recall: 'เรียกแมวกลับมา', nap: 'ให้แมวนอน', quit: 'ออกจาก Moewki' },
  en: { settings: 'Settings…', recall: 'Call cats back', nap: 'Nap time', quit: 'Quit Moewki' },
};
function buildTrayMenu() {
  const tx = TRAY_TEXT[settings.lang] ?? TRAY_TEXT.en;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tx.settings, accelerator: IS_MAC ? 'Command+,' : undefined, click: openSettings },
    { type: 'separator' },
    { label: tx.recall, click: () => overlay.webContents.send('command', 'recall') },
    { label: tx.nap, click: () => overlay.webContents.send('command', 'sleep') },
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

// macOS: the user's accent colour. Elsewhere the page uses the standard macOS blue.
function accentColor() {
  if (!IS_MAC) return null;
  try { return `#${systemPreferences.getAccentColor().slice(0, 6)}`; } catch { return null; }
}

// --- the overlay the cats live on ---
function overlayBounds() {
  return screen.getPrimaryDisplay().bounds;
}

function createOverlay() {
  const b = overlayBounds();
  overlay = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: true,
    enableLargerThanScreen: true, roundedCorners: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  if (IS_MAC) {
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.setBounds(b); // macOS may nudge a window below the menu bar on creation
  }
  const query = {};
  if (process.argv.includes('--cat-debug')) query.debug = '1';
  overlay.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query });
  if (process.argv.includes('--cat-debug')) {
    overlay.webContents.on('console-message', (e) => console.log(e.message));
  }
  if (process.argv.includes('--devtools')) overlay.webContents.openDevTools({ mode: 'detach' });

  // Windows lists every top-level window, so skip ours by handle; macOS skips our process instead.
  const exclude = new Set(IS_MAC ? [] : [String(overlay.getNativeWindowHandle().readBigUInt64LE(0))]);
  overlay.webContents.on('did-finish-load', () => {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => sendWorld(exclude), 33);
  });
  overlay.on('close', () => clearInterval(pollTimer));
}

function sendWorld(exclude) {
  if (!overlay || overlay.isDestroyed() || overlay.webContents.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const b = display.bounds;
  const windows = listWindows(exclude).map((w) => {
    // Windows reports physical pixels; macOS already reports points (= Electron DIPs)
    const r = IS_MAC ? { x: w.x, y: w.y, width: w.w, height: w.h }
      : screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h });
    return { id: w.id, title: w.title, x: r.x - b.x, y: r.y - b.y, w: r.width, h: r.height };
  });
  // the floor is the top of the taskbar (Windows) or of the Dock (macOS)
  const wa = display.workArea;
  try { overlay.webContents.send('world', {
    width: b.width, height: b.height,
    floorY: wa.y + wa.height - b.y, floorX1: wa.x - b.x, floorX2: wa.x + wa.width - b.x,
    windows,
  }); } catch { /* frame is being torn down on quit */ }
}

ipcMain.on('set-ignore-mouse', (_e, ignore) => {
  if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('system:accent', accentColor);
ipcMain.on('settings:set', (_e, patch) => {
  settings = { ...settings, ...patch };
  saveSettings();
  broadcastSettings();
  if ('lang' in patch) buildTrayMenu();
});
ipcMain.on('command', (_e, c) => overlay?.webContents.send('command', c));
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

app.whenReady().then(() => {
  loadSettings();
  createOverlay();
  tray = new Tray(trayIcon());
  tray.setToolTip('Moewki');
  buildTrayMenu();
  if (!IS_MAC) tray.on('click', openSettings); // on macOS a click opens the menu, as menu bar items do
  systemPreferences.on?.('accent-color-changed', () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('accent', accentColor());
  });
  if (process.argv.includes('--settings')) openSettings();
  globalShortcut.register('CommandOrControl+Alt+Q', () => app.quit());
  screen.on('display-metrics-changed', () => overlay.setBounds(overlayBounds()));
});

// closing the settings window must not quit the app
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => clearInterval(pollTimer));
app.on('will-quit', () => globalShortcut.unregisterAll());
