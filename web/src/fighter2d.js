// A Mind on the 2D stage: the NFT split into parts, posed with keyframed moves (same rig as the old 3D one).
import { buildRig, VOX, GROUND, MID_X } from './nft2d.js';
import { stage, spawn, burst, shake, onFrame } from './stage2d.js';
import { sfx } from './audio.js';

const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
// [time 0..1, pose overrides]; go = 0 home .. 1 at the target, run = leg cycle strength
const MOVES = {
  punch: [[0, {}], [0.18, { lean: -0.15, armF: -0.6, armB: 0.9, sq: 0.9 }], [0.45, { go: 1, lean: 0.25, armF: -0.3, run: 1 }],
    [0.55, { go: 1, lean: 0.4, armF: 1.6, armFx: 0.3, armB: 0.1, legF: 0.35, legB: -0.45 }], [0.72, { go: 1, lean: 0.4, armF: 1.6, armFx: 0.3, armB: 0.1, legF: 0.35, legB: -0.45 }],
    [1, { go: 0, run: 1 }]],
  kick: [[0, {}], [0.18, { lean: 0.1, sq: 0.88, armF: 0.9, armB: 1.0 }], [0.45, { go: 0.95, run: 1 }],
    [0.55, { go: 0.95, lean: -0.35, legF: 1.6, legFy: 0.12, armF: -0.7, armB: 1.3, head: 0.15 }], [0.72, { go: 0.95, lean: -0.35, legF: 1.6, legFy: 0.12, armF: -0.7, armB: 1.3 }],
    [1, { go: 0, run: 1 }]],
  slash: [[0, {}], [0.2, { lean: -0.25, armF: -0.9, item: 1.3, sq: 0.92 }], [0.45, { go: 1, armF: -0.9, item: 1.3, run: 1 }],
    [0.55, { go: 1, lean: 0.45, armF: 1.5, item: -2.6, legF: 0.4, legB: -0.5, sq: 0.9 }], [0.72, { go: 1, lean: 0.45, armF: 1.5, item: -2.6, legF: 0.4, legB: -0.5 }],
    [1, { go: 0, run: 1 }]],
  smash: [[0, {}], [0.2, { sq: 0.72, armF: -0.6, armB: -0.6, lean: -0.1 }], [0.42, { go: 0.85, y: 1.1, armF: 2.0, armB: 2.0, item: 0.6, legF: 0.6, legB: 0.4, sq: 1.08 }],
    [0.56, { go: 1, y: 0, armF: 1.4, armB: 0.6, item: -2.4, lean: 0.55, sq: 0.78 }], [0.74, { go: 1, armF: 1.4, armB: 0.6, item: -2.4, lean: 0.4, sq: 0.9 }],
    [1, { go: 0, run: 1 }]],
  cast: [[0, {}], [0.3, { armF: 2.7, armB: 0.6, lean: -0.2, sq: 0.9, item: 0.8 }], [0.45, { armF: 1.3, armFx: 0.18, lean: 0.3, item: -1.2 }], [0.7, { armF: 1.3, armFx: 0.18, lean: 0.2 }], [1, {}]],
  hop: [[0, {}], [0.25, { sq: 0.8, armF: -0.4, armB: -0.4 }], [0.5, { y: 0.55, armF: 2.8, armB: 2.8, sq: 1.1 }], [0.75, { y: 0, sq: 0.9 }], [1, {}]],
  hit: [[0, {}], [0.2, { back: 0.35, lean: -0.45, head: 0.5, armF: 2.0, armB: 2.2, legF: 0.45, sq: 0.85 }], [1, {}]],
  hitBig: [[0, {}], [0.2, { back: 0.75, y: 0.35, lean: -0.6, head: 0.7, armF: 2.3, armB: 2.5, legF: 0.7, legB: 0.3, sq: 0.8 }], [0.55, { back: 0.5, lean: -0.3 }], [1, {}]],
  guard: [[0, {}], [0.2, { armF: 2.3, armB: 2.1, lean: -0.12, sq: 0.9, legF: 0.3, legB: -0.3 }], [0.8, { armF: 2.3, armB: 2.1, lean: -0.12, sq: 0.9, legF: 0.3, legB: -0.3 }], [1, {}]],
  think: [[0, {}], [0.3, { head: 0.25, armF: 2.4, armFx: -0.1, lean: -0.05 }], [0.8, { head: 0.2, armF: 2.4, armFx: -0.1 }], [1, {}]],
};
const HIT_AT = { punch: 0.55, kick: 0.55, slash: 0.55, smash: 0.56, cast: 0.45 };
const DUR = { guard: 1.1, punch: 0.85, kick: 0.85, slash: 0.9, smash: 1.1, cast: 0.9, hop: 0.7, hit: 0.45, hitBig: 0.7, think: 1.4 };
function sample(keys, k, base) {
  let i = 0;
  while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
  const [k0, a] = keys[i], [k1, b] = keys[i + 1];
  const u = ease(Math.min(1, Math.max(0, (k - k0) / (k1 - k0))));
  const out = {};
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = f in a ? a[f] : (f === 'run' ? 0 : base[f]), vb = f in b ? b[f] : (f === 'run' ? 0 : base[f]);
    out[f] = va + (vb - va) * u;
  }
  return out;
}

// glowing projectile with a trail (spells)
export function shoot(from, to, color, dur = 0.35, arc = 0.5) {
  return new Promise(done => {
    let t = 0;
    const stop = onFrame(dt => {
      t += dt / dur;
      const u = Math.min(1, t), x = from.x + (to.x - from.x) * u, y = from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * arc;
      for (let i = 0; i < 3; i++) spawn({ x, y, vx: (Math.random() - .5), vy: (Math.random() - .5), life: 0.35, size: 0.09 - i * 0.02, color: i ? color : '#ffffff', glow: true });
      if (u >= 1) { stop(); done(); }
    });
  });
}

const W = (pv) => ({ x: (pv.x - MID_X) * VOX, y: (pv.y - GROUND) * VOX });   // part pivot in y-down world units

export class Fighter {
  // side 0 faces right, 1 faces left
  constructor(id, x, side = 0, { scale = 1, tag = '' } = {}) {
    this.id = id; this.side = side; this.dir = side ? -1 : 1;
    this.home = { x, y: 0 }; this.pos = { x, y: 0 };
    this.rig = buildRig(id);
    this.scale = scale * (this.rig.traits.Legendary ? 1.1 : 1);
    this.act = null; this.flash = 0; this.ko = false; this.drop = 0; this.tag = tag; this.z = 0;
    this.pose = {};
    this.stopFrame = onFrame((dt, t) => this.update(dt, t));
    stage.actors.add(this);
  }
  get height() { return this.rig.height * this.scale; }
  get chest() { return { x: this.pos.x, y: this.pos.y + this.height * 0.45 }; }
  get head() { return { x: this.pos.x, y: this.pos.y + this.height * 0.85 }; }
  get colors() {
    if (this._colors) return this._colors;
    const g = this.rig.parts.torso?.cv.getContext('2d'), out = [];
    if (g) { const d = g.getImageData(0, 0, g.canvas.width, g.canvas.height).data; for (let i = 0; i < 60 && out.length < 12; i++) { const k = ((Math.random() * d.length / 4) | 0) * 4; if (d[k + 3]) out.push(`rgb(${d[k]},${d[k + 1]},${d[k + 2]})`); } }
    return (this._colors = out.length ? out : ['#ffffff']);
  }
  play(type, extra = {}) {
    const prev = this.act;   // a new move interrupts the old one: finish it so nobody waits forever
    if (prev) { if (!prev.hit && prev.onHit) { prev.hit = true; prev.onHit(); } prev.res?.(); }
    return new Promise(res => { this.act = { type, t: 0, dur: DUR[type] || 0.8, hitAt: HIT_AT[type], ...extra, res }; });
  }
  async perform(move, target, onHit) {
    if (move === 'cast') {
      sfx('cast');
      let hitDone; const hitP = new Promise(r => { hitDone = r; });
      await Promise.all([this.play('cast', { onHit: async () => { await onHit?.(); hitDone(); } }), hitP]);
      return;
    }
    sfx('whoosh', 0.2);
    await this.play(move, { target, onHit });
  }
  dropIn(delay = 0) { this.drop = 0.7 + delay; }
  update(dt, t) {
    const ph = t * 4.2 + this.side * 1.3 + this.home.x, bob = Math.abs(Math.sin(ph));
    // standing still = exactly the NFT's own shape (limbs straight, only a gentle bob); moves bend them
    const pose = {
      go: 0, back: 0, y: bob * 0.03, lean: 0, head: Math.sin(t * 2.1 + this.home.x) * 0.03, sq: 1 - bob * 0.02,
      armF: Math.sin(ph) * 0.03, armB: -Math.sin(ph) * 0.03, armFx: 0, item: 0.2,
      legF: 0, legB: 0, legFy: 0, roll: 0, run: 0,
    };
    if (this.drop > 0) {
      this.drop = Math.max(0, this.drop - dt);
      const u = Math.min(1, this.drop / 0.7);
      pose.y += u * u * 9; pose.armF = pose.armB = 2.6 * u; pose.legF = 0.5 * u; pose.legB = -0.5 * u;
      if (this.drop === 0) { burst(this.home.x, 0.05, ['#ffffff', '#d4ff1f'], 18, 0.6); shake(5); sfx('land'); }
    }
    const a = this.act;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      if (MOVES[a.type]) {
        Object.assign(pose, sample(MOVES[a.type], k, pose));
        if (a.hitAt !== undefined && k >= a.hitAt && !a.hit) { a.hit = true; a.onHit?.(); }
      } else if (a.type === 'ko') {
        const u = ease(Math.min(1, k * 1.2));
        Object.assign(pose, { back: u * 0.6, y: Math.sin(u * Math.PI) * 0.8, roll: u * Math.PI / 2, head: u * 0.5, armF: 2.6 * u, armB: 2.2 * u, legF: 0.5 * u, legB: 0.2 * u });
      } else if (a.type === 'win') {
        const s = Math.sin(a.t * 10);
        Object.assign(pose, { y: Math.abs(Math.sin(a.t * 5)) * 0.45, armF: 2.9 + s * 0.3, armB: 2.9 - s * 0.3, head: 0.25, legF: 0.3 * s, legB: -0.3 * s, item: 0.4 });
      }
      if (k >= 1 && a.type !== 'ko' && a.type !== 'win') { this.act = null; a.res?.(); }
      if (k >= 1 && (a.type === 'ko' || a.type === 'win') && !a.resolved) { a.resolved = true; a.res?.(); }
    }
    if (pose.run) {
      const r = Math.sin(t * 26) * pose.run;
      pose.legF += r * 0.8; pose.legB -= r * 0.8; pose.armB += r * 0.9; pose.y += Math.abs(r) * 0.06;
      if (!a || a.type !== 'slash') pose.armF -= r * 0.6;
    }
    let x = this.home.x;
    if (a?.target && pose.go) x += (a.target.home.x - this.dir * 1.25 * this.scale - x) * pose.go;
    x -= this.dir * pose.back;
    this.pos = { x, y: Math.max(0, pose.y) };
    this.pose = pose; this.t = t;
    this.flash = Math.max(0, this.flash - dt * 6);
    // legendary aura
    const fx = this.rig.legend;
    if (fx && !this.ko) {
      this.auraAcc = (this.auraAcc || 0) + dt * fx.rate;
      while (this.auraAcc > 1) {
        this.auraAcc--;
        spawn({ x: this.pos.x + (Math.random() - .5) * 0.9 * this.scale, y: this.pos.y + (fx.top ? 2.3 : 0.4 + Math.random() * 1.4) * this.scale,
          vx: (Math.random() - .5) * 0.3, vy: fx.rise * (0.6 + Math.random() * 0.8), life: 1 + Math.random(), size: 0.04 + Math.random() * 0.03, color: fx.colors[(Math.random() * fx.colors.length) | 0], glow: true });
      }
    }
  }
  drawShadow(g) {
    const lift = Math.min(0.6, this.pos.y * 0.3);
    g.fillStyle = 'rgba(29,27,47,.28)';
    g.beginPath(); g.ellipse(this.pos.x, 0.02, 0.62 * this.scale * (1 - lift), 0.11 * this.scale * (1 - lift), 0, 0, Math.PI * 2); g.fill();
  }
  draw(g, t) {
    const P = this.pose, R = this.rig, parts = R.parts, pv = R.pivots;
    if (P.sq === undefined) return;
    const part = (name, rot = 0, dx = 0, dy = 0) => {
      const p = parts[name]; if (!p) return;
      g.save();
      g.rotate(-rot);
      g.translate(dx, dy);
      g.drawImage(p.cv, p.ox * VOX, p.oy * VOX, p.w * VOX, p.h * VOX);
      if (this.flash > 0.02) { g.globalAlpha = this.flash; g.drawImage(p.white, p.ox * VOX, p.oy * VOX, p.w * VOX, p.h * VOX); g.globalAlpha = 1; }
      g.restore();
    };
    const at = (name, from, fn) => { const a = W(pv[name]), b = from ? W(pv[from]) : { x: 0, y: 0 }; g.save(); g.translate(a.x - b.x, a.y - b.y); fn(); g.restore(); };
    g.save();
    g.translate(this.pos.x, -this.pos.y - (this.ko ? 0.25 * Math.min(1, P.roll) : 0));
    g.scale(this.dir * this.scale, this.scale);
    g.rotate(-P.roll);
    at('legL', null, () => part('legL', P.legB));
    at('legR', null, () => part('legR', P.legF, 0, -P.legFy));
    at('torso', null, () => {
      g.rotate(P.lean);
      g.scale(1 + (1 - P.sq) * 0.6, P.sq);
      at('armL', 'torso', () => part('armL', P.armB));
      part('torso');
      if (parts.item) at('armR', 'torso', () => { g.rotate(-P.armF); g.translate(P.armFx, 0); at('item', 'armR', () => part('item', P.item - 0.2)); });
      at('head', 'torso', () => part('head', P.head));
      at('armR', 'torso', () => part('armR', P.armF, P.armFx, 0));
      if (parts.emote) at('emote', 'torso', () => part('emote', Math.sin(t * 2) * 0.2, 0, -Math.sin(t * 3) * 0.06));
    });
    g.restore();
  }
  dispose() { this.stopFrame(); stage.actors.delete(this); }
}
