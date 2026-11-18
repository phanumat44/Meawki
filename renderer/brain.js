// Behaviour: turns the list of desktop windows into walkable ledges and drives the cat around them.
const GRAVITY = 2600;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function pick(options) {
  const total = options.reduce((s, o) => s + o[1], 0);
  let r = Math.random() * total;
  for (const o of options) if ((r -= o[1]) <= 0) return o[0];
  return options[options.length - 1][0];
}

export class World {
  constructor() {
    this.width = innerWidth; this.height = innerHeight;
    this.floor = { id: 'floor', y: innerHeight - 48, x1: 0, x2: innerWidth };
    this.windows = new Map();
    this.segments = [this.floor];
  }

  update(data, catHeight) {
    this.width = data.width; this.height = data.height;
    this.neighbours = data.neighbours ?? { left: false, right: false }; // other displays beside this one
    this.floor = { id: 'floor', y: data.floorY, x1: data.floorX1, x2: data.floorX2 };
    const prev = this.windows;
    this.windows = new Map();
    const now = performance.now();
    for (const w of data.windows) {
      const p = prev.get(w.id);
      const dt = p ? (now - p.t) / 1000 : 0;
      w.t = now;
      w.vx = p && dt > 0 ? (w.x - p.x) / dt : 0;
      w.vy = p && dt > 0 ? (w.y - p.y) / dt : 0;
      this.windows.set(w.id, w);
    }
    // A window's top edge is walkable where no window above it (earlier in z-order) covers it.
    const segs = [];
    const list = data.windows;
    list.forEach((w, i) => {
      if (w.y < catHeight || w.y > data.floorY - 40) return;
      let spans = [[Math.max(w.x + 12, 0), Math.min(w.x + w.w - 12, data.width)]];
      for (let j = 0; j < i; j++) {
        const o = list[j];
        if (o.y > w.y + 1 || o.y + o.h < w.y - 4) continue;
        const a = o.x - 8, b = o.x + o.w + 8;
        spans = spans.flatMap(([s, e]) => (b <= s || a >= e) ? [[s, e]] : [[s, a], [b, e]].filter(([x, y]) => y - x > 0));
      }
      for (const [x1, x2] of spans) if (x2 - x1 > 60) segs.push({ id: w.id, y: w.y, x1, x2 });
    });
    segs.push(this.floor);
    this.segments = segs;
  }

  segmentAt(id, x) {
    return this.segments.find((s) => s.id === id && x >= s.x1 - 2 && x <= s.x2 + 2);
  }

  surfaceY(id) {
    return id === 'floor' ? this.floor.y : this.windows.get(id)?.y;
  }
}

// How the cat's body is resting in each mode. Anything that moves needs 'stand' first.
const POSTURE = { sit: 'sit', groom: 'sit', yawn: 'sit', tuck: 'sit', sleep: 'lie', waking: 'lie' };
const BUSY = new Set(['jump', 'crouch', 'fall', 'held', 'away']);
// timed modes that simply end and move on to whatever is queued (or a fresh decision)
const TIMED = new Set(['idle', 'sit', 'lookdown', 'sniff', 'stretch', 'alert', 'pet', 'standup', 'turn',
  'groom', 'yawn', 'tuck', 'knead', 'arch', 'boop']);

export class Brain {
  constructor(world, fx, size) {
    this.world = world;
    this.fx = fx;
    this.size = size; // { w, h } of the cat on screen
    this.sound = null;
    this.personality = 'normal'; // 'normal' | 'lazy' | 'hyper' | 'timid'
    this.name = '';
    this.x = world.width * 0.5; this.y = -80;
    this.vx = 0; this.vy = 0;
    this.dir = 1;
    this.mode = 'fall';
    this.timer = 0;
    this.surf = null;        // id of the ledge we stand on
    this.surfX = 0;          // last known x of that window, to ride along when it moves
    this.speed = 0;
    this.goalX = null;
    this.jump = null;
    this.queue = null;       // what to do once the current transition (getting up, turning...) ends
    this.look = 0;           // head pitch toward a jump target, + = up
    this.fxTimer = 0;
    this.hidden = false;
    this.prefs = { hop: true, sleepOnWindows: true, offscreen: true, taskbar: true, sound: true, timeOfDay: true };
  }

  get posture() { return POSTURE[this.mode] ?? 'stand'; }

  get animMode() {
    switch (this.mode) {
      case 'walkTo': return this.speed > 120 ? 'run' : 'walk';
      case 'turn': return 'walk';
      case 'away': case 'standup': return 'idle';
      case 'held': return 'dangle';
      case 'pet': return 'loaf';
      case 'aim': return 'alert';
      case 'waking': return 'sleep';
      case 'sniff': return 'lookdown';
      default: return this.mode;
    }
  }

  get animSpeed() { return this.mode === 'turn' ? 35 : this.speed; }

  set(mode, time = 0) {
    if (this.debug && mode !== this.mode) console.log(`[cat] ${this.mode} -> ${mode} surf=${this.surf} x=${this.x | 0} y=${this.y | 0}`);
    this.mode = mode;
    this.timer = time;
  }

  // Run `action` once the cat is on its feet: a sleeping cat wakes and stretches, a sitting one gets up.
  act(action) {
    this.queue = action;
    if (this.posture === 'lie') return this.set('waking', rand(0.8, 1.6));
    if (this.posture === 'sit') return this.set('standup', 0.5);
    this.next();
  }

  next() {
    const q = this.queue;
    this.queue = null;
    q ? q() : this.decide();
  }

  // Turn around on the spot before going the other way (no moonwalking).
  face(dir, then) {
    if (!dir || dir === this.dir) return then();
    this.dir = dir;
    this.queue = then;
    this.set('turn', 0.5);
  }

  interrupt() {
    this.queue = null;
    this.onArrive = null;
    this.hunting = false;
    this.look = 0;
  }

  // ---------- per-frame ----------
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.timer -= dt;
    if (this.surf && this.mode !== 'held') this.rideSurface();

    if (['idle', 'sit', 'tuck'].includes(this.mode)) this.watchCursor(dt);

    if (TIMED.has(this.mode)) {
      if (this.timer <= 0) this.next();
      return;
    }
    switch (this.mode) {
      case 'waking':
        if (this.timer <= 0) { // big yawn, then a stretch, then whatever was queued
          const after = this.queue;
          this.queue = () => { this.queue = after; this.set('stretch', 1.8); };
          this.set('yawn', 1.4);
        }
        break;
      case 'sleep':
        this.fxTimer -= dt;
        if (this.fxTimer <= 0) { this.fxTimer = 1.6; this.fx('z', this.headPos(), 'z'); }
        if (this.timer <= 0) { this.queue = null; this.set('waking', rand(1, 2)); }
        break;
      case 'aim':
        if (this.hunting) this.trackPrey();
        if (this.timer <= 0) this.commitJump();
        break;
      case 'walkTo': this.walk(dt); break;
      case 'crouch':
        if (this.hunting) this.trackPrey();
        if (this.timer <= 0) this.launch();
        break;
      case 'jump': this.flyJump(dt); break;
      case 'fall': this.fall(dt); break;
      case 'land':
        if (this.timer <= 0) this.afterLanding();
        break;
      case 'away':
        if (this.timer <= 0) this.comeBack();
        break;
    }
  }

  rideSurface() {
    if (this.surf === 'floor') {
      this.y = this.world.floor.y;
      return;
    }
    const w = this.world.windows.get(this.surf);
    if (!w) return this.lostFooting(0, 0);
    if (w.x !== this.surfX) { this.x += w.x - this.surfX; this.surfX = w.x; }
    this.y = w.y;
    const fast = Math.hypot(w.vx, w.vy) > 2200;
    if (fast) return this.lostFooting(w.vx * 0.4, Math.min(0, w.vy * 0.3));
    if (!this.world.segmentAt(this.surf, this.x)) return this.lostFooting(0, 0);
    if ((w.vx || w.vy) && ['sleep', 'waking', 'sit', 'idle', 'tuck', 'groom'].includes(this.mode)) {
      const wasAsleep = this.posture === 'lie';
      this.interrupt();
      // a moving floor wakes any cat instantly; a sleeping one may get properly spooked
      if (wasAsleep && Math.random() < 0.45) {
        this.fx('!!', this.headPos(), 'bubble');
        this.set('arch', 1.3);
      } else {
        if (wasAsleep) this.fx('!', this.headPos(), 'bubble');
        this.set('alert', 1.2);
      }
    }
  }

  lostFooting(vx, vy) {
    this.interrupt();
    this.surf = null;
    this.vx = vx; this.vy = vy;
    this.jump = null;
    this.set('fall');
  }

  decide() {
    const seg = this.world.segmentAt(this.surf, this.x);
    if (!seg) return this.lostFooting(0, 0);
    const onWindow = this.surf !== 'floor';
    const edge = this.x - seg.x1 < 45 ? -1 : seg.x2 - this.x < 45 ? 1 : 0;
    const jumps = this.jumpTargets();
    const pr = this.prefs;
    // with taskbar walking off, a cat on the floor just looks for a way back up
    const roam = onWindow || pr.taskbar;
    const friend = this.nearestFriend();

    // personality and time-of-day multipliers
    const pers = this.personality || 'normal';
    const hour = new Date().getHours();
    const isNight = pr.timeOfDay !== false && (hour >= 23 || hour < 6);
    const isMorning = pr.timeOfDay !== false && (hour >= 6 && hour < 9);

    const sleepMul = (pers === 'lazy' ? 2.5 : pers === 'hyper' ? 0.35 : 1) * (isNight ? 2.5 : 1);
    const zoomMul = (pers === 'hyper' ? 2.5 : pers === 'lazy' ? 0.2 : 1) * (isMorning ? 2.0 : isNight ? 0.1 : 1);
    const jumpMul = pers === 'hyper' ? 1.8 : pers === 'lazy' ? 0.4 : pers === 'timid' ? 0.5 : 1;
    const walkMul = pers === 'lazy' ? 0.5 : pers === 'hyper' ? 1.4 : 1;
    const groomMul = pers === 'lazy' ? 1.5 : 1;

    const options = [
      ['idle', 8],
      ['walk', (roam ? 20 : 0) * walkMul],
      ['sit', 14],
      ['groom', 9 * groomMul],
      ['tuck', 7 * sleepMul],
      ['yawn', 2],
      ['sleep', (onWindow ? (pr.sleepOnWindows ? 14 : 0) : (pr.taskbar ? 6 : 0)) * sleepMul],
    ];
    if (jumps.length) options.push(['jump', (roam ? 24 : 60) * jumpMul]);
    if (edge && onWindow) options.push(['lookdown', 12]);
    if (!onWindow && pr.taskbar) options.push(['exit', pr.offscreen ? 4 : 0], ['sniff', 6]);
    const next = this.world.neighbours ?? {};
    if (!onWindow && (next.left || next.right)) options.push(['visit', 4]); // wander over to the next screen
    if (friend) options.push(['greet', 9]);
    if (seg.x2 - seg.x1 > 500 && roam) options.push(['zoomies', (onWindow ? 1 : 2.5) * zoomMul]);

    switch (pick(options)) {
      case 'idle': return this.set('idle', rand(1.5, 4));
      case 'sit': return this.set('sit', rand(5, 14));
      case 'groom': return this.set('groom', rand(3, 7));
      case 'tuck': return this.set('tuck', rand(10, 30));
      case 'yawn': return this.set('yawn', 1.4);
      case 'greet': return this.greet(friend);
      case 'zoomies': return this.zoomies(seg, 2 + Math.floor(Math.random() * 3));
      case 'sleep': return this.act(() => this.settleDown());
      case 'lookdown': return this.act(() => this.face(edge, () => this.set('lookdown', rand(1.5, 3.5))));
      case 'sniff': return this.act(() => this.set('sniff', rand(1, 2.5)));
      case 'walk': {
        const gx = rand(seg.x1 + 20, seg.x2 - 20);
        return this.walkTo(gx, Math.abs(gx - this.x) > 350 && Math.random() < 0.3 ? 230 : 60);
      }
      case 'jump': {
        const t = pick(jumps);
        return this.act(() => this.face(Math.sign(t.x - this.x), () => this.aim(t)));
      }
      case 'exit': {
        const left = this.x < this.world.width / 2;
        return this.walkTo(left ? -90 : this.world.width + 90, Math.random() < 0.5 ? 230 : 70, true);
      }
      case 'visit': {
        const left = next.left && (!next.right || Math.random() < 0.5);
        return this.walkTo(left ? -90 : this.world.width + 90, 70, true);
      }
    }
  }

  // Cats turn around a couple of times, knead the spot, sit, and only then curl up.
  settleDown() {
    const d = this.dir;
    const pers = this.personality || 'normal';
    const sleepMul = pers === 'lazy' ? 1.8 : pers === 'hyper' ? 0.6 : 1;
    this.face(-d, () => this.face(d, () => {
      this.queue = () => {
        this.queue = () => { this.fxTimer = 1.5; this.set('sleep', rand(20, 60) * sleepMul); };
        this.set('sit', rand(0.8, 1.5));
      };
      this.set('knead', rand(2, 3.5));
    }));
  }

  afterLanding() {
    this.sound?.('pounce');
    if (this.wasHeld) { // put down by a human: offended, or pretends nothing happened
      this.wasHeld = false;
      if (this.personality === 'timid' || Math.random() < 0.35) {
        this.fx('hiss!', this.headPos(), 'bubble');
        this.sound?.('hiss');
        return this.set('arch', 1.2);
      }
      return this.set('groom', rand(2, 4));
    }
    if (this.hunting) { // pounced: sit on the "prey" for a moment
      this.hunting = false;
      return this.set(Math.random() < 0.5 ? 'sit' : 'idle', rand(0.6, 1.5));
    }
    this.set(pick([['sit', 4], ['idle', 5], ['groom', 1.5]]), rand(0.8, 2.5));
  }

  // ---- the mouse cursor: watch it, and sometimes hunt it ----
  cursor() {
    const m = this.world.mouse;
    if (!m || performance.now() - m.t > 1500) return null; // only a moving cursor is interesting
    const dx = m.x - this.x, dy = m.y - (this.y - this.size.h * 0.6);
    return { ...m, dx, dy, dist: Math.hypot(dx, dy) };
  }

  watchCursor(dt) {
    const c = this.cursor();
    if (c && c.dist < 450 && Math.sign(c.dx) === this.dir) {
      this.look = clamp(Math.atan2(-c.dy, Math.abs(c.dx) + 20) * 0.7, -0.5, 0.6);
      // close, on our ledge, still moving: pounce! (more likely when awake and standing)
      const onLedge = Math.abs(c.y - this.y) < 60 && Math.abs(c.dx) > 50 && Math.abs(c.dx) < 380;
      if (onLedge && Math.random() < dt * (this.mode === 'idle' ? 0.9 : 0.35)) this.hunt(c);
    } else {
      this.look *= Math.pow(0.05, dt);
      if (c && c.dist < 300 && this.mode === 'idle' && Math.random() < dt * 0.5) this.face(Math.sign(c.dx), () => this.set('idle', rand(1, 2)));
    }
  }

  hunt(c) {
    const seg = this.world.segmentAt(this.surf, this.x);
    if (!seg) return;
    this.interrupt();
    this.hunting = true;
    this.act(() => this.face(Math.sign(c.dx), () => this.aim({ seg, x: clamp(c.x, seg.x1 + 20, seg.x2 - 20) })));
  }

  // keep the eyes (and the landing spot) on a moving cursor; give up if it got behind us
  trackPrey() {
    const c = this.cursor();
    const seg = this.jumpPlan.seg;
    if (!c || Math.sign(c.dx) !== this.dir) { this.hunting = false; this.look = 0; return this.set('idle', rand(0.8, 1.5)); }
    this.jumpPlan.x = clamp(c.x, seg.x1 + 20, seg.x2 - 20);
    this.jumpDist = Math.abs(this.jumpPlan.x - this.x);
    this.look = clamp(Math.atan2(-c.dy, Math.abs(c.dx) + 20) * 0.7, -0.5, 0.6);
  }

  // ---- other cats ----
  nearestFriend() {
    let best = null;
    for (const o of this.world.pets ?? []) {
      if (o === this || o.surf !== this.surf || o.hidden || BUSY.has(o.mode) || o.posture === 'lie') continue;
      const d = Math.abs(o.x - this.x);
      if (d < 400 && (!best || d < Math.abs(best.x - this.x))) best = o;
    }
    return best;
  }

  // walk up, then touch noses... or not, cats being cats
  greet(friend) {
    const side = this.x < friend.x ? -1 : 1;
    const gap = this.size.w * 0.95; // centre distance at which two facing cats touch noses
    this.walkTo(friend.x + side * gap, 60, false, () => {
      if (friend.surf !== this.surf || Math.abs(friend.x - this.x) > gap * 1.6 || BUSY.has(friend.mode)) return this.set('idle', 1);
      const hiss = Math.random() < 0.2;
      this.face(Math.sign(friend.x - this.x), () => {
        this.set(hiss ? 'arch' : 'boop', hiss ? 1.3 : 1.8);
        friend.greeted(this, hiss);
        const mid = { x: (this.x + friend.x) / 2, y: this.y - this.size.h * 0.95 };
        this.fx(hiss ? 'hiss!' : '♥', mid, hiss ? 'bubble' : 'heart');
      });
    });
  }

  greeted(by, hiss) {
    if (BUSY.has(this.mode) || this.posture === 'lie') return;
    this.interrupt();
    this.act(() => this.face(Math.sign(by.x - this.x), () => {
      if (hiss && Math.random() < 0.5) return this.walkTo(this.x + Math.sign(this.x - by.x) * 220, 230); // run away
      this.set(hiss ? 'arch' : 'boop', hiss ? 1.3 : 1.8);
    }));
  }

  // sudden burst of energy: sprint back and forth along the ledge
  zoomies(seg, laps) {
    if (laps <= 0) return this.set(Math.random() < 0.5 ? 'sit' : 'groom', rand(2, 4));
    const far = this.x - seg.x1 > seg.x2 - this.x ? seg.x1 + 30 : seg.x2 - 30;
    this.walkTo(far, rand(380, 460), false, () => this.zoomies(this.world.segmentAt(this.surf, this.x) ?? seg, laps - 1));
  }

  walkTo(x, speed, leaving = false, onArrive = null) {
    this.act(() => this.face(x < this.x ? -1 : 1, () => {
      this.goalX = x;
      this.speed = speed;
      this.leaving = leaving;
      this.onArrive = onArrive;
      this.set('walkTo');
    }));
  }

  walk(dt) {
    const dx = this.goalX - this.x;
    const step = this.speed * dt;
    if (Math.abs(dx) <= step) {
      this.x = this.goalX;
      if (this.leaving) return this.goAway();
      const arrive = this.onArrive;
      this.onArrive = null;
      if (arrive) return arrive();
      return this.set(pick([['idle', 3], ['sit', 3], ['groom', 1], ['sniff', this.surf === 'floor' ? 2 : 0]]), rand(1, 4));
    }
    this.x += Math.sign(dx) * step;
    if (this.leaving || this.x < 0 || this.x > this.world.width) return; // walking off / onto the screen
    if (!this.world.segmentAt(this.surf, this.x)) return this.lostFooting(this.dir * this.speed * 0.6, -80);
    if (this.speed < 120 && !this.onArrive && Math.random() < dt * 0.1) this.set('idle', rand(0.8, 2)); // stop and look around
  }

  jumpTargets() {
    const out = [];
    for (const s of this.world.segments) {
      if (s.id === this.surf) continue;
      if (!this.prefs.hop && s.id !== 'floor') continue; // hopping off: it can still get down
      let lx = clamp(this.x, s.x1 + 25, s.x2 - 25);
      if (Math.abs(lx - this.x) < 30) lx = clamp(this.x + this.dir * rand(40, 120), s.x1 + 25, s.x2 - 25);
      const dx = lx - this.x, dy = s.y - this.y;
      if (Math.abs(dx) > 520 || dy < -380 || dy > 820 || Math.hypot(dx, dy) < 40) continue;
      out.push([{ seg: s, x: lx }, dy < 0 ? 2.5 : 1]); // cats prefer high places
    }
    return out;
  }

  // Stare at the target first; the bigger the jump, the longer the cat measures it.
  aim(t) {
    this.jumpPlan = t;
    const dx = t.x - this.x, dy = t.seg.y - this.y;
    this.jumpDist = Math.hypot(dx, dy);
    this.look = clamp(Math.atan2(-dy, Math.abs(dx) + 1) * 0.6, -0.5, 0.6);
    this.set('aim', clamp(0.4 + this.jumpDist / 600, 0.5, 1.6));
  }

  commitJump() {
    if (this.world.surfaceY(this.jumpPlan.seg.id) == null || (this.jumpDist > 380 && Math.random() < 0.2)) {
      this.look = 0; // ...nah, too far
      return this.set('sit', rand(3, 6));
    }
    this.set('crouch', rand(0.5, 0.9) + this.jumpDist / 1500);
  }

  launch() {
    const { seg, x } = this.jumpPlan;
    const y1 = this.world.surfaceY(seg.id);
    this.look = 0;
    if (y1 == null) return this.set('idle', 1);
    const dist = Math.hypot(x - this.x, y1 - this.y);
    const apex = Math.min(this.y, y1) - clamp(40 + dist * 0.15, 50, 140);
    this.jump = {
      toId: seg.id, x0: this.x, y0: this.y, rel: x - (this.world.windows.get(seg.id)?.x ?? 0),
      cy: 2 * apex - (this.y + y1) / 2, t: 0, T: clamp(0.38 + dist / 1500, 0.42, 0.85), drop: y1 - this.y,
    };
    this.surf = null;
    this.set('jump');
  }

  flyJump(dt) {
    const j = this.jump;
    const w = this.world.windows.get(j.toId);
    if (j.toId !== 'floor' && !w) return this.lostFooting(this.vx, this.vy);
    const x1 = j.toId === 'floor' ? j.rel : w.x + j.rel;
    const y1 = this.world.surfaceY(j.toId);
    j.t = Math.min(1, j.t + dt / j.T);
    const t = j.t, u = 1 - t;
    const nx = j.x0 + (x1 - j.x0) * t;
    const ny = u * u * j.y0 + 2 * u * t * j.cy + t * t * y1;
    this.vx = (nx - this.x) / dt; this.vy = (ny - this.y) / dt;
    this.x = nx; this.y = ny;
    if (t >= 1) this.landOn(j.toId, j.drop);
  }

  fall(dt) {
    const py = this.y;
    this.vy += GRAVITY * dt;
    this.vx *= Math.pow(0.6, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const floor = this.world.floor;
    for (const s of this.world.segments) {
      const solidFloor = s === floor && py > s.y; // released below the taskbar line: the floor still catches it
      if ((solidFloor || py <= s.y + 1) && this.y >= s.y && this.x >= s.x1 && this.x <= s.x2) {
        this.y = s.y;
        return this.landOn(s.id, this.vy * 0.25);
      }
    }
    if (this.y > this.world.height + 200 || this.x < -300 || this.x > this.world.width + 300) this.goAway();
  }

  landOn(id, impact = 0) {
    this.surf = id;
    this.surfX = this.world.windows.get(id)?.x ?? 0;
    this.y = this.world.surfaceY(id);
    this.jump = null;
    this.vx = this.vy = 0;
    this.set('land', impact > 350 ? 0.45 : 0.28); // big drops take a moment to absorb
  }

  goAway() {
    const side = this.x < 0 ? -1 : this.x > this.world.width ? 1 : 0;
    this.interrupt();
    this.leaving = false;
    this.surf = null;
    this.hidden = true;
    this.set('away', rand(6, 25));
    // off a side that has another display: hand the cat over (if that fails it just comes back here later)
    if (side && this.world.neighbours?.[side < 0 ? 'left' : 'right']) this.onLeave?.(side);
  }

  // arriving from the display next door: walk in from that edge along the floor
  enterFrom(edge) {
    const fromLeft = edge === 'left';
    this.hidden = false;
    this.x = fromLeft ? -60 : this.world.width + 60;
    this.dir = fromLeft ? 1 : -1;
    this.surf = 'floor';
    this.y = this.world.floor.y;
    this.vx = this.vy = 0;
    this.set('idle');
    this.walkTo(fromLeft ? rand(120, 420) : this.world.width - rand(120, 420), 70);
  }

  comeBack() {
    this.hidden = false;
    const windowLedges = this.world.segments.filter((s) => s.id !== 'floor');
    if (windowLedges.length && (Math.random() < 0.5 || !this.prefs.taskbar)) {
      const s = pick(windowLedges.map((s) => [s, 1]));
      this.x = rand(s.x1 + 30, s.x2 - 30); this.y = -60;
      this.vx = 0; this.vy = 0;
      return this.set('fall');
    }
    const fromLeft = Math.random() < 0.5;
    this.x = fromLeft ? -80 : this.world.width + 80;
    this.dir = fromLeft ? 1 : -1;
    this.surf = 'floor';
    this.y = this.world.floor.y;
    this.walkTo(rand(this.world.width * 0.2, this.world.width * 0.8), 70);
  }

  // ---------- commands & mouse ----------
  recall() {
    this.interrupt();
    this.hidden = false;
    this.x = this.world.width / 2; this.y = -60; this.vx = this.vy = 0;
    this.surf = null; this.jump = null; this.leaving = false;
    this.set('fall');
  }

  nap() {
    if (this.surf && !BUSY.has(this.mode)) this.act(() => this.settleDown());
  }

  grab() {
    this.interrupt();
    this.wasHeld = true;
    this.surf = null; this.jump = null; this.leaving = false;
    if (this.personality === 'timid' || Math.random() < 0.25) {
      this.sound?.('hiss');
    }
    this.set('held');
  }

  hold(x, y) { this.x = x; this.y = y; }

  release(vx, vy) {
    this.vx = clamp(vx, -1500, 1500); this.vy = clamp(vy, -1500, 1500);
    if (Math.abs(this.vx) > 80) this.dir = Math.sign(this.vx);
    this.set('fall');
  }

  pet() {
    if (!this.surf || BUSY.has(this.mode)) return;
    const head = this.headPos();
    if (this.posture === 'lie' || this.mode === 'tuck') { // a sleepy or loafing cat purrs and stays put
      this.fx('purr~', { x: head.x, y: head.y - 26 }, 'bubble');
      this.sound?.('purr');
      this.timer += 5;
      return;
    }
    if (this.personality === 'timid' && Math.random() < 0.35) {
      this.fx('hiss!', head, 'bubble');
      this.sound?.('hiss');
      return;
    }
    if (Math.random() < 0.15) return this.fx('...', head, 'bubble'); // not now, human
    this.interrupt();
    this.set('pet', 3.5);
    this.sound?.('purr');
    for (let i = 0; i < 3; i++) setTimeout(() => this.fx('♥', this.headPos(), 'heart'), i * 350);
    this.fx('purr~', { x: head.x, y: head.y - 26 }, 'bubble');
  }

  headPos() {
    return { x: this.x + this.dir * this.size.w * 0.45, y: this.y - this.size.h * 0.85 };
  }

  hitTest(mx, my) {
    if (this.hidden) return false;
    const { w, h } = this.size;
    return mx > this.x - w * 0.55 && mx < this.x + w * 0.55 && my > this.y - h && my < this.y + 6;
  }
}
