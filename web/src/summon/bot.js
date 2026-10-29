// A Mind Summoners bot: tries every way to fill its empty lanes (and its Hero Skill), plays each one out
// on a copy of the game assuming the rival summons nothing, and keeps the best. Used for practice, the
// Wilds, raid guards and the balance simulator. `noise` makes weaker / more varied bots.
import { CARD, RULES } from './cards.js';
import { resolve, focusOf } from './engine.js';

const clone = s => JSON.parse(JSON.stringify(s));
function plays(p, focus) {
  const lanes = p.board.map((c, l) => c ? -1 : l).filter(l => l >= 0), out = [];
  const rec = (li, used, cost, acc) => {
    if (li === lanes.length) { out.push(acc); return; }
    rec(li + 1, used, cost, acc);
    for (let h = 0; h < p.hand.length; h++) {
      if (used & (1 << h)) continue;
      const c = CARD[p.hand[h]].cost;
      if (cost + c <= focus) rec(li + 1, used | (1 << h), cost + c, [...acc, { card: h, lane: lanes[li] }]);
    }
  };
  rec(0, 0, 0, []);
  return out;
}
function score(s, i, before) {
  const me = s.p[i], foe = s.p[1 - i];
  if (foe.hp <= 0 && me.hp > 0) return 1000;
  if (me.hp <= 0 && foe.hp > 0) return -1000;
  const board = p => p.board.reduce((t, c) => t + (c ? c.power + c.grown * 0.3 : 0), 0);
  return (before.foeHp - foe.hp) - (before.myHp - me.hp) * 1.1 + 0.6 * board(me) - 0.65 * board(foe) + 0.35 * me.hand.length + me.shield * 0.5;
}
export function botAct(s, i, { rand = Math.random, noise = 0.4 } = {}) {
  const me = s.p[i], foe = s.p[1 - i];
  const before = { myHp: me.hp, foeHp: foe.hp };
  const skills = [null];
  if (!me.skillUsed && me.skill) {
    if (['rage'].includes(me.skill)) for (let l = 0; l < RULES.lanes; l++) skills.push({ id: me.skill, lane: l });
    else if (['hex', 'curse'].includes(me.skill)) foe.board.forEach((c, l) => { if (c) skills.push({ id: me.skill, lane: l }); });
    else skills.push({ id: me.skill });
  }
  let best = { play: [], skill: null }, bestV = -Infinity, bestPlain = -Infinity, plain = null;
  for (const skill of skills) {
    const focus = focusOf(s, i, { skill });
    for (const play of plays(me, focus)) {
      if (skill?.id === 'rage' && !play.some(m => m.lane === skill.lane) && !me.board[skill.lane]) continue;
      const c = clone(s), acts = [];
      acts[i] = { play, skill }; acts[1 - i] = { play: [], skill: null };
      resolve(c, acts);
      const v = score(c, i, before) + (rand() - 0.5) * noise * 2;
      if (!skill && v > bestPlain) { bestPlain = v; plain = { play, skill: null }; }
      if (v > bestV) { bestV = v; best = { play, skill }; }
    }
  }
  // the skill is used once per match: only when it clearly beats the best plain move (or late, or to win)
  if (best.skill && plain && bestV < 900 && bestV - bestPlain < (s.turn >= 8 ? 0.5 : 2.5)) return plain;
  return best;
}
