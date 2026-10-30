// Mind Town: a small top-down harbour town drawn in code. Zoom right out to see the whole map. Real players who are here
// walk around with name tags, and a few resident Minds stroll about so it never feels empty (their paths are pure math
// from the clock, so everyone sees the same ones). Tap a building to walk there and use it.
import { chibi } from './island/chibi.js';
import { sprite, makeNoise, fbm } from './island/pixel.js';
import { bsprites } from './island/buildings.js';
import { sprites } from './island/art.js';
import { hash } from './island/gen.js';
import { babble, music, sfx } from './audio.js';

const $ = s => document.querySelector(s);
const T = 16, TW = 100, TH = 65, WW = TW * T, WH = TH * T, RESIDENTS = 14, WALK = 72, LOADS = 3;
const WATER = 0, SAND = 1, GRASS = 2, COBBLE = 3, DIRT = 4, PLANK = 5;
const cv = document.getElementById('town-cv'), g = cv.getContext('2d');
let K = null, running = false, raf = 0, last = 0, W = 0, H = 0, DPR = 1, zoom = 1.5, bg = null, map = null;
let meP = null, people = new Map(), bubbles = [], chatAfter = 0, beatT = 0, sayQ = '', talkT = 1, stayLeft = 0, loads = 0, free = false;
const ptrs = new Map(), CAM = { x: WW / 2, y: WH / 2 }, looks = new Map();
let tap = null, pinch = null;
const key = (x, y) => y * TW + x;

// ---------- buildings: original pixel art, all drawn here ----------
const shade = { red: ['#7a2c22', '#a8402e', '#c95a3e', '#e88a5e'], blue: ['#2c4a78', '#3f6aa0', '#5a8cc4', '#8fb8e0'], green: ['#2f6a4a', '#3f8d62', '#5aad7c', '#92d4a4'], plum: ['#54386e', '#74508e', '#9670ae', '#c4a4d4'], gold: ['#8a5a14', '#b98322', '#e0ac3a', '#ffd86a'] };
function shop(w, h, tone, { awning = false } = {}) {
  const R = shade[tone], roofH = Math.round(h * 0.42);
  return sprite(w, h, set => {
    for (let y = 0; y < roofH; y++) for (let x = 0; x < w; x++) {
      const inset = Math.max(0, 3 - y);
      if (x < inset || x >= w - inset) continue;
      set(x, y, y === roofH - 1 ? R[0] : y % 4 === 3 ? R[1] : (x + (y >> 2) * 3) % 8 === 0 ? R[1] : y < 3 ? R[3] : R[2]);
    }
    for (let y = roofH; y < h; y++) for (let x = 1; x < w - 1; x++) set(x, y, y === roofH ? '#8a7a64' : x < 3 ? '#cdbd9c' : y > h - 4 ? '#a8987a' : '#efe2c4');
    const cols = Math.floor((w - 10) / 14);
    for (let i = 0; i < cols; i++) {
      const wx = 7 + i * Math.floor((w - 14) / cols) + (i >= cols / 2 ? 8 : 0);
      for (let y = roofH + 5; y < roofH + 14; y++) for (let x = wx; x < wx + 8; x++) set(x, y, x === wx || y === roofH + 5 ? '#4a5a78' : (x + y) % 7 === 0 ? '#e0f4ff' : '#8fc4e8');
    }
    const dx = (w >> 1) - 5;
    for (let y = h - 15; y < h; y++) for (let x = dx; x < dx + 10; x++) set(x, y, x === dx || x === dx + 9 || y === h - 15 ? '#4e3420' : x === dx + 7 && y === h - 8 ? '#ffd86a' : '#7a5230');
    if (awning) for (let x = 3; x < w - 3; x++) for (let y = roofH + 1; y < roofH + 5; y++) set(x, y, (x >> 2) & 1 ? '#fff4d8' : R[2]);
  });
}
function glassTower(w, h, tone) {
  const R = shade[tone];
  return sprite(w, h, set => {
    for (let y = 0; y < 8; y++) for (let x = 3; x < w - 3; x++) set(x, y, y === 7 ? R[0] : y < 2 ? R[3] : R[1]);
    for (let y = 8; y < h; y++) for (let x = 0; x < w; x++) {
      const left = x < w * 0.3, floor = (y - 8) % 11, col = x % 9;
      set(x, y, floor === 0 ? '#5a6a84' : col === 0 ? '#5a6a84' : left ? '#7fa8c8' : (x + y) % 13 === 0 ? '#e8f8ff' : '#a8d4ec');
    }
    const dx = (w >> 1) - 7;
    for (let y = h - 14; y < h; y++) for (let x = dx; x < dx + 14; x++) set(x, y, x === dx + 7 ? '#3a4a60' : y === h - 14 ? '#3a4a60' : '#2e3e58');
  });
}
function arena() {
  const w = 152, h = 104;
  return sprite(w, h, set => {
    for (let y = 26; y < h; y++) for (let x = 0; x < w; x++) {
      const inset = Math.max(0, 16 - (y - 26));
      if (x < inset || x >= w - inset) continue;
      set(x, y, (y - 26) % 12 === 0 ? '#74705e' : ((x + ((y / 12) | 0) * 9) % 18 === 0 ? '#8a8672' : '#b4ae98'));
    }
    for (let i = 0; i < 6; i++) { const ax = 12 + i * 24 + (i > 2 ? 8 : 0); for (let y = 50; y < 72; y++) for (let x = ax; x < ax + 14; x++) { const top = 50 + Math.abs(x - ax - 7); if (y >= top) set(x, y, x === ax || x === ax + 13 ? '#4a4638' : '#2c3350'); } }
    for (let y = 58; y < h; y++) for (let x = 60; x < 92; x++) { const top = 58 + Math.round(Math.abs(x - 76) * 0.6); if (y >= top) set(x, y, y === top ? '#e0ac3a' : '#3a2c20'); }
    for (const ax of [14, 118]) { for (let y = 2; y < 34; y++) set(ax + 4, y, '#4e3420'); for (let y = 3; y < 24; y++) for (let x = ax + 5; x < ax + 19; x++) set(x, y, (x + y) % 9 ? '#3f6aa0' : '#ffd86a'); }
    for (let y = 8; y < 30; y++) for (let x = 56; x < 96; x++) {   // the crown on top
      const u = (x - 56) / 40, peak = 8 + Math.abs(Math.sin(u * Math.PI * 3)) * 13;
      if (y >= peak) set(x, y, y > 25 ? '#b98322' : (x + y) % 11 === 0 ? '#fff0a8' : '#e0ac3a');
    }
  });
}
function pier() {
  return sprite(56, 26, set => {
    for (let y = 8; y < 26; y++) for (let x = 2; x < 54; x++) set(x, y, (y >> 2) & 1 ? '#9c6a3c' : '#c08a50');
    for (const x of [4, 50]) for (let y = 0; y < 26; y++) set(x, y, '#5e3c20');
    for (let x = 4; x < 50; x++) set(x, 2 + Math.round(Math.sin((x - 4) / 46 * Math.PI) * 3), '#d8c8a0');
  });
}
const SPOTS = [
  { name: 'Arena', go: 'ranked', x: 50, y: 18, tall: 4, make: arena },
  { name: 'Market', go: 'shop', x: 36, y: 30, tall: 4, make: () => shop(88, 72, 'red', { awning: true }) },
  { name: 'Post Office', go: 'mail', x: 64, y: 30, tall: 4, make: () => shop(84, 70, 'blue') },
  { name: 'Cup Hall', go: 'cup', x: 36, y: 44, tall: 4, make: () => shop(88, 76, 'gold', { awning: true }) },
  { name: 'Inn', x: 64, y: 44, tall: 4, make: () => shop(84, 72, 'green') },
  { name: 'Sky Tower', x: 41, y: 22, tall: 3, make: () => glassTower(68, 130, 'blue') },
  { name: 'Mind Tower', x: 59, y: 22, tall: 3, make: () => glassTower(68, 150, 'plum') },
  { x: 44, y: 45, tall: 3, make: () => shop(64, 58, 'plum', { awning: true }) }, { x: 56, y: 45, tall: 3, make: () => shop(64, 58, 'red', { awning: true }) },
  { name: 'Island Dock', go: 'island', x: 50, y: 60, tall: 1, make: pier, flat: true },
  { x: 8, y: 22, tall: 3, make: () => shop(64, 58, 'red') }, { x: 15, y: 27, tall: 3, make: () => shop(64, 58, 'plum') },
  { x: 86, y: 24, tall: 3, make: () => shop(64, 58, 'green') }, { x: 92, y: 30, tall: 3, make: () => shop(64, 58, 'blue') },
  { x: 22, y: 50, tall: 3, make: () => shop(64, 58, 'green') }, { x: 78, y: 52, tall: 3, make: () => shop(64, 58, 'red') }, { x: 72, y: 16, tall: 3, make: () => shop(64, 58, 'gold') }, { x: 28, y: 15, tall: 3, make: () => shop(64, 58, 'blue') },
];
// ---------- the map ----------
function buildMap() {
  const n = makeNoise(4211), t = new Uint8Array(TW * TH), block = new Uint8Array(TW * TH), props = [], doors = {};
  const blob = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (fbm(n, x / 7, y / 7, 3) - 0.5) * 0.7 < 1;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (blob(x, y, 50, 31, 36, 26) || blob(x, y, 11, 25, 9, 10) || blob(x, y, 90, 27, 9, 10)) t[key(x, y)] = GRASS;
  const land = (x, y) => x >= 0 && y >= 0 && x < TW && y < TH && t[key(x, y)] !== WATER;
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < TW && y < TH) t[key(x, y)] = v; };
  const lay = (x0, y0, x1, y1, wide, ground) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let w = 0; w < wide; w++) { const X = x0 === x1 ? x + w : x, Y = x0 === x1 ? y : y + w; set(X, Y, land(X, Y) && t[key(X, Y)] !== PLANK ? ground : PLANK); } };
  // sand where land meets water
  const sand = [];
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (t[key(x, y)] === GRASS && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([a, b]) => !land(x + a, y + b))) sand.push(key(x, y));
  for (const k of sand) t[k] = SAND;
  // streets
  for (let y = 19; y <= 46; y++) for (let x = 30; x <= 70; x++) { const c = Math.max(0, 5 - Math.min(y - 19, 46 - y)); if (x - 30 >= c && 70 - x >= c) set(x, y, COBBLE); }
  lay(12, 32, 30, 32, 3, DIRT); lay(70, 33, 90, 33, 3, DIRT); lay(49, 46, 49, 61, 3, DIRT); lay(30, 40, 22, 40, 2, DIRT); lay(22, 40, 22, 52, 2, DIRT); lay(70, 40, 78, 40, 2, DIRT); lay(78, 40, 78, 54, 2, DIRT);
  lay(30, 22, 28, 22, 2, DIRT); lay(28, 17, 28, 22, 2, DIRT); lay(70, 22, 72, 22, 2, DIRT); lay(72, 18, 72, 22, 2, DIRT); lay(9, 24, 9, 32, 2, DIRT); lay(15, 29, 15, 32, 2, DIRT); lay(87, 26, 87, 33, 2, DIRT); lay(92, 32, 92, 33, 2, DIRT);
  // little gardens around the fountain
  for (const [x0, y0] of [[41, 24], [55, 24], [41, 35], [55, 35]]) {
    for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 6; x++) { set(x, y, GRASS); block[key(x, y)] = 1; }
    props.push({ spr: bsprites.flowers(), x: (x0 + 1) * T + 8, y: (y0 + 2) * T }, { spr: bsprites.flowers(), x: (x0 + 4) * T + 8, y: (y0 + 2) * T }, { spr: sprites.tree('blossom', x0 % 3), x: (x0 + 3) * T, y: (y0 + 4) * T + 10 }, { spr: bsprites.bench(), x: (x0 + 3) * T, y: (y0 + 6) * T - 4 });
  }
  // fountain in the square
  for (let y = 31; y <= 34; y++) for (let x = 48; x <= 52; x++) block[key(x, y)] = 1;
  props.push({ spr: bsprites.fountain(), x: 50 * T + 8, y: 35 * T, big: 3 });
  for (const b of SPOTS) {
    b.spr = b.make();
    const wt = Math.ceil(b.spr.w / T / 2);
    if (!b.flat) for (let y = b.y - b.tall; y < b.y; y++) for (let x = b.x - wt; x <= b.x + wt - 1; x++) if (x >= 0 && y >= 0) block[key(x, y)] = 1;
    b.px = b.x * T + (b.flat ? 8 : 0); b.py = b.y * T;
    if (b.name) doors[b.name] = { x: b.x, y: b.y + (b.flat ? -1 : 0) };
    props.push({ spr: b.spr, x: b.px, y: b.py, flat: !!b.flat });
    for (const x of [b.x - 1, b.x]) if (t[key(x, b.y)] === GRASS) t[key(x, b.y)] = DIRT;
  }
  const open = k => t[k] !== WATER && !block[k];
  // lamps along the square, trees on the grass
  for (const [x, y] of [[33, 26], [67, 26], [33, 37], [67, 37], [48, 45], [52, 45]]) { block[key(x, y)] = 1; props.push({ spr: bsprites.lamp(), x: x * T + 8, y: y * T + 14 }); }
  const KINDS = ['leaf', 'pine', 'blossom', 'autumn'];
  for (let y = 2; y < TH - 2; y++) for (let x = 2; x < TW - 2; x++) {
    const k = key(x, y);
    if (t[k] !== GRASS || block[k] || hash(x, y, 91) > 0.13) continue;
    if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, 2]].some(([a, b]) => { const q = key(x + a, y + b); return t[q] === DIRT || t[q] === COBBLE || block[q]; })) continue;
    block[k] = 1;
    props.push({ spr: sprites.tree(KINDS[hash(x, y, 92) * 4 | 0], hash(x, y, 93) * 3 | 0), x: x * T + 8, y: y * T + 15 });
  }
  return { t, block, props, doors, open };
}
function paintGround() {
  const c = document.createElement('canvas'); c.width = WW; c.height = WH;
  const q = c.getContext('2d'), { t } = map, at = (x, y) => (x < 0 || y < 0 || x >= TW || y >= TH ? WATER : t[key(x, y)]);
  const tones = { [WATER]: ['#3f7fb8', '#3a78b0', '#4488c0'], [SAND]: ['#e4cf96', '#dcc488', '#eed9a4'], [GRASS]: ['#6aa858', '#62a050', '#72b060'], [COBBLE]: ['#c0b8a4', '#b0a894', '#ccc4b0'], [DIRT]: ['#d8b878', '#ccac6c', '#e0c488'], [PLANK]: ['#a87444', '#9c6a3c', '#b4804e'] };
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const v = at(x, y), set = tones[v], px = x * T, py = y * T;
    q.fillStyle = set[0]; q.fillRect(px, py, T, T);
    if (v === WATER) { for (let i = 0; i < 3; i++) { q.fillStyle = set[1 + (i & 1)]; q.fillRect(px + (hash(x, y, i) * 12 | 0), py + (hash(x, y, i + 4) * 14 | 0), 4 + (hash(x, y, i + 8) * 8 | 0), 2); } if (hash(x, y, 40) > 0.94) { q.fillStyle = '#9cd0ec'; q.fillRect(px + 4, py + 7, 6, 1); } }
    else if (v === COBBLE) { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { q.fillStyle = set[hash(x * 2 + i, y * 2 + j, 5) * 3 | 0]; q.fillRect(px + i * 8 + (j & 1) * 2, py + j * 8, 7, 7); } }
    else if (v === PLANK) { for (let j = 0; j < 4; j++) { q.fillStyle = set[1 + (j & 1)]; q.fillRect(px, py + j * 4, T, 3); } }
    else { for (let i = 0; i < 5; i++) { q.fillStyle = set[1 + (i & 1)]; q.fillRect(px + (hash(x, y, i + 11) * 15 | 0), py + (hash(x, y, i + 21) * 15 | 0), 2, 2); } }
    if (v === GRASS && hash(x, y, 31) > 0.9) { q.fillStyle = ['#ff8fb0', '#ffe27a', '#ffffff'][hash(x, y, 32) * 3 | 0]; q.fillRect(px + 6, py + 6, 2, 2); q.fillStyle = '#4e8a40'; q.fillRect(px + 6, py + 8, 2, 3); }
    // cliffs: land drops into the sea on its south side, foam on every shore
    if (v !== WATER && v !== PLANK && at(x, y + 1) === WATER) { q.fillStyle = '#a0683c'; q.fillRect(px, py + 10, T, 6); q.fillStyle = '#7a4a2a'; q.fillRect(px, py + 14, T, 2); for (let i = 0; i < T; i += 5) q.fillRect(px + i, py + 10, 1, 4); }
    if (v === WATER) { q.fillStyle = 'rgba(255,255,255,.55)'; if (at(x, y - 1) !== WATER) q.fillRect(px, py + 1, T, 2); if (at(x - 1, y) !== WATER) q.fillRect(px + 1, py, 2, T); if (at(x + 1, y) !== WATER) q.fillRect(px + T - 3, py, 2, T); if (at(x, y + 1) !== WATER) q.fillRect(px, py + T - 3, T, 2); }
  }
  return c;
}
// walk along tile centres (shortest way round water, trees and buildings)
function pathTo(sx, sy, tx, ty) {
  const s = key(sx / T | 0, sy / T | 0);
  let goal = key(Math.max(0, Math.min(TW - 1, tx / T | 0)), Math.max(0, Math.min(TH - 1, ty / T | 0)));
  if (!map.open(goal)) {
    let best = -1, bd = 1e9;
    for (let k = 0; k < TW * TH; k++) if (map.open(k)) { const d = Math.hypot(k % TW - goal % TW, (k / TW | 0) - (goal / TW | 0)); if (d < bd) { bd = d; best = k; } }
    goal = best;
  }
  const from = new Int32Array(TW * TH).fill(-1), q = [s];
  from[s] = s;
  for (let i = 0; i < q.length && from[goal] < 0; i++) {
    const k = q[i], x = k % TW;
    for (const n of [x > 0 ? k - 1 : -1, x < TW - 1 ? k + 1 : -1, k - TW, k + TW]) if (n >= 0 && n < TW * TH && from[n] < 0 && map.open(n)) { from[n] = k; q.push(n); }
  }
  if (from[goal] < 0) return [];
  const out = [];
  for (let k = goal; k !== s; k = from[k]) out.push({ x: (k % TW) * T + 8, y: (k / TW | 0) * T + 10 });
  return out.reverse();
}
// a loop around town the residents share; pure math from the clock so everyone sees them in the same place
let loop = [], loopLen = 0;
function buildLoop() {
  const stops = [[50, 38], [40, 40], [34, 32], [14, 33], [34, 32], [44, 25], [62, 26], [86, 34], [66, 34], [50, 44], [50, 56], [50, 44]].map(([x, y]) => ({ x: x * T + 8, y: y * T + 8 }));
  loop = [stops[0]];
  for (let i = 1; i <= stops.length; i++) { const p = stops[i % stops.length], l = loop[loop.length - 1]; loop.push(...pathTo(l.x, l.y, p.x, p.y)); }
  loopLen = loop.length;
}
function resident(i, t) {
  const a = hash(i, 1, 6), b = hash(i, 2, 6), speed = 1.1 + a * 0.5;
  const u = (t * speed + a * loopLen) % loopLen, n = u | 0, f = u - n, A = loop[n], B = loop[(n + 1) % loopLen];
  return { id: 1 + (hash(i, 3, 6) * 3333 | 0), x: A.x + (B.x - A.x) * f + (a - 0.5) * 8, y: A.y + (B.y - A.y) * f + (b - 0.5) * 6, dir: B.x < A.x ? -1 : 1, walking: true };
}
const look = id => { if (looks.has(id)) return looks.get(id); if (loads >= LOADS) return null; loads++; try { const c = chibi(id).full; looks.set(id, c); return c; } catch { return null; } };
function drawMind(m, step) {
  const s = look(m.id);
  g.fillStyle = 'rgba(43,35,64,.3)'; g.beginPath(); g.ellipse(m.x, m.y, 5, 1.6, 0, 0, 6.3); g.fill();
  if (!s) return;
  g.save(); g.translate(Math.round(m.x), Math.round(m.y) - (step && m.walking ? 1 : 0)); if (m.dir < 0) g.scale(-1, 1);
  g.drawImage(s.cv, -Math.floor(s.w / 2), 1 - s.h); g.restore();
}
function label(text, wx, wy, color = '#fff8e4', box = 'rgba(29,27,47,.85)', size = 13) {
  const x = (wx - CAM.x) * zoom + W / 2, y = (wy - CAM.y) * zoom + H / 2;
  if (x < -80 || x > W + 80 || y < -20 || y > H + 20) return;
  g.font = `800 ${size}px Nunito, sans-serif`; g.textAlign = 'center';
  const w = g.measureText(text).width + 12;
  g.fillStyle = box; g.fillRect(Math.round(x - w / 2), Math.round(y - size - 3), w, size + 8);
  g.fillStyle = color; g.fillText(text, x, y);
}
function clampCam() {
  const vw = W / zoom, vh = H / zoom;
  CAM.x = vw >= WW ? WW / 2 : Math.max(vw / 2, Math.min(WW - vw / 2, CAM.x));
  CAM.y = vh >= WH ? WH / 2 : Math.max(vh / 2, Math.min(WH - vh / 2, CAM.y));
}
const minZoom = () => Math.min(1, Math.min(W / WW, H / WH));
function setZoom(z) { zoom = Math.max(minZoom(), Math.min(3, z)); clampCam(); }
function frame(tMs) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (tMs - last) / 1000); last = tMs; loads = 0;
  const t = Date.now() / 1000 - 1.79e9;
  if (meP.path?.length) {
    const p = meP.path[0], d = Math.hypot(p.x - meP.x, p.y - meP.y), v = WALK * dt;
    if (p.x !== meP.x) meP.dir = p.x < meP.x ? -1 : 1;
    if (d <= v) { meP.x = p.x; meP.y = p.y; meP.path.shift(); if (!meP.path.length && meP.arrive) { const a = meP.arrive; meP.arrive = null; K.go(a); } }
    else { meP.x += (p.x - meP.x) / d * v; meP.y += (p.y - meP.y) / d * v; }
  }
  if (!free) { CAM.x += (meP.x - CAM.x) * 0.08; CAM.y += (meP.y - CAM.y) * 0.08; }
  clampCam();
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#3f7fb8'; g.fillRect(0, 0, cv.width, cv.height);
  const S = DPR * zoom, ox = W * DPR / 2 - CAM.x * S, oy = H * DPR / 2 - CAM.y * S;
  g.setTransform(S, 0, 0, S, ox, oy); g.imageSmoothingEnabled = false;
  g.drawImage(bg, 0, 0);
  const x0 = CAM.x - W / zoom / 2 - 90, x1 = CAM.x + W / zoom / 2 + 90, y0 = CAM.y - H / zoom / 2 - 40, y1 = CAM.y + H / zoom / 2 + 170;
  const draw = [];
  for (const p of map.props) if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) draw.push(p);
  for (let i = 0; i < RESIDENTS; i++) { const r = resident(i, t); if (r.x > x0 && r.x < x1 && r.y > y0 && r.y < y1) draw.push({ y: r.y, mind: r }); }
  for (const o of people.values()) {
    const d = Math.hypot(o.tx - o.x, o.ty - o.y), v = WALK * dt;
    if (d > v) { o.dir = o.tx < o.x ? -1 : 1; o.x += (o.tx - o.x) / d * v; o.y += (o.ty - o.y) / d * v; }
    draw.push({ y: o.y, mind: { id: o.mind || 49, x: o.x, y: o.y, dir: o.dir || 1, walking: d > v } });
  }
  draw.push({ y: meP.y, mind: { id: meP.mind, x: meP.x, y: meP.y, dir: meP.dir || 1, walking: !!meP.path?.length } });
  draw.sort((a, b) => (a.flat ? -1 : a.y) - (b.flat ? -1 : b.y));
  const step = Math.floor(tMs / 170) & 1;
  for (const d of draw) {
    if (d.mind) drawMind(d.mind, step);
    else if (d.big) g.drawImage(d.spr.cv, Math.round(d.x - d.spr.w), Math.round(d.y - d.spr.h * 2), d.spr.w * 2, d.spr.h * 2);
    else g.drawImage(d.spr.cv, Math.round(d.x - d.spr.w / 2), Math.round(d.y - d.spr.h));
  }
  // words stay the same size at every zoom
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const b of SPOTS) if (b.name) label(b.name, b.px, b.py - b.spr.h + (b.flat ? 2 : -3), b.go ? '#d4ff1f' : '#fff8e4', undefined, 12);
  for (const o of people.values()) label(o.name, o.x, o.y - 26);
  label('You', meP.x, meP.y - 26, '#d4ff1f');
  talkT -= dt;
  if (talkT <= 0) {   // a resident near you says something
    talkT = 2.5 + Math.random() * 3;
    const i = Math.random() * RESIDENTS | 0, r = resident(i, t);
    if (Math.hypot(r.x - meP.x, r.y - meP.y) < 320) bubbles.push({ res: i, text: babble(r.id, 'chat', 0.85), life: 2.6 });
  }
  for (const b of bubbles) {
    b.life -= dt;
    const p = b.res != null ? resident(b.res, t) : b.me ? meP : b;
    label(b.text, p.x, p.y - 38, '#2b2340', 'rgba(255,248,228,.96)');
  }
  bubbles = bubbles.filter(b => b.life > 0);
  beatT -= dt;
  if (beatT <= 0 && !document.hidden) { beatT = 10; beat(); }
}
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR; setZoom(zoom);
}
async function beat() {
  if (!K.online()) { $('#town-count').textContent = 'Offline: only you here'; return; }
  const say = sayQ; sayQ = '';
  try {
    const r = await K.api('town', { x: meP.x | 0, y: meP.y | 0, mind: meP.mind, say, after: chatAfter });
    const ids = new Set(r.people.map(o => o.id));
    for (const k of people.keys()) if (!ids.has(k)) people.delete(k);
    for (const o of r.people) { const q = people.get(o.id); if (q) { q.tx = o.x; q.ty = o.y; q.mind = o.mind; } else people.set(o.id, { ...o, tx: o.x, ty: o.y }); }
    $('#town-count').textContent = `🟢 ${r.count} ${r.count === 1 ? 'player' : 'players'} here`;
    stayLeft = r.stay; paintStay();
    for (const c of r.chat) {
      chatAfter = Math.max(chatAfter, c.id);
      $('#town-feed').insertAdjacentHTML('beforeend', `<div class="${c.kind === 'news' ? 'news' : ''}">${c.kind === 'news' ? '' : `<b>${K.esc(c.name)}</b> `}${K.esc(c.text)}</div>`);
      const who = c.kind === 'chat' && [...people.values()].find(o => o.name === c.name);
      if (who) bubbles.push({ x: who.x, y: who.y, text: c.text.slice(0, 48), life: 5 });
    }
    const f = $('#town-feed'); while (f.children.length > 40) f.firstChild.remove(); f.scrollTop = 1e9;
    if (r.got) { sfx('coin'); K.toast(r.got.kind === 'time' ? `Town Time! +${r.got.dust} ✨ (${r.got.n}/6 today)` : `You met ${r.got.who}! +${r.got.dust} ✨`); }
  } catch { $('#town-count').textContent = 'Reconnecting…'; }
}
function paintStay() { $('#town-stay').textContent = stayLeft ? `⏳ Town Time in ${Math.ceil(stayLeft / 60e3)} min` : ''; }
const toWorld = (cx, cy) => ({ x: CAM.x + (cx - W / 2) / zoom, y: CAM.y + (cy - H / 2) / zoom });
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) tap = { x: e.clientX, y: e.clientY, moved: 0 };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; tap = null; }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return; }
  if (!tap) return;
  tap.moved += Math.abs(dx) + Math.abs(dy);
  if (tap.moved > 8) { free = true; CAM.x -= dx / zoom; CAM.y -= dy / zoom; clampCam(); }
});
const release = e => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (e.type !== 'pointerup' || !tap || tap.moved > 8) { if (!ptrs.size) tap = null; return; }
  tap = null;
  const w = toWorld(e.clientX, e.clientY), b = SPOTS.find(s => s.name && Math.abs(w.x - s.px) < s.spr.w / 2 && w.y < s.py + 2 && w.y > s.py - s.spr.h - 22 / zoom);
  free = false;
  const d = b ? map.doors[b.name] : null;
  meP.path = pathTo(meP.x, meP.y, d ? d.x * T + 8 : w.x, d ? d.y * T + 10 : w.y);
  meP.arrive = b?.go || null;
  if (b?.go) sfx('select');
  if (b?.go && !meP.path.length) { meP.arrive = null; K.go(b.go); }
};
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 0.87)); }, { passive: false });
$('#town-in-z').onclick = () => setZoom(zoom * 1.3);
$('#town-out-z').onclick = () => setZoom(zoom / 1.3);
$('#town-all').onclick = () => { free = true; setZoom(minZoom()); };
$('#town-me').onclick = () => { free = false; setZoom(1.5); };
function send() {
  const b = $('#town-in'), text = b.value.trim();
  if (!text) return;
  b.value = ''; sayQ = text; beatT = 0;
  bubbles.push({ me: 1, text: text.slice(0, 48), life: 5 });
}
$('#town-send').onclick = send;
$('#town-in').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); });
addEventListener('resize', () => { if (running) resize(); });
export function initTown(ctx) { K = ctx; }
export function openTown() {
  if (!map) { map = buildMap(); bg = paintGround(); buildLoop(); }
  meP ||= { x: 50 * T, y: 38 * T, mind: 49, dir: 1, path: [] };
  meP.mind = K.minds()[0] || 49; meP.path = []; meP.arrive = null; free = false; chatAfter = 0; $('#town-feed').innerHTML = ''; people.clear();
  CAM.x = meP.x; CAM.y = meP.y; beatT = 0.3; zoom = 1.5;
  resize(); music('town');
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
}
export function closeTown() { running = false; cancelAnimationFrame(raf); }
