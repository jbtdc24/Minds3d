// A fighter on stage: procedural keyframed animation, projectiles, status visuals.
import * as THREE from 'three';
import { buildFighter, VOX } from './nft.js';
import { scene, spawn, burst, shake, onFrame } from './render.js';
import { sfx } from './audio.js';

const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
// [time 0..1, pose overrides]; go = 0 home .. 1 at the target, run = leg cycle strength
const MOVES = {
  punch: [[0, {}], [0.18, { lean: -0.15, armF: -0.6, armB: 0.9, sq: 0.9 }], [0.45, { go: 1, lean: 0.25, armF: -0.3, run: 1 }],
    [0.55, { go: 1, lean: 0.4, armF: 1.6, armFx: 0.3, armZ: 0.2, armB: 0.1, legF: 0.35, legB: -0.45 }], [0.72, { go: 1, lean: 0.4, armF: 1.6, armFx: 0.3, armZ: 0.2, armB: 0.1, legF: 0.35, legB: -0.45 }],
    [1, { go: 0, run: 1 }]],
  kick: [[0, {}], [0.18, { lean: 0.1, sq: 0.88, armF: 0.9, armB: 1.0 }], [0.45, { go: 0.95, run: 1 }],
    [0.55, { go: 0.95, lean: -0.35, legF: 1.6, legFy: 0.12, armF: -0.7, armB: 1.3, head: 0.15 }], [0.72, { go: 0.95, lean: -0.35, legF: 1.6, legFy: 0.12, armF: -0.7, armB: 1.3 }],
    [1, { go: 0, run: 1 }]],
  slash: [[0, {}], [0.2, { lean: -0.25, armF: -0.9, item: 1.3, armZ: 0.15, sq: 0.92 }], [0.45, { go: 1, armF: -0.9, item: 1.3, armZ: 0.15, run: 1 }],
    [0.55, { go: 1, lean: 0.45, armF: 1.5, item: -2.6, armZ: 0.22, legF: 0.4, legB: -0.5, sq: 0.9 }], [0.72, { go: 1, lean: 0.45, armF: 1.5, item: -2.6, armZ: 0.22, legF: 0.4, legB: -0.5 }],
    [1, { go: 0, run: 1 }]],
  smash: [[0, {}], [0.2, { sq: 0.72, armF: -0.6, armB: -0.6, lean: -0.1 }], [0.42, { go: 0.85, y: 1.1, armF: 2.0, armB: 2.0, armZ: 0.15, item: 0.6, legF: 0.6, legB: 0.4, sq: 1.08 }],
    [0.56, { go: 1, y: 0, armF: 1.4, armB: 0.6, armZ: 0.22, item: -2.4, lean: 0.55, sq: 0.78 }], [0.74, { go: 1, armF: 1.4, armB: 0.6, armZ: 0.22, item: -2.4, lean: 0.4, sq: 0.9 }],
    [1, { go: 0, run: 1 }]],
  cast: [[0, {}], [0.3, { armF: 2.7, armB: 0.6, lean: -0.2, sq: 0.9, item: 0.8 }], [0.45, { armF: 1.3, armFx: 0.18, armZ: 0.2, lean: 0.3, item: -1.2 }], [0.7, { armF: 1.3, armFx: 0.18, lean: 0.2 }], [1, {}]],
  skill: [[0, {}], [0.25, { sq: 0.8, armF: -0.4, armB: -0.4 }], [0.5, { y: 0.55, armF: 2.8, armB: 2.8, sq: 1.1 }], [0.75, { y: 0, sq: 0.9 }], [1, {}]],
  hit: [[0, {}], [0.2, { back: 0.35, lean: -0.45, head: 0.5, armF: 2.0, armB: 2.2, legF: 0.45, sq: 0.85 }], [1, {}]],
  hitBig: [[0, {}], [0.2, { back: 0.75, y: 0.35, lean: -0.6, head: 0.7, armF: 2.3, armB: 2.5, legF: 0.7, legB: 0.3, sq: 0.8 }], [0.55, { back: 0.5, lean: -0.3 }], [1, {}]],
  dodge: [[0, {}], [0.3, { back: 0.6, y: 0.25, lean: -0.3, sq: 0.9 }], [1, {}]],
  stunned: [[0, {}], [0.5, { head: 0.4, lean: -0.15, armF: 0.1, armB: 0.1 }], [1, {}]],
  guard: [[0, {}], [0.2, { armF: 2.3, armB: 2.1, armZ: 0.25, lean: -0.12, sq: 0.9, legF: 0.3, legB: -0.3 }], [0.8, { armF: 2.3, armB: 2.1, armZ: 0.25, lean: -0.12, sq: 0.9, legF: 0.3, legB: -0.3 }], [1, {}]],
};
const HIT_AT = { punch: 0.55, kick: 0.55, slash: 0.55, smash: 0.56, cast: 0.45, skill: 0.5 };
const DUR = { guard: 1.1, punch: 0.85, kick: 0.85, slash: 0.9, smash: 1.1, cast: 0.9, skill: 0.85, hit: 0.45, hitBig: 0.7, dodge: 0.45, stunned: 0.6 };
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

// projectiles: glowing cubes with a trail
const shots = [];
const shotGeo = new THREE.BoxGeometry(1, 1, 1);
onFrame(dt => {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.t += dt / s.dur;
    const u = Math.min(1, s.t);
    s.mesh.position.lerpVectors(s.from, s.to, u).y += Math.sin(u * Math.PI) * s.arc;
    s.mesh.rotation.x += dt * 12; s.mesh.rotation.y += dt * 9;
    spawn({ pos: s.mesh.position.clone(), vel: new THREE.Vector3(0, 0.3, 0), color: s.color, life: 0.35, size: VOX * 4, gravity: 0, glow: true, bounce: false });
    if (u >= 1) { scene.remove(s.mesh); shots.splice(i, 1); s.done(); }
  }
});
export function shoot(from, to, color, dur = 0.35, arc = 0.4) {
  return new Promise(done => {
    const mesh = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), toneMapped: false }));
    mesh.scale.setScalar(VOX * 9);
    mesh.position.copy(from);
    scene.add(mesh);
    shots.push({ mesh, from: from.clone(), to: to.clone(), color, dur, arc, t: 0, done });
  });
}

const ringGeo = new THREE.TorusGeometry(0.62, 0.035, 6, 32);
const bubbleGeo = new THREE.IcosahedronGeometry(1.1, 1);

export class Fighter {
  constructor(unit, home, team, mode = '3d') {
    this.unit = unit; this.team = team; this.dir = team === 0 ? 1 : -1;
    this.home = home.clone();
    this.mode = mode;
    this.root = buildFighter(unit.id, team === 1, mode);
    this.p = this.root.userData.parts;
    this.root.position.copy(home);
    this.turn = this.dir * 0.32;                 // 3D: turned a little toward the enemy
    this.root.rotation.y = this.face;
    this.act = null; this.flash = 0; this.ko = false; this.drop = 0; this.status = {};
    scene.add(this.root);
    // selection ring + shield bubble + stun stars
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#d4ff1f').multiplyScalar(2.5), toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false;
    this.bubble = new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: '#7fdcff', transparent: true, opacity: 0.18, depthWrite: false }));
    this.bubble.visible = false;
    this.stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe14a').multiplyScalar(3), toneMapped: false }));
      s.scale.setScalar(VOX * 6); this.stars.add(s);
    }
    this.stars.visible = false;
    // soft blob shadow (2D sprites don't cast real shadows)
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    scene.add(this.ring, this.bubble, this.stars, this.blob);
    this.colors = this.sampleColors();
    this.stopFrame = onFrame((dt, t) => this.update(dt, t));
  }
  get face() { return this.mode === '2d' ? 0 : this.turn; }
  set face(v) { this.turn = v; }
  get s() { return this.root.scale.y; }
  get head() { return this.root.position.clone().add(new THREE.Vector3(0, 1.5 * this.s, 0)); }
  get chest() { return this.root.position.clone().add(new THREE.Vector3(0, 0.9 * this.s, 0.2)); }
  // swap between the 3D model and 2D sprites without touching the battle state
  rebuild(mode) {
    if (mode === this.mode) return;
    const old = this.root;
    this.mode = mode;
    this.root = buildFighter(this.unit.id, this.team === 1, mode);
    this.p = this.root.userData.parts;
    this.root.position.copy(old.position);
    scene.remove(old);
    old.userData.materials.forEach(m => m.dispose());
    scene.add(this.root);
  }
  sampleColors() {
    const out = [], src = this.p.head?.userData.mesh?.geometry.attributes.color;
    if (!src) {                       // 2D: sample the sprite pixels instead
      const img = this.p.head?.userData.mesh?.material.map?.image;
      if (!img) return ['#ffffff'];
      const d = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
      for (let i = 0; i < 40 && out.length < 20; i++) { const k = ((Math.random() * d.length / 4) | 0) * 4; if (d[k + 3]) out.push(new THREE.Color(`rgb(${d[k]},${d[k + 1]},${d[k + 2]})`)); }
      return out.length ? out : ['#ffffff'];
    }
    for (let i = 0; i < 20; i++) { const k = ((Math.random() * src.count) | 0) * 3; out.push(new THREE.Color(src.array[k], src.array[k + 1], src.array[k + 2])); }
    return out;
  }
  play(type, extra = {}) {
    // a new animation interrupts the current one: finish the old one so nobody waits on it forever
    const prev = this.act;
    if (prev) { if (!prev.hit && prev.onHit) { prev.hit = true; prev.onHit(); } prev.res?.(); }
    return new Promise(res => { this.act = { type, t: 0, dur: DUR[type] || 0.8, hitAt: HIT_AT[type], ...extra, res }; });
  }
  // melee/cast/skill with a callback at the impact frame; resolves when the animation ends
  async perform(move, targetFighter, onHit) {
    if (move === 'cast') {
      sfx('cast');
      let hitDone;
      const hitP = new Promise(r => { hitDone = r; });
      const anim = this.play('cast', { onHit: async () => { await onHit?.(); hitDone(); } });
      await Promise.all([anim, hitP]);
      return;
    }
    if (move !== 'skill') sfx('whoosh', 0.25);
    await this.play(move, { target: targetFighter, onHit });
  }
  dropIn(delay = 0) { this.drop = 0.7 + delay; this.dropDelay = delay; }
  setSelected(on, color = '#d4ff1f') { this.ring.visible = on && !this.ko; this.ring.material.color.set(color).multiplyScalar(2.5); }
  setStatus(st, shield) {
    this.status = st || {};
    this.bubble.visible = shield > 0 && !this.ko;
    this.stars.visible = !!this.status.stun && !this.ko;
  }
  update(dt, t) {
    const { p, dir } = this, ph = t * 4.2 + this.team * 1.3 + this.home.z, bob = Math.abs(Math.sin(ph));
    const pose = {
      go: 0, back: 0, y: bob * 0.035, lean: 0.05, head: Math.sin(t * 2.1 + this.home.x) * 0.06, sq: 1 - bob * 0.03,
      armF: 0.28 + Math.sin(ph) * 0.1, armB: 0.18 - Math.sin(ph) * 0.1, armFx: 0, armZ: 0.04, item: 0.2,
      legF: 0.18, legB: -0.18, legFy: 0, legBy: 0, roll: 0, run: 0,
    };
    if (this.drop > 0) {
      this.drop = Math.max(0, this.drop - dt);
      const u = Math.min(1, this.drop / 0.7);
      pose.y += u * u * 9; pose.armF = pose.armB = 2.6 * u; pose.legF = 0.5 * u; pose.legB = -0.5 * u;
      if (this.drop === 0) { burst(this.home.clone().setY(0.1), ['#ffffff', '#d4ff1f'], 22, 0.7); shake(0.2); sfx('land'); }
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
        Object.assign(pose, { back: u * 0.5, y: Math.sin(u * Math.PI) * 0.8, roll: u * Math.PI / 2, head: u * 0.5, armF: 2.6 * u, armB: 2.2 * u, legF: 0.5 * u, legB: 0.2 * u });
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
    if (this.status.stun && !a) { pose.head += Math.sin(t * 6) * 0.15; pose.lean -= 0.1; }
    // position: home -> in front of the target
    const pos = this.home.clone();
    if (a?.target && pose.go) {
      const reach = a.target.home.clone().add(new THREE.Vector3(-this.dir * 1.45 * this.root.scale.x, 0, 0.05));
      pos.lerp(reach, pose.go);
    }
    pos.x -= dir * pose.back;
    pos.y = Math.max(0, pose.y) + (this.ko ? 0.2 * Math.min(1, pose.roll) : 0);
    this.root.position.copy(pos);
    this.root.rotation.z = dir * pose.roll;
    this.root.rotation.y = this.face;
    p.body.rotation.z = -dir * pose.lean;
    p.body.scale.set(1 + (1 - pose.sq) * 0.6, pose.sq, 1);
    if (p.head) p.head.rotation.z = dir * pose.head;
    if (p.armR) { p.armR.rotation.z = dir * pose.armF; p.armR.position.x = (p.armR.userData.x0 ??= p.armR.position.x) + dir * pose.armFx; p.armR.position.z = (p.armR.userData.z0 ??= p.armR.position.z) + pose.armZ; }
    if (p.armL) p.armL.rotation.z = dir * pose.armB;
    if (p.item) p.item.rotation.z = dir * (pose.item - 0.2);
    if (p.legR) { p.legR.rotation.z = dir * pose.legF; p.legR.position.y = (p.legR.userData.y0 ??= p.legR.position.y) + pose.legFy; }
    if (p.legL) { p.legL.rotation.z = dir * pose.legB; p.legL.position.y = (p.legL.userData.y0 ??= p.legL.position.y) + pose.legBy; }
    if (p.emote) { p.emote.position.y = (p.emote.userData.y0 ??= p.emote.position.y) + Math.sin(t * 3) * 0.06; p.emote.rotation.z = Math.sin(t * 2) * 0.2; }
    // status visuals
    this.ring.position.set(this.home.x, 0.03, this.home.z);
    this.blob.visible = this.mode === '2d';
    this.blob.position.set(this.root.position.x, 0.02, this.root.position.z);
    this.blob.scale.set(this.s * (1 - Math.min(0.5, this.root.position.y * 0.3)), this.s * 0.55, 1);
    this.ring.scale.setScalar((1 + Math.sin(t * 6) * 0.05) * this.s);
    this.bubble.position.copy(this.root.position).add(new THREE.Vector3(0, 1.05 * this.s, 0));
    this.bubble.scale.setScalar((1 + Math.sin(t * 4) * 0.03) * this.s);
    if (this.stars.visible) {
      this.stars.position.copy(this.root.position).add(new THREE.Vector3(0, 2.25 * this.s, 0));
      this.stars.children.forEach((s, i) => { const ang = t * 4 + i * 2.1; s.position.set(Math.cos(ang) * 0.45, Math.sin(t * 3 + i) * 0.05, Math.sin(ang) * 0.3); });
    }
    if (this.status.burn && !this.ko && Math.random() < dt * 14)
      spawn({ pos: this.root.position.clone().add(new THREE.Vector3((Math.random() - .5) * 0.8, 0.3 + Math.random() * 1.2, 0.3)), vel: new THREE.Vector3(0, 1.2, 0),
        color: Math.random() < 0.5 ? '#ff7a1a' : '#ffd34a', life: 0.6, size: VOX * 4, gravity: 0, glow: true, bounce: false });
    const aura = this.root.userData.aura;
    if (aura && !this.ko) {
      this.auraAcc = (this.auraAcc || 0) + dt * aura.rate;
      while (this.auraAcc > 1) {
        this.auraAcc--;
        const [ax, ay] = aura.at, sp = aura.spread;
        spawn({ pos: this.root.position.clone().add(new THREE.Vector3(ax + (Math.random() - .5) * sp, ay + (Math.random() - .5) * sp * 0.8, (Math.random() - .5) * sp * 0.6)),
          vel: new THREE.Vector3((Math.random() - .5) * 0.3, aura.rise * (0.6 + Math.random() * 0.8), (Math.random() - .5) * 0.3),
          color: aura.colors[(Math.random() * aura.colors.length) | 0], life: 1 + Math.random(), size: VOX * (2 + Math.random() * 2), gravity: 0, glow: true, bounce: false });
      }
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    for (const m of this.root.userData.materials) m.emissive.setScalar(this.flash * 0.6);
  }
  dispose() {
    this.stopFrame();
    scene.remove(this.root, this.ring, this.bubble, this.stars, this.blob);
    this.root.userData.materials.forEach(m => m.dispose());
  }
}
