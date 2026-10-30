// Mind Island rules, shared by the browser (instant feedback) and the server (the real save).
// State: { dust, inv: { seed_bean: 3, crop_bean: 1, wood: 4, stone: 2, permit: 0 }, tiles: { k: tile } }
// tile: { s: 'c' cleared | 'p' plot | 'w' weeds grew back | 'b' under a building, t: last touched (ms), c: crop, p: planted at (ms) }
// buildings: st.b = [{ id, type, k }] (k = top-left tile), st.nb = next id
import { gen, COVER, TW, TH, hash, oldKey } from './gen.js';

const H = 3600e3;
export const CROPS = {
  bean: { name: 'Sprout Bean', grow: 0.5 * H, seed: 5, sell: 15 },
  carrot: { name: 'Glow Carrot', grow: 2 * H, seed: 15, sell: 45 },
  melon: { name: 'Moon Melon', grow: 8 * H, seed: 40, sell: 130 },
  star: { name: 'Star Fruit', grow: 24 * H, seed: 100, sell: 330 },
};
export const RAW = { wood: { name: 'Wood', sell: 2 }, stone: { name: 'Stone', sell: 3 } };
export const PLOT_COST = 10;                        // Dust to till one plot
export const BASE_PLOTS = 12, MIND_PLOTS = 8, MAX_PERMITS = 16;
export const permitCost = n => Math.min(16000, 1000 * 2 ** n);   // 1,000 → 2,000 → 4,000 … (max 16,000)
export const DROPS = { [COVER.WEEDS]: { dust: 1 }, [COVER.BUSH]: { dust: 2, wood: 1 }, [COVER.ROCK]: { stone: 2 }, [COVER.TREE]: { wood: 3 } };
export const PLOT_IDLE = 48 * H;                    // an empty plot left alone this long goes back to weeds
export const regrowMs = (k, seed) => (12 + hash(k, 7, seed) * 24) * H;   // cleared ground: weeds return in 12–36 h
export const speedBonus = minds => Math.min(minds, 6) * 0.05;          // each Mind you own: crops grow 5% faster (max 30%)
export const growMs = (crop, minds) => CROPS[crop].grow * (1 - speedBonus(minds));
// village buildings + defences (see docs/VILLAGE_RAIDS.md). hp is used by raids.
export const BUILD = {
  house: { name: 'Cottage', icon: '🏡', w: 2, h: 2, cost: { dust: 200, wood: 15 }, max: 4, hp: 520, desc: '+2 farm plots each' },
  mill: { name: 'Mill', icon: '🌾', w: 2, h: 2, cost: { dust: 400, wood: 25, stone: 10 }, max: 1, hp: 600, desc: 'Crops sell for 25% more' },
  barn: { name: 'Barn', icon: '🛖', w: 2, h: 2, cost: { dust: 300, wood: 20 }, max: 2, hp: 700, desc: 'Keeps 1,000 ✨ safe from raiders' },
  wall: { name: 'Wall', icon: '🧱', w: 1, h: 1, cost: { stone: 3 }, max: 80, hp: 160, desc: 'Blocks raiders. Drag to build a line.' },
  tower: { name: 'Watchtower', icon: '🗼', w: 1, h: 1, cost: { dust: 150, wood: 10, stone: 15 }, max: m => Math.min(6, 2 + m), hp: 480, desc: 'Shoots raiders (2 + 1 per Mind you own, max 6)' },
  trap: { name: 'Spike Trap', icon: '📌', w: 1, h: 1, cost: { dust: 40, wood: 4 }, max: 6, hp: 0, desc: 'Hidden from raiders. 35 damage, once per raid' },
};
export const HOME_HP = 1100;
export const maxOf = (type, minds) => { const m = BUILD[type].max; return typeof m === 'function' ? m(minds) : m; };
export const countOf = (st, type) => (st.b || []).filter(b => b.type === type).length;
export const MILL_BONUS = 0.25, BARN_SAFE = 1000;
export const footprint = b => { const d = BUILD[b.type], out = []; for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) out.push(b.k + y * TW + x); return out; };
export function buildingAt(st, k) {
  for (const b of st.b || []) if (footprint(b).includes(k)) return b;
  return null;
}
const have = (st, item) => item === 'dust' ? st.dust : st.inv[item] || 0;
export const canAfford = (st, cost) => Object.entries(cost).every(([i, n]) => have(st, i) >= n);
export const costText = cost => Object.entries(cost).map(([i, n]) => `${n} ${{ dust: '✨', wood: '🪵', stone: '🪨' }[i]}`).join(' ');
// every tile of a building must be open ground on the island (and inside the map, not wrapping a row)
export function fits(st, w, type, k, ignore = null) {
  const d = BUILD[type];
  if (!Number.isInteger(k) || k < 0) return false;
  const x0 = k % TW, y0 = (k / TW) | 0;
  if (x0 + d.w > TW || y0 + d.h > TH) return false;
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const t = (y0 + y) * TW + x0 + x;
    if (!w.land[t] || w.cover[t] === COVER.FIXED) return false;
    const b = buildingAt(st, t);
    if (b && b !== ignore) return false;
    if (b === ignore && b) continue;
    if (coverAt(st, w, t) !== COVER.NONE || st.tiles[t]?.s === 'p') return false;
  }
  return true;
}
export const POINTS_PER_DUST = 100, POINTS_DAY_CAP = 20;                 // selling: 1 leaderboard point per 100 Dust, max 20 a day

export function newIsland(seed, now) {
  const w = gen(seed), tiles = {};
  for (const k of w.starter) tiles[k] = { s: 'p', t: now };
  return { v: 2, dust: 100, inv: { seed_bean: 6, seed_carrot: 2 }, tiles };
}
export const maxPlots = (st, minds) => BASE_PLOTS + Math.min(minds, MIND_PLOTS) + Math.min(st.inv.permit || 0, MAX_PERMITS) + 2 * countOf(st, 'house');
export const plotCount = st => Object.values(st.tiles).filter(t => t.s === 'p').length;
// what is on a tile right now
export function coverAt(st, w, k) {
  const t = st.tiles[k];
  if (!t) return w.cover[k];
  return t.s === 'w' ? COVER.WEEDS : t.s === 'b' ? COVER.FIXED : COVER.NONE;
}
export const isPlot = (st, k) => st.tiles[k]?.s === 'p';
export const ripe = (t, now, minds) => !!t?.c && now - t.p >= growMs(t.c, minds);

// v1 islands (48×36 tiles) move into the middle of the bigger v2 map
export function migrate(st) {
  if ((st.v || 1) >= 2) return st;
  const tiles = {};
  for (const [k, t] of Object.entries(st.tiles || {})) tiles[oldKey(+k)] = t;
  st.tiles = tiles;
  for (const b of st.b || []) b.k = oldKey(b.k);
  delete st.raid; delete st.adv;
  st.v = 2;
  return st;
}
// weeds creep back over ground nobody looks after
export function normalize(st, seed, now) {
  migrate(st);
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
    case 'build': {
      const d = BUILD[a.item];
      if (!d) return { error: 'unknown building' };
      const spots = d.w === 1 ? tiles : [Number(a.k)];
      st.b ||= []; st.nb ||= 1;
      for (const k of spots) {
        if (countOf(st, a.item) >= maxOf(a.item, minds)) return done ? { gain, done } : { error: `You can have ${maxOf(a.item, minds)} ${d.name}${maxOf(a.item, minds) > 1 ? 's' : ''}.` };
        if (!fits(st, w, a.item, k)) { if (d.w > 1) return { error: 'It does not fit there: it needs open, cleared ground.' }; continue; }
        if (!canAfford(st, d.cost)) return done ? { gain, done } : { error: `A ${d.name} costs ${costText(d.cost)}.` };
        for (const [i, n] of Object.entries(d.cost)) pay(i, -n);
        const b = { id: st.nb++, type: a.item, k };
        st.b.push(b);
        for (const t of footprint(b)) st.tiles[t] = { s: 'b', t: now };
        done++;
      }
      break;
    }
    case 'move': {
      const b = (st.b || []).find(x => x.id === Number(a.id)), k = Number(a.k);
      if (!b) return { error: 'that building is gone' };
      if (!fits(st, w, b.type, k, b)) return { error: 'It does not fit there.' };
      for (const t of footprint(b)) st.tiles[t] = { s: 'c', t: now };
      b.k = k;
      for (const t of footprint(b)) st.tiles[t] = { s: 'b', t: now };
      done = 1;
      break;
    }
    case 'demolish': {
      const b = (st.b || []).find(x => x.id === Number(a.id));
      if (!b) return { error: 'that building is gone' };
      for (const [i, n] of Object.entries(BUILD[b.type].cost)) pay(i, Math.floor(n / 2));
      for (const t of footprint(b)) st.tiles[t] = { s: 'c', t: now };
      st.b = st.b.filter(x => x !== b);
      done = 1;
      break;
    }
    case 'sell': {
      const item = String(a.item), mill = countOf(st, 'mill') ? 1 + MILL_BONUS : 1;
      const price = item.startsWith('crop_') ? Math.round((CROPS[item.slice(5)]?.sell || 0) * mill) : RAW[item]?.sell;
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
