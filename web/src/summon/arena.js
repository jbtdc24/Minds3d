// The duel arena seen from above, drawn by code in the island's pixel style: a grass field with three dirt lanes
// running from the rival's Mind Gate (top) to yours (bottom), a line of glowing rift stones across the middle,
// hedges, trees, rocks and flowers around the edge. One small canvas, scaled up crisp.
import { rng, makeNoise, fbm, pick, rgba, toCanvas, sprite } from '../island/pixel.js';

export const AW = 150, AH = 240;                 // arena size in pixels (portrait)
export const LANE_X = [0.25, 0.5, 0.75];          // lane centres, as a share of the width
export const FIELD = { top: 0.17, bottom: 0.83 }; // where the lanes start/end (in front of the gates)

const G = ['#3f8d38', '#4fa13f', '#5cb046', '#6cc24f', '#86d65e'];
const DIRT = ['#9c6f3f', '#b98a52', '#cfa267', '#e0bd84'];
const STONE = ['#4a4858', '#6a6880', '#8f8da5', '#b9b8cc', '#e2e2ee'];
const LEAF = ['#24502a', '#2d6a2f', '#3f8d38', '#58b046', '#8fd65a'];

export function drawArena(seed = 7) {
  const r = rng(seed), n = makeNoise(seed), px = new Uint32Array(AW * AH);
  const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < AW && y < AH) px[y * AW + x] = rgba(c); };
  // grass with a soft checker, like a mowed field
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    const check = ((x >> 3) + (y >> 3)) & 1, v = fbm(n, x / 18, y / 18, 2);
    put(x, y, pick(G, 0.45 + check * 0.12 + (v - 0.5) * 0.3, x, y));
  }
  // dirt lanes with ragged edges
  const top = Math.round(AH * FIELD.top) - 6, bot = Math.round(AH * FIELD.bottom) + 6;
  for (const lx of LANE_X) {
    const cx = AW * lx;
    for (let y = top; y < bot; y++) for (let x = cx - 9; x <= cx + 9; x++) {
      const d = Math.abs(x - cx) + (n(x / 3, y / 3) - 0.5) * 3;
      if (d > 7.5) continue;
      put(x, y, d > 6.3 ? DIRT[0] : pick(DIRT, 0.55 + (n(x / 2, y / 2) - 0.5) * 0.5, x, y));
    }
  }
  // rift stones across the middle: the line between the two halves
  const my = Math.round(AH / 2);
  for (let x = 4; x < AW - 4; x += 7) {
    const onLane = LANE_X.some(l => Math.abs(x + 2 - AW * l) < 9);
    if (onLane) { for (let k = 0; k < 5; k++) put(x + k, my, '#d4ff1f'); continue; }
    for (let yy = -2; yy <= 2; yy++) for (let xx = 0; xx < 5; xx++) if (Math.abs(yy) + Math.abs(xx - 2) < 4) put(x + xx, my + yy, pick(STONE, 0.6 - yy * 0.15 - (xx - 2) * 0.08, x + xx, my + yy));
    put(x + 2, my - 1, '#d4ff1f');
  }
  // gate platforms (stone) at both ends
  for (const [y0, y1] of [[2, Math.round(AH * FIELD.top) - 2], [Math.round(AH * FIELD.bottom) + 2, AH - 3]]) {
    for (let y = y0; y < y1; y++) for (let x = 14; x < AW - 14; x++) {
      const edge = y === y0 || y === y1 - 1 || x === 14 || x === AW - 15;
      const mortar = (y - y0) % 6 === 0 || (x + ((((y - y0) / 6) | 0) % 2) * 5) % 10 === 0;   // brick-laid paving
      put(x, y, edge ? STONE[0] : mortar ? '#9a8f7a' : pick(['#c9bfa6', '#d8cfb6', '#e4dcc4'], 0.5 + (n(x / 4, y / 4) - 0.5) * 0.6, x, y));
    }
  }
  // hedges and trees along the sides, rocks and flowers sprinkled on the grass
  for (let y = 0; y < AH; y += 1) for (let x = 0; x < AW; x++) {
    const side = Math.min(x, AW - 1 - x);
    if (side < 6 + fbm(n, 3, y / 9, 2) * 6) put(x, y, pick(LEAF, 0.4 + (n(x / 3, y / 3) - 0.5) * 0.6 + (side > 6 ? 0.2 : 0), x, y));
  }
  for (let i = 0; i < 70; i++) {
    const x = 10 + r() * (AW - 20), y = AH * FIELD.top + r() * AH * (FIELD.bottom - FIELD.top);
    if (LANE_X.some(l => Math.abs(x - AW * l) < 11) || Math.abs(y - my) < 4) continue;
    if (r() < 0.35) { const c = ['#ff6fae', '#ffffff', '#ffd84a', '#c9a6ff'][(r() * 4) | 0]; put(x, y, c); put(x - 1, y, c); put(x + 1, y, c); put(x, y - 1, c); put(x, y, '#ffe27a'); }
    else if (r() < 0.25) { for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) put(x + xx, y + yy, pick(STONE, 0.7 - yy * 0.25, x + xx, y + yy)); }
    else { put(x, y, '#3f8a31'); put(x - 1, y - 1, '#3f8a31'); put(x + 1, y - 1, '#3f8a31'); }
  }
  return toCanvas(px, AW, AH);
}

// a Mind Gate: two stone pillars and a glowing crystal (lime for you, rose for the rival)
export function gateSprite(mine) {
  const glow = mine ? ['#6f9a00', '#a8d400', '#d4ff1f', '#f1ffa8'] : ['#9e2f4a', '#d9466a', '#ff7a95', '#ffd0dc'];
  return sprite(44, 30, set => {
    for (const px0 of [2, 36]) for (let y = 6; y < 30; y++) for (let x = px0; x < px0 + 6; x++) set(x, y, STONE[x === px0 ? 3 : x === px0 + 5 ? 1 : (y & 3) === 0 ? 1 : 2]);
    for (let x = 0; x < 44; x++) for (let y = 2; y < 7; y++) set(x, y, STONE[y === 2 ? 4 : y === 6 ? 1 : 3]);
    for (let y = 10; y < 26; y++) { const hw = 6 - Math.abs(y - 18) * 0.7; for (let x = Math.ceil(22 - hw); x <= 22 + hw; x++) set(x, y, glow[Math.max(0, Math.min(3, Math.round(2.4 - (x - 22) / 4 - (y - 18) / 8)))]); }
    for (let x = 12; x < 32; x++) { set(x, 27, STONE[2]); set(x, 28, STONE[1]); }
  });
}
