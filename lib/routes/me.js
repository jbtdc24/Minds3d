// Who am I + which Minds can I play (re-read from the chain).
import { route, publicPlayer, fail, touch } from '../http.js';
import { db } from '../db.js';
import { ownedMinds, DEMO_MINDS } from '../owned.js';

export default route(async ({ session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  touch(p);
  const live = await db.select('matches', `or=(p0.eq.${p.id},p1.eq.${p.id})&status=eq.live&select=id&order=created_at.desc&limit=1`);
  return { player: publicPlayer(p), minds: p.is_guest ? DEMO_MINDS : await ownedMinds(p.address), guest: p.is_guest, liveMatch: live[0]?.id || null };
}, { methods: ['GET'] });
