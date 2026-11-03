// Village buildings and defences, drawn by code in the island's pixel style (same outline + dithering).
// Each sprite stands on its footprint: bottom-centre of the sprite = bottom-centre of the tiles it covers.
import { sprite, pick, rng } from './pixel.js';
import { sprites } from './art.js';

const WOOD = ['#4a2e1c', '#6b4428', '#8b5a34', '#a87444', '#c99a63'];
const STONE = ['#4a4858', '#5b5a6e', '#7c7b8f', '#a3a2b5', '#cfcfdc'];
const ROOF = { house: ['#7a2416', '#a8341f', '#c94a2a', '#e8703e', '#ffa064'], barn: ['#6e1d1d', '#9a2a2a', '#c43c3c', '#e06060', '#ff9a8a'], mill: ['#3e3a4a', '#5b4a6e', '#7c62a0', '#a58fd0', '#cdbdf0'] };
const PLASTER = ['#c9a87a', '#e0c79a', '#f3dfb6', '#fff3d6'];
const GLASS = '#ffe27a', GLASS_N = '#ffd24a', DARK = '#2b2340';

// a pitched roof over a rectangle: rows from the ridge down, shaded by side
function roof(set, x0, x1, y0, y1, pal) {
  const mid = (x0 + x1) / 2;
  for (let y = y0; y <= y1; y++) {
    const spread = (y - y0) * ((x1 - x0) / 2) / (y1 - y0 + 0.01);
    for (let x = Math.floor(mid - spread); x <= Math.ceil(mid + spread); x++) {
      const left = x < mid, l = (left ? 0.75 : 0.45) - (y === y1 ? 0.25 : 0) + ((y - y0) % 3 === 0 ? -0.12 : 0);
      set(x, y, pick(pal, l, x, y));
    }
  }
}
function wallBlock(set, x0, x1, y0, y1, pal, beams = true) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const beam = beams && (x === x0 || x === x1 || y === y0 || (x - x0) % 7 === 0);
    set(x, y, beam ? WOOD[1] : pick(pal, 0.65 - (x - x0) / (x1 - x0) * 0.3, x, y));
  }
}
function door(set, x, y, w = 4, h = 6) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) set(x + xx, y + yy, yy === 0 ? WOOD[0] : xx === 0 ? WOOD[1] : WOOD[2]);
  set(x + w - 1, y + (h >> 1), GLASS);
}
function windowAt(set, x, y, night) {
  for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) set(x + xx, y + yy, xx === 1 || yy === 1 ? WOOD[1] : night ? GLASS_N : '#9fd8ff');
}

export function cottage(night = false) {
  return sprite(30, 30, set => {
    wallBlock(set, 3, 26, 14, 28, PLASTER);
    roof(set, 0, 29, 2, 15, ROOF.house);
    for (let y = 4; y < 9; y++) for (let x = 21; x < 24; x++) set(x, y, STONE[x === 21 ? 3 : 2]);    // chimney
    door(set, 13, 22);
    windowAt(set, 6, 19, night); windowAt(set, 21, 19, night);
  });
}
export function barn() {
  return sprite(32, 30, set => {
    wallBlock(set, 2, 29, 12, 28, ['#8a2a2a', '#a8341f', '#c43c3c', '#d85a4a'], false);
    for (let x = 2; x <= 29; x += 3) for (let y = 12; y <= 28; y++) set(x, y, '#7a2020');
    roof(set, 0, 31, 0, 13, ['#3e3a4a', '#4a4858', '#5b5a6e', '#7c7b8f', '#a3a2b5']);
    for (let y = 18; y <= 28; y++) for (let x = 11; x <= 20; x++) set(x, y, (x + y) % 4 === 0 || x === 11 || x === 20 || y === 18 ? '#f3dfb6' : '#6b2020');   // big doors with a cross
    for (let i = 0; i <= 9; i++) { set(11 + i, 18 + i, '#f3dfb6'); set(20 - i, 18 + i, '#f3dfb6'); }
    for (let x = 13; x <= 18; x++) for (let y = 6; y <= 9; y++) set(x, y, y === 6 || x === 13 || x === 18 ? WOOD[1] : '#ffd84a');   // hay loft
  });
}
export function camp() {   // a war tent with a banner and a weapon rack
  return sprite(32, 30, set => {
    for (let y = 6; y <= 27; y++) { const half = Math.round((y - 5) * 0.72); for (let x = 15 - half; x <= 16 + half; x++) set(x, y, x <= 15 ? (x + y) % 5 ? '#8a7a55' : '#766844' : (x + y) % 5 ? '#a8966a' : '#94835a'); }
    for (let i = 0; i < 22; i++) { const y = 6 + i, h = Math.round(i * 0.72); set(15 - h, y, '#4e4530'); set(16 + h, y, '#4e4530'); }
    for (let y = 16; y <= 27; y++) { const h = Math.round((y - 15) * 0.42); for (let x = 16 - h; x <= 15 + h; x++) set(x, y, '#2b2340'); }
    for (let y = 0; y <= 8; y++) set(15, y, WOOD[0]);
    for (let y = 0; y <= 3; y++) for (let x = 16; x <= 23 - y; x++) set(x, y, y === 3 ? '#7a2416' : '#a8341f');
    for (let x = 2; x <= 9; x++) { set(x, 22, WOOD[1]); set(x, 25, WOOD[1]); }
    for (const x of [3, 6, 8]) for (let y = 17; y <= 28; y++) set(x, y, y < 20 ? '#cfcfdc' : WOOD[0]);
  });
}
export function millBody() {
  return sprite(28, 34, set => {
    for (let y = 8; y <= 33; y++) {
      const hw = 7 + (y - 8) * 0.22;
      for (let x = Math.round(14 - hw); x <= Math.round(14 + hw); x++) set(x, y, (y % 5 === 0) ? STONE[1] : pick(STONE, 0.75 - (x - 14 + hw) / (2 * hw) * 0.45, x, y));
    }
    roof(set, 5, 23, 0, 9, ROOF.mill);
    door(set, 12, 27, 4, 7);
    windowAt(set, 12, 16, false);
  });
}
// the mill's sails, drawn rotating live
export function drawSails(g, x, y, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.fillStyle = WOOD[0]; g.fillRect(-0.5, 0, 1, 15);
    g.fillStyle = '#fff3d6'; g.fillRect(0.5, 3, 4, 11);
    g.fillStyle = '#c9a87a'; g.fillRect(0.5, 3, 4, 1); g.fillRect(0.5, 8, 4, 1);
  }
  g.fillStyle = WOOD[1]; g.fillRect(-1.5, -1.5, 3, 3);
  g.restore();
}
// a wall stone; neighbours join it into a line (mask: 1 = N, 2 = E, 4 = S, 8 = W)
const wallCache = new Map();
export function wallPiece(mask) {
  if (wallCache.has(mask)) return wallCache.get(mask);
  const s = sprite(16, 20, set => {
    const x0 = mask & 8 ? 0 : 3, x1 = mask & 2 ? 15 : 12, top = 4;
    for (let y = top; y < 20; y++) for (let x = x0; x <= x1; x++) {
      const row = ((y - top) / 4) | 0, mortar = (y - top) % 4 === 3 || (x + row * 3) % 6 === 0;
      set(x, y, y < top + 2 ? STONE[4] : mortar ? STONE[1] : pick(STONE, 0.65 - (y - top) / 40, x, y));
    }
    if (mask & 1) for (let y = 0; y < top; y++) for (let x = 4; x <= 11; x++) set(x, y, STONE[3]);
    for (const x of [x0 + 1, x1 - 2]) { set(x, top - 1, STONE[3]); set(x + 1, top - 1, STONE[3]); }   // crenels
  });
  wallCache.set(mask, s);
  return s;
}
export function tower() {
  return sprite(18, 38, set => {
    for (let y = 14; y < 38; y++) for (let x = 3; x <= 14; x++) set(x, y, x === 3 || x === 14 ? WOOD[0] : (y % 6 === 0 ? WOOD[1] : pick(WOOD, 0.7 - (x - 3) / 22, x, y)));
    for (let i = 0; i < 4; i++) for (let y = 18 + i * 5; y < 20 + i * 5; y++) for (let x = 4; x <= 13; x++) if ((x + y + i) % 9 === 0) set(x, y, WOOD[0]);   // cross braces
    for (let y = 6; y < 14; y++) for (let x = 0; x <= 17; x++) set(x, y, y === 6 ? WOOD[4] : y === 13 ? WOOD[0] : (x % 4 === 0 ? WOOD[1] : WOOD[3]));   // platform
    roof(set, 0, 17, 0, 6, ROOF.house);
    for (let x = 4; x <= 13; x++) set(x, 9, x % 3 === 0 ? DARK : WOOD[2]);   // arrow slits
  });
}
// Cannon: a black barrel on a wooden carriage, on a round stone platform
export function cannon() {
  return sprite(18, 20, set => {
    for (let y = 13; y < 20; y++) for (let x = 1; x <= 16; x++) if (Math.hypot((x - 8.5) / 8, (y - 16) / 4) <= 1) set(x, y, y <= 14 ? STONE[4] : (x + y) % 5 === 0 ? STONE[1] : pick(STONE, 0.6, x, y));
    for (let y = 9; y < 14; y++) for (let x = 4; x <= 13; x++) set(x, y, y === 9 ? WOOD[4] : pick(WOOD, 0.6, x, y));   // carriage
    for (let i = 0; i < 9; i++) for (let d = -2; d <= 2; d++) set(6 + i, 9 - Math.round(i * 0.7) + d, d === -2 ? STONE[2] : d === 2 ? DARK : '#3a3848');   // barrel, aimed up
    for (let d = -2; d <= 2; d++) set(15, 3 + d, DARK);
    for (const cx of [5, 12]) for (let y = 10; y < 15; y++) for (let x = cx - 2; x <= cx + 2; x++) if (Math.hypot(x - cx, y - 12.5) <= 2.3) set(x, y, Math.hypot(x - cx, y - 12.5) < 1 ? WOOD[4] : WOOD[0]);   // wheels
  });
}
// Mortar: a squat stone pot with a dark mouth and iron bands
export function mortar() {
  return sprite(18, 18, set => {
    for (let y = 4; y < 18; y++) { const half = 5 + Math.round((y - 4) * 0.3); for (let x = 9 - half; x <= 8 + half; x++) set(x, y, y >= 15 ? STONE[1] : y % 5 === 0 ? '#3a3848' : pick(STONE, 0.7 - (x - 3) / 30, x, y)); }
    for (let x = 4; x <= 13; x++) { set(x, 3, STONE[4]); set(x, 4, STONE[4]); }
    for (let x = 5; x <= 12; x++) set(x, 5, DARK);                                         // the mouth
    for (let x = 6; x <= 11; x++) set(x, 4, '#1d1b2f');
  });
}
// Spark Spire: a tall stone needle with a glowing crystal on top
export function spire() {
  return sprite(14, 36, set => {
    for (let y = 12; y < 36; y++) { const half = 2 + Math.round((y - 12) / 8); for (let x = 7 - half; x <= 6 + half; x++) set(x, y, x === 7 - half || y % 7 === 0 ? STONE[1] : pick(STONE, 0.75 - (x - 2) / 16, x, y)); }
    for (let y = 31; y < 36; y++) for (let x = 1; x <= 12; x++) set(x, y, y === 31 ? STONE[4] : STONE[2]);   // base
    for (let y = 0; y < 12; y++) { const half = y < 6 ? Math.ceil(y / 2) : Math.ceil((12 - y) / 2); for (let x = 7 - half; x <= 6 + half; x++) set(x, y, x < 7 ? '#c9a6ff' : y < 4 ? '#ffffff' : '#8a5cff'); }   // crystal
    for (const y of [16, 22]) { set(6, y, '#c9a6ff'); set(7, y, '#c9a6ff'); }   // glowing runes
  });
}
export function trap() {
  return sprite(14, 8, set => {
    for (let y = 4; y < 8; y++) for (let x = 0; x < 14; x++) set(x, y, y === 4 ? WOOD[3] : WOOD[1]);
    for (let x = 1; x < 14; x += 3) for (let y = 0; y < 4; y++) set(x, y, y === 0 ? '#ffffff' : STONE[3 - Math.min(2, y)]);
  });
}
export function rubble(seed = 1) {
  const r = rng(seed);
  return sprite(28, 12, set => {
    for (let i = 0; i < 26; i++) { const x = r() * 26, y = 4 + r() * 7, c = r() < 0.5 ? STONE[1 + (r() * 3 | 0)] : WOOD[(r() * 3) | 0]; set(x, y, c); set(x + 1, y, c); set(x, y - 1, c); }
    for (let i = 0; i < 6; i++) set(r() * 26, 2 + r() * 3, '#2b2340');
  });
}
const cache = new Map();
const once = (k, f) => cache.get(k) || (cache.set(k, f()), cache.get(k));
export const bsprites = {
  house: n => once('h' + !!n, () => cottage(!!n)),
  barn: () => once('barn', barn),
  camp: () => once('camp', camp),
  mill: () => once('mill', millBody),
  tower: () => once('tower', tower),
  cannon: () => once('cannon', cannon),
  mortar: () => once('mortar', mortar),
  spire: () => once('spire', spire),
  trap: () => once('trap', trap),
  wall: wallPiece,
  rubble: (s = 1) => once('r' + s, () => rubble(s)),
};
// a building's picture for menus (data URL)
const urls = {};
export const buildIcon = type => (urls[type] ||= (type === 'wall' ? wallPiece(10) : type === 'fence' ? fencePiece(10) : type === 'home' ? sprites.house(1, false) : type === 'well' ? sprites.well() : bsprites[type]()).cv.toDataURL());

// ---------- decorations ----------
function flowerBed() {
  return sprite(16, 10, set => {
    for (let y = 5; y < 10; y++) for (let x = 0; x < 16; x++) set(x, y, y === 5 ? WOOD[3] : y === 9 ? WOOD[0] : '#6b4428');
    const C = ['#ff6fae', '#ffd84a', '#c9a6ff', '#ff5a4a', '#ffffff'];
    for (let i = 0; i < 6; i++) { const x = 2 + i * 2.4, c = C[i % 5]; set(x, 3, '#3f8d38'); set(x, 4, '#3f8d38'); set(x, 1, c); set(x - 1, 2, c); set(x + 1, 2, c); set(x, 2, '#ffe27a'); }
  });
}
function lamp() {
  return sprite(8, 24, set => {
    for (let y = 8; y < 24; y++) { set(3, y, '#3b3a4a'); set(4, y, '#5b5a6e'); }
    for (let x = 1; x < 7; x++) set(x, 23, '#3b3a4a');
    for (let y = 1; y < 8; y++) for (let x = 1; x < 7; x++) set(x, y, x === 1 || x === 6 || y === 1 || y === 7 ? '#3b3a4a' : '#ffe27a');
    set(3, 0, '#3b3a4a'); set(4, 0, '#3b3a4a'); set(3, 4, '#fff8d0'); set(4, 4, '#fff8d0');
  });
}
const fenceCache = new Map();
export function fencePiece(mask) {
  if (fenceCache.has(mask)) return fenceCache.get(mask);
  const s = sprite(16, 14, set => {
    for (let y = 2; y < 14; y++) { set(7, y, WOOD[1]); set(8, y, WOOD[2]); }
    set(7, 1, WOOD[3]); set(8, 1, WOOD[3]);
    const x0 = mask & 8 ? 0 : 7, x1 = mask & 2 ? 15 : 8;
    for (let x = x0; x <= x1; x++) { set(x, 5, WOOD[3]); set(x, 6, WOOD[1]); set(x, 10, WOOD[3]); set(x, 11, WOOD[1]); }
    if (mask & 1) for (let y = 0; y < 2; y++) { set(7, y, WOOD[1]); set(8, y, WOOD[2]); }
  });
  fenceCache.set(mask, s);
  return s;
}
function bench() {
  return sprite(16, 11, set => {
    for (let x = 0; x < 16; x++) { set(x, 2, WOOD[3]); set(x, 3, WOOD[1]); set(x, 6, WOOD[3]); set(x, 7, WOOD[1]); }
    for (const x of [1, 14]) for (let y = 0; y < 11; y++) set(x, y, WOOD[0]);
  });
}
function banner() {
  return sprite(10, 26, set => {
    for (let y = 0; y < 26; y++) set(1, y, WOOD[0]);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 10; x++) { if (y > 11 && ((x - 2) % 4 === 1) === (y === 13)) continue; set(x, y, y === 2 ? '#ff8a7a' : x === 2 ? '#a8142a' : '#e0304a'); }
    set(5, 6, '#ffd84a'); set(6, 6, '#ffd84a'); set(5, 7, '#ffd84a'); set(6, 7, '#ffd84a'); set(4, 7, '#ffd84a'); set(7, 7, '#ffd84a');
  });
}
function lantern() {
  return sprite(10, 14, set => {
    for (let y = 2; y < 12; y++) for (let x = 1; x < 9; x++) { const dx = (x - 4.5) / 3.8, dy = (y - 6.5) / 5; if (dx * dx + dy * dy <= 1) set(x, y, dy < -0.3 ? '#ffd0a0' : dx > 0.3 ? '#e0603a' : '#ff8a4a'); }
    for (let x = 3; x < 7; x++) { set(x, 1, WOOD[1]); set(x, 12, WOOD[1]); }
    set(4, 6, '#fff3b0'); set(5, 6, '#fff3b0'); set(4, 7, '#fff3b0'); set(5, 13, '#ffd84a');
  });
}
function crystalStatue() {
  return sprite(14, 28, set => {
    for (let y = 22; y < 28; y++) for (let x = 1; x < 13; x++) set(x, y, y === 22 ? STONE[4] : x === 1 ? STONE[1] : STONE[2]);
    for (let y = 0; y < 22; y++) { const hw = Math.round((y < 8 ? y : 22 - y) * 0.45); for (let x = 7 - hw; x <= 6 + hw; x++) set(x, y, x < 7 ? (y % 5 === 0 ? '#e0fbff' : '#7fe8ff') : '#3fb8e0'); }
  });
}
function fountain() {
  return sprite(32, 30, set => {
    for (let y = 16; y < 30; y++) for (let x = 0; x < 32; x++) { const dx = (x - 15.5) / 16, dy = (y - 23) / 7; if (dx * dx + dy * dy > 1) continue; const rim = dx * dx + dy * dy > 0.7; set(x, y, rim ? (y < 22 ? '#ffe27a' : '#c98a00') : (x + y) % 3 ? '#5ec8ff' : '#bff0ff'); }
    for (let y = 4; y < 22; y++) for (let x = 13; x < 19; x++) set(x, y, x === 13 ? '#c98a00' : y % 6 === 0 ? '#fff3b0' : '#ffd84a');
    for (let y = 0; y < 5; y++) for (let x = 10; x < 22; x++) { const dx = (x - 15.5) / 6; if (dx * dx + ((y - 3) / 2) ** 2 <= 1) set(x, y, '#ffe27a'); }
    for (const [x, y] of [[9, 8], [22, 8], [7, 12], [24, 12]]) { set(x, y, '#bff0ff'); set(x, y + 1, '#5ec8ff'); }
  });
}
Object.assign(bsprites, {
  flowers: () => once('flowers', flowerBed), lamp: () => once('lamp', lamp), bench: () => once('bench', bench), banner: () => once('banner', banner),
  lantern: () => once('lantern', lantern), crystal: () => once('crystal', crystalStatue), fountain: () => once('fountain', fountain), fence: fencePiece,
});

// ---------- building levels: the same building, visibly better at Lv2 and Lv3 ----------
// Lv2: stone foundation + a blue pennant. Lv3: gold trim above the stone, a gold pennant and sparkles.
// Walls show it on their cap instead (blue-grey at Lv2, gold at Lv3). Works on any sprite, including the home.
const lvCache = new WeakMap();
// Looks for every level 2-10, in tiers: 2-3 stone, 4-5 iron, 6-7 gold, 8-9 crystal, 10 legendary.
// Each tier keeps what the one below had and adds more: foundation, trim, rivets, gilded roof, crystals, a crown and a glow.
const TIER = [null, null,
  { base: STONE, trim: null, flag: ['#3b82f6', '#ffffff'], cap: ['#a9bce0', '#7d93c0'] },   // 2
  { base: STONE, trim: ['#ffd84a', '#e0a82a'], flag: ['#ffd84a', '#c43c3c'], cap: ['#ffd84a', '#e0a82a'] },   // 3
  { base: ['#3a4256', '#56607a', '#6c7894', '#4a536b', '#8792ad'], trim: ['#b8c4dc', '#8792ad'], flag: ['#9aa7c4', '#33405c'], cap: ['#c3cde3', '#8792ad'], rivet: '#e8eef8' },   // 4 iron
  { base: ['#3a4256', '#56607a', '#6c7894', '#4a536b', '#8792ad'], trim: ['#e8eef8', '#b8c4dc'], flag: ['#e8eef8', '#3b82f6'], cap: ['#e8eef8', '#b8c4dc'], rivet: '#ffffff' },   // 5
  { base: ['#7a5a14', '#a87d1e', '#d9a92c', '#8f6a18', '#f0c84a'], trim: ['#fff0a0', '#ffd84a'], flag: ['#ffd84a', '#8a1c1c'], cap: ['#ffe680', '#e0a82a'], rivet: '#fff6c8', gild: 0.18 },   // 6 gold
  { base: ['#7a5a14', '#a87d1e', '#d9a92c', '#8f6a18', '#f0c84a'], trim: ['#ffffff', '#ffd84a'], flag: ['#ffffff', '#c43c3c'], cap: ['#fff6c8', '#ffd84a'], rivet: '#ffffff', gild: 0.28 },   // 7
  { base: ['#244a6e', '#2f6c9c', '#4fb3e8', '#2a5a84', '#9ce8ff'], trim: ['#c8f4ff', '#4fb3e8'], flag: ['#7fe0ff', '#1c4f8a'], cap: ['#c8f4ff', '#4fb3e8'], rivet: '#e8fbff', gild: 0.22, crystal: '#7fe0ff' },   // 8 crystal
  { base: ['#244a6e', '#2f6c9c', '#4fb3e8', '#2a5a84', '#9ce8ff'], trim: ['#ffffff', '#9ce8ff'], flag: ['#c8f4ff', '#6b3fd1'], cap: ['#ffffff', '#9ce8ff'], rivet: '#ffffff', gild: 0.3, crystal: '#c8f4ff' },   // 9
  { base: ['#3b1f5e', '#5a2f8c', '#8a4fd1', '#4a2878', '#c9a0ff'], trim: ['#ffd84a', '#ffffff'], flag: ['#ffd84a', '#6b3fd1'], cap: ['#ffd84a', '#c9a0ff'], rivet: '#fff6b0', gild: 0.35, crystal: '#ffd84a', crown: true, glow: '#ffd84a' },   // 10 legendary
];
const mix = (px, i, hex, a) => { const n = parseInt(hex.slice(1), 16); px[i] = px[i] * (1 - a) + (n >> 16) * a; px[i + 1] = px[i + 1] * (1 - a) + ((n >> 8) & 255) * a; px[i + 2] = px[i + 2] * (1 - a) + (n & 255) * a; };
export function leveled(spr, lv, type) {
  if (!spr || !(lv >= 2)) return spr;
  lv = Math.min(10, lv | 0);
  let byLv = lvCache.get(spr);
  if (!byLv) lvCache.set(spr, byLv = {});
  if (byLv[lv]) return byLv[lv];
  const T = TIER[lv], { w, h } = spr, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(spr.cv, 0, 0);
  const id = g.getImageData(0, 0, w, h), px = id.data;
  const at = (x, y) => (y * w + x) * 4;
  const solid = (x, y) => { const i = at(x, y); return px[i + 3] > 0 && px[i] + px[i + 1] + px[i + 2] > 150; };   // not empty, not the dark outline
  const put = (x, y, hex) => { const i = at(x, y), n = parseInt(hex.slice(1), 16); px[i] = n >> 16; px[i + 1] = (n >> 8) & 255; px[i + 2] = n & 255; px[i + 3] = 255; };
  if (type === 'wall') {
    for (let x = 0; x < w; x++) { let n = 0; for (let y = 0; y < h && n < 2; y++) if (solid(x, y)) put(x, y, T.cap[n++]); }
    if (T.gild) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) mix(px, at(x, y), T.base[2], T.gild);
    if (T.rivet) for (let x = 2; x < w - 1; x += 4) if (solid(x, (h / 2) | 0)) put(x, (h / 2) | 0, T.rivet);
    if (T.crystal) { const cx = (w / 2) | 0, cy = ((h / 2) | 0) + 2; for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) if (solid(cx + dx, cy + dy)) put(cx + dx, cy + dy, T.crystal); }
  } else {
    // roof and walls take on the tier's metal, foundation in its stone, a trim line, rivets along it
    if (T.gild) for (let y = 0; y < h - 5; y++) for (let x = 0; x < w; x++) if (solid(x, y)) mix(px, at(x, y), y < h * 0.45 ? T.base[4] : T.base[2], T.gild * (y < h * 0.45 ? 1.2 : 0.6));
    for (let y = h - 4; y <= h - 2; y++) for (let x = 0; x < w; x++) if (solid(x, y)) put(x, y, (x + (y % 2) * 2) % 4 === 0 ? T.base[1] : y === h - 4 ? T.base[4] : T.base[3]);
    if (T.trim) for (let x = 0; x < w; x++) if (solid(x, h - 5)) put(x, h - 5, x % 3 ? T.trim[0] : T.trim[1]);
    if (T.rivet) for (let x = 2; x < w - 1; x += 5) if (solid(x, h - 3)) put(x, h - 3, T.rivet);
    if (T.crystal) for (const [fx, fy] of [[0.3, 0.55], [0.7, 0.5], [0.5, 0.7]]) { const cx = (w * fx) | 0, cy = (h * fy) | 0; for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) if (solid(cx + dx, cy + dy)) put(cx + dx, cy + dy, T.crystal); }
  }
  // Lv10: a golden glow hugging the outline
  if (T.glow) {
    const edge = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (px[at(x, y) + 3] === 0 && (px[at(x + 1, y) + 3] || px[at(x - 1, y) + 3] || px[at(x, y + 1) + 3] || px[at(x, y - 1) + 3])) edge.push([x, y]);
    for (const [x, y] of edge) { const i = at(x, y), n = parseInt(T.glow.slice(1), 16); px[i] = n >> 16; px[i + 1] = (n >> 8) & 255; px[i + 2] = n & 255; px[i + 3] = 110; }
  }
  g.putImageData(id, 0, 0);
  if (type !== 'wall') {   // a pennant on a little pole in the top-left corner; bigger from gold up
    const tall = lv >= 6 ? 16 : 14, wide = lv >= 6 ? 11 : 9;
    g.fillStyle = DARK; g.fillRect(1, 0, 1, tall);
    g.fillStyle = T.flag[0];
    for (let y = 0; y < 7; y++) g.fillRect(2, y, wide - Math.abs(3 - y) * 2, 1);
    g.fillStyle = T.flag[1]; g.fillRect(2, 3, wide - 4, 1);
    if (lv >= 3) { g.fillStyle = lv >= 8 ? '#e8fbff' : '#fff6b0'; for (const [x, y] of [[w - 4, 2], [w - 8, 6], [w - 3, 9], ...(lv >= 8 ? [[w - 11, 3], [w - 6, 12]] : [])]) g.fillRect(x, y, 1, 1); }
    if (T.crown) {   // a little gold crown over the roof
      const cx = (w / 2) | 0;
      g.fillStyle = DARK; g.fillRect(cx - 4, 0, 9, 5);
      g.fillStyle = '#ffd84a'; g.fillRect(cx - 3, 2, 7, 2); for (const dx of [-3, 0, 3]) g.fillRect(cx + dx, 1, 1, 1);
      g.fillStyle = '#c43c3c'; g.fillRect(cx, 2, 1, 1);
    }
  }
  return (byLv[lv] = { cv, w, h });
}

// the Siege Cup boss keep: dark stone walls with battlements, a tall centre tower, glowing windows and a red banner
export function bossKeepSprite() {
  return once('bosskeep', () => sprite(46, 50, set => {
    const BS = ['#2a2433', '#3a3346', '#4a4258', '#5c536c'], EMBER = '#ff7a2e', GLOW = '#ffc53d';
    const block = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, (y - y0) % 4 === 3 || (x + ((y - y0) >> 2) * 3) % 7 === 0 ? BS[0] : pick(BS.slice(1), 0.75 - (x - x0) / (x1 - x0 + 1) * 0.5, x, y)); };
    const merlons = (x0, x1, y) => { for (let x = x0; x <= x1; x++) if ((x - x0) % 4 < 2) { set(x, y, BS[3]); set(x, y + 1, BS[2]); } };
    block(2, 43, 26, 49); merlons(2, 43, 24);                       // the great hall
    block(0, 9, 16, 49); merlons(0, 9, 14); block(36, 45, 16, 49); merlons(36, 45, 14);   // corner towers
    block(15, 30, 8, 30); merlons(15, 30, 6);                       // the centre tower
    for (let y = 0; y < 8; y++) set(22, y, BS[0]);                  // banner pole
    for (let y = 0; y < 5; y++) for (let x = 23; x < 23 + 7 - y; x++) set(x, y, y === 2 ? '#ff9a6a' : '#c43c3c');
    for (let y = 38; y <= 49; y++) for (let x = 18; x <= 27; x++) { const arch = y < 41 && Math.abs(x - 22.5) > (y - 37) * 1.6; if (!arch) set(x, y, (x + y) % 3 ? '#1a1420' : '#2b2030'); }   // gate
    for (let y = 41; y <= 49; y += 2) for (let x = 18; x <= 27; x++) set(x, y, BS[1]);   // portcullis bars
    for (const [x, y] of [[4, 22], [40, 22], [19, 14], [25, 14], [12, 32], [33, 32]]) { set(x, y, GLOW); set(x + 1, y, EMBER); set(x, y + 1, EMBER); set(x + 1, y + 1, '#c43c3c'); }   // windows
    for (let x = 2; x <= 43; x++) if ((x * 7) % 5 === 0) set(x, 48, EMBER);   // lava glow at the foot
  }));
}
