// Who am I + which Minds can I play (re-read from the chain).
import { route, publicPlayer, fail, touch } from '../http.js';
import { db } from '../db.js';
import { ownedMinds, rememberedMinds, DEMO_MINDS } from '../owned.js';
import { liveMatchOf } from '../matchmaking.js';
import { energyLeft } from '../energy.js';
import { msToReset } from '../../web/src/energy.js';
import { passOf, PASS_MINDS } from '../rankpass.js';
import { giveFreeLoaner, loanersOf } from '../loaners.js';

export default route(async ({ session, query }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  touch(p);
  const live = await liveMatchOf(p.id);
  const known = String(query.known || '').split(',').map(Number).filter(n => n >= 1 && n <= 3333).slice(0, 500);
  let minds = p.is_guest ? DEMO_MINDS : await ownedMinds(p.address, known);
  if (!p.is_guest) {   // remember the Minds we found (on the island); a lookup that comes back empty re-checks those instead
    const isl = await db.one('islands', `player_id=eq.${p.id}&select=rev,seen:state->seenMinds,ai:state->ap->ai`).catch(() => null);
    const seen = [...new Set([...(Array.isArray(isl?.seen) ? isl.seen : []), ...Object.keys(isl?.ai || {})].map(Number).filter(n => n >= 1 && n <= 3333))];   // Minds that have an AI count too
    if (!minds.length && seen.length) minds = await rememberedMinds(p.address, seen);
    else if (minds.length && isl && minds.join() !== seen.join()) {
      const row = await db.one('islands', `player_id=eq.${p.id}&select=state,rev`).catch(() => null);
      if (row) await db.update('islands', `player_id=eq.${p.id}&rev=eq.${row.rev}`, { state: { ...row.state, seenMinds: minds }, rev: row.rev + 1, updated_at: new Date().toISOString() }).catch(() => {});
    }
  }
  const pass = p.is_guest ? null : await passOf(p.id);
  let loaners = [];
  if (!p.is_guest) { await giveFreeLoaner(p.id).catch(() => {}); loaners = await loanersOf(p.id).catch(() => []); }   // 🪪 every wallet player has one free Loaner
  return { loaners, player: publicPlayer(p), minds, guest: p.is_guest, liveMatch: live, rankPass: pass?.active ? { ...pass, minds: PASS_MINDS } : null, energy: p.is_guest ? {} : await energyLeft(minds), energyResetIn: msToReset() };
}, { methods: ['GET'] });
