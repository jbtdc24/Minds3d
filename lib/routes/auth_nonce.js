// Step 1 of wallet login: get a one-time message to sign.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { newNonce, loginMessage } from '../auth.js';
import { isAddress, getAddress } from 'viem';

export const NONCE_MS = 10 * 60_000;
export default route(async ({ req, body }) => {
  if (!isAddress(body.address || '')) fail(400, 'invalid wallet address');
  const address = getAddress(body.address), open = await db.one('nonces', `address=eq.${address}`);
  // an unused challenge stays valid: asking again cannot knock out a login that is under way
  if (open && Date.now() - new Date(open.created_at) < NONCE_MS) return { message: loginMessage(address, open.nonce, req.headers.host) };
  const nonce = newNonce();
  await db.upsert('nonces', { address, nonce, created_at: new Date().toISOString() }, 'address');
  return { message: loginMessage(address, nonce, req.headers.host) };
}, { auth: false, limit: [20, 60] });
