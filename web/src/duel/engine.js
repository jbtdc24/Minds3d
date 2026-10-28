// Mind Duel engine: pure, deterministic, serialisable. Runs in the browser (bots / trial) and on the
// server (ranked, authoritative). No DOM, no Date, no Math.random: all randomness comes from state.rng.

export const MOVES = ['strike', 'guard', 'trick'];
export const BEATS = { strike: 'trick', trick: 'guard', guard: 'strike' };      // key beats value
export const RULES = {
  hp: 100, dmg: 20, tieDmg: 5, focusPerTurn: 1, comebackFocus: 1, maxFocus: 5,
  usesPerSkill: 2, loadoutSize: 4, roundsToWin: 2, maxRounds: 5, maxTurns: 15, heal: 10, drain: 2, counterMult: 2.5,
};

// when: 'now' = changes this turn's clash, 'next' = sets up next turn.
// needs: 'move' = the player names a move (Freeze / Bluff / Counter).
export const SKILLS = {
  peek: { name: 'Peek', cost: 1, when: 'next', icon: '👁️', desc: 'Next turn your rival must lock in first, then you see one move they did NOT pick.' },
  bluff: { name: 'Bluff', cost: 1, when: 'next', needs: 'move', icon: '🎭', desc: 'Next turn your rival sees a "tell" showing the move you name. It can be a lie.' },
  heal: { name: 'Heal', cost: 1, when: 'now', icon: '💚', desc: `Recover ${RULES.heal} HP (max ${RULES.hp}).` },
  freeze: { name: 'Freeze', cost: 2, when: 'next', needs: 'move', icon: '🧊', desc: 'Your rival cannot pick the move you name next turn.' },
  mirror: { name: 'Mirror', cost: 2, when: 'now', icon: '🪞', desc: "Your move becomes your rival's previous move." },
  quickdraw: { name: 'Quick Draw', cost: 2, when: 'now', icon: '⚡', desc: 'You win this turn if it is a tie.' },
  ironmind: { name: 'Iron Mind', cost: 2, when: 'now', icon: '🛡️', desc: 'If you lose this turn, you take no damage.' },
  drain: { name: 'Drain', cost: 1, when: 'now', icon: '🌀', desc: `Steal up to ${RULES.drain} Focus from your rival.` },
  overcharge: { name: 'Overcharge', cost: 3, when: 'now', icon: '🔥', desc: 'If you win this turn, deal double damage.' },
  counter: { name: 'Counter', cost: 3, when: 'now', needs: 'move', icon: '💥', desc: "Name your rival's move. If you are right, you win this turn with 2.5x damage." },
  mindlock: { name: 'Mind Lock', cost: 3, when: 'next', icon: '🔒', desc: 'Next turn your rival must repeat the move they play this turn.' },
  chaos: { name: 'Chaos', cost: 3, when: 'now', icon: '🎲', desc: 'Both moves this turn are replaced by random ones.' },
};
export const SKILL_IDS = Object.keys(SKILLS);

// ---------- seeded rng kept inside the state ----------
function rand(s) {
  let a = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];

// players: [{ name, minds: [tokenId...1-3], loadout: [4 skill ids] }]
export function createMatch({ seed = 1, players }) {
  const s = {
    v: 1, rng: seed | 0, round: 1, turn: 1, over: false, winner: null, log: [],
    p: players.map(pl => ({
      name: pl.name, minds: pl.minds.slice(0, 3), loadout: pl.loadout.slice(0, RULES.loadoutSize),
      uses: Object.fromEntries(pl.loadout.map(k => [k, RULES.usesPerSkill])),
      mind: 0, rounds: 0, hp: RULES.hp, focus: 0,
      last: null,          // move played last turn (this round)
      next: {},            // effects on this player next turn: forbid, forced, peekFirst, tell
      pending: null,       // locked action this turn (hidden from the rival)
      peekInfo: null,      // shown to a peeker after the rival locks
    })),
  };
  for (const pl of players) {
    if (!pl.minds?.length || pl.minds.length > 3) throw new Error('bring 1 to 3 Minds');
    if (new Set(pl.loadout).size !== RULES.loadoutSize || pl.loadout.some(k => !SKILLS[k])) throw new Error('loadout must be 4 different skills');
  }
  return s;
}

// Which player (if any) must lock in first this turn because the other used Peek last turn.
export function mustLockFirst(s) {
  const a = s.p[0].next.peekFirst, b = s.p[1].next.peekFirst;
  if (a && !b) return 0;       // p0 was peeked on -> p0 locks first
  if (b && !a) return 1;
  return null;                 // nobody, or both peeked (they cancel)
}

// What player i is allowed to do right now.
export function allowedMoves(s, i) {
  const n = s.p[i].next;
  if (n.forced) return [n.forced];
  return MOVES.filter(m => m !== n.forbid);
}

// Validate an action without changing state. action = { move, skill?, target? }
export function validate(s, i, action) {
  if (s.over) return 'match is over';
  const me = s.p[i];
  if (me.pending) return 'already locked in';
  const first = mustLockFirst(s);
  if (first !== null && first !== i && !s.p[first].pending) return 'wait: your rival locks in first';
  if (!action || !MOVES.includes(action.move)) return 'pick strike, guard or trick';
  if (!allowedMoves(s, i).includes(action.move)) return 'that move is blocked this turn';
  if (action.skill != null) {
    const k = action.skill, sk = SKILLS[k];
    if (!sk || !me.loadout.includes(k)) return 'skill not in your loadout';
    if (!me.uses[k]) return 'no uses left';
    if (me.focus < sk.cost) return 'not enough Focus';
    if (sk.needs === 'move' && !MOVES.includes(action.target)) return 'name a move for this skill';
  }
  return null;
}

export function submit(s, i, action) {
  const err = validate(s, i, action);
  if (err) return { error: err };
  s.p[i].pending = { move: action.move, skill: action.skill ?? null, target: action.target ?? null };
  // a peeker learns one move the rival did not pick, as soon as the rival locks in
  const other = 1 - i;
  if (mustLockFirst(s) === i) {
    const notPicked = MOVES.filter(m => m !== action.move);
    s.p[other].peekInfo = pick(s, notPicked);
  }
  if (s.p[0].pending && s.p[1].pending) return { resolved: resolveTurn(s) };
  return { ok: true };
}

// Choose which of your Minds fights the next round (cosmetic; all Minds have equal stats).
export function chooseMind(s, i, index) {
  if (index >= 0 && index < s.p[i].minds.length) s.p[i].mind = index;
}

function resolveTurn(s) {
  const P = s.p, act = P.map(p => p.pending), ev = { round: s.round, turn: s.turn, picks: act.map(a => ({ ...a })), notes: [] };
  // pay for skills
  act.forEach((a, i) => { if (a.skill) { P[i].focus -= SKILLS[a.skill].cost; P[i].uses[a.skill]--; } });
  const has = (i, k) => act[i].skill === k;
  // final moves: mirror, then chaos
  const moves = act.map(a => a.move);
  for (const i of [0, 1]) if (has(i, 'mirror') && P[1 - i].last) { moves[i] = P[1 - i].last; ev.notes.push({ i, k: 'mirror', move: moves[i] }); }
  if (has(0, 'chaos') || has(1, 'chaos')) { moves[0] = pick(s, MOVES); moves[1] = pick(s, MOVES); ev.notes.push({ k: 'chaos', moves: [...moves] }); }
  ev.moves = [...moves];
  // who wins the clash
  let win = moves[0] === moves[1] ? null : BEATS[moves[0]] === moves[1] ? 0 : 1, mult = [1, 1];
  for (const i of [0, 1]) if (has(i, 'counter')) {
    if (act[i].target === moves[1 - i]) { win = i; mult[i] = RULES.counterMult; ev.notes.push({ i, k: 'counter', hit: true }); }
    else ev.notes.push({ i, k: 'counter', hit: false });
  }
  if (has(0, 'counter') && has(1, 'counter') && mult[0] > 1 && mult[1] > 1) { win = null; mult = [1, 1]; }   // both read each other
  if (win === null) {
    const q0 = has(0, 'quickdraw'), q1 = has(1, 'quickdraw');
    if (q0 !== q1) { win = q0 ? 0 : 1; ev.notes.push({ i: win, k: 'quickdraw' }); }
  }
  // damage
  const dmg = [0, 0];
  if (win === null) { dmg[0] = dmg[1] = RULES.tieDmg; }
  else {
    const lose = 1 - win;
    let d = RULES.dmg * mult[win];
    if (has(win, 'overcharge')) { d *= 2; ev.notes.push({ i: win, k: 'overcharge' }); }
    if (has(lose, 'ironmind')) { d = 0; ev.notes.push({ i: lose, k: 'ironmind' }); }
    dmg[lose] = d;
  }
  for (const i of [0, 1]) {
    if (has(i, 'heal')) { const h = Math.min(RULES.heal, RULES.hp - P[i].hp); P[i].hp += h; ev.notes.push({ i, k: 'heal', hp: h }); }
    if (has(i, 'drain')) { const d = Math.min(RULES.drain, P[1 - i].focus); P[1 - i].focus -= d; P[i].focus = Math.min(RULES.maxFocus, P[i].focus + d); ev.notes.push({ i, k: 'drain', focus: d }); }
  }
  for (const i of [0, 1]) P[i].hp = Math.max(0, P[i].hp - dmg[i]);
  ev.win = win; ev.dmg = dmg;
  // set up next turn
  for (const i of [0, 1]) P[i].next = {};
  for (const i of [0, 1]) {
    const r = 1 - i;
    if (has(i, 'freeze')) P[r].next.forbid = act[i].target;
    if (has(i, 'mindlock')) P[r].next.forced = moves[r];
    if (has(i, 'peek')) P[r].next.peekFirst = true;
    if (has(i, 'bluff')) P[r].next.tell = act[i].target;          // what the rival will be shown
  }
  for (const i of [0, 1]) {
    // forced beats forbid if both were applied to the same player
    if (P[i].next.forced && P[i].next.forced === P[i].next.forbid) delete P[i].next.forbid;
    P[i].focus = Math.min(RULES.maxFocus, P[i].focus + RULES.focusPerTurn + (win === 1 - i ? RULES.comebackFocus : 0));
    P[i].last = moves[i];
    P[i].pending = null; P[i].peekInfo = null;
  }
  ev.hp = P.map(p => p.hp); ev.focus = P.map(p => p.focus);
  // round end
  const dead = P.map(p => p.hp <= 0);
  if (dead[0] || dead[1] || s.turn >= RULES.maxTurns) {
    let rw = null;
    if (dead[0] !== dead[1]) rw = dead[0] ? 1 : 0;
    else if (P[0].hp !== P[1].hp) rw = P[0].hp > P[1].hp ? 0 : 1;
    if (rw !== null) P[rw].rounds++;
    ev.roundOver = { winner: rw, rounds: P.map(p => p.rounds) };
    const done = P.some(p => p.rounds >= RULES.roundsToWin) || s.round >= RULES.maxRounds;
    if (done) {
      s.over = true;
      s.winner = P[0].rounds === P[1].rounds ? null : P[0].rounds > P[1].rounds ? 0 : 1;
      ev.matchOver = { winner: s.winner };
    } else {
      s.round++; s.turn = 1;
      for (const p of P) { p.hp = RULES.hp; p.focus = 0; p.last = null; p.next = {}; p.mind = (p.mind + 1) % p.minds.length; }
    }
  } else s.turn++;
  s.log.push(ev);
  return ev;
}

// What player i may see (the rival's locked pick stays hidden until the reveal).
export function viewFor(s, i) {
  const me = s.p[i], op = s.p[1 - i];
  return {
    round: s.round, turn: s.turn, over: s.over, winner: s.winner,
    me: { name: me.name, minds: me.minds, mind: me.mind, hp: me.hp, focus: me.focus, rounds: me.rounds, loadout: me.loadout, uses: me.uses, locked: !!me.pending, last: me.last },
    rival: { name: op.name, minds: op.minds, mind: op.mind, hp: op.hp, focus: op.focus, rounds: op.rounds, loadout: op.loadout, uses: op.uses, locked: !!op.pending, last: op.last },
    allowed: allowedMoves(s, i), forced: me.next.forced || null, forbid: me.next.forbid || null,
    tell: me.next.tell || null, peekInfo: me.peekInfo,
    rivalForced: op.next.forced || null, rivalForbid: op.next.forbid || null,   // you caused these, so you know them mustWait: mustLockFirst(s) === 1 - i && !op.pending,
    lockFirst: mustLockFirst(s) === i,
    lastEvent: s.log[s.log.length - 1] || null,
  };
}
