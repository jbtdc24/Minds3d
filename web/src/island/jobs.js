// Mind jobs: give any Mind you own a job and it keeps working while you are away. The same rules as playing by hand:
// a job calls act(), so crops still take their time, seeds and Dust are still spent, and nothing is free.
// A Mind does one round every 30 minutes and gets tired after 8 hours, so it pays to come back.
import { act, coverAt, DROPS, ripe, troopCount, TROOP_MAX, CROPS, wellShards } from './rules.js';
import { gen, TW, TH, hash } from './gen.js';

export const JOB_MS = 30 * 60e3, JOB_SHIFT = 16, LOG_MAX = 20;
export const jobSlots = minds => Math.max(1, Math.min(10, minds | 0));    // 1 helper for everyone, 1 per Mind you own (max 10)
export const JOBS = {
  rest: { name: 'Rest', icon: '💤', desc: 'Hang around the island.' },
  farmer: { name: 'Farmer', icon: '🧺', desc: 'Harvests ripe crops and replants them.' },
  woodcutter: { name: 'Woodcutter', icon: '🪓', desc: 'Clears wild ground for Dust, wood and stone.' },
  keeper: { name: 'Well Keeper', icon: '⚡', desc: 'Collects Energy Well shards.' },
  trainer: { name: 'Drill Sergeant', icon: '🏹', desc: 'Trains troops with spare Dust (keeps 500 ✨).' },
  scout: { name: 'Scout', icon: '🧭', desc: 'Looks around nearby islands for small finds.' },
};

function farmRound(st, ctx, j) {
  const tiles = Object.keys(st.tiles).map(Number).filter(k => st.tiles[k].s === 'p' && ripe(st.tiles[k], ctx.now, ctx.minds)).slice(0, 8);
  const crops = {};
  for (const k of tiles) crops[k] = st.tiles[k].c;
  const got = tiles.length ? act(st, { type: 'harvest', tiles }, ctx).done || 0 : 0;
  const empty = Object.keys(st.tiles).map(Number).filter(k => st.tiles[k].s === 'p' && !st.tiles[k].c).slice(0, 8);
  let planted = 0;
  for (const k of empty) {
    const crop = CROPS[j.crop] ? j.crop : crops[k] || Object.keys(CROPS).find(c => st.inv['seed_' + c] > 0);
    if (crop && act(st, { type: 'plant', crop, tiles: [k] }, ctx).done) planted++;
  }
  return { harvested: got, planted };
}
function chopRound(st, ctx, w) {
  const start = (hash(ctx.seed, ctx.now % 9973, 77) * TW * TH) | 0, tiles = [];
  for (let i = 0; i < TW * TH && tiles.length < 3; i++) {
    const k = (start + i * 37) % (TW * TH);
    if (w.land[k] && DROPS[coverAt(st, w, k)]) tiles.push(k);
  }
  return { cleared: tiles.length ? act(st, { type: 'clear', tiles }, ctx).done || 0 : 0 };
}
function drillRound(st, ctx) {
  if (st.dust < 560 || troopCount(st) >= TROOP_MAX * 0.75) return {};
  const item = troopCount(st) % 3 === 2 ? 'troop_archer' : 'troop_brawler';
  return { trained: act(st, { type: 'shop', item, n: 1 }, ctx).done || 0 };
}
function scoutRound(st, ctx, id) {
  const r = i => hash(ctx.seed + id, ctx.now % 104729, i), dust = 6 + (r(1) * 9 | 0);
  st.dust += dust;
  const herb = r(2) < 0.2 ? 1 : 0;
  if (herb) st.inv.herb = (st.inv.herb || 0) + 1;
  return { found: dust, herbs: herb };
}
const SAY = {
  harvested: n => `harvested ${n} crop${n > 1 ? 's' : ''}`, planted: n => `planted ${n}`, cleared: n => `cleared ${n} tile${n > 1 ? 's' : ''}`,
  trained: n => `trained ${n} troop${n > 1 ? 's' : ''}`, found: n => `found ${n} ✨`, herbs: n => `found ${n} herb${n > 1 ? 's' : ''}`, shards: n => `collected ${n} ⚡ shard${n > 1 ? 's' : ''}`,
};
// run everything owed since each Mind's last round; the server does this whenever the island is opened
export function runJobs(st, { seed, now, minds = 0 }) {
  if (!st.jobs) return 0;
  const w = gen(seed);
  let rounds = 0;
  for (const [idTxt, j] of Object.entries(st.jobs)) {
    const id = +idTxt;
    let n = Math.floor((now - j.at) / JOB_MS);
    if (n < 1) continue;
    n = Math.min(n, JOB_SHIFT);
    const total = {};
    const from = Math.max(j.at, now - JOB_SHIFT * JOB_MS);
    for (let i = 1; i <= n; i++) {
      const ctx = { seed, now: from + i * JOB_MS, minds };
      const res = j.job === 'farmer' ? farmRound(st, ctx, j) : j.job === 'woodcutter' ? chopRound(st, ctx, w) : j.job === 'trainer' ? drillRound(st, ctx) : j.job === 'scout' ? scoutRound(st, ctx, id) : {};
      if (j.job === 'keeper' && i === n && wellShards(st, ctx.now) > 0) res.shards = act(st, { type: 'well' }, ctx).done || 0;
      for (const [k, v] of Object.entries(res)) total[k] = (total[k] || 0) + v;
      rounds++;
    }
    j.at = now - ((now - j.at) % JOB_MS);
    const text = Object.entries(total).filter(([, v]) => v).map(([k, v]) => SAY[k](v)).join(', ');
    if (text) st.jobLog = [{ at: now, id, text }, ...(st.jobLog || [])].slice(0, LOG_MAX);
  }
  return rounds;
}

// what a typed message means. Real words first; anything else gets a friendly "?" from the Mind.
const WORDS = [
  [/\b(farm|harvest|plant|crop|seed|melon|carrot|bean)/, 'farmer'], [/\b(chop|cut|clear|wood|tree|stone|rock|grass|weed|mine|grind)/, 'woodcutter'],
  [/\b(well|shard|energy)/, 'keeper'], [/\b(train|troop|army|soldier|drill)/, 'trainer'], [/\b(scout|explore|look around|search|adventure|find)/, 'scout'],
  [/\b(rest|stop|sleep|relax|nothing|chill)/, 'rest'],
];
export function parseTask(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(how are you|how r u|you ok|hello|hi|hey|gm)\b/.test(t)) return { talk: 'hello' };
  if (/\b(what are you doing|what.?s your job|status|report|doing)\b/.test(t)) return { talk: 'status' };
  for (const [re, job] of WORDS) if (re.test(t)) {
    const crop = job === 'farmer' ? Object.keys(CROPS).find(c => t.includes(c)) : null;
    return { job, ...(crop ? { crop } : {}) };
  }
  return { talk: 'confused' };
}
