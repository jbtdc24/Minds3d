// 𝕏 Link a player's X account (OAuth 2.0 + PKCE, "Sign in with X"). Off until the owner sets X_CLIENT_ID and
// X_CLIENT_SECRET in Vercel (an app at developer.x.com with callback https://www.mindsclash.games/api/x/callback).
// Only the handle, display name and X id are kept (players.x_*, supabase/014_referrals.sql); no X token is stored.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { missing } from '../admin.js';

const ID = () => process.env.X_CLIENT_ID, SECRET = () => process.env.X_CLIENT_SECRET;
const KEY = () => process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || '';
const b64 = b => Buffer.from(b).toString('base64url');
const sign = s => b64(createHmac('sha256', KEY()).update(s).digest());
const callback = req => `https://${req.headers['x-forwarded-host'] || req.headers.host}/api/x/callback`;
// the PKCE secret is never in the URL: it is rebuilt from the state's nonce with the server key
const verifier = nonce => sign(`x-pkce:${nonce}`);

// step 1 (the game, signed in): where to send the browser
export const xStart = route(async ({ req, body, session }) => {
  if (!ID() || !SECRET()) fail(503, 'Connecting X is being set up. Try again soon.');
  const p = await db.one('players', `id=eq.${session.pid}&select=id,is_guest`);
  if (!p || p.is_guest) fail(403, 'Connect a wallet first, then your X account.');
  if (body.op === 'unlink') {
    try { await db.update('players', `id=eq.${p.id}`, { x_id: null, x_handle: null, x_name: null }); } catch (e) { if (missing(e)) fail(503, 'Connecting X is being set up. Try again soon.'); throw e; }
    return { ok: true };
  }
  const data = b64(JSON.stringify({ pid: p.id, n: randomBytes(12).toString('hex'), exp: Date.now() + 10 * 60e3 }));
  const state = `${data}.${sign(data)}`, challenge = b64(createHash('sha256').update(verifier(JSON.parse(Buffer.from(data, 'base64url')).n)).digest());
  const q = new URLSearchParams({ response_type: 'code', client_id: ID(), redirect_uri: callback(req), scope: 'users.read tweet.read', state, code_challenge: challenge, code_challenge_method: 'S256' });
  return { url: `https://x.com/i/oauth2/authorize?${q}` };
}, { limit: [10, 60] });

// step 2 (X sends the browser back here): check the state, ask X who this is, keep the handle, go back to the game
export const xCallback = route(async ({ req, res, query }) => {
  const back = msg => { res.statusCode = 302; res.setHeader('location', `/play?x=${encodeURIComponent(msg)}`); res.end(); };
  const [data, mac] = String(query.state || '').split('.');
  const good = data && mac && mac.length === sign(data).length && timingSafeEqual(Buffer.from(mac), Buffer.from(sign(data)));
  if (!good) return back('failed');
  const st = JSON.parse(Buffer.from(data, 'base64url').toString());
  if (st.exp < Date.now()) return back('expired');
  if (query.error || !query.code) return back('cancelled');
  const tok = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${ID()}:${SECRET()}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(query.code), redirect_uri: callback(req), code_verifier: verifier(st.n) }),
  }).then(r => r.json()).catch(() => null);
  if (!tok?.access_token) return back('failed');
  const me = await fetch('https://api.x.com/2/users/me', { headers: { authorization: `Bearer ${tok.access_token}` } }).then(r => r.json()).catch(() => null);
  const u = me?.data;
  if (!u?.id || !u.username) return back('failed');
  fetch('https://api.x.com/2/oauth2/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${ID()}:${SECRET()}`).toString('base64')}` }, body: new URLSearchParams({ token: tok.access_token, token_type_hint: 'access_token' }) }).catch(() => {});   // not needed any more
  try {
    const taken = await db.one('players', `x_id=eq.${encodeURIComponent(u.id)}&select=id`);
    if (taken && taken.id !== st.pid) return back('taken');   // one X account per game account
    await db.update('players', `id=eq.${st.pid}`, { x_id: String(u.id), x_handle: String(u.username).slice(0, 30), x_name: String(u.name || '').slice(0, 50) });
  } catch (e) { return back(missing(e) ? 'setup' : 'failed'); }   // the player always lands back in the game with a message
  return back('linked');
}, { methods: ['GET'], auth: false, limit: [20, 60] });
