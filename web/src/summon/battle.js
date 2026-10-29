// The duel drawn by code on one canvas, in the island's pixel style: a landscape island arena (animated water,
// swaying trees, flowers), two crystal gates with the summoners, and the creatures with smooth procedural animation
// (breathing, hopping walk with squash and stretch, wind-up and lunge, hit flash and knockback, fainting, summon pop),
// particles, projectiles, screen shake. app.js tells it what is on the board; it animates everything in between.
import { rng, makeNoise, fbm, bayer, pick, rgba, toCanvas, sprite } from '../island/pixel.js';
import { sprites } from '../island/art.js';
import { creatureSprite } from './art.js';
import { chibi } from '../island/chibi.js';
import { CARD, FAMILY, ELEMENT_INFO } from './cards.js';

export const BW = 480, BH = 270;                                   // world size in pixels (16:9)
export const LANE = { x0: 112, x1: 368, y: [78, 120, 162], h: 30 }; // the three dirt lanes (left → right)
export const GATE_X = [62, 418];
const GATE_Y = 120;

// ---------- the arena (drawn once) ----------
const C = { deep: '#2f78c4', water: '#3f95dc', shallow: '#7fd0f4', foam: '#eafaff', sand: '#f0d796', sandD: '#d9bb78',
  cliff: '#a86e3e', cliffD: '#7c4c2a', cliffL: '#c98e55', g: ['#4a9c38', '#5cb046', '#6cc24f', '#86d65e'], dirt: ['#8f6136', '#a8743f', '#c08a50', '#d6a565'],
  stone: ['#5b5a6e', '#7c7b8f', '#a3a2b5', '#cfcfdc'] };
function land(n, x, y) {
  const dx = (x - 240) / 224, dy = (y - 118) / 106;
  return Math.pow(Math.abs(dx) ** 4 + Math.abs(dy) ** 4, 0.25) + (fbm(n, x / 26, y / 26, 3) - 0.5) * 0.12 < 1;
}
function inLane(x, y, pad = 0) { return x > LANE.x0 - 10 - pad && x < LANE.x1 + 10 + pad && LANE.y.some(ly => Math.abs(y - ly) < LANE.h / 2 + 2 + pad); }
function nearGate(x, y, pad = 0) { return GATE_X.some(gx => Math.hypot((x - gx) / 30, (y - GATE_Y) / 40) < 1 + pad); }
let arena = null;
function buildArena(seed = 21) {
  const n = makeNoise(seed), n2 = makeNoise(seed + 5), r = rng(seed), N = BW * BH;
  const px = new Uint32Array(N), foam = new Uint32Array(N), L = new Uint8Array(N);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) L[y * BW + x] = land(n, x, y) ? 1 : 0;
  const isL = (x, y) => (x |= 0, y |= 0, x >= 0 && y >= 0 && x < BW && y < BH && L[y * BW + x]);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const k = y * BW + x, d = bayer(x, y);
    let col;
    if (isL(x, y)) {
      const below = !isL(x, y + 2), edge = !isL(x - 2, y) || !isL(x + 2, y) || !isL(x, y - 2);
      if (below || edge) col = (x + y) % 3 ? C.sand : C.sandD;
      else { const v = fbm(n2, x / 22, y / 22, 2) + (((x >> 3) + (y >> 3)) & 1) * 0.08 + (d - 0.5) * 0.15; col = C.g[Math.max(0, Math.min(3, Math.round(v * 3.2 - 0.3)))]; }
    } else {
      let up = 0;
      for (let j = 1; j <= 9; j++) if (isL(x, y - j)) { up = j; break; }
      if (up && y > 126) col = up <= 2 ? C.cliffL : up < 8 ? ((x % 6 === 0) ? C.cliffD : C.cliff) : C.cliffD;
      else {
        let near = 99;
        for (const [dx, dy] of [[0, -3], [0, 3], [-3, 0], [3, 0], [0, -6], [0, 6], [-6, 0], [6, 0]]) if (isL(x + dx, y + dy)) near = Math.min(near, Math.abs(dx) + Math.abs(dy));
        col = near <= 3 ? C.shallow : fbm(n2, x / 18, y / 7, 2) + d * 0.25 > 0.66 ? C.water : C.deep;
        if (near <= 6 && near > 3) foam[k] = rgba(C.foam);
      }
    }
    px[k] = rgba(col);
  }
  const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < BW && y < BH) px[y * BW + x] = rgba(c); };
  // dirt lanes with ragged edges and pebbles
  LANE.y.forEach(ly => {
    for (let y = ly - LANE.h / 2 - 2; y <= ly + LANE.h / 2 + 2; y++) for (let x = LANE.x0 - 12; x <= LANE.x1 + 12; x++) {
      const ex = Math.max(0, LANE.x0 - 4 - x, x - LANE.x1 - 4), ey = Math.abs(y - ly) - (LANE.h / 2 - 2);
      const e = Math.hypot(Math.max(0, ex), Math.max(0, ey)) + (n(x / 3, y / 3) - 0.5) * 2.5;
      if (e > 5) continue;
      put(x, y, e > 3.6 ? C.dirt[0] : pick(C.dirt, 0.55 + (n(x / 2, y / 2) - 0.5) * 0.5 - (y - ly) / 60, x, y));
    }
    for (let x = LANE.x0 - 6; x <= LANE.x1 + 6; x += 7 + ((x * 7) % 3)) for (const sy of [-1, 1]) {
      const y = ly + sy * (LANE.h / 2 + 1) + ((x * 13) % 3) - 1;
      put(x, y, C.stone[2]); put(x + 1, y, C.stone[1]); put(x, y + 1, C.stone[1]); put(x + 1, y + 1, C.stone[0]); put(x, y - 1, C.stone[3]);
    }
    for (let i = 0; i < 22; i++) { const x = LANE.x0 + r() * (LANE.x1 - LANE.x0), y = ly + (r() - 0.5) * (LANE.h - 10); put(x, y, C.dirt[3]); put(x + 1, y, C.dirt[0]); }
  });
  // stone gate platforms
  GATE_X.forEach(gx => {
    for (let y = GATE_Y - 36; y <= GATE_Y + 36; y++) for (let x = gx - 30; x <= gx + 30; x++) {
      const q = ((x - gx) / 28) ** 2 + ((y - GATE_Y) / 34) ** 2;
      if (q > 1) continue;
      const row = ((y - GATE_Y + 40) / 5) | 0, mortar = (y - GATE_Y + 40) % 5 === 0 || (x + row * 4) % 9 === 0;
      put(x, y, q > 0.86 ? C.stone[0] : mortar ? C.stone[1] : pick(C.stone, 0.62 + (n(x / 4, y / 4) - 0.5) * 0.4, x, y));
    }
  });
  // flowers and grass tufts
  for (let i = 0; i < 900; i++) {
    const x = r() * BW | 0, y = r() * BH | 0;
    if (!isL(x, y) || !isL(x, y + 4) || inLane(x, y, 4) || nearGate(x, y, 0.15)) continue;
    if (r() < 0.3) { const c = ['#ff6fae', '#ffffff', '#ffd84a', '#c9a6ff', '#ff8a5a'][(r() * 5) | 0]; put(x, y, c); put(x - 1, y, c); put(x + 1, y, c); put(x, y - 1, c); put(x, y, '#ffe27a'); }
    else { put(x, y, '#3f8a31'); put(x - 1, y - 1, '#3f8a31'); put(x + 1, y - 1, '#3f8a31'); }
  }
  // props: trees, bushes and rocks around the edge (not on lanes or gates)
  const props = [];
  const free = (x, y, rr) => isL(x, y) && isL(x, y + 2) && !inLane(x, y, rr) && !nearGate(x, y, 0.35) && !props.some(p => Math.hypot(p.x - x, (p.y - y) * 1.4) < rr + 6);
  const kinds = ['leaf', 'leaf', 'pine', 'blossom', 'leaf', 'autumn'];
  for (let i = 0; i < 400 && props.length < 34; i++) {
    const x = 20 + r() * (BW - 40), y = 30 + r() * (BH - 70), t = r();
    if (!free(x, y, 10)) continue;
    if (t < 0.5) props.push({ x, y, spr: sprites.tree(kinds[(r() * kinds.length) | 0], (r() * 3) | 0), sway: r() * 6 });
    else if (t < 0.8) props.push({ x, y, spr: sprites.bush((r() * 3) | 0) });
    else props.push({ x, y, spr: sprites.rock((r() * 3) | 0) });
  }
  const sparks = [];
  for (let i = 0; i < 3000 && sparks.length < 260; i++) { const x = r() * BW | 0, y = r() * BH | 0; if (!isL(x, y) && !isL(x, y - 6)) sparks.push({ x, y }); }
  arena = { base: toCanvas(px, BW, BH), foam: toCanvas(foam, BW, BH), props, sparks };
}

// ---------- crystal gate (pillars + arch; the crystal is drawn live so it can float and glow) ----------
const gateCache = {};
function gateBody(mine) {
  if (gateCache[mine]) return gateCache[mine];
  const S = C.stone, banner = mine ? ['#2f7a2c', '#58b046', '#9be05a'] : ['#8a1f3a', '#d9466a', '#ff8aa5'];
  gateCache[mine] = sprite(46, 40, set => {
    for (const p0 of [3, 35]) for (let y = 8; y < 40; y++) for (let x = p0; x < p0 + 8; x++) set(x, y, S[x === p0 ? 3 : x === p0 + 7 ? 0 : (y & 3) === 0 ? 1 : 2]);
    for (let x = 0; x < 46; x++) for (let y = 4; y < 10; y++) { const arch = y > 6 && x > 12 && x < 34; if (!arch) set(x, y, S[y === 4 ? 3 : y === 9 ? 0 : 2]); }
    for (let x = 11; x <= 35; x++) { const y = 10 + Math.round(Math.abs(x - 23) * 0.35); set(x, y, S[2]); set(x, y + 1, S[1]); }
    for (const p0 of [4, 36]) for (let y = 12; y < 28; y++) for (let x = p0; x < p0 + 6; x++) {
      if (y > 24 && ((x - p0) % 3 === 1) === (y > 26)) continue;
      set(x, y, banner[x === p0 ? 2 : y % 7 === 0 ? 0 : 1]);
    }
    for (const p0 of [4, 36]) { set(p0 + 2, 17, '#fff8e4'); set(p0 + 3, 17, '#fff8e4'); set(p0 + 2, 18, '#fff8e4'); set(p0 + 3, 19, '#fff8e4'); }
  });
  return gateCache[mine];
}
const CRYSTAL = [['#6f9a00', '#a8d400', '#d4ff1f', '#f6ffc4'], ['#9e2f4a', '#e0507a', '#ff8aa8', '#ffe0ea']];

// ---------- state ----------
let cv = null, g = null, running = false, raf = 0, last = 0, T = 0, W = 1, H = 1, DPR = 1;
const units = new Map();     // key -> unit
let parts = [], shots = [], shakeAmt = 0, flashA = 0, flashC = '#fff';
const gates = [{ mind: null, anim: null, t: 0, hp: 1 }, { mind: null, anim: null, t: 0, hp: 1 }];
const whiteCache = new Map();
function whiteOf(spr) {
  if (whiteCache.has(spr)) return whiteCache.get(spr);
  const c = document.createElement('canvas'); c.width = spr.w; c.height = spr.h;
  const x = c.getContext('2d'); x.drawImage(spr.cv, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  whiteCache.set(spr, c); return c;
}
const posX = (side, pos) => side === 0 ? LANE.x0 + (LANE.x1 - LANE.x0) * pos : LANE.x1 - (LANE.x1 - LANE.x0) * pos;

// ---------- public API ----------
export function mount(canvas) {
  cv = canvas; g = cv.getContext('2d');
  if (!arena) buildArena();
  resize();
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function unmount() { running = false; cancelAnimationFrame(raf); units.clear(); parts = []; shots = []; }
export function setSummoners(minds) { minds.forEach((m, i) => { gates[i].mind = m; gates[i].anim = null; gates[i].hp = 1; }); }
export function setGateHp(side, frac) { gates[side].hp = Math.max(0, Math.min(1, frac)); }
// list: [{ key, side, lane, id, pos, hp, maxHp, atk, temp, ghost }]
export function setUnits(list) {
  const seen = new Set();
  for (const u of list) {
    seen.add(u.key);
    const tx = posX(u.side, u.pos ?? 0.04);
    let o = units.get(u.key);
    if (!o || o.dead) {
      o = { key: u.key, x: tx, ph: Math.random() * 6, spawn: 0, hurt: 0, atk: 0, die: 0, dead: false, seed: Math.random() * 6 };
      units.set(u.key, o);
      if (!u.ghost) dust(tx, LANE.y[u.lane] + 8, '#e8d2a2', 8);
    }
    Object.assign(o, { id: u.id, side: u.side, lane: u.lane, tx, hp: u.hp ?? u.maxHp, maxHp: u.maxHp ?? u.hp, power: Math.max(0, (u.atk ?? CARD[u.id].power) + (u.temp || 0)), temp: u.temp || 0, ghost: !!u.ghost });
  }
  for (const [k, o] of units) if (!seen.has(k) && !o.dead) startDie(o);
}
export function unitAnim(key, kind) {
  const o = units.get(key); if (!o) return;
  if (kind === 'hurt') { o.hurt = 0.32; hitSparks(o); }
  else if (kind === 'die') startDie(o);
  else if (kind === 'jab-up' || kind === 'jab-dn' || kind === 'jab') o.atk = 0.34;
  else if (kind === 'popin' || kind === 'flipin') { o.spawn = 0.4; dust(o.x, LANE.y[o.lane] + 8, '#e8d2a2', 10); }
}
export function gateAnim(side, kind) {
  const gt = gates[side];
  gt.anim = kind; gt.t = 0;
  if (kind === 'ouch') { shakeAmt = Math.max(shakeAmt, 3); burst(GATE_X[side], GATE_Y - 18, CRYSTAL[side], 14, 50); }
  if (kind === 'cast') ring(GATE_X[side], GATE_Y - 4, CRYSTAL[side][2]);
}
// fire something from a creature toward a target creature (or the gate when toKey is null)
export function shoot(fromKey, toKey, side) {
  const a = units.get(fromKey); if (!a) return;
  const b = toKey ? units.get(toKey) : null, el = ELEMENT_INFO[CARD[a.id].el].color;
  shots.push({ x: a.x, y: LANE.y[a.lane] - 6, tx: b ? b.x : GATE_X[side], ty: b ? LANE.y[b.lane] - 6 : GATE_Y - 10, t: 0, col: el });
}
export function shake(n) { shakeAmt = Math.max(shakeAmt, n); }
export function flash(col = '#fff', a = 0.5) { flashC = col; flashA = a; }
// page rectangle of a creature / a gate (for floating numbers drawn in HTML)
export function rectOf(key) {
  const o = units.get(key); if (!o || !cv) return null;
  return toPage(o.x - 9, LANE.y[o.lane] - 24, 18, 26);
}
export function gateRect(side) { return toPage(GATE_X[side] - 20, GATE_Y - 46, 40, 40); }
function toPage(x, y, w, h) {
  const r = cv.getBoundingClientRect(), s = r.width / BW;
  return { left: r.left + x * s, top: r.top + y * s, width: w * s, height: h * s, right: r.left + (x + w) * s, bottom: r.top + (y + h) * s };
}
// which lane a page point is on (or -1)
export function laneAt(clientX, clientY) {
  const r = cv.getBoundingClientRect(), x = (clientX - r.left) / r.width * BW, y = (clientY - r.top) / r.height * BH;
  if (x < LANE.x0 - 24 || x > LANE.x1 + 24) return -1;
  let best = -1, bd = 1e9;
  LANE.y.forEach((ly, i) => { const d = Math.abs(y - ly); if (d < bd && d < LANE.h) { bd = d; best = i; } });
  return best;
}

// ---------- effects ----------
function startDie(o) { if (o.dead) return; o.dead = true; o.die = 0.55; burst(o.x, LANE.y[o.lane] - 8, ['#ffffff', '#fff3b0', ELEMENT_INFO[CARD[o.id].el].color], 16, 70); }
function burst(x, y, cols, n = 12, sp = 60) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, g: 120, life: 0.5 + Math.random() * 0.3, max: 0.8, c: cols[(Math.random() * cols.length) | 0], s: 1 + (Math.random() * 2 | 0) }); } }
function dust(x, y, c, n = 8) { for (let i = 0; i < n; i++) parts.push({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 20, g: 30, life: 0.45, max: 0.45, c, s: 2 }); }
function ring(x, y, c) { for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; parts.push({ x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 30, g: 0, life: 0.5, max: 0.5, c, s: 2 }); } }
function hitSparks(o) { burst(o.x - (o.side ? -6 : 6), LANE.y[o.lane] - 8, ['#ffffff', '#ffe27a', '#ff8a5a'], 8, 50); }

// ---------- drawing ----------
function resize() {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  DPR = Math.min(2, devicePixelRatio || 1);
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  const r = cv.getBoundingClientRect();
  if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) resize();
  const s = (W / BW) * DPR, sx = (Math.random() - 0.5) * shakeAmt, sy = (Math.random() - 0.5) * shakeAmt;
  shakeAmt = Math.max(0, shakeAmt - dt * 18);
  g.setTransform(s, 0, 0, s, sx * s, sy * s);
  g.imageSmoothingEnabled = false;
  g.drawImage(arena.base.cv, 0, 0);
  const wave = Math.sin(T * 1.6);
  g.globalAlpha = 0.35 + 0.35 * wave; g.drawImage(arena.foam.cv, 0, 0); g.globalAlpha = 1;
  // water sparkles
  for (let i = 0; i < 18; i++) {
    const sp = arena.sparks[(i * 37 + Math.floor(T * 3)) % arena.sparks.length], a = Math.sin(T * 3 + i) * 0.5 + 0.5;
    g.globalAlpha = a * 0.8; g.fillStyle = '#fff'; g.fillRect(sp.x, sp.y, 3, 1);
  }
  g.globalAlpha = 1;
  // everything that stands, sorted by its feet
  const items = arena.props.map(p => ({ y: p.y, p }));
  gates.forEach((gt, i) => items.push({ y: GATE_Y + 12, gate: i }));
  for (const o of units.values()) items.push({ y: LANE.y[o.lane] + 8 + (o.side ? 0.1 : 0), u: o });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.p) {
      const p = it.p, sw = p.sway != null ? Math.round(Math.sin(T * 1.3 + p.sway) * 0.7) : 0;
      if (p.sway != null) { g.fillStyle = 'rgba(29,27,47,.22)'; g.beginPath(); g.ellipse(p.x, p.y, 9, 3, 0, 0, Math.PI * 2); g.fill(); }
      g.drawImage(p.spr.cv, Math.round(p.x - p.spr.w / 2) + sw, Math.round(p.y - p.spr.h + 1));
    } else if (it.gate != null) drawGate(it.gate, dt);
    else drawUnit(it.u, dt);
  }
  for (const [k, o] of units) if (o.dead && o.die <= 0) units.delete(k);
  // projectiles
  shots = shots.filter(p => {
    p.t += dt / 0.22;
    const u = Math.min(1, p.t), x = p.x + (p.tx - p.x) * u, y = p.y + (p.ty - p.y) * u - Math.sin(u * Math.PI) * 10;
    g.fillStyle = p.col; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4); g.fillStyle = '#fff'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    parts.push({ x, y, vx: 0, vy: 0, g: 0, life: 0.2, max: 0.2, c: p.col, s: 2 });
    if (u >= 1) { burst(p.tx, p.ty, [p.col, '#fff'], 8, 40); return false; }
    return true;
  });
  // particles
  parts = parts.filter(q => {
    q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    g.globalAlpha = Math.max(0, Math.min(1, q.life / q.max * 1.6)); g.fillStyle = q.c; g.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
    return q.life > 0;
  });
  g.globalAlpha = 1;
  if (flashA > 0.01) { g.globalAlpha = flashA; g.fillStyle = flashC; g.fillRect(-10, -10, BW + 20, BH + 20); g.globalAlpha = 1; flashA *= Math.pow(0.02, dt); }
}
function drawUnit(o, dt) {
  const spr = creatureSprite(o.id), dir = o.side ? -1 : 1, ly = LANE.y[o.lane] + 8;
  const moving = Math.abs(o.tx - o.x) > 0.15;
  o.x += (o.tx - o.x) * Math.min(1, dt * 14);
  if (moving) o.ph += dt * 14 * Math.min(1.6, FAMILY[CARD[o.id].fam].speed * 9);
  o.hurt = Math.max(0, o.hurt - dt); o.atk = Math.max(0, o.atk - dt); o.spawn = Math.max(0, o.spawn - dt); if (o.dead) o.die -= dt;
  // pose: idle breathing, hopping walk, wind-up + lunge, knockback, fainting
  let bob, sqx = 1, sqy = 1, off = 0, rot = 0, alpha = o.ghost ? 0.55 : 1;
  if (moving) { const w = Math.sin(o.ph); bob = Math.abs(w) * 3; sqy = 1 + (Math.abs(w) - 0.5) * 0.1; sqx = 2 - sqy; }
  else { const b = Math.sin(T * 2.4 + o.seed); bob = 0; sqy = 1 + b * 0.035; sqx = 1 - b * 0.03; }
  if (o.atk > 0) { const u = 1 - o.atk / 0.34; off = u < 0.35 ? -3 * (u / 0.35) : u < 0.55 ? -3 + 11 * ((u - 0.35) / 0.2) : 8 * (1 - (u - 0.55) / 0.45); sqx *= u > 0.35 && u < 0.6 ? 1.15 : 1; sqy *= u > 0.35 && u < 0.6 ? 0.9 : 1; }
  if (o.hurt > 0) { off -= 4 * (o.hurt / 0.32); rot = -0.15 * dir * (o.hurt / 0.32); }
  if (o.spawn > 0) { const u = 1 - o.spawn / 0.4, k = u < 0.6 ? u / 0.6 * 1.18 : 1.18 - 0.18 * (u - 0.6) / 0.4; sqx *= k; sqy *= k; bob += (1 - u) * 6; }
  if (o.dead) { const u = 1 - Math.max(0, o.die) / 0.55; alpha *= 1 - u; rot += u * 1.2 * dir; sqy *= 1 - u * 0.5; bob += u * 6; }
  if (o.ghost) bob += Math.sin(T * 4) * 1.5;
  const x = o.x + off * dir;
  // shadow + team ring
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(29,27,47,.25)'; g.beginPath(); g.ellipse(x, ly, spr.w * 0.32, 2.6, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = o.side ? '#ff5a6a' : '#7fff4a'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, ly, spr.w * 0.36, 3.2, 0, 0, Math.PI * 2); g.stroke();
  g.save();
  g.translate(Math.round(x), Math.round(ly - bob));
  g.rotate(rot);
  g.scale(dir * sqx, sqy);
  g.drawImage(spr.cv, -Math.round(spr.w / 2), -spr.h + 2);
  if (o.hurt > 0.12) { g.globalAlpha = alpha * 0.85; g.drawImage(whiteOf(spr), -Math.round(spr.w / 2), -spr.h + 2); }
  g.restore();
  g.globalAlpha = 1;
  if (o.ghost || o.dead) return;
  // HP bar and power badge
  const top = Math.round(ly - spr.h - 5 - bob), bw = 16, frac = Math.max(0, Math.min(1, o.hp / (o.maxHp || 1)));
  g.fillStyle = '#1d1b2f'; g.fillRect(Math.round(x - bw / 2) - 1, top - 1, bw + 2, 4);
  g.fillStyle = o.side ? '#ff5a6a' : '#6fe04a'; g.fillRect(Math.round(x - bw / 2), top, Math.round(bw * frac), 2);
  g.fillStyle = '#1d1b2f'; g.fillRect(Math.round(x + bw / 2) + 1, top - 3, 7, 7);
  g.fillStyle = o.temp > 0 ? '#9bff6a' : o.temp < 0 ? '#ff8a8a' : '#ffffff'; g.font = '700 7px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(o.power), Math.round(x + bw / 2) + 4.5, top + 0.5);
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
}
function drawGate(i, dt) {
  const gt = gates[i], x = GATE_X[i], body = gateBody(i === 0);
  gt.t += dt;
  const hit = gt.anim === 'ouch' && gt.t < 0.3, jx = hit ? (Math.random() - 0.5) * 3 : 0;
  g.drawImage(body.cv, Math.round(x - body.w / 2 + jx), GATE_Y - body.h + 6);
  // floating crystal: bobs, glows, dims as the summoner loses HP
  const cy = GATE_Y - 40 + Math.sin(T * 2 + i) * 2, ramp = CRYSTAL[i], glow = 0.5 + 0.5 * Math.sin(T * 3 + i);
  g.globalAlpha = 0.25 + 0.25 * glow * gt.hp; g.fillStyle = ramp[2]; g.beginPath(); g.arc(x, cy, 9, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  for (let yy = -8; yy <= 8; yy++) { const hw = Math.round((8 - Math.abs(yy)) * 0.62); for (let xx = -hw; xx <= hw; xx++) { g.fillStyle = hit ? '#ffffff' : ramp[Math.max(0, Math.min(3, Math.round(2.2 - xx / 3 - yy / 6 + (gt.hp - 1))))]; g.fillRect(Math.round(x + xx + jx), Math.round(cy + yy), 1, 1); } }
  if (gt.hp < 0.5) { g.fillStyle = '#1d1b2f'; g.fillRect(Math.round(x - 1), Math.round(cy - 3), 1, 4); g.fillRect(Math.round(x), Math.round(cy + 1), 1, 3); }
  if (Math.random() < dt * 4) parts.push({ x: x + (Math.random() - 0.5) * 10, y: cy, vx: 0, vy: -12, g: 0, life: 0.8, max: 0.8, c: ramp[3], s: 1 });
  // the summoner (the Mind) standing in front of the gate
  if (!gt.mind) return;
  const c = chibi(gt.mind), k = 0.5, dir = i ? -1 : 1;
  let bob = Math.sin(T * 2.2 + i) > 0.6 ? 1 : 0, hop = 0, tilt = 0;
  if (gt.anim === 'cast' && gt.t < 0.6) hop = Math.sin(gt.t / 0.6 * Math.PI) * 8;
  if (gt.anim === 'win') hop = Math.abs(Math.sin(gt.t * 6)) * 6;
  if (gt.anim === 'ko') tilt = Math.min(1.4, gt.t * 3) * dir;
  const fx = x + dir * 2 + jx, fy = GATE_Y + 18;
  g.fillStyle = 'rgba(29,27,47,.3)'; g.beginPath(); g.ellipse(fx, fy, 7, 2.4, 0, 0, Math.PI * 2); g.fill();
  g.save();
  g.translate(Math.round(fx), Math.round(fy - hop));
  g.rotate(tilt); g.scale(k * dir, k);
  g.drawImage(c.full.cv, -Math.floor(c.full.w / 2), -c.full.h + 1 - bob * 2);
  if (hit) { g.globalAlpha = 0.7; g.drawImage(whiteOf(c.full), -Math.floor(c.full.w / 2), -c.full.h + 1); g.globalAlpha = 1; }
  g.restore();
}
