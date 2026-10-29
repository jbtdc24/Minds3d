// Island-size Minds: each NFT's own art shrunk into a crisp little pixel sprite (every 5×5 block of
// cells becomes one pixel, using the block's main colour), outlined like the rest of the island.
// It comes back in pieces (body + two legs) so the Mind can walk, and a hand point for holding tools.
import { buildRig, GROUND, MID_X } from '../nft2d.js';
import { rgba, toCanvas, OUTLINE } from './pixel.js';

const F = 5;          // cells per island pixel
const HIPS = 172.5;   // legs start below this cell row (same split as the fighter rig)
const cache = new Map();

export function chibi(id) {
  if (cache.has(id)) return cache.get(id);
  const rig = buildRig(id), n = 200;
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  for (const name of ['legL', 'legR', 'torso', 'armL', 'armR', 'item', 'head', 'emote']) {
    const p = rig.parts[name];
    if (p) g.drawImage(p.cv, p.pivot.x + p.ox, p.pivot.y + p.oy);   // back to the NFT's front view
  }
  const d = g.getImageData(0, 0, n, n).data;
  let x0 = n, x1 = -1, y0 = n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[(y * n + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
  const bottom = Math.ceil(GROUND);
  // align the grid on the body centre so both legs get the same number of pixels
  const left = MID_X - Math.ceil((MID_X - x0) / F) * F, top = bottom - Math.ceil((bottom - y0) / F) * F;
  const w = Math.ceil((x1 + 1 - left) / F), h = (bottom - top) / F;
  const W = w + 2, H = h + 2, px = new Uint32Array(W * H);
  for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
    const count = new Map();
    let opaque = 0, dark = 0, darkCol = 0;
    for (let j = 0; j < F; j++) for (let i = 0; i < F; i++) {
      const x = left + bx * F + i, y = top + by * F + j;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const k = (y * n + x) * 4;
      if (d[k + 3] < 128) continue;
      opaque++;
      const col = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
      count.set(col, (count.get(col) || 0) + 1);
      if (d[k] + d[k + 1] + d[k + 2] < 90) { dark++; darkCol = col; }
    }
    if (opaque < F * F * 0.38) continue;
    let best = 0, bestN = 0;
    for (const [col, m] of count) if (m > bestN) { best = col; bestN = m; }
    if (dark >= F * F * 0.3 && dark < bestN + 3) best = darkCol;   // keep eyes, mouths and dark details
    px[(by + 1) * W + bx + 1] = rgba('#' + best.toString(16).padStart(6, '0'));
  }
  const o = rgba(OUTLINE), src = px.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (src[k]) continue;
    if ((x > 0 && src[k - 1]) || (x < W - 1 && src[k + 1]) || (y > 0 && src[k - W]) || (y < H - 1 && src[k + W])) px[k] = o;
  }
  // pieces: body (above the hips) and the two legs
  const hip = Math.min(H - 2, Math.round((HIPS - top) / F) + 1), mid = Math.round((MID_X - left) / F) + 1;
  const crop = (cx, cy, cw, ch) => { const out = new Uint32Array(cw * ch); for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = px[(cy + y) * W + cx + x]; return toCanvas(out, cw, ch); };
  const out = {
    w: W, h: H, hip, mid,
    full: toCanvas(px, W, H), body: crop(0, 0, W, hip), legL: crop(0, hip, mid, H - hip), legR: crop(mid, hip, W - mid, H - hip),
    hand: { x: W - 3, y: Math.round(hip - 2) },   // front hand, roughly at the side of the body
  };
  cache.set(id, out);
  return out;
}
