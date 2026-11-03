// 🌙 AI away mode: the player's AIs keep doing their jobs on the server while the game is closed, for up to 7 days.
// The player gives the server its OWN Hello Minds sign-in for this (a second one, so it never logs the browser out).
// Its refresh token is kept encrypted on the island (st.aiAuth, never sent to any browser) and renewed by the server.
// A timer (GitHub Actions every 5 min → /api/cron/ai-tick) runs the rounds that are due: ask the AI (one tick), read
// its answer and do the job (a later tick). Same rules, Gem limit and cognition checks as in the game; Ranked needs
// the game open (its 20 s turns need a live loop). It stops at the end date, at 0 cognition, or when turned off.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';

export const AWAY_MAX_DAYS = 90, AUTH_URL = 'https://api.oauth.hellominds.ai', CLIENT_ID = 'dcae7792-2a81-416b-aa96-0137b29191d7';
const key = () => {
  const s = process.env.AI_TOKEN_KEY || process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!s) throw Object.assign(new Error('the server is missing its secret'), { status: 503 });
  return createHash('sha256').update('mindsclash-ai-away:' + s).digest();
};
export function seal(obj) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}
export function unseal(str) {
  try {
    const [v, iv, tag, enc] = String(str || '').split('.');
    if (v !== 'v1') return null;
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8'));
  } catch { return null; }
}
// a working access token for this island's away sign-in (renewed when close to expiry; the new refresh token is saved)
export const auth = { fetch: (...a) => fetch(...a) };   // tests swap this
export async function accessFor(pid, save) {
  const isl = await db.one('islands', `player_id=eq.${pid}&select=state,rev`);
  const t = unseal(isl?.state?.aiAuth);
  if (!t?.refresh) return null;
  if (t.access && t.exp - Date.now() > 90e3) return t.access;
  const r = await auth.fetch(`${AUTH_URL}/v2/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: t.refresh }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.accessToken || !b.refreshToken) { await save(st => { delete st.aiAuth; if (st.ap?.away) st.ap.away.on = false; }); return null; }   // the sign-in ended: away mode stops
  await save(st => { st.aiAuth = seal({ refresh: b.refreshToken, access: b.accessToken, exp: Date.now() + Number(b.expiresIn || 3600) * 1000 }); });
  return b.accessToken;
}
export async function revoke(sealed) {
  const t = unseal(sealed);
  if (t?.refresh) await auth.fetch(`${AUTH_URL}/v2/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: CLIENT_ID, token: t.refresh }) }).catch(() => {});
}
