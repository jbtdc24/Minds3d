// The world map: its own screen, in pixel art drawn by code. Everything is painted into a small pixel buffer
// (PS = 0.4 of the 1600×1000 map) and scaled up crisp. Each island has its own biome (meadow, mushroom, crystal,
// volcano, snow, ruins/portal, dragon nest…), baked light from the top-left, a soft shadow on the clouds below,
// and live pixel effects: drifting clouds, waterfalls, lava smoke, lightning, sparkles, birds and your airship.
import { makeNoise, fbm, rng, hash } from './gen.js';
import { rgba, toCanvas, sprite, bayer } from './pixel.js';
import { SPOTS, SHIPS, HOME_SPOT, spotLevel, POTIONS_MAX } from './adventure.js';
import { sfx, music } from '../audio.js';

const $ = s => document.querySelector(s);
const cv = $('#map-cv'), g = cv.getContext('2d');
const MW = 1600, MH = 1000, PS = 0.4, BW = Math.round(MW * PS), BH = Math.round(MH * PS);   // pixel buffer 640×400
const low = document.createElement('canvas'); low.width = BW; low.height = BH;
const lg = low.getContext('2d');
let running = false, raf = 0, last = 0, Tm = 0, W = 1, H = 1, DPR = 1, M = null;
const cam = { x: MW / 2, y: MH / 2, z: 1 };
let art = null;

// ---------- biomes ----------
const BIOME = {
  meadow: { g: ['#3f8d38', '#58b046', '#7fcf55', '#b3ea6e'], tree: ['#2d6a2f', '#3f8d38', '#58b046', '#8fd65a'], rock: ['#5e4330', '#7c5a40', '#9a7452', '#b89068'] },
  mushroom: { g: ['#3f7a40', '#4f9a50', '#6fbf62', '#a3e08a'], tree: ['#2d6a2f', '#3f8d38', '#58b046', '#8fd65a'], rock: ['#5a4038', '#78564a', '#93705e', '#ad8a74'], mush: true },
  crystal: { g: ['#2f7a72', '#3fa08f', '#5fc8b0', '#a8f0dc'], tree: ['#1f5a5a', '#2f7a72', '#3fa08f', '#7fd8c8'], rock: ['#3e3a5a', '#5b557e', '#7c75a0', '#a39dc8'], crystal: true },
  volcano: { g: ['#3a3236', '#4e4448', '#665a5c', '#8a7a70'], tree: ['#3a2a20', '#5a3a28', '#7a4a30', '#9a6040'], rock: ['#2a2022', '#3e3034', '#584448', '#74585a'], volcano: true },
  snow: { g: ['#b8c8dc', '#d4e0ee', '#ecf4fc', '#ffffff'], tree: ['#1f4f4a', '#2f6a5a', '#4a8a72', '#e8f4ff'], rock: ['#4a5a6e', '#66788e', '#8496ac', '#a8b8cc'], snow: true },
  ember: { g: ['#7a6a2a', '#9a8a3a', '#b8a84a', '#d8c86a'], tree: ['#7a2416', '#c43c1c', '#ec7a2c', '#ffb347'], rock: ['#5e3a24', '#7c4e30', '#9a643c', '#b87e50'] },
  ruins: { g: ['#5a7a3a', '#6a8f45', '#82a854', '#a8c870'], tree: ['#2d5a2f', '#3f7a38', '#58964a', '#8fbf62'], rock: ['#5b5a6e', '#7c7b8f', '#a3a2b5', '#cfcfdc'], ruins: true },
  garden: { g: ['#4f8a3a', '#62a64a', '#7fc260', '#b3e08a'], tree: ['#b0457a', '#d9659a', '#f08bb8', '#ffd0e4'], rock: ['#5e4330', '#7c5a40', '#9a7452', '#b89068'], flowers: true },
  dragon: { g: ['#4a2a22', '#6a3a2a', '#8a4a32', '#aa6a44'], tree: ['#3a2020', '#5a2a2a', '#7a3a32', '#9a5a44'], rock: ['#2a1a1a', '#4a2a28', '#6a3a34', '#8a5048'], dragon: true },
  storm: { g: ['#3a4256', '#4a546e', '#5e6a88', '#8290ae'], tree: ['#1f2a3a', '#2f3a4e', '#3f4e66', '#6a7a96'], rock: ['#22263a', '#33384e', '#474e66', '#5e6884'], storm: true },
};
const SPOT_BIOME = ['meadow', 'mushroom', 'meadow', 'crystal', 'snow', 'ruins', 'volcano', 'meadow', 'garden', 'storm', 'ruins', 'dragon'];
const pick = (ramp, l, x, y) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(l * (ramp.length - 1) + (bayer(x, y) - 0.5) * 0.8)))];

// ---------- painting islands into the pixel buffer ----------
function paintIsland(px, cx, cy, r, seed, biomeName, extras) {
  const B = BIOME[biomeName], n = makeNoise(seed), R = rng(seed);
  cx *= PS; cy *= PS; r *= PS;
  const ry = r * 0.62, depth = r * (1.05 + R() * 0.5);
  const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < BW && y < BH) px[y * BW + x] = rgba(c); };
  const inside = (x, y) => { const a = Math.atan2((y - cy) / ry, (x - cx) / r), k = 0.78 + fbm(n, Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, 3) * 0.42; return ((x - cx) / (r * k)) ** 2 + ((y - cy) / (ry * k)) ** 2 <= 1; };
  const x0 = Math.floor(cx - r * 1.3), x1 = Math.ceil(cx + r * 1.3), y0 = Math.floor(cy - ry * 1.4), y1 = Math.ceil(cy + depth + 4);
  // the shadow far below on the clouds (baked, soft)
  for (let y = Math.floor(cy + depth + 10); y < cy + depth + 10 + ry * 1.2; y++) for (let x = x0 + 6; x < x1 + 10; x++) {
    const d = ((x - cx - 8) / (r * 1.1)) ** 2 + ((y - cy - depth - 10 - ry * 0.6) / (ry * 0.6)) ** 2;
    if (d < 1 && bayer(x, y) < (1 - d) * 0.45 && x >= 0 && y >= 0 && x < BW && y < BH) { const k = y * BW + x, c = px[k]; px[k] = ((c & 0xff000000) | (((c >> 16 & 255) * 0.86) << 16) | (((c >> 8 & 255) * 0.88) << 8) | ((c & 255) * 0.95)) >>> 0; }
  }
  // the top surface mask + the rocky underside hanging below it (column scan, deeper in the middle)
  const top = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1)), W2 = x1 - x0 + 1, T = (x, y) => top[(y - y0) * W2 + (x - x0)];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) top[(y - y0) * W2 + (x - x0)] = 1;
  for (let x = x0; x <= x1; x++) {
    let lastTop = -1;
    for (let y = y0; y <= y1; y++) {
      if (T(x, y)) { lastTop = y; continue; }
      if (lastTop < 0) continue;
      const below = y - lastTop, mid = 1 - Math.abs(x - cx) / (r * 1.1), hang = depth * Math.max(0.15, mid) * (0.75 + fbm(n, x / 7, 9, 2) * 0.5);
      if (below > hang) break;
      const t = below / hang, stripe = ((y + Math.round(n(x / 5, y / 5) * 4)) % 5) < 1;
      let col = below <= 1 ? B.rock[3] : t > 0.85 ? B.rock[0] : stripe ? B.rock[1] : pick(B.rock, 0.75 - t * 0.6 - (x - cx) / (r * 3), x, y);
      if (B.crystal && n(x / 3, y / 3) > 0.8 && t > 0.3) col = (x + y) % 3 ? '#7fe8ff' : '#e0fbff';
      if (B.volcano && n(x / 2, y / 4) > 0.82 && t > 0.2) col = '#ff6a2a';
      if (B.snow && t > 0.85 && x % 3 === 0) col = '#e8f4ff';   // icicles
      put(x, y, col);
    }
  }
  // grass top: light from the top-left, a bright rim, darker toward the bottom-right
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!T(x, y)) continue;
    const edgeB = !T(x, y + 1), edgeT = !T(x, y - 1) || !T(x - 1, y);
    const l = 0.62 - (x - cx) / (r * 3.2) - (y - cy) / (ry * 3) + (fbm(n, x / 6, y / 6, 2) - 0.5) * 0.4;
    put(x, y, edgeB ? B.g[0] : edgeT ? B.g[3] : pick(B.g, l, x, y));
  }
  // things on top (sorted by y): trees, rocks, mushrooms, crystals, flowers
  const spots = [];
  for (let i = 0; i < r * 1.1; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.75; const x = cx + Math.cos(a) * r * d, y = cy + Math.sin(a) * ry * d; if (T(x | 0, y | 0)) spots.push({ x, y, t: R() }); }
  spots.sort((a, b) => a.y - b.y);
  for (const s of spots) {
    const x = s.x | 0, y = s.y | 0;
    if (B.volcano && Math.hypot(x - cx, (y - cy) * 1.6) < r * 0.45) continue;
    if (s.t < 0.5) {   // tree: trunk + round crown with highlight
      put(x, y + 1, '#2b2340'); put(x + 1, y + 1, '#2b2340');
      put(x, y, '#5a3a22'); put(x, y - 1, '#5a3a22');
      for (let dy = -6; dy <= -1; dy++) for (let dx = -3; dx <= 3; dx++) { const d = (dx / 3.4) ** 2 + ((dy + 3.5) / 3) ** 2; if (d <= 1) put(x + dx, y + dy, d > 0.75 ? B.tree[0] : dx + dy < -5 ? B.tree[3] : dx + dy < -3 ? B.tree[2] : B.tree[1]); }
      if (B.snow) { put(x - 1, y - 6, '#ffffff'); put(x, y - 6, '#ffffff'); put(x + 1, y - 6, '#ffffff'); }
    } else if (s.t < 0.68) { put(x, y, B.rock[2]); put(x + 1, y, B.rock[1]); put(x, y - 1, B.rock[3]); put(x + 1, y - 1, B.rock[2]); }
    else if (B.mush && s.t < 0.9) { for (let dy = -3; dy <= 0; dy++) put(x, y + dy, '#f3e6c4'); for (let dx = -3; dx <= 3; dx++) for (let dy = -6; dy <= -4; dy++) if (Math.abs(dx) <= 3 - (dy === -6 ? 1 : 0)) put(x + dx, y + dy, (dx + dy) % 3 === 0 ? '#ffffff' : '#e0503a'); }
    else if (B.crystal && s.t < 0.9) { for (let dy = 0; dy < 6; dy++) { put(x, y - dy, dy > 3 ? '#e0fbff' : '#7fe8ff'); if (dy < 4) put(x + 1, y - dy, '#3fb8e0'); } }
    else if (B.flowers || s.t > 0.95) put(x, y, ['#ff6fae', '#ffd84a', '#c9a6ff', '#ffffff'][(s.t * 40 | 0) % 4]);
    else if (B.dragon && s.t < 0.9) { put(x, y, '#f3e6c4'); put(x + 1, y - 1, '#f3e6c4'); put(x + 2, y, '#e0d4b0'); }   // bones
  }
  // set pieces
  if (B.volcano) {   // a cone with a glowing crater
    for (let y = -14; y <= 0; y++) { const hw = Math.round(3 + (y + 14) * 0.9); for (let dx = -hw; dx <= hw; dx++) put(cx + dx, cy + y, dx < -hw / 3 ? B.rock[3] : dx > hw / 3 ? B.rock[1] : B.rock[2]); }
    for (let dx = -3; dx <= 3; dx++) { put(cx + dx, cy - 14, '#ff8a2a'); put(cx + dx, cy - 13, dx % 2 ? '#ffd84a' : '#ff6a2a'); }
    for (let i = 0; i < 6; i++) { const y = cy - 12 + i * 2; put(cx - 1 + (i % 2), y, '#ff6a2a'); }   // lava stream
  }
  if (B.storm) { for (let y = -20; y <= 0; y++) { const hw = Math.max(1, Math.round((y + 20) * 0.28)); for (let dx = -hw; dx <= hw; dx++) put(cx + dx, cy + y, dx < 0 ? B.rock[3] : B.rock[1]); } }
  if (B.ruins) {   // stone floor + pillars + a portal ring
    for (let dy = -3; dy <= 3; dy++) for (let dx = -8; dx <= 8; dx++) if (T(cx + dx | 0, cy + dy | 0)) put(cx + dx, cy + dy, (dx + dy * 3) % 4 ? '#a3a2b5' : '#7c7b8f');
    for (const ox of [-7, 7]) for (let dy = -9; dy <= 0; dy++) { put(cx + ox, cy + dy - 2, '#cfcfdc'); put(cx + ox + 1, cy + dy - 2, '#7c7b8f'); }
    for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; put(cx + Math.cos(t) * 4, cy - 6 + Math.sin(t) * 5, '#5ec8ff'); }
  }
  if (B.dragon) { for (let a = 0; a < 30; a++) { const t = a / 30 * Math.PI * 2; put(cx + Math.cos(t) * 7, cy + Math.sin(t) * 4, '#6b4428'); put(cx + Math.cos(t) * 6, cy + Math.sin(t) * 3.5, '#8b5a34'); } put(cx - 1, cy, '#ffd84a'); put(cx + 2, cy + 1, '#ffd84a'); }
  if (extras?.house) {   // your home
    for (let dy = -6; dy <= 0; dy++) for (let dx = -5; dx <= 5; dx++) put(cx + dx, cy + dy, dy === 0 ? '#c9a87a' : '#f3dfb6');
    for (let dy = -11; dy <= -6; dy++) { const hw = (dy + 11) + 1; for (let dx = -hw; dx <= hw; dx++) put(cx + dx, cy + dy, dx < 0 ? '#4f7ae0' : '#2f5aa8'); }
    put(cx, cy - 1, '#6b4428'); put(cx, cy - 2, '#6b4428'); put(cx - 3, cy - 4, '#ffe27a'); put(cx + 3, cy - 4, '#ffe27a');
    for (let a = 0; a < 18; a++) { const t = a / 18 * Math.PI * 2; put(cx + 14 + Math.cos(t) * 3, cy + 3 + Math.sin(t) * 4, '#5ec8ff'); }   // home portal
  }
  return { cx, cy, r, ry, depth };
}
function buildArt() {
  const px = new Uint32Array(BW * BH), R = rng(77), n = makeNoise(5);
  // sky: vertical gradient (dithered), then fluffy cloud banks below the islands
  const sky = ['#4a9fe0', '#5fb4ec', '#7cc8f4', '#9ad8fa', '#c4e6ff', '#e4d8ff'];
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const v = y / BH + (fbm(n, x / 60, y / 40, 3) - 0.5) * 0.25;
    px[y * BW + x] = rgba(pick(sky, v, x, y));
    const c = fbm(n, x / 40 + 9, y / 18 + 3, 4);
    if (c > 0.58) px[y * BW + x] = rgba(c > 0.68 ? '#ffffff' : c > 0.62 ? '#eef6ff' : '#d8e8fa');
  }
  // faint map grid
  for (let x = 0; x < BW; x += 16) for (let y = 0; y < BH; y++) if (y % 2 === 0) { const k = y * BW + x, c = px[k]; px[k] = (c & 0xff000000) | ((Math.min(255, (c >> 16 & 255) + 10)) << 16) | ((Math.min(255, (c >> 8 & 255) + 10)) << 8) | Math.min(255, (c & 255) + 10); }
  // little islets for scale, then the travel islands, then home
  for (let i = 0; i < 30; i++) paintIsland(px, R() * MW, R() * MH, 12 + R() * 16, 900 + i, ['meadow', 'meadow', 'ruins', 'snow', 'garden'][i % 5]);
  const isles = SPOTS.map((s, i) => paintIsland(px, s.x, s.y, s.r, 300 + i * 17, SPOT_BIOME[i]));
  paintIsland(px, HOME_SPOT.x, HOME_SPOT.y, HOME_SPOT.r, 42, 'meadow', { house: true });
  const falls = [];
  [1, 4, 7, 10].forEach(i => { const s = SPOTS[i]; falls.push({ x: (s.x + s.r * 0.3) * PS | 0, y: (s.y + s.r * 0.22) * PS | 0, h: (s.r * 1.5 * PS) | 0, c: i === 4 ? '#e8f4ff' : '#bfeaff' }); });
  falls.push({ x: (HOME_SPOT.x - 40) * PS | 0, y: (HOME_SPOT.y + 26) * PS | 0, h: 60, c: '#bfeaff' });
  art = { cv: toCanvas(px, BW, BH).cv, isles, falls,
    clouds: Array.from({ length: 16 }, (_, i) => ({ x: R() * BW, y: R() * BH, s: 0.6 + R() * 1, v: 2 + R() * 4, front: i % 3 === 0 })),
    birds: Array.from({ length: 5 }, () => ({ x: R() * BW, y: 20 + R() * BH * 0.6, v: 10 + R() * 8, ph: R() * 6 })),
    smoke: [], bolt: 0 };
}

// ---------- airships (pixel sprites) ----------
const shipCache = {};
function shipSprite(tier) {
  if (shipCache[tier]) return shipCache[tier];
  const WOOD = ['#4a2e1c', '#6b4428', '#8b5a34', '#a87444', '#c99a63'];
  let spr;
  if (tier === 0) spr = sprite(14, 22, set => {   // balloon raft
    for (let y = 0; y < 12; y++) for (let x = 0; x < 14; x++) { const d = ((x - 6.5) / 6.5) ** 2 + ((y - 6) / 6.5) ** 2; if (d <= 1) set(x, y, x < 5 ? '#ff8a7a' : (x + y) % 5 === 0 ? '#ffd84a' : x > 9 ? '#c43c3c' : '#e0503a'); }
    for (let y = 12; y < 17; y++) { set(3 + (y > 14 ? 1 : 0), y, '#3b2a20'); set(10 - (y > 14 ? 1 : 0), y, '#3b2a20'); }
    for (let y = 17; y < 21; y++) for (let x = 2; x < 12; x++) set(x, y, y === 17 ? WOOD[4] : WOOD[2]);
  });
  else {
    const L = 18 + tier * 6, sail = ['', '#f3e6c4', '#ffffff', '#ffe27a'][tier];
    spr = sprite(L, 22, set => {
      for (let y = 15; y < 21; y++) for (let x = (y - 15); x < L - (y - 14) * 1.5; x++) set(x, y, y === 15 ? WOOD[4] : y > 18 ? WOOD[0] : WOOD[2]);
      for (let x = 3; x < L - 4; x += 4) set(x, 17, '#ffe27a');   // portholes
      const mx = (L / 2) | 0; for (let y = 1; y < 15; y++) set(mx, y, WOOD[0]);
      for (let y = 2; y < 13; y++) for (let x = mx + 1; x < mx + 1 + Math.round((13 - y) * 0.55 + 2); x++) set(x, y, sail);
      if (tier >= 2) for (let y = 4; y < 13; y++) for (let x = mx - 1; x > mx - 1 - Math.round((13 - y) * 0.45 + 1); x--) set(x, y, sail);
      if (tier === 3) for (let x = 0; x < L - 6; x++) set(x, 21, '#7fe8ff');
      set(L - 3, 16, '#cfcfdc'); set(L - 2, 15, '#cfcfdc');
    });
  }
  return (shipCache[tier] = spr);
}

// ---------- live drawing (into the pixel buffer, then scaled up) ----------
function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cam.z = Math.max(W / MW, H / MH) * 1.02; clamp(); }
function clamp() { const hw = W / 2 / cam.z, hh = H / 2 / cam.z; cam.x = Math.max(hw, Math.min(MW - hw, cam.x)); cam.y = Math.max(hh, Math.min(MH - hh, cam.y)); }
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y });
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });
function shipPath(t) {
  const a = M.from, b = M.to, mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 140;
  const u = 1 - t; return { x: u * u * a.x + 2 * u * t * mx + t * t * b.x, y: u * u * a.y + 2 * u * t * my + t * t * b.y };
}
const P = (x, y, c) => { lg.fillStyle = c; lg.fillRect(x | 0, y | 0, 1, 1); };
function cloud(x, y, s, a) {
  lg.globalAlpha = a;
  for (const [dx, dy, r, c] of [[0, 2, 9, '#d8e8fa'], [-9, 4, 7, '#d8e8fa'], [10, 4, 8, '#d8e8fa'], [0, 0, 9, '#ffffff'], [-8, 2, 6, '#ffffff'], [9, 2, 7, '#ffffff'], [3, -4, 6, '#ffffff']]) {
    lg.fillStyle = c; lg.beginPath(); lg.arc((x + dx * s) | 0, (y + dy * s) | 0, Math.max(2, r * s) | 0, 0, Math.PI * 2); lg.fill();
  }
  lg.globalAlpha = 1;
}
function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; Tm += dt;
  if (innerWidth !== W || innerHeight !== H) resize();
  lg.imageSmoothingEnabled = false;
  lg.drawImage(art.cv, 0, 0);
  // clouds behind the islands drift slowly (parallax)
  for (const c of art.clouds) if (!c.front) { c.x = (c.x + c.v * 0.5 * dt) % (BW + 60); cloud(c.x - 30, c.y, c.s, 0.55); }
  // waterfalls: falling pixels + mist
  for (const f of art.falls) {
    for (let y = 0; y < f.h; y++) { const on = ((y + Math.floor(Tm * 40)) % 6) < 2; P(f.x, f.y + y, on ? '#ffffff' : f.c); P(f.x + 1, f.y + y, f.c); }
    for (let i = 0; i < 3; i++) { lg.globalAlpha = 0.5; lg.fillStyle = '#ffffff'; lg.fillRect(f.x - 2 + Math.sin(Tm * 3 + i) * 2 | 0, f.y + f.h - 1, 6, 2); lg.globalAlpha = 1; }
  }
  // volcano: glowing crater + smoke puffs
  const vi = SPOT_BIOME.indexOf('volcano'), v = SPOTS[vi], vx = v.x * PS, vy = v.y * PS - 15;
  lg.globalAlpha = 0.35 + 0.25 * Math.sin(Tm * 4); lg.fillStyle = '#ff8a2a'; lg.beginPath(); lg.arc(vx, vy + 1, 6, 0, Math.PI * 2); lg.fill(); lg.globalAlpha = 1;
  if (Math.random() < dt * 6) art.smoke.push({ x: vx + (Math.random() - 0.5) * 3, y: vy, life: 2.5, r: 1.5 });
  if (Math.random() < dt * 3) art.smoke.push({ x: vx, y: vy, life: 0.8, r: 1, ember: true, vx: (Math.random() - 0.5) * 14, vy: -18 });
  art.smoke = art.smoke.filter(s => {
    s.life -= dt;
    if (s.ember) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 20 * dt; P(s.x, s.y, s.life > 0.4 ? '#ffd84a' : '#ff6a2a'); }
    else { s.y -= 8 * dt; s.x += 4 * dt; s.r += 2.2 * dt; lg.globalAlpha = Math.max(0, s.life / 2.5) * 0.7; lg.fillStyle = s.life > 1.8 ? '#7a6a6a' : '#9a9090'; lg.beginPath(); lg.arc(s.x | 0, s.y | 0, s.r | 0, 0, Math.PI * 2); lg.fill(); lg.globalAlpha = 1; }
    return s.life > 0;
  });
  // storm spire: lightning now and then
  const si = SPOT_BIOME.indexOf('storm'), sp = SPOTS[si];
  if ((art.bolt -= dt) < -2.5 - Math.random() * 3) art.bolt = 0.18;
  if (art.bolt > 0) {
    let x = sp.x * PS + 2, y = sp.y * PS - 60;
    lg.fillStyle = '#ffffff';
    while (y < sp.y * PS - 20) { const nx = x + (Math.random() - 0.5) * 6; for (let i = 0; i < 4; i++) P(x + (nx - x) * i / 4, y + i, i % 2 ? '#fff3b0' : '#ffffff'); x = nx; y += 4; }
    lg.globalAlpha = 0.15; lg.fillStyle = '#e0e8ff'; lg.fillRect(0, 0, BW, BH); lg.globalAlpha = 1;
    if (art.bolt > 0.16 && M) sfx('boom');
  }
  // crystal / portal sparkles
  SPOTS.forEach((s, i) => { if (['crystal', 'ruins'].includes(SPOT_BIOME[i]) && Math.random() < dt * 6) { const a = Math.random() * 6.28; P(s.x * PS + Math.cos(a) * s.r * PS * 0.5, s.y * PS + Math.sin(a) * s.r * PS * 0.3 - 4, '#e0fbff'); } });
  // locked islands sit in fog
  SPOTS.forEach((s, i) => {
    if (s.tier <= M.ship) return;
    lg.globalAlpha = 0.22; lg.fillStyle = '#e6ecf8';   // thin mist: you can still see what is out there
    for (let k = 0; k < 2; k++) { lg.beginPath(); lg.ellipse(s.x * PS + Math.sin(Tm * 0.5 + k * 2) * 3, s.y * PS + 2 + k * 6, s.r * PS * (1.15 - k * 0.15), s.r * PS * 0.5, 0, 0, Math.PI * 2); lg.fill(); }
    lg.globalAlpha = 0.6; lg.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) { const a = Tm * 0.3 + k * 2.1; lg.beginPath(); lg.ellipse(s.x * PS + Math.cos(a) * s.r * PS * 0.8, s.y * PS + s.r * PS * 0.35 + Math.sin(a) * 3, 7, 3, 0, 0, Math.PI * 2); lg.fill(); }
    lg.globalAlpha = 1;
  });
  // selection: a pixel ring that pulses
  const ss = SPOTS[M.sel];
  if (ss) { const rr = ss.r * PS * 1.12, on = Math.sin(Tm * 6) > -0.2; for (let a = 0; a < 80; a++) { const t = a / 80 * Math.PI * 2; if ((a + Math.floor(Tm * 10)) % 4 < 2 && on) P(ss.x * PS + Math.cos(t) * rr, ss.y * PS + Math.sin(t) * rr * 0.62, '#d4ff1f'); } }
  // birds
  for (const b of art.birds) { b.x = (b.x + b.v * dt) % (BW + 20); const f = Math.sin(Tm * 10 + b.ph) > 0 ? 1 : 0; P(b.x - 2, b.y - f, '#2b2340'); P(b.x - 1, b.y, '#2b2340'); P(b.x, b.y - 1 + f, '#2b2340'); P(b.x + 1, b.y, '#2b2340'); P(b.x + 2, b.y - f, '#2b2340'); }
  // the airship: parked by home, or flying with a cloud trail
  const spr = shipSprite(M.ship);
  let shx, shy, face = 1;
  if (M.fly) {
    M.fly.t = Math.min(1, M.fly.t + dt / 2.6);
    const e = M.fly.t < 0.5 ? 2 * M.fly.t * M.fly.t : 1 - (-2 * M.fly.t + 2) ** 2 / 2, p = shipPath(e), q = shipPath(Math.min(1, e + 0.01));
    shx = p.x * PS; shy = p.y * PS + Math.sin(Tm * 4) * 1.5; face = q.x < p.x ? -1 : 1;
    if (Math.random() < 0.8) M.trail.push({ x: shx - face * spr.w * 0.4, y: shy - 4, life: 1.2 });
    if (M.fly.t >= 1 && !M.fly.done) { M.fly.done = true; sfx('land'); setTimeout(() => M.onFly?.(M.sel, M.potions), 450); }
  } else { shx = (HOME_SPOT.x + 70) * PS; shy = (HOME_SPOT.y - 40) * PS + Math.sin(Tm * 2) * 1.2; }
  M.trail = M.trail.filter(t => { t.life -= dt; lg.globalAlpha = t.life / 1.2 * 0.8; lg.fillStyle = '#ffffff'; lg.beginPath(); lg.arc(t.x | 0, t.y | 0, (1 + (1.2 - t.life) * 2.5) | 0, 0, Math.PI * 2); lg.fill(); lg.globalAlpha = 1; return t.life > 0; });
  lg.globalAlpha = 0.25; lg.fillStyle = '#1d1b2f'; lg.beginPath(); lg.ellipse(shx | 0, (shy + 16) | 0, spr.w * 0.35, 2, 0, 0, Math.PI * 2); lg.fill(); lg.globalAlpha = 1;
  lg.save(); lg.translate(shx | 0, shy | 0); lg.scale(face, 1); lg.drawImage(spr.cv, -(spr.w >> 1), -spr.h + 4); lg.restore();
  // clouds in front of everything
  for (const c of art.clouds) if (c.front) { c.x = (c.x + c.v * dt) % (BW + 60); cloud(c.x - 30, c.y, c.s * 1.2, 0.7); }
  // scale the pixel buffer up, crisp
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.imageSmoothingEnabled = false;
  const k = cam.z / PS;
  g.drawImage(low, (W / 2 - cam.x * cam.z), (H / 2 - cam.y * cam.z), BW * k, BH * k);
  // labels in screen space (sharp text)
  SPOTS.forEach((s, i) => {
    const locked = s.tier > M.ship, p = toScreen(s.x, s.y - s.r * 0.62 - 26);
    g.font = '900 15px Nunito, sans-serif'; g.textAlign = 'center';
    const label = `${locked ? '🔒' : s.icon} ${s.name}`;
    g.lineWidth = 4; g.strokeStyle = '#1d1b2f'; g.strokeText(label, p.x, p.y); g.fillStyle = locked ? '#d8d4e8' : '#fff8e4'; g.fillText(label, p.x, p.y);
    g.font = '800 11px Nunito, sans-serif';
    const sub = locked ? `Needs ${SHIPS[s.tier].name}` : s.tier ? `⛽ ${s.tier} · level ${spotLevel(i)}` : `free · level ${spotLevel(i)}`;
    g.lineWidth = 3; g.strokeText(sub, p.x, p.y + 13); g.fillStyle = locked ? '#ffb0a0' : '#d4ff1f'; g.fillText(sub, p.x, p.y + 13);
  });
  g.textAlign = 'start';
}

// ---------- panel + input ----------
function paint() {
  const s = SPOTS[M.sel], locked = s.tier > M.ship, fuelOk = M.fuel >= s.tier;
  $('#map-ship').textContent = `${SHIPS[M.ship].icon} ${SHIPS[M.ship].name}`;
  $('#map-fuel').textContent = `⛽ ${M.fuel}`;
  $('#map-info').innerHTML = `<b>${s.icon} ${s.name}</b> <span>Level ${spotLevel(M.sel)} · ${s.desc}</span><span>${locked ? `🔒 Too far: needs the <b>${SHIPS[s.tier].name}</b>` : s.tier ? `Flight costs ⛽ ${s.tier} Sky Fuel ${fuelOk ? '' : '(not enough)'}` : 'Free to fly'}</span>`;
  $('#map-pot').innerHTML = `🧪 <button class="btn small" data-pot="-1">−</button><b>${M.potions}</b><button class="btn small" data-pot="1">+</button>`;
  $('#map-fly').disabled = locked || !fuelOk || !!M.fly;
  const next = SHIPS[M.ship + 1];
  $('#map-up').style.display = next ? '' : 'none';
  if (next) $('#map-up').textContent = `🛠️ ${next.name}`;
}
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture?.(e.pointerId); });
cv.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; cam.x -= dx / cam.z; cam.y -= dy / cam.z; clamp(); });
cv.addEventListener('pointerup', e => {
  if (!drag || M?.fly) { drag = null; return; }
  const moved = drag.moved; drag = null;
  if (moved > 8) return;
  const p = toWorld(e.clientX, e.clientY);
  const hit = SPOTS.findIndex(s => Math.hypot((p.x - s.x) / s.r, (p.y - s.y) / (s.r * 0.8)) < 1.1);
  if (hit >= 0) { M.sel = hit; sfx(SPOTS[hit].tier > M.ship ? 'denied' : 'select'); paint(); }
});
cv.addEventListener('wheel', e => { e.preventDefault(); const z0 = Math.max(W / MW, H / MH); cam.z = Math.max(z0, Math.min(z0 * 2.5, cam.z * Math.pow(1.0015, -e.deltaY))); clamp(); }, { passive: false });
$('#map-pot').addEventListener('click', e => { const b = e.target.closest('[data-pot]'); if (!b) return; M.potions = Math.max(0, Math.min(POTIONS_MAX, M.have, M.potions + +b.dataset.pot)); sfx('select'); paint(); });
$('#map-fly').onclick = () => {
  if (!M || M.fly) return;
  const s = SPOTS[M.sel];
  M.from = { x: HOME_SPOT.x + 70, y: HOME_SPOT.y - 40 }; M.to = { x: s.x, y: s.y - 30 };
  M.fly = { t: 0 }; sfx('whoosh'); setTimeout(() => sfx('horn'), 200); paint();
};
$('#map-up').onclick = () => M?.onUpgrade?.();
$('#map-back').onclick = () => M?.onBack?.();

// opts: { ship, fuel, potions (owned), sel, onFly(spot, potions), onBack(), onUpgrade() }
export function openMap(opts) {
  if (!art) buildArt();
  M = { ...opts, sel: Math.min(opts.sel || 0, SPOTS.length - 1), have: opts.potions || 0, potions: Math.min(POTIONS_MAX, opts.potions || 0), fly: null, trail: [] };
  resize(); cam.x = HOME_SPOT.x + 300; cam.y = HOME_SPOT.y - 150; clamp();
  M.sel = Math.min(M.sel, SPOTS.length - 1);
  paint(); music('adventure');
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function updateMap(patch) { if (!M) return; Object.assign(M, patch); paint(); }
export function closeMap() { running = false; cancelAnimationFrame(raf); M = null; }
