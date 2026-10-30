// Mind Town's art, all drawn in code: detailed top-down tiles (paving, terraced cliffs, wavy sea, flowers) and
// buildings with shingled roofs, framed windows and side shading. Light always comes from the upper left.
import { sprite } from './island/pixel.js';
import { hash } from './island/gen.js';

export const T = 16;
export const WATER = 0, SAND = 1, GRASS = 2, PAVE = 3, PATH = 4, PLANK = 5, ROCK = 6, MEADOW = 7;

const hex2 = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const dk = (c, f) => { const [r, g, b] = hex2(c); const h = v => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0'); return `#${h(r)}${h(g)}${h(b)}`; };
const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dither = (x, y, u) => u * 16 > B4[y & 3][x & 3];
// walls get darker toward the right edge, with a dithered step between shades
const lit = (c, x, w, y) => { const u = x / w; return u < 0.1 ? dk(c, 1.08) : dither(x, y, (u - 0.45) * 1.8) ? dk(c, 0.84) : c; };

// ---------- buildings ----------
function windowAt(set, x, y, w = 9, h = 11, warm = false) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1, bar = i === (w >> 1) || j === (h >> 1);
    set(x + i, y + j, edge ? '#f4efe2' : bar ? '#c8c2b0' : warm ? (j < 3 ? '#ffe9a8' : '#f2c668') : i + j < 4 ? '#e6f6ff' : j > h - 4 ? '#5c94c4' : '#86bee0');
  }
  for (let i = -1; i <= w; i++) { set(x + i, y + h, '#8a8272'); set(x + i, y + h + 1, '#5e5648'); }
}
function roof(set, w, h, c, { inset = 0.3 } = {}) {
  for (let y = 0; y < h; y++) {
    const pad = Math.round((h - y) * inset), row = y >> 1, shade = 1.18 - (y / h) * 0.42;
    for (let x = pad; x < w - pad; x++) {
      const seam = (x + (row & 1) * 3) % 6 === 0 || (y & 1) === 1 && (x + (row & 1) * 3) % 6 === 3;
      let col = dk(c, shade * (seam ? 0.78 : 1));
      if (x < pad + 2) col = dk(c, 1.3); else if (x > w - pad - 3) col = dk(c, 0.62);
      if ((y & 1) === 1 && !seam) col = dk(col, 0.92);
      set(x, y, col);
    }
    if (y === 0) for (let x = pad; x < w - pad; x++) set(x, y, dk(c, 1.45));
  }
  for (let x = 0; x < w; x++) { set(x, h, dk(c, 0.42)); set(x, h + 1, '#3c3226'); }
}
function door(set, x, y, h, c = '#7a4a2a', glass = false) {
  const w = 14;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const frame = i === 0 || i === w - 1 || j === 0;
    set(x + i, y + j, frame ? '#3c2c20' : i === 7 ? dk(c, 0.6) : glass && j < h - 3 ? (i + j < 8 ? '#d8f0ff' : '#7fb4d8') : dk(c, j < 3 ? 1.15 : 1));
  }
  set(x + 5, y + (h >> 1), '#ffd86a'); set(x + 9, y + (h >> 1), '#ffd86a');
  for (let i = -2; i < w + 2; i++) { set(x + i, y + h, '#d4ccb8'); set(x + i, y + h + 1, '#8a8272'); }
}
function planter(set, x, y, w) {
  for (let i = 0; i < w; i++) { set(x + i, y + 2, '#8a5a34'); set(x + i, y + 3, '#6a4426'); for (let j = 0; j < 2; j++) set(x + i, y + j, (i + j) % 3 ? '#4f9a48' : ['#ff6f91', '#ffd84a', '#f4f4ff'][i % 3]); }
}
export function shop(w, h, tone, { awning = false, bricks = false, sign = null } = {}) {
  const roofH = Math.round(h * 0.4), wall = bricks ? '#c98a64' : '#f0e4c8';
  return sprite(w, h, set => {
    for (let y = roofH + 2; y < h; y++) for (let x = 1; x < w - 1; x++) {
      const brick = bricks && ((y % 4 === 0) || (x + ((y >> 2) & 1) * 4) % 8 === 0);
      set(x, y, y > h - 4 ? '#8e8678' : lit(brick ? dk(wall, 0.84) : wall, x, w, y));
    }
    for (let y = roofH + 2; y < h - 4; y++) { set(1, y, '#fff6e0'); set(w - 2, y, '#7c7060'); }
    roof(set, w, roofH, tone);
    if (w > 70) { for (let y = 0; y < 8; y++) for (let x = w - 22; x < w - 14; x++) if (y > 1) set(x, y - 2 + 4, x === w - 22 ? '#a06a4a' : '#7c4a34'); }
    const top = roofH + 8, n = Math.max(1, Math.floor((w - 28) / 26));
    for (let i = 0; i < n; i++) { windowAt(set, 7 + i * 13, top); windowAt(set, w - 16 - i * 13, top); }
    const dx = (w >> 1) - 7;
    door(set, dx, h - 19, 15, tone);
    if (awning) for (let x = 3; x < w - 3; x++) for (let y = 0; y < 6; y++) { const s = (x >> 2) & 1; set(x, roofH + 2 + y, y === 5 ? dk(tone, 0.6) : s ? '#fff6e0' : dk(tone, 1.1)); }
    if (sign) { for (let x = dx - 6; x < dx + 20; x++) for (let y = h - 26; y < h - 20; y++) set(x, y, y === h - 26 || y === h - 21 ? '#3c2c20' : sign); }
    planter(set, 5, h - 8, 14); planter(set, w - 19, h - 8, 14);
  });
}
export function tower(w, h, tone, { roofTone = '#5a6a7c' } = {}) {
  return sprite(w, h, set => {
    const slab = 12;
    for (let y = 0; y < slab; y++) for (let x = 2; x < w - 2; x++) set(x, y, y > slab - 3 ? '#39424e' : y < 2 ? dk(roofTone, 1.3) : lit(roofTone, x, w, y));
    for (const ax of [8, w - 22]) for (let y = 2; y < 8; y++) for (let x = ax; x < ax + 12; x++) set(x, y, y === 2 ? '#c8ccd2' : (x + y) % 4 ? '#8e96a0' : '#6c7480');
    for (let y = slab; y < h - 18; y++) for (let x = 0; x < w; x++) {
      const fy = (y - slab) % 12, fx = x % 10, frame = fy > 8 || fx < 2, band = ((y - slab) / 12 | 0) % 4 === 3 && fy > 8;
      const lightOn = hash((x / 10) | 0, ((y - slab) / 12) | 0, 7) > 0.8;
      let c = frame ? (band ? dk(tone, 1.2) : tone) : lightOn ? (fy < 3 ? '#fff0b8' : '#f4cf7a') : fx + fy < 7 ? '#d8f2ff' : fy > 5 ? '#4e88b8' : '#74aed4';
      c = dk(c, x > w * 0.72 ? 0.72 : x < 6 ? 1.1 : 1);
      set(x, y, c);
    }
    for (let y = h - 18; y < h; y++) for (let x = 0; x < w; x++) set(x, y, y < h - 15 ? dk(tone, 0.7) : y > h - 3 ? '#6e6a60' : lit('#d0ccc0', x, w, y));
    door(set, (w >> 1) - 7, h - 14, 12, '#4e5c70', true);
    for (let x = (w >> 1) - 18; x < (w >> 1) + 18; x++) for (let y = h - 22; y < h - 17; y++) set(x, y, y === h - 18 ? dk(tone, 0.5) : dk(tone, 1.25));
  });
}
export function arena() {
  const w = 176, h = 124;
  return sprite(w, h, set => {
    const stone = '#c4bca8';
    for (let y = 34; y < h; y++) for (let x = 0; x < w; x++) {
      const pad = Math.max(0, 18 - (y - 34)), row = (y - 34) >> 3;
      if (x < pad || x >= w - pad) continue;
      const seam = (y - 34) % 8 === 0 || (x + (row & 1) * 8) % 16 === 0;
      set(x, y, lit(seam ? dk(stone, 0.74) : stone, x, w, y));
    }
    for (let i = 0; i < 7; i++) {
      const ax = 15 + i * 22;
      if (i === 3) continue;
      for (let y = 58; y < 84; y++) for (let x = ax; x < ax + 15; x++) {
        const top = 58 + Math.round(Math.abs(x - ax - 7) * 0.9);
        if (y >= top) set(x, y, y === top || x === ax || x === ax + 14 ? '#5e5844' : y > 79 ? '#4a5470' : '#2f3a58');
      }
      for (let x = ax - 1; x < ax + 16; x++) set(x, 85, '#8a8272');
    }
    for (let y = 62; y < h; y++) for (let x = 68; x < 108; x++) {
      const top = 62 + Math.round(Math.abs(x - 88) * 0.45);
      if (y >= top) set(x, y, y < top + 3 ? '#e8b640' : (x - 68) % 12 === 0 ? '#5a3e22' : '#2e2218');
    }
    for (const ax of [20, 128]) {
      for (let y = 0; y < 40; y++) set(ax + 7, y, '#4e3420');
      for (let y = 3; y < 30; y++) for (let x = ax + 8; x < ax + 26 - Math.max(0, y - 22); x++) set(x, y, (x >> 2) % 2 === 0 ? '#3f6aa0' : '#5a8cc4');
      for (let x = ax + 8; x < ax + 26; x++) set(x, 3, '#ffd86a');
    }
    for (let y = 6; y < 38; y++) for (let x = 60; x < 116; x++) {   // the crown on the gate
      const u = (x - 60) / 56, peak = 6 + Math.abs(Math.sin(u * Math.PI * 3)) * 16;
      if (y < peak) continue;
      const jewel = y > 26 && y < 31 && (x - 60) % 11 < 4;
      set(x, y, jewel ? ['#e0364e', '#3f8fe0'][(x >> 3) & 1] : y > 30 ? '#a8761c' : dither(x, y, u * 0.7) ? '#d09a28' : (x + y) % 13 === 0 ? '#fff4b4' : '#f0c040');
    }
  });
}
export function pier() {
  return sprite(64, 34, set => {
    for (let y = 10; y < 34; y++) for (let x = 2; x < 62; x++) set(x, y, (y >> 2) % 2 ? '#a8784a' : y % 4 === 0 ? '#6e4a2a' : '#c49058');
    for (const x of [3, 31, 59]) for (let y = 0; y < 34; y++) { set(x, y, '#5e3c20'); set(x + 1, y, '#7a5230'); }
    for (let x = 4; x < 59; x++) { const y = 3 + Math.round(Math.abs(Math.sin((x - 4) / 55 * Math.PI * 2)) * 3); set(x, y, '#e8dcbc'); }
  });
}
export function tree(v) {
  const ramps = [['#2f6a3a', '#3f8a44', '#58a84c', '#84c85c', '#b8e47a'], ['#2c5e4a', '#3a7c58', '#4f9a64', '#74b878', '#a8d890'], ['#34683a', '#4c8e3e', '#6aae48', '#94cc5c', '#c8ea80']];
  const R = ramps[v % 3];
  return sprite(30, 36, set => {
    for (let y = 26; y < 36; y++) for (let x = 12; x < 18; x++) set(x, y, x < 14 ? '#8a5a34' : x > 15 ? '#4e3220' : '#6e4426');
    const puff = (cx, cy, r) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y) / r; if (d > 1) continue;
      const li = (x + y) / (2 * r) + d * 0.35, i = li < -0.45 ? 4 : li < -0.1 ? 3 : li < 0.3 ? 2 : li < 0.62 ? 1 : 0;
      set(cx + x, cy + y, dither(cx + x, cy + y, 0.3) && i < 4 ? R[i + 1] : R[i]);
    } };
    puff(15, 19, 10); puff(8, 17, 7); puff(22, 17, 7); puff(11, 10, 8); puff(20, 10, 7); puff(15, 7, 6);
    for (let i = 0; i < 16; i++) { const x = 4 + hash(i, v, 3) * 22 | 0, y = 3 + hash(i, v, 4) * 22 | 0; set(x, y, R[4]); set(x + 1, y, R[3]); }
  });
}
export function hedge(w = 32) {
  return sprite(w, 14, set => { for (let y = 0; y < 14; y++) for (let x = 0; x < w; x++) { const u = Math.sin(x * 0.9 + (y >> 2)) * 0.5 + 0.5, i = y < 3 ? 3 : y > 10 ? 0 : u > 0.6 ? 2 : 1; set(x, y, ['#2f6a3a', '#3f8a44', '#58a84c', '#84c85c'][i]); } });
}
export function lampPost() {
  return sprite(10, 34, set => {
    for (let y = 8; y < 32; y++) { set(4, y, '#39424e'); set(5, y, '#5a6a7c'); }
    for (let x = 2; x < 8; x++) { set(x, 32, '#39424e'); set(x, 33, '#2a2f38'); set(x, 8, '#39424e'); }
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) set(x, y, y === 2 ? '#39424e' : x + y < 8 ? '#fff6c8' : '#ffd86a');
    set(4, 1, '#39424e'); set(5, 1, '#39424e');
  });
}
export function bench() {
  return sprite(26, 14, set => { for (let x = 1; x < 25; x++) { for (const y of [1, 3, 5]) set(x, y, y === 5 ? '#8a5a34' : '#b98452'); set(x, 8, '#c8945e'); set(x, 9, '#8a5a34'); } for (const x of [3, 21]) for (let y = 0; y < 14; y++) set(x, y, '#39424e'); });
}
export function bed(w = 32) {
  return sprite(w, 14, set => {
    for (let y = 0; y < 14; y++) for (let x = 0; x < w; x++) set(x, y, y > 10 ? '#a89c84' : x === 0 || x === w - 1 ? '#c4bca8' : '#5f4228');
    for (let i = 0; i < w * 2; i++) { const x = 2 + hash(i, w, 5) * (w - 4) | 0, y = 1 + hash(i, w, 6) * 8 | 0; set(x, y, i % 3 ? '#4f9a48' : ['#ff6f91', '#ffd84a', '#ffffff', '#c98aff'][i % 4]); }
  });
}
export function fountain() {
  return sprite(72, 54, set => {
    const ring = (rx, ry, cy, c) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x / rx) ** 2 + (y / ry) ** 2 <= 1) set(36 + x, cy + y, typeof c === 'function' ? c(x, y) : c); };
    ring(35, 18, 35, (x, y) => (y > 10 ? '#8a8272' : x < -18 ? '#e0dac8' : '#c4bca8'));
    ring(30, 14, 34, (x, y) => (Math.sin(x * 0.7 + y) > 0.75 ? '#c8f0ff' : x + y < -8 ? '#7fd0ee' : '#46a4d4'));
    ring(9, 5, 33, '#c4bca8');
    for (let y = 8; y < 33; y++) for (let x = 33; x < 39; x++) set(x, y, x < 35 ? '#f0ead8' : x > 36 ? '#a89c84' : '#d4ccb8');
    ring(12, 4, 12, (x, y) => (y > 1 ? '#a89c84' : '#e0dac8'));
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.28, r = 7 + (i % 4) * 2.2; set(36 + Math.cos(a) * r * 1.7, 8 + Math.sin(a) * r * 0.9 - (i % 3), i % 2 ? '#e6f8ff' : '#8fdcf4'); }
  });
}

// ---------- ground ----------
const P = {
  grass: ['#71b85a', '#68ae52', '#7cc464', '#5c9e4a'], meadow: ['#5f9f4c', '#558f44', '#6cae56'],
  pave: ['#d6cfbe', '#c9c1ae', '#e0dacb', '#a89f8c'], path: ['#e6d3a0', '#dcc690', '#efdfb4', '#c4ab74'], sand: ['#efdca6', '#e4cf94', '#f6e8bc'],
  sea: ['#3a86c8', '#347cbc', '#4692d2', '#9ad4f0'], rock: ['#c07c4a', '#a4663a', '#d8965e', '#7c4a2a', '#f0b880'],
};
export function paintTile(q, v, x, y, at, phase) {
  const px = x * T, py = y * T, r = (n, m = 1) => hash(x, y, n) * m;
  const dot = (c, a, b, w = 1, h = 1) => { q.fillStyle = c; q.fillRect(px + a, py + b, w, h); };
  if (v === WATER) {
    dot(P.sea[0], 0, 0, T, T);
    for (let j = 0; j < 3; j++) { const wy = (j * 5 + r(j) * 3 | 0) + 1, wx = r(j + 3, 10) | 0; dot(P.sea[1 + (j & 1)], wx, wy, 6, 1); dot(P.sea[1 + (j & 1)], wx + 2, wy + 1, 4, 1); }
    if (r(9) > 0.82) { const sh = ((r(10, 2) | 0) + phase) & 1; dot(P.sea[3], 3 + sh * 5, 5 + sh * 3, 4, 1); dot(P.sea[3], 2 + sh * 5, 6 + sh * 3, 1, 1); dot(P.sea[3], 7 + sh * 5, 6 + sh * 3, 1, 1); }
    const shore = (a, b) => at(a, b) !== WATER;
    if (shore(x, y - 1)) { dot('#7fc4e8', 0, 0, T, 4); dot('#ffffff', phase * 4, 1 + phase, 10, 1); dot('#ffffff', 10 - phase * 4, 3, 5, 1); }
    if (shore(x - 1, y)) { dot('#7fc4e8', 0, 0, 3, T); dot('#ffffff', 1, 3 + phase * 4, 1, 7); }
    if (shore(x + 1, y)) { dot('#7fc4e8', T - 3, 0, 3, T); dot('#ffffff', T - 2, 2 + phase * 4, 1, 7); }
    if (shore(x, y + 1)) { dot('#7fc4e8', 0, T - 3, T, 3); dot('#ffffff', 2 + phase * 4, T - 2, 8, 1); }
    return;
  }
  if (v === PLANK) {
    dot('#a87444', 0, 0, T, T);
    for (let j = 0; j < 4; j++) { dot(j & 1 ? '#c49058' : '#b4804e', 0, j * 4, T, 3); dot('#6e4a2a', 0, j * 4 + 3, T, 1); dot('#6e4a2a', (r(j) * 12 | 0), j * 4, 1, 3); }
    return;
  }
  if (v === GRASS || v === MEADOW) {
    const G = v === MEADOW ? P.meadow : P.grass;
    dot(G[0], 0, 0, T, T);
    for (let i = 0; i < 7; i++) dot(G[1 + (i % 2)], r(i + 11, 15) | 0, r(i + 21, 15) | 0, 2, 1);
    if (v === MEADOW) for (let i = 0; i < 4; i++) { const a = r(i + 31, 13) | 0, b = 2 + (r(i + 35, 11) | 0); dot('#3f7a38', a, b, 1, 3); dot('#3f7a38', a + 2, b, 1, 3); dot('#3f7a38', a + 1, b + 1, 1, 3); }
    else {
      if (r(41) > 0.72) { const a = 2 + (r(42, 10) | 0), b = 3 + (r(43, 9) | 0); dot('#4f8f42', a, b, 1, 2); dot('#4f8f42', a + 3, b, 1, 2); dot('#4f8f42', a + 1, b + 1, 2, 1); }
      if (r(44) > 0.9) { const c = ['#ff7fa0', '#ffe27a', '#ffffff', '#c9a6ff'][r(45, 4) | 0], a = 3 + (r(46, 8) | 0), b = 3 + (r(47, 8) | 0); dot(c, a, b - 1, 1, 1); dot(c, a - 1, b, 3, 1); dot(c, a, b + 1, 1, 1); dot('#fff0a0', a, b, 1, 1); dot('#3f7a38', a, b + 2, 1, 2); }
    }
  } else if (v === PAVE) {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { dot(P.pave[hash(x * 2 + i, y * 2 + j, 5) * 3 | 0], i * 8, j * 8, 8, 8); if (((x + y) & 1) === 0) { dot('#bdb5a2', i * 8, j * 8, 8, 1); dot('#bdb5a2', i * 8, j * 8, 1, 8); } }
  } else if (v === PATH || v === SAND) {
    const G = v === PATH ? P.path : P.sand;
    dot(G[0], 0, 0, T, T);
    for (let i = 0; i < 6; i++) dot(G[1 + (i % 2)], r(i + 51, 14) | 0, r(i + 61, 15) | 0, 2, 1);
    if (r(70) > 0.75) dot(v === PATH ? P.path[3] : '#c9b078', r(71, 13) | 0, r(72, 13) | 0, 2, 2);
  } else if (v === ROCK) {
    dot(P.rock[0], 0, 0, T, T);
    for (let j = 0; j < 3; j++) { dot(P.rock[3], 0, j * 5 + 4, T, 1); dot(P.rock[2], (r(j + 80, 9) | 0), j * 5, 7, 2); dot(P.rock[1], (r(j + 83, 12) | 0), j * 5 + 2, 4, 2); dot(P.rock[3], (r(j + 86, 15) | 0), j * 5, 1, 4); }
    if (at(x, y - 1) !== ROCK) { dot('#5c9e4a', 0, 0, T, 2); dot(P.rock[4], 0, 2, T, 1); }
  }
  // edges: paths get a kerb, grass meets sand softly
  if (v === PAVE) for (const [a, b, X, Y, W, H] of [[x, y - 1, 0, 0, T, 2], [x, y + 1, 0, T - 2, T, 2], [x - 1, y, 0, 0, 2, T], [x + 1, y, T - 2, 0, 2, T]]) if ([GRASS, MEADOW, SAND].includes(at(a, b))) { dot('#8e8678', X, Y, W, H); }
  if (v === PATH) for (const [a, b, X, Y, W, H] of [[x, y - 1, 0, 0, T, 1], [x, y + 1, 0, T - 1, T, 1], [x - 1, y, 0, 0, 1, T], [x + 1, y, T - 1, 0, 1, T]]) if ([GRASS, MEADOW].includes(at(a, b))) dot('#a8945e', X, Y, W, H);
  if (v === SAND) for (const [a, b, X, Y, W, H] of [[x, y - 1, 0, 0, T, 2], [x - 1, y, 0, 0, 2, T], [x + 1, y, T - 2, 0, 2, T]]) if (at(a, b) === GRASS) { dot(P.grass[3], X, Y, W, H); }
  // terraced sea cliffs on the south side of the land, a rock lip on the sides
  if (at(x, y + 1) === WATER && v !== ROCK) {
    dot(P.grass[3], 0, 4, T, 1);
    dot(P.rock[2], 0, 5, T, 3); dot(P.rock[0], 0, 8, T, 4); dot(P.rock[1], 0, 12, T, 4);
    for (let i = 0; i < T; i += 4) { const o = r(i + 90, 3) | 0; dot(P.rock[3], i + o, 7, 1, 5); dot(P.rock[3], i + 2 - o, 12, 1, 4); dot(P.rock[4], i + o + 1, 5, 2, 1); }
  }
  if (at(x - 1, y) === WATER && at(x, y + 1) !== WATER) { dot(P.rock[1], 0, 0, 3, T); dot(P.rock[2], 3, 0, 1, T); }
  if (at(x + 1, y) === WATER && at(x, y + 1) !== WATER) { dot(P.rock[3], T - 3, 0, 3, T); dot(P.rock[1], T - 4, 0, 1, T); }
}
