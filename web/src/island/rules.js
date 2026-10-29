// Mind Island rules, shared by the browser (instant feedback) and the server (the real save).
// State: { dust, inv: { seed_bean: 3, crop_bean: 1, wood: 4, stone: 2, permit: 0 }, tiles: { k: tile } }
// tile: { s: 'c' cleared | 'p' plot | 'w' weeds grew back, t: last touched (ms), c: crop, p: planted at (ms) }
import { gen, COVER, TW, TH, hash } from './gen.js';

const H = 3600e3;
export const CROPS = {
  bean: { name: 'Sprout Bean', grow: 0.5 * H, seed: 5, sell: 15 },
  carrot: { name: 'Glow Carrot', grow: 2 * H, seed: 15, sell: 45 },
  melon: { name: 'Moon Melon', grow: 8 * H, seed: 40, sell: 130 },
  star: { name: 'Star Fruit', grow: 24 * H, seed: 100, sell: 330 },
};
export const RAW = { wood: { name: 'Wood', sell: 2 }, stone: { name: 'Stone', sell: 3 } };
export const PLOT_COST = 10;                        // Dust to till one plot
export const BASE_PLOTS = 6, MIND_PLOTS = 6, MAX_PERMITS = 12;
export const permitCost = n => Math.min(16000, 1000 * 2 ** n);   // 1,000 → 2,000 → 4,000 … (max 16,000)
export const DROPS = { [COVER.WEEDS]: { dust: 1 }, [COVER.BUSH]: { dust: 2, wood: 1 }, [COVER.ROCK]: { stone: 2 }, [COVER.TREE]: { wood: 3 } };
export const PLOT_IDLE = 48 * H;                    // an empty plot left alone this long goes back to weeds
export const regrowMs = (k, seed) => (12 + hash(k, 7, seed) * 24) * H;   // cleared ground: weeds return in 12–36 h
export const speedBonus = minds => Math.min(minds, 6) * 0.05;          // each Mind you own: crops grow 5% faster (max 30%)
export const growMs = (crop, minds) => CROPS[crop].grow * (1 - speedBonus(minds));
export const POINTS_PER_DUST = 100, POINTS_DAY_CAP = 20;                 // selling: 1 leaderboard point per 100 Dust, max 20 a day

export function newIsland(seed, now) {
  const w = gen(seed), tiles = {};
  for (const k of w.starter) tiles[k] = { s: 'p', t: now };
  return { v: 1, dust: 100, inv: { seed_bean: 6, seed_carrot: 2 }, tiles };
}
export const maxPlots = (st, minds) => BASE_PLOTS + Math.min(minds, MIND_PLOTS) + Math.min(st.inv.permit || 0, MAX_PERMITS);
export const plotCount = st => Object.values(st.tiles).filter(t => t.s === 'p').length;
// what is on a tile right now
export function coverAt(st, w, k) {
  const t = st.tiles[k];
  if (!t) return w.cover[k];
  return t.s === 'w' ? COVER.WEEDS : COVER.NONE;
}
export const isPlot = (st, k) => st.tiles[k]?.s === 'p';
export const ripe = (t, now, minds) => !!t?.c && now - t.p >= growMs(t.c, minds);

// weeds creep back over ground nobody looks after
export function normalize(st, seed, now) {
  const w = gen(seed);
  for (const [k, t] of Object.entries(st.tiles)) {
    const back = (t.s === 'c' && now - t.t > regrowMs(+k, seed)) || (t.s === 'p' && !t.c && now - t.t > PLOT_IDLE);
    if (!back) continue;
    if (w.cover[k] === COVER.WEEDS) delete st.tiles[k]; else st.tiles[k] = { s: 'w', t: now };
  }
  return st;
}

const okTile = (w, k) => Number.isInteger(k) && k >= 0 && k < TW * TH && w.land[k] === 1;
const add = (o, k, n) => { if (n) o[k] = (o[k] || 0) + n; };
// apply one action; returns what changed ({ gain, done }) or { error }
export function act(st, a, { seed, now, minds = 0 }) {
  const w = gen(seed), gain = {}, tiles = [...new Set((Array.isArray(a.tiles) ? a.tiles : []).map(Number))].slice(0, 200);
  let done = 0;
  const pay = (k, n) => { add(gain, k, n); if (k === 'dust') st.dust += n; else st.inv[k] = (st.inv[k] || 0) + n; };
  switch (a.type) {
    case 'clear':
      for (const k of tiles) {
        if (!okTile(w, k)) continue;
        const c = coverAt(st, w, k), drop = DROPS[c];
        if (!drop) continue;
        for (const [item, n] of Object.entries(drop)) pay(item, n);
        st.tiles[k] = { s: 'c', t: now }; done++;
      }
      break;
    case 'till':
      for (const k of tiles) {
        if (!okTile(w, k) || coverAt(st, w, k) !== COVER.NONE || isPlot(st, k)) continue;
        if (plotCount(st) >= maxPlots(st, minds)) return done ? { gain, done, note: 'plots' } : { error: 'No free plots left. Buy a Land Permit in the Shop, or own more Minds.' };
        if (st.dust < PLOT_COST) return done ? { gain, done } : { error: `You need ${PLOT_COST} Dust to make a plot.` };
        pay('dust', -PLOT_COST);
        st.tiles[k] = { s: 'p', t: now }; done++;
      }
      break;
    case 'untill':
      for (const k of tiles) { const t = st.tiles[k]; if (t?.s === 'p' && !t.c) { st.tiles[k] = { s: 'c', t: now }; done++; } }
      break;
    case 'plant': {
      if (!CROPS[a.crop]) return { error: 'unknown seed' };
      const key = 'seed_' + a.crop;
      for (const k of tiles) {
        const t = st.tiles[k];
        if (t?.s !== 'p' || t.c) continue;
        if (!(st.inv[key] > 0)) return done ? { gain, done } : { error: `No ${CROPS[a.crop].name} seeds left. Buy more in the Shop.` };
        st.inv[key]--; add(gain, key, -1);
        Object.assign(t, { c: a.crop, p: now, t: now }); done++;
      }
      break;
    }
    case 'harvest':
      for (const k of tiles) {
        const t = st.tiles[k];
        if (t?.s !== 'p' || !ripe(t, now, minds)) continue;
        pay('crop_' + t.c, 1);
        delete t.c; delete t.p; t.t = now; done++;
      }
      break;
    case 'buy': {
      const n = Math.max(1, Math.min(99, a.n | 0));
      if (a.item === 'permit') {
        const have = st.inv.permit || 0, cost = permitCost(have);
        if (have >= MAX_PERMITS) return { error: 'You have every Land Permit.' };
        if (st.dust < cost) return { error: `A Land Permit costs ${cost} Dust.` };
        pay('dust', -cost); pay('permit', 1); done = 1; break;
      }
      const crop = String(a.item).replace(/^seed_/, '');
      if (!CROPS[crop]) return { error: 'unknown item' };
      const cost = CROPS[crop].seed * n;
      if (st.dust < cost) return { error: `That costs ${cost} Dust.` };
      pay('dust', -cost); pay('seed_' + crop, n); done = n;
      break;
    }
    case 'sell': {
      const item = String(a.item), price = item.startsWith('crop_') ? CROPS[item.slice(5)]?.sell : RAW[item]?.sell;
      if (!price) return { error: 'that cannot be sold' };
      const n = Math.max(1, Math.min(st.inv[item] || 0, a.n | 0 || 1));
      if (!(st.inv[item] > 0)) return { error: 'nothing to sell' };
      pay(item, -n); pay('dust', price * n); done = n;
      break;
    }
    default: return { error: 'unknown action' };
  }
  for (const [k, v] of Object.entries(st.inv)) if (!v) delete st.inv[k];
  return { gain, done };
}
