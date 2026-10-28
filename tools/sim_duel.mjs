// Balance check for Prize Duel using the REAL engine + bot. Run: node tools/sim_duel.mjs
import { createMatch, submit, viewFor, spellsAvailable } from '../web/src/duel/engine.js';
import { Bot } from '../web/src/duel/bot.js';

let seed = 4242;
const R = () => { let a = (seed = (seed + 0x6D2B79F5) | 0); let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const randomPlayer = () => ({ observe() {}, decide: v => {
  const sp = [...v.me.spells, ...(v.me.reverse ? ['reverse'] : [])];
  return { card: v.me.cards[Math.floor(R() * v.me.cards.length)], spell: R() < 0.5 && sp.length ? sp[Math.floor(R() * sp.length)] : null };
} });
function play(a, b) {
  const s = createMatch({ seed: (R() * 1e9) | 0, players: [{ name: 'A', minds: [1] }, { name: 'B', minds: [2] }] });
  const P = [a, b]; let turns = 0;
  while (!s.over && turns < 60) {
    const acts = P.map((p, i) => p.decide(viewFor(s, i)));
    const e0 = submit(s, 0, acts[0]); if (e0.error) throw new Error('A: ' + e0.error);
    const r = submit(s, 1, acts[1]); if (r.error) throw new Error('B: ' + r.error);
    turns++;
  }
  return { winner: s.winner, turns, rounds: s.round };
}
function duel(name, mkA, mkB, n = 10000) {
  let w = 0, d = 0, turns = 0;
  for (let g = 0; g < n; g++) { const r = play(mkA(), mkB()); if (r.winner === 0) w++; if (r.winner === null) d++; turns += r.turns; }
  console.log(`${name.padEnd(24)} A wins ${(w / n * 100).toFixed(1)}%  B wins ${((n - w - d) / n * 100).toFixed(1)}%  draws ${(d / n * 100).toFixed(1)}%  avg turns ${(turns / n).toFixed(1)}`);
}
const bot = lv => () => new Bot(lv, (R() * 1e9) | 0);
duel('random vs random', randomPlayer, randomPlayer);
duel('easy bot vs random', bot('easy'), randomPlayer);
duel('normal bot vs random', bot('normal'), randomPlayer);
duel('hard bot vs random', bot('hard'), randomPlayer);
duel('hard vs hard (seats)', bot('hard'), bot('hard'));
duel('hard vs normal', bot('hard'), bot('normal'));
duel('normal vs easy', bot('normal'), bot('easy'));
