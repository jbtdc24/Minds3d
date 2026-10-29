// A Mind Summoners match as the game uses it (server, offline practice, tutorial): two summoners, each with a
// Mind (its Hero Skill + element come from the NFT traits) and a deck. Same shape as the old duel module:
// createMatch, submit, viewFor, timeout, forfeitMatch.
import HEROES from './heroes.js';
import { STARTER_DECKS, RULES } from './cards.js';
import { createGame, validate, resolve, forfeitGame } from './engine.js';

export const V = 4;   // saved match format (older matches are closed)
export const DECK_IDS = Object.keys(STARTER_DECKS);
export function heroOf(mind) {
  const [skill, el] = (HEROES[mind] || 'mend:fire').split(':');
  return { skill, el };
}
// players: [{ name, minds: [summoner id], deck: starter deck id }]
export function createMatch({ seed, players }) {
  const g = createGame({
    seed, players: players.map(p => ({ name: p.name, deck: (STARTER_DECKS[p.deck] || STARTER_DECKS.ember_sprout).cards, hp: p.hp, ...heroOf(p.minds[0]) })),
  });
  return { v: V, g, minds: players.map(p => [p.minds[0]]), decks: players.map(p => (STARTER_DECKS[p.deck] ? p.deck : 'ember_sprout')), pending: [null, null], idle: [0, 0], over: false, winner: null };
}
const clean = a => ({
  play: (Array.isArray(a?.play) ? a.play : []).slice(0, RULES.lanes).map(m => ({ card: Number(m.card), lane: Number(m.lane) })),
  skill: a?.skill?.id ? { id: String(a.skill.id), lane: a.skill.lane == null ? null : Number(a.skill.lane) } : null,
});
export function submit(s, i, action) {
  if (s.over) return { error: 'match is over' };
  if (s.pending[i]) return { error: 'already locked in' };
  const act = clean(action), err = validate(s.g, i, act);
  if (err) return { error: err };
  s.pending[i] = act; s.idle[i] = 0;
  if (s.pending[0] && s.pending[1]) return { resolved: turn(s) };
  return { ok: true };
}
function turn(s) {
  const log = resolve(s.g, s.pending);
  s.pending = [null, null];
  s.over = s.g.over; s.winner = s.g.winner;
  return log;
}
// players who didn't lock in before the deadline summon nothing this turn; 2 missed turns in a row = forfeit
export function timeout(s, late) {
  if (s.over) return null;
  late = late.filter(i => !s.pending[i]);
  if (!late.length) return null;
  for (const i of late) {
    if (++s.idle[i] >= 2) { forfeitMatch(s, i); return s.g.log[s.g.log.length - 1]; }
    s.pending[i] = { play: [], skill: null, timedOut: true };
  }
  const log = turn(s);
  log.timeout = late;
  return log;
}
export function forfeitMatch(s, i) {
  if (s.over) return;
  forfeitGame(s.g, i);
  s.over = true; s.winner = 1 - i;
}
export const playedTurns = (s, i) => s.g.played[i];
// what player i may see: never the rival's hand, deck order or locked move
export function viewFor(s, i) {
  const g = s.g, me = g.p[i], op = g.p[1 - i];
  const side = (p, j) => ({ name: p.name, mind: s.minds[j][0], deck: s.decks[j], hp: p.hp, maxHp: p.maxHp, shield: p.shield, board: p.board.map(c => c && { id: c.id, uid: c.uid, hp: c.hp, maxHp: c.maxHp, atk: c.atk, pos: c.pos, grown: c.grown }),
    deckLeft: p.deck.length, handCount: p.hand.length, skill: p.skill, skillUsed: p.skillUsed, el: p.el, locked: !!s.pending[j] });
  return {
    turn: g.turn, maxTurns: RULES.maxTurns, over: s.over, winner: s.winner,
    me: { ...side(me, i), hand: [...me.hand], next: me.deck[me.deck.length - 1] || null, focus: me.focus, play: s.pending[i] },
    rival: side(op, 1 - i),
    lastEvent: g.log[g.log.length - 1] || null,
  };
}
