// Friend requests: add (by player id or exact name), accept, remove / decline.
import { route, fail } from '../http.js';
import { db, broadcast } from '../db.js';

const isId = s => /^[0-9a-f-]{36}$/.test(s || '');
export default route(async ({ session, body }) => {
  const me = await db.one('players', `id=eq.${session.pid}`);
  if (!me) fail(401, 'account not found');
  if (me.is_guest) fail(403, 'connect a wallet to add friends');
  let other = null;
  if (isId(body.id)) other = await db.one('players', `id=eq.${body.id}`);
  else if (typeof body.name === 'string' && body.name.trim()) other = await db.one('players', `name_key=eq.${encodeURIComponent(body.name.trim().toLowerCase())}`);
  if (!other || other.is_guest) fail(404, 'player not found');
  if (other.id === me.id) fail(400, "that's you 🙂");
  const mine = await db.one('friends', `a=eq.${me.id}&b=eq.${other.id}`);
  const theirs = await db.one('friends', `a=eq.${other.id}&b=eq.${me.id}`);
  if (body.op === 'add') {
    if (theirs) {                                   // they already asked you: adding back = accept
      if (theirs.status !== 'accepted') await db.update('friends', `a=eq.${other.id}&b=eq.${me.id}`, { status: 'accepted' });
      await broadcast(`player:${other.id}`);
      return { status: 'accepted' };
    }
    if (mine) return { status: mine.status };
    const count = await db.select('friends', `or=(a.eq.${me.id},b.eq.${me.id})&select=a&limit=201`);
    if (count.length >= 200) fail(400, 'friend list is full (200)');
    await db.insert('friends', { a: me.id, b: other.id, status: 'pending' });
    await broadcast(`player:${other.id}`);
    return { status: 'pending' };
  }
  if (body.op === 'accept') {
    if (!theirs) fail(404, 'no request from this player');
    await db.update('friends', `a=eq.${other.id}&b=eq.${me.id}`, { status: 'accepted' });
    await broadcast(`player:${other.id}`);
    return { status: 'accepted' };
  }
  if (body.op === 'remove') {
    await db.remove('friends', `a=eq.${me.id}&b=eq.${other.id}`);
    await db.remove('friends', `a=eq.${other.id}&b=eq.${me.id}`);
    return { status: 'none' };
  }
  fail(400, 'unknown action');
}, { limit: [30, 60] });
