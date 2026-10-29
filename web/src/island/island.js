// Mind Island (test): your own island drawn by code, with your real Minds walking around on it.
// Drag to look around, scroll / pinch to zoom, tap a Mind. Visual only for now (no saving, no farming yet).
import { buildRig, VOX, GROUND, MID_X, rarityOf } from '../nft2d.js';
import { sfx } from '../audio.js';
import { generateWorld, heart, WW, WH } from './art.js';
import { rng } from './pixel.js';

const cv = document.getElementById('island-cv');
const g = cv.getContext('2d');
const K = 12;                      // island pixels per Mind rig unit (a Mind is ~20px tall, a bit taller than the door)
const SPEED = 15;                  // walking speed, island px / s
let world = null, minds = [], fx = [], running = false, raf = 0, last = 0, T = 0, onTap = () => {};
let W = 1, H = 1, DPR = 1, zMin = 2, zMax = 8, selected = null, selectedT = 0;
const cam = { x: WW / 2, y: WH / 2, z: 3 };
const clouds = [];

function hourNow() {
  const q = new URLSearchParams(location.search).get('hour');   // ?hour=21 previews the night
  return q !== null ? +q : new Date().getHours() + new Date().getMinutes() / 60;
}
// sky tint by the player's local time: [colour, alpha], and whether lamps are on
function light() {
  const h = hourNow();
  if (h >= 7 && h < 17) return { tint: null, night: 0 };
  if (h >= 17 && h < 19) return { tint: '#ff8a4a', a: 0.14 * (h - 17) / 2 + 0.04, night: 0 };
  if (h >= 5 && h < 7) return { tint: '#ffb07a', a: 0.12, night: 0 };
  return { tint: '#1d2560', a: 0.42, night: 1 };
}

function resize() {
  if (!innerWidth || !innerHeight) return;   // hidden window: keep the old size until it shows again
  DPR = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  zMin = Math.max(W / WW, H / WH);
  zMax = Math.max(zMin * 3.5, 6);
  cam.z = Math.min(zMax, Math.max(zMin, cam.z));
  clampCam();
}
function clampCam() {
  const hw = W / 2 / cam.z, hh = H / 2 / cam.z;
  cam.x = Math.min(WW - hw, Math.max(hw, cam.x));
  cam.y = Math.min(WH - hh, Math.max(hh, cam.y));
}
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y });

// ---------- Minds ----------
function makeMind(id, i) {
  const r = rng(id * 2654435761);
  let x = world.door.x, y = world.door.y + 14;
  for (let k = 0; k < 60; k++) {
    const a = r() * Math.PI * 2, d = 10 + r() * 50, X = world.door.x + Math.cos(a) * d, Y = world.door.y + 16 + Math.sin(a) * d * 0.7;
    if (world.walk(X, Y)) { x = X; y = Y; break; }
  }
  return { id, rig: buildRig(id), x, y, tx: x, ty: y, dir: r() < 0.5 ? 1 : -1, state: 'idle', timer: 0.5 + i * 0.4 + r() * 2, phase: r() * 6, hop: 0, r, pose: {} };
}
function clearLine(ax, ay, bx, by) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
  for (let i = 1; i <= n; i++) if (!world.walk(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
  return true;
}
function updateMind(m, dt, night) {
  m.hop = Math.max(0, m.hop - dt);
  if (m.state === 'walk') {
    const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
    if (d < 1) { m.state = 'idle'; m.timer = 1.5 + m.r() * 4; if (m.r() < (night ? 0.5 : 0.15)) emote(m, night ? 'zzz' : 'heart'); }
    else { const s = Math.min(d, SPEED * dt); m.x += dx / d * s; m.y += dy / d * s; m.phase += dt * 11; if (Math.abs(dx) > 0.5) m.dir = dx > 0 ? 1 : -1; }
  } else if ((m.timer -= dt) <= 0) {
    for (let k = 0; k < 24; k++) {
      const a = m.r() * Math.PI * 2, d = 16 + m.r() * 60, X = m.x + Math.cos(a) * d, Y = m.y + Math.sin(a) * d * 0.7;
      if (world.walk(X, Y) && clearLine(m.x, m.y, X, Y)) { m.tx = X; m.ty = Y; m.state = 'walk'; break; }
    }
    if (m.state !== 'walk') m.timer = 1;
  }
  const walking = m.state === 'walk', s = Math.sin(m.phase), b = Math.sin(T * 2.4 + m.id);
  m.pose = walking
    ? { y: Math.abs(s) * 0.06, lean: 0.06, head: s * 0.04, sq: 1 - Math.abs(s) * 0.03, armF: 0.3 - s * 0.55, armB: 0.2 + s * 0.55, item: 0.2, legF: s * 0.6, legB: -s * 0.6 }
    : { y: 0, lean: 0.03, head: b * 0.07, sq: 1 - (b + 1) * 0.012, armF: 0.28 + b * 0.06, armB: 0.18 - b * 0.06, item: 0.2, legF: 0.15, legB: -0.15 };
  if (m.hop > 0) { const u = 1 - m.hop / 0.5; m.pose.y = Math.sin(u * Math.PI) * 0.5; m.pose.armF = m.pose.armB = 2.6 * Math.sin(u * Math.PI); }
}
const PV = pv => ({ x: (pv.x - MID_X) * VOX, y: (pv.y - GROUND) * VOX });
function drawMind(m) {
  const P = m.pose, R = m.rig, parts = R.parts, pv = R.pivots;
  g.fillStyle = 'rgba(43,35,64,.28)';
  g.beginPath(); g.ellipse(m.x, m.y, 5 * (1 - P.y * 0.5), 1.8 * (1 - P.y * 0.5), 0, 0, Math.PI * 2); g.fill();
  const part = (name, rot = 0) => {
    const p = parts[name]; if (!p) return;
    g.save(); g.rotate(-rot); g.drawImage(p.cv, p.ox * VOX, p.oy * VOX, p.w * VOX, p.h * VOX); g.restore();
  };
  const at = (name, from, fn) => { const a = PV(pv[name]), b = from ? PV(pv[from]) : { x: 0, y: 0 }; g.save(); g.translate(a.x - b.x, a.y - b.y); fn(); g.restore(); };
  g.save();
  g.imageSmoothingEnabled = true;
  g.translate(m.x, m.y - P.y * K);
  g.scale(m.dir * K, K);
  at('legL', null, () => part('legL', P.legB));
  at('legR', null, () => part('legR', P.legF));
  at('torso', null, () => {
    g.rotate(P.lean); g.scale(1 + (1 - P.sq) * 0.6, P.sq);
    at('armL', 'torso', () => part('armL', P.armB));
    part('torso');
    if (parts.item) at('armR', 'torso', () => { g.rotate(-P.armF); at('item', 'armR', () => part('item', P.item - 0.2)); });
    at('head', 'torso', () => part('head', P.head));
    at('armR', 'torso', () => part('armR', P.armF));
    if (parts.emote) at('emote', 'torso', () => part('emote', Math.sin(T * 2) * 0.2));
  });
  g.restore();
  g.imageSmoothingEnabled = false;
}
function emote(m, type) { fx.push({ type, x: m.x, y: m.y - 24, life: 1.6, max: 1.6 }); }

// ---------- effects ----------
function spawnFx(dt, L) {
  const p = world.props.find(q => q.kind === 'house');
  if (p && Math.random() < dt * 2.2) fx.push({ type: 'smoke', x: p.chimney.x + (Math.random() - 0.5) * 2, y: p.chimney.y, vx: 2 + Math.random() * 2, vy: -6 - Math.random() * 3, life: 3, max: 3 });
  if (Math.random() < dt * 3) fx.push({ type: 'glow', x: world.well.x + (Math.random() - 0.5) * 12, y: world.well.y - 9, vx: 0, vy: -5 - Math.random() * 4, life: 1.4, max: 1.4 });
  if (Math.random() < dt * 14) { const w = world.waterPts[(Math.random() * world.waterPts.length) | 0]; fx.push({ type: 'spark', x: w.x, y: w.y, life: 0.9, max: 0.9 }); }
  for (const c of world.props) if (c.kind === 'crop' && c.plot.stage === 3 && Math.random() < dt * 0.6) fx.push({ type: 'star', x: c.x + (Math.random() - 0.5) * 10, y: c.y - 6 - Math.random() * 8, life: 0.8, max: 0.8 });
  if (L.night && Math.random() < dt * 4) { const f = world.flowerSpots[(Math.random() * world.flowerSpots.length) | 0]; if (f) fx.push({ type: 'firefly', x: f.x, y: f.y - 6, vx: (Math.random() - 0.5) * 6, vy: -2, life: 3, max: 3, ph: Math.random() * 6 }); }
}
function drawFx(list, dt) {
  for (const f of list) {
    f.life -= dt;
    if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; }
    const u = f.life / f.max;
    if (f.type === 'smoke') { const s = 2 + (1 - u) * 5; g.globalAlpha = u * 0.55; g.fillStyle = '#ffffff'; g.fillRect(Math.round(f.x - s / 2), Math.round(f.y - s / 2), Math.round(s), Math.round(s)); }
    else if (f.type === 'glow') { g.globalAlpha = u; g.fillStyle = u > 0.5 ? '#f1ffa8' : '#d4ff1f'; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
    else if (f.type === 'spark') { g.globalAlpha = Math.sin(u * Math.PI) * 0.9; g.fillStyle = '#ffffff'; g.fillRect(Math.round(f.x) - 1, Math.round(f.y), 3, 1); }
    else if (f.type === 'star') { g.globalAlpha = Math.sin(u * Math.PI); g.fillStyle = '#fff3b0'; const x = Math.round(f.x), y = Math.round(f.y); g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
    else if (f.type === 'firefly') { f.vx += Math.sin(T * 3 + f.ph) * dt * 8; g.globalAlpha = Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(T * 9 + f.ph)); g.fillStyle = '#e8ff7a'; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
    else if (f.type === 'heart') { g.globalAlpha = Math.min(1, u * 3); g.drawImage(heart.cv, Math.round(f.x - heart.w / 2), Math.round(f.y - (1 - u) * 6)); }
    else if (f.type === 'zzz') { g.globalAlpha = Math.min(1, u * 3); g.fillStyle = '#ffffff'; g.font = '700 7px Nunito, sans-serif'; g.fillText('z', f.x + 3 + (1 - u) * 4, f.y - (1 - u) * 8); g.fillText('Z', f.x + 6 + (1 - u) * 6, f.y - 5 - (1 - u) * 8); }
  }
  g.globalAlpha = 1;
  return list.filter(f => f.life > 0);
}
function drawClouds(dt) {
  g.fillStyle = 'rgba(43,35,64,.07)';
  for (const c of clouds) {
    c.x += c.v * dt;
    if (c.x > WW + 80) c.x = -80;
    for (const [dx, dy, r] of c.puffs) { g.beginPath(); g.ellipse(c.x + dx, c.y + dy, r, r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
  }
}
function drawLights(L) {
  if (!L.night) return;
  g.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  const house = world.props.find(p => p.kind === 'house');
  if (house) { glow(house.x - 9, house.y - 14, 18, 'rgba(255,197,61,.45)'); glow(house.x + 12, house.y - 14, 18, 'rgba(255,197,61,.45)'); }
  glow(world.well.x, world.well.y - 9, 22, 'rgba(212,255,31,.4)');
  g.globalCompositeOperation = 'source-over';
}

// ---------- frame ----------
function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  if (innerWidth !== W || innerHeight !== H) { const first = W < 2; resize(); if (first) fitCam(); }
  const L = light();
  for (const m of minds) updateMind(m, dt, L.night);
  spawnFx(dt, L);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#3b86d1'; g.fillRect(0, 0, W, H);
  g.setTransform(cam.z * DPR, 0, 0, cam.z * DPR, (W / 2 - cam.x * cam.z) * DPR, (H / 2 - cam.y * cam.z) * DPR);
  g.drawImage(world.ground.cv, 0, 0);
  const wave = Math.sin(T * 1.4);
  g.globalAlpha = 0.45 + 0.45 * wave; g.drawImage(world.foamA.cv, 0, 0);
  g.globalAlpha = 0.45 - 0.45 * wave; g.drawImage(world.foamB.cv, 0, 0);
  g.globalAlpha = 1;
  // everything that stands is sorted by its feet so Minds walk behind and in front of trees
  const items = [];
  for (const p of world.props) items.push(p);
  for (const m of minds) items.push({ y: m.y, mind: m });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.mind) { drawMind(it.mind); continue; }
    if (it.kind === 'tree') { g.fillStyle = 'rgba(43,35,64,.22)'; g.beginPath(); g.ellipse(it.x, it.y - 1, 9, 3, 0, 0, Math.PI * 2); g.fill(); }
    const s = it.kind === 'house' && L.night ? it.night : it.spr;
    let sway = 0;
    if (it.kind === 'tree') sway = Math.round(Math.sin(T * 1.3 + it.x * 0.1) * 0.6);
    // a Mind walking behind a tree shows through it
    const hides = it.kind === 'tree' && minds.some(m => m.y < it.y - 2 && m.y > it.y - s.h + 6 && Math.abs(m.x - it.x) < s.w / 2);
    if (hides) g.globalAlpha = 0.55;
    g.drawImage(s.cv, it.x - (s.w >> 1) + sway, it.y - s.h + 1);
    g.globalAlpha = 1;
  }
  fx = drawFx(fx, dt);
  drawClouds(dt);
  if (L.tint) { g.globalAlpha = L.a; g.fillStyle = L.tint; g.fillRect(0, 0, WW, WH); g.globalAlpha = 1; }
  drawLights(L);
  // name tag over the Mind you tapped (screen space so the text stays sharp)
  if (selected && (selectedT -= dt) > 0) {
    const sx = (selected.x - cam.x) * cam.z + W / 2, sy = (selected.y - 26 - cam.y) * cam.z + H / 2;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const txt = `#${selected.id} · ${rarityOf(selected.id)}`;
    g.font = '800 14px Nunito, sans-serif';
    const tw = g.measureText(txt).width + 16;
    g.globalAlpha = Math.min(1, selectedT * 3);
    g.fillStyle = '#1d1b2f'; g.fillRect(Math.round(sx - tw / 2), Math.round(sy - 24), Math.round(tw), 24);
    g.fillStyle = '#fff8e4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, sx, sy - 12);
    g.textAlign = 'start'; g.textBaseline = 'alphabetic'; g.globalAlpha = 1;
  }
}

// ---------- input: drag to pan, wheel / pinch to zoom, tap ----------
const ptrs = new Map();
let downAt = null, pinch = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) downAt = { x: e.clientX, y: e.clientY, moved: 0 };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
  } else if (ptrs.size === 1) {
    cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam();
    if (downAt) downAt.moved += Math.abs(dx) + Math.abs(dy);
  }
});
const up = e => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (e.type === 'pointerup' && downAt && downAt.moved < 8 && !ptrs.size) tap(e.clientX, e.clientY);
  if (!ptrs.size) downAt = null;
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.z * Math.pow(1.0015, -e.deltaY)); }, { passive: false });
function zoomAt(sx, sy, z) {
  const before = toWorld(sx, sy);
  cam.z = Math.min(zMax, Math.max(zMin, z));
  const after = toWorld(sx, sy);
  cam.x += before.x - after.x; cam.y += before.y - after.y; clampCam();
}
function tap(sx, sy) {
  const p = toWorld(sx, sy);
  const m = [...minds].sort((a, b) => b.y - a.y).find(m => Math.abs(p.x - m.x) < 8 && p.y < m.y + 2 && p.y > m.y - 24);
  if (m) { m.hop = 0.5; m.state = 'idle'; m.timer = 2; selected = m; selectedT = 3; emote(m, 'heart'); sfx('pop'); return; }
  const hit = world.props.find(q => p.x > q.x - q.spr.w / 2 && p.x < q.x + q.spr.w / 2 && p.y > q.y - q.spr.h && p.y < q.y + 1 && ['house', 'well', 'crop'].includes(q.kind));
  if (!hit) return;
  sfx('click');
  onTap({ house: 'Your home. Building upgrades come in a later step.', well: 'Energy Well: it will make energy shards (3 shards = +1 ranked energy).', crop: 'Farming comes in the next step: plant, grow, harvest, sell for Dust.' }[hit.kind]);
}

// ---------- open / close ----------
function fitCam() {
  cam.x = world.center.x - 10; cam.y = world.center.y;
  cam.z = Math.min(zMax, Math.max(zMin, Math.min(W / 300, H / 220)));
  clampCam();
}
export function openIsland({ minds: ids = [], seed = 1, tap = () => {} } = {}) {
  onTap = tap;
  world = generateWorld(seed >>> 0);
  const r = rng(seed ^ 0x5bd1e995);
  clouds.length = 0;
  for (let i = 0; i < 4; i++) clouds.push({ x: r() * WW, y: 40 + r() * (WH - 80), v: 3 + r() * 3, puffs: Array.from({ length: 4 }, () => [(r() - 0.5) * 50, (r() - 0.5) * 16, 14 + r() * 14]) });
  minds = ids.slice(0, 12).map(makeMind);
  fx = []; selected = null;
  resize();
  fitCam();
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeIsland() { running = false; cancelAnimationFrame(raf); }
addEventListener('resize', () => { if (running) resize(); });
