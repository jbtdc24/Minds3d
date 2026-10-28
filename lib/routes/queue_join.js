// Join matchmaking with 1-3 Minds and a 4-skill loadout (or start a practice match vs a bot).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { ownedMinds, DEMO_MINDS } from '../owned.js';
import { cleanPick, liveMatchOf, tryPair, botMatch } from '../matchmaking.js';

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const live = await liveMatchOf(p.id);
  if (live) return { match: live };
  const pick = cleanPick(body, p.is_guest ? DEMO_MINDS : await ownedMinds(p.address));
  // practice vs a chosen bot level never changes rating
  if (body.bot) return { match: await botMatch(p, pick, ['easy', 'normal', 'hard'].includes(body.bot) ? body.bot : null, false), bot: true };
  const m = await tryPair(p, pick, 150);
  if (m) return { match: m };
  await db.upsert('queue', { player_id: p.id, rating: p.rating, is_guest: p.is_guest, minds: pick.minds, loadout: pick.loadout, joined_at: new Date().toISOString(), match_id: null }, 'player_id');
  return { waiting: true, waited: 0 };
}, { limit: [20, 60] });
