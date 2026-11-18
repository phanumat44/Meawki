// Updates from the GitHub Releases of phanumat44/Meawki.
// Windows: a new version downloads in the background; the user restarts into it, or it installs on quit.
// macOS: installing updates needs a signed app, so there we only point the user at the download.
const { app, shell } = require('electron');

const RELEASES_URL = 'https://github.com/phanumat44/Meawki/releases/latest';
const CHECK_EVERY = 6 * 60 * 60 * 1000;
const IS_MAC = process.platform === 'darwin';

// status: dev | idle | checking | latest | downloading | ready | available (macOS) | error
let state = { status: app.isPackaged ? 'idle' : 'dev', version: null, progress: 0 };
let listener = () => {};
let updater = null;

function set(patch) {
  state = { ...state, ...patch };
  listener(state);
}

function start(onChange) {
  listener = onChange;
  if (!app.isPackaged) return; // `npm start` has nothing to update
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = !IS_MAC;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => set({ status: 'checking' }));
  updater.on('update-not-available', () => set({ status: 'latest' }));
  updater.on('update-available', (info) => set({ status: IS_MAC ? 'available' : 'downloading', version: info.version, progress: 0 }));
  updater.on('download-progress', (p) => set({ status: 'downloading', progress: Math.round(p.percent) }));
  updater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }));
  updater.on('error', () => set({ status: 'error' }));
  check();
  setInterval(check, CHECK_EVERY);
}

function check() {
  if (!updater || ['checking', 'downloading', 'ready'].includes(state.status)) return;
  updater.checkForUpdates().catch(() => set({ status: 'error' }));
}

// Restart into the downloaded version, or (macOS) open the release page.
function install() {
  if (state.status === 'ready') updater.quitAndInstall(true, true); // silent installer, relaunch afterwards
  else if (state.status === 'available') shell.openExternal(RELEASES_URL);
}

module.exports = { start, check, install, getState: () => state };
