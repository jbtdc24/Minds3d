// Balance simulator for Mind Summoners: bots play thousands of games with every deck, element and Hero
// Skill, and we look for anything that wins too often. Run: node tools/sim_summon.mjs [gamesPerPair]
import { CREATURES, HERO_SKILLS, RULES } from '../web/src/summon/cards.js';
import { createGame, resolve, validate, checkDeck } from '../web/src/summon/engine.js';
import { botAct } from '../web/src/summon/bot.js';

const N = +(process.argv[2] || 30);
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const fams = [...new Set(CREATURES.map(c => c.fam))];
const famCards = f => CREATURES.filter(c => c.fam === f);
const elOf = f => famCards(f)[0].el;
// decks: every pair of families (2 copies of each of their 6 cards), plus starter decks (no stage 3)
const decks = [];
for (let a = 0; a < fams.length; a++) for (let b = a + 1; b < fams.length; b++)
  decks.push({ name: `${fams[a]}+${fams[b]}`, fams: [fams[a], fams[b]], cards: [...famCards(fams[a]), ...famCards(fams[b])].flatMap(c => [c.id, c.id]) });
// (starter decks are ordinary complete decks: every player gets three for free, see the design doc)
for (const d of decks) { const e = checkDeck(d.cards); if (e) throw new Error(d.name + ': ' + e); }

const skills = Object.keys(HERO_SKILLS);
function play(d0, d1, opts = {}) {
  const pl = [d0, d1].map((d, i) => ({ name: d.name, deck: d.cards, skill: opts.skill?.[i] ?? skills[Math.floor(rnd() * skills.length)], el: opts.el?.[i] !== undefined ? opts.el[i] : elOf(d.fams[Math.floor(rnd() * 2)]) }));
  const s = createGame({ seed: Math.floor(rnd() * 1e9), players: pl });
  while (!s.over) {
    const acts = [0, 1].map(i => botAct(s, i, { rand: rnd, noise: 0.5 }));
    acts.forEach((a, i) => { const e = validate(s, i, a); if (e) throw new Error(e); });
    resolve(s, acts);
  }
  return { winner: s.winner, turns: s.turn, hp: s.p.map(p => p.hp), skills: pl.map(p => p.skill), els: pl.map(p => p.el) };
}

const stat = () => ({ w: 0, g: 0 });
const add = (o, k, win) => { (o[k] ||= stat()); o[k].g++; o[k].w += win; };
const famS = {}, elS = {}, skillS = {}, deckS = {}, affS = {};
let turns = 0, games = 0, draws = 0, hpLeft = 0;
const t0 = Date.now();
for (let a = 0; a < decks.length; a++) for (let b = a + 1; b < decks.length; b++) {
  for (let k = 0; k < N; k++) {
    const [x, y] = k % 2 ? [decks[b], decks[a]] : [decks[a], decks[b]];
    const r = play(x, y);
    games++; turns += r.turns; if (r.winner === null) draws++; else hpLeft += r.hp[r.winner];
    [x, y].forEach((d, i) => {
      const win = r.winner === null ? 0.5 : r.winner === i ? 1 : 0;
      add(deckS, d.name, win);
      if (!d.starter) d.fams.forEach(f => add(famS, f, win));
      add(skillS, r.skills[i], win);
      add(affS, d.fams.some(f => elOf(f) === r.els[i]) ? 'affinity matches deck' : 'affinity off-deck', win);
    });
  }
}
const pct = o => Object.entries(o).map(([k, v]) => [k, Math.round(v.w / v.g * 1000) / 10, v.g]).sort((a, b) => b[1] - a[1]);
const show = (title, o) => { console.log(`\n${title}`); for (const [k, p, g] of pct(o)) console.log(`  ${k.padEnd(24)} ${String(p).padStart(5)}%  (${g})`); };
console.log(`${games} games in ${((Date.now() - t0) / 1000).toFixed(1)}s · avg ${(turns / games).toFixed(1)} turns · draws ${(draws / games * 100).toFixed(1)}% · winner HP left ${(hpLeft / (games - draws)).toFixed(1)}`);
show('Families (deck containing it)', famS);
show('Hero Skills', skillS);
show('Element affinity', affS);
show('Decks', deckS);

// how much does the Mind itself matter? same deck on both sides, only the hero differs
if (process.argv.includes('--hero')) {
  const aff = {}, per = {};
  for (const d of decks) for (let k = 0; k < 96; k++) {
    const el = elOf(d.fams[k % 2]), sk = skills[k % skills.length], seat = k % 2;   // alternate seats too
    const pair = (x, y) => seat ? [y, x] : [x, y], won = r => r.winner === null ? 0.5 : r.winner === seat ? 1 : 0;
    add(aff, 'affinity vs none', won(play(d, d, { el: pair(el, null), skill: pair('none', 'none') })));
    add(per, sk, won(play(d, d, { el: pair(null, null), skill: pair(sk, 'none') })));
  }
  show('Mirror match: element affinity', aff);
  show('Mirror match: this Hero Skill vs no skill', per);
}
// seat check: identical players, nothing different but the seat (must be ~50%)
if (process.argv.includes('--seat')) {
  const o = {};
  for (const d of decks) for (let k = 0; k < 48; k++) { const r = play(d, d, { el: [null, null], skill: ['none', 'none'] }); add(o, 'seat 0 wins', r.winner === null ? 0.5 : r.winner === 0 ? 1 : 0); }
  show('Seat check (identical players)', o);
}
