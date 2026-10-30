// Live chat identity: everyone gets the server's public key to check lines; wallet players get a one-hour certificate.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { certify, chatServerKey, validPub } from '../chatcert.js';

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  if (!validPub(body.pub)) fail(400, 'bad key');
  return { ck: chatServerKey(), cert: p.is_guest || session.agent ? null : certify(p, body.pub) };
}, { limit: [20, 60] });
