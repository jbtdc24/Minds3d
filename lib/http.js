// Small helpers shared by every API route.
import { readSession } from './auth.js';
import { db } from './db.js';
import { createHash } from 'node:crypto';

export function route(handler, { methods = ['POST'], auth = true, limit = [60, 60] } = {}) {
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    try {
      if (!methods.includes(req.method)) return send(res, 405, { error: 'method not allowed' });
      const session = readSession(req);
      if (auth && !session) return send(res, 401, { error: 'please sign in again' });
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'ip';
      const key = `${req.url.split('?')[0]}:${session?.pid || ip}`;
      if (limit && !(await db.rpc('hit_rate', { k: key, max_hits: limit[0], window_s: limit[1] }))) return send(res, 429, { error: 'slow down a little' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const out = await handler({ req, res, body, session, query: req.query || {} });
      if (!res.headersSent) send(res, 200, out ?? { ok: true });
    } catch (e) {
      // database errors never reach players raw; a missing table/column means a migration still has to run
      const setup = /PGRST20[45]|42P01|42703/.test(e.body || '');
      const status = setup ? 503 : e.status && e.status < 500 ? e.status : 500;
      if (status >= 500) console.error(e);
      send(res, status, { error: setup ? 'this feature is being set up, try again soon' : status === 500 ? 'server error, try again' : e.message });
    }
  };
}
// short one-way hash of the caller's IP: two accounts on one connection never get matched together
export const deviceKey = req => 'ip:' + createHash('sha256').update(((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'ip') + (process.env.SUPABASE_SECRET_KEY || '')).digest('hex').slice(0, 16);
export const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
export const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const publicPlayer = p => p && ({
  id: p.id, name: p.name, pfp: p.pfp, guest: p.is_guest, rating: p.rating, points: p.points, wins: p.wins, losses: p.losses, draws: p.draws,
  botWins: p.bot_wins, botLosses: p.bot_losses, streak: p.streak, bestStreak: p.best_streak,
  winRate: p.wins + p.losses ? Math.round(p.wins / (p.wins + p.losses) * 1000) / 10 : null,
  address: p.address ? `${p.address.slice(0, 6)}…${p.address.slice(-4)}` : null,
  showcase: p.showcase || [], online: !!p.last_seen && Date.now() - Date.parse(p.last_seen) < 150_000,
});
// mark a player as online (at most one write a minute)
export async function touch(p) {
  if (p.last_seen && Date.now() - Date.parse(p.last_seen) < 60_000) return;
  try { await db.update('players', `id=eq.${p.id}`, { last_seen: new Date().toISOString() }); } catch { /* best effort */ }
}
