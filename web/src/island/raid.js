// Island raids: a pure, deterministic battle simulation (no DOM, no Math.random, no Date).
// The browser runs it live while you play; the server runs the very same code on the recorded inputs
// (which troop was dropped where and when, which spell, when the hero shouted) to get the real result.
//
// Troops: Brawlers smash the nearest building, Archers shoot from range (over walls), Bombers blow up walls,
// Giants soak damage and go for the towers. Your hero is one of your Minds (no Mind = a Captain, a bit weaker).
// Defence: watchtowers, hidden spike traps, walls and guards (2 for everyone + 1 per Mind the defender owns, max 4).
import { gen, COVER, T, TW, TH, hash } from './gen.js';
import { BUILD, HOME_HP, footprint, coverAt, newIsland, act, fits, hpMult } from './rules.js';

export const TICK = 0.1, MAX_TICKS = 1200, DROP_UNTIL = 900;                // 10 ticks a second, 2 min raid
export const TROOPS = {
  brawler: { name: 'Brawler', icon: '🪓', desc: 'Tough fighter. Smashes the nearest building.', cost: 1, hp: 210, dps: 22, speed: 30, reach: 14, aim: 'any' },
  archer: { name: 'Archer', icon: '🏹', desc: 'Shoots from range, even over walls. Fragile.', cost: 1, hp: 85, dps: 15, speed: 30, reach: 3.4 * T, aim: 'any', ranged: true },
  bomber: { name: 'Bomber', icon: '💣', desc: 'Runs at walls and blows them up.', cost: 2, hp: 70, dps: 0, speed: 40, reach: 12, aim: 'wall', blast: 150, radius: 1.6 * T },
  giant: { name: 'Giant', icon: '🗿', desc: 'Huge HP. Walks straight to the towers.', cost: 4, hp: 760, dps: 14, speed: 20, reach: 15, aim: 'tower' },
};
export const HERO = {
  hero: { name: 'Hero', hp: 470, dps: 30, speed: 30, reach: 14, aim: 'any' },          // one of your Minds
  captain: { name: 'Captain', hp: 430, dps: 27, speed: 30, reach: 14, aim: 'any' },   // no Mind: still a fighter, no Battle Cry
};
export const CRY = { radius: 3.5 * T, ticks: 70, mult: 1.5, heal: 120 };                // the hero's Battle Cry (once)
export const GUARD = { hp: 260, dps: 20, speed: 32, reach: 12, aggro: 6 * T };
export const ARMY_BASE = 10, ARMY_PER_MIND = 1, ARMY_MAX_BONUS = 3;                   // army size: 10 (+1 per Mind owned, max +3)
export const armyCap = minds => ARMY_BASE + Math.min(ARMY_MAX_BONUS, (minds | 0) * ARMY_PER_MIND);
export const guardsFor = minds => 2 + Math.min(2, minds | 0);                         // every base: 2 guards, +1 per Mind (max 4)
export const TOWER = { range: 5 * T, dmg: 26, every: 10 };
export const TRAP_DMG = 45, WALL_COST = 9, COVER_COST = 3;
export const SPELLS = {
  rage: { name: 'Rage', icon: '😤', desc: '+60% damage for 6 s', radius: 3 * T, ticks: 60, mult: 1.6 },
  heal: { name: 'Heal', icon: '💚', desc: '+90 HP to your troops nearby', radius: 3 * T, amount: 90 },
  bolt: { name: 'Bolt', icon: '⚡', desc: '160 damage to a building', radius: 1.6 * T, dmg: 160 },
};
export const DROP_GAP = 3;                                                     // drop at least 3 tiles away from any building
export const DEFAULT_ARMY = { brawler: 4, archer: 3, bomber: 1, giant: 0 };

const kx = k => k % TW, ky = k => (k / TW) | 0;
const cxOf = k => kx(k) * T + T / 2, cyOf = k => ky(k) * T + T / 2;

// an army is valid if it fits the camp: { brawler: n, archer: n, bomber: n, giant: n }
export function cleanArmy(a, cap) {
  const out = {};
  let used = 0;
  for (const [k, d] of Object.entries(TROOPS)) {
    const n = Math.max(0, Math.min(20, (a?.[k] | 0)));
    const fit = Math.min(n, Math.floor((cap - used) / d.cost));
    out[k] = fit; used += fit * d.cost;
  }
  return out;
}
export const armyUsed = a => Object.entries(TROOPS).reduce((s, [k, d]) => s + (a[k] || 0) * d.cost, 0);

// what a raider sees of the defender: island shape + cleared tiles + buildings + guards
export function snapshotOf(seed, st, guards = 2, extra = {}) {
  const tiles = {};
  for (const [k, t] of Object.entries(st.tiles)) tiles[k] = t.c ? { s: t.s, c: t.c } : { s: t.s };
  return { seed, tiles, b: (st.b || []).filter(b => !b.done || b.uplv).map(b => ({ id: b.id, type: b.type, k: b.k, lv: b.lv || 1 })), guards: Math.max(2, Math.min(4, guards | 0)), ...extra };
}

// army: { troops: {...}, hero: 'hero' | 'captain' }
export function createRaid(snap, army = {}) {
  const w = gen(snap.seed), st = { tiles: snap.tiles, b: snap.b };
  const S = { tick: 0, over: false, w, snap, structs: [], traps: [], units: [], fx: [], spellsUsed: {}, left: { ...DEFAULT_ARMY, ...(army.troops || {}) }, heroKind: army.hero === 'hero' ? 'hero' : 'captain', heroOut: false, cried: false, anyDrop: false };
  // the home always comes first (stars count it); older snapshots have it at the generated spot
  const homeB = snap.b.find(b => b.type === 'home');
  const home = [];
  if (homeB) home.push(...footprint(homeB));
  else for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) home.push((w.house.y + y) * TW + w.house.x + x);
  S.structs.push(mkStruct('home', home, Math.round(HOME_HP * hpMult(homeB?.lv))));
  S.decos = [];
  for (const b of snap.b) {
    if (b.type === 'home' || !BUILD[b.type]) continue;
    if (b.type === 'trap') { S.traps.push({ k: b.k, armed: true }); continue; }
    if (BUILD[b.type].deco) { S.decos.push(b); continue; }   // decorations: just scenery in a raid
    const sb = mkStruct(b.type, footprint(b), Math.round(BUILD[b.type].hp * hpMult(b.lv)), b.id); sb.lv = b.lv || 1; S.structs.push(sb);
  }
  S.occ = new Int16Array(TW * TH).fill(-1);
  S.structs.forEach((s, i) => s.tiles.forEach(t => { S.occ[t] = i; }));
  S.cost = new Uint8Array(TW * TH);
  const decoTiles = new Set(S.decos.flatMap(b => footprint(b)));
  const paths = new Set(w.path);
  for (let k = 0; k < TW * TH; k++) {
    if (!w.land[k]) continue;
    if (w.cover[k] === COVER.FIXED && S.occ[k] < 0 && !paths.has(k)) continue;
    if (decoTiles.has(k)) continue;                     // the well, statues, benches… are in the way
    const c = coverAt(st, w, k);
    S.cost[k] = c === COVER.FIXED && S.occ[k] < 0 && !paths.has(k) ? 1 : c >= COVER.BUSH && c <= COVER.TREE ? COVER_COST : 1;
  }
  const hs = S.structs[0], door = { x: hs.cx, y: hs.y1 + 9 };
  for (let i = 0; i < snap.guards; i++) S.units.push(mkUnit('guard', GUARD, door.x + (i - (snap.guards - 1) / 2) * 12, door.y + 6, i));
  return S;
}
function mkStruct(type, tiles, hp, id = 0) {
  const xs = tiles.map(kx), ys = tiles.map(ky);
  const x0 = Math.min(...xs) * T, x1 = (Math.max(...xs) + 1) * T, y0 = Math.min(...ys) * T, y1 = (Math.max(...ys) + 1) * T;
  return { type, id, tiles, hp, max: hp, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cd: 0, dead: false, hit: 0 };
}
let uid = 0;
function mkUnit(kind, d, x, y, slot) {
  return { kind, id: ++uid, slot, x, y, hp: d.hp, max: d.hp, d, path: null, target: -1, rage: 0, cd: 0, hit: 0, dead: false, repath: 0, home: { x, y }, face: 1, act: 'idle', swing: 0 };
}

export function dropOk(S, k) {
  if (k < 0 || k >= TW * TH || !S.w.land[k] || !S.cost[k] || S.occ[k] >= 0) return false;
  const x = kx(k), y = ky(k);
  for (const s of S.structs) {
    if (s.dead) continue;
    for (const t of s.tiles) if (Math.max(Math.abs(kx(t) - x), Math.abs(ky(t) - y)) < DROP_GAP) return false;
  }
  return true;
}

// inputs: { t, drop: troop | 'hero', k } · { t, spell, k } · { t, cry: 1 }. Returns an error string or null.
export function input(S, a) {
  if (S.over) return 'the raid is over';
  if (a.cry) {
    const h = S.units.find(u => u.kind === 'hero' && !u.dead);
    if (!h || S.cried) return 'no Battle Cry left';
    S.cried = true;
    S.fx.push({ e: 'cry', x: h.x, y: h.y });
    for (const u of S.units) if (isMine(u) && !u.dead && Math.hypot(u.x - h.x, u.y - h.y) <= CRY.radius) { u.rage = Math.max(u.rage, CRY.ticks); u.cryMult = CRY.mult; u.hp = Math.min(u.max, u.hp + CRY.heal); }
    return null;
  }
  if (a.drop != null) {
    if (S.tick > DROP_UNTIL) return 'too late to send troops';
    const k = a.k | 0;
    if (!dropOk(S, k)) return 'drop troops on open land, away from buildings (not in the red)';
    let u;
    if (a.drop === 'hero') {
      if (S.heroOut) return 'your hero is already out';
      S.heroOut = true;
      u = mkUnit(S.heroKind, HERO[S.heroKind], cxOf(k), cyOf(k), 0);
    } else {
      const d = TROOPS[a.drop];
      if (!d) return 'unknown troop';
      if (!(S.left[a.drop] > 0)) return `no ${d.name}s left`;
      S.left[a.drop]--;
      u = mkUnit(a.drop, d, cxOf(k) + ((S.tick * 7) % 5) - 2, cyOf(k) + ((S.tick * 3) % 5) - 2, 0);
    }
    S.anyDrop = true;
    S.units.push(u);
    S.fx.push({ e: 'drop', x: u.x, y: u.y, kind: u.kind });
    return null;
  }
  const sp = SPELLS[a.spell];
  if (!sp) return 'unknown action';
  if (S.spellsUsed[a.spell]) return 'spell already used';
  if (!S.anyDrop) return 'send some troops first';
  const k = a.k | 0;
  if (k < 0 || k >= TW * TH) return 'bad spot';
  S.spellsUsed[a.spell] = true;
  const x = cxOf(k), y = cyOf(k);
  S.fx.push({ e: 'spell', id: a.spell, x, y });
  const near = (u, r) => Math.hypot(u.x - x, u.y - y) <= r;
  if (a.spell === 'rage') for (const u of S.units) { if (isMine(u) && !u.dead && near(u, sp.radius)) { u.rage = sp.ticks; u.cryMult = sp.mult; } }
  if (a.spell === 'heal') for (const u of S.units) { if (isMine(u) && !u.dead && near(u, sp.radius)) u.hp = Math.min(u.max, u.hp + sp.amount); }
  if (a.spell === 'bolt') {
    let best = null, bd = 1e9;
    for (const s of S.structs) { if (s.dead) continue; const d = distRect(s, x, y); if (d <= sp.radius && d < bd) { bd = d; best = s; } }
    if (best) damage(S, best, sp.dmg);
  }
  return null;
}
const isMine = u => u.kind !== 'guard';
const distRect = (s, x, y) => Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.y0 - y, 0, y - s.y1));

function damage(S, s, n) {
  if (s.dead || n <= 0) return;
  s.hp -= n; s.hit = 3;
  if (s.hp <= 0) {
    s.hp = 0; s.dead = true;
    s.tiles.forEach(t => { S.occ[t] = -1; });
    S.fx.push({ e: 'boom', x: s.cx, y: s.cy, type: s.type });
  }
}
function hurt(S, u, n, from) {
  if (u.dead) return;
  u.hp -= n; u.hit = 3;
  if (from === 'arrow' || from === 'trap') S.fx.push({ e: 'dmg', x: u.x, y: u.y - 20, n: Math.round(n) });
  if (u.hp <= 0) { u.hp = 0; u.dead = true; S.fx.push({ e: 'ko', x: u.x, y: u.y, kind: u.kind }); }
}

// cheapest path (walls cost more: troops break through them) to a tile from which the unit can hit the target
function pathTo(S, u, si) {
  const s = S.structs[si], reach = u.d.reach, goal = new Uint8Array(TW * TH);
  const r = Math.ceil(reach / T) + 1;
  for (let y = Math.max(0, Math.floor(s.y0 / T) - r); y <= Math.min(TH - 1, Math.floor(s.y1 / T) + r); y++)
    for (let x = Math.max(0, Math.floor(s.x0 / T) - r); x <= Math.min(TW - 1, Math.floor(s.x1 / T) + r); x++)
      if (distRect(s, x * T + 8, y * T + 8) <= reach + 4) goal[y * TW + x] = 1;
  const start = Math.floor(u.y / T) * TW + Math.floor(u.x / T);
  const dist = new Float32Array(TW * TH).fill(1e9), prev = new Int32Array(TW * TH).fill(-1), done = new Uint8Array(TW * TH);
  dist[start] = 0;
  const open = [start];
  let found = -1;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done[c]) continue;
    done[c] = 1;
    if (goal[c] && S.occ[c] < 0) { found = c; break; }
    const cx = kx(c), cy = ky(c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= TW || y >= TH) continue;
      const n = y * TW + x;
      if (!S.cost[n] || done[n]) continue;
      const o = S.occ[n];
      let step = S.cost[n];
      if (o >= 0) { if (S.structs[o].type !== 'wall') continue; step += WALL_COST; }
      if (dist[c] + step < dist[n]) { dist[n] = dist[c] + step; prev[n] = c; open.push(n); }
    }
  }
  if (found < 0) return null;
  const path = [];
  for (let c = found; c !== start && c >= 0; c = prev[c]) path.push(c);
  return path.reverse();
}
function pickTarget(S, u) {
  const aim = u.d.aim;
  let best = -1, bd = 1e9;
  const look = want => S.structs.forEach((s, i) => {
    if (s.dead || !want(s)) return;
    const d = distRect(s, u.x, u.y); if (d < bd) { bd = d; best = i; }
  });
  if (aim === 'wall') look(s => s.type === 'wall');
  if (aim === 'tower') look(s => s.type === 'tower');
  if (best < 0) look(s => s.type !== 'wall');
  return best;
}

export function step(S) {
  if (S.over) return;
  S.tick++;
  const mine = S.units.filter(u => isMine(u) && !u.dead), guards = S.units.filter(u => u.kind === 'guard' && !u.dead);
  for (const u of mine) {
    u.hit = Math.max(0, u.hit - 1); u.rage = Math.max(0, u.rage - 1); u.swing = Math.max(0, u.swing - 1);
    const d = u.d, mult = u.rage ? (u.cryMult || 1.5) : 1, dps = d.dps * mult * TICK;
    // a guard next to you: fight it (bombers just run)
    if (u.kind !== 'bomber') {
      const g = guards.find(gu => Math.hypot(gu.x - u.x, gu.y - u.y) < (d.ranged ? d.reach : d.reach + 6));
      if (g) { hit(S, u, g.x, g.y); hurt(S, g, dps); continue; }
    }
    if (u.target < 0 || S.structs[u.target].dead) { u.target = pickTarget(S, u); u.path = null; }
    if (u.target < 0) { u.act = 'idle'; continue; }
    const s = S.structs[u.target];
    if (distRect(s, u.x, u.y) <= d.reach) {
      if (u.kind === 'bomber') { explode(S, u); continue; }
      hit(S, u, s.cx, s.cy); damage(S, s, dps);
      continue;
    }
    if (!u.path || --u.repath <= 0) { u.path = pathTo(S, u, u.target); u.repath = 30; }
    if (!u.path || !u.path.length) { move(u, s.cx, s.cy, d.speed * TICK); u.act = 'walk'; continue; }
    const next = u.path[0], o = S.occ[next];
    if (o >= 0 && S.structs[o].type === 'wall' && !S.structs[o].dead) {
      const wl = S.structs[o];
      if (distRect(wl, u.x, u.y) <= Math.min(d.reach, 14) + 2) {
        if (u.kind === 'bomber') { explode(S, u); continue; }
        hit(S, u, wl.cx, wl.cy); damage(S, wl, dps); if (wl.dead) u.repath = 0;
        continue;
      }
    }
    move(u, cxOf(next), cyOf(next), d.speed * TICK * (S.cost[next] > 1 ? 0.6 : 1));
    u.act = 'walk';
    if (Math.hypot(u.x - cxOf(next), u.y - cyOf(next)) < 1.5) u.path.shift();
    const here = Math.floor(u.y / T) * TW + Math.floor(u.x / T);
    for (const tr of S.traps) if (tr.armed && tr.k === here) { tr.armed = false; hurt(S, u, TRAP_DMG, 'trap'); S.fx.push({ e: 'trap', x: cxOf(here), y: cyOf(here) }); }
  }
  for (const gu of guards) {
    gu.hit = Math.max(0, gu.hit - 1); gu.swing = Math.max(0, gu.swing - 1);
    let foe = null, fd = 1e9;
    for (const r of mine) { if (r.dead) continue; const d = Math.hypot(r.x - gu.home.x, r.y - gu.home.y); if (d < GUARD.aggro && d < fd) { fd = d; foe = r; } }
    if (foe) {
      if (Math.hypot(foe.x - gu.x, foe.y - gu.y) <= GUARD.reach) { hit(S, gu, foe.x, foe.y); hurt(S, foe, GUARD.dps * TICK); }
      else { move(gu, foe.x, foe.y, GUARD.speed * TICK); gu.act = 'walk'; }
    } else if (Math.hypot(gu.x - gu.home.x, gu.y - gu.home.y) > 2) { move(gu, gu.home.x, gu.home.y, GUARD.speed * TICK); gu.act = 'walk'; }
    else gu.act = 'idle';
  }
  for (const s of S.structs) {
    s.hit = Math.max(0, s.hit - 1);
    if (s.type !== 'tower' || s.dead) continue;
    if (s.cd > 0) { s.cd--; continue; }
    let foe = null, fd = 1e9;
    for (const r of mine) { if (r.dead) continue; const d = Math.hypot(r.x - s.cx, r.y - s.cy); if (d <= TOWER.range && d < fd) { fd = d; foe = r; } }
    if (foe) { hurt(S, foe, TOWER.dmg * (1 + 0.3 * ((s.lv || 1) - 1)), 'arrow'); s.cd = TOWER.every; S.fx.push({ e: 'shot', x: s.cx, y: s.y0 - 14, tx: foe.x, ty: foe.y - 6 }); }
  }
  const alive = S.units.some(u => isMine(u) && !u.dead);
  const waiting = Object.values(S.left).some(n => n > 0) || !S.heroOut;
  const left = S.structs.some(s => !s.dead && s.type !== 'wall');
  if (S.tick >= MAX_TICKS || !left) S.over = true;
  else if (S.anyDrop && !alive && (!waiting || S.tick > DROP_UNTIL)) S.over = true;
  else if (!S.anyDrop && S.tick > DROP_UNTIL) S.over = true;
}
function hit(S, u, tx, ty) {
  u.face = tx < u.x ? -1 : 1; u.act = 'hit';
  if (u.d.ranged && (S.tick + u.id) % 10 === 0) S.fx.push({ e: 'arrow', x: u.x, y: u.y - 10, tx, ty: ty - 6 });
  if (!u.d.ranged && (S.tick + u.id) % 8 === 0) S.fx.push({ e: 'smack', x: (u.x + tx) / 2, y: (u.y + ty) / 2 - 6, kind: u.kind });
}
function explode(S, u) {
  S.fx.push({ e: 'bomb', x: u.x, y: u.y });
  for (const s of S.structs) { if (s.dead) continue; const d = distRect(s, u.x, u.y); if (d <= u.d.radius) damage(S, s, s.type === 'wall' ? u.d.blast : u.d.blast * 0.3); }
  u.hp = 0; u.dead = true;
}
function move(u, tx, ty, sp) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  const k = Math.min(1, sp / d);
  u.x += dx * k; u.y += dy * k;
  if (Math.abs(dx) > 0.3) u.face = dx < 0 ? -1 : 1;
}

export function score(S) {
  const counted = S.structs.filter(s => s.type !== 'wall');
  const down = counted.filter(s => s.dead).length, pct = counted.length ? down / counted.length : 0;
  const home = S.structs[0].dead;
  const stars = (pct >= 0.5 ? 1 : 0) + (home ? 1 : 0) + (pct >= 1 ? 1 : 0);
  return { pct, stars, home, down, total: counted.length };
}

export function replay(snap, army, inputs) {
  const S = createRaid(snap, army);
  const list = [...inputs].slice(0, 60).sort((a, b) => a.t - b.t);
  let i = 0;
  while (!S.over) {
    while (i < list.length && list[i].t <= S.tick) { input(S, list[i]); i++; }
    step(S); S.fx.length = 0;
  }
  return { S, ...score(S) };
}

// loot: share of the defender's unprotected Dust (barns keep some safe), capped
export const LOOT_SHARE = 0.25, LOOT_MAX = 2000, BARN_SAFE = 1000, SHIELD_MS = 8 * 3600e3;
export function lootOf(dust, barns, pct, share = LOOT_SHARE) {
  const open = Math.max(0, dust - barns * BARN_SAFE);
  return Math.min(LOOT_MAX, Math.floor(open * share * pct));
}
// raids per day: 6 for everyone, +1 per Mind owned (max +3)
export const raidsPerDay = minds => 6 + Math.min(3, minds | 0);
export const RAID_FEE_PER_SPACE = 5;                                   // supplies: 5 Dust per camp space you bring
export const raidFee = troops => RAID_FEE_PER_SPACE * armyUsed(troops || {});

// ---------- villages run by the game, shown like any other player's island ----------
const NAME_A = ['luna', 'kai', 'mika', 'theo', 'nova', 'riko', 'jules', 'ash', 'noah', 'yuki', 'zane', 'ivy', 'leo', 'sora', 'max', 'mila', 'ren', 'eli', 'aria', 'finn', 'jade', 'omar', 'lia', 'dex', 'nico', 'bea', 'kenji', 'sam', 'tara', 'axel', 'remy', 'cleo', 'hugo', 'pia', 'ezra', 'mara', 'arlo', 'nia', 'otto', 'vera'];
const NAME_B = ['wolf', 'byte', 'fox', 'storm', 'pixel', 'frost', 'moon', 'blaze', 'mint', 'crow', 'bean', 'rush', 'leaf', 'spark', 'stone', 'tide', 'ghost', 'drift', 'echo', 'onyx', 'peach', 'rune', 'sage', 'volt'];
const STYLE = [
  (a, b, n) => `${a}${n % 100}`, (a, b) => `${cap(a)}${cap(b)}`, (a, b, n) => `${a}_${b}`, (a, b, n) => `x${cap(a)}x`,
  (a, b, n) => `${cap(a)}`, (a, b, n) => `${b}${a}${n % 10}`, (a, b, n) => `the${cap(b)}`, (a, b, n) => `${a}.${b}`,
  (a, b, n) => `${cap(a)}${n % 1000}`, (a, b, n) => `${a}${a.slice(-1)}${a.slice(-1)}`, (a, b, n) => `${cap(b)}_${n % 100}`, (a, b, n) => `${a}plays`,
];
const cap = s => s[0].toUpperCase() + s.slice(1);
export function villageName(seed) {
  const r = i => hash(seed, i, 911);
  return STYLE[(r(1) * STYLE.length) | 0](NAME_A[(r(2) * NAME_A.length) | 0], NAME_B[(r(3) * NAME_B.length) | 0], (r(4) * 9999) | 0);
}
// level 1-3: how well defended. Layouts vary (ring of walls, inner keep, open farm with traps, scattered).
export function botVillage(seed, level = 1) {
  const w = gen(seed), st = newIsland(seed, 0), r = i => hash(seed, i, 313);
  st.dust = 1e6; st.inv = { wood: 1e4, stone: 1e4, seed_bean: 99, seed_carrot: 99, seed_melon: 99 };
  const hx = w.house.x + 1, hy = w.house.y + 1;
  const yard = 9 + level + r(1) * 3;
  for (let k = 0; k < TW * TH; k++) if (w.land[k] && w.cover[k] !== COVER.FIXED && Math.hypot(kx(k) - hx, (ky(k) - hy) * 1.15) < yard + hash(k, seed, 5) * 2) st.tiles[k] = { s: 'c', t: 0 };
  const ctx = { seed, now: 0, minds: 4, instant: true };   // a finished village (no building timers)
  const layout = ['ring', 'keep', 'farm', 'scatter'][(r(2) * 4) | 0];
  const place = (type, ring, n, spin = 0) => {
    for (let a = 0, placed = 0; a < 80 && placed < n; a++) {
      const ang = (a * 2.39996 + spin) % (Math.PI * 2), rr = ring + (a % 3) * 0.7, x = Math.round(hx + Math.cos(ang) * rr), y = Math.round(hy + Math.sin(ang) * rr * 0.85);
      const k = y * TW + x;
      if (fits(st, w, type, k) && !act(st, BUILD[type].w > 1 ? { type: 'build', item: type, k } : { type: 'build', item: type, tiles: [k] }, ctx).error) placed++;
    }
  };
  const spin = r(3) * 6;
  // a few farm plots with crops so it looks lived in
  const plots = [];
  for (let k = 0; k < TW * TH && plots.length < 6 + level * 3; k++) {
    const d = Math.hypot(kx(k) - hx - 6, (ky(k) - hy + 1) * 1.2);
    if (d < 3.2 && st.tiles[k]?.s === 'c') plots.push(k);
  }
  for (const k of plots) st.tiles[k] = { s: 'p', t: 0, c: ['bean', 'carrot', 'melon'][(hash(k, seed, 2) * 3) | 0], p: 0 };
  place('barn', 4.5, level >= 2 ? 2 : 1, spin); place('mill', 5, 1, spin + 1); place('house', 6, 1 + level, spin + 2);
  const towers = layout === 'farm' ? level : 1 + level;
  place('tower', layout === 'scatter' ? 6 : 3.5, towers, spin + 3);
  const wallsAt = (ring, n) => {
    const tiles = [];
    for (let i = 0; i < 120; i++) { const ang = i / 120 * Math.PI * 2, k = Math.round(hy + Math.sin(ang) * ring * 0.8) * TW + Math.round(hx + Math.cos(ang) * ring); if (!tiles.includes(k)) tiles.push(k); }
    // leave a gap or two (people rarely finish their walls)
    const gap = (r(7) * tiles.length) | 0;
    act(st, { type: 'build', item: 'wall', tiles: tiles.filter((_, i) => level >= 3 || Math.abs(i - gap) > 1).slice(0, n) }, ctx);
  };
  if (layout === 'ring') wallsAt(8 + (level > 2 ? 1 : 0), 80);
  else if (layout === 'keep') wallsAt(4.6, 40 + level * 10);
  else if (layout === 'scatter') wallsAt(7, 20 + level * 15);
  place('trap', layout === 'farm' ? 4 : 7, (layout === 'farm' ? 4 : 2) + level, spin + 4);
  const guardIds = [1, 2, 3, 4].map(i => 1 + ((hash(seed, i, 77) * 3333) | 0));
  return snapshotOf(seed, st, guardsFor(Math.round(r(8) * level)), { guardIds, name: villageName(seed), level, layout, dust: Math.round(700 + level * 600 + r(9) * 900) });
}
