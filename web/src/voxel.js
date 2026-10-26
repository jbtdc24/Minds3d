// Meshes the hand-built trait models (model.js) and rigs them:
// root > legL, legR, fx, body(torso pivot at the hips) > torso, head, armL, armR > item, emote
import * as THREE from 'three';
import { buildToken, BACKGROUND } from './model.js';

export const VOX = 0.075;          // world units per voxel

let TOKENS = null;
export async function loadData() {
  TOKENS = await fetch('data/tokens.json').then(r => r.json());
  return TOKENS;
}

const colorCache = new Map();
const col = hex => {
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex));   // sRGB -> linear
  return colorCache.get(hex);
};
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SHADE = [0.86, 0.86, 1.0, 0.6, 0.95, 0.8];

// One quad per exposed voxel face, vertex coloured, with a little per-voxel tone noise.
function meshVox(v, pivot, mirror) {
  const pos = [], nor = [], cols = [];
  const sx = mirror ? -1 : 1;
  for (const { x, y, z, c } of v.m.values()) {
    const base = col(c);
    const n = 0.97 + ((Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791, 2654435761) >>> 0) % 1000) / 1000 * 0.06;
    DIRS.forEach(([dx, dy, dz], f) => {
      if (v.has(x + dx, y + dy, z + dz)) return;
      const cx = x + 0.5 + dx * 0.5, cy = y + 0.5 + dy * 0.5, cz = z + 0.5 + dz * 0.5;
      const u = dx ? [0, 1, 0] : [1, 0, 0], w = dz ? [0, 1, 0] : [0, 0, 1];
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [
        cx + 0.5 * (a * u[0] + b * w[0]), cy + 0.5 * (a * u[1] + b * w[1]), cz + 0.5 * (a * u[2] + b * w[2])]);
      const e1 = cs[1].map((q, i) => q - cs[0][i]), e2 = cs[2].map((q, i) => q - cs[0][i]);
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      let tri = nn[0] * dx + nn[1] * dy + nn[2] * dz > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      if (mirror) tri = [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]];
      const k = SHADE[f] * n;
      for (const i of tri) {
        const p = cs[i];
        pos.push(sx * (p[0] - pivot[0]) * VOX, (p[1] - pivot[1]) * VOX, (p[2] - pivot[2]) * VOX);
        nor.push(sx * dx, dy, dz);
        cols.push(base.r * k, base.g * k, base.b * k);
      }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

// Pivots in voxel space, and which group each part hangs from.
const PIVOT = {
  torso: [0, 3, 0], head: [0, 11, 0], armL: [-6.5, 10.5, 0.5], armR: [6.5, 10.5, 0.5],
  legL: [-2, 3, 0], legR: [2, 3, 0], item: [0.5, 0, 0.5], emote: [3.5, -3.5, 1], fx: [0, 0, 0],
};
const PLACE = {                 // where the part's pivot sits inside its parent (voxel space, model coords)
  legL: ['root', [-2, 3, 0]], legR: ['root', [2, 3, 0]], fx: ['root', [0, 0, 0]],
  torso: ['body', [0, 3, 0]], head: ['body', [0, 11, 0]], armL: ['body', [-6.5, 10.5, 0.5]], armR: ['body', [6.5, 10.5, 0.5]],
  emote: ['body', [13, 28, 0]], item: ['armR', [8, 5.5, 1.5]],
};

export function buildFighter(id, mirror = false) {
  const traits = TOKENS[id];
  if (!traits) throw new Error(`No token #${id}`);
  const vox = buildToken(traits);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const sx = mirror ? -1 : 1;
  const root = new THREE.Group(), body = new THREE.Group();
  body.position.set(0, 3 * VOX, 0);
  root.add(body);
  const parts = { root, body };
  for (const [name, v] of Object.entries(vox)) {
    const mesh = new THREE.Mesh(meshVox(v, PIVOT[name], mirror), material);
    mesh.castShadow = true;
    const g = new THREE.Group();
    g.add(mesh);
    g.userData.mesh = mesh;
    parts[name] = g;
  }
  for (const [name, [parent, at]] of Object.entries(PLACE)) {
    const g = parts[name];
    if (!g) continue;
    const base = parent === 'root' ? [0, 0, 0] : parent === 'body' ? [0, 3, 0] : PLACE[parent][1];
    g.position.set(sx * (at[0] - base[0]) * VOX, (at[1] - base[1]) * VOX, (at[2] - base[2]) * VOX);
    (parts[parent] || body).add(g);
  }
  if (parts.item) { parts.item.rotation.z = -0.6 * sx; parts.item.scale.setScalar(1.35); }   // held tilted out, clear of the big head
  root.userData = { id, traits, parts, mirror, material };
  return root;
}

export function tokenColor(id) { return BACKGROUND[TOKENS[id]?.Background] || '#3a3f55'; }
export function rarityOf(id) { return TOKENS[id]?.Rarity || 'Common'; }
