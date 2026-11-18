// Win32 window enumeration via koffi (no native build step needed).
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');
const shell32 = koffi.load('shell32.dll');

const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(void *hwnd, intptr_t lParam)');
const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hwnd)');
const IsIconic = user32.func('bool __stdcall IsIconic(void *hwnd)');
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void *hwnd, _Out_ uint8_t *buf, int max)');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *hwnd, _Out_ uint8_t *buf, int max)');
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)');
const DwmGetWindowAttribute = dwmapi.func('long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, _Out_ uint8_t *pv, uint32_t cb)');
const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
const IsZoomed = user32.func('bool __stdcall IsZoomed(void *hwnd)');
const MonitorFromWindow = user32.func('void * __stdcall MonitorFromWindow(void *hwnd, uint32_t flags)');
const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const MONITORINFO = koffi.struct('MONITORINFO', { cbSize: 'uint32_t', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32_t' });
const GetMonitorInfoW = user32.func('bool __stdcall GetMonitorInfoW(void *monitor, _Inout_ MONITORINFO *info)');
const SHQueryUserNotificationState = shell32.func('long __stdcall SHQueryUserNotificationState(_Out_ int *state)');

const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x80;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;

const IGNORED_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);

const textBuf = Buffer.alloc(512);
const rectBuf = Buffer.alloc(16);
const cloakBuf = Buffer.alloc(4);

function readWStr(fn, hwnd) {
  const n = fn(hwnd, textBuf, 256);
  return n > 0 ? textBuf.toString('utf16le', 0, n * 2) : '';
}

// Returns visible top-level app windows in z-order (topmost first), rects in physical pixels.
function listWindows(excludeIds = new Set()) {
  const out = [];
  EnumWindows((hwnd) => {
    try {
      const id = String(koffi.address(hwnd));
      if (excludeIds.has(id)) return true;
      if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
      const ex = Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
      if (ex & WS_EX_TOOLWINDOW) return true;
      if (DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, cloakBuf, 4) === 0 && cloakBuf.readUInt32LE(0) !== 0) return true;
      const cls = readWStr(GetClassNameW, hwnd);
      if (IGNORED_CLASSES.has(cls)) return true;
      const title = readWStr(GetWindowTextW, hwnd);
      if (!title) return true;
      if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, rectBuf, 16) !== 0) return true;
      const left = rectBuf.readInt32LE(0), top = rectBuf.readInt32LE(4);
      const right = rectBuf.readInt32LE(8), bottom = rectBuf.readInt32LE(12);
      if (right - left < 120 || bottom - top < 60) return true;
      out.push({ id, title, cls, x: left, y: top, w: right - left, h: bottom - top });
    } catch (e) { /* skip odd windows */ }
    return true;
  }, 0);
  return out;
}

// QUNS_RUNNING_D3D_FULL_SCREEN (game) and QUNS_PRESENTATION_MODE. Not QUNS_BUSY (2): Windows reports
// that for our own topmost full-screen overlay, so hiding on it made the cats blink on and off.
const BUSY_STATES = new Set([3, 4]);
const MONITOR_DEFAULTTONEAREST = 2;

// True while something full screen is in front: a game, a presentation, or a window (video, F11 browser)
// that covers its whole monitor without being merely maximized.
function isFullscreenBusy() {
  const state = [0];
  if (SHQueryUserNotificationState(state) === 0 && BUSY_STATES.has(state[0])) return true;
  const fg = GetForegroundWindow();
  if (!fg || IsZoomed(fg) || IGNORED_CLASSES.has(readWStr(GetClassNameW, fg))) return false;
  if (DwmGetWindowAttribute(fg, DWMWA_EXTENDED_FRAME_BOUNDS, rectBuf, 16) !== 0) return false;
  const info = { cbSize: koffi.sizeof(MONITORINFO) };
  if (!GetMonitorInfoW(MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST), info)) return false;
  const m = info.rcMonitor;
  return rectBuf.readInt32LE(0) <= m.left && rectBuf.readInt32LE(4) <= m.top
    && rectBuf.readInt32LE(8) >= m.right && rectBuf.readInt32LE(12) >= m.bottom;
}

module.exports = { listWindows, isFullscreenBusy };
