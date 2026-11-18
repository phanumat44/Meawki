const test = require('node:test');
const assert = require('node:assert/strict');
const { neighbours, windowsOn, worldFor, assignCats } = require('../layout');

const display = (id, x, y, width, height, taskbar = 0) => ({
  id, bounds: { x, y, width, height }, workArea: { x, y, width, height: height - taskbar },
});

// laptop (primary, 100%) with a 4K monitor at 200% to its right: 1920x1080 DIPs, top-aligned
const laptop = display(1, 0, 0, 1920, 1080, 48);
const fourK = display(2, 1920, 0, 1920, 1080);
// a third screen stacked above the laptop: not a left/right neighbour of anything
const above = display(3, 0, -1080, 1920, 1080);

test('side-by-side displays are neighbours of each other', () => {
  assert.deepEqual(neighbours(laptop, [laptop, fourK, above]), { left: null, right: 2 });
  assert.deepEqual(neighbours(fourK, [laptop, fourK, above]), { left: 1, right: null });
});

test('stacked displays are not left/right neighbours', () => {
  assert.deepEqual(neighbours(above, [laptop, fourK, above]), { left: null, right: null });
});

test('mixed-DPI edges a pixel apart still count as touching', () => {
  const offByOne = display(4, 1921, 200, 1280, 720);
  assert.equal(neighbours(laptop, [laptop, offByOne]).right, 4);
  const farAway = display(5, 1940, 0, 1280, 720);
  assert.equal(neighbours(laptop, [laptop, farAway]).right, null);
});

test('displays that touch but do not overlap vertically are not neighbours', () => {
  const diagonal = display(6, 1920, 1080, 1920, 1080);
  assert.equal(neighbours(laptop, [laptop, diagonal]).right, null);
});

test('windows are given to every display they reach into, in local coordinates', () => {
  const spanning = { id: 'a', x: 1700, y: 300, w: 500, h: 400 };
  const onLaptop = { id: 'b', x: 100, y: 200, w: 600, h: 500 };
  assert.deepEqual(windowsOn(laptop, [spanning, onLaptop]).map((w) => [w.id, w.x, w.y]), [['a', 1700, 300], ['b', 100, 200]]);
  assert.deepEqual(windowsOn(fourK, [spanning, onLaptop]).map((w) => [w.id, w.x, w.y]), [['a', -220, 300]]);
});

test('a window hanging down from the display above keeps a negative top', () => {
  const hanging = { id: 'c', x: 200, y: -300, w: 800, h: 600 };
  assert.equal(windowsOn(laptop, [hanging])[0].y, -300);
});

test('worldFor puts the floor on the taskbar where there is one, else at the bottom edge', () => {
  const w1 = worldFor(laptop, [], [laptop, fourK]);
  assert.equal(w1.floorY, 1032);
  assert.deepEqual(w1.neighbours, { left: false, right: true });
  const w2 = worldFor(fourK, [], [laptop, fourK]);
  assert.equal(w2.floorY, 1080);
  assert.equal(w2.floorX1, 0);
  assert.deepEqual(w2.neighbours, { left: true, right: false });
});

test('cats keep their display; new and orphaned cats go to the fallback', () => {
  const owners = new Map([['a', 2], ['b', 9]]);
  const out = assignCats([{ id: 'a' }, { id: 'b' }, { id: 'c' }], owners, [1, 2], 1);
  assert.deepEqual([...out], [['a', 2], ['b', 1], ['c', 1]]);
});
