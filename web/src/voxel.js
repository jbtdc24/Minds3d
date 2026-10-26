// Meshes the hand-built trait models (model.js) and rigs them:
// root > legL, legR, fx, body(torso pivot at the hips) > torso, head, armL, armR > item, emote
// Colours starting with '*' glow (unlit + bloom). Every face gets per-corner ambient occlusion.
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
  if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex.replace('*', '')));   // sRGB -> linear
  return colorCache.get(hex);
};
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SHADE = [0.9, 0.9, 1.0, 0.65, 0.97, 0.85];
const AO = [0.45, 0.66, 0.84, 1];
const GLOW_BOOST = 3.6;

function meshVox(v, pivot, mirror) {
  const out = [{ pos: [], nor: [], cols: [] }, { pos: [], nor: [], cols: [] }];   // lit, glow
  const sx = mirror ? -1 : 1;
  for (const { x, y, z, c } of v.m.values()) {
    const glow = c[0] === '*', base = col(c), o = out[glow ? 1 : 0];
    const n = 0.96 + ((Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791, 2654435761) >>> 0) % 1000) / 1000 * 0.08;
    DIRS.forEach(([dx, dy, dz], f) => {
      if (v.has(x + dx, y + dy, z + dz)) return;
      const u = dx ? [0, 1, 0] : [1, 0, 0], w = dz ? [0, 1, 0] : [0, 0, 1];
      const cx = x + 0.5 + dx * 0.5, cy = y + 0.5 + dy * 0.5, cz = z + 0.5 + dz * 0.5;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const cs = corners.map(([a, b]) => [cx + 0.5 * (a * u[0] + b * w[0]), cy + 0.5 * (a * u[1] + b * w[1]), cz + 0.5 * (a * u[2] + b * w[2])]);
      // ambient occlusion from the 3 voxels touching each corner in the layer in front of the face
      const ao = corners.map(([a, b]) => {
        if (glow) return 3;
        const s1 = v.has(x + dx + a * u[0], y + dy + a * u[1], z + dz + a * u[2]) ? 1 : 0;
        const s2 = v.has(x + dx + b * w[0], y + dy + b * w[1], z + dz + b * w[2]) ? 1 : 0;
        const cr = v.has(x + dx + a * u[0] + b * w[0], y + dy + a * u[1] + b * w[1], z + dz + a * u[2] + b * w[2]) ? 1 : 0;
        return s1 && s2 ? 0 : 3 - s1 - s2 - cr;
      });
      const e1 = cs[1].map((q, i) => q - cs[0][i]), e2 = cs[2].map((q, i) => q - cs[0][i]);
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      let tri = ao[0] + ao[2] < ao[1] + ao[3] ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
      if (nn[0] * dx + nn[1] * dy + nn[2] * dz < 0) tri = [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]];
      if (mirror) tri = [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]];
      for (const i of tri) {
        const p = cs[i], k = glow ? GLOW_BOOST : SHADE[f] * n * AO[ao[i]];
        o.pos.push(sx * (p[0] - pivot[0]) * VOX, (p[1] - pivot[1]) * VOX, (p[2] - pivot[2]) * VOX);
        o.nor.push(sx * dx, dy, dz);
        o.cols.push(base.r * k, base.g * k, base.b * k);
      }
    });
  }
  return out.map(o => {
    if (!o.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(o.cols, 3));
    return g;
  });
}

// Pivots in voxel space, and where each part's pivot sits (parent, voxel position in model coords).
const PIVOT = {
  torso: [0, 3, 0], head: [0, 11, 0], armL: [-7.5, 10.5, 0.5], armR: [7.5, 10.5, 0.5],
  legL: [-3, 3, 0], legR: [3, 3, 0], item: [0.5, 0, 0.5], emote: [3.5, -3.5, 1], fx: [0, 0, 0],
};
const PLACE = {
  legL: ['root', [-3, 3, 0]], legR: ['root', [3, 3, 0]], fx: ['root', [0, 0, 0]],
  torso: ['body', [0, 3, 0]], head: ['body', [0, 11, 0]], armL: ['body', [-7.5, 10.5, 0.5]], armR: ['body', [7.5, 10.5, 0.5]],
  emote: ['body', [13, 28, 0]], item: ['armR', [9.5, 5.5, 1.5]],
};
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const depth = (place, n) => (place[n][0] === 'root' || place[n][0] === 'body') ? 0 : 1 + depth(place, place[n][0]);

export function buildFighter(id, mirror = false) {
  const traits = TOKENS[id];
  if (!traits) throw new Error(`No token #${id}`);
  const { parts: vox, extra = {}, anim, aura } = buildToken(traits);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const sx = mirror ? -1 : 1;
  const root = new THREE.Group(), body = new THREE.Group();
  body.position.set(0, 3 * VOX, 0);
  root.add(body);
  const parts = { root, body };
  // extra = { name: [parent, pivotPositionInModel] } for 1-of-1 parts (wings, halo, tail...)
  const pivots = { ...PIVOT }, place = { ...PLACE };
  for (const [name, [parent, at]] of Object.entries(extra)) { place[name] = [parent, at]; pivots[name] = at; }
  for (const [name, v] of Object.entries(vox)) {
    const g = new THREE.Group();
    const [lit, glow] = meshVox(v, pivots[name] || [0, 0, 0], mirror);
    if (lit) { const m = new THREE.Mesh(lit, material); m.castShadow = true; m.receiveShadow = true; g.add(m); g.userData.mesh = m; }
    if (glow) g.add(new THREE.Mesh(glow, glowMat));
    parts[name] = g;
  }
  for (const name of Object.keys(place).sort((a, b) => depth(place, a) - depth(place, b))) {
    const g = parts[name], [parent, at] = place[name];
    if (!g) continue;
    const base = parent === 'root' ? [0, 0, 0] : parent === 'body' ? [0, 3, 0] : place[parent][1];
    g.position.set(sx * (at[0] - base[0]) * VOX, (at[1] - base[1]) * VOX, (at[2] - base[2]) * VOX);
    (parts[parent] || body).add(g);
  }
  if (parts.item) { parts.item.rotation.z = -0.6 * sx; parts.item.scale.setScalar(1.35); }   // held tilted out, clear of the big head
  if (traits.Legendary) root.scale.setScalar(1.15);            // legendaries stand a bit taller
  root.userData = { id, traits, parts, mirror, material, anim, aura };
  return root;
}

export function tokenColor(id) { return BACKGROUND[TOKENS[id]?.Background] || '#2a2f4a'; }
export function rarityOf(id) { return TOKENS[id]?.Rarity || 'Common'; }
