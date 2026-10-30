// Every island picture is drawn by code: the ground (water, foam, sand, cliffs, grass, paths, pond, dock)
// and the props (trees, weeds, bushes, rocks, house, Energy Well, crops). The island's shape comes from gen.js.
import { rng, makeNoise, fbm, bayer, pick, rgba, sprite, toCanvas } from './pixel.js';
import { gen, T, TW, TH, WW, WH } from './gen.js';
export { WW, WH };

const C = {
  deep: '#3b86d1', water: '#4fb0ec', shallow: '#86d8f7', foam: '#f2fdff',
  rock: '#7c5a44', rockM: '#6a4a38', rockD: '#4a3428', root: '#5f7a3a', crystal: '#7fe8ff', crystalL: '#e0fbff',
  sandWet: '#e3c384', sand: '#f3dc9e', sandL: '#fff0c2', sandD: '#dcbf80',
  grassD: '#4a9c38', grass: '#62bb45', grassL: '#8fd95a', lip: '#b3ec72', tuft: '#3f8a31',
  cliffL: '#c98e55', cliff: '#a86e3e', cliffD: '#7c4c2a',
  path: '#e0bd84', pathL: '#efd29e', pathD: '#c39a62',
  soil: '#8c5a36', soilL: '#a46d42', soilD: '#6a4128',
};
const R = {
  leaf: ['#2d6a2f', '#3f8d38', '#58b046', '#7fcf55', '#b3ea6e'],
  pine: ['#1f4f3a', '#2c6b47', '#3f8a52', '#5aa95e', '#8fcf73'],
  blossom: ['#b0457a', '#d9659a', '#f08bb8', '#ffb3d2', '#ffe0ee'],
  autumn: ['#9a3d1c', '#c95c22', '#ec8a2f', '#ffb347', '#ffd88a'],
  bark: ['#4a2e1c', '#6b4428', '#8b5a34', '#a87444'],
  stone: ['#5b5a6e', '#7c7b8f', '#a3a2b5', '#cfcfdc', '#f0f0f7'],
  roofR: ['#8a2b2b', '#b23a35', '#d9534a', '#f07b62'],
  roofB: ['#2a4a8a', '#3a64b2', '#4f86d9', '#7aaaf0'],
  wood: ['#7a4e2c', '#9c6a3c', '#c08a50', '#deb06e'],
  wall: ['#c9b48a', '#e2cf9f', '#f3e4ba', '#fff6d8'],
  lime: ['#6f9a00', '#a8d400', '#d4ff1f', '#f1ffa8'],
};
const FLOWERS = ['#ff6fae', '#ffffff', '#ffd84a', '#c9a6ff', '#ff5a4a', '#7fd4ff'];

// ---------- props ----------
function blobTree(seed, pal, { w = 30, h = 38, cy = 14, fruit = false } = {}) {
  const r = rng(seed), nz = makeNoise(seed), cx = w / 2 - 0.5;
  const blobs = [[cx, cy, w * 0.32]];
  for (let i = 0; i < 5; i++) { const a = r() * Math.PI * 2, d = 3 + r() * 4; blobs.push([cx + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.8, 5 + r() * 3]); }
  const canopy = (x, y) => {
    let best = -1;
    for (const [bx, by, br] of blobs) { const d = Math.hypot(x - bx, (y - by) * 1.05) / br; if (d < 1) best = Math.max(best, 1 - d); }
    return best;
  };
  return sprite(w, h, set => {
    const tx = Math.round(cx) - 2;
    for (let y = cy + 4; y < h - 1; y++) for (let x = tx; x <= tx + 4; x++) set(x, y, R.bark[x === tx ? 3 : x === tx + 4 ? 0 : x === tx + 1 ? 2 : 1]);
    for (let x = tx - 2; x <= tx + 6; x++) set(x, h - 2, R.bark[1]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const b = canopy(x, y);
      if (b < 0) continue;
      let l = 0.62 - ((x - cx) * 0.45 + (y - cy) * 0.9) / 16 + b * 0.25 + (nz(x * 0.35, y * 0.35) - 0.5) * 0.35;
      if (b < 0.1) l -= 0.25;
      set(x, y, pick(pal, l, x, y));
    }
    if (fruit) for (let i = 0; i < 6; i++) {
      const fx = Math.round(cx - 7 + r() * 14), fy = Math.round(cy - 6 + r() * 11);
      if (canopy(fx, fy) < 0.15) continue;
      set(fx, fy, '#ff8b7a'); set(fx + 1, fy, '#e8443a'); set(fx, fy + 1, '#e8443a'); set(fx + 1, fy + 1, '#b52a26');
    }
  });
}
function pineTree(seed) {
  const nz = makeNoise(seed), w = 22, h = 40, cx = 10.5;
  return sprite(w, h, set => {
    for (let y = 32; y < h - 1; y++) for (let x = 9; x <= 12; x++) set(x, y, R.bark[x === 9 ? 3 : x === 12 ? 0 : 2]);
    for (let i = 3; i >= 0; i--) {
      const yT = 1 + i * 7, yB = yT + 12, hwB = 4 + i * 2.2;
      for (let y = yT; y <= yB; y++) {
        const hw = (y - yT) / (yB - yT) * hwB + 0.5;
        for (let x = Math.ceil(cx - hw); x <= cx + hw; x++) {
          const l = 0.72 - (x - cx) / hwB * 0.35 - (y - yT) / (yB - yT) * 0.35 + (nz(x * 0.4, y * 0.4) - 0.5) * 0.3 + (y === yB ? -0.3 : 0);
          set(x, y, pick(R.pine, l, x, y));
        }
      }
    }
  });
}
function bush(seed) {
  const r = rng(seed), berries = r() < 0.4 ? (r() < 0.5 ? '#ff6fae' : '#7fd4ff') : null;
  return sprite(16, 12, set => {
    const nz = makeNoise(seed), blobs = [[8, 7, 6.5], [4 + r() * 2, 7, 4], [11 + r() * 2, 7, 4], [8, 4, 4]];
    for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
      let b = -1;
      for (const [bx, by, br] of blobs) { const d = Math.hypot(x - bx, y - by) / br; if (d < 1) b = Math.max(b, 1 - d); }
      if (b < 0) continue;
      set(x, y, pick(R.leaf, 0.6 - ((x - 8) * 0.4 + (y - 6) * 0.9) / 9 + (nz(x * 0.4, y * 0.4) - 0.5) * 0.3 + (b < 0.1 ? -0.25 : 0), x, y));
    }
    if (berries) for (let i = 0; i < 4; i++) { const x = 3 + Math.round(r() * 10), y = 3 + Math.round(r() * 6); set(x, y, berries); set(x + 1, y, '#ffffff'); }
  });
}
function rock(seed) {
  const r = rng(seed), w = 11 + Math.round(r() * 5), h = 8 + Math.round(r() * 3), moss = r() < 0.4, nz = makeNoise(seed);
  return sprite(w, h, set => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - (w - 1) / 2) / (w / 2), dy = (y - h * 0.6) / (h * 0.6);
      if (dx * dx + dy * dy * (dy < 0 ? 1 : 2.4) > 1) continue;
      let c = pick(R.stone, 0.62 - dx * 0.3 - dy * 0.35 + (nz(x * 0.5, y * 0.5) - 0.5) * 0.3, x, y);
      if (moss && dy < -0.35 && nz(x * 0.6, y * 0.6) > 0.45) c = y & 1 ? '#7fcf55' : '#58b046';
      set(x, y, c);
    }
  });
}
function house(seed, night) {
  const roof = rng(seed)() < 0.5 ? R.roofR : R.roofB, w = 46, h = 46;
  return sprite(w, h, set => {
    for (let y = 3; y < 14; y++) for (let x = 32; x <= 36; x++) set(x, y, R.stone[x === 32 ? 3 : x === 36 ? 1 : (y & 3) === 0 ? 1 : 2]);
    for (let x = 31; x <= 37; x++) { set(x, 2, R.stone[3]); set(x, 3, R.stone[2]); }
    for (let y = 22; y < 44; y++) for (let x = 5; x <= 40; x++) {
      let c = R.wall[(y - 22) % 4 === 3 ? 0 : x < 8 ? 3 : x > 37 ? 1 : 2];
      if (y >= 41) c = R.stone[(x + (y & 1) * 3) % 6 === 0 ? 1 : y === 41 ? 3 : 2];
      set(x, y, c);
    }
    for (let y = 1; y <= 23; y++) {
      const hw = 2 + (y - 1) / 22 * 21, band = (y - 1) % 4;
      for (let x = Math.ceil(22.5 - hw); x <= 22.5 + hw; x++) {
        let i = band === 3 ? 0 : x < 22.5 ? 3 : 2;
        if (band === 3 && (x + ((y / 4) | 0) * 3) % 6 === 0) i = 1;
        if (x === Math.ceil(22.5 - hw) || x === Math.floor(22.5 + hw)) i = 1;
        set(x, y, roof[i]);
      }
    }
    for (let x = 5; x <= 40; x++) { set(x, 24, R.wall[0]); set(x, 25, R.wall[1]); }
    for (let y = 30; y < 44; y++) for (let x = 19; x <= 26; x++)
      set(x, y, x === 19 || x === 26 || y === 30 ? R.wood[0] : R.wood[x === 20 ? 3 : (x - 20) % 3 === 0 ? 1 : 2]);
    set(24, 37, '#ffd84a'); set(24, 38, '#d68a00');
    const glass = night ? ['#ffc53d', '#fff3b0'] : ['#5ec8ff', '#d2f4ff'];
    for (const wx of [9, 30]) {
      for (let y = 28; y <= 34; y++) for (let x = wx; x <= wx + 6; x++) {
        const frame = x === wx || x === wx + 6 || y === 28 || y === 34 || x === wx + 3 || y === 31;
        set(x, y, frame ? R.wood[0] : glass[x - wx + y - 28 < 5 ? 1 : 0]);
      }
      for (let x = wx - 1; x <= wx + 7; x++) { set(x, 36, R.wood[1]); set(x, 35, (x - wx) % 2 ? FLOWERS[(x + wx) % 3] : '#58b046'); }
    }
  });
}
function well() {
  return sprite(24, 30, set => {
    for (let y = 0; y <= 6; y++) { const hw = 3 + y * 1.6; for (let x = Math.ceil(11.5 - hw); x <= 11.5 + hw; x++) set(x, y, R.roofB[y === 6 ? 0 : (y & 1) && x % 4 === 0 ? 1 : x < 11.5 ? 3 : 2]); }
    for (let y = 7; y <= 20; y++) { set(3, y, R.wood[3]); set(4, y, R.wood[1]); set(19, y, R.wood[3]); set(20, y, R.wood[1]); }
    for (let x = 3; x <= 20; x++) { set(x, 9, R.wood[2]); set(x, 10, R.wood[0]); }
    for (let y = 11; y <= 13; y++) set(11, y, R.wood[0]);
    for (let y = 14; y <= 16; y++) for (let x = 9; x <= 13; x++) set(x, y, y === 14 ? R.wood[3] : x === 9 ? R.wood[2] : R.wood[1]);
    for (let y = 16; y < 30; y++) for (let x = 1; x <= 22; x++) {
      const dx = (x - 11.5) / 10.5;
      if (Math.abs(dx) > 1) continue;
      const s = Math.sqrt(1 - dx * dx), top = 19.5 - s * 3.5, topB = 19.5 + s * 3.5, bot = 26 + s * 2.5;
      if (y < top || y > bot) continue;
      const ix = (x - 11.5) / 8, inner = Math.abs(ix) < 1 && Math.abs(y - 19.5) < Math.sqrt(1 - ix * ix) * 2.3;
      let c;
      if (inner) c = R.lime[y < 19 ? 3 : 2 - ((x + y) & 1)];
      else if (y <= topB) c = R.stone[y < 19.5 ? 4 : 3];
      else { const row = ((y - 20) / 3) | 0; c = (y - 20) % 3 === 2 || (x + row * 3) % 6 === 0 ? R.stone[1] : R.stone[dx < -0.4 ? 3 : dx > 0.5 ? 1 : 2]; }
      set(x, y, c);
    }
  });
}
// crops: 4 kinds, growth stages 1..3 (stage 0 = seeds in the soil)
export function crop(kind, stage) {
  const G = ['#2d6a2f', '#3f8d38', '#58b046', '#8fd65a'];
  return sprite(12, 14, set => {
    const leaf = (x, y, c = G[2]) => set(x, y, c);
    if (stage === 1) { for (let y = 10; y <= 13; y++) set(6, y, G[1]); leaf(5, 10, G[3]); leaf(4, 9, G[2]); leaf(7, 10, G[3]); leaf(8, 9, G[2]); return; }
    if (stage === 2) {
      for (let y = 6; y <= 13; y++) set(6, y, G[1]);
      for (const [y, s] of [[10, 1], [7, -1]]) { leaf(6 + s, y, G[3]); leaf(6 + 2 * s, y - 1, G[2]); leaf(6 + 3 * s, y - 1, G[1]); leaf(6 - s, y + 1, G[2]); leaf(6 - 2 * s, y, G[1]); }
      leaf(6, 5, G[3]); return;
    }
    if (kind === 'carrot') {
      for (const [dx, top] of [[-2, 3], [0, 1], [2, 4]]) for (let y = top; y <= 10; y++) { set(6 + dx + (y < 6 ? Math.sign(dx) : 0), y, G[(y & 1) + 2]); if (y < 7) set(6 + dx - 1, y, G[1]); }
      for (let y = 10; y <= 13; y++) for (let x = 4; x <= 8; x++) if (!(y === 13 && (x === 4 || x === 8))) set(x, y, x === 5 ? '#ffb347' : x === 8 ? '#c95c22' : '#ec8a2f');
    } else if (kind === 'melon') {
      for (const [x, y] of [[2, 6], [3, 5], [4, 6], [9, 5], [10, 6], [8, 6]]) { leaf(x, y, G[3]); leaf(x, y + 1, G[1]); }
      for (let y = 7; y <= 13; y++) for (let x = 1; x <= 10; x++) {
        const dx = (x - 5.5) / 5, dy = (y - 10) / 3.4; if (dx * dx + dy * dy > 1) continue;
        set(x, y, x % 3 === 0 ? '#2d6a2f' : dx + dy < -0.6 ? '#b3ea6e' : '#58b046');
      }
    } else if (kind === 'bean') {
      for (let y = 0; y <= 13; y++) set(6, y, R.wood[y & 1 ? 1 : 2]);
      for (let y = 1; y <= 12; y += 2) { leaf(5 - (y % 4 === 1 ? 1 : 0), y, G[3]); leaf(7 + (y % 4 === 3 ? 1 : 0), y + 1, G[2]); }
      for (const [x, y] of [[4, 4], [8, 7], [4, 9]]) { set(x, y, '#9be05a'); set(x, y + 1, '#9be05a'); set(x, y + 2, '#3f8d38'); }
    } else {
      for (let y = 5; y <= 13; y++) for (let x = 1; x <= 10; x++) {
        const dx = (x - 5.5) / 5, dy = (y - 9.5) / 4.5; if (dx * dx + dy * dy > 1) continue;
        set(x, y, pick(G, 0.7 - dx * 0.3 - dy * 0.4, x, y));
      }
      for (const [x, y] of [[3, 7], [7, 6], [5, 10], [9, 10]]) { set(x, y, '#ffd84a'); set(x - 1, y, '#ffc53d'); set(x + 1, y, '#ffc53d'); set(x, y - 1, '#fff3b0'); set(x, y + 1, '#d68a00'); }
    }
  });
}
export const heart = sprite(7, 6, set => {
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  rows.forEach((r, y) => [...r].forEach((c, x) => c === '#' && set(x, y, x + y < 3 ? '#ffd0e4' : '#ff4d7d')));
});


// tall wild grass that covers unworked land (and grows back)
function weeds(seed) {
  const r = rng(seed), G = ['#2f7a2c', '#3f8d38', '#58b046', '#7fcf55', '#a6e36a'];
  return sprite(16, 13, set => {
    for (let b = 0; b < 11; b++) {
      const x0 = 1 + r() * 13, hgt = 5 + r() * 7, lean = (r() - 0.5) * 0.8, shade = 1 + Math.floor(r() * 4);
      for (let y = 0; y < hgt; y++) {
        const x = x0 + lean * y;
        set(x, 12 - y, G[Math.max(0, Math.min(4, shade + (y > hgt - 3 ? 1 : 0) - (y < 2 ? 1 : 0)))]);
        if (y < hgt * 0.5) set(x + 1, 12 - y, G[Math.max(0, shade - 1)]);
      }
    }
    if (r() < 0.35) { const x = 3 + Math.round(r() * 9), y = 3 + Math.round(r() * 3), c = FLOWERS[Math.floor(r() * FLOWERS.length)]; set(x, y, c); set(x + 1, y, c); set(x, y - 1, c); }
  }, '#24502a');
}
// a few sprouts: weeds are on their way back
export const sprouts = sprite(12, 5, set => {
  for (const [x, h] of [[1, 3], [4, 4], [7, 2], [10, 3]]) for (let y = 0; y < h; y++) set(x + (y === h - 1 ? 1 : 0), 4 - y, y === h - 1 ? '#7fcf55' : '#3f8d38');
}, null);

// sprites are made once and reused (a few look-alike variants per kind)
const cache = new Map();
const once = (key, make) => cache.get(key) || (cache.set(key, make()), cache.get(key));
export const sprites = {
  tree: (kind, v) => once(`t${kind}${v}`, () => kind === 'pine' ? pineTree(911 + v * 131) : blobTree(37 + v * 977, R[kind] || R.leaf, { fruit: kind === 'leaf' && v === 1 })),
  weeds: v => once(`w${v}`, () => weeds(501 + v * 313)),
  bush: v => once(`b${v}`, () => bush(71 + v * 59)),
  rock: v => once(`r${v}`, () => rock(13 + v * 41)),
  house: (seed, night) => once(`h${seed}${night}`, () => house(seed, night)),
  well: () => once('well', well),
  crop: (kind, stage) => once(`c${kind}${stage}`, () => crop(kind, stage)),
};
export const SOIL = { base: C.soil, light: C.soilL, dark: C.soilD, wet: '#5e3a22' };

// ---------- the ground (drawn once per island) ----------
const groundCache = new Map();
export function groundFor(seed) {
  if (groundCache.has(seed)) return groundCache.get(seed);
  const w = gen(seed), r = rng(seed + 1), n1 = makeNoise(seed + 11), n2 = makeNoise(seed + 17), n3 = makeNoise(seed + 99);
  const N = WW * WH, h = new Float32Array(N), cls = new Uint8Array(N);   // 0 deep 1 water 2 shallow 3 sand 4 grass 5 pond
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const k = y * WW + x, v = w.height(x, y);
    h[k] = v;
    cls[k] = v < -0.1 ? 0 : v < 0 ? 1 : v < 0.05 ? 2 : v < 0.15 ? 3 : w.inPond(x, y) ? 5 : 4;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= WW || y >= WH) ? 0 : cls[y * WW + x];
  const px = new Uint32Array(N), fa = new Uint32Array(N), fb = new Uint32Array(N), lastLand = new Int32Array(WW).fill(-1);
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const k = y * WW + x, c = cls[k], v = h[k], d = bayer(x, y);
    if (c >= 3) lastLand[x] = y;
    let col = null;
    if (c <= 2) {
      // open sky, except right under the island: its rocky underside hangs down, deeper in the middle
      const up = lastLand[x] >= 0 && y - lastLand[x] <= 46 ? y - lastLand[x] : 0;
      const depth = 10 + fbm(n1, x / 26, 3.7, 2) * 40 * Math.min(1, (v + 0.6) * 1.4);
      if (up && up <= depth) {
        const t = up / depth, stripe = ((y + Math.round(n3(x / 9, y / 9) * 6)) % 7) < 2;
        col = up <= 2 ? C.cliffL : t > 0.82 ? C.rockD : stripe ? C.rockM : t > 0.5 ? C.rock : C.cliff;
        if (n3(x / 3, y / 3) > 0.83 && t > 0.3 && t < 0.9) col = (x + y) % 5 === 0 ? C.crystalL : C.crystal;   // glowing crystals
      } else if (up && up <= depth + 9 && x % 9 === (up * 3) % 9 && n2(x / 4, 1) > 0.55) col = C.root;      // hanging roots
    } else if (c === 3) {
      let up = 0;
      for (let j = 1; j <= 4; j++) if (at(x, y - j) >= 4) { up = j; break; }
      if (up) col = up === 1 ? C.cliffL : up <= 3 ? (x % 5 === 0 && up === 2 ? C.cliffD : C.cliff) : C.cliffD;
      else { const g = fbm(n2, x / 24, y / 24, 3) + (d - 0.5) * 0.2; col = at(x, y + 2) < 3 ? C.lip : g > 0.6 ? C.grassL : C.grass; }
    } else if (c === 5) {
      let up = 0;
      for (let j = 1; j <= 3; j++) if (at(x, y - j) !== 5) { up = j; break; }
      col = up ? (up === 1 ? C.cliffL : C.cliff) : fbm(n2, x / 10, y / 5, 2) + d * 0.2 > 0.7 ? C.shallow : C.water;
    } else {
      const below = at(x, y + 1);
      if (below < 4) col = C.lip;
      else { const g = fbm(n2, x / 24, y / 24, 3) + (n3(x / 4, y / 4) - 0.5) * 0.25 + (d - 0.5) * 0.18; col = g < 0.38 ? C.grassD : g > 0.62 ? C.grassL : C.grass; }
    }
    if (col) px[k] = rgba(col);
    // twinkles: soft glow on the crystals under the island
    if (col === C.crystal || col === C.crystalL) (x + y) % 2 ? (fa[k] = rgba(C.crystalL)) : (fb[k] = rgba('#ffffff'));
  }
  const put = (x, y, col) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < WW && y < WH) px[y * WW + x] = rgba(col); };
  // grass tufts and flowers (decoration only)
  const flowerSpots = [];
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor(r() * WW), y = Math.floor(r() * WH);
    if (at(x, y) !== 4 || at(x, y + 2) !== 4) continue;
    if (n2(x / 30, y / 30) > 0.58 && flowerSpots.length < 260) {
      const col = FLOWERS[Math.floor(n3(x / 40, y / 40) * FLOWERS.length * 1.5) % FLOWERS.length];
      put(x, y + 1, C.tuft); put(x, y, col); put(x - 1, y, col); put(x + 1, y, col); put(x, y - 1, col); put(x, y, '#ffe27a');
      flowerSpots.push({ x, y });
    } else if (i % 2) { put(x, y, C.tuft); put(x - 1, y - 1, C.tuft); put(x + 1, y - 1, C.tuft); put(x + 1, y - 2, C.grassL); }
  }
  // dirt paths on their tiles, with soft ragged edges
  const pathSet = new Set(w.path);
  const isPath = (tx, ty) => pathSet.has(ty * TW + tx);
  for (const k of w.path) {
    const tx = k % TW, ty = (k / TW) | 0;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const X = tx * T + x, Y = ty * T + y;
      if (at(X, Y) < 3 || w.bridges.has(k)) {   // a plank bridge over the open sky, with rope rails
        if (!w.bridges.has(k)) continue;
        const along = isPath(tx - 1, ty) || isPath(tx + 1, ty);
        const a = along ? x : y, b = along ? y : x;
        if (b < 3 || b > 12) continue;
        put(X, Y, b === 3 || b === 12 ? R.wood[0] : a % 4 === 0 ? R.wood[1] : b === 4 ? R.wood[3] : R.wood[2]);
        if (b === 3 || b === 12) { if (a % 8 === 1) { put(X, Y - 1, R.wood[0]); put(X, Y - 2, R.wood[0]); } }
        continue;
      }
      const wob = (n3(X / 3, Y / 3) - 0.5) * 3;
      const dL = isPath(tx - 1, ty) ? 9 : x - 2 + wob, dR = isPath(tx + 1, ty) ? 9 : T - 3 - x + wob;
      const dU = isPath(tx, ty - 1) ? 9 : y - 2 + wob, dD = isPath(tx, ty + 1) ? 9 : T - 3 - y + wob;
      const d = Math.min(dL, dR, dU, dD);
      if (d < 0) continue;
      put(X, Y, d < 1 ? C.pathD : n1(X / 2, Y / 2) + bayer(X, Y) * 0.3 > 0.95 ? C.pathL : C.path);
    }
  }
  // dock from the south shore out over the water
  const dx = w.dock.x * T + 8, sy = w.dock.shore * T - 6;
  for (let y = sy; y < sy + 40; y++) for (let x = dx - 7; x <= dx + 6; x++) {
    const edge = x === dx - 7 || x === dx + 6;
    put(x, y, edge ? R.wood[0] : (y - sy) % 4 === 3 ? R.wood[0] : x === dx - 6 ? R.wood[3] : R.wood[2]);
  }
  for (const x of [dx - 7, dx + 5]) for (let y = sy + 40; y < sy + 43; y++) { put(x, y, R.wood[0]); put(x + 1, y, R.wood[0]); }
  for (let x = dx - 8; x <= dx + 7; x++) put(x, sy + 40, '#2f6fb0');
  const waterPts = [];
  for (let i = 0; i < 9000 && waterPts.length < 300; i++) { const x = Math.floor(r() * WW), y = Math.floor(r() * WH); if (px[y * WW + x] === rgba(C.crystal)) waterPts.push({ x, y }); }
  const out = { ground: toCanvas(px, WW, WH), foamA: toCanvas(fa, WW, WH), foamB: toCanvas(fb, WW, WH), waterPts, flowerSpots };
  groundCache.set(seed, out);
  if (groundCache.size > 3) groundCache.delete(groundCache.keys().next().value);
  return out;
}
// small picture of an island for the lobby tile
export function islandThumb(seed, width = 384) {
  const gr = groundFor(seed), w = gen(seed), c = document.createElement('canvas');
  c.width = width; c.height = Math.round(width * WH / WW);
  const g = c.getContext('2d'), s = width / WW;
  g.imageSmoothingEnabled = false;
  g.drawImage(gr.ground.cv, 0, 0, c.width, c.height);
  g.scale(s, s);
  for (let k = 0; k < TW * TH; k++) {
    if (w.cover[k] !== 4) continue;
    const spr = sprites.tree(w.treeKinds[w.kind[k]], k % 3), x = (k % TW) * T + 8, y = ((k / TW) | 0) * T + 15;
    g.drawImage(spr.cv, x - (spr.w >> 1), y - spr.h);
  }
  const hs = sprites.house(seed, false);
  g.drawImage(hs.cv, w.house.x * T + 24 - (hs.w >> 1), w.house.y * T + 48 - hs.h);
  return c.toDataURL();
}

// tools the Minds hold while they work (the grip is at the bottom-left)
const toolSprite = rows => sprite(rows[0].length, rows.length, set => rows.forEach((r, y) => [...r].forEach((ch, x) => {
  const col = { w: R.wood[2], d: R.wood[0], s: R.stone[3], g: R.stone[1], l: R.stone[4], t: '#deb06e', b: '#9c6a3c', k: '#7fcf55', y: '#ffd84a' }[ch];
  if (col) set(x, y, col);
})));
export const toolSprites = {
  axe: toolSprite(['....gsl', '...wgsl', '...w.g.', '..w....', '.w.....', 'w......']),
  pick: toolSprite(['.gsssg.', 'g..w..g', '...w...', '..w....', '.w.....', 'w......']),
  scythe: toolSprite(['lssg...', '....sw.', '.....w.', '....w..', '...w...', '..w....', '.w.....', 'w......']),
  hoe: toolSprite(['....ssg', '....w..', '...w...', '..w....', '.w.....', 'w......']),
  pouch: toolSprite(['.d.', 'tbt', 'ttt', 'btb']),
  basket: toolSprite(['.bbbb.', 'b.ky.b', 'tbtbtb', 'btbtbt', '.tbtb.']),
};

// ---------- the sky behind the floating islands ----------
let skyGrad = null, skyH = 0;
const farRocks = Array.from({ length: 9 }, (_, i) => ({ x: (i * 0.137 + 0.05) % 1, y: 0.15 + ((i * 0.61) % 1) * 0.75, s: 0.4 + ((i * 0.37) % 1) * 0.8, v: 3 + i % 4 }));
export function drawSky(g, W, H, t) {
  if (!skyGrad || skyH !== H) { skyGrad = g.createLinearGradient(0, 0, 0, H); skyGrad.addColorStop(0, '#6fc7ff'); skyGrad.addColorStop(0.55, '#a9e2ff'); skyGrad.addColorStop(1, '#f1d9ff'); skyH = H; }
  g.fillStyle = skyGrad; g.fillRect(0, 0, W, H);
  for (const r of farRocks) {
    const x = ((r.x * W + t * r.v) % (W + 200)) - 100, y = r.y * H + Math.sin(t * 0.4 + r.x * 9) * 4, s = r.s * 26;
    g.fillStyle = 'rgba(120,150,200,.35)'; g.beginPath(); g.ellipse(x, y, s * 1.6, s * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(110,120,170,.28)'; g.beginPath(); g.moveTo(x - s * 1.3, y); g.lineTo(x, y + s * 1.4); g.lineTo(x + s * 1.3, y); g.fill();
    g.fillStyle = 'rgba(160,220,170,.35)'; g.fillRect(x - s * 1.4, y - s * 0.5, s * 2.8, s * 0.3);
  }
}
