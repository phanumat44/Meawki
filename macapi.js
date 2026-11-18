// macOS window enumeration via CoreGraphics (CGWindowListCopyWindowInfo) and koffi.
// Same output shape as winapi.js. Bounds are in points with a top-left origin, which already
// matches Electron's screen coordinates, so no DPI conversion is needed.
// Window bounds need no permission; window titles do (Screen Recording), so we fall back to the app name.
const koffi = require('koffi');

const CF = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
const CG = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');

const CGRect = koffi.struct('CGRect', { x: 'double', y: 'double', w: 'double', h: 'double' });
const CGWindowListCopyWindowInfo = CG.func('void *CGWindowListCopyWindowInfo(uint32_t option, uint32_t relativeToWindow)');
const CGRectMakeWithDictionaryRepresentation = CG.func('bool CGRectMakeWithDictionaryRepresentation(void *dict, _Out_ CGRect *rect)');
const CFArrayGetCount = CF.func('long CFArrayGetCount(void *array)');
const CFArrayGetValueAtIndex = CF.func('void *CFArrayGetValueAtIndex(void *array, long index)');
const CFDictionaryGetValue = CF.func('void *CFDictionaryGetValue(void *dict, void *key)');
const CFNumberGetValue = CF.func('bool CFNumberGetValue(void *number, long type, _Out_ double *value)');
const CFStringCreateWithCString = CF.func('void *CFStringCreateWithCString(void *alloc, const char *str, uint32_t encoding)');
const CFStringGetCString = CF.func('bool CFStringGetCString(void *str, _Out_ uint8_t *buffer, long size, uint32_t encoding)');
const CFRelease = CF.func('void CFRelease(void *cf)');

const kCFStringEncodingUTF8 = 0x08000100;
const kCFNumberDoubleType = 13;
const kCGWindowListOptionOnScreenOnly = 1 << 0;
const kCGWindowListExcludeDesktopElements = 1 << 4;

// The kCGWindow* key constants are CFStrings whose contents equal their names, and
// CFDictionary compares keys by value, so our own CFStrings work as lookup keys.
const KEY = Object.fromEntries(['kCGWindowBounds', 'kCGWindowLayer', 'kCGWindowOwnerPID', 'kCGWindowNumber',
  'kCGWindowAlpha', 'kCGWindowOwnerName', 'kCGWindowName']
  .map((k) => [k, CFStringCreateWithCString(null, k, kCFStringEncodingUTF8)]));

const textBuf = Buffer.alloc(1024);
function str(dict, key) {
  const s = CFDictionaryGetValue(dict, KEY[key]);
  if (!s || !CFStringGetCString(s, textBuf, textBuf.length, kCFStringEncodingUTF8)) return '';
  return textBuf.toString('utf8', 0, textBuf.indexOf(0));
}
function num(dict, key) {
  const n = CFDictionaryGetValue(dict, KEY[key]);
  const out = [0];
  return n && CFNumberGetValue(n, kCFNumberDoubleType, out) ? out[0] : NaN;
}

// Visible normal app windows in z-order (frontmost first). Our own windows are skipped by process id.
function listWindows() {
  const out = [];
  const list = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, 0);
  if (!list) return out;
  try {
    for (let i = 0, n = CFArrayGetCount(list); i < n; i++) {
      const w = CFArrayGetValueAtIndex(list, i);
      if (num(w, 'kCGWindowLayer') !== 0) continue; // menu bar, Dock, panels...
      if (num(w, 'kCGWindowOwnerPID') === process.pid) continue;
      if (num(w, 'kCGWindowAlpha') === 0) continue;
      const rect = {};
      if (!CGRectMakeWithDictionaryRepresentation(CFDictionaryGetValue(w, KEY.kCGWindowBounds), rect)) continue;
      if (rect.w < 120 || rect.h < 60) continue;
      out.push({
        id: String(num(w, 'kCGWindowNumber')),
        title: str(w, 'kCGWindowName') || str(w, 'kCGWindowOwnerName'),
        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      });
    }
  } finally {
    CFRelease(list);
  }
  return out;
}

module.exports = { listWindows };
