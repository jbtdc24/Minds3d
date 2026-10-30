// Step 2 of wallet login: check the signature, create the player if new, return a session.
import { route, fail, publicPlayer } from '../http.js';
import { db } from '../db.js';
import { signSession, loginMessage, checkSignature } from '../auth.js';
import { ownedMinds } from '../owned.js';
import { isAddress, getAddress } from 'viem';

export default route(async ({ req, body }) => {
  if (!isAddress(body.address || '') || typeof body.signature !== 'string') fail(400, 'invalid login');
  const address = getAddress(body.address);
  // tries per wallet, wherever they come from
  if (!(await db.rpc('hit_rate', { k: `login:${address}`, max_hits: 20, window_s: 600 }))) fail(429, 'too many login tries, wait a few minutes');
  const row = await db.one('nonces', `address=eq.${address}`);
  if (!row || Date.now() - new Date(row.created_at) > 10 * 60_000) fail(400, 'login expired, try again');
  const ok = await checkSignature(address, loginMessage(address, row.nonce, req.headers.host), body.signature);
  if (!ok) fail(401, 'signature did not match this wallet');          // a stranger's bad try must not cancel the real login
  await db.remove('nonces', `address=eq.${address}`);                 // one use only (no replay)
  let player = await db.one('players', `address=eq.${address}`);
  const minds = await ownedMinds(address);
  let isNew = false;
  if (!player) {
    const name = `Mind_${address.slice(2, 8)}`;
    player = await db.insert('players', { address, name, name_key: name.toLowerCase(), pfp: minds[0] ?? null });
    isNew = true;
  }
  return { token: signSession(player), player: publicPlayer(player), minds, isNew };
}, { auth: false, limit: [20, 60] });
