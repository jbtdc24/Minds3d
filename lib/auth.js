// Sessions: an HMAC-signed token (player id + wallet + expiry). The signing key is derived from the
// Supabase secret, so it never exists in the browser and can't be forged.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyMessage, getAddress, isAddress } from 'viem';

const KEY = () => createHash('sha256').update('mindclash-session:' + (process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || '')).digest();
const b64 = buf => Buffer.from(buf).toString('base64url');
const SESSION_DAYS = 14;

export function signSession(player, { agent = false } = {}) {   // agent: an AI playing through a Mind key (cups and a few actions are off)
  const body = b64(JSON.stringify({ pid: player.id, addr: player.address || null, guest: !!player.is_guest, ...(agent ? { agent: true } : {}), iat: Date.now(), exp: Date.now() + (agent ? 60e3 : SESSION_DAYS * 864e5) }));
  return `${body}.${b64(createHmac('sha256', KEY()).update(body).digest())}`;
}
export function readSession(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!tok || !tok.includes('.')) return null;
  const [body, sig] = tok.split('.');
  const want = createHmac('sha256', KEY()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const s = JSON.parse(Buffer.from(body, 'base64url').toString());
  return s.exp > Date.now() ? s : null;
}
export const newNonce = () => randomBytes(16).toString('hex');
// The exact text the wallet signs. Human-readable, no transaction, no gas.
export function loginMessage(address, nonce, host) {
  return `Sign in to MINDS CLASH\n\nThis only proves you own this wallet. It does not send a transaction or cost gas.\n\nWallet: ${address}\nSite: ${host}\nNonce: ${nonce}`;
}
export async function checkSignature(address, message, signature) {
  if (!isAddress(address)) return false;
  try { return await verifyMessage({ address: getAddress(address), message, signature }); } catch { return false; }
}

// ---------- display names ----------
const BANNED = ['admin', 'moderator', 'mindclash', 'mindsclash', 'official', 'support', 'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'retard', 'whore', 'slut', 'rape', 'nazi', 'hitler', 'porn', 'dick', 'pussy', 'cock'];
export function checkName(name) {
  if (typeof name !== 'string') return 'Pick a name.';
  const n = name.trim();
  if (n.length < 3 || n.length > 16) return 'Names are 3 to 16 characters.';
  if (!/^[A-Za-z0-9_]+$/.test(n)) return 'Letters, numbers and _ only.';
  const k = n.toLowerCase().replace(/[_0-9]/g, m => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', _: '' }[m] ?? m));
  if (BANNED.some(w => k.includes(w)) || k.startsWith('bot')) return 'That name is not allowed.';
  return null;
}
