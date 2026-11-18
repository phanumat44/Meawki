import { Cat2D } from './cat2d.js';
import { World, Brain } from './brain.js';

const SCALE = 0.8;
const DEBUG = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('cats');
const ctx = canvas.getContext('2d');
const dbg = document.getElementById('debug');
const dctx = dbg.getContext('2d');
function resize() {
  for (const c of [canvas, dbg]) { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; }
}
addEventListener('resize', resize);
resize();

// little floating effects (Z's, hearts, speech bubbles)
const fxLayer = document.getElementById('fx');
function fx(text, pos, cls) {
  const el = document.createElement('div');
  el.className = `fx ${cls}`;
  el.textContent = text;
  el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`;
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

// sound effects synthesized via ElevenLabs
const AUDIO = {
  meow1: new Audio('../assets/sounds/meow1.mp3'),
  meow2: new Audio('../assets/sounds/meow2.mp3'),
  purr: new Audio('../assets/sounds/purr.mp3'),
  hiss: new Audio('../assets/sounds/hiss.mp3'),
  pounce: new Audio('../assets/sounds/pounce.mp3'),
};

function playSound(name) {
  if (settings.sound === false) return;
  const soundName = name === 'meow' ? (Math.random() < 0.5 ? 'meow1' : 'meow2') : name;
  const audio = AUDIO[soundName];
  if (!audio) return;
  try {
    const clone = audio.cloneNode();
    clone.volume = Math.max(0, Math.min(1, settings.volume ?? 0.8));
    clone.play().catch(() => {});
  } catch {}
}

const world = new World();
let settings = {
  cats: [{ id: 'c1', name: 'ส้มจี๊ด', coat: 'orange', personality: 'normal' }],
  hop: true, sleepOnWindows: true, offscreen: true, taskbar: true, speed: 1, size: 1,
  sound: true, volume: 0.8, timeOfDay: true,
};
const pets = []; // { id, coat, brain, cat }
const arrivals = new Map(); // cat id -> edge it walks in from, for cats coming from another display

function catSize() {
  return { w: 110 * SCALE * settings.size, h: 62 * SCALE * settings.size };
}

// Bring the live cats in line with settings.cats (add, remove, recolour).
function syncPets() {
  const wanted = new Set(settings.cats.map((c) => c.id));
  for (let i = pets.length - 1; i >= 0; i--) if (!wanted.has(pets[i].id)) pets.splice(i, 1);
  for (const c of settings.cats) {
    let pet = pets.find((p) => p.id === c.id);
    if (!pet) {
      const brain = new Brain(world, fx, catSize());
      brain.x = world.width * (0.2 + Math.random() * 0.6);
      brain.debug = DEBUG;
      brain.onLeave = (side) => window.moewki.leaveCat(c.id, side);
      if (arrivals.has(c.id)) { brain.enterFrom(arrivals.get(c.id)); arrivals.delete(c.id); }
      pet = { id: c.id, brain, cat: new Cat2D(c.coat) };
      pets.push(pet);
    }
    pet.coat = pet.cat.coat = c.coat;
    pet.brain.name = c.name || '';
    pet.brain.personality = c.personality || 'normal';
    pet.brain.sound = playSound;
    pet.brain.prefs = settings;
    pet.brain.size = catSize();
  }
  world.pets = pets.map((p) => p.brain);
  if (DEBUG) {
    const p = pets[0];
    window.__moewki = { brain: p?.brain, anim: p?.cat.animator, pets, world, snap: () => canvas.toDataURL() };
  }
}

window.moewki.onWorld((data) => world.update(data, catSize().h));
window.moewki.onSettings((s) => { settings = { ...settings, ...s }; syncPets(); });
window.moewki.onCatArrive((a) => arrivals.set(a.id, a.from));
window.moewki.onCommand((c) => {
  for (const p of pets) c === 'recall' ? p.brain.recall() : c === 'sleep' && p.brain.nap();
});
window.moewki.getSettings().then((s) => { if (s) settings = { ...settings, ...s }; syncPets(); });

// --- mouse: the overlay is click-through except while the pointer is over a cat ---
let capturing = false, drag = null;
function setCapture(on) {
  if (on === capturing) return;
  capturing = on;
  window.moewki.setIgnoreMouse(!on);
}
const petAt = (x, y) => [...pets].reverse().find((p) => p.brain.hitTest(x, y));
addEventListener('mousemove', (e) => {
  // the overlay gets forwarded moves even while click-through: cats can watch and hunt the cursor
  if (!drag) world.mouse = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (drag) {
    const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
    drag.vx = drag.vx * 0.6 + ((e.clientX - drag.lx) / dt) * 0.4;
    drag.vy = drag.vy * 0.6 + ((e.clientY - drag.ly) / dt) * 0.4;
    drag.lx = e.clientX; drag.ly = e.clientY; drag.t = now;
    const b = drag.pet.brain;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; b.grab(); }
    if (drag.moved) b.hold(e.clientX, e.clientY + b.size.h * 0.75);
    return;
  }
  setCapture(!!petAt(e.clientX, e.clientY));
});
addEventListener('mousedown', (e) => {
  const pet = capturing && e.button === 0 && petAt(e.clientX, e.clientY);
  if (!pet) return;
  drag = { pet, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), vx: 0, vy: 0, moved: false };
});
addEventListener('mouseup', () => {
  if (!drag) return;
  if (drag.moved) drag.pet.brain.release(drag.vx, drag.vy); else drag.pet.brain.pet();
  drag = null;
});

// --- loop ---
// Every drawn frame means re-compositing a full-screen transparent window, which is most of Moewki's
// CPU use. So draw only as often as the cats need: every frame for fast motion, 30 fps while they walk
// and fidget, 10 fps while all of them rest, and barely at all when none is on this screen.
const FAST = new Set(['jump', 'fall', 'held', 'crouch', 'land']);
const CALM = new Set(['sleep', 'sit', 'tuck', 'away']);
function frameGap() {
  const shown = pets.filter((p) => !p.brain.hidden);
  if (!shown.length) return 500;
  if (drag || shown.some((p) => FAST.has(p.brain.mode) || (p.brain.mode === 'walkTo' && p.brain.speed > 120))) return 0;
  const cursorMoving = performance.now() - (world.mouse?.t ?? 0) < 2000; // cats watch it
  return !cursorMoving && shown.every((p) => CALM.has(p.brain.mode)) ? 100 : 33;
}

// only the areas around cats are cleared, not the whole screen
const catBox = (b) => [b.x - b.size.w * 1.1, b.y - b.size.h * 1.9, b.size.w * 2.2, b.size.h * 2.4];
let drawn = [];
let last = performance.now();
let reportedActive = null;
let paused = false, looping = true;
function frame(now) {
  if (paused) { looping = false; return; } // the window is hidden: stop until it is shown again
  requestAnimationFrame(frame);
  const gap = frameGap();
  if (now - last < gap - 4) return; // a little slack for vsync jitter
  let dt = Math.min(0.5, (now - last) / 1000) * settings.speed;
  last = now;
  // fixed small steps keep physics and timers the same at any frame rate
  while (dt > 0) {
    const step = Math.min(0.05, dt);
    dt -= step;
    for (const { brain: b, cat } of pets) {
      b.update(step);
      cat.animator.update(step, b.animMode, { dir: b.dir, speed: b.animSpeed, vy: b.vy, look: b.look, snappy: b.mode === 'land' });
    }
  }
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  for (const r of drawn) ctx.clearRect(...r);
  drawn = [];
  for (const { brain: b, cat } of pets) {
    if (b.hidden) continue;
    cat.draw(ctx, b.x, b.y, SCALE * settings.size);
    drawn.push(catBox(b));
  }
  if (DEBUG) drawDebug();
  // main polls window positions fast only while some display has busy cats
  const active = gap <= 33;
  if (active !== reportedActive) { reportedActive = active; window.moewki.setActivity(active); }
}
requestAnimationFrame(frame);
// while hidden the cats are frozen, and pick up where they were when shown again
window.moewki.onVisible((visible) => {
  paused = !visible;
  if (visible && !looping) { looping = true; last = performance.now(); requestAnimationFrame(frame); }
});

function drawDebug() {
  dctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  dctx.clearRect(0, 0, innerWidth, innerHeight);
  dctx.lineWidth = 3;
  const surfs = new Set(pets.map((p) => p.brain.surf));
  for (const s of world.segments) {
    dctx.strokeStyle = surfs.has(s.id) ? '#ff3b6b' : '#2ecc71';
    dctx.beginPath(); dctx.moveTo(s.x1, s.y); dctx.lineTo(s.x2, s.y); dctx.stroke();
  }
  dctx.font = '13px Segoe UI';
  pets.forEach(({ brain: b, coat }, i) => {
    dctx.fillStyle = '#000a';
    dctx.fillRect(8, 8 + i * 24, 300, 22);
    dctx.fillStyle = '#fff';
    dctx.fillText(`${coat}: ${b.mode}  surf=${b.surf ?? '-'}  x=${b.x | 0} y=${b.y | 0}`, 14, 24 + i * 24);
  });
}
