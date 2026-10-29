// Chat with a friend: read the last 50 lines (GET ?with=id) or send a preset line (POST {to, phrase}).
import { route, fail } from '../http.js';
import { db, broadcast } from '../db.js';
import { phraseOk } from '../../web/src/chat.js';

const isId = s => /^[0-9a-f-]{36}$/.test(s || '');
async function friends(a, b) {
  const r = await db.select('friends', `or=(and(a.eq.${a},b.eq.${b}),and(a.eq.${b},b.eq.${a}))&status=eq.accepted&limit=1`);
  return r.length > 0;
}
export default route(async ({ req, session, body, query }) => {
  if (req.method === 'GET') {
    if (!isId(query.with)) fail(400, 'bad player id');
    if (!(await friends(session.pid, query.with))) fail(403, 'you can only chat with friends');
    const rows = await db.select('messages', `or=(and(from_id.eq.${session.pid},to_id.eq.${query.with}),and(from_id.eq.${query.with},to_id.eq.${session.pid}))&order=created_at.desc&limit=50`);
    return { messages: rows.reverse().map(m => ({ mine: m.from_id === session.pid, phrase: m.phrase, at: m.created_at })) };
  }
  if (!isId(body.to)) fail(400, 'bad player id');
  const phrase = Number(body.phrase);
  if (!phraseOk(phrase)) fail(400, 'pick one of the chat lines');
  if (!(await friends(session.pid, body.to))) fail(403, 'you can only chat with friends');
  await db.insert('messages', { from_id: session.pid, to_id: body.to, phrase });
  broadcast(`player:${body.to}`);
  return { ok: true };
}, { methods: ['GET', 'POST'], limit: [40, 60] });
