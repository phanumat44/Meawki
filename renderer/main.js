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

const world = new World();
let settings = {
  cats: [{ id: 'c1', coat: 'orange' }],
  hop: true, sleepOnWindows: true, offscreen: true, taskbar: true, speed: 1, size: 1,
};
const pets = []; // { id, coat, brain, cat }

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
      pet = { id: c.id, brain, cat: new Cat2D(c.coat) };
      pets.push(pet);
    }
    pet.coat = pet.cat.coat = c.coat;
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
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * settings.speed;
  last = now;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const { brain: b, cat } of pets) {
    b.update(dt);
    cat.animator.update(dt, b.animMode, { dir: b.dir, speed: b.animSpeed, vy: b.vy, look: b.look, snappy: b.mode === 'land' });
    if (!b.hidden) cat.draw(ctx, b.x, b.y, SCALE * settings.size);
  }
  if (DEBUG) drawDebug();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

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
