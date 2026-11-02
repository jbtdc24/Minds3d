// Chat with a friend: read the last 50 lines (GET ?with=id), send your own words (POST {to, text}) or an old preset
// line (POST {to, phrase}). Messages are deleted after 90 days. Anyone with a wallet can message anyone (tap them in Mind Town),
// unless one of them blocked the other. Guests cannot send.
import { route, fail } from '../http.js';
import { db, broadcast } from '../db.js';
import { maybePrune } from '../retention.js';
import { phraseOk } from '../../web/src/chat.js';

const isId = s => /^[0-9a-f-]{36}$/.test(s || '');
const KEEP_DAYS = 90, MAX_LEN = 400;
const since = () => new Date(Date.now() - KEEP_DAYS * 864e5).toISOString();
// may these two talk? yes unless either blocked the other (friends or not)
async function friends(a, b) {
  const r = await db.select('friends', `or=(and(a.eq.${a},b.eq.${b}),and(a.eq.${b},b.eq.${a}))&status=eq.blocked&limit=1`);
  return r.length === 0;
}
export default route(async ({ req, session, body, query }) => {
  if (req.method === 'GET') {
    if (!isId(query.with)) fail(400, 'bad player id');
    if (!(await friends(session.pid, query.with))) fail(403, 'you cannot chat with this player');
    const rows = await db.select('messages', `or=(and(from_id.eq.${session.pid},to_id.eq.${query.with}),and(from_id.eq.${query.with},to_id.eq.${session.pid}))&created_at=gt.${since()}&order=created_at.desc&limit=50`);
    return { messages: rows.reverse().map(m => ({ mine: m.from_id === session.pid, phrase: m.phrase, text: m.text || null, at: m.created_at })) };
  }
  if (!isId(body.to)) fail(400, 'bad player id');
  const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_LEN) : '';
  const phrase = text ? null : Number(body.phrase);
  if (!text && !phraseOk(phrase)) fail(400, 'type a message first');
  if (body.to === session.pid) fail(400, "that's you 🙂");
  const [from, to] = await Promise.all([db.one('players', `id=eq.${session.pid}&select=is_guest`), db.one('players', `id=eq.${body.to}&select=is_guest`)]);
  if (!from || from.is_guest) fail(403, 'Connect a wallet to send messages.');
  if (!to || to.is_guest) fail(404, 'player not found');
  if (!(await friends(session.pid, body.to))) fail(403, 'you cannot chat with this player');
  await db.insert('messages', { from_id: session.pid, to_id: body.to, ...(text ? { text } : { phrase }) });
  maybePrune();   // old chat clears itself (lib/retention.js)
  await broadcast(`player:${body.to}`);
  return { ok: true };
}, { methods: ['GET', 'POST'], limit: [40, 60] });
