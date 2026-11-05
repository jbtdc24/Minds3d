// Step 2 of wallet login: check the signature, create the player if new, return a session.
import { route, fail, publicPlayer, deviceKey } from '../http.js';
import { db } from '../db.js';
import { signSession, loginMessage, checkSignature, readSession } from '../auth.js';
import { ownedMinds } from '../owned.js';
import { isAddress, getAddress } from 'viem';
import { onNewWallet, onLogin } from '../referral.js';

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
    await onNewWallet(player, body.ref, deviceKey(req));   // 🤝 counts for whoever's link brought them here
  } else await onLogin(player, deviceKey(req));
  const moved = await moveTrial(body.trial, player);
  return { token: signSession(player), player: publicPlayer(player), minds, isNew, moved };
}, { auth: false, limit: [20, 60] });

// 🧪 the trial island moves to the wallet, but only into a wallet that has no island yet (never overwrites real progress)
async function moveTrial(trial, player) {
  if (typeof trial !== 'string' || trial.length > 600) return false;
  const t = readSession({ headers: { authorization: `Bearer ${trial}` } });
  if (!t?.guest || !t.pid || t.pid === player.id) return false;
  const guest = await db.one('players', `id=eq.${t.pid}`);
  if (!guest?.is_guest) return false;
  if (await db.one('islands', `player_id=eq.${player.id}`)) return false;
  const rows = await db.update('islands', `player_id=eq.${t.pid}`, { player_id: player.id }).catch(() => []);
  return !!rows?.length;
}
