// Matchmaking: one queue for everyone. Pairs players close in rating; the allowed gap widens the longer
// you wait; after 20 s you get a rating-matched bot (clearly labelled).
import { db } from './db.js';
import { fail } from './http.js';
import { stillOwns } from './owned.js';
import { startMatch } from './game.js';
import { botFor } from './rating.js';
import { SKILLS, RULES } from '../web/src/duel/engine.js';

export const BOT_AFTER_SECONDS = 20;

export function cleanPick(body, allowed) {
  const minds = [...new Set((body.minds || []).map(Number))];
  const loadout = [...new Set((body.loadout || []).map(String))];
  if (minds.length < 1 || minds.length > 3) fail(400, 'bring 1 to 3 Minds');
  if (minds.some(m => !allowed.includes(m))) fail(403, 'you can only play Minds you own');
  if (loadout.length !== RULES.loadoutSize || loadout.some(k => !SKILLS[k])) fail(400, 'pick 4 different skills');
  return { minds, loadout };
}

export async function liveMatchOf(pid) {
  const live = await db.select('matches', `or=(p0.eq.${pid},p1.eq.${pid})&status=eq.live&select=id&limit=1`);
  return live[0]?.id || null;
}

// try to pair player p (with pick) against someone waiting; returns a match id or null
export async function tryPair(p, pick, gap) {
  const [opp] = await db.rpc('claim_opponent', { me: p.id, my_rating: p.rating, my_guest: p.is_guest, max_gap: Math.round(gap) });
  if (!opp) return null;
  const op = await db.one('players', `id=eq.${opp.player_id}`);
  // fresh on-chain check for both wallets right before a ranked match
  if (!p.is_guest && !(await stillOwns(p.address, pick.minds))) fail(403, 'ownership changed, refresh your Minds');
  if (!op.is_guest && !(await stillOwns(op.address, opp.minds))) return null;
  const m = await startMatch({ player: op, minds: opp.minds, loadout: opp.loadout }, { player: p, ...pick }, { ranked: !p.is_guest });
  // tell the waiting player where to go
  await db.upsert('queue', { player_id: op.id, rating: op.rating, is_guest: op.is_guest, minds: opp.minds, loadout: opp.loadout, match_id: m.id }, 'player_id');
  return m.id;
}

export async function botMatch(p, pick, level, ranked = true) {
  return (await startMatch({ player: p, ...pick }, null, { ranked: ranked && !p.is_guest, botLevel: level || botFor(p.rating).level })).id;
}
