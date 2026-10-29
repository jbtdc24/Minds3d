// Tiny pixel-art toolkit for the island: seeded random, smooth noise, ordered dither and a sprite
// builder that paints pixels from code and adds the dark outline every island sprite shares.
export const OUTLINE = '#2b2340';

// xorshift32: the same seed always gives the same island
export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function hashStr(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// value noise in 0..1
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

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => B4[((y & 3) << 2) | (x & 3)] / 16;
// pick a colour from a dark→light ramp with ordered dithering between steps
export function pick(ramp, l, x, y) {
  const i = Math.round(l * (ramp.length - 1) + (bayer(x, y) - 0.5) * 0.9);
  return ramp[Math.max(0, Math.min(ramp.length - 1, i))];
}

const cache = new Map();
export function rgba(hex) {
  let v = cache.get(hex);
  if (v === undefined) {
    const n = parseInt(hex.slice(1), 16);
    v = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    cache.set(hex, v);
  }
  return v;
}

// paint(set) draws into a w×h grid; the result gets a 1px outline (so it is (w+2)×(h+2))
export function sprite(w, h, paint, outline = OUTLINE) {
  const W = w + 2, H = h + 2, px = new Uint32Array(W * H);
  const set = (x, y, c) => {
    x = Math.floor(x); y = Math.floor(y);
    if (c && x >= 0 && y >= 0 && x < w && y < h) px[(y + 1) * W + x + 1] = rgba(c);
  };
  paint(set);
  if (outline) {
    const o = rgba(outline), src = px.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (src[k]) continue;
      if ((x > 0 && src[k - 1]) || (x < W - 1 && src[k + 1]) || (y > 0 && src[k - W]) || (y < H - 1 && src[k + W])) px[k] = o;
    }
  }
  return toCanvas(px, W, H);
}
export function toCanvas(px, W, H) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), id = g.createImageData(W, H);
  new Uint32Array(id.data.buffer).set(px);
  g.putImageData(id, 0, 0);
  return { cv, w: W, h: H };
}
