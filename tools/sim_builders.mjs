// Stress test for Minds-as-workers (owner 2026-11-05): random builds, upgrades, rushes, island work, time jumps and
// Mind / Loaner changes, checking the rules never break. Run: node tools/sim_builders.mjs [rounds]
import * as R from '../web/src/island/rules.js';
import { gen, COVER } from '../web/src/island/gen.js';

const ROUNDS = +process.argv[2] || 300, bugs = new Map(), did = {};
const bug = (what, info) => { if (!bugs.has(what)) bugs.set(what, info); };
let seedN = 1;
const rnd = () => { seedN = (seedN * 1103515245 + 12345) >>> 0; return seedN / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const BUILDS = Object.keys(R.BUILD).filter(k => (R.BUILD_SECS[k] || 0) > 0);

for (let run = 0; run < ROUNDS; run++) {
  const seed = 1000 + run, w = gen(seed);
  let now = 1.8e12 + run * 1e7;
  const st = R.newIsland(seed, now);
  Object.assign(st, { dust: 1e7, gems: 1e5 }); st.inv.wood = 1e6; st.inv.stone = 1e6;
  st.seenMinds = Array.from({ length: Math.floor(rnd() * 4) }, () => 1 + Math.floor(rnd() * 3333));
  st.loaners = []; for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) R.addLoaner(st, now, i === 0);
  const count = () => R.mindIds(st).length;
  const land = [...w.cover.keys()].filter(k => w.land?.[k]);
  for (let step = 0; step < 120; step++) {
    const ctx = { seed, now, minds: count(), queue: true }, roll = rnd();
    let r;
    try {
      if (roll < 0.25) r = R.act(st, { type: 'build', item: pick(BUILDS), tiles: [pick(land)] }, ctx);
      else if (roll < 0.4) { const b = pick((st.b || []).filter(b => R.UPGRADABLE[b.type]) || []); if (b) r = R.act(st, { type: 'upgrade', id: b.id }, ctx); }
      else if (roll < 0.47) { const b = pick((st.b || []).filter(b => b.done) || []); if (b) r = R.act(st, { type: 'rush', id: b.id }, ctx); }
      else if (roll < 0.75) { const k = pick([...w.cover.keys()].filter(k => w.cover[k] === COVER.WEEDS || w.cover[k] === COVER.ROCK)); if (k != null) r = R.act(st, { type: 'clear', tiles: [k], here: rnd() < 0.5 }, ctx); }
      else if (roll < 0.8) R.addLoaner(st, now);                                  // bought a Loaner
      else if (roll < 0.84) st.seenMinds = st.seenMinds.slice(1);                  // sold an NFT
      else if (roll < 0.87) st.seenMinds = [...st.seenMinds, 1 + Math.floor(rnd() * 3333)];
      else now += Math.floor(rnd() * 4 * 3600e3);                                  // time passes
      if (r) { const t = roll < 0.25 ? 'build' : roll < 0.4 ? 'upgrade' : roll < 0.47 ? 'rush' : 'clear'; did[t + (r.error ? ':refused' : ':ok')] = (did[t + (r.error ? ':refused' : ':ok')] || 0) + 1; if (r.error && /busy/.test(r.error)) did.busyRefusals = (did.busyRefusals || 0) + 1; }
      R.settleWork(st, { seed, now, minds: count() });
      Object.assign(st, R.normalize(st, seed, now));
    } catch (e) { bug('rules threw', `${e.message} (run ${run} step ${step})`); break; }
    // ---- invariants ----
    const live = (st.b || []).filter(b => b.done && b.done > now), map = R.builderOf(st, now), ids = R.mindIds(st);
    if (map.size > ids.length) bug('more builders than Minds', { run, step, map: map.size, ids: ids.length });
    if ([...map.keys()].some(k => !ids.includes(k))) bug('a build belongs to a Mind you no longer have', { run, step });
    if (new Set(map.values()).size !== map.size) bug('one build on two Minds', { run, step });
    if (live.length > R.builders(count()) && ids.length >= live.length) bug('more builds than builders', { run, step, live: live.length, b: R.builders(count()) });
    if (live.length && map.size < Math.min(live.length, ids.length)) bug('a running build has no Mind', { run, step });
    for (const b of st.b || []) if (!b.done && (b.by != null || b.start != null)) bug('finished build keeps a builder', { run, step, b });
    for (const j of st.q || []) { if (j.s != null && j.d < j.s) bug('job ends before it starts', { run, step, j }); if (!(j.d > 0)) bug('job without end', { run, step, j }); }
    if (st.dust < 0 || (st.gems || 0) < 0) bug('negative money', { run, step });
    if (r?.queued && live.length >= R.workLanes(count())) bug('island work queued while every Mind builds', { run, step, live: live.length, lanes: R.workLanes(count()) });
  }
}
console.log(JSON.stringify(did));
console.log(bugs.size ? `BUGS ${bugs.size}` : `OK ${ROUNDS} islands, no rule broke`);
for (const [k, v] of bugs) console.log('-', k, JSON.stringify(v).slice(0, 300));
process.exit(bugs.size ? 1 : 0);
