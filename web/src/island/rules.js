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
  house: { name: 'Cottage', icon: '🏡', w: 2, h: 2, cost: { dust: 500, wood: 30 }, max: 4, hp: 520, desc: '+2 farm plots each' },
  mill: { name: 'Mill', icon: '🌾', w: 2, h: 2, cost: { dust: 1500, wood: 60, stone: 30 }, max: 1, hp: 600, desc: 'Crops sell for 25% more' },
  camp: { name: 'Army Camp', icon: '⛺', w: 2, h: 2, cost: { dust: 800, wood: 40 }, max: 3, hp: 500, desc: '+3 camp space per level and +1 raid a day' },
  barn: { name: 'Barn', icon: '🛖', w: 2, h: 2, cost: { dust: 1000, wood: 50 }, max: 2, hp: 700, desc: 'Keeps 1,000 ✨ safe from raiders' },
  wall: { name: 'Wall', icon: '🧱', w: 1, h: 1, cost: { stone: 3 }, max: 80, hp: 160, desc: 'Blocks raiders. Drag to build a line.' },
  tower: { name: 'Watchtower', icon: '🗼', w: 1, h: 1, cost: { dust: 600, wood: 25, stone: 40 }, max: m => Math.min(6, 2 + m), hp: 480, desc: 'Shoots raiders (2 + 1 per Mind you own, max 6)' },
  cannon: { name: 'Cannon', icon: '💥', w: 1, h: 1, cost: { dust: 900, wood: 20, stone: 60 }, max: 4, hp: 560, desc: 'Heavy shots at close range. Unlocks at Town Hall 2' },
  mortar: { name: 'Mortar', icon: '🎇', w: 1, h: 1, cost: { dust: 1800, wood: 40, stone: 120 }, max: 3, hp: 600, desc: 'Lobs shells far that hit a whole group (not up close). Unlocks at Town Hall 3' },
  spire: { name: 'Spark Spire', icon: '⚡', w: 1, h: 1, cost: { dust: 2500, wood: 30, stone: 150 }, max: 3, hp: 520, desc: 'Lightning that jumps between up to 3 raiders. Unlocks at Town Hall 4' },
  trap: { name: 'Spike Trap', icon: '📌', w: 1, h: 1, cost: { dust: 100, wood: 8 }, max: 6, hp: 0, desc: 'Hidden from raiders. 45 damage, once per raid' },
  // always on the island, can be moved (not removed or stored)
  home: { name: 'Town Hall', icon: '🏰', w: 3, h: 3, cost: {}, max: 1, hp: 1100, fixed: true, desc: 'The heart of your island. Its level sets how high everything else can go. Raiders want it.' },
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
export const ENERGY_PRICE = { dust: 3000, gems: 8 }, REFILLS_PER_DAY = Infinity;   // or buy it: no daily limit (Round 27)
// one price for every refill and every Mind (the same everywhere, so nobody is surprised)
export const energyPrice = () => ({ ...ENERGY_PRICE });
export const refillsToday = (st, mind, day) => (st.er?.day === day ? st.er.m?.[mind] || 0 : 0);
export const wellShards = (st, now) => Math.min(SHARD_CAP, Math.floor((now - (st.wellAt ?? now)) / SHARD_MS));
// anything can be paid with Gems instead: about 1 💎 per 100 Dust of value (wood 5, stone 6 Dust each)
export const gemPrice = cost => cost.gems ? cost.gems : Math.max(1, Math.ceil(((cost.dust || 0) + (cost.wood || 0) * 5 + (cost.stone || 0) * 6) / 100));
const priceOf = (cost, gems) => gems ? { gems: gemPrice(cost) } : cost;
// building takes time (like a real build game): seconds per building; 0 = instant (walls, fences, flowers so you can drag lines)
export const BUILD_SECS = { camp: 420, house: 300, mill: 900, barn: 600, tower: 480, cannon: 600, mortar: 1200, spire: 1800, trap: 60, lamp: 30, bench: 30, banner: 30, lantern: 20, crystal: 20, fountain: 60 };
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
  res_crate: { name: 'Builder Crate', icon: '📦', price: { dust: 4000 }, gives: { wood: 300, stone: 300 }, desc: '300 wood + 300 stone for big upgrades' },
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
export const TROOP_MAX = 130;                          // the most troops any camp can keep (Town Hall 10)
export const troopMax = st => 40 + 10 * (thLv(st) - 1);  // troops you can keep trained: 40 at Town Hall 1, +10 per level
export const troopCount = st => Object.entries(st.inv).filter(([k]) => k.startsWith('troop_')).reduce((s, [, n]) => s + n, 0);
// airship tiers (same numbers as adventure.js SHIPS; kept here so rules.js has no extra import)
export const SHIP_COSTS = [null, { name: 'Sky Skiff', cost: { dust: 2000, wood: 80 }, gems: 24 }, { name: 'Cloud Galleon', cost: { dust: 10000, wood: 300, stone: 200 }, gems: 125 }, { name: 'Storm Cruiser', cost: { dust: 30000, wood: 800, stone: 600 }, gems: 375 }];
export const RECIPES = { potion: { name: 'Health Potion', needs: { herb: 2 }, gives: { potion: 1 } } };
export const HOME_HP = 1100;
// Town Hall (your Home) levels 1-10 unlock more of each building; th = the Town Hall level (default: no limit)
const UNLOCK = { house: [2, 2, 3, 3, 4, 4, 5, 5, 6, 6], camp: [1, 1, 2, 2, 3, 3, 3, 4, 4, 4], barn: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3],
  wall: [20, 30, 40, 50, 60, 70, 80, 90, 100, 110], tower: [2, 2, 3, 3, 4, 4, 5, 5, 6, 6], trap: [2, 3, 3, 4, 4, 5, 5, 6, 6, 6],
  cannon: [0, 1, 1, 2, 2, 2, 3, 3, 4, 4], mortar: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3], spire: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3] };
Object.setPrototypeOf(UNLOCK, null);
export const maxOf = (type, minds, th = 10) => {
  if (!BUILD[type]) return 0;
  const u = UNLOCK[type];
  if (u) return u[Math.max(1, Math.min(10, th | 0 || 1)) - 1] + (type === 'tower' ? Math.min(2, minds | 0) : 0);
  const m = BUILD[type].max; return typeof m === 'function' ? m(minds) : m; };
// the Town Hall level a building first unlocks at (1 = from the start)
export const unlockTh = type => { const u = UNLOCK[type]; return u ? Math.max(1, u.findIndex(n => n > 0) + 1) : 1; };
// defences that shoot (raid.js uses these): range in pixels (16 a tile), damage per shot at Lv1, ticks between shots
// min: cannot hit closer than this; splash: hits everyone this close to the target; chain: jumps to more raiders
export const DEFENSE = { tower: { range: 80, dmg: 26, every: 10 }, cannon: { range: 64, dmg: 55, every: 16 },
  mortar: { range: 112, min: 32, dmg: 34, every: 30, splash: 22 }, spire: { range: 56, dmg: 16, every: 8, chain: 3 } };
Object.setPrototypeOf(DEFENSE, null);
// defence damage: +30% a level up to Lv3, then +45% a level
export const defMult = lv => { const l = Math.max(1, Math.min(10, lv || 1)); return 1 + 0.3 * (Math.min(l, 3) - 1) + 0.45 * Math.max(0, l - 3); };
export const countOf = (st, type) => (st.b || []).filter(b => b.type === type).length;
export const MILL_BONUS = 0.25, BARN_SAFE = 1000;
// building levels (1-10): no building may be above the Town Hall, and the Town Hall only goes up once your key
// buildings have caught up with it ("all aligned"). Each level costs more and takes longer: minutes early, a day at the top.
export const UPGRADABLE = { camp: 1, home: 1, house: 1, mill: 1, barn: 1, tower: 1, wall: 1, cannon: 1, mortar: 1, spire: 1 };
export const MAX_LV = 10, TH_KEY = ['house', 'mill', 'camp', 'barn', 'tower'];
export const lvOf = b => b.lv || 1;
export const thLv = st => lvOf((st.b || []).find(b => b.type === 'home') || {});
const UP_MULT = [1.6, 2.6, 4, 6, 9, 13, 18, 25, 34], TH_DUST = [1500, 3000, 5500, 9000, 14000, 21000, 30000, 42000, 60000];
const UP_SECS = [300, 1200, 3600, 7200, 4 * 3600, 7 * 3600, 11 * 3600, 16 * 3600, 24 * 3600];
export const upgradeCost = b => {
  const i = Math.min(UP_MULT.length, lvOf(b)) - 1;
  // wood and stone grow slower than Dust (they are harder to get): Town Hall = Dust / 40, others half from Lv5 on
  if (b.type === 'home') return { dust: TH_DUST[i], wood: TH_DUST[i] / 40, stone: TH_DUST[i] / 40 };
  return Object.fromEntries(Object.entries(BUILD[b.type].cost).map(([k, n]) => [k, Math.ceil(n * UP_MULT[i] * (k !== 'dust' && i >= 4 ? 0.5 : 1))]));
};
export const upgradeSecs = b => b.type === 'wall' ? 0 : Math.round(UP_SECS[Math.min(UP_SECS.length, lvOf(b)) - 1] * (b.type === 'home' ? 1.2 : 1));
// what stops an upgrade: the Town Hall (for other buildings), or key buildings behind (for the Town Hall); null = fine
export function upgradeBlock(st, b) {
  const th = thLv(st), next = lvOf(b) + 1;
  if (b.type !== 'home') return next > th ? `Upgrade your Town Hall to Lv${next} first.` : null;
  const behind = (st.b || []).filter(x => TH_KEY.includes(x.type) && (lvOf(x) < th || (x.done && !x.uplv)));
  return behind.length ? `First bring every ${[...new Set(behind.map(x => BUILD[x.type].name))].join(', ')} up to Lv${th}.` : null;
}
// Builder Boost from the daily Ranked chest: builds and upgrades take half the time while it lasts
export const boostOf = (st, now) => (st.boost || 0) > now ? 0.5 : 1;
// HP: +50% a level up to Lv3 (as before), then +60% a level (×6.2 at Lv10)
export const hpMult = lv => { const l = Math.max(1, Math.min(10, lv || 1)); return 1 + 0.5 * (Math.min(l, 3) - 1) + 0.6 * Math.max(0, l - 3); };
// farm plots a Cottage gives: 2, 3, 4 at Lv1-3, then +1 every 2 levels (7 at Lv10)
export const cottagePlots = lv => (lv || 1) <= 3 ? 1 + (lv || 1) : 4 + Math.floor(((lv || 1) - 3) / 2);
export const millPct = lv => MILL_BONUS + 0.05 * ((lv || 1) - 1);
// troop levels (1-3): each level gives +20% HP and damage. Weights match each troop's camp space (raid.js TROOPS; a test checks).
// Lv2 needs an Army Camp, Lv3 needs an Army Camp at Lv2. The Siege Cup ignores troop levels (same army for everyone).
// cosmetics: looks only, no power. Card backs show in your duels, frames around your profile picture.
// Bought once with Dust (or Gems for the premium ones), then equipped any time (st.cos = { own: [...], back, frame }).
export const COSMETICS = {
  back_ember: { kind: 'back', name: 'Ember Dragon', price: { dust: 3000 } },
  back_frost: { kind: 'back', name: 'Frost Crystal', price: { dust: 3000 } },
  back_night: { kind: 'back', name: 'Moon Night', price: { dust: 3000 } },
  back_sun: { kind: 'back', name: 'Golden Sun', price: { gems: 15 } },
  frame_gold: { kind: 'frame', name: 'Gold Frame', price: { dust: 5000 } },
  frame_frost: { kind: 'frame', name: 'Ice Frame', price: { dust: 5000 } },
  frame_flame: { kind: 'frame', name: 'Flame Frame', price: { dust: 5000 } },
  frame_rainbow: { kind: 'frame', name: 'Prism Frame', price: { gems: 20 } },
  sky_aurora: { kind: 'sky', name: 'Aurora Night', price: { dust: 6000 } },
  sky_sakura: { kind: 'sky', name: 'Blossom Dawn', price: { dust: 6000 } },
  sky_storm: { kind: 'sky', name: 'Golden Storm', price: { gems: 25 } },
  name_gold: { kind: 'name', name: 'Gold Name', price: { dust: 4000 } },
  name_neon: { kind: 'name', name: 'Neon Name', price: { dust: 4000 } },
  name_rainbow: { kind: 'name', name: 'Rainbow Name', price: { gems: 15 } },
  // auras: a glow around your Mind in Mind Town and around your picture in duels
  aura_gold: { kind: 'aura', name: 'Golden Glow', price: { dust: 6000 } },
  aura_frost: { kind: 'aura', name: 'Frost Glow', price: { dust: 6000 } },
  aura_void: { kind: 'aura', name: 'Void Glow', price: { dust: 8000 } },
  aura_rainbow: { kind: 'aura', name: 'Prism Glow', price: { gems: 25 } },
  // titles: a few words under your name (Mind Town, duels, profile, player card)
  title_farmer: { kind: 'title', name: 'Green Thumb', price: { dust: 3500 } },
  title_raider: { kind: 'title', name: 'Sky Raider', price: { dust: 3500 } },
  title_duel: { kind: 'title', name: 'Duel Master', price: { dust: 3500 } },
  title_legend: { kind: 'title', name: 'Living Legend', price: { gems: 15 } },
  // trails: little things your Mind leaves behind while it walks in Mind Town
  trail_hearts: { kind: 'trail', name: 'Heart Trail', price: { dust: 5000 } },
  trail_stars: { kind: 'trail', name: 'Star Trail', price: { dust: 5000 } },
  trail_petals: { kind: 'trail', name: 'Petal Trail', price: { dust: 5000 } },
  trail_gems: { kind: 'trail', name: 'Gem Trail', price: { gems: 20 } },
};
export const COS_KINDS = ['back', 'frame', 'sky', 'name', 'aura', 'title', 'trail'];
// Trades and gifts between players: resources only (never Minds, buildings, troops or looks); daily send limits
const TRADE_RAW = new Set(['dust', 'gems', 'wood', 'stone', 'herb', 'potion', 'fuel', 'raid_ticket', 'adv_ticket']);
export const canTrade = k => TRADE_RAW.has(k) || (/^(seed|crop)_[a-z]+$/.test(k) && Object.hasOwn(CROPS, k.slice(5)));
export const TRADE_DAY = { gems: 200, dust: 100000 }, TRADE_KINDS_MAX = 12;
export const tradeHave = (st, k) => k === 'dust' ? st.dust : k === 'gems' ? st.gems || 0 : st.inv?.[k] || 0;
// Rank Pass: wallet players without a Mind play ranked with loaner Minds for 7 days (5 ranked games a day, no rarity bonus)
export const RANK_PASS = { days: 7, games: 5, price: { dust: 5000 }, gems: 30 };
export const passActive = (st, now) => (st.rp?.until || 0) > now;
export const passLeft = (st, now) => !passActive(st, now) ? 0 : Math.max(0, RANK_PASS.games - (st.rp.day === new Date(now).toISOString().slice(0, 10) ? st.rp.used || 0 : 0));
// 🪪 Loaner Minds (Round 27): every wallet player gets one free Loaner; more can be bought (no limit). A Loaner plays like a
// Common Mind (5 ranked games a day, unlimited refills), is fixed to the account, and its art is cycled from LOANER_ART.
// st.loaners = [{ id: 'L1', art: 49, at, free?, day, used }]
export const LOANER_ART = [0], LOANER_GAMES = 5, LOANER_MIND = 0;   // Round 27c: every Loaner is the same grey Loaner Mind (game id 0, Common)
export const isLoanerId = v => typeof v === 'string' && /^L[1-9]\d{0,3}$/.test(v);
export const loanerOf = (st, id) => (st.loaners || []).find(l => l.id === id) || null;
export const loanerLeft = (st, id, now = Date.now()) => { const l = loanerOf(st, id); if (!l) return 0; return Math.max(0, LOANER_GAMES - (l.day === new Date(now).toISOString().slice(0, 10) ? l.used || 0 : 0)); };
export function addLoaner(st, now = Date.now(), free = false) {
  st.loaners ||= [];
  const n = st.loaners.reduce((m, l) => Math.max(m, +l.id.slice(1) || 0), 0) + 1;
  const l = { id: 'L' + n, art: LOANER_MIND, at: now, ...(free ? { free: true } : {}) };
  st.loaners.push(l);
  return l;
}
// the free Loaner for a wallet player (once) + an AI on the old Rank Pass slot '0' moves onto it, job and all
export function ensureLoaner(st, now = Date.now()) {
  let changed = false;
  if (!(st.loaners || []).length) { addLoaner(st, now, true); changed = true; }
  if (st.ap?.ai?.['0']) { const to = st.loaners[0].id; if (!st.ap.ai[to]) st.ap.ai[to] = st.ap.ai['0']; delete st.ap.ai['0']; if (st.ap.away?.slots) st.ap.away.slots = st.ap.away.slots.map(s => s === '0' ? to : s); changed = true; }
  return changed;
}
export const TROOP_UP = { brawler: 1, archer: 1, bomber: 2, giant: 3 }, MAX_TL = 10;
export const troopLv = (st, k) => Math.min(MAX_TL, Math.max(1, st.tl?.[k] | 0 || 1));
// troops: +20% a level up to Lv3 (as before), then +10% a level (×2.1 at Lv10)
export const troopMult = lv => { const l = Math.max(1, Math.min(10, lv || 1)); return 1 + 0.2 * (Math.min(l, 3) - 1) + 0.1 * Math.max(0, l - 3); };
export const troopUpCost = (k, lv) => ({ dust: 700 * lv * TROOP_UP[k], stone: 20 * lv * TROOP_UP[k] });
// troop upgrades take time (one at a time, like a lab): 10 min to Lv2 … 2 days to Lv10; Gems rush at 1 💎 per 5 min left
export const TL_SECS = [600, 1800, 3600, 3 * 3600, 6 * 3600, 10 * 3600, 16 * 3600, 24 * 3600, 48 * 3600];
export const troopUpSecs = lv => TL_SECS[Math.min(TL_SECS.length, Math.max(1, lv)) - 1];
export const troopRush = (st, now) => st.tlq ? Math.max(1, Math.ceil((st.tlq.d - now) / 300e3)) : 0;
export const troopLevels = st => Object.fromEntries(Object.keys(TROOP_UP).map(k => [k, troopLv(st, k)]));
const campNeeded = lv => lv - 1;   // the camp level the next troop level needs (Lv2 → any camp, Lv3 → a Lv2 camp … Lv10 → a Lv9 camp)
// what a building does at a level, for the upgrade preview (camp space 3 and tower damage 26 match raid.js; a test checks)
export function levelStats(type, lv) {
  const hp = Math.round((type === 'home' ? HOME_HP : BUILD[type]?.hp || 0) * hpMult(lv)), out = hp ? [['❤️ HP', hp]] : [];
  if (type === 'home') out.push(['🔓 Buildings up to', `Lv${lv}`], ['🎒 Troops kept', 40 + 10 * (lv - 1)]);
  if (type === 'house') out.push(['🌱 Farm plots', cottagePlots(lv)]);
  if (type === 'mill') out.push(['🌾 Crop price', `+${Math.round(millPct(lv) * 100)}%`]);
  if (type === 'barn') out.push(['🛖 Safe Dust', (BARN_SAFE * lv).toLocaleString()]);
  if (type === 'camp') out.push(['⛺ Camp space', `+${3 * lv}`]);
  if (DEFENSE[type]) out.push([type === 'spire' ? '⚡ Damage' : type === 'tower' ? '🏹 Damage' : '💥 Damage', Math.round(DEFENSE[type].dmg * defMult(lv))]);
  return out;
}
const finished = (st, type) => (st.b || []).filter(b => b.type === type && (!b.done || b.uplv));   // being upgraded = still works at its old level
export const millBonus = st => { const m = finished(st, 'mill')[0]; return m ? millPct(lvOf(m)) : 0; };
export const campLevels = st => finished(st, 'camp').reduce((s, b) => s + lvOf(b), 0);
export const campCount = st => finished(st, 'camp').length;
export const barnSafe = st => finished(st, 'barn').reduce((s, b) => s + BARN_SAFE * lvOf(b), 0) / BARN_SAFE;   // in "barns" (1 = 1,000 Dust)
const housePlots = st => finished(st, 'house').reduce((s, b) => s + cottagePlots(lvOf(b)), 0);
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
// 🧾 purchase history: everything bought with Dust or Gems (and Gem packs), kept 30 days on the player's own island
export const BUY_DAYS = 30, BUY_MAX = 300;
export function logBuy(st, entry, now = Date.now()) {
  st.buys = [{ at: now, ...entry }, ...(st.buys || [])].filter(b => now - b.at < BUY_DAYS * 864e5).slice(0, BUY_MAX);
}
// what an island action bought, in words (null = not a purchase)
export function buyLabel(a) {
  const item = String(a?.item || ''), n = Math.max(1, a?.n | 0);
  switch (a?.type) {
    case 'shop': return `${SHOP[item]?.name || item}${n > 1 ? ` ×${n}` : ''}`;
    case 'buy': return item === 'permit' ? 'Land Permit' : `${CROPS[item.replace(/^seed_/, '')]?.name || item} seeds${n > 1 ? ` ×${n}` : ''}`;
    case 'build': return `Built ${BUILD[item]?.name || item}`;
    case 'upgrade': return 'Building upgrade';
    case 'cosmetic': return a.equip ? null : `Look: ${COSMETICS[item]?.name || item}`;
    case 'rankpass': return '🎟️ Rank Pass (7 days)';
    case 'troopup': return `Troop upgrade: ${item}`;
    case 'troopnow': return 'Finished a troop upgrade';
    case 'rush': return 'Finished a building now';
    case 'ship': return 'Airship upgrade';
    case 'restore': return 'Village repair';
    case 'tplot': case 'plot': return 'Farm plot';
    default: return null;
  }
}
export function normalize(st, seed, now) {
  migrate(st); migrate3(st, seed);
  if (st.buys?.length && now - st.buys.at(-1).at > BUY_DAYS * 864e5) st.buys = st.buys.filter(b => now - b.at < BUY_DAYS * 864e5);   // older than 30 days: gone
  if (st.burn?.fix && st.burn.fix <= now) delete st.burn;   // the Minds finished the repairs
  if (burning(st, now) && !st.burn.lost && now - st.burn.at > BURN_CROPS_MS) {   // left burning too long: the crops are gone
    for (const t of Object.values(st.tiles)) if (t.s === 'p' && t.c) { delete t.c; delete t.p; }
    st.burn.lost = true;
  }
  st.wellAt ??= now;
  if (st.tlq && st.tlq.d <= now) { (st.tl ||= {})[st.tlq.k] = st.tlq.lv; delete st.tlq; }   // a troop upgrade finished
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

for (const table of [CROPS, BUILD, SHOP, RECIPES, RAW, UPGRADABLE, TROOP_UP, COSMETICS]) Object.setPrototypeOf(table, null);
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
        const most = maxOf(a.item, minds, thLv(st));
        if (countOf(st, a.item) >= most) return done ? { gain, done } : { error: `Your Town Hall Lv${thLv(st)} allows ${most} ${d.name}${most > 1 ? 's' : ''}. Upgrade it for more.` };
        if (!fits(st, w, a.item, k)) { if (d.w > 1) return { error: 'It does not fit there: it needs open, cleared ground.' }; continue; }
        const cost = priceOf(d.cost, a.gems);
        if (!canAfford(st, cost)) return done ? { gain, done } : { error: `A ${d.name} costs ${costText(cost)}.` };
        const secs = instant ? 0 : Math.round((BUILD_SECS[a.item] || 0) * boostOf(st, now));
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
        if (Object.keys(it.gives).some(k => k.startsWith('troop_')) && troopCount(st) + Object.entries(it.gives).filter(([k]) => k.startsWith('troop_')).reduce((s, [, m]) => s + m, 0) > troopMax(st)) { if (!done) return { error: `Your army camp holds ${troopMax(st)} troops (Town Hall Lv${thLv(st)}). Upgrade the Town Hall for more.` }; break; }
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
    case 'cosmetic': {   // buy a look once, or equip one you own (item 'none' + kind takes it off)
      const c = COSMETICS[a.item]?.kind ? COSMETICS[a.item] : null, cos = (st.cos ||= { own: [] });   // ?.kind: odd names never match a look
      if (a.equip) {
        if (a.item === 'none' && COS_KINDS.includes(a.kind)) { cos[a.kind] = null; done = 1; break; }
        if (!c || !cos.own.includes(a.item)) return { error: 'Get it first.' };
        cos[c.kind] = a.item; done = 1; break;
      }
      if (!c) return { error: 'unknown item' };
      if (cos.own.includes(a.item)) return { error: 'You already have it.' };
      if (!canAfford(st, c.price)) return { error: `${c.name} costs ${costText(c.price)}.` };
      for (const [i, n] of Object.entries(c.price)) pay(i, -n);
      cos.own.push(a.item); cos[c.kind] = a.item; done = 1;   // wear it right away
      break;
    }
    case 'troopup': {   // a stronger troop type: every troop of that kind, for good
      const k = String(a.item), lv = TROOP_UP[k] ? troopLv(st, k) : 0;
      if (!lv) return { error: 'unknown troop' };
      if (lv >= MAX_TL) return { error: 'That troop is at its top level.' };
      const camp = Math.max(0, ...finished(st, 'camp').map(lvOf));
      if (camp < campNeeded(lv + 1)) return { error: lv + 1 === 2 ? 'Build an Army Camp first.' : `Upgrade an Army Camp to Lv${campNeeded(lv + 1)} first.` };
      if (st.tlq && st.tlq.d <= now) { (st.tl ||= {})[st.tlq.k] = st.tlq.lv; delete st.tlq; }
      if (st.tlq) return { error: `Your camp is still training ${st.tlq.k}s to Lv${st.tlq.lv}. One troop upgrade at a time.` };
      const price = priceOf(troopUpCost(k, lv), a.gems);
      if (!canAfford(st, price)) return { error: `This upgrade costs ${costText(price)}.` };
      for (const [i, n] of Object.entries(price)) pay(i, -n);
      if (instant) (st.tl ||= {})[k] = lv + 1;
      else st.tlq = { k, lv: lv + 1, d: now + Math.round(troopUpSecs(lv) * 1000 * boostOf(st, now)) };
      done = 1;
      break;
    }
    case 'troopnow': {   // finish the troop upgrade right now with Gems (price grows with the time left)
      if (!st.tlq) return { error: 'No troop upgrade is running.' };
      if (st.tlq.d <= now) { (st.tl ||= {})[st.tlq.k] = st.tlq.lv; delete st.tlq; done = 1; break; }
      const cost = troopRush(st, now);
      if ((st.gems || 0) < cost) return { error: `Finishing now costs ${cost} 💎.` };
      pay('gems', -cost); (st.tl ||= {})[st.tlq.k] = st.tlq.lv; delete st.tlq; done = 1;
      break;
    }
    case 'upgrade': {   // level a building up (takes a builder + time, or Gems)
      const b = (st.b || []).find(x => x.id === Number(a.id));
      if (!b || !UPGRADABLE[b.type]) return { error: 'That cannot be upgraded.' };
      if (b.done) return { error: 'It is already being worked on.' };
      if (lvOf(b) >= MAX_LV) return { error: 'Already at the top level.' };
      const block = upgradeBlock(st, b);
      if (block) return { error: block };
      const price = priceOf(upgradeCost(b), a.gems), secs = instant ? 0 : Math.round(upgradeSecs(b) * boostOf(st, now));
      if (!canAfford(st, price)) return { error: `Upgrading costs ${costText(price)}.` };
      if (secs && busy(st) >= builders(minds)) return { error: `All your builders are busy (${builders(minds)}: one per Mind you own). Wait, or finish a build with 💎.` };
      for (const [k, m] of Object.entries(price)) pay(k, -m);
      if (secs) { b.uplv = lvOf(b) + 1; b.done = now + secs * 1000; b.start = now; } else b.lv = lvOf(b) + 1;
      done = 1;
      break;
    }
    case 'tos': {   // the player confirmed they are 18+ and accept the Terms and Privacy notice (kept with the time and version)
      st.tos = { at: now, v: Number(a.v) | 0 || 1 }; done = 1;
      break;
    }
    case 'tutorial': {   // finished the island tour: a one-time welcome gift (skipping gives none)
      if (st.tut) return { error: 'already done' };
      st.tut = 1; done = 1;
      if (!a.skip) { pay('dust', 200); pay('gems', 3); pay('seed_carrot', 4); }
      break;
    }
    case 'job': return { error: 'Mind jobs are gone: give this Mind its own Hello Minds AI in 🧠 AI Minds.' };
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
    case 'rankpass': {   // 7 more days of the Rank Pass (adds to what is left)
      const price = a.gems ? { gems: RANK_PASS.gems } : RANK_PASS.price;
      if (!canAfford(st, price)) return { error: `The Rank Pass costs ${costText(price)}.` };
      for (const [k, m] of Object.entries(price)) pay(k, -m);
      st.rp = { ...(st.rp || {}), until: Math.max(now, st.rp?.until || 0) + RANK_PASS.days * 864e5 }; done = 1;
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
