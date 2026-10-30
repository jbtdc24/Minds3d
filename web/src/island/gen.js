// The island's shape and what grows on it, as pure math (no canvas): the browser draws it, and the
// server uses the very same numbers to check every clear / till / plant.
// v2 (2026-10-30): a floating sky island. The main island is the original 48×36 one, now in the middle of a
// 64×48 map (offset OX, OY tiles), with small floating islets around it joined by plank bridges.
export const T = 16, TW = 64, TH = 48, WW = TW * T, WH = TH * T;   // 16px tiles, 1024×768 px
export const OW = 48, OH = 36, OX = 8, OY = 6;                     // the original island's size and where it sits now
export const oldKey = k => ((k / OW) | 0) * TW + OX + (k % OW) + OY * TW;   // a v1 tile index → v2
export const COVER = { NONE: 0, WEEDS: 1, BUSH: 2, ROCK: 3, TREE: 4, FIXED: 5 };   // FIXED = house, well, path, dock
const TREES = ['leaf', 'leaf', 'leaf', 'pine', 'pine', 'blossom', 'autumn'];

export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function hashStr(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function makeNoise(seed) {
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function fbm(n, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; }
  return s / t;
}

const cacheGen = new Map();
export function gen(seed) {
  seed >>>= 0;
  if (cacheGen.has(seed)) return cacheGen.get(seed);
  const r = rng(seed), n1 = makeNoise(seed), PX = OX * T, PY = OY * T;
  // the main island: exactly the v1 shape (computed in its old coordinates), so old saves still fit
  const cx = OW * T / 2, cy = OH * T / 2 + 6, rx = OW * T * 0.43, ry = OH * T * 0.4;
  const mainH = (x, y) => { x -= PX; y -= PY; const b = 1 - Math.hypot((x - cx) / rx, (y - cy) / ry); return b < -0.6 ? b : b + (fbm(n1, x / 70, y / 70) - 0.5) * 0.5; };
  // layout in tiles (same random numbers in the same order as v1, then shifted)
  const hc = { x: OX + Math.round(OW / 2 - 6 + (r() - 0.5) * 4), y: OY + Math.round(OH / 2 - 3 + (r() - 0.5) * 2) };   // house: 3×3 tiles, door at the bottom middle
  const well = { x: hc.x + 5, y: hc.y + 4 };                                                              // 2×2
  const pond = { x: PX + (OW / 2 + 9 + (r() - 0.5) * 4) * T, y: PY + (OH / 2 + 6 + (r() - 0.5) * 2) * T, r: 26 + r() * 6 };
  // floating islets around the main island (more room to clear, farm and build)
  const islets = [];
  const spots = [[0.07, 0.3], [0.08, 0.72], [0.93, 0.28], [0.92, 0.7], [0.5, 0.06], [0.3, 0.93], [0.72, 0.94]];
  for (let i = 0; i < spots.length; i++) {
    if (i >= 4 && r() < 0.35) continue;
    const [fx, fy] = spots[i];
    islets.push({ x: fx * WW + (r() - 0.5) * 40, y: fy * WH + (r() - 0.5) * 30, rx: 60 + r() * 34, ry: 46 + r() * 24 });
  }
  const isletH = (x, y) => {   // nearest islet only; the noise is only worked out close to an islet (it is the slow part)
    let best = -9; for (const s of islets) best = Math.max(best, 1 - Math.hypot((x - s.x) / s.rx, (y - s.y) / s.ry));
    return best < -0.4 ? best : best + (fbm(n1, x / 40 + 7, y / 40 + 7, 3) - 0.5) * 0.45;
  };
  const height = (x, y) => { const m = mainH(x, y); return m > 0.4 ? m : Math.max(m, isletH(x, y) * 0.9); };
  const inPond = (x, y) => Math.hypot(x - pond.x, (y - pond.y) * 1.3) < pond.r;
  // dock: straight down from the house to the south shore
  const dockX = hc.x + 1;
  let shore = hc.y + 4;
  while (shore < TH - 1 && height(dockX * T + 8, shore * T + 8) >= 0.15) shore++;
  const land = new Uint8Array(TW * TH), cover = new Uint8Array(TW * TH), kind = new Uint8Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    let ok = true;
    for (const [dx, dy] of [[2, 2], [13, 2], [2, 13], [13, 13], [8, 8]]) {
      const x = tx * T + dx, y = ty * T + dy;
      if (height(x, y) < 0.15 || inPond(x, y) || Math.hypot(x - pond.x, (y - pond.y) * 1.3) < pond.r + 4) { ok = false; break; }
    }
    land[ty * TW + tx] = ok ? 1 : 0;
  }
  const k = (x, y) => y * TW + x;
  const isLand = (x, y) => x >= 0 && y >= 0 && x < TW && y < TH && land[k(x, y)] === 1;
  // plank bridges from each islet to the main island (straight line, over the open sky)
  const bridges = [];
  const mcx = PX + cx, mcy = PY + cy;
  for (const s of islets) {
    const sx = Math.floor(s.x / T), sy = Math.floor(s.y / T), ex = Math.floor(mcx / T), ey = Math.floor(mcy / T);
    const n = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
    let started = false, gap = [];
    for (let i = 0; i <= n; i++) {
      const tx = Math.round(sx + (ex - sx) * i / n), ty = Math.round(sy + (ey - sy) * i / n), kk = k(tx, ty);
      if (!started) { if (!land[kk]) started = true; else continue; }
      if (land[kk]) { if (gap.length) { bridges.push(...gap); } break; }
      gap.push(kk);
    }
  }
  // fixed things
  const fixed = new Set();
  for (let y = hc.y; y < hc.y + 3; y++) for (let x = hc.x; x < hc.x + 3; x++) fixed.add(k(x, y));
  for (let y = well.y; y < well.y + 2; y++) for (let x = well.x; x < well.x + 2; x++) fixed.add(k(x, y));
  const path = [];
  for (let y = hc.y + 3; y < shore; y++) path.push(k(dockX, y));
  for (let x = dockX + 1; x < well.x; x++) path.push(k(x, well.y + 1));
  for (const b of bridges) { land[b] = 1; path.push(b); }
  path.forEach(p => fixed.add(p));
  // starter farm: 3×2 plots right of the house
  const starter = [];
  for (let y = hc.y; y < hc.y + 2; y++) for (let x = hc.x + 5; x < hc.x + 8; x++) starter.push(k(x, y));
  const forestN = makeNoise(seed + 5);
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const i = k(tx, ty);
    if (!land[i]) continue;
    if (fixed.has(i)) { cover[i] = COVER.FIXED; continue; }
    const yard = Math.hypot(tx - (hc.x + 4), (ty - (hc.y + 2)) * 1.2);
    if (yard < 6.5 || starter.includes(i)) continue;   // a little open lawn around home
    const ox = tx - OX, oy = ty - OY, h = hash(ox, oy, seed), forest = fbm(forestN, ox / 8, oy / 8, 3);   // v1 coordinates: the old island looks the same
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isLand(tx + dx, ty + dy));
    if (!edge && forest > 0.5 && h < 0.62) { cover[i] = COVER.TREE; kind[i] = Math.floor(hash(oy, ox, seed + 3) * TREES.length); }
    else if (h > 0.94) cover[i] = COVER.ROCK;
    else if (h > 0.86) cover[i] = COVER.BUSH;
    else if (yard < 8.5 ? h < 0.45 : h < 0.8) cover[i] = COVER.WEEDS;
  }
  const out = { seed, height, pond, inPond, land, cover, kind, treeKinds: TREES, house: hc, well, dock: { x: dockX, shore }, path, bridges: new Set(bridges), starter, islets, center: { x: mcx, y: mcy } };
  cacheGen.set(seed, out);
  if (cacheGen.size > 8) cacheGen.delete(cacheGen.keys().next().value);
  return out;
}
