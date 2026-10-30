// Adventure: op 'start' rolls a wild island (seed + level) and remembers it in your island; op 'end' gets the
// ids of what you gathered and beat, checks them against the same seed (guarded chests need their guard beaten,
// a plausible amount for the time spent) and adds the loot. Knocked out = half. 5 a day (+1 per Mind, max +3).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { stillOwns } from '../owned.js';
import { advMap, advLoot, advPerDay, ADV_TIME } from '../../web/src/island/adventure.js';

const utcDay = () => new Date().toISOString().slice(0, 10);
const ids = a => [...new Set((Array.isArray(a) ? a : []).map(Number).filter(Number.isInteger))].slice(0, 80);

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await db.one('islands', `player_id=eq.${p.id}`);
    if (!row) fail(400, 'Open your island first.');
    const st = row.state, now = Date.now(), minds = p.is_guest ? 0 : row.minds || 0;
    let out;
    if (body.op === 'start') {
      const day = utcDay(), used = st.ad?.day === day ? st.ad.n : 0, max = advPerDay(minds);
      if (used >= max) fail(403, `You have been on all ${max} adventures today. More at 00:00 UTC.`);
      const lead = Number(body.mind);
      const heroKind = !p.is_guest && lead >= 1 && lead <= 3333 && (await stillOwns(p.address, [lead]).catch(() => false)) ? 'hero' : 'captain';
      const level = Math.max(1, Math.min(3, 1 + Math.floor((st.aw || 0) / 3)));
      st.adv = { seed: (Math.random() * 2 ** 31) | 0, level, heroKind, at: now };
      st.ad = { day, n: used + 1 };
      out = { seed: st.adv.seed, level, heroKind, left: max - used - 1 };
    } else if (body.op === 'end') {
      const adv = st.adv;
      if (!adv) fail(400, 'That adventure is over.');
      const secs = (now - adv.at) / 1000;
      const map = advMap(adv.seed, adv.level), got = ids(body.got), beat = ids(body.beat);
      // nobody gathers or beats more than about one thing per second out there
      if (got.length + beat.length > secs + 5 || secs > ADV_TIME + 120) fail(400, 'That adventure did not add up.');
      const loot = advLoot(map, got, beat);
      if (body.ko) for (const k of Object.keys(loot)) loot[k] = Math.floor(loot[k] / 2);
      for (const [k, n] of Object.entries(loot)) { if (k === 'dust') st.dust += n; else st.inv[k] = (st.inv[k] || 0) + n; }
      if (map.monsters.some(m => m.type === 'ogre' && beat.includes(m.id))) st.aw = (st.aw || 0) + 1;
      delete st.adv;
      out = { loot };
    } else fail(400, 'unknown adventure action');
    const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${row.rev}`, { state: st, rev: row.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return out;
  }
  fail(409, 'your island is busy, try again');
}, { limit: [30, 60] });
