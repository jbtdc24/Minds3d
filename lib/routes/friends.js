// Your friends (accepted + pending requests), who is online, and when each last messaged you.
import { route, fail, publicPlayer, touch } from '../http.js';
import { db } from '../db.js';

export default route(async ({ session }) => {
  const me = await db.one('players', `id=eq.${session.pid}`);
  if (!me) fail(401, 'account not found');
  touch(me);
  if (me.is_guest) return { friends: [], guest: true };
  const rows = await db.select('friends', `or=(a.eq.${me.id},b.eq.${me.id})&limit=200`);
  const ids = rows.map(r => r.a === me.id ? r.b : r.a);
  const people = ids.length ? Object.fromEntries((await db.select('players', `id=in.(${ids.join(',')})`)).map(p => [p.id, p])) : {};
  const inbox = await db.select('messages', `to_id=eq.${me.id}&select=from_id,created_at&order=created_at.desc&limit=300`);
  const lastFrom = {};
  for (const m of inbox) lastFrom[m.from_id] ||= m.created_at;
  return {
    friends: rows.filter(r => people[r.a === me.id ? r.b : r.a]).map(r => {
      const other = r.a === me.id ? r.b : r.a;
      return { player: publicPlayer(people[other]), status: r.status, incoming: r.status === 'pending' && r.b === me.id, lastMsgAt: lastFrom[other] || null };
    }),
  };
}, { methods: ['GET'], limit: [60, 60] });
