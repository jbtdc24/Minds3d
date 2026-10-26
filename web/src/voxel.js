// Turns packed 2D trait layers into a rigged voxel fighter:
// root > legL, legR, body(torso) > torso, head, armL, armR > item, emote
import * as THREE from 'three';

export const VOX = 0.025;          // world units per voxel
const GROUND = 112.5;             // ground line in cell rows (1125 px / 10)
const NECK = 78.5;                // head above this row
const HIPS = 103.5;               // legs below this row
const MID_X = 61.8;               // left/right leg split
// Arms = sleeve + hand inside these cell boxes (same template for every shirt)
const ARMS = { armL: { x0: 41, x1: 51, y0: 86, y1: 100 }, armR: { x0: 73, x1: 80, y0: 86, y1: 100 } };
const SHOULDER = { armL: { x: 47, y: 87 }, armR: { x: 76.5, y: 87 } };
const ORDER = ['Skin', 'Pants', 'Shirt', 'Neck', 'Face', 'Headwear', 'Hand', 'Emotion'];
const FRONT_ONLY = new Set(['Face', 'Neck']);   // painted on the front surface, not through the body
const RADIUS = { head: 13, torso: 9, legL: 9, legR: 9, armL: 9, armR: 9, item: 1.5, emote: 1 };
const BODY = new Set(['head', 'torso', 'legL', 'legR', 'armL', 'armR']);

let DATA = null;
export async function loadData() {
  const [layers, tokens] = await Promise.all([
    fetch('data/layers.json').then(r => r.json()),
    fetch('data/tokens.json').then(r => r.json()),
  ]);
  for (const l of Object.values(layers.layers)) {
    const bin = atob(l.d), u = new Uint16Array(l.w * l.h);
    for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    l.cells = u;
  }
  layers.colors = layers.palette.map(c => new THREE.Color().setHex(c));   // sRGB -> linear
  layers.dark = layers.colors.map(c => c.r + c.g + c.b < 0.03);
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

// Paint the token's layers onto an N x N grid: body colour, front colour and part per cell.
function compose(traits) {
  const n = DATA.n, body = new Uint16Array(n * n), front = new Uint16Array(n * n), part = new Array(n * n);
  const keys = traits.Legendary ? [['Skin', `Legendary/${traits.Legendary}`]]
    : ORDER.filter(t => traits[t]).map(t => [t, `${t}/${traits[t]}`]);
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
  // Cut the arms out of the torso: coloured cells in the arm box + their dark outline.
  const isArm = new Map();
  for (const [name, b] of Object.entries(ARMS)) {
    const inBox = (x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const k = y * n + x;
      if (part[k] !== 'torso' || DATA.dark[front[k]]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, K = Y * n + X;
        if (inBox(X, Y) && part[K] === 'torso') isArm.set(K, name);
      }
    }
  }
  return { body, front, part, isArm };
}

// Chamfer distance (in cells) from each masked cell to the nearest empty cell.
function distance(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e9 : 0;
  const pass = (y, x, dx, dy) => {
    const k = y * w + x;
    if (!d[k]) return;
    for (const [ox, oy, c] of [[dx, 0, 1], [0, dy, 1], [dx, dy, 1.41], [-dx, dy, 1.41]]) {
      const X = x + ox, Y = y + oy;
      const v = (X < 0 || Y < 0 || X >= w || Y >= h) ? 0 : d[Y * w + X];
      if (v + c < d[k]) d[k] = v + c;
    }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pass(y, x, -1, -1);
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) pass(y, x, 1, 1);
  return d;
}
const inflate = (dt, R) => { const t = Math.min(dt, R); return Math.max(1, Math.round(Math.sqrt(t * (2 * R - t)))); };

// One quad per exposed voxel face, vertex coloured. cells: {x, y, d, body, front}
function meshPart(cells, pivot, mirror) {
  const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1, w = Math.max(...xs) - x0 + 2, h = Math.max(...ys) - y0 + 2;
  const D = Math.max(...cells.map(c => c.d)) + 1;
  const grid = new Uint16Array(w * h * (2 * D + 1));
  const at = (x, y, z) => (x < 0 || y < 0 || x >= w || y >= h || z < -D || z > D) ? 0 : grid[((z + D) * h + y) * w + x];
  for (const c of cells) {
    const lx = c.x - x0, ly = c.y - y0;
    for (let z = -c.d + 1; z <= c.d - 1; z++) grid[((z + D) * h + ly) * w + lx] = z >= c.d - 2 ? c.front : c.body;
  }
  const pos = [], col = [], nor = [];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let z = -D; z <= D; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y, z);
    if (!c) continue;
    const color = DATA.colors[c];
    for (const [dx, dy, dz] of dirs) {
      if (at(x + dx, y - dy, z + dz)) continue;    // +y in world is -y in the grid
      const X = (x + x0 + 0.5 - pivot.x), Y = (pivot.y - (y + y0 + 0.5)), Z = z;
      const u = dx ? [0, 1, 0] : [1, 0, 0], v = dz ? [0, 1, 0] : [0, 0, 1];
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [
        X + 0.5 * (dx + a * u[0] + b * v[0]), Y + 0.5 * (dy + a * u[1] + b * v[1]), Z + 0.5 * (dz + a * u[2] + b * v[2])]);
      let tri = [0, 1, 2, 0, 2, 3];
      // fix winding so the face points along (dx,dy,dz)
      const e1 = cs[1].map((q, i) => q - cs[0][i]), e2 = cs[2].map((q, i) => q - cs[0][i]);
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      if (nx * dx + ny * dy + nz * dz < 0) tri = [0, 2, 1, 0, 3, 2];
      if (mirror) tri = [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]];
      const shade = dy > 0 ? 1.0 : dy < 0 ? 0.55 : dz ? 0.95 : 0.8;
      for (const i of tri) {
        const p = cs[i];
        pos.push((mirror ? -p[0] : p[0]) * VOX, p[1] * VOX, p[2] * VOX);
        nor.push(mirror ? -dx : dx, dy, dz);
        col.push(color.r * shade, color.g * shade, color.b * shade);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Build a rigged fighter. mirror=true faces left.
export function buildFighter(id, mirror = false) {
  const traits = DATA.tokens[id];
  if (!traits) throw new Error(`No token #${id}`);
  const n = DATA.n, { body, front, part, isArm } = compose(traits);

  // Depth comes from ONE distance field over the whole body, so parts join without seams.
  const bodyMask = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) if (front[k] && BODY.has(part[k])) bodyMask[k] = 1;
  const dt = distance(bodyMask, n, n);
  const darkIdx = DATA.dark.findIndex(Boolean);

  const groups = {};
  const add = (name, c) => (groups[name] ||= []).push(c);
  for (let k = 0; k < n * n; k++) {
    if (!front[k]) continue;
    const x = k % n, y = (k / n) | 0, p = part[k];
    const cell = { x, y, body: body[k] || front[k], front: front[k] };
    if (BODY.has(p)) cell.d = inflate(dt[k], RADIUS[p]);
    const arm = isArm.get(k);
    if (arm) {
      add(arm, { ...cell, d: cell.d + 1 });               // the arm wraps just outside the torso
      add('torso', { ...cell, body: darkIdx, front: darkIdx }); // dark body behind it when it swings
      continue;
    }
    add(p, cell);
  }
  // Item and emote are thin cut-outs inflated on their own.
  for (const name of ['item', 'emote']) {
    const cells = groups[name];
    if (!cells) continue;
    const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
    const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1, w = Math.max(...xs) - x0 + 2, h = Math.max(...ys) - y0 + 2;
    const m = new Uint8Array(w * h);
    for (const c of cells) m[(c.y - y0) * w + c.x - x0] = 1;
    const d = distance(m, w, h);
    for (const c of cells) c.d = inflate(d[(c.y - y0) * w + c.x - x0], RADIUS[name]);
  }

  const pivots = {
    head: { x: MID_X, y: NECK + 2 }, torso: { x: MID_X, y: HIPS },
    legL: { x: MID_X - 4, y: HIPS }, legR: { x: MID_X + 4, y: HIPS }, ...SHOULDER,
  };
  if (groups.item) {        // pivot at the fist: centre of the lowest quarter of the item
    const ys = groups.item.map(c => c.y), lo = Math.max(...ys), hi = Math.min(...ys);
    const fist = groups.item.filter(c => c.y > lo - (lo - hi) * 0.25);
    pivots.item = { x: fist.reduce((s, c) => s + c.x, 0) / fist.length, y: lo - (lo - hi) * 0.15 };
  }
  if (groups.emote) {
    const e = groups.emote;
    pivots.emote = { x: e.reduce((s, c) => s + c.x, 0) / e.length, y: e.reduce((s, c) => s + c.y, 0) / e.length };
  }

  const root = new THREE.Group();          // sits on the ground, origin between the feet
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const parts = {};
  const sx = mirror ? -1 : 1;
  const world = pv => new THREE.Vector3(sx * (pv.x - MID_X) * VOX, (GROUND - pv.y) * VOX, 0);
  for (const [name, cells] of Object.entries(groups)) {
    const mesh = new THREE.Mesh(meshPart(cells, pivots[name], mirror), material);
    mesh.castShadow = true;
    const g = new THREE.Group();
    g.add(mesh);
    g.userData.mesh = mesh;
    parts[name] = g;
  }
  const torso = new THREE.Group();
  torso.position.copy(world(pivots.torso));
  root.add(torso);
  const attach = (name, parent, parentPivot) => {
    const g = parts[name];
    if (!g) return;
    g.position.copy(world(pivots[name])).sub(parentPivot ? world(parentPivot) : new THREE.Vector3());
    parent.add(g);
  };
  attach('legL', root); attach('legR', root);
  for (const name of ['torso', 'head', 'armL', 'armR', 'emote']) attach(name, torso, pivots.torso);
  if (parts.item) {
    // the item is held in the front (right) hand and swings with that arm
    attach('item', parts.armR || torso, parts.armR ? pivots.armR : pivots.torso);
    parts.item.position.z += 3 * VOX;
  }
  parts.root = root; parts.body = torso;
  root.userData = { id, traits, parts, mirror, material, height: (GROUND - 20) * VOX };
  return root;
}

export function tokenColor(id) {
  const t = DATA.tokens[id];
  return DATA.backgrounds[t.Background] || '#334';
}
export function tokenCount() { return Object.keys(DATA.tokens).length; }
export function rarityOf(id) { return DATA.tokens[id]?.Rarity || 'Common'; }
