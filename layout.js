// Laying cats and windows out across several displays. Pure functions on Electron-style display
// objects ({ id, bounds, workArea } in DIPs), so they can be unit-tested without Electron.

// Displays in a mixed-DPI setup don't always line up to the exact pixel in DIP space.
const EDGE_SLACK = 2;

// The displays directly left and right of `d`: their edges touch ours and they overlap vertically.
function neighbours(d, displays) {
  const b = d.bounds;
  const touches = (o, side) => {
    const ob = o.bounds;
    const gap = side < 0 ? b.x - (ob.x + ob.width) : ob.x - (b.x + b.width);
    const overlap = Math.min(b.y + b.height, ob.y + ob.height) - Math.max(b.y, ob.y);
    return o.id !== d.id && Math.abs(gap) <= EDGE_SLACK && overlap > 0;
  };
  return {
    left: displays.find((o) => touches(o, -1))?.id ?? null,
    right: displays.find((o) => touches(o, 1))?.id ?? null,
  };
}

// Windows (global DIP rects, front to back) that reach into display `d`, moved to its local coordinates.
// A window hanging down from the display above keeps its negative top, so it is not a ledge here.
function windowsOn(d, windows) {
  const b = d.bounds;
  return windows
    .filter((w) => w.x < b.x + b.width && w.x + w.w > b.x && w.y < b.y + b.height && w.y + w.h > b.y)
    .map((w) => ({ ...w, x: w.x - b.x, y: w.y - b.y }));
}

// Everything one display's overlay needs for a frame. The floor is the top of the taskbar or Dock,
// or the bottom edge on displays that have neither.
function worldFor(d, windows, displays) {
  const b = d.bounds, wa = d.workArea;
  const n = neighbours(d, displays);
  return {
    width: b.width, height: b.height,
    floorY: wa.y + wa.height - b.y, floorX1: wa.x - b.x, floorX2: wa.x + wa.width - b.x,
    windows: windowsOn(d, windows),
    neighbours: { left: n.left !== null, right: n.right !== null },
  };
}

// Which display each cat lives on: a cat keeps its display while that display exists; new cats and
// cats whose display was unplugged go to `fallbackId` (the primary display).
function assignCats(cats, owners, displayIds, fallbackId) {
  const out = new Map();
  for (const c of cats) {
    const current = owners.get(c.id);
    out.set(c.id, displayIds.includes(current) ? current : fallbackId);
  }
  return out;
}

module.exports = { neighbours, windowsOn, worldFor, assignCats };
