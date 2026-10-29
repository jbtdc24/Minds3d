// 1:1 NFT fighters in 2D: a token's layer art (6px cells) split into body parts (head, torso, arms, legs,
// hand item, emotion) so the front view is exactly the NFT, but every part can move.
import { DATA_VERSION } from './config.js';

export const VOX = 0.015;           // world units per cell (6 source px)
export const GROUND = 187.5;        // ground line (1125 px)
export const MID_X = 103;           // body centre / leg split (618 px)
const NECK = 130.8;                 // head above this row (785 px)
const HIPS = 172.5;                 // legs below this row (1035 px)
const ARMS = { armL: { x0: 68, x1: 87, y0: 143, y1: 167 }, armR: { x0: 121, x1: 134, y0: 143, y1: 167 } };
const SHOULDER = { armL: { x: 78, y: 145 }, armR: { x: 127.5, y: 145 } };
const ORDER = ['Skin', 'Pants', 'Shirt', 'Neck', 'Face', 'Headwear', 'Hand', 'Emotion'];
export const LEGEND_FX = {
  angel: { colors: ['#fff3b0', '#ffd84a', '#ffffff'], rise: 0.6, rate: 9 },
  bones: { colors: ['#8a5cff', '#c9a6ff', '#5a3fd1'], rise: 0.5, rate: 8 },
  error: { colors: ['#ff2a2a', '#ffffff', '#a99ee6'], rise: 0.25, rate: 7 },
  fire: { colors: ['#ff7a1a', '#ffd34a', '#ff3b1a'], rise: 1.6, rate: 18 },
  glitch: { colors: ['#00e5ff', '#ff2bd6', '#ffffff'], rise: 0.15, rate: 9 },
  ice: { colors: ['#ffffff', '#d6f2ff'], rise: -0.3, rate: 10, top: true },
  joker: { colors: ['#ff4d6d', '#ffd84a', '#4dd2ff', '#7cff6b'], rise: 0.6, rate: 6 },
  monkey: { colors: ['#fff3b0', '#ffe9b0'], rise: 0.2, rate: 6 },
  robot: { colors: ['#5ad1ff', '#ffffff', '#3c8bff'], rise: 0.4, rate: 10 },
  void: { colors: ['#8a5cff', '#7ff6ff', '#3b2a7a'], rise: 0.5, rate: 14 },
};

let DATA = null;
export async function loadData() {
  const [layers, tokens] = await Promise.all([fetch(`data/layers.json?v=${DATA_VERSION}`).then(r => r.json()), fetch(`data/tokens.json?v=${DATA_VERSION}`).then(r => r.json())]);
  for (const l of Object.values(layers.layers)) {
    const bin = atob(l.d), u = new Uint16Array(l.w * l.h);
    for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    l.cells = u;
  }
  layers.hex = layers.palette.map(c => '#' + c.toString(16).padStart(6, '0'));
  layers.dark = layers.palette.map(c => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255) < 60);
  DATA = { ...layers, tokens };
  return DATA;
}

function partOf(layer, x, y) {
  if (layer === 'Emotion') return 'emote';
  if (layer === 'Hand') return 'item';
  if (layer === 'Headwear' || y < NECK) return 'head';
  if (y < HIPS) return 'torso';
  return x < MID_X ? 'legL' : 'legR';
}
function compose(traits) {
  const n = DATA.n, front = new Uint16Array(n * n), part = new Array(n * n);
  const keys = traits.Legendary ? [['Skin', `Legendary/${traits.Legendary}`]] : ORDER.filter(t => traits[t]).map(t => [t, `${t}/${traits[t]}`]);
  for (const [t, key] of keys) {
    const l = DATA.layers[key];
    if (!l) continue;
    for (let j = 0; j < l.h; j++) for (let i = 0; i < l.w; i++) {
      const c = l.cells[j * l.w + i];
      if (!c) continue;
      const x = l.x + i, y = l.y + j, k = y * n + x;
      front[k] = c;
      if (!part[k] || t === 'Hand' || t === 'Emotion' || t === 'Headwear') part[k] = partOf(t, x, y);
    }
  }
  // arms are cut out of the torso so they can swing (the torso behind them is filled dark, like the outline)
  const isArm = new Map();
  for (const [name, b] of Object.entries(ARMS)) {
    const inBox = (x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const k = y * n + x;
      if (part[k] !== 'torso' || DATA.dark[front[k]]) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = x + dx, Y = y + dy, K = Y * n + X;
        if (inBox(X, Y) && part[K] === 'torso') isArm.set(K, name);
      }
    }
  }
  return { front, part, isArm };
}

// one canvas per part (+ a white copy for hit flashes); pivot = the joint it rotates around (cell units)
function sprite(cells, pivot) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of cells) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const cv = document.createElement('canvas'), wc = document.createElement('canvas');
  cv.width = wc.width = W; cv.height = wc.height = H;
  const g = cv.getContext('2d'), w = wc.getContext('2d');
  w.fillStyle = '#ffffff';
  for (const c of cells) { g.fillStyle = DATA.hex[c.front]; g.fillRect(c.x - x0, c.y - y0, 1, 1); w.fillRect(c.x - x0, c.y - y0, 1, 1); }
  return { cv, white: wc, ox: x0 - pivot.x, oy: y0 - pivot.y, w: W, h: H, pivot };
}

const cache = new Map();
export function buildRig(id) {
  if (cache.has(id)) return cache.get(id);
  const traits = DATA.tokens[id];
  if (!traits) throw new Error(`No token #${id}`);
  const n = DATA.n, { front, part, isArm } = compose(traits);
  const dark = DATA.dark.findIndex(Boolean);
  // behind a cut-out arm the body gets the shirt colour next to it (towards the middle), not a black hole
  const fill = (x, y) => {
    const step = x < MID_X ? 1 : -1;
    for (let X = x + step; X !== MID_X + step; X += step) {
      const K = y * n + X;
      if (front[K] && !isArm.has(K) && part[K] === 'torso' && !DATA.dark[front[K]]) return front[K];
    }
    return dark;
  };
  const groups = {};
  const add = (name, c) => (groups[name] ||= []).push(c);
  for (let k = 0; k < n * n; k++) {
    if (!front[k]) continue;
    const x = k % n, y = (k / n) | 0, cell = { x, y, front: front[k] };
    const arm = isArm.get(k);
    if (arm) { add(arm, cell); add('torso', { x, y, front: DATA.dark[front[k]] ? front[k] : fill(x, y) }); continue; }
    add(part[k], cell);
  }
  const pivots = {
    head: { x: MID_X, y: NECK + 2 }, torso: { x: MID_X, y: HIPS },
    legL: { x: MID_X - 8, y: HIPS }, legR: { x: MID_X + 8, y: HIPS }, ...SHOULDER,
  };
  if (groups.item) {
    const ys = groups.item.map(c => c.y), lo = Math.max(...ys), hi = Math.min(...ys);
    const fist = groups.item.filter(c => c.y > lo - (lo - hi) * 0.25);
    pivots.item = { x: fist.reduce((s, c) => s + c.x, 0) / fist.length, y: lo - (lo - hi) * 0.15 };
  }
  if (groups.emote) {
    const e = groups.emote;
    pivots.emote = { x: e.reduce((s, c) => s + c.x, 0) / e.length, y: e.reduce((s, c) => s + c.y, 0) / e.length };
  }
  const parts = {};
  for (const [name, cells] of Object.entries(groups)) parts[name] = sprite(cells, pivots[name]);
  let top = 1e9;
  for (const c of Object.values(groups).flat()) top = Math.min(top, c.y);
  const rig = { id, traits, parts, pivots, height: (GROUND - top) * VOX, legend: traits.Legendary && LEGEND_FX[traits.Legendary] };
  cache.set(id, rig);
  return rig;
}

export function tokenColor(id) { return DATA.backgrounds?.[DATA.tokens[id]?.Background] || '#2a2f4a'; }
export function rarityOf(id) { return DATA.tokens[id]?.Rarity || 'Common'; }
export function traitsOf(id) { return DATA.tokens[id]; }
export function tokenIds() { return Object.keys(DATA.tokens).map(Number); }
