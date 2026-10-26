// 1:1 NFT fighters: a token's layer art (6px cells) stacked and extruded into rounded slabs per body part.
// Front view = the NFT. Rig: root > legL, legR, body(hip pivot) > torso, head, armL, armR > item, emote.
import * as THREE from 'three';

export const VOX = 0.015;           // world units per cell (6 source px)
const GROUND = 187.5;               // ground line (1125 px)
const NECK = 130.8;                 // head above this row (785 px)
const HIPS = 172.5;                 // legs below this row (1035 px)
const MID_X = 103;                  // leg split (618 px)
const ARMS = { armL: { x0: 68, x1: 87, y0: 143, y1: 167 }, armR: { x0: 121, x1: 134, y0: 143, y1: 167 } };
const SHOULDER = { armL: { x: 78, y: 145 }, armR: { x: 127.5, y: 145 } };
const ORDER = ['Skin', 'Pants', 'Shirt', 'Neck', 'Face', 'Headwear', 'Hand', 'Emotion'];
const FRONT_ONLY = new Set(['Face', 'Neck']);
// half-depth and bevel width (cells) per part
const SHAPE = { head: [34, 16], torso: [21, 10], legL: [13, 6], legR: [13, 6], armL: [14, 6], armR: [14, 6], item: [3, 2], emote: [3, 2] };
const BODY = new Set(['head', 'torso', 'legL', 'legR', 'armL', 'armR']);
// hair (back of head) colour per skin trait
const HAIR = { Emerald: 0x62b46d, Gold: 0xf2cf5b, Lime: 0xb6cb67, Mint: 0x84c4a2, Monochrome: 0xd7d7d7, Peach: 0xfab598, Periwinkle: 0x9ca9d6, Rose: 0xf69aa2, Sky: 0x78b2e1 };
const FACECOL = { Emerald: 0xc4e2bf, Gold: 0xffebba, Lime: 0xe6efbf, Mint: 0xcbe7d6, Monochrome: 0xffffff, Peach: 0xfde0d2, Periwinkle: 0xd5d9ee, Rose: 0xfcd6d7, Sky: 0xc9ddf2 };
// Legendary extras: particle aura + rarity glow colour
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
  const [layers, tokens] = await Promise.all([fetch('data/layers.json').then(r => r.json()), fetch('data/tokens.json').then(r => r.json())]);
  for (const l of Object.values(layers.layers)) {
    const bin = atob(l.d), u = new Uint16Array(l.w * l.h);
    for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    l.cells = u;
  }
  layers.colors = layers.palette.map(c => new THREE.Color().setHex(c));
  layers.dark = layers.palette.map(c => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255) < 60);
  DATA = { ...layers, tokens };
  return DATA;
}
function colorIndex(hex) {
  let i = DATA.palette.indexOf(hex);
  if (i < 1) { i = DATA.palette.push(hex) - 1; DATA.colors.push(new THREE.Color().setHex(hex)); DATA.dark.push(false); }
  return i;
}

function partOf(layer, x, y) {
  if (layer === 'Emotion') return 'emote';
  if (layer === 'Hand') return 'item';
  if (layer === 'Headwear' || y < NECK) return 'head';
  if (y < HIPS) return 'torso';
  return x < MID_X ? 'legL' : 'legR';
}

function compose(traits) {
  const n = DATA.n, body = new Uint16Array(n * n), front = new Uint16Array(n * n), part = new Array(n * n);
  const keys = traits.Legendary ? [['Skin', `Legendary/${traits.Legendary}`]] : ORDER.filter(t => traits[t]).map(t => [t, `${t}/${traits[t]}`]);
  for (const [t, key] of keys) {
    const l = DATA.layers[key];
    if (!l) continue;
    for (let j = 0; j < l.h; j++) for (let i = 0; i < l.w; i++) {
      const c = l.cells[j * l.w + i];
      if (!c) continue;
      const x = l.x + i, y = l.y + j, k = y * n + x;
      front[k] = c;
      if (!FRONT_ONLY.has(t) || !body[k]) body[k] = c;
      if (!part[k] || t === 'Hand' || t === 'Emotion' || t === 'Headwear') part[k] = partOf(t, x, y);
    }
  }
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
  return { body, front, part, isArm };
}

function distance(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e9 : 0;
  const pass = (y, x, dx, dy) => {
    const k = y * w + x;
    if (!d[k]) return;
    for (const [ox, oy, c] of [[dx, 0, 1], [0, dy, 1], [dx, dy, 1.41], [-dx, dy, 1.41]]) {
      const X = x + ox, Y = y + oy, v = (X < 0 || Y < 0 || X >= w || Y >= h) ? 0 : d[Y * w + X];
      if (v + c < d[k]) d[k] = v + c;
    }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pass(y, x, -1, -1);
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) pass(y, x, 1, 1);
  return d;
}
// rounded slab: full depth inside, quarter-circle bevel within B cells of the silhouette
const slab = (dt, H, B) => { const t = Math.min(dt, B) / B; return Math.max(1, Math.round(H * Math.sqrt(1 - (1 - t) ** 2))); };

// Greedy mesher over a dense grid of colour indices. cells: {x, y, d, front, body, back}
function meshPart(cells, pivot, mirror) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, D = 1;
  for (const c of cells) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); D = Math.max(D, c.d); }
  const W = x1 - x0 + 1, H = y1 - y0 + 1, Z = 2 * D;
  const g = new Uint16Array(W * H * Z), at = (i, j, k) => g[(k * H + j) * W + i];
  for (const c of cells) {
    const i = c.x - x0, j = c.y - y0;
    for (let k = D - c.d; k < D + c.d; k++) g[(k * H + j) * W + i] = k >= D + c.d - 2 ? c.front : k < D - c.d * 0.35 && c.back ? c.back : c.body;
  }
  const dims = [W, H, Z], pos = [], nor = [], col = [], sx = mirror ? -1 : 1;
  const world = (i, j, k) => [sx * (x0 + i - pivot.x) * VOX, (pivot.y - (y0 + j)) * VOX, (k - D) * VOX];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3, x = [0, 0, 0], q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);
    for (x[d] = -1; x[d] < dims[d];) {
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
        const a = x[d] >= 0 ? at(x[0], x[1], x[2]) : 0, b = x[d] < dims[d] - 1 ? at(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;
        mask[n] = (a && !b) ? a : (!a && b) ? -b : 0;
      }
      x[d]++;
      n = 0;
      for (let j = 0; j < dims[v]; j++) for (let i = 0; i < dims[u];) {
        const c = mask[n];
        if (!c) { i++; n++; continue; }
        let w = 1; while (i + w < dims[u] && mask[n + w] === c) w++;
        let h = 1, done = false;
        for (; j + h < dims[v]; h++) {
          for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== c) { done = true; break; }
          if (done) break;
        }
        x[u] = i; x[v] = j;
        const du = [0, 0, 0], dv = [0, 0, 0]; du[u] = w; dv[v] = h;
        const p0 = world(x[0], x[1], x[2]), p1 = world(x[0] + du[0], x[1] + du[1], x[2] + du[2]),
          p2 = world(x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]), p3 = world(x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]);
        // outward normal in world space (grid y is flipped, x flips when mirrored)
        const gn = [0, 0, 0]; gn[d] = c > 0 ? 1 : -1;
        const nw = [sx * gn[0], -gn[1], gn[2]];
        const e1 = p1.map((s, t) => s - p0[t]), e2 = p2.map((s, t) => s - p0[t]);
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const quad = cr[0] * nw[0] + cr[1] * nw[1] + cr[2] * nw[2] > 0 ? [p0, p1, p2, p0, p2, p3] : [p0, p2, p1, p0, p3, p2];
        const color = DATA.colors[Math.abs(c)];
        for (const p of quad) { pos.push(...p); nor.push(...nw); col.push(color.r, color.g, color.b); }
        for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
        i += w; n += w;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// toon ramp: 3 flat bands
const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;
export const toonRamp = ramp;

// 2D mode: one flat pixel-art sprite per body part (same rig, same pivots)
function flatPart(cells, pivot, mirror) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of cells) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  const W = x1 - x0 + 1, H = y1 - y0 + 1, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  for (const c of cells) {
    g.fillStyle = '#' + DATA.palette[c.front].toString(16).padStart(6, '0');
    g.fillRect(mirror ? W - 1 - (c.x - x0) : c.x - x0, c.y - y0, 1, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(W * VOX, H * VOX);
  geo.translate((mirror ? -1 : 1) * (x0 + W / 2 - pivot.x) * VOX, (pivot.y - (y0 + H / 2)) * VOX, 0);
  return { geo, tex };
}

const cache = new Map();
function buildGeometries(id, mirror, flat = false) {
  const key = `${id}:${mirror}:${flat}`;
  if (cache.has(key)) return cache.get(key);
  const traits = DATA.tokens[id], n = DATA.n, { body, front, part, isArm } = compose(traits);
  const bodyMask = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) if (front[k] && BODY.has(part[k])) bodyMask[k] = 1;
  const dt = distance(bodyMask, n, n);
  const dark = DATA.dark.findIndex(Boolean);
  const hair = !traits.Legendary && HAIR[traits.Skin] ? colorIndex(HAIR[traits.Skin]) : 0;
  const faceCol = !traits.Legendary && FACECOL[traits.Skin] ? colorIndex(FACECOL[traits.Skin]) : -1;
  const groups = {};
  const add = (name, c) => (groups[name] ||= []).push(c);
  for (let k = 0; k < n * n; k++) {
    if (!front[k]) continue;
    const x = k % n, y = (k / n) | 0, p = part[k];
    const cell = { x, y, front: front[k], body: body[k] || front[k] };
    if (BODY.has(p)) cell.d = slab(dt[k], ...SHAPE[p]);
    if (p === 'head' && hair && cell.body === faceCol) cell.back = hair;      // back of the head is hair
    const arm = isArm.get(k);
    if (arm) {
      add(arm, { ...cell, d: cell.d + 1 });
      add('torso', { ...cell, body: dark, front: dark });
      continue;
    }
    add(p, cell);
  }
  for (const name of ['item', 'emote']) {
    const cells = groups[name];
    if (!cells) continue;
    const m = new Uint8Array(n * n);
    for (const c of cells) m[c.y * n + c.x] = 1;
    const d = distance(m, n, n);
    for (const c of cells) c.d = slab(d[c.y * n + c.x], ...SHAPE[name]);
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
  const out = { pivots, geos: {} };
  for (const [name, cells] of Object.entries(groups)) out.geos[name] = flat ? flatPart(cells, pivots[name], mirror) : meshPart(cells, pivots[name], mirror);
  cache.set(key, out);
  return out;
}

// Fighters are drawn at this size on stage (legendaries a bit bigger)
export const FIGHTER_SCALE = 0.8;
// flat sprites stack front-to-back in this order
const FLAT_Z = { legL: -0.02, legR: -0.02, torso: 0, armL: 0.01, head: 0.02, armR: 0.03, item: 0.01, emote: 0.04 };

export function buildFighter(id, mirror = false, mode = '3d') {
  const traits = DATA.tokens[id];
  if (!traits) throw new Error(`No token #${id}`);
  const flat = mode === '2d';
  const { pivots, geos } = buildGeometries(id, mirror, flat);
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const materials = flat ? [] : [material];
  const sx = mirror ? -1 : 1;
  const world = pv => new THREE.Vector3(sx * (pv.x - MID_X) * VOX, (GROUND - pv.y) * VOX, 0);
  const parts = {};
  for (const [name, geo] of Object.entries(geos)) {
    let mesh;
    if (flat) {
      const m = new THREE.MeshToonMaterial({ map: geo.tex, alphaTest: 0.5, side: THREE.DoubleSide, gradientMap: ramp });
      materials.push(m);
      mesh = new THREE.Mesh(geo.geo, m);
      mesh.position.z = FLAT_Z[name] || 0;
      mesh.userData.depthMat = new THREE.MeshBasicMaterial({ map: geo.tex, alphaTest: 0.5, colorWrite: false, side: THREE.DoubleSide });
    } else mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = !flat;
    const g = new THREE.Group();
    g.add(mesh);
    g.userData.mesh = mesh;
    parts[name] = g;
  }
  const root = new THREE.Group(), torso = new THREE.Group();
  torso.position.copy(world(pivots.torso));
  root.add(torso);
  const attach = (name, parent, pp) => {
    const g = parts[name];
    if (!g) return;
    g.position.copy(world(pivots[name])).sub(pp ? world(pp) : new THREE.Vector3());
    parent.add(g);
  };
  attach('legL', root); attach('legR', root);
  for (const name of ['torso', 'head', 'armL', 'armR', 'emote']) attach(name, torso, pivots.torso);
  if (parts.item) { attach('item', parts.armR || torso, parts.armR ? pivots.armR : pivots.torso); if (!flat) parts.item.position.z += 4 * VOX; }
  if (parts.head && !flat) parts.head.position.z += 2 * VOX;      // head sits a touch forward of the body
  parts.root = root; parts.body = torso;
  root.scale.setScalar(FIGHTER_SCALE * (traits.Legendary ? 1.12 : 1));
  const fx = traits.Legendary && LEGEND_FX[traits.Legendary];
  root.userData = { id, traits, parts, mirror, flat, materials, aura: fx && { ...fx, spread: 0.8, at: [0, fx.top ? 2.4 : 0.8, 0], glow: true } };
  return root;
}

export function tokenColor(id) { return DATA.backgrounds[DATA.tokens[id]?.Background] || '#2a2f4a'; }
export function rarityOf(id) { return DATA.tokens[id]?.Rarity || 'Common'; }
export function traitsOf(id) { return DATA.tokens[id]; }
export function tokenIds() { return Object.keys(DATA.tokens).map(Number); }
