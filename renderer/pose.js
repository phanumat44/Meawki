// Cat poses for every behaviour mode. A pose is a flat record of joint angles and offsets
// (local space: +x = forward, +y = up, origin between the paws, units = px); the animator lerps
// the live pose toward the target each frame, and cat2d.js draws whatever the pose says.
const ZERO = {
  y: 0, sx: 1, sy: 1, pitch: 0, roll: 0,
  neck: 0, headTilt: 0, headYaw: 0, eye: 1, ear: 0,
  flh: 0, flk: 0, frh: 0, frk: 0, blh: 0, blk: 0, brh: 0, brk: 0, frontScale: 1,
  tailLift: 0.5, tailCurl: 0.08, tailWave: 0.15, tailSpeed: 2,
  mouth: 0, tongue: 0, puff: 0, // face/fur extras (drawn by the 2D cat)
};

// sitting on the haunches: shared by sit, groom, yawn...
function sitBase(p) {
  p.pitch = 0.5; p.y = -18; p.frontScale = 1.12; // low enough that haunch and front paws touch the ground
  p.flh = -0.5; p.frh = -0.5; p.flk = 0; p.frk = 0;
  p.blh = 1.35; p.brh = 1.35; p.blk = -2.2; p.brk = -2.2;
  p.tailLift = -0.9; p.tailCurl = 0.22; p.tailWave = 0.08; p.tailSpeed = 1.2;
}

const ANGULAR_GAIT = { walk: 0.55, run: 0.9 };

export class CatAnimator {
  constructor() {
    this.pose = { ...ZERO };
    this.t = 0;
    this.blink = 0;
    this.nextBlink = 2;
    this.gaitPhase = 0;
    this.yaw = -0.35;
  }

  target(mode, ctx) {
    const p = { ...ZERO };
    const t = this.t;
    const breathe = Math.sin(t * 2.2) * 0.015;
    p.sy = 1 + breathe;
    switch (mode) {
      case 'walk':
      case 'run': {
        const a = ANGULAR_GAIT[mode];
        const ph = this.gaitPhase;
        const s = Math.sin(ph), c = Math.cos(ph);
        p.flh = s * a; p.brh = s * a * 0.9;
        p.frh = -s * a; p.blh = -s * a * 0.9;
        p.flk = -Math.max(0, -c) * a * 1.2; p.frk = -Math.max(0, c) * a * 1.2;
        p.blk = Math.max(0, c) * a; p.brk = Math.max(0, -c) * a;
        p.y = Math.abs(Math.sin(ph)) * (mode === 'run' ? 4 : 1.5) - (mode === 'run' ? 2 : 0);
        p.pitch = mode === 'run' ? Math.sin(ph * 2) * 0.06 : 0;
        p.neck = mode === 'run' ? -0.15 : 0.05;
        p.tailLift = mode === 'run' ? 0.1 : 0.7;
        p.tailWave = 0.1; p.tailSpeed = 6;
        break;
      }
      case 'sit':
        sitBase(p);
        p.neck = -0.45 + Math.sin(t * 0.7) * 0.05 - (ctx.look ?? 0); p.headYaw = (ctx.look ? 0 : Math.sin(t * 0.4) * 0.5);
        break;
      case 'groom': { // licking a raised front paw
        sitBase(p);
        const lick = Math.sin(t * 7);
        p.frh = 2.1; p.frk = 0.15 + lick * 0.2;
        p.neck = 0.15 + lick * 0.08; p.headTilt = 0.25; p.eye = 0.1; p.tongue = 1; p.ear = -0.1;
        p.tailWave = 0.15; p.tailSpeed = 1.5;
        break;
      }
      case 'yawn':
        sitBase(p);
        p.neck = -0.4; p.mouth = 1; p.eye = 0; p.ear = -0.5; p.sy = 1.05; p.frontScale = 1.18;
        break;
      case 'knead': { // making biscuits before a nap
        const k = Math.sin(t * 5);
        p.y = -4; p.pitch = 0.05;
        p.flh = 0.3 + Math.max(0, k) * 0.55; p.flk = -Math.max(0, k) * 1.1;
        p.frh = 0.3 + Math.max(0, -k) * 0.55; p.frk = -Math.max(0, -k) * 1.1;
        p.blh = 0.3; p.brh = 0.3; p.blk = -0.6; p.brk = -0.6;
        p.neck = 0.15; p.eye = 0.35; p.tailLift = 0.9; p.tailWave = 0.25; p.tailSpeed = 1.5;
        break;
      }
      case 'tuck': // the loaf: paws folded under, eyes half shut
        p.y = -15;
        p.flh = 1.45; p.frh = 1.45; p.flk = -2.7; p.frk = -2.7;
        p.blh = 1.45; p.brh = 1.45; p.blk = -2.4; p.brk = -2.4;
        p.neck = 0.05 - (ctx.look ?? 0) * 0.5; p.eye = ctx.look ? 0.8 : 0.45 + Math.sin(t * 0.3) * 0.1;
        p.tailLift = -0.5; p.tailCurl = 0.15; p.tailWave = 0.05; p.tailSpeed = 0.8;
        break;
      case 'arch': // spooked: back up, fur puffed, ears flat, hiss
        p.y = 6; p.sy = 1.12; p.sx = 0.94;
        p.flh = -0.15; p.frh = -0.15; p.blh = 0.15; p.brh = 0.15;
        p.neck = 0.1; p.ear = -0.9; p.eye = 1.3; p.mouth = 0.6; p.puff = 1;
        p.tailLift = 1.5; p.tailCurl = -0.02; p.tailWave = 0.05; p.tailSpeed = 20;
        p.y += Math.sin(t * 40) * 0.4; // trembling
        break;
      case 'boop': // leaning in to touch noses
        p.pitch = -0.08; p.y = -1; p.neck = -0.05; p.headTilt = 0.15; p.eye = 0.2;
        p.flh = 0.25; p.frh = 0.25; p.tailLift = 1.1; p.tailCurl = 0.06; p.tailWave = 0.2; p.tailSpeed = 3;
        break;
      case 'loaf': // pet / purr
        p.pitch = 0.5; p.y = -18; p.frontScale = 1.12; // low enough that haunch and front paws touch the ground
        p.flh = -0.5; p.frh = -0.5; p.blh = 1.35; p.brh = 1.35; p.blk = -2.2; p.brk = -2.2;
        p.neck = -0.3; p.headTilt = Math.sin(t * 3) * 0.12; p.eye = 0.12;
        p.tailLift = 0.9; p.tailCurl = 0.02; p.tailWave = 0.35; p.tailSpeed = 3;
        break;
      case 'sleep':
        p.y = -14; p.sy = 1 + Math.sin(t * 1.3) * 0.04; p.pitch = 0;
        for (const k of ['flh', 'frh']) p[k] = 1.5;
        for (const k of ['flk', 'frk']) p[k] = -0.2;
        for (const k of ['blh', 'brh']) p[k] = 1.45;
        for (const k of ['blk', 'brk']) p[k] = -2.4;
        p.neck = 0.55; p.headTilt = 0.35; p.headYaw = 0.6; p.eye = 0;
        p.tailLift = -0.55; p.tailCurl = 0.12; p.tailWave = 0.03; p.tailSpeed = 0.6;
        break;
      case 'crouch':
        p.y = -9; p.pitch = -0.08; p.sy = 0.92; p.sx = 1.06;
        p.flh = 0.5; p.frh = 0.5; p.flk = -1.1; p.frk = -1.1;
        p.blh = 0.9; p.brh = 0.9; p.blk = -1.8; p.brk = -1.8;
        p.neck = -0.25 - (ctx.look ?? 0); p.tailLift = 0.1; p.tailWave = 0.4; p.tailSpeed = 9;
        p.y += Math.sin(t * 30) * 0.6; // butt wiggle
        break;
      case 'jump': {
        const up = ctx.vy < 0;
        p.pitch = Math.max(-0.45, Math.min(0.45, -ctx.vy / 2500));
        p.sx = up ? 1.1 : 1; p.sy = up ? 0.95 : 1;
        p.flh = up ? 1.1 : 0.6; p.frh = up ? 1.0 : 0.5;
        p.blh = up ? -1.0 : 0.2; p.brh = up ? -0.9 : 0.3;
        p.flk = -0.2; p.frk = -0.2; p.blk = up ? 0.3 : -0.4; p.brk = up ? 0.3 : -0.4;
        p.tailLift = 0.1; p.tailCurl = 0.02; p.tailWave = 0.05; p.tailSpeed = 3;
        p.neck = -p.pitch * 0.6;
        break;
      }
      case 'fall':
        p.flh = 0.9; p.frh = 0.7; p.blh = -0.6; p.brh = -0.4; p.flk = -0.4; p.frk = -0.4;
        p.y = 2; p.tailLift = 1.2; p.tailWave = 0.6; p.tailSpeed = 10; p.eye = 1.25; p.ear = -0.6;
        p.neck = -0.2;
        break;
      case 'dangle': // held by the scruff
        p.y = 0; p.pitch = -0.2; p.sy = 1.12; p.sx = 0.92;
        p.flh = 0.1 + Math.sin(t * 2) * 0.12; p.frh = 0.15 - Math.sin(t * 2) * 0.12;
        p.blh = -0.25 + Math.sin(t * 2.3) * 0.15; p.brh = -0.15 - Math.sin(t * 2.3) * 0.15;
        p.tailLift = -1.3; p.tailCurl = 0.05; p.tailWave = 0.25; p.tailSpeed = 2; p.ear = -0.4;
        break;
      case 'land':
        p.y = -7; p.sy = 0.82; p.sx = 1.12;
        p.flh = 0.2; p.frh = 0.2; p.flk = -0.7; p.frk = -0.7;
        p.blh = 0.7; p.brh = 0.7; p.blk = -1.4; p.brk = -1.4;
        break;
      case 'lookdown':
        p.pitch = -0.12; p.neck = 0.6; p.y = -2; p.ear = 0.2;
        p.flh = 0.25; p.frh = 0.25; p.flk = -0.4; p.frk = -0.4;
        p.tailWave = 0.3; p.tailSpeed = 3;
        break;
      case 'stretch':
        p.pitch = -0.32; p.y = -6; p.flh = 1.3; p.frh = 1.3; p.flk = 0.2; p.frk = 0.2;
        p.blh = -0.2; p.brh = -0.2; p.neck = 0.25; p.eye = 0.2; p.tailLift = 1.3; p.tailWave = 0.05;
        break;
      case 'alert':
        p.neck = -0.2 - (ctx.look ?? 0); p.ear = 0.35; p.eye = 1.25; p.tailLift = 1.2; p.tailCurl = 0.02; p.sy = 1.04;
        break;
      default: // idle (head follows ctx.look when watching the cursor)
        p.neck = Math.sin(t * 0.5) * 0.06 - (ctx.look ?? 0); p.headYaw = ctx.look ? 0 : Math.sin(t * 0.23) * 0.35;
    }
    return p;
  }

  update(dt, mode, ctx = {}) {
    this.t += dt;
    if (mode === 'walk' || mode === 'run') this.gaitPhase += dt * Math.abs(ctx.speed ?? 60) * (mode === 'run' ? 0.055 : 0.1);
    const target = this.target(mode, ctx);
    const k = 1 - Math.exp(-dt * (ctx.snappy ? 30 : 12));
    for (const key in target) this.pose[key] += (target[key] - this.pose[key]) * k;

    // facing: yaw goes -0.35 (right) .. -PI+0.35 (left); cat2d.js squashes the drawing through the turn
    const wantYaw = ctx.dir < 0 ? -Math.PI + 0.35 : -0.35;
    this.yaw += (wantYaw - this.yaw) * (1 - Math.exp(-dt * 8));

    // blinking
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blink = 0.15; this.nextBlink = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt);
  }
}
