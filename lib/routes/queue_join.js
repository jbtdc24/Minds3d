// Join matchmaking with 1-3 Minds (or start a practice match vs a bot).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { stillOwns, DEMO_MINDS } from '../owned.js';
import { cleanPick, liveMatchOf, tryPair, botMatch } from '../matchmaking.js';

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const live = await liveMatchOf(p.id);
  if (live) return { match: live };
  // wallets: only the 1-3 picked Minds are checked on-chain (fast), not the whole collection
  const asked = [...new Set((body.minds || []).map(Number))].filter(n => n >= 1 && n <= 3333).slice(0, 3);
  const pick = cleanPick(body, p.is_guest ? DEMO_MINDS : (await stillOwns(p.address, asked).catch(() => false)) ? asked : []);
  // practice vs a chosen bot level never changes rating
  if (body.bot) return { match: await botMatch(p, pick, ['easy', 'normal', 'hard'].includes(body.bot) ? body.bot : null, false), bot: true };
  const m = await tryPair(p, pick, 150);
  if (m) return { match: m };
  await db.upsert('queue', { player_id: p.id, rating: p.rating, is_guest: p.is_guest, minds: pick.minds, loadout: [], joined_at: new Date().toISOString(), match_id: null }, 'player_id');
  return { waiting: true, waited: 0 };
}, { limit: [20, 60] });
