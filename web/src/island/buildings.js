// Village buildings and defences, drawn by code in the island's pixel style (same outline + dithering).
// Each sprite stands on its footprint: bottom-centre of the sprite = bottom-centre of the tiles it covers.
import { sprite, pick, rng } from './pixel.js';

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
  mill: () => once('mill', millBody),
  tower: () => once('tower', tower),
  trap: () => once('trap', trap),
  wall: wallPiece,
  rubble: (s = 1) => once('r' + s, () => rubble(s)),
};
// a building's picture for menus (data URL)
const urls = {};
export const buildIcon = type => (urls[type] ||= (type === 'wall' ? wallPiece(10) : bsprites[type]()).cv.toDataURL());
