// Signed live chat. Chat words travel straight between browsers, so each browser proves who it is: it makes its own key
// pair, and the server signs a short-lived certificate saying "this key belongs to this player". Receivers check the
// certificate and every message, so nobody can speak as someone else, even with the public website key.
import { createECDH, createHash, createPrivateKey, sign } from 'node:crypto';

const CERT_MS = 60 * 60e3, b64 = b => Buffer.from(b).toString('base64url');
let memo = null;
function keys() {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || '';
  if (memo?.secret === secret) return memo;
  const e = createECDH('prime256v1'), d = createHash('sha256').update('mindclash-chat:' + secret).digest();
  e.setPrivateKey(d);
  const p = e.getPublicKey(), pub = { kty: 'EC', crv: 'P-256', x: b64(p.subarray(1, 33)), y: b64(p.subarray(33, 65)) };
  memo = { secret, pub, key: createPrivateKey({ key: { ...pub, d: b64(d) }, format: 'jwk' }) };
  return memo;
}
export const chatServerKey = () => keys().pub;
export const validPub = k => /^[A-Za-z0-9_-]{43}$/.test(k?.x || '') && /^[A-Za-z0-9_-]{43}$/.test(k?.y || '');
export function certify(player, pub, now = Date.now()) {
  const body = JSON.stringify({ pid: player.id, name: player.name, ...(player.is_guest ? { guest: true } : {}), x: pub.x, y: pub.y, exp: now + CERT_MS });
  return { body, sig: b64(sign('sha256', Buffer.from(body), { key: keys().key, dsaEncoding: 'ieee-p1363' })) };
}
