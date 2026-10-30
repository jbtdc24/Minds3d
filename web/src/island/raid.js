// Island raids: a pure, deterministic battle simulation (no DOM, no Math.random, no Date).
// The browser runs it live while you play; the server runs the very same code on the recorded inputs
// (which Mind dropped where and when, which spell where and when) to get the real result.
//
// Raiders (your Minds) walk to the nearest building and smash it, breaking walls that block the way.
// Watchtowers shoot them, hidden spike traps hurt them, the defender's guard Minds fight them.
import { gen, COVER, T, TW, TH } from './gen.js';
import { BUILD, HOME_HP, footprint, coverAt, newIsland, act, fits } from './rules.js';

export const TICK = 0.1, MAX_TICKS = 900, DROP_UNTIL = 600;                 // 10 ticks a second, 90 s raid
export const MAX_RAIDERS = 3;                                               // everyone gets 3 raiders (more Minds = more looks, not more power)
export const UNIT = {
  raider: { hp: 230, dps: 26, speed: 28, reach: 14 },
  guard: { hp: 170, dps: 14, speed: 30, reach: 12, aggro: 6 * T, leash: 9 * T },
};
export const TOWER = { range: 4.5 * T, dmg: 11, every: 10 };
export const TRAP_DMG = 35, WALL_COST = 9, COVER_COST = 3;
export const SPELLS = {
  rage: { name: 'Rage', icon: '😤', desc: '+60% damage for 6 s', radius: 3 * T, ticks: 60, mult: 1.6 },
  heal: { name: 'Heal', icon: '💚', desc: '+70 HP to raiders nearby', radius: 3 * T, amount: 70 },
  bolt: { name: 'Bolt', icon: '⚡', desc: '120 damage to a building', radius: 1.6 * T, dmg: 120 },
};
export const DROP_GAP = 3;                                                     // drop at least 3 tiles away from any building

const kx = k => k % TW, ky = k => (k / TW) | 0;
const cxOf = k => kx(k) * T + T / 2, cyOf = k => ky(k) * T + T / 2;

// what a raider sees of the defender: island shape + cleared tiles + buildings + how many guards
export function snapshotOf(seed, st, guards = 1, extra = {}) {
  const tiles = {};
  for (const [k, t] of Object.entries(st.tiles)) if (t.s !== 'p' || true) tiles[k] = { s: t.s };
  return { seed, tiles, b: (st.b || []).map(b => ({ id: b.id, type: b.type, k: b.k })), guards: Math.max(1, Math.min(4, guards | 0)), ...extra };
}

export function createRaid(snap, raiders) {
  const w = gen(snap.seed), st = { tiles: snap.tiles, b: snap.b };
  const S = { tick: 0, over: false, w, snap, structs: [], traps: [], units: [], fx: [], spellsUsed: {}, dropped: [], n: Math.max(1, Math.min(MAX_RAIDERS, raiders | 0)) };
  // the defender's home (3×3 fixed house) is a building too
  const home = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) home.push((w.house.y + y) * TW + w.house.x + x);
  S.structs.push(mkStruct(S, 'home', home, HOME_HP));
  for (const b of snap.b) {
    if (b.type === 'trap') { S.traps.push({ k: b.k, armed: true }); continue; }
    S.structs.push(mkStruct(S, b.type, footprint(b), BUILD[b.type].hp, b.id));
  }
  // blocked tiles: water, the well, natural cover is slow; structures fill the occupancy grid
  S.occ = new Int16Array(TW * TH).fill(-1);
  S.structs.forEach((s, i) => s.tiles.forEach(t => { S.occ[t] = i; }));
  S.cost = new Uint8Array(TW * TH);
  for (let k = 0; k < TW * TH; k++) {
    if (!w.land[k]) { S.cost[k] = 0; continue; }
    if (w.cover[k] === COVER.FIXED && S.occ[k] < 0 && !w.path.includes(k)) { S.cost[k] = 0; continue; }   // the well
    const c = coverAt(st, w, k);
    S.cost[k] = c >= COVER.WEEDS && c <= COVER.TREE ? (c === COVER.WEEDS ? 1 : COVER_COST) : 1;
  }
  // guards stand at the house door
  const door = { x: (w.house.x + 1.5) * T, y: (w.house.y + 3.6) * T };
  for (let i = 0; i < snap.guards; i++) S.units.push(mkUnit('guard', door.x + (i - (snap.guards - 1) / 2) * 12, door.y + 6, i));
  return S;
}
function mkStruct(S, type, tiles, hp, id = 0) {
  const xs = tiles.map(kx), ys = tiles.map(ky);
  const x0 = Math.min(...xs) * T, x1 = (Math.max(...xs) + 1) * T, y0 = Math.min(...ys) * T, y1 = (Math.max(...ys) + 1) * T;
  return { type, id, tiles, hp, max: hp, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cd: 0, dead: false };
}
function mkUnit(kind, x, y, slot) {
  const u = UNIT[kind];
  return { kind, slot, x, y, hp: u.hp, max: u.hp, path: null, target: -1, wall: -1, foe: -1, rage: 0, cd: 0, hit: 0, dead: false, repath: 0, home: { x, y }, face: 1 };
}

// can a raider be dropped here? (land, walkable, not near buildings)
export function dropOk(S, k) {
  if (k < 0 || k >= TW * TH || !S.w.land[k] || !S.cost[k] || S.occ[k] >= 0) return false;
  const x = kx(k), y = ky(k);
  for (const s of S.structs) {
    if (s.dead) continue;
    for (const t of s.tiles) if (Math.max(Math.abs(kx(t) - x), Math.abs(ky(t) - y)) < DROP_GAP) return false;
  }
  return true;
}

// inputs: { t, drop: slot, k } or { t, spell: id, k }. Returns an error string or null.
export function input(S, a) {
  if (S.over) return 'the raid is over';
  if (a.drop != null) {
    const slot = a.drop | 0;
    if (slot < 0 || slot >= S.n || S.dropped.includes(slot)) return 'that Mind is already out';
    if (S.tick > DROP_UNTIL) return 'too late to send Minds';
    if (!dropOk(S, a.k | 0)) return 'drop Minds on open land, away from buildings';
    S.dropped.push(slot);
    const u = mkUnit('raider', cxOf(a.k), cyOf(a.k), slot);
    S.units.push(u);
    S.fx.push({ e: 'drop', x: u.x, y: u.y });
    return null;
  }
  const sp = SPELLS[a.spell];
  if (!sp) return 'unknown spell';
  if (S.spellsUsed[a.spell]) return 'spell already used';
  if (!S.dropped.length) return 'send a Mind first';
  const k = a.k | 0;
  if (k < 0 || k >= TW * TH) return 'bad spot';
  S.spellsUsed[a.spell] = true;
  const x = cxOf(k), y = cyOf(k);
  S.fx.push({ e: 'spell', id: a.spell, x, y });
  const near = (u, r) => Math.hypot(u.x - x, u.y - y) <= r;
  if (a.spell === 'rage') for (const u of S.units) { if (u.kind === 'raider' && !u.dead && near(u, sp.radius)) u.rage = sp.ticks; }
  if (a.spell === 'heal') for (const u of S.units) { if (u.kind === 'raider' && !u.dead && near(u, sp.radius)) u.hp = Math.min(u.max, u.hp + sp.amount); }
  if (a.spell === 'bolt') {
    let best = null, bd = 1e9;
    for (const s of S.structs) { if (s.dead) continue; const d = distRect(s, x, y); if (d <= sp.radius && d < bd) { bd = d; best = s; } }
    if (best) damage(S, best, sp.dmg);
  }
  return null;
}
const distRect = (s, x, y) => Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.y0 - y, 0, y - s.y1));

function damage(S, s, n) {
  if (s.dead) return;
  s.hp -= n; s.hit = 3;
  if (s.hp <= 0) {
    s.hp = 0; s.dead = true;
    s.tiles.forEach(t => { S.occ[t] = -1; });
    S.fx.push({ e: 'boom', x: s.cx, y: s.cy, type: s.type });
  }
}
function hurt(S, u, n) {
  if (u.dead) return;
  u.hp -= n; u.hit = 3;
  if (u.hp <= 0) { u.hp = 0; u.dead = true; S.fx.push({ e: 'ko', x: u.x, y: u.y, kind: u.kind }); }
}

// cheapest path (walls cost more: raiders break through them) to any tile next to the target building
function pathTo(S, u, si) {
  const s = S.structs[si], goal = new Uint8Array(TW * TH);
  for (const t of s.tiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const x = kx(t) + dx, y = ky(t) + dy;
    if (x >= 0 && y >= 0 && x < TW && y < TH) goal[y * TW + x] = 1;
  }
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
  let best = -1, bd = 1e9;
  S.structs.forEach((s, i) => { if (s.dead || s.type === 'wall') return; const d = distRect(s, u.x, u.y); if (d < bd) { bd = d; best = i; } });
  return best;
}

export function step(S) {
  if (S.over) return;
  S.tick++;
  const raiders = S.units.filter(u => u.kind === 'raider' && !u.dead), guards = S.units.filter(u => u.kind === 'guard' && !u.dead);
  // raiders
  for (const u of raiders) {
    u.hit = Math.max(0, u.hit - 1); u.rage = Math.max(0, u.rage - 1);
    const dps = UNIT.raider.dps * (u.rage ? SPELLS.rage.mult : 1) * TICK;
    // a guard right next to you: fight it
    const g = guards.find(gu => Math.hypot(gu.x - u.x, gu.y - u.y) < UNIT.raider.reach + 6);
    if (g) { hurt(S, g, dps); u.face = g.x < u.x ? -1 : 1; u.act = 'hit'; continue; }
    if (u.target < 0 || S.structs[u.target].dead) { u.target = pickTarget(S, u); u.path = null; }
    if (u.target < 0) { u.act = 'idle'; continue; }
    const s = S.structs[u.target];
    if (distRect(s, u.x, u.y) <= UNIT.raider.reach) { damage(S, s, dps); u.face = s.cx < u.x ? -1 : 1; u.act = 'hit'; continue; }
    if (!u.path || --u.repath <= 0) { u.path = pathTo(S, u, u.target); u.repath = 30; }
    if (!u.path || !u.path.length) { move(u, s.cx, s.cy, UNIT.raider.speed * TICK); u.act = 'walk'; continue; }   // last steps: straight to it
    const next = u.path[0], o = S.occ[next];
    if (o >= 0 && S.structs[o].type === 'wall' && !S.structs[o].dead) {
      const wl = S.structs[o];
      if (distRect(wl, u.x, u.y) <= UNIT.raider.reach) { damage(S, wl, dps); u.face = wl.cx < u.x ? -1 : 1; u.act = 'hit'; if (wl.dead) u.repath = 0; continue; }
    }
    move(u, cxOf(next), cyOf(next), UNIT.raider.speed * TICK * (S.cost[next] > 1 ? 0.6 : 1));
    u.act = 'walk';
    if (Math.hypot(u.x - cxOf(next), u.y - cyOf(next)) < 1.5) u.path.shift();
    // traps
    const here = Math.floor(u.y / T) * TW + Math.floor(u.x / T);
    for (const tr of S.traps) if (tr.armed && tr.k === here) { tr.armed = false; hurt(S, u, TRAP_DMG); S.fx.push({ e: 'trap', x: cxOf(here), y: cyOf(here) }); }
  }
  // guards: chase raiders near their post, otherwise walk back
  for (const gu of guards) {
    gu.hit = Math.max(0, gu.hit - 1);
    let foe = null, fd = 1e9;
    for (const r of raiders) { if (r.dead) continue; const d = Math.hypot(r.x - gu.home.x, r.y - gu.home.y); if (d < UNIT.guard.aggro && d < fd) { fd = d; foe = r; } }
    if (foe) {
      const d = Math.hypot(foe.x - gu.x, foe.y - gu.y);
      if (d <= UNIT.guard.reach) { hurt(S, foe, UNIT.guard.dps * TICK); gu.face = foe.x < gu.x ? -1 : 1; gu.act = 'hit'; }
      else { move(gu, foe.x, foe.y, UNIT.guard.speed * TICK); gu.act = 'walk'; }
    } else if (Math.hypot(gu.x - gu.home.x, gu.y - gu.home.y) > 2) { move(gu, gu.home.x, gu.home.y, UNIT.guard.speed * TICK); gu.act = 'walk'; }
    else gu.act = 'idle';
  }
  // towers
  for (const s of S.structs) {
    s.hit = Math.max(0, (s.hit || 0) - 1);
    if (s.type !== 'tower' || s.dead) continue;
    if (s.cd > 0) { s.cd--; continue; }
    let foe = null, fd = 1e9;
    for (const r of raiders) { if (r.dead) continue; const d = Math.hypot(r.x - s.cx, r.y - s.cy); if (d <= TOWER.range && d < fd) { fd = d; foe = r; } }
    if (foe) { hurt(S, foe, TOWER.dmg); s.cd = TOWER.every; S.fx.push({ e: 'shot', x: s.cx, y: s.y0 - 14, tx: foe.x, ty: foe.y - 6 }); }
  }
  const alive = S.units.some(u => u.kind === 'raider' && !u.dead);
  const allOut = S.dropped.length >= S.n || S.tick > DROP_UNTIL;
  const left = S.structs.some(s => !s.dead && s.type !== 'wall');
  if (S.tick >= MAX_TICKS || !left || (allOut && !alive && S.dropped.length)) S.over = true;
  if (S.tick > DROP_UNTIL && !S.dropped.length) S.over = true;
}
function move(u, tx, ty, sp) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  const k = Math.min(1, sp / d);
  u.x += dx * k; u.y += dy * k;
  if (Math.abs(dx) > 0.3) u.face = dx < 0 ? -1 : 1;
}

// how it went: destroyed share (walls don't count), stars
export function score(S) {
  const counted = S.structs.filter(s => s.type !== 'wall');
  const down = counted.filter(s => s.dead).length, pct = counted.length ? down / counted.length : 0;
  const home = S.structs[0].dead;
  const stars = (pct >= 0.5 ? 1 : 0) + (home ? 1 : 0) + (pct >= 1 ? 1 : 0);
  return { pct, stars, home, down, total: counted.length };
}

// run a whole raid from recorded inputs (the server does this)
export function replay(snap, raiders, inputs) {
  const S = createRaid(snap, raiders);
  const list = [...inputs].slice(0, 12).sort((a, b) => a.t - b.t);
  let i = 0;
  while (!S.over) {
    while (i < list.length && list[i].t <= S.tick) { input(S, list[i]); i++; }
    step(S); S.fx.length = 0;
  }
  return { S, ...score(S) };
}

// loot: share of the defender's unprotected Dust (barns keep some safe), capped
export const LOOT_SHARE = 0.25, LOOT_MAX = 2000, BARN_SAFE = 1000, SHIELD_MS = 8 * 3600e3;
export function lootOf(dust, barns, pct) {
  const open = Math.max(0, dust - barns * BARN_SAFE);
  return Math.min(LOOT_MAX, Math.floor(open * LOOT_SHARE * pct));
}

// a practice village for people with nobody to raid (and for guests): cleared yard, walls around the house, towers
export function botVillage(seed, level = 1) {
  const w = gen(seed), st = newIsland(seed, 0);
  st.dust = 1e6; st.inv = { wood: 1e4, stone: 1e4 };
  const hx = w.house.x + 1, hy = w.house.y + 1;
  for (let k = 0; k < TW * TH; k++) if (w.land[k] && w.cover[k] !== COVER.FIXED && Math.hypot(kx(k) - hx, (ky(k) - hy) * 1.15) < 11) st.tiles[k] = { s: 'c', t: 0 };
  const ctx = { seed, now: 0, minds: 4 };
  const place = (type, ring, n) => {
    for (let a = 0, placed = 0; a < 64 && placed < n; a++) {
      const ang = (a * 2.39996) % (Math.PI * 2), x = Math.round(hx + Math.cos(ang) * ring), y = Math.round(hy + Math.sin(ang) * ring * 0.85);
      const k = y * TW + x;
      if (fits(st, w, type, k) && !act(st, BUILD[type].w > 1 ? { type: 'build', item: type, k } : { type: 'build', item: type, tiles: [k] }, ctx).error) placed++;
    }
  };
  place('barn', 4.5, 1); place('mill', 5, 1); place('house', 6, 1 + level);
  place('tower', 3.5, 1 + level);
  // a wall ring
  const ring = 8, wallTiles = [];
  for (let i = 0; i < 90; i++) { const ang = i / 90 * Math.PI * 2, k = Math.round(hy + Math.sin(ang) * ring * 0.8) * TW + Math.round(hx + Math.cos(ang) * ring); if (!wallTiles.includes(k)) wallTiles.push(k); }
  act(st, { type: 'build', item: 'wall', tiles: wallTiles.slice(0, 80) }, ctx);
  place('trap', 7, 2 + level);
  return snapshotOf(seed, st, 1 + level, { bot: true, name: ['Sleepy Hollow', 'Bandit Camp', 'Stone Keep'][level - 1] || 'Bandit Camp' });
}
