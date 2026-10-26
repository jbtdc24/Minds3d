// Turns packed 2D trait layers into a rigged voxel fighter (head / torso / legs / item / emote).
import * as THREE from 'three';

export const VOX = 0.025;          // world units per voxel
const GROUND = 112.5;             // ground line in cell rows (1125 px / 10)
const NECK = 78.5;                // head above this row
const HIPS = 103.5;               // legs below this row
const MID_X = 61.8;               // left/right leg split
const ORDER = ['Skin', 'Pants', 'Shirt', 'Neck', 'Face', 'Headwear', 'Hand', 'Emotion'];
const FRONT_ONLY = new Set(['Face', 'Neck']);   // painted on the front surface, not through the body
const RADIUS = { head: 13, torso: 9, legL: 4, legR: 4, item: 1.5, emote: 1 };

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
  return { body, front, part };
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

// Greedy-free face mesher: one quad per exposed voxel face, vertex coloured.
function meshPart(cells, n, R, pivot, mirror) {
  const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1, w = Math.max(...xs) - x0 + 2, h = Math.max(...ys) - y0 + 2;
  const mask = new Uint8Array(w * h);
  for (const c of cells) mask[(c.y - y0) * w + (c.x - x0)] = 1;
  const dt = distance(mask, w, h);
  const depth = new Int16Array(w * h);
  for (const c of cells) {
    const t = Math.min(dt[(c.y - y0) * w + (c.x - x0)], R);
    depth[(c.y - y0) * w + (c.x - x0)] = Math.max(1, Math.round(Math.sqrt(t * (2 * R - t))));
  }
  const D = Math.max(...depth) + 1;
  const grid = new Uint16Array(w * h * (2 * D + 1));
  const at = (x, y, z) => (x < 0 || y < 0 || x >= w || y >= h || z < -D || z > D) ? 0 : grid[((z + D) * h + y) * w + x];
  for (const c of cells) {
    const lx = c.x - x0, ly = c.y - y0, dz = depth[ly * w + lx];
    for (let z = -dz + 1; z <= dz - 1; z++) grid[((z + D) * h + ly) * w + lx] = z >= dz - 2 ? c.front : c.body;
  }
  const pos = [], col = [], nor = [];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let z = -D; z <= D; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = at(x, y, z);
    if (!c) continue;
    const color = DATA.colors[c];
    for (const [dx, dy, dz] of dirs) {
      if (at(x + dx, y - dy, z + dz)) continue;    // +y in world is -y in the grid
      // quad corners in world space (voxel centred at X, Y, Z)
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
  const n = DATA.n, { body, front, part } = compose(traits);
  const groups = {};
  for (let k = 0; k < n * n; k++) {
    if (!front[k]) continue;
    (groups[part[k]] ||= []).push({ x: k % n, y: (k / n) | 0, body: body[k] || front[k], front: front[k] });
  }
  const root = new THREE.Group();          // sits on the ground, origin between the feet
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const parts = {};
  const pivots = {
    head: { x: MID_X, y: NECK + 2 }, torso: { x: MID_X, y: HIPS },
    legL: { x: MID_X - 4, y: HIPS }, legR: { x: MID_X + 4, y: HIPS },
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
  const torso = new THREE.Group();
  root.add(torso);
  for (const [name, cells] of Object.entries(groups)) {
    const pv = pivots[name];
    const mesh = new THREE.Mesh(meshPart(cells, n, RADIUS[name], pv, mirror), material);
    mesh.castShadow = true;
    const g = new THREE.Group();
    g.add(mesh);
    g.userData.mesh = mesh;
    g.position.set((mirror ? -1 : 1) * (pv.x - MID_X) * VOX, (GROUND - pv.y) * VOX, name === 'item' ? 4 * VOX : 0);
    parts[name] = g;
    (name === 'legL' || name === 'legR' ? root : torso).add(g);
  }
  // head, item and emote ride on the torso: re-base them relative to the hip pivot
  torso.position.y = (GROUND - HIPS) * VOX;
  for (const name of ['head', 'item', 'emote']) {
    if (parts[name]) parts[name].position.y -= torso.position.y;
  }
  if (parts.torso) parts.torso.position.set(0, 0, 0);
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
