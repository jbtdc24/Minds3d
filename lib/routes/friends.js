// Your friends (accepted + pending requests), who is online, and when each last messaged you.
import { route, fail, publicPlayer, touch } from '../http.js';
import { db } from '../db.js';
import { looksOf } from '../looks.js';

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
  // people who are not friends but messaged you (from Mind Town); blocked ones have a friends row, so they never show here
  const known = new Set(ids), strangerIds = Object.keys(lastFrom).filter(id => !known.has(id)).slice(0, 30);
  const strangers = strangerIds.length ? await db.select('players', `id=in.(${strangerIds.join(',')})&is_guest=eq.false`) : [];
  const looks = await looksOf([...ids, ...strangerIds]);
  return {
    friends: rows.filter(r => people[r.a === me.id ? r.b : r.a]).map(r => {
      const other = r.a === me.id ? r.b : r.a;
      return { player: { ...publicPlayer(people[other]), cos: looks[other] || null }, status: r.status, incoming: r.status === 'pending' && r.b === me.id, lastMsgAt: lastFrom[other] || null };
    }).filter(f => f.status !== 'blocked'),
    chats: strangers.map(p => ({ player: { ...publicPlayer(p), cos: looks[p.id] || null }, status: 'chat', lastMsgAt: lastFrom[p.id] })),
  };
}, { methods: ['GET'], limit: [60, 60] });
