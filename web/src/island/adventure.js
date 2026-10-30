// Adventure: what is on a wild island, as pure math from a seed (the browser draws and plays it, the server
// uses the same numbers to check what you brought home). Nodes give loot when gathered; monsters roam and fight;
// chests are guarded (you must beat the guard first). The ruined hut in the middle hides the boss and the big chest.
import { gen, COVER, T, TW, TH, hash } from './gen.js';

// the world map: each area unlocks when you beat the Ogre of the one before; far areas cost Sky Fuel to fly to
export const AREAS = [
  { name: 'Meadow Isles', icon: '🌿', level: 1, fuel: 0, x: 18, y: 62, desc: 'Gentle islands. Slimes and boars.' },
  { name: 'Crystal Cliffs', icon: '💎', level: 2, fuel: 1, x: 40, y: 30, desc: 'Ore everywhere. Bandits guard the chests.' },
  { name: 'Ember Reach', icon: '🔥', level: 3, fuel: 2, x: 64, y: 58, desc: 'Hot winds, tough boars, rich loot.' },
  { name: 'Storm Spire', icon: '⚡', level: 4, fuel: 3, x: 84, y: 24, desc: 'The hardest sky. Royal treasure.' },
];
export const GATHER_PER_HOUR = 40, POTION_HEAL = 120, POTIONS_MAX = 5;
export const ADV_TIME = 180;                                   // seconds on the island
export const advPerDay = minds => 5 + Math.min(3, minds | 0);  // adventures per day: 5 (+1 per Mind owned, max +3)
export const HEROES = {
  hero: { hp: 340, dps: 32, speed: 46, ability: { name: 'Battle Cry', icon: '📯', heal: 140, mult: 1.6, secs: 5, cd: 22 } },
  captain: { hp: 290, dps: 27, speed: 46, ability: { name: 'Second Wind', icon: '💨', heal: 110, mult: 1.25, secs: 4, cd: 25 } },
};
export const MONSTERS = {
  slime: { name: 'Slime', hp: 45, dps: 5, speed: 16, aggro: 4, reach: 12, loot: { dust: 3 } },
  boar: { name: 'Wild Boar', hp: 110, dps: 10, speed: 36, aggro: 5, reach: 13, loot: { dust: 8 } },
  bandit: { name: 'Bandit', hp: 180, dps: 13, speed: 30, aggro: 5, reach: 13, loot: { dust: 15 } },
  ogre: { name: 'Ogre', hp: 520, dps: 21, speed: 22, aggro: 6, reach: 16, loot: { dust: 60, gems: 2 }, boss: true },
};
export const NODES = {
  ore: { name: 'Ore', time: 1.2, loot: { stone: 4 } },
  log: { name: 'Fallen log', time: 1.0, loot: { wood: 4 } },
  berry: { name: 'Berry bush', time: 0.8, loot: { dust: 6 } },
  herb: { name: 'Glow herb', time: 0.8, loot: { herb: 1 } },
  chest: { name: 'Chest', time: 1.0, loot: { dust: 50, seed_melon: 1 } },
  bigchest: { name: 'Royal chest', time: 1.4, loot: { dust: 160, seed_star: 1 } },
};
const kx = k => k % TW, ky = k => (k / TW) | 0;
const open = (w, k) => k >= 0 && k < TW * TH && !!w.land[k] && (w.cover[k] === COVER.NONE || w.cover[k] === COVER.WEEDS || w.cover[k] === COVER.BUSH || (w.cover[k] === COVER.FIXED && w.path.includes(k)));
// walkable = open ground that is joined to the main part of the island (no little pockets boxed in by trees/rocks)
const mainCache = new Map();
function mainland(w) {
  if (mainCache.has(w.seed)) return mainCache.get(w.seed);
  const comp = new Int32Array(TW * TH).fill(-1), sizes = [];
  for (let s = 0; s < TW * TH; s++) {
    if (comp[s] >= 0 || !open(w, s)) continue;
    const id = sizes.length, q = [s]; comp[s] = id; let n = 0;
    while (q.length) { const c = q.pop(); n++; for (const d of [1, -1, TW, -TW]) { const nb = c + d; if ((d === 1 && nb % TW === 0) || (d === -1 && c % TW === 0)) continue; if (comp[nb] < 0 && open(w, nb)) { comp[nb] = id; q.push(nb); } } }
    sizes.push(n);
  }
  const big = sizes.indexOf(Math.max(...sizes)), m = new Uint8Array(TW * TH);
  for (let k = 0; k < TW * TH; k++) if (comp[k] === big) m[k] = 1;
  mainCache.set(w.seed, m);
  if (mainCache.size > 6) mainCache.delete(mainCache.keys().next().value);
  return m;
}
export const walkable = (w, k) => k >= 0 && k < TW * TH && mainland(w)[k] === 1;

// level 1-3 makes monsters tougher and loot better
export function advMap(seed, level = 1) {
  const w = gen(seed), r = (i, j = 0) => hash(i, j, seed ^ 0x2545f491);
  const free = [];
  for (let k = 0; k < TW * TH; k++) if (walkable(w, k)) free.push(k);
  // land on the beach as far as possible from the ruined hut (where the boss lives)
  const hutX = w.house.x + 1, hutY = w.house.y + 3;
  const shore = free.filter(k => [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => { const x = kx(k) + dx, y = ky(k) + dy; return x < 0 || y < 0 || x >= TW || y >= TH || !w.land[y * TW + x]; }));
  const start = (shore.length ? shore : free).reduce((b, k) => Math.hypot(kx(k) - hutX, ky(k) - hutY) > Math.hypot(kx(b) - hutX, ky(b) - hutY) ? k : b);
  const used = new Set();
  const near = (k, d) => [...used].some(u => Math.max(Math.abs(kx(u) - kx(k)), Math.abs(ky(u) - ky(k))) < d);
  const far = k => Math.hypot(kx(k) - kx(start), ky(k) - ky(start));
  const pick = (i, minFar = 6) => {
    for (let a = 0; a < 200; a++) {
      const k = free[(r(i, a) * free.length) | 0];
      if (!used.has(k) && !near(k, 2) && far(k) > minFar) { used.add(k); return k; }
    }
    return -1;
  };
  const nodes = [], monsters = [];
  let id = 0;
  const addNode = (type, k, extra = {}) => { if (k >= 0) nodes.push({ id: ++id, type, k, loot: scale(NODES[type].loot, level), ...extra }); return id; };
  const addMon = (type, k, extra = {}) => { if (k >= 0) monsters.push({ id: ++id, type, k, hp: Math.round(MONSTERS[type].hp * (1 + (level - 1) * 0.35)), loot: scale(MONSTERS[type].loot, level), ...extra }); };
  for (let i = 0; i < 7; i++) addNode('ore', pick(100 + i));
  for (let i = 0; i < 7; i++) addNode('log', pick(200 + i));
  for (let i = 0; i < 8; i++) addNode('berry', pick(300 + i));
  for (let i = 0; i < 4; i++) addNode('herb', pick(400 + i, 10));
  // guarded chests
  for (let i = 0; i < 2 + level; i++) {
    const k = pick(500 + i, 12);
    if (k < 0) continue;
    const cid = addNode('chest', k);
    const gk = free.find(f => !used.has(f) && Math.max(Math.abs(kx(f) - kx(k)), Math.abs(ky(f) - ky(k))) === 2);
    if (gk != null) { used.add(gk); addMon(i % 2 ? 'boar' : 'bandit', gk, { guards: cid }); }
  }
  // the ruined hut: boss + royal chest
  const hut = (w.house.y + 3) * TW + w.house.x + 1;
  const bk = walkable(w, hut) ? hut : pick(600, 10);
  const bigId = addNode('bigchest', bk);
  const ok = free.find(f => !used.has(f) && Math.abs(kx(f) - kx(bk)) <= 2 && ky(f) - ky(bk) === 2) ?? pick(601, 8);
  used.add(ok); addMon('ogre', ok, { guards: bigId });
  for (let i = 0; i < 6 + level * 2; i++) addMon('slime', pick(700 + i, 8), { color: (r(i, 9) * 3) | 0 });
  for (let i = 0; i < 2 + level; i++) addMon('boar', pick(800 + i, 10));
  return { seed, level, start, nodes, monsters };
}
function scale(loot, level) { const o = {}; for (const [k, n] of Object.entries(loot)) o[k] = k.startsWith('seed_') || k === 'gems' || k === 'herb' ? n : Math.round(n * (1 + (level - 1) * 0.35)); return o; }

// what you get for what you did (the server recomputes this from the ids you send)
export function advLoot(map, got = [], beat = []) {
  const out = {}, add = l => { for (const [k, n] of Object.entries(l)) out[k] = (out[k] || 0) + n; };
  const beaten = new Set(beat.filter(id => map.monsters.some(m => m.id === id)));
  for (const m of map.monsters) if (beaten.has(m.id)) add(m.loot);
  for (const n of map.nodes) {
    if (!got.includes(n.id)) continue;
    const guard = map.monsters.find(m => m.guards === n.id);
    if (guard && !beaten.has(guard.id)) continue;         // a guarded chest only counts if you beat its guard
    add(n.loot);
  }
  return out;
}
