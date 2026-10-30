// Mindclash "Prize Duel" engine: pure, deterministic, serialisable. Runs in the browser (practice) and on
// the server (ranked, authoritative). No DOM, no Date, no Math.random: randomness only comes from state.rng.
//
// Rules (balance-tested, see tools/sim_duel.mjs):
// - Each round both players hold cards 1-7. 7 crowns are drawn at random from 1-15 (so nobody knows which values
//   are in this round) and come up one per turn. Only the current crown is shown, plus a hint for the next one.
// - Each turn both secretly play a card (+ optionally one spell). Higher card wins the crown.
//   A tie rolls the crown into the next turn's pot. Every card is used once per round.
// - Spells are revealed after the numbers, in this order:
//     Boost (+2 to your card) -> Reverse (lower card wins) -> Trap (if the rival wins with a 7, you steal it)
//     -> Double (winning crown x2, and you win ties).
//   The same spell on both sides cancels out, except Double + Double = crown x3.
//   Boost, Double, Trap: once per round. Reverse: once per match.
// - Most points wins the round (tie-break: more crowns, then the biggest crown). Best of 3 rounds.
// - Running out of time on a turn = you lose that round.

export const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7];
export const CROWN_POOL = 15;
export const crownTier = c => c <= 5 ? 'low' : c <= 10 ? 'mid' : 'high';
export const SPELLS = ['boost', 'double', 'trap', 'reverse'];
export const ROUND_SPELLS = ['boost', 'double', 'trap'];
export const RULES = { boost: 2, trapAt: 7, roundsToWin: 2, maxRounds: 5 };
export const SPELL_INFO = {
  boost: { name: 'Boost', icon: '⬆️', short: '+2 to your card', desc: 'Your card counts as 2 higher this turn.', limit: 'once per round' },
  double: { name: 'Double', icon: '✖️', short: 'Crown x2 + win ties', desc: 'If you win this crown it is worth double, and you also win ties.', limit: 'once per round' },
  trap: { name: 'Trap', icon: '🪤', short: 'Steal from a 7', desc: 'If your rival wins this crown with a 7, you steal it.', limit: 'once per round' },
  reverse: { name: 'Reverse', icon: '🔄', short: 'Lower card wins', desc: 'This turn the LOWER card wins.', limit: 'once per match' },
};

function rand(s) {
  let a = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// this round's 7 crowns: 7 different values out of 1-15, in a random order
function shuffled(s) {
  const a = Array.from({ length: CROWN_POOL }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, CARD_VALUES.length);
}
const freshRound = p => Object.assign(p, { cards: [...CARD_VALUES], spells: [...ROUND_SPELLS], score: 0, crowns: 0, best: 0, pending: null });

// players: [{ name, minds: [tokenId...1-3] }]
export function createMatch({ seed = 1, players }) {
  for (const pl of players) if (!pl.minds?.length || pl.minds.length > 3) throw new Error('bring 1 to 3 Minds');
  const s = { v: 4, rng: seed | 0, round: 1, turn: 1, pot: 0, over: false, winner: null, log: [], crowns: null, p: null };
  s.crowns = shuffled(s);
  s.p = players.map(pl => freshRound({ name: pl.name, minds: pl.minds.slice(0, 3), mind: 0, rounds: 0, reverse: true }));
  s.pot = s.crowns[0];
  return s;
}
export const currentCrown = s => s.crowns[s.turn - 1];
export const spellsAvailable = (s, i) => [...s.p[i].spells, ...(s.p[i].reverse ? ['reverse'] : [])];

export function validate(s, i, action) {
  if (s.over) return 'match is over';
  const me = s.p[i];
  if (me.pending) return 'already locked in';
  const card = Number(action?.card);
  if (!me.cards.includes(card)) return 'pick one of your cards';
  if (action.spell != null && !spellsAvailable(s, i).includes(action.spell)) return 'that spell is not available';
  return null;
}

export function submit(s, i, action) {
  const err = validate(s, i, action);
  if (err) return { error: err };
  s.p[i].pending = { card: Number(action.card), spell: action.spell ?? null };
  if (s.p[0].pending && s.p[1].pending) return { resolved: resolveTurn(s) };
  return { ok: true };
}

// resolve two plays; pure so the UI can replay the reveal step by step
export function resolvePlays(cards, spells, pot) {
  const same = spells[0] && spells[0] === spells[1];
  const has = (i, k) => spells[i] === k && !(same && k !== 'double');
  const steps = [];
  if (same) steps.push({ k: 'cancel', spell: spells[0], triple: spells[0] === 'double' });
  const v = cards.map((c, i) => c + (has(i, 'boost') ? RULES.boost : 0));
  for (const i of [0, 1]) if (has(i, 'boost')) steps.push({ k: 'boost', i, value: v[i] });
  let win;
  if (v[0] === v[1]) {
    const d0 = has(0, 'double'), d1 = has(1, 'double');
    win = d0 !== d1 ? (d0 ? 0 : 1) : null;
    if (win !== null) steps.push({ k: 'doubleTie', i: win });
  } else {
    const reverse = has(0, 'reverse') || has(1, 'reverse');
    win = (v[0] > v[1]) !== reverse ? 0 : 1;
    if (reverse) steps.push({ k: 'reverse', i: has(0, 'reverse') ? 0 : 1, win });
    const lose = 1 - win;
    if (has(lose, 'trap') && v[win] >= RULES.trapAt) { win = lose; steps.push({ k: 'trap', i: lose, win }); }
  }
  for (const i of [0, 1]) if (spells[i] === 'trap' && has(i, 'trap') && !steps.some(st => st.k === 'trap')) steps.push({ k: 'trapMiss', i });
  let mult = 1;
  if (win !== null) {
    if (same && spells[0] === 'double') mult = 3;
    else if (has(win, 'double')) mult = 2;
    if (mult > 1) steps.push({ k: 'double', i: win, mult });
  }
  return { values: v, win, mult, points: win === null ? 0 : pot * mult, steps };
}

function resolveTurn(s) {
  const P = s.p, plays = P.map(p => p.pending), crown = currentCrown(s), pot = s.pot;
  plays.forEach((pl, i) => {
    P[i].cards.splice(P[i].cards.indexOf(pl.card), 1);
    if (pl.spell === 'reverse') P[i].reverse = false;
    else if (pl.spell) P[i].spells.splice(P[i].spells.indexOf(pl.spell), 1);
    P[i].pending = null;
  });
  const r = resolvePlays(plays.map(p => p.card), plays.map(p => p.spell), pot);
  const ev = { round: s.round, turn: s.turn, crown, pot, cards: plays.map(p => p.card), spells: plays.map(p => p.spell), ...r };
  if (r.win !== null) {
    P[r.win].score += r.points; P[r.win].crowns++; P[r.win].best = Math.max(P[r.win].best, crown);
    s.pot = 0;
  }
  ev.scores = P.map(p => p.score);
  if (s.turn >= CARD_VALUES.length) endRound(s, ev, undefined);
  else { s.turn++; s.pot += currentCrown(s); }
  s.log.push(ev);
  return ev;
}

function endRound(s, ev, forcedWinner, reason) {
  const P = s.p;
  let rw = forcedWinner;
  if (rw === undefined) {
    const k = p => [p.score, p.crowns, p.best];
    const a = k(P[0]), b = k(P[1]);
    const i = a.findIndex((x, j) => x !== b[j]);
    rw = i < 0 ? null : a[i] > b[i] ? 0 : 1;
  }
  if (rw !== null) P[rw].rounds++;
  ev.roundOver = { winner: rw, rounds: P.map(p => p.rounds), scores: P.map(p => p.score), reason: reason || 'points' };
  if (P.some(p => p.rounds >= RULES.roundsToWin) || s.round >= RULES.maxRounds) {
    s.over = true;
    s.winner = P[0].rounds === P[1].rounds ? null : P[0].rounds > P[1].rounds ? 0 : 1;
    ev.matchOver = { winner: s.winner };
  } else {
    s.round++; s.turn = 1;
    s.crowns = shuffled(s);
    s.pot = s.crowns[0];
    for (const p of P) { freshRound(p); p.mind = (p.mind + 1) % p.minds.length; }
  }
}

// Players who didn't lock in before the deadline lose the round (both late = drawn round).
export function timeout(s, late) {
  if (s.over) return null;
  late = late.filter(i => !s.p[i].pending);
  if (!late.length) return null;
  const winner = late.length === 2 ? null : 1 - late[0];
  const ev = { round: s.round, turn: s.turn, crown: currentCrown(s), pot: s.pot, cards: [null, null], spells: [null, null], win: null, points: 0, steps: [], timeout: late, scores: s.p.map(p => p.score) };
  for (const p of s.p) p.pending = null;
  endRound(s, ev, winner, 'timeout');
  s.log.push(ev);
  return ev;
}

export function forfeitMatch(s, i) {
  if (s.over) return;
  s.over = true; s.winner = 1 - i;
  s.log.push({ round: s.round, turn: s.turn, cards: [null, null], spells: [null, null], win: null, points: 0, steps: [], forfeit: i, matchOver: { winner: 1 - i }, scores: s.p.map(p => p.score) });
}

// What player i may see: never the rival's locked card or spell. Card counting info is public.
export function viewFor(s, i) {
  const me = s.p[i], op = s.p[1 - i];
  const side = p => ({ name: p.name, minds: p.minds, mind: p.mind, rounds: p.rounds, score: p.score, crowns: p.crowns, cards: [...p.cards], spells: [...p.spells], reverse: p.reverse });
  return {
    round: s.round, turn: s.turn, over: s.over, winner: s.winner,
    crown: s.over ? null : currentCrown(s), pot: s.pot,
    seen: s.crowns.slice(0, s.over ? s.crowns.length : s.turn - 1),         // crowns already played this round
    next: s.over || s.turn >= CARD_VALUES.length ? null : crownTier(s.crowns[s.turn]),   // low / mid / high hint only
    me: { ...side(me), locked: !!me.pending, play: me.pending },
    rival: { ...side(op), locked: !!op.pending },
    lastEvent: s.log[s.log.length - 1] || null,
  };
}
