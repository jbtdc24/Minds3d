// While waiting: matched yet? Widen the rating gap over time; after 20 s start a bot match.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { tryPair, botMatch, BOT_AFTER_SECONDS } from '../matchmaking.js';

export default route(async ({ session }) => {
  const q = await db.one('queue', `player_id=eq.${session.pid}`);
  if (!q) return { idle: true };
  if (q.match_id) { await db.remove('queue', `player_id=eq.${session.pid}`); return { match: q.match_id }; }
  const waited = (Date.now() - new Date(q.joined_at)) / 1000;
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const pick = { minds: q.minds, loadout: q.loadout };
  const m = await tryPair(p, pick, 150 + waited * 25);
  if (m) { await db.remove('queue', `player_id=eq.${p.id}`); return { match: m }; }
  if (waited >= BOT_AFTER_SECONDS) {
    await db.remove('queue', `player_id=eq.${p.id}`);
    return { match: await botMatch(p, pick), bot: true };
  }
  return { waiting: true, waited: Math.round(waited), botIn: Math.max(0, Math.round(BOT_AFTER_SECONDS - waited)) };
}, { limit: [90, 60] });
