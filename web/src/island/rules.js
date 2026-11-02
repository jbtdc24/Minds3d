// Mind Island rules, shared by the browser (instant feedback) and the server (the real save).
// State: { dust, inv: { seed_bean: 3, crop_bean: 1, wood: 4, stone: 2, permit: 0 }, tiles: { k: tile } }
// tile: { s: 'c' cleared | 'p' plot | 'w' weeds grew back | 'b' under a building, t: last touched (ms), c: crop, p: planted at (ms) }
// buildings: st.b = [{ id, type, k }] (k = top-left tile), st.nb = next id
import { JOBS, jobSlots } from './jobs.js';
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
  house: { name: 'Cottage', icon: '🏡', w: 2, h: 2, cost: { dust: 500, wood: 30 }, max: 4, hp: 520, desc: '+2 farm plots each' },
  mill: { name: 'Mill', icon: '🌾', w: 2, h: 2, cost: { dust: 1500, wood: 60, stone: 30 }, max: 1, hp: 600, desc: 'Crops sell for 25% more' },
  camp: { name: 'Army Camp', icon: '⛺', w: 2, h: 2, cost: { dust: 800, wood: 40 }, max: 3, hp: 500, desc: '+3 camp space per level and +1 raid a day' },
  barn: { name: 'Barn', icon: '🛖', w: 2, h: 2, cost: { dust: 1000, wood: 50 }, max: 2, hp: 700, desc: 'Keeps 1,000 ✨ safe from raiders' },
  wall: { name: 'Wall', icon: '🧱', w: 1, h: 1, cost: { stone: 3 }, max: 80, hp: 160, desc: 'Blocks raiders. Drag to build a line.' },
  tower: { name: 'Watchtower', icon: '🗼', w: 1, h: 1, cost: { dust: 600, wood: 25, stone: 40 }, max: m => Math.min(6, 2 + m), hp: 480, desc: 'Shoots raiders (2 + 1 per Mind you own, max 6)' },
  trap: { name: 'Spike Trap', icon: '📌', w: 1, h: 1, cost: { dust: 100, wood: 8 }, max: 6, hp: 0, desc: 'Hidden from raiders. 45 damage, once per raid' },
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
// the link between the island and Ranked: the Energy Well slowly fills with shards; 3 shards = +1 ranked energy on a Mind
export const SHARD_MS = 4 * 3600e3, SHARD_CAP = 6, SHARDS_PER_ENERGY = 3;
export const ENERGY_PRICE = { dust: 300, gems: 3 }, REFILLS_PER_DAY = 3;   // or buy it: max 3 refills per Mind per day
export const wellShards = (st, now) => Math.min(SHARD_CAP, Math.floor((now - (st.wellAt ?? now)) / SHARD_MS));
// anything can be paid with Gems instead: about 1 💎 per 100 Dust of value (wood 5, stone 6 Dust each)
export const gemPrice = cost => cost.gems ? cost.gems : Math.max(1, Math.ceil(((cost.dust || 0) + (cost.wood || 0) * 5 + (cost.stone || 0) * 6) / 100));
const priceOf = (cost, gems) => gems ? { gems: gemPrice(cost) } : cost;
// building takes time (like a real build game): seconds per building; 0 = instant (walls, fences, flowers so you can drag lines)
export const BUILD_SECS = { camp: 420, house: 300, mill: 900, barn: 600, tower: 480, trap: 60, lamp: 30, bench: 30, banner: 30, lantern: 20, crystal: 20, fountain: 60 };
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
  raid_pass: { name: 'War Horn', icon: '📯', price: { dust: 600 }, gives: { raid_ticket: 1 }, desc: 'One extra raid today' },
  gem_raid: { name: 'Raid Ticket', icon: '🎟️', price: { gems: 4 }, gives: { raid_ticket: 1 }, desc: 'One extra raid today', gem: true },
  gem_adv: { name: 'Adventure Ticket', icon: '🧭', price: { gems: 4 }, gives: { adv_ticket: 1 }, desc: 'One extra adventure today', gem: true },
  gem_dust: { name: 'Sack of Dust', icon: '✨', price: { gems: 10 }, gives: { dust: 1200 }, desc: '1,200 Dust', gem: true },
};
export const TROOP_MAX = 60;                           // troops you can keep trained
export const troopCount = st => Object.entries(st.inv).filter(([k]) => k.startsWith('troop_')).reduce((s, [, n]) => s + n, 0);
// airship tiers (same numbers as adventure.js SHIPS; kept here so rules.js has no extra import)
export const SHIP_COSTS = [null, { name: 'Sky Skiff', cost: { dust: 2000, wood: 80 }, gems: 24 }, { name: 'Cloud Galleon', cost: { dust: 10000, wood: 300, stone: 200 }, gems: 125 }, { name: 'Storm Cruiser', cost: { dust: 30000, wood: 800, stone: 600 }, gems: 375 }];
export const RECIPES = { potion: { name: 'Health Potion', needs: { herb: 2 }, gives: { potion: 1 } } };
export const HOME_HP = 1100;
export const maxOf = (type, minds) => {
  if (!BUILD[type]) return 0; const m = BUILD[type].max; return typeof m === 'function' ? m(minds) : m; };
export const countOf = (st, type) => (st.b || []).filter(b => b.type === type).length;
export const MILL_BONUS = 0.25, BARN_SAFE = 1000;
// building levels (1-3): upgrading costs more each level, takes a builder and time; effects grow with the level
export const UPGRADABLE = { camp: 1, home: 1, house: 1, mill: 1, barn: 1, tower: 1, wall: 1 };
export const MAX_LV = 3;
export const lvOf = b => b.lv || 1;
export const upgradeCost = b => { const base = BUILD[b.type].cost, m = lvOf(b) * 1.6; const c = Object.fromEntries(Object.entries(base).map(([k, n]) => [k, Math.ceil(n * m)])); if (b.type === 'home') return { dust: 1500 * lvOf(b), wood: 80 * lvOf(b), stone: 80 * lvOf(b) }; return c; };
export const upgradeSecs = b => b.type === 'wall' ? 0 : Math.round((BUILD_SECS[b.type] || 300) * lvOf(b) * 1.5);
export const hpMult = lv => 1 + 0.5 * ((lv || 1) - 1);
// troop levels (1-3): each level gives +20% HP and damage. Weights match each troop's camp space (raid.js TROOPS; a test checks).
// Lv2 needs an Army Camp, Lv3 needs an Army Camp at Lv2. The Siege Cup ignores troop levels (same army for everyone).
export const TROOP_UP = { brawler: 1, archer: 1, bomber: 2, giant: 3 }, MAX_TL = 3;
export const troopLv = (st, k) => Math.min(MAX_TL, Math.max(1, st.tl?.[k] | 0 || 1));
export const troopMult = lv => 1 + 0.2 * ((lv || 1) - 1);
export const troopUpCost = (k, lv) => ({ dust: 700 * lv * TROOP_UP[k], stone: 20 * lv * TROOP_UP[k] });
export const troopLevels = st => Object.fromEntries(Object.keys(TROOP_UP).map(k => [k, troopLv(st, k)]));
const campNeeded = lv => lv - 1;   // the camp level the next troop level needs (Lv2 → any camp, Lv3 → a Lv2 camp)
// what a building does at a level, for the upgrade preview (camp space 3 and tower damage 26 match raid.js; a test checks)
export function levelStats(type, lv) {
  const hp = Math.round((type === 'home' ? HOME_HP : BUILD[type]?.hp || 0) * hpMult(lv)), out = hp ? [['❤️ HP', hp]] : [];
  if (type === 'house') out.push(['🌱 Farm plots', 1 + lv]);
  if (type === 'mill') out.push(['🌾 Crop price', `+${Math.round((MILL_BONUS + 0.1 * (lv - 1)) * 100)}%`]);
  if (type === 'barn') out.push(['🛖 Safe Dust', (BARN_SAFE * lv).toLocaleString()]);
  if (type === 'camp') out.push(['⛺ Camp space', `+${3 * lv}`]);
  if (type === 'tower') out.push(['🏹 Damage', Math.round(26 * (1 + 0.3 * (lv - 1)))]);
  return out;
}
const finished = (st, type) => (st.b || []).filter(b => b.type === type && (!b.done || b.uplv));   // being upgraded = still works at its old level
export const millBonus = st => { const m = finished(st, 'mill')[0]; return m ? MILL_BONUS + 0.1 * (lvOf(m) - 1) : 0; };
export const campLevels = st => finished(st, 'camp').reduce((s, b) => s + lvOf(b), 0);
export const campCount = st => finished(st, 'camp').length;
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

export function newIsland(seed, now = 0) {
  const w = gen(seed), tiles = {};
  for (const k of w.starter) tiles[k] = { s: 'p', t: now };
  const st = { v: 2, dust: 100, gems: 0, inv: { seed_bean: 6, seed_carrot: 2, troop_brawler: 6, troop_archer: 4, potion: 2, fuel: 1 }, tiles };
  migrate3(st, seed);
  st.v = 5; st.wellAt = now; st.npcAt = now;
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
// ---------- a raided village burns ----------
// A raid with stars leaves the buildings it broke on fire (st.burn). While it burns your island earns nothing:
// no harvests, no selling, Mind jobs stand still, and after BURN_CROPS_MS the crops on your plots are lost.
// Restore it at once (Dust + wood, or Gems) or let your Minds repair it for free, which takes time.
export const BURN_CROPS_MS = 3 * 3600e3, REPAIR_MS = 10 * 60e3, REPAIR_MAX = 2 * 3600e3;
export const burning = (st, now) => !!st.burn && !(st.burn.fix && st.burn.fix <= now);
const burnSize = st => Math.max(1, st.burn?.ids?.length || 0);
export const restoreCost = st => ({ dust: 80 * burnSize(st), wood: 6 * burnSize(st) });
export const repairMs = st => Math.min(REPAIR_MAX, REPAIR_MS * burnSize(st));
export function burnVillage(st, now, { by, ids = [], stars = 0 }) {
  if (stars < 1) return;
  const keep = new Set((st.b || []).filter(b => !BUILD[b.type]?.deco && b.type !== 'wall' && b.type !== 'trap').map(b => b.id));
  const all = new Set([...(st.burn?.ids || []), ...ids.filter(id => keep.has(id))]);
  st.burn = { at: st.burn?.at || now, by, ids: [...all].slice(0, 30) };   // a second raid adds to the fire, it does not restart the clock
}
export function normalize(st, seed, now) {
  migrate(st); migrate3(st, seed);
  if (st.burn?.fix && st.burn.fix <= now) delete st.burn;   // the Minds finished the repairs
  if (burning(st, now) && !st.burn.lost && now - st.burn.at > BURN_CROPS_MS) {   // left burning too long: the crops are gone
    for (const t of Object.values(st.tiles)) if (t.s === 'p' && t.c) { delete t.c; delete t.p; }
    st.burn.lost = true;
  }
  st.wellAt ??= now;
  for (const b of st.b || []) if (b.done && b.done <= now) { if (b.uplv) b.lv = b.uplv; delete b.done; delete b.start; delete b.uplv; }   // finished building / upgrade
  if ((st.v || 1) < 5) {   // v5: the islets are gone; anything built there goes to storage, farm tiles there are dropped
    const w5 = gen(seed);
    for (const b of [...(st.b || [])]) {
      if (footprint(b).every(t => w5.land[t])) continue;
      st.b = st.b.filter(x => x !== b);
      for (const t of footprint(b)) if (st.tiles[t]?.s === 'b') delete st.tiles[t];
      if (!BUILD[b.type]?.fixed) { st.stash ||= {}; st.stash[b.type] = (st.stash[b.type] || 0) + 1; }
    }
    for (const k of Object.keys(st.tiles)) if (!w5.land[+k]) delete st.tiles[k];
    if ((st.v || 1) >= 4) st.v = 5;
  }
  if ((st.v || 1) < 4) {   // v4: everyone gets the starter army + supplies once (older islands had none, so Raid seemed broken)
    for (const [k, n] of Object.entries({ troop_brawler: 6, troop_archer: 4, potion: 2, fuel: 1 })) st.inv[k] = (st.inv[k] || 0) + n;
    st.v = 5;
  }
  const w = gen(seed);
  for (const [k, t] of Object.entries(st.tiles)) {
    const back = (t.s === 'c' && now - t.t > regrowMs(+k, seed)) || (t.s === 'p' && !t.c && now - t.t > PLOT_IDLE);
    if (!back) continue;
    if (w.cover[k] === COVER.WEEDS) delete st.tiles[k]; else st.tiles[k] = { s: 'w', t: now };
  }
  return st;
}

for (const table of [CROPS, BUILD, SHOP, RECIPES, RAW, UPGRADABLE, TROOP_UP]) Object.setPrototypeOf(table, null);
const okTile = (w, k) => Number.isInteger(k) && k >= 0 && k < TW * TH && w.land[k] === 1;
const add = (o, k, n) => { if (n) o[k] = (o[k] || 0) + n; };
// ---------- hand work (clear, plot, plant, harvest) takes real time ----------
// A player's work goes into st.q with the time it will be done; your Minds work side by side (1 lane each, at least 3
// so it matches the 3 Minds everyone sees walking around, max 12).
// It keeps going while you are away, and nothing is done before its time, so leaving the island never rushes it.
export const WORK_MS = { [COVER.WEEDS]: 2200, [COVER.BUSH]: 2500, [COVER.ROCK]: 2900, [COVER.TREE]: 3200, till: 2400, plant: 2000, harvest: 2100 };
const WORK = { clear: 1, till: 1, plant: 1, harvest: 1 }, QUEUE_MAX = 300;
Object.setPrototypeOf(WORK, null);
export const workLanes = minds => Math.max(3, Math.min(12, minds | 0));
export const workMs = (st, w, type, k) => (type === 'clear' ? WORK_MS[coverAt(st, w, k)] : WORK_MS[type]) || 2000;
function queueWork(st, a, w, tiles, { now, minds }) {
  if (a.type === 'plant' && !CROPS[a.crop]) return { error: 'unknown seed' };
  st.q ||= [];
  const free = Array.from({ length: workLanes(minds) }, (_, i) => Math.max(now, st.ql?.[i] || 0)), have = new Set(st.q.map(j => j.k));
  let done = 0;
  for (const k of tiles) {
    if (!okTile(w, k) || have.has(k) || st.q.length >= QUEUE_MAX) continue;
    const t = st.tiles[k], cov = coverAt(st, w, k);
    const ok = a.type === 'clear' ? !!DROPS[cov] : a.type === 'till' ? cov === COVER.NONE && !isPlot(st, k)
      : a.type === 'plant' ? t?.s === 'p' && !t.c : t?.s === 'p' && !!t.c;
    if (!ok) continue;
    let i = 0;
    for (let n = 1; n < free.length; n++) if (free[n] < free[i]) i = n;
    free[i] += workMs(st, w, a.type, k);
    const job = { y: a.type, k, d: free[i] };
    if (a.type === 'plant') job.c = a.crop;
    if (a.type === 'clear') job.v = cov;   // what stood there, for the effects when it is done
    st.q.push(job); have.add(k); done++;
  }
  st.ql = free;
  return done ? { gain: {}, done, queued: done } : { error: 'Nothing to do there.' };
}
// finish every queued job whose time has come, each at its own time; returns what was done
export function settleWork(st, { seed, now, minds = 0 }) {
  if (!Array.isArray(st.q) || !st.q.length) return [];
  st.q.sort((x, y) => x.d - y.d);
  const out = [];
  while (st.q.length && st.q[0].d <= now) {
    const j = st.q.shift();
    if (!WORK[j.y]) continue;
    out.push({ ...j, res: act(st, { type: j.y, tiles: [j.k], crop: j.c }, { seed, now: j.d, minds }) });
  }
  if (!st.q.length) { delete st.q; delete st.ql; }
  return out;
}

// apply one action; returns what changed ({ gain, done }) or { error }
// queue: a player's own clear/till/plant/harvest goes into the timed work queue (the server always passes it)
export function act(st, a, { seed, now, minds = 0, instant = false, queue = false }) {   // instant: tests only
  const w = gen(seed), gain = {}, tiles = [...new Set((Array.isArray(a.tiles) ? a.tiles : []).slice(0, 400).map(Number))].slice(0, 200);
  if (queue && WORK[a.type]) return queueWork(st, a, w, tiles, { now, minds });
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
      if (burning(st, now)) return { error: 'Your village is burning! Restore it first (tap 🔥 Restore).' };
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
    case 'moveMany': {   // edit mode: shift a group of buildings together by (dx, dy) tiles, all or nothing
      const ids = new Set((Array.isArray(a.ids) ? a.ids : []).slice(0, 300).map(Number)), dx = a.dx | 0, dy = a.dy | 0;
      const group = (st.b || []).filter(b => ids.has(b.id));
      if (!group.length) return { error: 'Pick some buildings first.' };
      if (!dx && !dy) return { error: 'Tap a different spot to move them.' };
      const inGroup = new Set(group), taken = new Set();
      for (const b of group) {
        const d = BUILD[b.type], x0 = (b.k % TW) + dx, y0 = ((b.k / TW) | 0) + dy;
        if (x0 < 0 || y0 < 0 || x0 + d.w > TW || y0 + d.h > TH) return { error: 'That would push them off the island.' };
        for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
          const t = (y0 + y) * TW + x0 + x, other = buildingAt(st, t);
          if (!w.land[t] || w.cover[t] === COVER.FIXED || taken.has(t)) return { error: 'They do not all fit there.' };
          if (other && !inGroup.has(other)) return { error: 'Something is in the way.' };
          if (!other && (coverAt(st, w, t) !== COVER.NONE || st.tiles[t]?.s === 'p')) return { error: 'They need open, cleared ground.' };
          taken.add(t);
        }
      }
      for (const b of group) for (const t of footprint(b)) st.tiles[t] = { s: 'c', t: now };
      for (const b of group) { b.k += dy * TW + dx; for (const t of footprint(b)) st.tiles[t] = { s: 'b', t: now }; }
      done = group.length;
      break;
    }
    case 'store': {
      const b = (st.b || []).find(x => x.id === Number(a.id));
      if (!b) return { error: 'that building is gone' };
      if (BUILD[b.type].fixed) return { error: `Your ${BUILD[b.type].name} stays on the island (you can move it).` };
      if (b.done) return { error: 'Finish building it before you store it.' };
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
    case 'restore': {   // put the fire out: pay now, or let the Minds repair it for free over time
      if (!burning(st, now)) return { error: 'Nothing is burning.' };
      if (a.slow) { if (!st.burn.fix) st.burn.fix = now + repairMs(st); done = 1; break; }
      const price = priceOf(restoreCost(st), a.gems);
      if (!canAfford(st, price)) return { error: `Restoring costs ${costText(price)}. Or let your Minds repair it for free (${Math.round(repairMs(st) / 60e3)} min).` };
      for (const [i, n] of Object.entries(price)) pay(i, -n);
      delete st.burn; done = 1;
      break;
    }
    case 'troopup': {   // a stronger troop type: every troop of that kind, for good
      const k = String(a.item), lv = TROOP_UP[k] ? troopLv(st, k) : 0;
      if (!lv) return { error: 'unknown troop' };
      if (lv >= MAX_TL) return { error: 'That troop is at its top level.' };
      const camp = Math.max(0, ...finished(st, 'camp').map(lvOf));
      if (camp < campNeeded(lv + 1)) return { error: lv + 1 === 2 ? 'Build an Army Camp first.' : 'Upgrade an Army Camp to Lv2 first.' };
      const price = priceOf(troopUpCost(k, lv), a.gems);
      if (!canAfford(st, price)) return { error: `This upgrade costs ${costText(price)}.` };
      for (const [i, n] of Object.entries(price)) pay(i, -n);
      (st.tl ||= {})[k] = lv + 1; done = 1;
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
    case 'tutorial': {   // finished the island tour: a one-time welcome gift (skipping gives none)
      if (st.tut) return { error: 'already done' };
      st.tut = 1; done = 1;
      if (!a.skip) { pay('dust', 200); pay('gems', 3); pay('seed_carrot', 4); }
      break;
    }
    case 'job': {   // give a Mind a job (jobs.js); rest frees its slot
      const id = Number(a.mind);
      if (!Number.isInteger(id) || id < 0 || id > 3333 || !JOBS[a.job]) return { error: 'unknown job' };
      st.jobs ||= {};
      if (a.job === 'rest') { delete st.jobs[id]; done = 1; break; }
      if (!st.jobs[id] && Object.keys(st.jobs).length >= jobSlots(minds)) return { error: `All ${jobSlots(minds)} work slots are in use. Own more Minds for more slots, or rest one.` };
      st.jobs[id] = { job: a.job, at: now, ...(CROPS[a.crop] ? { crop: a.crop } : {}) };
      done = 1;
      break;
    }
    case 'well': {   // collect the shards the Energy Well has made
      const n = wellShards(st, now);
      if (n < 1) return { error: `The well is still filling: 1 ⚡ shard every 4 hours.` };
      pay('shard', n); st.wellAt = now; done = n;
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
      if (burning(st, now)) return { error: 'Your village is burning! Nobody buys from a burning village. Restore it first.' };
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
