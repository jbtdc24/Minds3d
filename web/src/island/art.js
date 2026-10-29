// Every island picture is drawn by code: the ground (water, foam, sand, cliffs, grass, paths, a pond),
// and the props (trees, bushes, rocks, house, Energy Well, fences, crops). A seed makes each island different.
import { rng, makeNoise, fbm, bayer, pick, rgba, sprite, toCanvas } from './pixel.js';

export const WW = 480, WH = 360;   // world size in island pixels

const C = {
  deep: '#3b86d1', water: '#4fb0ec', shallow: '#86d8f7', foam: '#f2fdff',
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
const fenceH = () => sprite(14, 10, set => {
  for (let y = 0; y < 10; y++) for (let x = 0; x < 3; x++) set(x, y, R.wood[x === 0 ? 3 : x === 2 ? 0 : 2]);
  for (const ry of [3, 6]) for (let x = 3; x < 14; x++) { set(x, ry, R.wood[2]); set(x, ry + 1, R.wood[0]); }
});
const fencePost = () => sprite(3, 10, set => { for (let y = 0; y < 10; y++) for (let x = 0; x < 3; x++) set(x, y, R.wood[x === 0 ? 3 : x === 2 ? 0 : 2]); });
const fenceV = () => sprite(3, 9, set => {
  for (let y = 0; y < 9; y++) set(1, y, R.wood[1]);
  for (let y = 3; y < 9; y++) for (let x = 0; x < 3; x++) set(x, y, R.wood[x === 0 ? 3 : x === 2 ? 0 : 2]);
});
// crops: 4 kinds, growth stages 1..3 (stage 0 = seeds in the soil)
export const CROPS = ['bean', 'carrot', 'melon', 'star'];
function crop(kind, stage) {
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

// ---------- the island ----------
export function generateWorld(seed) {
  const r = rng(seed), n1 = makeNoise(seed), n2 = makeNoise(seed + 17), n3 = makeNoise(seed + 99);
  const cx = WW / 2, cy = WH / 2 + 4, rx = 192, ry = 134;
  const pond = { x: cx + 70 + (r() - 0.5) * 30, y: cy + 52 + (r() - 0.5) * 16, r: 15 + r() * 4 };
  const N = WW * WH, h = new Float32Array(N), cls = new Uint8Array(N);   // 0 deep 1 water 2 shallow 3 sand 4 grass 5 pond
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry, k = y * WW + x;
    let v = 1 - Math.hypot(nx, ny) + (fbm(n1, x / 48, y / 48) - 0.5) * 0.55;
    h[k] = v;
    cls[k] = v < -0.1 ? 0 : v < 0 ? 1 : v < 0.05 ? 2 : v < 0.13 ? 3 : 4;
    if (cls[k] === 4 && Math.hypot(x - pond.x, (y - pond.y) * 1.3) < pond.r) cls[k] = 5;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= WW || y >= WH) ? 0 : cls[y * WW + x];

  // layout: house, farm, Energy Well, dock; everything else avoids these spots
  const house0 = { x: Math.round(cx - 52 + (r() - 0.5) * 16), y: Math.round(cy - 18 + (r() - 0.5) * 10) };
  const farm = { x: Math.round(cx + 6), y: Math.round(cy - 50), cols: 3, rows: 2, pw: 18, ph: 13, gap: 4 };
  farm.w = farm.cols * farm.pw + (farm.cols - 1) * farm.gap; farm.h = farm.rows * farm.ph + (farm.rows - 1) * farm.gap;
  const wellAt = { x: Math.round(cx - 18), y: Math.round(cy + 40) };
  let shoreY = cy + 40, dockX = Math.round(cx - 6);
  while (shoreY < WH - 1 && at(dockX, shoreY) >= 3) shoreY++;
  const gate = { x: farm.x + farm.w / 2, y: farm.y + farm.h + 8 };
  const door = { x: house0.x, y: house0.y + 2 };
  const pathPts = [[door.x, door.y], [door.x + 4, door.y + 22], [wellAt.x + 14, wellAt.y + 4], [dockX, shoreY - 6]];
  const pathPts2 = [[door.x + 4, door.y + 22], [gate.x - 20, gate.y + 14], [gate.x, gate.y]];
  const reserved = [
    { x: house0.x, y: house0.y - 6, r: 42 }, { x: wellAt.x, y: wellAt.y - 8, r: 18 },
    { x: farm.x + farm.w / 2, y: farm.y + farm.h / 2, r: Math.max(farm.w, farm.h) / 2 + 16 },
    { x: pond.x, y: pond.y, r: pond.r * 1.7 }, { x: dockX, y: shoreY, r: 14 },
  ];
  const segs = [];
  for (const pts of [pathPts, pathPts2]) for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
  const nearPath = (x, y, d) => segs.some(([a, b]) => {
    const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t) < d;
  });
  const free = (x, y, pad = 0) => !reserved.some(z => Math.hypot(x - z.x, y - z.y) < z.r + pad) && !nearPath(x, y, 7 + pad);

  // paint the ground pixel by pixel
  const px = new Uint32Array(N), fa = new Uint32Array(N), fb = new Uint32Array(N);
  const foam = rgba(C.foam);
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const k = y * WW + x, c = cls[k], v = h[k], d = bayer(x, y);
    let col;
    if (c === 0) col = fbm(n2, x / 22, y / 9, 2) + d * 0.25 > 0.68 ? C.water : C.deep;
    else if (c === 1) col = fbm(n2, x / 18, y / 8, 2) + d * 0.2 > 0.72 ? C.shallow : C.water;
    else if (c === 2) col = n3(x / 5, y / 3) + d * 0.3 > 1.05 ? C.foam : C.shallow;
    else if (c === 3) {
      let up = 0;
      for (let j = 1; j <= 4; j++) if (at(x, y - j) === 4 || at(x, y - j) === 5) { up = j; break; }
      if (up) col = up === 1 ? C.cliffL : up <= 3 ? (x % 5 === 0 && up === 2 ? C.cliffD : C.cliff) : C.cliffD;
      else if (v < 0.07) col = C.sandWet;
      else { const s = n3(x / 6, y / 6) + d * 0.3; col = s > 0.92 ? C.sandL : s < 0.42 ? C.sandD : C.sand; }
    } else if (c === 5) {
      let up = 0;
      for (let j = 1; j <= 3; j++) if (at(x, y - j) !== 5) { up = j; break; }
      col = up ? (up === 1 ? C.cliffL : C.cliff) : fbm(n2, x / 10, y / 5, 2) + d * 0.2 > 0.7 ? C.shallow : C.water;
    } else {
      const below = at(x, y + 1);
      if (below !== 4 && below !== 5) col = C.lip;
      else { const g = fbm(n2, x / 24, y / 24, 3) + (n3(x / 4, y / 4) - 0.5) * 0.25 + (d - 0.5) * 0.18; col = g < 0.38 ? C.grassD : g > 0.62 ? C.grassL : C.grass; }
    }
    px[k] = rgba(col);
    if (c === 2 && v > 0.03) fa[k] = foam;
    if (c === 1 && v > -0.025) fb[k] = foam;
  }
  const put = (x, y, col) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < WW && y < WH) px[y * WW + x] = rgba(col); };

  // dirt paths
  for (const [a, b] of segs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s <= len; s += 1) {
      const qx = a[0] + (b[0] - a[0]) * s / len, qy = a[1] + (b[1] - a[1]) * s / len;
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
        const X = Math.round(qx + x), Y = Math.round(qy + y), cc = at(X, Y);
        if (cc !== 4 && cc !== 3) continue;
        const dd = Math.hypot(x, y), lim = 3.6 + (n3(X / 3, Y / 3) - 0.5) * 2;
        if (dd > lim) continue;
        put(X, Y, dd > lim - 0.9 ? C.pathD : n1(X / 2, Y / 2) + bayer(X, Y) * 0.3 > 0.95 ? C.pathL : C.path);
      }
    }
  }
  // farm soil
  const plots = [];
  for (let j = 0; j < farm.rows; j++) for (let i = 0; i < farm.cols; i++) {
    const X = farm.x + i * (farm.pw + farm.gap), Y = farm.y + j * (farm.ph + farm.gap);
    for (let y = 0; y < farm.ph; y++) for (let x = 0; x < farm.pw; x++) {
      const edge = x === 0 || y === 0 || x === farm.pw - 1 || y === farm.ph - 1;
      put(X + x, Y + y, edge ? C.soilD : y % 3 === 1 ? C.soilD : y % 3 === 0 && x > 1 ? C.soilL : C.soil);
    }
    const kind = CROPS[(i + j * farm.cols + Math.floor(r() * 4)) % 4], stage = (i + j * 2) % 4;
    if (stage === 0) for (let s = 0; s < 6; s++) put(X + 3 + s * 2.4, Y + 4 + (s % 2) * 4, '#f3dc9e');
    plots.push({ x: X, y: Y, w: farm.pw, h: farm.ph, kind, stage });
  }
  // flowers and grass tufts
  const flowerSpots = [];
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(r() * WW), y = Math.floor(r() * WH);
    if (at(x, y) !== 4 || at(x, y + 2) !== 4 || !free(x, y, -6)) continue;
    if (n2(x / 30, y / 30) > 0.55 && flowerSpots.length < 160) {
      const col = FLOWERS[Math.floor(n3(x / 40, y / 40) * FLOWERS.length * 1.5) % FLOWERS.length];
      put(x, y + 1, C.tuft); put(x, y, col); put(x - 1, y, col); put(x + 1, y, col); put(x, y - 1, col); put(x, y, '#ffe27a');
      flowerSpots.push({ x, y });
    } else if (i % 2) { put(x, y, C.tuft); put(x - 1, y - 1, C.tuft); put(x + 1, y - 1, C.tuft); put(x + 1, y - 2, C.grassL); }
  }
  // dock (over the water)
  for (let y = shoreY - 6; y < shoreY + 26; y++) for (let x = dockX - 6; x <= dockX + 6; x++) {
    const ey = y - (shoreY - 6), edge = x === dockX - 6 || x === dockX + 6;
    put(x, y, edge ? R.wood[0] : ey % 4 === 3 ? R.wood[0] : x === dockX - 5 ? R.wood[3] : R.wood[2]);
  }
  for (const x of [dockX - 6, dockX + 5]) for (let y = shoreY + 26; y < shoreY + 29; y++) { put(x, y, R.wood[0]); put(x + 1, y, R.wood[0]); }
  for (let x = dockX - 7; x <= dockX + 7; x++) put(x, shoreY + 26, '#2f6fb0');

  // props
  const props = [], obstacles = [];
  const add = (spr, x, y, kind, rad = 0, extra = {}) => {
    props.push({ spr, x: Math.round(x), y: Math.round(y), kind, ...extra });
    if (rad) obstacles.push({ x, y: y - 2, r: rad });
  };
  const homeSpr = house(seed, false), homeNight = house(seed, true);
  add(homeSpr, house0.x, house0.y, 'house', 0, { night: homeNight, chimney: { x: house0.x + 12, y: house0.y - 46 } });
  obstacles.push({ x: house0.x - 12, y: house0.y - 6, r: 13 }, { x: house0.x + 12, y: house0.y - 6, r: 13 });
  add(well(), wellAt.x, wellAt.y, 'well', 11);
  const H1 = fenceH(), P1 = fencePost(), V1 = fenceV();
  const fx0 = farm.x - 6, fx1 = farm.x + farm.w + 5, fy0 = farm.y - 4, fy1 = farm.y + farm.h + 6;
  for (let x = fx0; x < fx1; x += 14) { add(H1, x + 7, fy0, 'fence', 4); if (Math.abs(x + 7 - gate.x) > 12) add(H1, x + 7, fy1, 'fence', 4); }
  add(P1, fx1 + 1, fy0, 'fence', 3); add(P1, fx1 + 1, fy1, 'fence', 3);
  for (let y = fy0 + 8; y < fy1; y += 8) { add(V1, fx0, y, 'fence', 3); add(V1, fx1 + 1, y, 'fence', 3); }
  const CS = {};
  for (const p of plots) if (p.stage) add(CS[p.kind + p.stage] ||= crop(p.kind, p.stage), p.x + p.w / 2, p.y + p.h - 1, 'crop', 0, { plot: p });

  const spots = [];
  const tryPlace = (n, minD, make) => {
    for (let i = 0, made = 0; i < n * 30 && made < n; i++) {
      const x = 8 + r() * (WW - 16), y = 8 + r() * (WH - 16);
      if (at(Math.round(x), Math.round(y)) !== 4 || at(Math.round(x), Math.round(y) + 3) !== 4 || !free(x, y, 4)) continue;
      if (spots.some(s => Math.hypot(s.x - x, (s.y - y) * 1.3) < Math.max(s.d, minD))) continue;
      if (make(x, y) === false) continue;
      spots.push({ x, y, d: minD }); made++;
    }
  };
  const kinds = [['leaf', 5], ['pine', 3], ['blossom', 1.4], ['autumn', 1]], total = kinds.reduce((s, k) => s + k[1], 0);
  tryPlace(36, 16, (x, y) => {
    if (fbm(n1, x / 40 + 9, y / 40) < 0.42 && r() > 0.25) return false;   // trees grow in groves
    let t = r() * total, kind = 'leaf';
    for (const [k, w] of kinds) { if ((t -= w) < 0) { kind = k; break; } }
    const s = (seed + spots.length * 7919) >>> 0;
    add(kind === 'pine' ? pineTree(s) : blobTree(s, R[kind], { fruit: kind === 'leaf' && r() < 0.3 }), x, y, 'tree', 5);
  });
  tryPlace(22, 10, (x, y) => add(bush((seed + 31 * x + y) >>> 0), x, y, 'bush', 4));
  tryPlace(14, 10, (x, y) => add(rock((seed + 17 * x + 3 * y) >>> 0), x, y, 'rock', 4));

  // water spots for sparkles
  const waterPts = [];
  for (let i = 0; i < 4000 && waterPts.length < 500; i++) { const x = Math.floor(r() * WW), y = Math.floor(r() * WH); if (at(x, y) <= 1) waterPts.push({ x, y }); }

  const walk = (x, y) => at(Math.round(x), Math.round(y)) === 4 && !obstacles.some(o => Math.hypot(x - o.x, (y - o.y) * 1.4) < o.r + 3) &&
    !(x > fx0 - 2 && x < fx1 + 3 && y > fy0 - 2 && y < fy1 + 2);   // the farm is fenced in
  return {
    seed, ground: toCanvas(px, WW, WH), foamA: toCanvas(fa, WW, WH), foamB: toCanvas(fb, WW, WH),
    props, plots, waterPts, flowerSpots, walk, door, well: wellAt, center: { x: cx, y: cy },
  };
}
