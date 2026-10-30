// Balance check for island raids (real sim). Run: node tools/sim_raid.mjs
// A simple attacker: bombers at the nearest wall, giants first, then brawlers + archers, hero, spells on the crowd.
import { botVillage, createRaid, dropOk, replay, armyCap, cleanArmy } from '../web/src/island/raid.js';
import { TW, TH } from '../web/src/island/gen.js';
function plan(snap, army, smart) {
  const S = createRaid(snap, army), spots = [];
  for (let k = 0; k < TW * TH; k++) if (dropOk(S, k)) spots.push(k);
  const h = S.structs[0], d = k => Math.hypot((k % TW) * 16 - h.cx, ((k / TW) | 0) * 16 - h.cy);
  spots.sort((a, b) => d(a) - d(b));
  const ins = [], at = spots[smart ? 0 : (spots.length / 3) | 0];
  let t = 0;
  const order = smart ? ['giant', 'bomber', 'brawler', 'archer'] : ['brawler', 'archer', 'bomber', 'giant'];
  for (const k of order) for (let i = 0; i < (army.troops[k] || 0); i++) ins.push({ t: t += (k === 'giant' ? 15 : 3), drop: k, k: at });
  ins.push({ t: t + 10, drop: 'hero', k: at });
  if (smart) { ins.push({ t: t + 40, spell: 'rage', k: at }); ins.push({ t: t + 60, cry: 1 }); ins.push({ t: t + 140, spell: 'heal', k: at }); }
  return ins;
}
const armies = {
  'no Mind, 10 cap': { troops: cleanArmy({ brawler: 4, archer: 3, bomber: 1, giant: 0 }, armyCap(0)), hero: 'captain' },
  'no Mind, giant': { troops: cleanArmy({ brawler: 2, archer: 2, bomber: 1, giant: 1 }, armyCap(0)), hero: 'captain' },
  '1 Mind (11 cap)': { troops: cleanArmy({ brawler: 4, archer: 4, bomber: 1, giant: 0 }, armyCap(1)), hero: 'hero' },
  '3 Minds (13 cap)': { troops: cleanArmy({ brawler: 4, archer: 3, bomber: 1, giant: 1 }, armyCap(3)), hero: 'hero' },
};
for (const level of [1, 2, 3]) for (const [name, army] of Object.entries(armies)) for (const smart of [false, true]) {
  let stars = 0, pct = 0; const N = 8;
  for (let s = 1; s <= N; s++) { const snap = botVillage(1000 + s * 7919, level); const r = replay(snap, army, plan(snap, army, smart)); stars += r.stars; pct += r.pct; }
  console.log(`lvl ${level} ${name.padEnd(17)} ${smart ? 'smart' : 'lazy '}  stars ${(stars / N).toFixed(2)}  destroyed ${(pct / N * 100).toFixed(0)}%`);
}
