// Who am I + which Minds can I play (re-read from the chain).
import { route, publicPlayer, fail, touch } from '../http.js';
import { db } from '../db.js';
import { ownedMinds, DEMO_MINDS } from '../owned.js';
import { liveMatchOf } from '../matchmaking.js';
import { energyLeft } from '../energy.js';
import { msToReset } from '../../web/src/energy.js';

export default route(async ({ session, query }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  touch(p);
  const live = await liveMatchOf(p.id);
  const known = String(query.known || '').split(',').map(Number).filter(n => n >= 1 && n <= 3333).slice(0, 500);
  const minds = p.is_guest ? DEMO_MINDS : await ownedMinds(p.address, known);
  return { player: publicPlayer(p), minds, guest: p.is_guest, liveMatch: live, energy: p.is_guest ? {} : await energyLeft(minds), energyResetIn: msToReset() };
}, { methods: ['GET'] });
