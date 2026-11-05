// Matchmaking, two pools in one queue table:
// - Ranked (wallets with Minds): pairs players close in rating, the gap widens the longer you wait; after 20 s a Hard bot.
// - Classic (everyone: trial accounts and holders together, unrated): queue rows are marked is_guest = true so
//   claim_opponent only pairs classic with classic; any rating; after 20 s a Normal bot.
import { db } from './db.js';
import { fail } from './http.js';
import { stillOwns } from './owned.js';
import { startMatch, forfeit, stillLive } from './game.js';
import { botFor } from './rating.js';
import { spendEnergy, emptyOf, outOfEnergy } from './energy.js';
import { spendPass, refundPass } from './rankpass.js';
import { spendLoaners, refundLoaners, emptyLoaners } from './loaners.js';

// a pick's Loaners ride in the queue row's loadout as 'lo:L1.L2' + 'ra:49.14' (their art ids inside minds)
export const loanTags = pick => pick.loans?.length ? [`lo:${pick.loans.join('.')}`, `ra:${pick.minds.filter(id => !pick.real.includes(id)).join('.')}`] : [];
export function pickOfRow(row) {
  const tag = k => ((row.loadout || []).find(t => typeof t === 'string' && t.startsWith(k)) || '').slice(k.length);
  const loans = tag('lo:') ? tag('lo:').split('.') : [], arts = tag('ra:') ? tag('ra:').split('.').map(Number) : [];
  return { minds: row.minds, loans, real: row.minds.filter(id => !arts.includes(id)) };
}

export const BOT_AFTER_SECONDS = 20;

export function cleanPick(body, allowed) {
  const minds = [...new Set((Array.isArray(body.minds) ? body.minds : []).map(Number))];
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
    if (m.v === 4 && idle > STALE_MS) { await forfeit(m.id, pid).catch(() => {}); continue; }   // walking away from a match counts as losing it
    if (m.v === 4 && idle > 20e3 && !(await stillLive(m.id, pid))) continue;   // missed turns settle first: a match both left is over
    if (m.v !== 4 || keep) {
      await db.update('matches', `id=eq.${m.id}&status=eq.live`, { status: 'abandoned', ended_at: new Date().toISOString() }).catch(() => {});
    } else keep = m.id;
  }
  return keep;
}

// try to pair player p (with pick) against someone waiting; returns a match id or null
// anyone still polling gets a bot after 20 s and leaves the queue, so an older row is someone who closed the game
const GONE_AFTER_MS = (BOT_AFTER_SECONDS + 15) * 1000;
export async function tryPair(p, pick, gap, dev, classic = false, usePass = false) {
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
  // (Rank Pass players play loaner Minds: no ownership check, and their pass pays instead of the tokens' energy)
  const opPass = (opp.loadout || []).includes('pass'), oPick = pickOfRow(opp);
  const myReal = usePass ? [] : pick.real || pick.minds, myLoans = pick.loans || [];
  if (!p.is_guest && myReal.length && !(await stillOwns(p.address, myReal))) fail(403, 'ownership changed, refresh your Minds');
  if (!op.is_guest && !opPass && oPick.real.length && !(await stillOwns(op.address, oPick.real))) return null;
  if (!classic) {
    if (opPass && !(await spendPass(op.id))) return null;           // the waiting player's pass ran dry: drop them
    if (usePass && !(await spendPass(p.id))) { if (opPass) await refundPass(op.id); await db.upsert('queue', opp, 'player_id'); fail(403, 'Your Rank Pass has no ranked games left today.'); }
    if (!(await spendLoaners(op.id, oPick.loans))) { if (opPass) await refundPass(op.id); if (usePass) await refundPass(p.id); return null; }
    if (!(await spendLoaners(p.id, myLoans))) {
      if (opPass) await refundPass(op.id); if (usePass) await refundPass(p.id); await refundLoaners(op.id, oPick.loans);
      await db.upsert('queue', opp, 'player_id');
      fail(403, `Loaner ${(await emptyLoaners(p.id, myLoans)).join(', ')} has no ranked games left today. Refill it or wait for 00:00 UTC.`);
    }
    const refund = async () => { if (opPass) await refundPass(op.id); if (usePass) await refundPass(p.id); await refundLoaners(op.id, oPick.loans); await refundLoaners(p.id, myLoans); };
    // ranked: both sides pay 1 energy per real Mind, together or not at all
    if (!(await spendEnergy([...myReal, ...(opPass ? [] : oPick.real)]))) {
      await refund();
      if (!opPass && (await emptyOf(oPick.real)).length) return null;          // the waiting player ran dry: drop them
      await db.upsert('queue', opp, 'player_id');
      fail(403, outOfEnergy(await emptyOf(myReal)));
    }
  }
  const m = await startMatch({ player: op, minds: opp.minds }, { player: p, ...pick }, { ranked: !classic && !p.is_guest });
  // tell the waiting player where to go
  await db.upsert('queue', { ...opp, match_id: m.id }, 'player_id');
  return m.id;
}

// ranked bots always play at Hard (no farming easy bots); practice uses the level you picked
export async function botMatch(p, pick, level, ranked = true, practice = false, usePass = false, extra = {}) {
  const r = ranked && !p.is_guest;
  if (r && usePass && !(await spendPass(p.id))) fail(403, 'Your Rank Pass has no ranked games left today.');
  const real = pick.real || pick.minds, loans = pick.loans || [];
  if (r && !usePass && !(await spendLoaners(p.id, loans))) fail(403, `Loaner ${(await emptyLoaners(p.id, loans)).join(', ')} has no ranked games left today.`);
  if (r && !usePass && !(await spendEnergy(real))) { await refundLoaners(p.id, loans); fail(403, outOfEnergy(await emptyOf(real))); }
  return (await startMatch({ player: p, ...pick }, null, { ranked: r, botLevel: r ? 'hard' : level || botFor(p.rating).level, practice, ...extra })).id;
}
