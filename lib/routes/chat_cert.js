// Live identity: a one-hour certificate for your browser's key. Trial accounts' certificates are marked: they can walk in Town, not speak.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { certify, chatServerKey, validPub } from '../chatcert.js';

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  if (!validPub(body.pub)) fail(400, 'bad key');
  return { ck: chatServerKey(), cert: session.agent ? null : certify(p, body.pub) };
}, { limit: [20, 60] });
