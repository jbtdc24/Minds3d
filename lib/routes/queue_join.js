// Join matchmaking with 1-3 Minds: ranked (wallets), classic (everyone, unrated) or a practice match vs a bot.
import { route, fail, deviceKey } from '../http.js';
import { db } from '../db.js';
import { stillOwns, DEMO_MINDS } from '../owned.js';
import { cleanPick, liveMatchOf, tryPair, botMatch } from '../matchmaking.js';
import { emptyOf, outOfEnergy } from '../energy.js';

export default route(async ({ req, body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const live = await liveMatchOf(p.id);
  if (live) return { match: live };
  // wallets: only the 1-3 picked Minds are checked on-chain (fast), not the whole collection
  const asked = [...new Set((body.minds || []).map(Number))].filter(n => n >= 1 && n <= 3333).slice(0, 3);
  const pick = cleanPick(body, p.is_guest ? DEMO_MINDS : (await stillOwns(p.address, asked).catch(() => false)) ? asked : []);
  // practice vs a chosen bot level never changes rating; trial accounts can practice or play classic
  const classic = body.mode === 'classic';
  if (!body.bot && !classic && p.is_guest) fail(403, 'connect a wallet to play ranked');
  if (body.bot) return { match: await botMatch(p, pick, ['easy', 'normal', 'hard'].includes(body.bot) ? body.bot : null, false), bot: true };
  if (!classic) { const empty = await emptyOf(pick.minds); if (empty.length) fail(403, outOfEnergy(empty)); }   // ranked costs energy
  const dev = deviceKey(req);
  const m = await tryPair(p, pick, 150, dev, classic);
  if (m) return { match: m };
  await db.upsert('queue', { player_id: p.id, rating: classic ? 1000 : p.rating, is_guest: classic, minds: pick.minds, loadout: [dev], joined_at: new Date().toISOString(), match_id: null }, 'player_id');
  return { waiting: true, waited: 0 };
}, { limit: [20, 60] });
