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
  // always on the island, can be moved (not removed or stored)
  home: { name: 'Home', icon: '🏠', w: 3, h: 3, cost: {}, max: 1, hp: 1100, fixed: true, desc: 'Your house. Raiders want it.' },
  well: { name: 'Energy Well', icon: '⛲', w: 2, h: 2, cost: {}, max: 1, hp: 0, fixed: true, deco: true, desc: 'A glowing well.' },
  // decorations (no effect in raids)
  flowers: { name: 'Flower Bed', icon: '🌷', w: 1, h: 1, cost: { dust: 30 }, max: 40, hp: 0, deco: true, desc: 'Pretty flowers' },
  lamp: { name: 'Lamp Post', icon: '🏮', w: 1, h: 1, cost: { dust: 60, wood: 2, stone: 2 }, max: 20, hp: 0, deco: true, desc: 'Lights up at night' },
  fence: { name: 'Fence', icon: '🪵', w: 1, h: 1, cost: { wood: 1 }, max: 80, hp: 0, deco: true, desc: 'Drag to build a line' },
  bench: { name: 'Bench', icon: '🪑', w: 1, h: 1, cost: { dust: 40, wood: 4 }, max: 10, hp: 0, deco: true, desc: 'A place to rest' },
  banner: { name: 'Banner', icon: '🚩', w: 1, h: 1, cost: { dust: 80 }, max: 10, hp: 0, deco: true, desc: 'Show your colours' },
  lantern: { name: 'Sky Lantern', icon: '🏮', w: 1, h: 1, cost: { gems: 6 }, max: 10, hp: 0, deco: true, gem: true, desc: 'Floats and glows. Gem exclusive.' },
  crystal: { name: 'Crystal Statue', icon: '💠', w: 1, h: 1, cost: { gems: 15 }, max: 4, hp: 0, deco: true, gem: true, desc: 'A glowing sky crystal. Gem exclusive.' },
  fountain: { name: 'Golden Fountain', icon: '⛲', w: 2, h: 2, cost: { gems: 25 }, max: 1, hp: 0, deco: true, gem: true, desc: 'The richest island in the sky. Gem exclusive.' },
};
export const STASH_MAX = 12;
// anything can be paid with Gems instead: about 1 💎 per 100 Dust of value (wood 5, stone 6 Dust each)
export const gemPrice = cost => cost.gems ? cost.gems : Math.max(1, Math.ceil(((cost.dust || 0) + (cost.wood || 0) * 5 + (cost.stone || 0) * 6) / 100));
const priceOf = (cost, gems) => gems ? { gems: gemPrice(cost) } : cost;
// building takes time (like a real build game): seconds per building; 0 = instant (walls, fences, flowers so you can drag lines)
export const BUILD_SECS = { house: 300, mill: 900, barn: 600, tower: 480, trap: 60, lamp: 30, bench: 30, banner: 30, lantern: 20, crystal: 20, fountain: 60 };
export const builders = minds => Math.max(1, Math.min(5, minds | 0));      // one builder per Mind you own (at least 1, max 5)
export const busy = st => (st.b || []).filter(b => b.done).length;            // buildings still going up
export const rushGems = (b, now) => Math.max(1, Math.ceil((b.done - now) / 300e3));   // 1 💎 per 5 minutes left
// effects only count finished buildings
export const activeOf = (st, type) => (st.b || []).filter(b => b.type === type && !b.done).length;                           // buildings you can keep in storage
export const homeOf = (st, w) => { const b = (st.b || []).find(x => x.type === 'home'); return b ? { x: b.k % TW, y: (b.k / TW) | 0 } : w.house; };
export const wellOf = (st, w) => { const b = (st.b || []).find(x => x.type === 'well'); return b ? { x: b.k % TW, y: (b.k / TW) | 0 } : w.well; };
// things to buy (Dust or Gems). gives: what lands in your bag
export const SHOP = {
  potion: { name: 'Health Potion', icon: '🧪', price: { dust: 40 }, gives: { potion: 1 }, desc: 'Heals your hero 120 HP on an adventure (bring up to 5)' },
  fuel: { name: 'Sky Fuel', icon: '⛽', price: { dust: 60 }, gives: { fuel: 1 }, desc: 'Fly to far areas on the world map' },
  troop_brawler: { name: 'Brawler', icon: '🪓', price: { dust: 20 }, gives: { troop_brawler: 1 }, desc: 'Train a tough fighter for raids' },
  troop_archer: { name: 'Archer', icon: '🏹', price: { dust: 25 }, gives: { troop_archer: 1 }, desc: 'Train a ranged fighter for raids' },
  troop_bomber: { name: 'Bomber', icon: '💣', price: { dust: 60 }, gives: { troop_bomber: 1 }, desc: 'Train a wall-breaker for raids' },
  troop_giant: { name: 'Giant', icon: '🗿', price: { dust: 150 }, gives: { troop_giant: 1 }, desc: 'Train a giant for raids' },
  gem_potions: { name: 'Potion Crate', icon: '🧪', price: { gems: 5 }, gives: { potion: 6 }, desc: '6 health potions', gem: true },
  gem_fuel: { name: 'Fuel Tank', icon: '⛽', price: { gems: 5 }, gives: { fuel: 6 }, desc: '6 sky fuel', gem: true },
  gem_army: { name: 'War Chest', icon: '⚔️', price: { gems: 12 }, gives: { troop_brawler: 6, troop_archer: 4, troop_bomber: 2, troop_giant: 1 }, desc: 'A full army, ready to raid', gem: true },
  gem_raid: { name: 'Raid Ticket', icon: '🎟️', price: { gems: 4 }, gives: { raid_ticket: 1 }, desc: 'One extra raid today', gem: true },
  gem_adv: { name: 'Adventure Ticket', icon: '🧭', price: { gems: 4 }, gives: { adv_ticket: 1 }, desc: 'One extra adventure today', gem: true },
  gem_dust: { name: 'Sack of Dust', icon: '✨', price: { gems: 10 }, gives: { dust: 1200 }, desc: '1,200 Dust', gem: true },
};
export const TROOP_MAX = 60;                           // troops you can keep trained
export const troopCount = st => Object.entries(st.inv).filter(([k]) => k.startsWith('troop_')).reduce((s, [, n]) => s + n, 0);
// airship tiers (same numbers as adventure.js SHIPS; kept here so rules.js has no extra import)
export const SHIP_COSTS = [null, { name: 'Sky Skiff', cost: { dust: 800, wood: 40 }, gems: 15 }, { name: 'Cloud Galleon', cost: { dust: 3000, wood: 120, stone: 80 }, gems: 40 }, { name: 'Storm Cruiser', cost: { dust: 8000, wood: 250, stone: 200 }, gems: 90 }];
export const RECIPES = { potion: { name: 'Health Potion', needs: { herb: 2 }, gives: { potion: 1 } } };
export const HOME_HP = 1100;
export const maxOf = (type, minds) => {
  if (!BUILD[type]) return 0; const m = BUILD[type].max; return typeof m === 'function' ? m(minds) : m; };
export const countOf = (st, type) => (st.b || []).filter(b => b.type === type).length;
export const MILL_BONUS = 0.25, BARN_SAFE = 1000;
// building levels (1-3): upgrading costs more each level, takes a builder and time; effects grow with the level
export const UPGRADABLE = { home: 1, house: 1, mill: 1, barn: 1, tower: 1, wall: 1 };
export const MAX_LV = 3;
export const lvOf = b => b.lv || 1;
export const upgradeCost = b => { const base = BUILD[b.type].cost, m = lvOf(b) * 1.6; const c = Object.fromEntries(Object.entries(base).map(([k, n]) => [k, Math.ceil(n * m)])); if (b.type === 'home') return { dust: 500 * lvOf(b), wood: 40 * lvOf(b), stone: 40 * lvOf(b) }; return c; };
export const upgradeSecs = b => b.type === 'wall' ? 0 : Math.round((BUILD_SECS[b.type] || 300) * lvOf(b) * 1.5);
export const hpMult = lv => 1 + 0.5 * ((lv || 1) - 1);
const finished = (st, type) => (st.b || []).filter(b => b.type === type && (!b.done || b.uplv));   // being upgraded = still works at its old level
export const millBonus = st => { const m = finished(st, 'mill')[0]; return m ? MILL_BONUS + 0.1 * (lvOf(m) - 1) : 0; };
export const barnSafe = st => finished(st, 'barn').reduce((s, b) => s + BARN_SAFE * lvOf(b), 0) / BARN_SAFE;   // in "barns" (1 = 1,000 Dust)
const housePlots = st => finished(st, 'house').reduce((s, b) => s + 1 + lvOf(b), 0);
export const footprint = b => { const d = BUILD[b.type], out = []; for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) out.push(b.k + y * TW + x); return out; };
export function buildingAt(st, k) {
  for (const b of st.b || []) if (footprint(b).includes(k)) return b;
  return null;
}
const have = (st, item) => item === 'dust' ? st.dust : item === 'gems' ? st.gems || 0 : st.inv[item] || 0;
export const canAfford = (st, cost) => Object.entries(cost).every(([i, n]) => have(st, i) >= n);
export const costText = cost => Object.entries(cost).map(([i, n]) => `${n} ${{ dust: '✨', wood: '🪵', stone: '🪨', gems: '💎' }[i] || i}`).join(' ') || 'free';
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
  const st = { v: 2, dust: 100, gems: 0, inv: { seed_bean: 6, seed_carrot: 2, troop_brawler: 6, troop_archer: 4, potion: 2, fuel: 1 }, tiles };
  migrate3(st, seed);
  st.v = 4;
  return st;
}
export const maxPlots = (st, minds) => BASE_PLOTS + Math.min(minds, MIND_PLOTS) + Math.min(st.inv.permit || 0, MAX_PERMITS) + housePlots(st);
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
function migrate3(st, seed) {
  if ((st.v || 1) >= 3) return;
  const w = gen(seed);
  st.b ||= []; st.nb ||= 1;
  for (const [type, at] of [['home', w.house], ['well', w.well]]) {
    if (st.b.some(b => b.type === type)) continue;
    const b = { id: st.nb++, type, k: at.y * TW + at.x };
    st.b.push(b);
    for (const t of footprint(b)) st.tiles[t] = { s: 'b', t: 0 };
  }
  st.v = 3;
}
// weeds creep back over ground nobody looks after
export function normalize(st, seed, now) {
  migrate(st); migrate3(st, seed);
  for (const b of st.b || []) if (b.done && b.done <= now) { if (b.uplv) b.lv = b.uplv; delete b.done; delete b.start; delete b.uplv; }   // finished building / upgrade
  if ((st.v || 1) < 4) {   // v4: everyone gets the starter army + supplies once (older islands had none, so Raid seemed broken)
    for (const [k, n] of Object.entries({ troop_brawler: 6, troop_archer: 4, potion: 2, fuel: 1 })) st.inv[k] = (st.inv[k] || 0) + n;
    st.v = 4;
  }
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
export function act(st, a, { seed, now, minds = 0, instant = false }) {   // instant: tests only
  const w = gen(seed), gain = {}, tiles = [...new Set((Array.isArray(a.tiles) ? a.tiles : []).map(Number))].slice(0, 200);
  let done = 0;
  const pay = (k, n) => { add(gain, k, n); if (k === 'dust') st.dust += n; else if (k === 'gems') st.gems = (st.gems || 0) + n; else st.inv[k] = (st.inv[k] || 0) + n; };
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
        const have = st.inv.permit || 0, price = priceOf({ dust: permitCost(have) }, a.gems);
        if (have >= MAX_PERMITS) return { error: 'You have every Land Permit.' };
        if (!canAfford(st, price)) return { error: `A Land Permit costs ${costText(price)}.` };
        for (const [k, m] of Object.entries(price)) pay(k, -m);
        pay('permit', 1); done = 1; break;
      }
      const crop = String(a.item).replace(/^seed_/, '');
      if (!CROPS[crop]) return { error: 'unknown item' };
      const price = priceOf({ dust: CROPS[crop].seed * n }, a.gems);
      if (!canAfford(st, price)) return { error: `That costs ${costText(price)}.` };
      for (const [k, m] of Object.entries(price)) pay(k, -m);
      pay('seed_' + crop, n); done = n;
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
        const cost = priceOf(d.cost, a.gems);
        if (!canAfford(st, cost)) return done ? { gain, done } : { error: `A ${d.name} costs ${costText(cost)}.` };
        const secs = instant ? 0 : BUILD_SECS[a.item] || 0;
        if (secs && busy(st) >= builders(minds)) return done ? { gain, done } : { error: `All your builders are busy (${builders(minds)}: one per Mind you own). Wait, or finish a build with 💎.` };
        for (const [i, n] of Object.entries(cost)) pay(i, -n);
        const b = { id: st.nb++, type: a.item, k };
        if (secs) { b.done = now + secs * 1000; b.start = now; }
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
    case 'store': {
      const b = (st.b || []).find(x => x.id === Number(a.id));
      if (!b) return { error: 'that building is gone' };
      if (BUILD[b.type].fixed) return { error: `Your ${BUILD[b.type].name} stays on the island (you can move it).` };
      st.stash ||= {};
      if (Object.values(st.stash).reduce((s, n) => s + n, 0) >= STASH_MAX) return { error: `Storage is full (${STASH_MAX}). Place something first.` };
      for (const t of footprint(b)) st.tiles[t] = { s: 'c', t: now };
      st.b = st.b.filter(x => x !== b);
      st.stash[b.type] = (st.stash[b.type] || 0) + 1;
      done = 1;
      break;
    }
    case 'place': {
      const d = BUILD[a.item];
      if (!d || !(st.stash?.[a.item] > 0)) return { error: 'nothing like that in storage' };
      const spots = d.w === 1 ? tiles : [Number(a.k)];
      st.b ||= []; st.nb ||= 1;
      for (const k of spots) {
        if (!(st.stash[a.item] > 0)) break;
        if (!fits(st, w, a.item, k)) { if (d.w > 1) return { error: 'It does not fit there: it needs open, cleared ground.' }; continue; }
        const b = { id: st.nb++, type: a.item, k };
        st.b.push(b);
        for (const t of footprint(b)) st.tiles[t] = { s: 'b', t: now };
        st.stash[a.item]--; done++;
      }
      if (!st.stash[a.item]) delete st.stash[a.item];
      break;
    }
    case 'craft': {
      const r = RECIPES[a.item];
      if (!r) return { error: 'unknown recipe' };
      const n = Math.max(1, Math.min(20, a.n | 0 || 1));
      for (let i = 0; i < n; i++) {
        if (!canAfford(st, r.needs)) { if (!done) return { error: `You need ${costText(r.needs)} (herbs come from adventures).` }; break; }
        for (const [k, m] of Object.entries(r.needs)) pay(k, -m);
        for (const [k, m] of Object.entries(r.gives)) pay(k, m);
        done++;
      }
      break;
    }
    case 'shop': {
      const it = SHOP[a.item];
      if (!it) return { error: 'unknown item' };
      const n = Math.max(1, Math.min(50, a.n | 0 || 1));
      for (let i = 0; i < n; i++) {
        if (it.gives.potion && (st.inv.potion || 0) >= 30) { if (!done) return { error: 'Your bag holds 30 potions.' }; break; }
        if (Object.keys(it.gives).some(k => k.startsWith('troop_')) && troopCount(st) + Object.entries(it.gives).filter(([k]) => k.startsWith('troop_')).reduce((s, [, m]) => s + m, 0) > TROOP_MAX) { if (!done) return { error: `Your army camp holds ${TROOP_MAX} troops.` }; break; }
        const price = priceOf(it.price, a.gems);
        if (!canAfford(st, price)) { if (!done) return { error: `That costs ${costText(price)}.` }; break; }
        for (const [k, m] of Object.entries(price)) pay(k, -m);
        for (const [k, m] of Object.entries(it.gives)) pay(k, m);
        done++;
      }
      break;
    }
    case 'upgrade': {   // level a building up (takes a builder + time, or Gems)
      const b = (st.b || []).find(x => x.id === Number(a.id));
      if (!b || !UPGRADABLE[b.type]) return { error: 'That cannot be upgraded.' };
      if (b.done) return { error: 'It is already being worked on.' };
      if (lvOf(b) >= MAX_LV) return { error: 'Already at the top level.' };
      const price = priceOf(upgradeCost(b), a.gems), secs = instant ? 0 : upgradeSecs(b);
      if (!canAfford(st, price)) return { error: `Upgrading costs ${costText(price)}.` };
      if (secs && busy(st) >= builders(minds)) return { error: `All your builders are busy (${builders(minds)}: one per Mind you own). Wait, or finish a build with 💎.` };
      for (const [k, m] of Object.entries(price)) pay(k, -m);
      if (secs) { b.uplv = lvOf(b) + 1; b.done = now + secs * 1000; b.start = now; } else b.lv = lvOf(b) + 1;
      done = 1;
      break;
    }
    case 'rush': {   // finish a building right now with Gems
      const b = (st.b || []).find(x => x.id === Number(a.id));
      if (!b?.done) return { error: 'That is already built.' };
      const cost = rushGems(b, now);
      if ((st.gems || 0) < cost) return { error: `Finishing now costs ${cost} 💎.` };
      pay('gems', -cost); if (b.uplv) b.lv = b.uplv; delete b.done; delete b.start; delete b.uplv; done = 1;
      break;
    }
    case 'ship': {   // upgrade your airship one tier (Dust + wood + stone, or Gems)
      const t = (st.ship || 0) + 1, sh = SHIP_COSTS[t];
      if (!sh) return { error: 'Your airship is already the best there is.' };
      const price = a.gems ? { gems: sh.gems } : sh.cost;
      if (!canAfford(st, price)) return { error: `The ${sh.name} costs ${costText(price)}.` };
      for (const [k, m] of Object.entries(price)) pay(k, -m);
      st.ship = t; done = 1;
      break;
    }
    case 'demolish': {
      const b = (st.b || []).find(x => x.id === Number(a.id));
      if (!b) return { error: 'that building is gone' };
      if (BUILD[b.type].fixed) return { error: `Your ${BUILD[b.type].name} stays on the island (you can move it).` };
      for (const [i, n] of Object.entries(BUILD[b.type].cost)) pay(i, Math.floor(n / 2));
      for (const t of footprint(b)) st.tiles[t] = { s: 'c', t: now };
      st.b = st.b.filter(x => x !== b);
      done = 1;
      break;
    }
    case 'sell': {
      const item = String(a.item), mill = 1 + millBonus(st);
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
