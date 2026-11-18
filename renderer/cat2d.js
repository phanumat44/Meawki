// Cartoon cat drawn with Canvas 2D, posed by CatAnimator (pose.js).
import { CatAnimator } from './pose.js';

const INK = '#3b2a20';

// base = fur, dark = stripes/points, belly = chest & socks, eye = iris
export const COATS = {
  orange: { name: 'ส้ม (Orange tabby)', base: '#f5a35a', dark: '#d9782f', belly: '#fff3e2', eye: '#6b8f2a', pattern: 'tabby' },
  calico: { name: 'สามสี (Calico)', base: '#fffaf3', dark: '#3d3836', patch: '#f09a45', belly: '#fffaf3', eye: '#c9962b', pattern: 'calico' },
  grey:   { name: 'เทาลาย (Grey tabby)', base: '#a3a7ad', dark: '#6c7079', belly: '#eceef0', eye: '#5d9a63', pattern: 'tabby' },
  black:  { name: 'ดำ (Black)', base: '#35302f', dark: '#272322', belly: '#35302f', eye: '#d8c23a', pattern: 'solid', ink: '#141010' },
  white:  { name: 'ขาว (White)', base: '#fdfdfd', dark: '#e6e2de', belly: '#fdfdfd', eye: '#5aa7e0', pattern: 'solid' },
  siamese:{ name: 'วิเชียรมาศ (Siamese)', base: '#efe0c8', dark: '#6b4a35', belly: '#f7eddd', eye: '#4f9fe3', pattern: 'points' },
  tuxedo: { name: 'ทักซิโด้ (Tuxedo)', base: '#2f2b2a', dark: '#211e1d', belly: '#fbfbfb', eye: '#8fc046', pattern: 'tuxedo', ink: '#141010' },
};

const PINK = '#f4a3ad';

export class Cat2D {
  constructor(coat = 'orange', { outline = false, shadow = !outline } = {}) {
    this.coat = coat;
    this.outline = outline; // flat look by default; true adds cartoon ink lines around the body
    this.shadow = shadow;   // faint halo around the silhouette so light cats stay visible on white windows
    this.animator = new CatAnimator();
  }

  // x, y = feet position on screen; scale = px per model unit
  draw(ctx, x, y, scale) {
    if (!this.shadow) return this.drawCat(ctx, x, y, scale);
    // Shadowing each part would darken the overlaps, so draw the cat into a buffer and shadow it once.
    const W = 240, H = 170, ox = 120, oy = 135; // buffer box in model units, feet at (ox, oy)
    const px = scale * ctx.getTransform().a;   // device pixels per model unit
    const buf = (this.buf ??= document.createElement('canvas'));
    const bw = Math.ceil(W * px), bh = Math.ceil(H * px);
    if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
    const b = buf.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, bw, bh);
    this.drawCat(b, ox * px, oy * px, px);

    const dpr = ctx.getTransform().a; // shadow sizes are in canvas pixels, not transformed
    ctx.save();
    ctx.shadowColor = 'rgba(45, 35, 30, 0.38)';
    ctx.shadowBlur = 3 * dpr;
    ctx.shadowOffsetY = 1 * dpr;
    ctx.drawImage(buf, x - ox * scale, y - oy * scale, W * scale, H * scale);
    ctx.restore();
  }

  drawCat(ctx, x, y, scale) {
    const a = this.animator, p = a.pose;
    const c = COATS[this.coat] ?? COATS.orange;
    const ink = c.ink ?? INK;
    // facing: the animator's yaw goes -0.35 (right) .. -PI+0.35 (left); squash x through the turn
    const u = Math.min(1, Math.max(0, (a.yaw + 0.35) / (-Math.PI + 0.7)));
    const flip = Math.cos(u * Math.PI);
    const sx = Math.sign(flip || 1) * Math.max(0.18, Math.abs(flip));

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale * sx, -scale); // y up from here on, +x = forward
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.translate(-4, p.y);
    ctx.scale(p.sx, p.sy);

    // soft contact shadow
    ctx.save();
    ctx.scale(1, 0.18);
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.beginPath(); ctx.ellipse(6, 0, 42, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(-16, 26);
    ctx.rotate(p.pitch);

    this.tail(ctx, p, a.t, c, ink);
    this.leg(ctx, [4, -2], p.blh - p.pitch, p.blk, 1, c, ink, true);
    this.leg(ctx, [36, -2], p.flh - p.pitch, p.flk, p.frontScale, c, ink, true);
    this.body(ctx, c, ink);
    // haunch: the folded hind leg bulges out when sitting or crouching
    const fold = Math.min(1, Math.max(0, -p.brk / 2.2));
    if (fold > 0.15) {
      ctx.beginPath();
      ctx.ellipse(6, 1, 9 + fold * 6, 7 + fold * 6, 0.3, 0, Math.PI * 2);
      ctx.fillStyle = this.outline ? c.base : shade(c.base, -0.05); ctx.fill();
      if (this.outline) { ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.stroke(); }
    }
    this.leg(ctx, [6, -2], p.brh - p.pitch, p.brk, 1, c, ink, false);
    const pawUp = p.tongue > 0.3; // grooming: the licked paw is held in front of the face
    const nearFront = () => this.leg(ctx, [38, -2], p.frh - p.pitch, p.frk, p.frontScale, c, ink, false);
    if (!pawUp) nearFront();

    ctx.save();
    ctx.translate(44, 14);
    ctx.rotate(-p.neck - p.pitch * 0.7); // keep the face roughly level when the body tilts
    ctx.translate(4, 6);
    ctx.rotate(-p.headTilt * 0.6);
    ctx.scale(1.2, 1.2); // big cartoon head
    this.head(ctx, p, a, c, ink);
    ctx.restore();
    if (pawUp) {
      // without ink lines the paw would melt into the chest; a soft shadow separates it
      const m = ctx.getTransform();
      ctx.save();
      ctx.shadowColor = 'rgba(60, 35, 20, 0.35)';
      ctx.shadowBlur = 2.5 * Math.hypot(m.a, m.b);
      nearFront();
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
  }

  capsule(ctx, pts, width, fill, ink) {
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    for (const q of pts.slice(1)) ctx.lineTo(...q);
    if (this.outline) { ctx.strokeStyle = ink; ctx.lineWidth = width + 4.4; ctx.stroke(); }
    ctx.strokeStyle = fill; ctx.lineWidth = width; ctx.stroke();
  }

  leg(ctx, [hx, hy], hip, knee, upperScale, c, ink, far) {
    const L1 = 12 * upperScale, L2 = 12;
    const kx = hx + Math.sin(hip) * L1, ky = hy - Math.cos(hip) * L1;
    const fx = kx + Math.sin(hip + knee) * L2, fy = ky - Math.cos(hip + knee) * L2;
    const fur = far ? shade(c.base, -0.14) : c.base;
    const sock = c.pattern === 'tuxedo' || c.pattern === 'calico' || c.pattern === 'points'
      ? (c.pattern === 'points' ? c.dark : c.belly) : c.base;
    this.capsule(ctx, [[hx, hy], [kx, ky], [fx, fy]], 9, fur, ink);
    // paw
    ctx.beginPath();
    ctx.ellipse(fx + 1.6, fy + 1.2, 5.4, 3.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = far ? shade(sock, -0.14) : sock; ctx.fill();
    if (this.outline) { ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.stroke(); }
  }

  body(ctx, c, ink) {
    const path = new Path2D();
    path.ellipse(19, 5, 30, 16, 0.04, 0, Math.PI * 2);
    ctx.fillStyle = c.base; ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = c.belly;
    ctx.beginPath(); ctx.ellipse(30, -8, 22, 11, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.dark; ctx.strokeStyle = c.dark;
    if (c.pattern === 'tabby') {
      ctx.lineWidth = 3.2;
      for (const sx of [-4, 6, 16, 26]) {
        ctx.beginPath(); ctx.moveTo(sx, 23); ctx.quadraticCurveTo(sx + 5, 14, sx + 1, 7); ctx.stroke();
      }
    } else if (c.pattern === 'calico') {
      ctx.fillStyle = c.patch;
      ctx.beginPath(); ctx.ellipse(2, 14, 15, 11, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.dark;
      ctx.beginPath(); ctx.ellipse(28, 17, 11, 7, -0.2, 0, Math.PI * 2); ctx.fill();
    } else if (c.pattern === 'points') {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.ellipse(-12, 8, 12, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (this.outline) { ctx.strokeStyle = ink; ctx.lineWidth = 2.4; ctx.stroke(path); }
  }

  tail(ctx, p, t, c, ink) {
    const pts = [[-12, 8]];
    let ang = 0;
    for (let i = 0; i < 9; i++) {
      const wave = Math.sin(t * p.tailSpeed - i * 0.55) * p.tailWave * (0.4 + i / 9);
      ang += (i === 0 ? -p.tailLift : 0) - p.tailCurl * (i > 0 ? 1 : 0) + wave * 0.9;
      const [x, y] = pts[pts.length - 1];
      pts.push([x - Math.cos(ang) * 4.6, y - Math.sin(ang) * 4.6]);
    }
    const tw = 7 + p.puff * 7; // a spooked cat's tail fluffs up
    this.capsule(ctx, pts, tw, c.base, ink);
    if (c.pattern === 'tabby' || c.pattern === 'points') {
      ctx.strokeStyle = c.dark; ctx.lineWidth = tw;
      ctx.beginPath(); ctx.moveTo(...pts[7]); ctx.lineTo(...pts[9]); ctx.stroke();
    }
    if (c.pattern === 'tabby') {
      ctx.lineWidth = tw; ctx.strokeStyle = c.dark;
      for (const i of [3, 5]) {
        ctx.beginPath(); ctx.moveTo(...pts[i]); ctx.lineTo(...lerp(pts[i], pts[i + 1], 0.45)); ctx.stroke();
      }
    }
  }

  head(ctx, p, a, c, ink) {
    const eyeOpen = a.blink > 0 ? 0 : p.eye;
    const earColor = c.pattern === 'points' || c.pattern === 'calico' ? c.dark : c.base;
    // ears (far one first, tucked behind the head)
    for (const [ex, ey, rot, far] of [[11, 10, -0.15, true], [-3, 11, 0.25, false]]) {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(rot - p.ear * 0.6);
      const ear = new Path2D();
      ear.moveTo(-6.5, -1); ear.quadraticCurveTo(-3, 9, 0.5, 13); ear.quadraticCurveTo(4, 8, 6.5, -1); ear.closePath();
      ctx.fillStyle = far ? shade(earColor, -0.12) : earColor; ctx.fill(ear);
      if (this.outline) { ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.stroke(ear); }
      if (!far) {
        ctx.fillStyle = PINK;
        ctx.beginPath(); ctx.moveTo(-3.5, 0.5); ctx.quadraticCurveTo(-1, 6, 0.4, 8.5); ctx.quadraticCurveTo(2.2, 5, 3.6, 0.5); ctx.fill();
      }
      ctx.restore();
    }

    const head = new Path2D();
    head.ellipse(3, 1, 16.5, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = c.base; ctx.fill(head);
    ctx.save();
    ctx.clip(head);
    if (c.pattern === 'tabby') {
      ctx.strokeStyle = c.dark; ctx.lineWidth = 2.4;
      for (const sx of [-1, 4, 9]) { ctx.beginPath(); ctx.moveTo(sx, 15); ctx.lineTo(sx + 0.8, 9); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-13, 3); ctx.lineTo(-8, 3.5); ctx.moveTo(-13, -1); ctx.lineTo(-8, 0); ctx.stroke();
    } else if (c.pattern === 'calico') {
      ctx.fillStyle = c.patch; ctx.beginPath(); ctx.ellipse(-9, 9, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.dark; ctx.beginPath(); ctx.ellipse(13, 11, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
    } else if (c.pattern === 'points') {
      ctx.fillStyle = c.dark; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(10, -3, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (c.pattern === 'tuxedo') {
      ctx.fillStyle = c.belly; ctx.beginPath(); ctx.ellipse(11, -6, 9, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (this.outline) { ctx.strokeStyle = ink; ctx.lineWidth = 2.4; ctx.stroke(head); }

    // face: 3/4 view, features shifted toward the front
    const yaw = p.headYaw * 3;
    // muzzle
    ctx.fillStyle = c.belly;
    ctx.beginPath(); ctx.ellipse(12 + yaw, -5, 6.5, 4.6, 0, 0, Math.PI * 2); ctx.fill();
    // blush
    ctx.fillStyle = 'rgba(255,120,140,0.35)';
    ctx.beginPath(); ctx.ellipse(1 + yaw, -4, 3.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    // eyes
    for (const [ex, r] of [[4 + yaw, 1], [14.5 + yaw, 0.85]]) this.eye(ctx, ex, 2.5, r, eyeOpen, c, ink);
    // nose + mouth
    ctx.fillStyle = '#ee7e93';
    ctx.beginPath(); ctx.moveTo(12 + yaw, -2.2); ctx.lineTo(15 + yaw, -2.2); ctx.lineTo(13.5 + yaw, -4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(13.5 + yaw, -4); ctx.quadraticCurveTo(12.8 + yaw, -6.4, 11 + yaw, -5.6);
    ctx.moveTo(13.5 + yaw, -4); ctx.quadraticCurveTo(14.4 + yaw, -6.4, 16 + yaw, -5.6);
    ctx.stroke();
    if (p.mouth > 0.15) { // yawn / hiss
      const h = 5.5 * p.mouth;
      ctx.fillStyle = '#7a2d38';
      ctx.beginPath(); ctx.ellipse(13.5 + yaw, -5.2 - h * 0.5, 3.4, h * 0.6 + 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f08a9a';
      ctx.beginPath(); ctx.ellipse(13.5 + yaw, -5.4 - h * 0.85, 2.2, h * 0.25 + 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; // little fangs
      for (const fx of [11.4, 15.6]) {
        ctx.beginPath(); ctx.moveTo(fx - 0.7 + yaw, -5); ctx.lineTo(fx + 0.7 + yaw, -5); ctx.lineTo(fx + yaw, -6.6); ctx.fill();
      }
    }
    if (p.tongue > 0.3) { // grooming lick
      ctx.fillStyle = '#f07f92';
      ctx.beginPath(); ctx.ellipse(15.5 + yaw, -7.2, 2 * p.tongue, 1.4 * p.tongue, 0.4, 0, Math.PI * 2); ctx.fill();
    }
    // whiskers
    ctx.strokeStyle = c.pattern === 'tuxedo' || c.base === '#35302f' ? 'rgba(255,255,255,0.7)' : 'rgba(59,42,32,0.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const dy of [-3, -5.5]) { ctx.moveTo(17 + yaw, dy); ctx.lineTo(26 + yaw, dy + (dy + 4) * 0.6); }
    ctx.stroke();
  }

  eye(ctx, x, y, r, open, c, ink) {
    if (open < 0.25) { // closed: happy ^ curve
      ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - 2.6 * r, y); ctx.quadraticCurveTo(x, y - 2.4 * r, x + 2.6 * r, y); ctx.stroke();
      return;
    }
    const h = 3.9 * r * Math.min(1.25, open);
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(x, y, 2.9 * r, h, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.eye;
    ctx.beginPath(); ctx.ellipse(x, y - h * 0.25, 2.1 * r, h * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.ellipse(x + 0.3, y, 1.2 * r, h * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + 0.9 * r, y + h * 0.42, 1.1 * r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 1 * r, y - h * 0.35, 0.55 * r, 0, Math.PI * 2); ctx.fill();
  }
}

function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(Math.min(255, Math.max(0, v + amt * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
