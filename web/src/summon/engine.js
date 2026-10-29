// Mind Summoners battle engine: pure, deterministic, serialisable (browser, server and simulator).
// Each round: both players secretly summon creatures into their empty lanes (and may use their Hero Skill once
// per match). Then a short live battle plays out: creatures walk down their lane, fight what they meet and hit
// the enemy summoner when they reach the end. Survivors stay where they are for the next round.
// resolve() returns a log entry with instant `events` and a tick-by-tick `timeline` the screen plays back.
import { CARD, BEATS, RULES, HERO_SKILLS, FAMILY } from './cards.js';

export function rand(s) {
  let a = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function checkDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== RULES.deck) return `a deck has exactly ${RULES.deck} cards`;
  const n = {};
  for (const id of deck) {
    if (!CARD[id]) return 'unknown card';
    if ((n[id] = (n[id] || 0) + 1) > RULES.copies) return `max ${RULES.copies} copies of a card`;
  }
  if (deck.filter(id => CARD[id].stage === 3).length > RULES.maxStage3) return `max ${RULES.maxStage3} stage-3 cards`;
  return null;
}
// a creature's battle numbers
export const unitHp = id => CARD[id].power * RULES.hpPerPower + RULES.hpBase;
export const unitStats = id => ({ ...FAMILY[CARD[id].fam] });

// players: [{ name, deck: [cardId x12], skill, el, hp? }]
export function createGame({ seed = 1, players }) {
  const s = { v: 2, rng: seed | 0, turn: 0, over: false, winner: null, log: [], played: [0, 0], uid: 0, p: null };
  s.p = players.map(pl => ({
    name: pl.name, skill: pl.skill || null, el: pl.el || null, hp: pl.hp || RULES.hp, maxHp: pl.hp || RULES.hp, shield: 0, skillUsed: false, fatigue: 0,
    deck: shuffle(s, pl.deck), hand: [], board: Array(RULES.lanes).fill(null), focus: 0,
  }));
  for (const p of s.p) {
    for (let i = 0; i < RULES.hand; i++) draw(s, p);
    // never a dead start: the opening hand always has a creature you can summon on turn 1
    if (!p.hand.some(id => CARD[id].cost <= 1)) {
      const k = p.deck.findLastIndex(id => CARD[id].cost <= 1);
      if (k >= 0) { const hi = p.hand.reduce((m, id, j) => CARD[id].cost > CARD[p.hand[m]].cost ? j : m, 0); [p.hand[hi], p.deck[k]] = [p.deck[k], p.hand[hi]]; }
    }
  }
  startTurn(s);
  return s;
}
function draw(s, p) {
  if (p.deck.length) { p.hand.push(p.deck.pop()); return 0; }
  p.fatigue++; return hit(p, p.fatigue);   // out of cards: you get tired
}
function hit(p, n) {
  const b = Math.min(p.shield, n);
  p.shield -= b; p.hp -= n - b;
  return n - b;
}
const heal = (p, n) => { p.hp = Math.min(p.maxHp, p.hp + n); };
export function startTurn(s) {
  s.turn++;
  s.drew = s.p.map(p => draw(s, p));   // fatigue damage this turn, if any
  for (const p of s.p) p.focus = Math.min(s.turn, RULES.maxFocus);
}
export const focusOf = (s, i, act) => s.p[i].focus + (act?.skill?.id === 'focus' ? 2 : 0);
export const SKILL_TARGET = { rage: 'mine', hex: 'enemy', curse: 'enemy' };

// act: { play: [{ card: handIndex, lane }], skill: { id, lane } | null }
export function validate(s, i, act) {
  if (s.over) return 'game over';
  const p = s.p[i], play = Array.isArray(act?.play) ? act.play : [];
  const usedCards = new Set(), usedLanes = new Set();
  let cost = 0;
  for (const m of play) {
    if (!Number.isInteger(m.card) || m.card < 0 || m.card >= p.hand.length || usedCards.has(m.card)) return 'pick cards from your hand';
    if (!Number.isInteger(m.lane) || m.lane < 0 || m.lane >= RULES.lanes || usedLanes.has(m.lane) || p.board[m.lane]) return 'pick an empty lane';
    usedCards.add(m.card); usedLanes.add(m.lane); cost += CARD[p.hand[m.card]].cost;
  }
  if (act?.skill) {
    if (p.skillUsed || act.skill.id !== p.skill || !HERO_SKILLS[p.skill]) return 'hero skill not available';
    if (SKILL_TARGET[p.skill] && !(Number.isInteger(act.skill.lane) && act.skill.lane >= 0 && act.skill.lane < RULES.lanes)) return 'pick a lane for your hero skill';
  }
  if (cost > focusOf(s, i, act)) return 'not enough focus';
  return null;
}

// countering an element: x1.5 damage, or x1.75 if the creature also shares your Mind's element (affinity)
export const counters = (a, b) => BEATS[CARD[a].el] === CARD[b].el;
const dmgMult = (atk, def, el) => (counters(atk.id, def.id) ? (CARD[atk.id].el === el ? RULES.affinityMult : RULES.counterMult) : 1)
  * (CARD[def.id].guard || def.guard ? RULES.guardMult : CARD[def.id].tough ? RULES.toughMult : 1);
const unitAtk = c => Math.max(0, c.atk + c.temp);
const kill = (p, lane) => { p.board[lane] = null; };
const snapUnit = c => c && { id: c.id, uid: c.uid, hp: c.hp, maxHp: c.maxHp, atk: c.atk, pos: c.pos, grown: c.grown };
const snap = s => s.p.map(p => ({ hp: p.hp, shield: p.shield, board: p.board.map(snapUnit) }));
function newUnit(s, id) {
  const hp = unitHp(id);
  return { id, uid: ++s.uid, hp, maxHp: hp, atk: CARD[id].power, temp: 0, pos: RULES.spawnAt, cd: RULES.firstHit, grown: 0 };
}
const hurt = (c, n) => { c.hp = Math.round((c.hp - n) * 10) / 10; };

// resolve one round; acts = [act0, act1] (already validated)
export function resolve(s, acts) {
  const log = { turn: s.turn, acts: acts.map((a, i) => ({ play: (a.play || []).map(m => ({ id: s.p[i].hand[m.card], lane: m.lane })), skill: a.skill || null })), events: [], before: snap(s) };
  const ev = e => log.events.push({ ...e, hp: s.p.map(p => p.hp), sh: s.p.map(p => p.shield) });
  acts.forEach((a, i) => { if (a.play?.length || a.skill) s.played[i]++; });
  // 1. summon (cards leave the hand); new creatures start at their own end of the lane
  const summoned = [[], []];
  acts.forEach((a, i) => {
    const p = s.p[i], play = [...(a.play || [])].sort((x, y) => y.card - x.card);
    for (const m of play) {
      const id = p.hand[m.card];
      p.hand.splice(m.card, 1);
      p.board[m.lane] = newUnit(s, id);
      summoned[i].push(m.lane);
    }
  });
  ev({ t: 'summon', lanes: summoned, uids: summoned.map((ls, i) => ls.map(l => s.p[i].board[l].uid)) });
  // 2. on-summon effects (both sides at once)
  for (let i = 0; i < 2; i++) {
    const me = s.p[i], foe = s.p[1 - i];
    for (const lane of summoned[i]) {
      const d = CARD[me.board[lane].id];
      if (d.spark && foe.board[lane]) { hurt(foe.board[lane], d.spark * RULES.sparkDmg); ev({ t: 'spark', p: i, lane, n: d.spark * RULES.sparkDmg }); }
      if (d.splash) { for (const c of foe.board) if (c) hurt(c, RULES.splashDmg); ev({ t: 'splash', p: i, lane, n: RULES.splashDmg }); }
      if (d.burn) ev({ t: 'burn', p: i, lane, n: hit(foe, d.burn) });
      if (d.heal) { heal(me, d.heal); ev({ t: 'heal', p: i, lane, n: d.heal }); }
      if (d.shield) { me.shield += d.shield; ev({ t: 'shield', p: i, lane, n: d.shield }); }
      if (d.draw) { const f = draw(s, me); ev({ t: 'draw', p: i, lane, fatigue: f }); }
      if (d.rally) { me.board.forEach((c, l) => { if (c && l !== lane) { c.atk += 1; c.maxHp += 2; c.hp += 2; } }); ev({ t: 'rally', p: i, lane }); }
    }
  }
  // 3. hero skills
  acts.forEach((a, i) => {
    if (!a.skill) return;
    const me = s.p[i], foe = s.p[1 - i], lane = a.skill.lane, id = a.skill.id;
    me.skillUsed = true;
    if (id === 'mend') { heal(me, 10); me.shield += 2; }
    else if (id === 'cry') me.board.forEach(c => { if (c) c.temp += 2; });
    else if (id === 'rage' && me.board[lane]) { me.board[lane].temp += 2; me.board[lane].guard = true; }
    else if (id === 'hex' && foe.board[lane]) foe.board[lane].temp -= 4;
    else if (id === 'bolt') hit(foe, 12);
    else if (id === 'ward') me.shield += 12;
    else if (id === 'curse' && foe.board[lane]) { foe.board[lane].atk = Math.max(0, foe.board[lane].atk - 1); foe.board[lane].temp -= 1; hurt(foe.board[lane], RULES.sparkDmg); }
    ev({ t: 'skill', p: i, id, lane });
  });
  s.p.forEach((p, i) => p.board.forEach((c, l) => { if (c && c.hp <= 0) { kill(p, l); ev({ t: 'fade', p: i, lane: l }); } }));
  // 4. the live battle
  log.timeline = battle(s, log);
  // 5. end of round
  s.p.forEach((p, i) => p.board.forEach((c, l) => {
    if (!c) return;
    c.temp = 0; delete c.guard;
    if (CARD[c.id].grow && c.grown < RULES.growMax) { c.atk++; c.maxHp += RULES.hpPerPower; c.hp += RULES.hpPerPower; c.grown++; ev({ t: 'grow', p: i, lane: l }); }
  }));
  endCheck(s);
  if (!s.over) {
    startTurn(s);
    s.drew.forEach((n, i) => { if (n) ev({ t: 'fatigue', p: i, n }); });
    if (s.p.some(p => p.hp <= 0)) endCheck(s, true);
  }
  log.over = s.over; log.winner = s.winner;
  s.log.push(log);
  if (s.log.length > 2) s.log.splice(0, s.log.length - 2);   // only the latest rounds are kept in the save
  return log;
}

// Creatures walk along their lane (pos 0 = own end, 1 = enemy end). When an enemy is in reach they stop and
// trade hits; at the enemy end they hit the summoner. Hits in the same tick land together (fair for both seats).
// Returns frames: { f: [[uid, side, lane, pos, hp, state]...] every tick, hits: [[tick, attackerUid, targetUid | -1-side, dmg]] }
function battle(s, log) {
  const frames = [], hits = [];
  const units = () => s.p.flatMap((p, side) => p.board.map((c, lane) => c && { c, side, lane })).filter(Boolean);
  const record = tick => frames.push(units().map(({ c, side, lane }) => [c.uid, side, lane, Math.round(c.pos * 1000), Math.round(c.hp * 10), c.state || 0]));
  record(0);
  for (let tick = 1; tick <= RULES.battleTicks && !s.p.some(p => p.hp <= 0); tick++) {
    const dt = RULES.tick, dealt = [];
    for (const { c, side, lane } of units()) {
      const fam = FAMILY[CARD[c.id].fam], foe = s.p[1 - side].board[lane];
      const gap = foe ? (1 - foe.pos) - c.pos : Infinity;
      c.cd = Math.max(0, c.cd - dt);
      if (foe && gap <= fam.range) {
        c.state = 1;
        if (c.cd <= 0) { dealt.push([c, side, foe, unitAtk(c) * dmgMult(c, foe, s.p[side].el)]); c.cd = fam.rate; }
      } else if (c.pos >= RULES.baseAt) {
        c.state = 2;
        if (c.cd <= 0) { dealt.push([c, side, null, unitAtk(c) * RULES.baseMult]); c.cd = fam.rate; }
      } else {
        c.state = 0;
        const next = c.pos + fam.speed * dt;
        c.pos = Math.min(RULES.baseAt, foe ? Math.min(next, 1 - foe.pos - fam.range * 0.6) : next);
        c.pos = Math.max(c.pos, Math.min(c.pos, RULES.baseAt));
      }
    }
    for (const [c, side, target, n] of dealt) {
      if (target) { hurt(target, n); hits.push([tick, c.uid, target.uid, Math.round(n * 10) / 10]); }
      else {
        const got = hit(s.p[1 - side], Math.round(n * 10) / 10);
        hits.push([tick, c.uid, -1 - (1 - side), got]);
        if (got && CARD[c.id].leech) heal(s.p[side], 1);
      }
    }
    s.p.forEach(p => p.board.forEach((c, l) => { if (c && c.hp <= 0) kill(p, l); }));
    s.p.forEach(p => { p.hp = Math.round(p.hp * 10) / 10; });
    record(tick);
  }
  for (const p of s.p) for (const c of p.board) if (c) { c.state = 0; c.cd = Math.max(c.cd, RULES.firstHit); }
  return { f: frames, hits, end: s.p.map(p => ({ hp: p.hp, shield: p.shield })) };
}
function endCheck(s, force = false) {
  const [h0, h1] = [s.p[0].hp, s.p[1].hp];
  if (force || h0 <= 0 || h1 <= 0 || s.turn >= RULES.maxTurns) { s.over = true; s.winner = h0 === h1 ? null : h0 > h1 ? 0 : 1; }
}
export function forfeitGame(s, i) {
  if (s.over) return;
  s.over = true; s.winner = 1 - i;
  s.log.push({ turn: s.turn, forfeit: i, over: true, winner: 1 - i, events: [], acts: [] });
}
