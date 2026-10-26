// Turn-based 3v3 battle engine (pure logic). Each round: +energy, every fighter draws 2 cards,
// both teams pick cards, then everyone acts in speed order. Returns events for the presenter.
import { classMult } from './data.js';

export const START_ENERGY = 3, ENERGY_PER_ROUND = 2, MAX_ENERGY = 10, HAND = 2, SUDDEN_DEATH = 10;
const DMG = 2.4;            // ATK -> damage scale (a 1-energy hit is ~25% of a fighter)

export class Battle {
  constructor(teamA, teamB, rand = Math.random) {
    this.rand = rand;
    this.units = [];
    [teamA, teamB].forEach((team, t) => team.forEach((u, slot) => this.units.push({
      ...u, uid: `${t}${slot}`, team: t, slot, alive: true, status: {}, hand: [], pile: [],
    })));
    this.energy = [START_ENERGY - ENERGY_PER_ROUND, START_ENERGY - ENERGY_PER_ROUND];
    this.round = 0;
  }
  unit(uid) { return this.units.find(u => u.uid === uid); }
  team(t) { return this.units.filter(u => u.team === t); }
  alive(t) { return this.units.filter(u => u.team === t && u.alive); }
  winner() {
    const a = this.alive(0).length, b = this.alive(1).length;
    return a && b ? null : a ? 0 : b ? 1 : 1;
  }
  startRound() {
    this.round++;
    for (const t of [0, 1]) this.energy[t] = Math.min(MAX_ENERGY, this.energy[t] + ENERGY_PER_ROUND);
    for (const u of this.units) {
      u.hand = [];
      if (!u.alive) continue;
      for (let i = 0; i < Math.min(HAND, u.deck.length); i++) {
        if (!u.pile.length) u.pile = shuffle(u.deck.map((_, k) => k), this.rand);
        let k = u.pile.pop();
        if (u.hand.some(c => c.idx === k) && u.pile.length) { u.pile.unshift(k); k = u.pile.pop(); }
        u.hand.push({ ...u.deck[k], idx: k });
      }
    }
  }
  snapshot() {
    const s = {};
    for (const u of this.units) s[u.uid] = { hp: u.hp, shield: u.shield, alive: u.alive, status: JSON.parse(JSON.stringify(u.status)) };
    return { units: s, energy: [...this.energy] };
  }
  // sel = { uid: [handIndex, ...] } for both teams. Energy is paid up front.
  resolve(sel) {
    const events = [], plays = {};
    for (const [uid, idxs] of Object.entries(sel)) {
      const u = this.unit(uid);
      if (!u?.alive) continue;
      plays[uid] = [];
      for (const i of idxs) {
        const card = u.hand[i];
        if (card && this.energy[u.team] >= card.cost) { this.energy[u.team] -= card.cost; plays[uid].push(card); }
      }
    }
    const order = this.units.filter(u => u.alive && plays[u.uid]?.length)
      .sort((a, b) => speed(b) - speed(a) || b.hp / b.maxHp - a.hp / a.maxHp);
    for (const u of order) {
      if (!u.alive || this.winner() !== null) continue;
      if (u.status.stun) { delete u.status.stun; events.push({ type: 'stunned', uid: u.uid, ...this.snapshot() }); continue; }
      plays[u.uid].forEach((card, n) => {
        if (!u.alive || this.winner() !== null) return;
        events.push({ type: 'act', uid: u.uid, card, combo: n > 0, results: this.play(u, card, n > 0 ? 1.15 : 1), ...this.snapshot() });
      });
    }
    return events;
  }
  play(u, card, combo) {
    const R = this.rand, foes = this.alive(1 - u.team), friends = this.alive(u.team), results = [];
    if (card.wild) {           // Joker: a random effect
      const roll = R();
      card = roll < 0.4 ? { ...card, target: 'lowest', dmg: 1.6, move: 'smash' } : roll < 0.7 ? { ...card, target: 'allies', heal: 0.15 } : { ...card, target: 'all', fx: [{ k: 'stun', chance: 0.35 }] };
    }
    if (card.energy) this.energy[u.team] = Math.min(MAX_ENERGY, this.energy[u.team] + card.energy);
    if (card.drain && this.energy[1 - u.team] > 0) { this.energy[1 - u.team]--; this.energy[u.team] = Math.min(MAX_ENERGY, this.energy[u.team] + 1); }
    const taunter = foes.find(f => f.status.taunt);
    const pickFoe = mode => {
      if (!foes.length) return null;
      if (taunter && !card.ignoreTaunt && mode !== 'random') return taunter;
      if (mode === 'back') return foes.reduce((a, b) => b.slot > a.slot ? b : a);
      if (mode === 'lowest') return foes.reduce((a, b) => b.hp / b.maxHp < a.hp / a.maxHp ? b : a);
      if (mode === 'random') return foes[(R() * foes.length) | 0];
      return foes.reduce((a, b) => b.slot < a.slot ? b : a);
    };
    let targets;
    switch (card.target) {
      case 'self': targets = [u]; break;
      case 'ally': targets = [friends.reduce((a, b) => b.hp / b.maxHp < a.hp / a.maxHp ? b : a)]; break;
      case 'allies': targets = friends; break;
      case 'all': targets = foes; break;
      case 'random': targets = Array.from({ length: card.hits || 1 }, () => pickFoe('random')); break;
      default: targets = [pickFoe(card.target)];
    }
    const hostile = ['front', 'back', 'lowest', 'all', 'random'].includes(card.target);
    for (const t of targets) {
      if (!t || !t.alive) continue;
      const r = { uid: t.uid };
      if (hostile && card.dmg) {
        if (t.status.dodge) { t.status.dodge--; if (!t.status.dodge) delete t.status.dodge; r.miss = true; results.push(r); continue; }
        const atk = u.atk * (1 + (u.status.atkUp?.v || 0) - (u.status.atkDown?.v || 0));
        const crit = !!u.status.focus || R() < u.crit + (card.critBonus || 0) || (card.execute && t.hp < t.maxHp / 2);
        let d = DMG * atk * card.dmg * classMult(u.cls, t.cls) * combo * (crit ? 1.6 : 1) * (0.92 + R() * 0.16) * (1 - (t.status.defUp?.v || 0));
        d = Math.max(1, Math.round(d));
        const blocked = Math.min(t.shield, d);
        t.shield -= blocked;
        t.hp = Math.max(0, t.hp - (d - blocked));
        Object.assign(r, { dmg: d, blocked, crit, adv: classMult(u.cls, t.cls) });
        if (card.lifesteal) { const h = Math.round(d * card.lifesteal); u.hp = Math.min(u.maxHp, u.hp + h); }
      }
      if (card.heal) { const h = Math.round(t.maxHp * card.heal * (1 + u.healBonus)); t.hp = Math.min(t.maxHp, t.hp + h); r.heal = h; }
      if (card.shield) { const s = Math.round(t.maxHp * card.shield); t.shield += s; r.shield = s; }
      if (card.cleanse) for (const k of ['stun', 'burn', 'atkDown']) delete t.status[k];
      r.fx = [];
      for (const e of card.fx || []) {
        if (e.chance && R() > e.chance) continue;
        const s = t.status;
        if (e.k === 'stun') s.stun = 1;
        else if (e.k === 'burn') s.burn = { dmg: Math.round(DMG * u.atk * e.v), t: e.t };
        else if (e.k === 'dodge') s.dodge = (s.dodge || 0) + e.v;
        else if (e.k === 'focus') s.focus = true;
        else if (e.k === 'taunt' || e.k === 'speedUp') s[e.k] = { t: e.t };
        else s[e.k] = { v: e.v, t: e.t };
        r.fx.push(e.k);
      }
      if (t.hp <= 0 && t.alive) { t.alive = false; t.status = {}; r.ko = true; }
      results.push(r);
    }
    if (u.status.focus && hostile && card.dmg) delete u.status.focus;
    return results;
  }
  // burn ticks, buffs wear off, sudden death after round 10
  endRound() {
    const results = [];
    for (const u of this.units.filter(x => x.alive)) {
      let dmg = 0;
      if (u.status.burn) dmg += u.status.burn.dmg;
      if (this.round >= SUDDEN_DEATH) dmg += Math.round(u.maxHp * 0.06 * (this.round - SUDDEN_DEATH + 1));
      if (dmg) {
        u.hp = Math.max(0, u.hp - dmg);
        const r = { uid: u.uid, dmg, burn: !!u.status.burn };
        if (!u.hp) { u.alive = false; u.status = {}; r.ko = true; }
        results.push(r);
      }
      for (const [k, s] of Object.entries(u.status)) if (s && typeof s === 'object' && 't' in s && --s.t <= 0) delete u.status[k];
    }
    return { type: 'tick', results, suddenDeath: this.round >= SUDDEN_DEATH, ...this.snapshot() };
  }
}
export const speed = u => u.spd * (u.status.speedUp ? 1.3 : 1);
function shuffle(a, R) { for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Simple greedy AI: score every card in hand, buy the best value until energy runs out.
export function aiChoose(b, team, smart = 1) {
  const R = b.rand, mine = b.alive(team), foes = b.alive(1 - team);
  let energy = b.energy[team];
  const lowAlly = Math.min(...mine.map(u => u.hp / u.maxHp));
  const options = [];
  for (const u of mine) u.hand.forEach((c, i) => {
    let s = 0;
    if (c.dmg) {
      const n = c.target === 'all' ? foes.length : c.hits || 1;
      s += c.dmg * n * u.atk;
      const front = foes.reduce((a, f) => f.slot < a.slot ? f : a, foes[0]);
      if (front && c.dmg * u.atk * 1.1 >= front.hp + front.shield) s += 60;          // finishing blow
      if (front) s *= classMult(u.cls, front.cls);
    }
    if (c.heal) s += (1 - lowAlly) * 160 * c.heal * (c.target === 'allies' ? mine.length : 1) * 4;
    if (c.shield) s += 40 * c.shield * 4 * (lowAlly < 0.6 ? 1.5 : 0.8);
    if (c.energy) s += 25 * c.energy;
    if (c.drain) s += 20;
    for (const e of c.fx || []) s += { stun: 35, burn: 30, atkDown: 18, atkUp: 22, defUp: 18, dodge: 20, taunt: 15, focus: 20, speedUp: 10 }[e.k] || 0;
    if (c.wild) s += 50;
    s *= 0.85 + R() * 0.3 * (2 - smart);
    options.push({ uid: u.uid, i, cost: c.cost, value: s / Math.max(0.6, c.cost) });
  });
  options.sort((a, b2) => b2.value - a.value);
  const sel = {};
  for (const o of options) {
    if (o.cost > energy || (sel[o.uid]?.length || 0) >= 2) continue;
    if (smart < 1 && R() < 0.2) continue;
    (sel[o.uid] ||= []).push(o.i);
    energy -= o.cost;
  }
  return sel;
}
