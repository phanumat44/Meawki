// Win32 window enumeration via koffi (no native build step needed).
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(void *hwnd, intptr_t lParam)');
const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hwnd)');
const IsIconic = user32.func('bool __stdcall IsIconic(void *hwnd)');
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void *hwnd, _Out_ uint8_t *buf, int max)');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *hwnd, _Out_ uint8_t *buf, int max)');
const GetWindowLongPtrW = user32.func('intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)');
const DwmGetWindowAttribute = dwmapi.func('long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, _Out_ uint8_t *pv, uint32_t cb)');

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

module.exports = { listWindows };
