// Mind Summoners battle engine: pure, deterministic, serialisable (browser, server and simulator).
// Each turn both players secretly summon creatures into their empty lanes (and may use their Hero Skill once
// per match); then everything is revealed and resolved at once. Bring the enemy Mind from 20 HP to 0.
import { CARD, BEATS, ELEMENT_BONUS, RULES } from './cards.js';

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

// players: [{ name, deck: [cardId x12], skill, el }]
export function createGame({ seed = 1, players }) {
  const s = { v: 1, rng: seed | 0, turn: 0, over: false, winner: null, log: [], p: null };
  s.p = players.map(pl => ({
    name: pl.name, skill: pl.skill || null, el: pl.el || null, hp: RULES.hp, shield: 0, skillUsed: false, fatigue: 0,
    deck: shuffle(s, pl.deck), hand: [], board: Array(RULES.lanes).fill(null), focus: 0,
  }));
  for (const p of s.p) for (let i = 0; i < RULES.hand; i++) draw(s, p);
  startTurn(s);
  return s;
}
function draw(s, p) {
  if (p.deck.length) { p.hand.push(p.deck.pop()); return; }
  p.fatigue++; hit(p, p.fatigue);   // out of cards: you get tired
}
function hit(p, n) {
  const b = Math.min(p.shield, n);
  p.shield -= b; p.hp -= n - b;
  return n - b;
}
export function startTurn(s) {
  s.turn++;
  for (const p of s.p) { draw(s, p); p.focus = Math.min(s.turn, RULES.maxFocus); }
}
export const focusOf = (s, i, act) => s.p[i].focus + (act?.skill?.id === 'focus' ? 2 : 0);

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
    if (p.skillUsed || act.skill.id !== p.skill) return 'hero skill not available';
  }
  if (cost > focusOf(s, i, act)) return 'not enough focus';
  return null;
}

// countering an element gives +2 power, or +3 if the creature shares your Mind's element (affinity)
const eff = (c, foe, el) => c.power + c.temp + (foe && BEATS[CARD[c.id].el] === CARD[foe.id].el ? ELEMENT_BONUS + (CARD[c.id].el === el ? 1 : 0) : 0);
const kill = (p, lane) => { p.board[lane] = null; };

// resolve one turn; acts = [act0, act1] (already validated)
export function resolve(s, acts) {
  const log = { turn: s.turn, acts: acts.map(a => ({ play: (a.play || []).map(m => ({ card: s.p[acts.indexOf(a)]?.hand[m.card], lane: m.lane })), skill: a.skill || null })), events: [] };
  const ev = e => log.events.push(e);
  // 1. summon (cards leave the hand)
  const summoned = [[], []];
  acts.forEach((a, i) => {
    const p = s.p[i], play = [...(a.play || [])].sort((x, y) => y.card - x.card);
    for (const m of play) {
      const id = p.hand[m.card];
      p.hand.splice(m.card, 1);
      const c = { id, power: CARD[id].power, temp: 0, grown: 0 };
      p.board[m.lane] = c; summoned[i].push(m.lane);
      ev({ t: 'summon', p: i, id, lane: m.lane });
    }
  });
  // 2. on-summon effects (both sides at once)
  for (let i = 0; i < 2; i++) {
    const me = s.p[i], foe = s.p[1 - i];
    for (const lane of summoned[i]) {
      const d = CARD[me.board[lane].id];
      if (d.spark && foe.board[lane]) foe.board[lane].power -= d.spark;
      if (d.splash) for (const c of foe.board) if (c) c.power -= 1;
      if (d.burn) ev({ t: 'burn', p: i, n: hit(foe, d.burn) });
      if (d.heal) me.hp = Math.min(RULES.hp, me.hp + d.heal);
      if (d.shield) me.shield += d.shield;
      if (d.draw) draw(s, me);
      if (d.rally) me.board.forEach((c, l) => { if (c && l !== lane) c.power += 1; });
    }
  }
  // 3. hero skills
  acts.forEach((a, i) => {
    if (!a.skill) return;
    const me = s.p[i], foe = s.p[1 - i], lane = a.skill.lane;
    me.skillUsed = true;
    ev({ t: 'skill', p: i, id: a.skill.id, lane });
    if (a.skill.id === 'mend') { me.hp = Math.min(RULES.hp, me.hp + 6); me.shield += 2; }
    else if (a.skill.id === 'cry') me.board.forEach(c => { if (c) c.temp += 1; });
    else if (a.skill.id === 'rage' && me.board[lane]) { me.board[lane].temp += 3; me.board[lane].guard = true; }
    else if (a.skill.id === 'hex' && foe.board[lane]) foe.board[lane].temp -= 3;
    else if (a.skill.id === 'bolt') hit(foe, 6);
    else if (a.skill.id === 'ward') me.shield += 5;
    else if (a.skill.id === 'curse' && foe.board[lane]) { foe.board[lane].power -= 1; foe.board[lane].temp -= 1; }
  });
  // creatures weakened to 0 or less are gone
  for (const p of s.p) p.board.forEach((c, l) => { if (c && c.power <= 0) kill(p, l); });
  // 4. lanes fight
  for (let lane = 0; lane < RULES.lanes; lane++) {
    const a = s.p[0].board[lane], b = s.p[1].board[lane];
    if (a && b) {
      const ea = eff(a, b, s.p[0].el), eb = eff(b, a, s.p[1].el);
      if (ea === eb) {
        const ta = CARD[a.id].tough, tb = CARD[b.id].tough;
        if (!ta) kill(s.p[0], lane);
        if (!tb) kill(s.p[1], lane);
        ev({ t: 'tie', lane });
      } else {
        const [wi, w, l, ew, el] = ea > eb ? [0, a, b, ea, eb] : [1, b, a, eb, ea];
        kill(s.p[1 - wi], lane);
        if (!CARD[w.id].guard && !w.guard) w.power = Math.max(1, w.power - Math.max(0, l.power + l.temp));
        if (CARD[w.id].pierce) { const n = hit(s.p[1 - wi], ew - el); if (n && CARD[w.id].leech) s.p[wi].hp = Math.min(RULES.hp, s.p[wi].hp + 1); }
        ev({ t: 'win', lane, p: wi });
      }
    } else if (a || b) {
      const wi = a ? 0 : 1, c = a || b, n = hit(s.p[1 - wi], Math.max(0, eff(c, null)));
      if (n && CARD[c.id].leech) s.p[wi].hp = Math.min(RULES.hp, s.p[wi].hp + 1);
      ev({ t: 'hit', lane, p: wi, n });
    }
  }
  // 5. end of turn
  for (const p of s.p) for (const c of p.board) if (c) {
    c.temp = 0; delete c.guard;
    if (CARD[c.id].grow && c.grown < RULES.growMax) { c.power++; c.grown++; }
  }
  s.log.push(log);
  const [h0, h1] = [s.p[0].hp, s.p[1].hp];
  if (h0 <= 0 || h1 <= 0 || s.turn >= RULES.maxTurns) {
    s.over = true;
    s.winner = h0 === h1 ? null : h0 > h1 ? 0 : 1;
  } else startTurn(s);
  return log;
}
