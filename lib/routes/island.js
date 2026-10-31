// Mind Island: load your island and apply farm actions (clear, till, plant, harvest, buy, sell).
// The rules live in web/src/island/rules.js so the browser shows results instantly and the server agrees.
import { route, fail, touch } from '../http.js';
import { db } from '../db.js';
import { balanceOf } from '../chain.js';
import { hashStr } from '../../web/src/island/gen.js';
import { newIsland, normalize, act, POINTS_PER_DUST, POINTS_DAY_CAP } from '../../web/src/island/rules.js';
import { runJobs } from '../../web/src/island/jobs.js';
import { npcRaid } from '../raiders.js';
import { freeBotName, BOT_TAG } from '../names.js';

const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
const utcDay = () => new Date().toISOString().slice(0, 10);

// how many Minds you own (one cheap balanceOf call, cached 10 minutes on the island row)
async function mindCount(p, row) {
  if (p.is_guest || !p.address) return { n: 0, fresh: false };
  if (row?.minds_at && Date.now() - Date.parse(row.minds_at) < 600e3) return { n: row.minds, fresh: false };
  try { return { n: Number(await within(balanceOf(p.address), 4000)), fresh: true }; }
  catch { return { n: row?.minds || 0, fresh: false }; }
}

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  touch(p);
  const acts = (Array.isArray(body.acts) ? body.acts : []).slice(0, 40);
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = Date.now();
    let row = await db.one('islands', `player_id=eq.${p.id}`);
    const minds = await mindCount(p, row);
    if (!row) {
      const seed = hashStr(p.id);
      try { row = await db.insert('islands', { player_id: p.id, seed, state: newIsland(seed, now), minds: minds.n, minds_at: minds.fresh ? new Date().toISOString() : null, rev: 0 }); }
      catch (e) { if (e.dbStatus === 409) continue; throw e; }   // made by another request just now
    }
    const seed = Number(row.seed), st = normalize(row.state, seed, now), before = JSON.stringify(row.state);
    const raided = npcRaid(st, seed, now);
    if (raided) raided.by = BOT_TAG + (await freeBotName(raided.npc));
    runJobs(st, { seed, now, minds: minds.n });
    const results = acts.map(a => act(st, a || {}, { seed, now, minds: minds.n }));
    // selling crops gives a few leaderboard points (fighting stays the main way to climb)
    let sold = 0;
    acts.forEach((a, i) => { if (a?.type === 'sell' && results[i].gain?.dust > 0) sold += results[i].gain.dust; });
    const day = utcDay(), used = row.pts_day === day ? row.pts_n : 0;
    let points = 0, carry = row.pts_carry || 0;
    if (sold && !p.is_guest) { carry += sold; points = Math.min(POINTS_DAY_CAP - used, Math.floor(carry / POINTS_PER_DUST)); carry %= POINTS_PER_DUST; }
    const changed = JSON.stringify(st) !== before || minds.fresh || sold;
    if (changed) {
      const patch = { state: st, rev: row.rev + 1, updated_at: new Date().toISOString() };
      if (minds.fresh) Object.assign(patch, { minds: minds.n, minds_at: new Date().toISOString() });
      if (sold && !p.is_guest) Object.assign(patch, { pts_day: day, pts_n: used + points, pts_carry: carry });
      const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${row.rev}`, patch);
      if (!saved.length) continue;   // saved from another tab in between: redo on the fresh copy
      row = saved[0];
    }
    if (points > 0) await db.update('players', `id=eq.${p.id}`, { points: p.points + points });
    const { raid: _secret, ...shown } = st;   // the raid you are on holds the target's hidden traps
    return { island: { seed, state: shown, minds: minds.n, rev: row.rev }, results, now, points, pointsToday: (row.pts_day === day ? row.pts_n : 0) };
  }
  fail(409, 'your island is busy, try again');
}, { limit: [120, 60] });
