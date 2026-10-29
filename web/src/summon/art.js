// Creature sprites drawn by code (until the hand-made art arrives): each family has its own body plan made of
// shaded blobs, coloured by its element; later stages are bigger and grow extra parts. Same pixel style and
// outline as the island. creatureImg(id) gives a data URL for cards, creatureSprite(id) a canvas.
import { CARD } from './cards.js';
import { sprite, bayer } from '../island/pixel.js';

const RAMP = {
  fire: ['#7a2416', '#c43c1c', '#d9612c', '#f08c48', '#f5c27e'],
  water: ['#1f4f8a', '#2f78c4', '#4593c9', '#78bfdc', '#c2e4ec'],
  nature: ['#2d6a2f', '#3f8d38', '#579a3f', '#86ba52', '#b7d877'],
  light: ['#a8781e', '#e0b13a', '#e8c44a', '#f2dc8a', '#fbf2d2'],
  shadow: ['#221a3e', '#3e2f6e', '#5b47a0', '#8a75d1', '#bfb0f0'],
  stone: ['#3e3a4a', '#5b5a6e', '#7c7b8f', '#a3a2b5', '#cfcfdc'],
  bark: ['#4a2e1c', '#6b4428', '#8b5a34', '#a87444', '#c99a63'],
  petal: ['#9e2f66', '#d9659a', '#f08bb8', '#ffb3d2', '#ffe0ee'],
  flame: ['#c43c1c', '#ff7a1a', '#ffb02e', '#ffd84a', '#fff3b0'],
  spark: ['#2f78c4', '#5ec8ff', '#bff0ff', '#ffffff', '#ffffff'],
};
const pick = (ramp, l, x, y) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(l * (ramp.length - 1) + (bayer(x, y) - 0.5) * 0.9)))];

// shape: [cx, cy, rx, ry, ramp] in 0..1 of the sprite box; later shapes paint over earlier ones
const E = (cx, cy, rx, ry, ramp, flat) => ({ cx, cy, rx, ry, ramp, flat });
function plan(fam, st, el) {
  const B = el, s = [];
  if (fam === 'ember') {
    s.push(E(0.17, 0.42 - st * 0.03, 0.09 + st * 0.02, 0.14 + st * 0.03, 'flame'));         // tail flame
    if (st === 3) s.push(E(0.62, 0.38, 0.27, 0.25, 'flame'));                               // blazing mane
    s.push(E(0.48, 0.64, 0.3, 0.2, B), E(0.33, 0.83, 0.07, 0.08, B), E(0.62, 0.83, 0.07, 0.08, B));
    s.push(E(0.54, 0.24, 0.06, 0.1, B), E(0.73, 0.24, 0.06, 0.1, B));                        // ears
    s.push(E(0.64, 0.42, 0.2, 0.17, B), E(0.8, 0.5, 0.08, 0.06, B));                         // head + snout
    if (st >= 2) s.push(E(0.48, 0.7, 0.14, 0.07, 'flame', true));                            // glowing belly
  } else if (fam === 'magma') {
    s.push(E(0.84, 0.6, 0.11, 0.1, 'fire'), E(0.28, 0.84, 0.08, 0.07, 'fire'), E(0.68, 0.84, 0.08, 0.07, 'fire'));
    s.push(E(0.48, 0.56, 0.36, 0.26 + st * 0.02, 'stone'));                                  // shell
    s.push(E(0.4, 0.5, 0.08, 0.05, 'flame', true), E(0.6, 0.62, 0.07, 0.04, 'flame', true));
    if (st >= 2) s.push(E(0.5, 0.36, 0.06, 0.04, 'flame', true), E(0.28, 0.62, 0.05, 0.04, 'flame', true));
    if (st === 3) s.push(E(0.5, 0.22, 0.12, 0.1, 'flame'));                                  // volcano top
  } else if (fam === 'bubble') {
    s.push(E(0.17, 0.56, 0.12, 0.07, B), E(0.83, 0.56, 0.12, 0.07, B));
    if (st === 3) s.push(E(0.5, 0.2, 0.26, 0.12, B), E(0.24, 0.82, 0.14, 0.09, B), E(0.76, 0.82, 0.14, 0.09, B));
    s.push(E(0.5, 0.56, 0.32, 0.3, B), E(0.5, 0.68, 0.18, 0.12, 'spark', true));
    if (st >= 2) s.push(E(0.5, 0.25, 0.06, 0.08, 'spark'));
  } else if (fam === 'storm') {
    s.push(E(0.86, 0.78, 0.05, 0.12, B));                                                    // tail
    s.push(E(0.5, 0.55, 0.44, 0.18 + st * 0.01, B), E(0.5, 0.62, 0.24, 0.08, 'spark', true));
    if (st >= 2) s.push(E(0.18, 0.4, 0.06, 0.06, 'spark'), E(0.82, 0.4, 0.06, 0.06, 'spark'));
    if (st === 3) s.push(E(0.5, 0.3, 0.1, 0.07, 'spark'));
  } else if (fam === 'sprout') {
    if (st === 3) s.push(E(0.5, 0.3, 0.4, 0.26, 'nature'), E(0.3, 0.2, 0.16, 0.12, 'nature'), E(0.72, 0.22, 0.16, 0.12, 'nature'));
    else s.push(E(0.3, 0.3, 0.18, 0.08, 'nature'), E(0.7, 0.28, 0.18, 0.08, 'nature'));
    s.push(E(0.5, 0.66, 0.24 + st * 0.02, 0.24, st === 3 ? 'bark' : 'nature'), E(0.38, 0.88, 0.07, 0.05, 'bark'), E(0.62, 0.88, 0.07, 0.05, 'bark'));
    if (st === 2) s.push(E(0.5, 0.2, 0.08, 0.1, 'petal'));
  } else if (fam === 'bloom') {
    s.push(E(0.2, 0.55, 0.16 + st * 0.02, 0.1, 'nature'), E(0.8, 0.55, 0.16 + st * 0.02, 0.1, 'nature'));   // wings
    s.push(E(0.5, 0.78, 0.12, 0.14, 'nature'));
    const r = 0.11 + st * 0.02;
    for (let k = 0; k < 5 + (st === 3 ? 3 : 0); k++) { const a = k / (5 + (st === 3 ? 3 : 0)) * Math.PI * 2 - Math.PI / 2; s.push(E(0.5 + Math.cos(a) * 0.2, 0.42 + Math.sin(a) * 0.19, r, r, 'petal')); }
    s.push(E(0.5, 0.42, 0.17, 0.16, 'light'));
  } else if (fam === 'glow') {
    if (st === 3) s.push(E(0.5, 0.5, 0.46, 0.46, 'light', true));
    for (let k = 0; k < 4 + st; k++) { const a = k / (4 + st) * Math.PI * 2; s.push(E(0.5 + Math.cos(a) * 0.32, 0.5 + Math.sin(a) * 0.32, 0.07, 0.07, 'light')); }
    s.push(E(0.5, 0.5, 0.28, 0.28, B), E(0.42, 0.42, 0.1, 0.08, 'light', true));
  } else if (fam === 'shade') {
    s.push(E(0.2, 0.48, 0.2 + st * 0.02, 0.13, 'shadow'), E(0.8, 0.48, 0.2 + st * 0.02, 0.13, 'shadow'));
    s.push(E(0.38, 0.22, 0.06, 0.1, B), E(0.62, 0.22, 0.06, 0.1, B));
    s.push(E(0.5, 0.52, 0.22, 0.24, B));
    if (st === 3) s.push(E(0.5, 0.82, 0.16, 0.08, 'shadow'));
  }
  return s;
}
// eyes: [x, y] in 0..1 (two eyes), per family
const EYES = {
  ember: [[0.6, 0.4], [0.72, 0.4]], magma: [[0.82, 0.57], [0.9, 0.57]], bubble: [[0.4, 0.5], [0.6, 0.5]], storm: [[0.4, 0.5], [0.6, 0.5]],
  sprout: [[0.42, 0.62], [0.58, 0.62]], bloom: [[0.44, 0.4], [0.56, 0.4]], glow: [[0.42, 0.5], [0.58, 0.5]], shade: [[0.42, 0.48], [0.58, 0.48]],
};
const SIZE = [0, 24, 30, 36];
const cache = new Map();
export function creatureSprite(id, shiny = false) {
  const key = id + (shiny ? '*' : '');
  if (cache.has(key)) return cache.get(key);
  const c = CARD[id], N = SIZE[c.stage], shapes = plan(c.fam, c.stage, c.el);
  const ramp = r => RAMP[r] || RAMP[c.el];
  const out = sprite(N, N, set => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let hitShape = null, d = 0;
      for (const sh of shapes) {
        const dx = (x + 0.5) / N - sh.cx, dy = (y + 0.5) / N - sh.cy, q = (dx / sh.rx) ** 2 + (dy / sh.ry) ** 2;
        if (q <= 1) { hitShape = sh; d = { dx: dx / sh.rx, dy: dy / sh.ry, q }; }
      }
      if (!hitShape) continue;
      // round 3D shading: a sphere normal lit from the top-left, a soft rim and a bright specular spot
      let l;
      if (hitShape.flat) l = 0.78;
      else {
        const nz = Math.sqrt(Math.max(0, 1 - d.q)), dot = (-0.45 * d.dx - 0.6 * d.dy + 0.66 * nz);
        l = 0.18 + 0.72 * Math.max(0, dot) + (d.q > 0.82 ? -0.12 : 0);
        if (dot > 0.93) l = 1;
      }
      let col = pick(ramp(hitShape.ramp), l, x, y);
      if (shiny) col = shift(col);
      set(x, y, col);
    }
    // eyes with a white shine, plus a little smile on stage 1-2
    for (const [ex, ey] of EYES[c.fam]) {
      const X = Math.round(ex * N), Y = Math.round(ey * N), big = c.stage >= 2;
      const eye = c.fam === 'shade' ? '#ff4d7d' : '#1d1b2f';
      set(X, Y, eye); set(X, Y + 1, eye); if (big) { set(X + 1, Y, eye); set(X + 1, Y + 1, eye); }
      set(X, Y, '#ffffff');
      // a fierce look: amber iris and a brow slanting down toward the middle
      const inner = X < N / 2 ? 1 : -1, brow = ramp(c.el)[0];
      if (big && c.fam !== 'shade') set(X + (inner > 0 ? 1 : 0), Y + 1, '#e0a030');
      set(X - inner, Y - 2, brow); set(X, Y - 1, brow); if (big) set(X + inner, Y - 1, brow);
    }
  }, darken(RAMP[c.el][0]));
  cache.set(key, out);
  return out;
}
const darken = h => { const n = parseInt(h.slice(1), 16); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * 0.45).toString(16).padStart(2, '0')).join(''); };
// shiny: the same creature in rare, rotated colours
function shift(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return '#' + [b, r, g].map(v => v.toString(16).padStart(2, '0')).join('');
}
const urls = new Map();
// a data URL of the code-drawn sprite, for cards and lists
export function creatureImg(id, shiny = false) {
  const key = id + (shiny ? '*' : '');
  if (!urls.has(key)) urls.set(key, creatureSprite(id, shiny).cv.toDataURL());
  return urls.get(key);
}
