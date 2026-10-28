// Balance check: thousands of bot-vs-bot Mind Duels. Run: node tools/sim_duel.mjs
import { createMatch, submit, viewFor, mustLockFirst, SKILL_IDS, MOVES } from '../web/src/duel/engine.js';
import { Bot } from '../web/src/duel/bot.js';

let seed = 12345;
const R = () => { let a = (seed = (seed + 0x6D2B79F5) | 0); let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const loadout = () => [...SKILL_IDS].sort(() => R() - 0.5).slice(0, 4);
// a human-like player: has a favourite move, repeats after a win, switches after a loss
const habitPlayer = () => { let last = null, won = false; const fav = MOVES[Math.floor(R() * 3)]; return {
  observe(ev, me) { last = ev.moves[me]; won = ev.win === me; },
  decide(v) { let m = last && won && R() < 0.6 ? last : R() < 0.45 ? fav : MOVES[Math.floor(R() * 3)]; if (!v.allowed.includes(m)) m = v.allowed[0]; return { move: m }; } }; };
const randomPlayer = { observe() {}, decide(v) { const m = v.allowed[Math.floor(R() * v.allowed.length)]; return { move: m }; } };

function play(a, b, la = loadout(), lb = loadout()) {
  const s = createMatch({ seed: (R() * 1e9) | 0, players: [{ name: 'A', minds: [1], loadout: la }, { name: 'B', minds: [2], loadout: lb }] });
  const bots = [a, b], used = [{}, {}];
  let turns = 0;
  while (!s.over && turns < 200) {
    const first = mustLockFirst(s), order = first === null ? [0, 1] : [first, 1 - first];
    let ev = null;
    for (const i of order) {
      const act = bots[i].decide(viewFor(s, i));
      const r = submit(s, i, act);
      if (r.error) { const r2 = submit(s, i, { move: viewFor(s, i).allowed[0] }); ev = r2.resolved || ev; }
      else { if (act.skill) used[i][act.skill] = (used[i][act.skill] || 0) + 1; ev = r.resolved || ev; }
    }
    if (ev) { bots[0].observe(ev, 0); bots[1].observe(ev, 1); turns++; }
  }
  return { winner: s.winner, turns, rounds: s.round, la, lb, used };
}

// 1) same-level bots, random loadouts -> win rate when a skill is in the loadout
const N = 6000, stat = Object.fromEntries(SKILL_IDS.map(k => [k, { w: 0, n: 0, uses: 0 }]));
let p0 = 0, draws = 0, turnSum = 0, roundSum = 0;
for (let g = 0; g < N; g++) {
  const r = play(new Bot('normal', (R() * 1e9) | 0), new Bot('normal', (R() * 1e9) | 0));
  if (r.winner === 0) p0++; if (r.winner === null) draws++;
  turnSum += r.turns; roundSum += r.rounds;
  [r.la, r.lb].forEach((l, i) => l.forEach(k => { stat[k].n++; stat[k].uses += r.used[i][k] || 0; if (r.winner === i) stat[k].w++; else if (r.winner === null) stat[k].w += 0.5; }));
}
console.log(`same level: P1 wins ${(p0 / N * 100).toFixed(1)}%  draws ${(draws / N * 100).toFixed(1)}%  avg turns ${(turnSum / N).toFixed(1)}  avg rounds ${(roundSum / N).toFixed(2)}`);
for (const k of SKILL_IDS) console.log(`  ${k.padEnd(11)} win ${(stat[k].w / stat[k].n * 100).toFixed(1)}%  used ${(stat[k].uses / stat[k].n).toFixed(2)}/match`);
// 2) skill matters: hard bot vs random clicker, normal vs hard
for (const [name, mk] of [['hard vs human-like', () => [new Bot('hard', (R() * 1e9) | 0), habitPlayer()]], ['normal vs human-like', () => [new Bot('normal', (R() * 1e9) | 0), habitPlayer()]], ['easy vs human-like', () => [new Bot('easy', (R() * 1e9) | 0), habitPlayer()]], ['hard vs random', () => [new Bot('hard', (R() * 1e9) | 0), randomPlayer]], ['hard vs normal', () => [new Bot('hard', (R() * 1e9) | 0), new Bot('normal', (R() * 1e9) | 0)]], ['normal vs easy', () => [new Bot('normal', (R() * 1e9) | 0), new Bot('easy', (R() * 1e9) | 0)]]]) {
  let w = 0;
  for (let g = 0; g < 4000; g++) { const [a, b] = mk(); if (play(a, b).winner === 0) w++; }
  console.log(`${name}: ${(w / 40).toFixed(1)}%`);
}
