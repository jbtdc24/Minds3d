// Matchmaking, two pools in one queue table:
// - Ranked (wallets with Minds): pairs players close in rating, the gap widens the longer you wait; after 20 s a Hard bot.
// - Classic (everyone: trial accounts and holders together, unrated): queue rows are marked is_guest = true so
//   claim_opponent only pairs classic with classic; any rating; after 20 s a Normal bot.
import { db } from './db.js';
import { fail } from './http.js';
import { stillOwns } from './owned.js';
import { startMatch } from './game.js';
import { botFor } from './rating.js';
import { spendEnergy, emptyOf, outOfEnergy } from './energy.js';
import { V, DECK_IDS } from '../web/src/summon/match.js';

export const BOT_AFTER_SECONDS = 20;

// a pick = your summoner Mind + one of the starter decks
export function cleanPick(body, allowed) {
  const minds = [...new Set((body.minds || []).map(Number))].slice(0, 1);
  if (!minds.length) fail(400, 'pick your Mind');
  if (minds.some(m => !allowed.includes(m))) fail(403, 'you can only play Minds you own');
  return { minds, deck: DECK_IDS.includes(body.deck) ? body.deck : DECK_IDS[0] };
}

// a live match from an older rules version, or one nobody touched for 30 min, is closed without a result
// (otherwise the player is sent back into a match the server can no longer play)
const STALE_MS = 30 * 60_000;
export async function liveMatchOf(pid) {
  const live = await db.select('matches', `or=(p0.eq.${pid},p1.eq.${pid})&status=eq.live&select=id,created_at,deadline,v:state->v&order=created_at.desc&limit=5`);
  let keep = null;
  for (const m of live) {
    const idle = Date.now() - Date.parse(m.deadline || m.created_at);
    if (m.v !== V || idle > STALE_MS || keep) {
      await db.update('matches', `id=eq.${m.id}&status=eq.live`, { status: 'abandoned', ended_at: new Date().toISOString() }).catch(() => {});
    } else keep = m.id;
  }
  return keep;
}

// try to pair player p (with pick) against someone waiting; returns a match id or null
// anyone still polling gets a bot after 20 s and leaves the queue, so an older row is someone who closed the game
const GONE_AFTER_MS = (BOT_AFTER_SECONDS + 15) * 1000;
export async function tryPair(p, pick, gap, dev, classic = false) {
  let opp;
  for (let tries = 0; tries < 4; tries++) {      // claim_opponent removes the row it returns: stale ones just disappear
    [opp] = await db.rpc('claim_opponent', classic ? { me: p.id, my_rating: 1000, my_guest: true, max_gap: 1e6 }
      : { me: p.id, my_rating: p.rating, my_guest: false, max_gap: Math.round(gap) });
    if (!opp || Date.now() - Date.parse(opp.joined_at) < GONE_AFTER_MS) break;
    opp = null;
  }
  if (!opp) return null;
  // same connection = probably the same person on two accounts: put them back, never pair them
  if (dev && (opp.loadout || []).includes(dev)) { await db.upsert('queue', opp, 'player_id'); return null; }
  const op = await db.one('players', `id=eq.${opp.player_id}`);
  // fresh on-chain check for both wallets right before a ranked match
  if (!p.is_guest && !(await stillOwns(p.address, pick.minds))) fail(403, 'ownership changed, refresh your Minds');
  if (!op.is_guest && !(await stillOwns(op.address, opp.minds))) return null;
  // ranked: both sides pay 1 energy per Mind, together or not at all
  if (!classic && !(await spendEnergy([...pick.minds, ...opp.minds]))) {
    if ((await emptyOf(opp.minds)).length) return null;          // the waiting player ran dry: drop them
    await db.upsert('queue', opp, 'player_id');
    fail(403, outOfEnergy(await emptyOf(pick.minds)));
  }
  const m = await startMatch({ player: op, minds: opp.minds, deck: (opp.loadout || [])[1] }, { player: p, ...pick }, { ranked: !classic && !p.is_guest });
  // tell the waiting player where to go
  await db.upsert('queue', { ...opp, match_id: m.id }, 'player_id');
  return m.id;
}

// ranked bots always play at Hard (no farming easy bots); practice uses the level you picked
export async function botMatch(p, pick, level, ranked = true) {
  const r = ranked && !p.is_guest;
  if (r && !(await spendEnergy(pick.minds))) fail(403, outOfEnergy(await emptyOf(pick.minds)));
  return (await startMatch({ player: p, ...pick }, null, { ranked: r, botLevel: r ? 'hard' : level || botFor(p.rating).level })).id;
}
