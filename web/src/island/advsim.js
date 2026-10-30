// The adventure simulation. The browser runs it live while you play and records what you tapped; the server runs the very
// same code on those taps to get the real result, so kills, damage, potions and loot can never be claimed, only earned.
import { TW, TH, T, COVER, gen } from './gen.js';
import { walkable, HEROES, MONSTERS, NODES, ADV_TIME, POTION_HEAL } from './adventure.js';

export const STEP = 0.05, MAX_ADV_TICKS = Math.round(ADV_TIME / STEP), MAX_ADV_INPUTS = 1500;
export const CUT = { [COVER.WEEDS]: 'weeds', [COVER.BUSH]: 'bush', [COVER.ROCK]: 'rock', [COVER.TREE]: 'tree' };
const kx = k => k % TW, ky = k => (k / TW) | 0, cxOf = k => kx(k) * T + 8, cyOf = k => ky(k) * T + 12;
export const tileOf = (x, y) => Math.floor(y / T) * TW + Math.floor(x / T);

export function createAdv(map, { heroKind, potions = 0, gatherLeft = 40, seed }) {
  const H = HEROES[heroKind] || HEROES.captain, s = map.start;
  return {
    tick: 0, time: ADV_TIME, over: false, ko: false, heroKind, w: gen(seed), level: map.level, rng: (seed >>> 0) || 1, fx: [],
    got: [], beat: [], cut: new Set(), cover: {}, potions, gatherLeft, maxHp: H.hp,
    hero: { x: cxOf(s), y: cyOf(s), hp: H.hp, path: [], face: 1, cd: 0, buff: 0, hit: 0, act: 'idle', target: null, gather: null, repath: 0, swing: 0, step: 0 },
    nodes: map.nodes.map(n => ({ ...n, x: cxOf(n.k), y: cyOf(n.k), prog: 0, done: false })),
    mons: map.monsters.map(m => ({ ...m, x: cxOf(m.k), y: cyOf(m.k), hx: cxOf(m.k), hy: cyOf(m.k), max: m.hp, wt: 0, wx: cxOf(m.k), wy: cyOf(m.k), face: 1, hit: 0, swing: 0 })),
  };
}
const rand = S => { let x = S.rng; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; S.rng = x; return x / 4294967296; };

// shortest way over walkable tiles
export function pathTo(w, from, to) {
  if (from === to) return [];
  const prev = new Int32Array(TW * TH).fill(-2), q = [from];
  prev[from] = -1;
  let best = from, bd = 1e9;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], d = Math.hypot(kx(c) - kx(to), ky(c) - ky(to));
    if (d < bd) { bd = d; best = c; }
    if (c === to) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = kx(c) + dx, y = ky(c) + dy;
      if (x < 0 || y < 0 || x >= TW || y >= TH) continue;
      const n = y * TW + x;
      if (prev[n] !== -2 || !walkable(w, n)) continue;
      prev[n] = c; q.push(n);
    }
  }
  const out = [];
  for (let c = best; c !== from && c >= 0; c = prev[c]) out.push(c);
  return out.reverse();
}
// one tap. Returns text when the tap cannot be done (the screen may show it); the tap is recorded either way.
export function advInput(S, a) {
  const h = S.hero, here = tileOf(h.x, h.y);
  if (S.over) return 'over';
  if (a.hit != null) {
    const m = S.mons.find(x => x.id === a.hit && !x.dead);
    if (!m) return 'gone';
    h.target = m; h.gather = null; h.path = pathTo(S.w, here, tileOf(m.x, m.y));
  } else if (a.node != null) {
    const n = S.nodes.find(x => x.id === a.node && !x.done);
    if (!n) return 'gone';
    h.target = null; h.gather = n; h.path = pathTo(S.w, here, n.k);
    if (h.path.length) h.path.pop();
  } else if (a.cut != null) {
    const k = a.cut, cov = S.w.cover[k];
    h.target = null; h.gather = null;
    if (!(k >= 0 && k < TW * TH) || !S.w.land[k] || !CUT[cov] || S.cut.has(k)) return 'nothing here';
    if (S.gatherLeft <= 0) return 'Gathering limit reached this hour';
    h.gather = { cover: cov, type: CUT[cov], k, x: cxOf(k), y: cyOf(k), prog: 0 };
    h.path = pathTo(S.w, here, k);
    if (h.path.length && h.path[h.path.length - 1] === k) h.path.pop();
  } else if (a.go != null) {
    h.target = null; h.gather = null;
    if (!(a.go >= 0 && a.go < TW * TH)) return 'nowhere';
    h.path = pathTo(S.w, here, a.go);
  } else if (a.ability) {
    const ab = HEROES[S.heroKind].ability;
    if (h.cd > 0) return 'not ready';
    h.cd = ab.cd; h.buff = ab.secs; h.hp = Math.min(S.maxHp, h.hp + ab.heal);
    S.fx.push({ e: 'ability' });
  } else if (a.potion) {
    if (!S.potions || h.hp >= S.maxHp) return 'no';
    S.potions--; h.hp = Math.min(S.maxHp, h.hp + POTION_HEAL);
    S.fx.push({ e: 'potion' });
  }
  return null;
}
function step(S, m, tx, ty, sp) {
  const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
  if (d < 0.5) { m.moving = false; return; }
  const nx = m.x + dx / d * Math.min(sp, d), ny = m.y + dy / d * Math.min(sp, d);
  if (walkable(S.w, tileOf(nx, ny))) { m.x = nx; m.y = ny; } else if (walkable(S.w, tileOf(nx, m.y))) m.x = nx; else if (walkable(S.w, tileOf(m.x, ny))) m.y = ny;
  m.moving = true;
  if (Math.abs(dx) > 0.3) m.face = dx < 0 ? -1 : 1;
}
export function advStep(S) {
  if (S.over) return;
  const dt = STEP, h = S.hero, HD = HEROES[S.heroKind];
  S.tick++; S.time -= dt;
  h.cd = Math.max(0, h.cd - dt); h.buff = Math.max(0, h.buff - dt); h.hit = Math.max(0, h.hit - dt);
  if (h.path.length) {
    const n = h.path[0], tx = cxOf(n), ty = cyOf(n), dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy), sp = HD.speed * dt;
    if (d <= sp) { h.x = tx; h.y = ty; h.path.shift(); } else { h.x += dx / d * sp; h.y += dy / d * sp; }
    if (Math.abs(dx) > 0.5) h.face = dx < 0 ? -1 : 1;
    h.act = 'walk';
    if ((h.step += dt) > 0.42) { h.step = 0; S.fx.push({ e: 'step' }); }
  } else h.act = 'idle';
  const alive = S.mons.filter(m => !m.dead), tgt = h.target && !h.target.dead ? h.target : null;
  const foe = tgt && Math.hypot(tgt.x - h.x, tgt.y - h.y) <= 18 ? tgt : alive.find(m => Math.hypot(m.x - h.x, m.y - h.y) <= 18 && (m.angry || m === tgt || !h.path.length)) || null;
  if (!foe && tgt && (!h.path.length || (h.repath -= dt) <= 0)) { h.path = pathTo(S.w, tileOf(h.x, h.y), tileOf(tgt.x, tgt.y)); h.repath = 0.5; }
  if (foe) {
    h.act = 'hit'; h.face = foe.x < h.x ? -1 : 1; h.path = [];
    foe.hp -= HD.dps * (h.buff ? HD.ability.mult : 1) * dt; foe.hit = 0.12;
    if ((h.swing += dt) > 0.4) { h.swing = 0; S.fx.push({ e: 'swing', foe }); }
    if (foe.hp <= 0) { foe.dead = true; S.beat.push(foe.id); h.target = null; S.fx.push({ e: 'kill', foe }); }
  }
  if (h.gather?.cover != null && !h.path.length) {
    const c = h.gather;
    if (Math.hypot(c.x - h.x, c.y - h.y) > 24) h.gather = null;
    else if ((c.prog += dt / (c.type === 'tree' ? 1.1 : c.type === 'rock' ? 1 : 0.6)) >= 1) {
      S.cut.add(c.k); S.cover[c.type] = (S.cover[c.type] || 0) + 1; S.gatherLeft--; h.gather = null;
      S.fx.push({ e: 'cut', c });
    } else if ((h.swing += dt) > 0.3) { h.swing = 0; S.fx.push({ e: 'chop', c }); }
  } else if (h.gather && !h.path.length) {
    const n = h.gather, guard = S.mons.find(m => m.guards === n.id && !m.dead);
    if (Math.hypot(n.x - h.x, n.y - h.y) > 24) h.gather = null;
    else if (guard) { h.gather = null; h.target = guard; S.fx.push({ e: 'guarded', n }); }
    else if ((n.prog += dt / NODES[n.type].time) >= 1) { n.done = true; S.got.push(n.id); h.gather = null; S.fx.push({ e: 'node', n }); }
    else if ((h.swing += dt) > 0.35) { h.swing = 0; S.fx.push({ e: 'dig', n }); }
  }
  for (const m of alive) {
    if (m.dead) continue;
    const D = MONSTERS[m.type], dh = Math.hypot(h.x - m.x, h.y - m.y);
    m.hit = Math.max(0, m.hit - dt);
    const home = Math.hypot(m.hx - h.x, m.hy - h.y) < D.aggro * T * (m.guards ? 1.1 : 1.6);
    if ((home && dh < D.aggro * T) || m.angry) {
      m.angry = dh < D.aggro * T * 2.2;
      if (dh > Math.min(D.reach, 13)) step(S, m, h.x, h.y, D.speed * dt);
      else {
        h.hp -= D.dps * (1 + (S.level - 1) * 0.3) * dt; h.hit = 0.12; m.face = h.x < m.x ? -1 : 1;
        if ((m.swing += dt) > 0.6) { m.swing = 0; S.fx.push({ e: 'bite', m }); }
      }
      if (!m.roared && m.type !== 'slime') { m.roared = true; S.fx.push({ e: 'roar', m }); }
    } else {
      if ((m.wt -= dt) <= 0) { m.wt = 1.5 + rand(S) * 2.5; m.wx = m.hx + (rand(S) - 0.5) * 3 * T; m.wy = m.hy + (rand(S) - 0.5) * 3 * T; }
      step(S, m, m.wx, m.wy, D.speed * 0.4 * dt);
    }
  }
  if (h.hp <= 0) { S.over = true; S.ko = true; S.fx.push({ e: 'ko' }); }
  else if (S.time <= 0) { S.over = true; S.fx.push({ e: 'time' }); }
}
const INT = v => (Number.isInteger(v) ? v : null);
// keep only well-formed taps, in time order
export const cleanAdvInputs = list => (Array.isArray(list) ? list : []).slice(0, MAX_ADV_INPUTS).map(a => {
  const t = INT(a?.t);
  if (t == null || t < 0) return null;
  for (const key of ['hit', 'node', 'cut', 'go']) if (INT(a[key]) != null) return { t, [key]: a[key] };
  if (a?.ability) return { t, ability: 1 };
  if (a?.potion) return { t, potion: 1 };
  return null;
}).filter(Boolean).sort((a, b) => a.t - b.t);
// the real result of a trip. end: the tick the player pressed Go home (never past the time limit)
export function advReplay(map, opts, inputs, end = MAX_ADV_TICKS) {
  const S = createAdv(map, opts), last = Math.min(end | 0, MAX_ADV_TICKS);
  let i = 0;
  while (!S.over && S.tick < last) {
    while (i < inputs.length && inputs[i].t <= S.tick) advInput(S, inputs[i++]);
    advStep(S); S.fx.length = 0;
  }
  return S;
}
