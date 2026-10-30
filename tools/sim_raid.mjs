// Balance check for island raids (real sim). Run: node tools/sim_raid.mjs
import { botVillage, createRaid, input, step, score, dropOk, replay } from '../web/src/island/raid.js';
import { TW, TH } from '../web/src/island/gen.js';
function plan(snap, n, spells) {
  const S = createRaid(snap, n), spots = [];
  for (let k = 0; k < TW * TH; k++) if (dropOk(S, k)) spots.push(k);
  // closest drop spots to the home
  const h = S.structs[0];
  spots.sort((a, b) => Math.hypot((a % TW) * 16 - h.cx, ((a / TW) | 0) * 16 - h.cy) - Math.hypot((b % TW) * 16 - h.cx, ((b / TW) | 0) * 16 - h.cy));
  const ins = [];
  for (let i = 0; i < n; i++) ins.push({ t: i * 5, drop: i, k: spots[i * 3] });
  if (spells) { ins.push({ t: 40, spell: 'rage', k: spots[0] }); ins.push({ t: 120, spell: 'heal', k: spots[0] }); }
  return ins;
}
for (const level of [1, 2, 3]) for (const n of [1, 2, 3]) for (const spells of [false, true]) {
  let stars = 0, pct = 0, N = 6;
  for (let s = 1; s <= N; s++) {
    const snap = botVillage(1000 + s * 7919, level);
    const r = replay(snap, n, plan(snap, n, spells));
    stars += r.stars; pct += r.pct;
  }
  console.log(`level ${level} raiders ${n} spells ${spells ? 'Y' : 'N'}  avg stars ${(stars / N).toFixed(2)}  destroyed ${(pct / N * 100).toFixed(0)}%`);
}
