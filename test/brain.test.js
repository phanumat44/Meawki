const test = require('node:test');
const assert = require('node:assert/strict');

// Set up globals required by brain.js in Node.js test environment
globalThis.innerWidth = 1920;
globalThis.innerHeight = 1080;

let World, Brain;

test.before(async () => {
  const mod = await import('../renderer/brain.js');
  World = mod.World;
  Brain = mod.Brain;
});

test('World initializes with default screen floor', () => {
  const world = new World();
  assert.equal(world.width, 1920);
  assert.equal(world.height, 1080);
  assert.equal(world.floor.y, 1032);
  assert.equal(world.segments.length, 1);
  assert.equal(world.segments[0].id, 'floor');
});

test('World computes walkable ledge for a single window', () => {
  const world = new World();
  world.update({
    width: 1920,
    height: 1080,
    floorY: 1032,
    floorX1: 0,
    floorX2: 1920,
    windows: [{ id: 'win1', x: 200, y: 400, w: 600, h: 400 }],
  }, 40);

  const seg = world.segmentAt('win1', 400);
  assert.ok(seg, 'Window ledge should exist at x=400');
  assert.equal(seg.id, 'win1');
  assert.equal(seg.y, 400);
  assert.equal(seg.x1, 212); // x + 12
  assert.equal(seg.x2, 788); // x + w - 12
});

test('Window overlap: top window cuts the ledge of the window behind it', () => {
  const world = new World();
  // win1 is in front (index 0) covering x: 300..500
  // win2 is behind (index 1) spanning x: 200..800 at y: 500
  world.update({
    width: 1920,
    height: 1080,
    floorY: 1032,
    floorX1: 0,
    floorX2: 1920,
    windows: [
      { id: 'win1', x: 300, y: 300, w: 200, h: 300 }, // spans y:300 to 600, covers x: 292..508
      { id: 'win2', x: 200, y: 500, w: 600, h: 400 }, // top edge at y:500
    ],
  }, 40);

  const win2Segs = world.segments.filter((s) => s.id === 'win2');
  // Ledge for win2 should be split into 2 segments (left and right of win1)
  assert.equal(win2Segs.length, 2);
  assert.ok(win2Segs[0].x2 <= 300, 'Left segment should end before win1');
  assert.ok(win2Segs[1].x1 >= 500, 'Right segment should start after win1');
});

test('Windows too high or below floor are ignored', () => {
  const world = new World();
  world.update({
    width: 1920,
    height: 1080,
    floorY: 1032,
    floorX1: 0,
    floorX2: 1920,
    windows: [
      { id: 'tooHigh', x: 100, y: 20, w: 500, h: 400 }, // y < catHeight (40)
      { id: 'tooLow', x: 100, y: 1020, w: 500, h: 200 }, // y > floorY - 40
    ],
  }, 40);

  const nonFloor = world.segments.filter((s) => s.id !== 'floor');
  assert.equal(nonFloor.length, 0);
});

test('Brain posture and mode mappings', () => {
  const world = new World();
  const brain = new Brain(world, () => {}, { w: 60, h: 40 });

  assert.equal(brain.mode, 'fall');
  assert.equal(brain.posture, 'stand');

  brain.mode = 'sit';
  assert.equal(brain.posture, 'sit');

  brain.mode = 'sleep';
  assert.equal(brain.posture, 'lie');

  brain.mode = 'groom';
  assert.equal(brain.posture, 'sit');
});

test('Brain grab, hold, and release physics', () => {
  const world = new World();
  const brain = new Brain(world, () => {}, { w: 60, h: 40 });

  brain.grab();
  assert.equal(brain.mode, 'held');
  assert.equal(brain.surf, null);

  brain.hold(300, 200);
  assert.equal(brain.x, 300);
  assert.equal(brain.y, 200);

  brain.release(400, -200);
  assert.equal(brain.mode, 'fall');
  assert.equal(brain.vx, 400);
  assert.equal(brain.vy, -200);
  assert.equal(brain.dir, 1);
});

test('Brain recall resets cat position to top center', () => {
  const world = new World();
  const brain = new Brain(world, () => {}, { w: 60, h: 40 });
  brain.x = 100;
  brain.y = 800;

  brain.recall();
  assert.equal(brain.mode, 'fall');
  assert.equal(brain.x, 1920 / 2);
  assert.equal(brain.y, -60);
});

test('Brain hitTest accurately detects clicks on the cat', () => {
  const world = new World();
  const brain = new Brain(world, () => {}, { w: 60, h: 40 });
  brain.x = 500;
  brain.y = 500;

  assert.equal(brain.hitTest(500, 480), true);
  assert.equal(brain.hitTest(700, 480), false); // too far horizontally
  assert.equal(brain.hitTest(500, 300), false); // too far above

  brain.hidden = true;
  assert.equal(brain.hitTest(500, 480), false, 'Hidden cat cannot be clicked');
});

test('Brain enterFrom positions cat at specified display border', () => {
  const world = new World();
  const brain = new Brain(world, () => {}, { w: 60, h: 40 });

  brain.enterFrom('left');
  assert.equal(brain.x, -60);
  assert.equal(brain.dir, 1);
  assert.equal(brain.surf, 'floor');

  brain.enterFrom('right');
  assert.equal(brain.x, 1920 + 60);
  assert.equal(brain.dir, -1);
  assert.equal(brain.surf, 'floor');
});
