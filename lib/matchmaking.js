// Matchmaking: one queue for everyone. Pairs players close in rating; the allowed gap widens the longer
// you wait; after 20 s you get a rating-matched bot (clearly labelled).
import { db } from './db.js';
import { fail } from './http.js';
import { stillOwns } from './owned.js';
import { startMatch } from './game.js';
import { botFor } from './rating.js';

export const BOT_AFTER_SECONDS = 20;

export function cleanPick(body, allowed) {
  const minds = [...new Set((body.minds || []).map(Number))];
  if (minds.length < 1 || minds.length > 3) fail(400, 'bring 1 to 3 Minds');
  if (minds.some(m => !allowed.includes(m))) fail(403, 'you can only play Minds you own');
  return { minds };
}

// a live match from an older rules version, or one nobody touched for 30 min, is closed without a result
// (otherwise the player is sent back into a match the server can no longer play)
const STALE_MS = 30 * 60_000;
export async function liveMatchOf(pid) {
  const live = await db.select('matches', `or=(p0.eq.${pid},p1.eq.${pid})&status=eq.live&select=id,created_at,deadline,v:state->v&order=created_at.desc&limit=5`);
  let keep = null;
  for (const m of live) {
    const idle = Date.now() - Date.parse(m.deadline || m.created_at);
    if (m.v !== 3 || idle > STALE_MS || keep) {
      await db.update('matches', `id=eq.${m.id}&status=eq.live`, { status: 'abandoned', ended_at: new Date().toISOString() }).catch(() => {});
    } else keep = m.id;
  }
  return keep;
}

// try to pair player p (with pick) against someone waiting; returns a match id or null
export async function tryPair(p, pick, gap, dev) {
  const [opp] = await db.rpc('claim_opponent', { me: p.id, my_rating: p.rating, my_guest: p.is_guest, max_gap: Math.round(gap) });
  if (!opp) return null;
  // same connection = probably the same person on two accounts: put them back, never pair them
  if (dev && (opp.loadout || []).includes(dev)) { await db.upsert('queue', opp, 'player_id'); return null; }
  const op = await db.one('players', `id=eq.${opp.player_id}`);
  // fresh on-chain check for both wallets right before a ranked match
  if (!p.is_guest && !(await stillOwns(p.address, pick.minds))) fail(403, 'ownership changed, refresh your Minds');
  if (!op.is_guest && !(await stillOwns(op.address, opp.minds))) return null;
  const m = await startMatch({ player: op, minds: opp.minds }, { player: p, ...pick }, { ranked: !p.is_guest });
  // tell the waiting player where to go
  await db.upsert('queue', { player_id: op.id, rating: op.rating, is_guest: op.is_guest, minds: opp.minds, loadout: [], match_id: m.id }, 'player_id');
  return m.id;
}

// ranked bots always play at Hard (no farming easy bots); practice uses the level you picked
export async function botMatch(p, pick, level, ranked = true) {
  const r = ranked && !p.is_guest;
  return (await startMatch({ player: p, ...pick }, null, { ranked: r, botLevel: r ? 'hard' : level || botFor(p.rating).level })).id;
}
