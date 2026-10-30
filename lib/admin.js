// Admin + anti-cheat helpers. Who is an admin lives ONLY in the Vercel env var ADMIN_ADDRESSES (comma-separated wallets)
// and/or ADMIN_PLAYER_IDS — never in the repo. Bans/suspensions live on the players row (supabase/005_admin.sql).
import { db } from './db.js';

const list = v => (v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export function isAdmin(p) {
  if (!p) return false;
  return (!!p.address && list(process.env.ADMIN_ADDRESSES).includes(p.address.toLowerCase())) || list(process.env.ADMIN_PLAYER_IDS).includes(String(p.id).toLowerCase());
}
const missing = e => /PGRST20[45]|42P01|42703/.test(e?.body || '');   // 005_admin.sql not run yet: everything still works

// the cheat meter: note something suspicious (never throws)
export async function flag(playerId, kind, detail = {}) {
  if (!playerId) return;
  try { await db.insert('flags', { player_id: playerId, kind, detail }); } catch { /* best effort */ }
}

// is this player banned or suspended, and since when are their sessions valid? (cached 30 s per server instance)
const banCache = new Map();
export async function accessOf(pid) {
  const hit = banCache.get(pid);
  if (hit && Date.now() - hit.at < 30_000) return hit;
  let ban = null, after = 0;
  const read = async cols => { const r = await db.one('players', `id=eq.${pid}&select=${cols}`); if (r?.banned_until && Date.parse(r.banned_until) > Date.now()) ban = { until: r.banned_until, reason: r.ban_reason || '' }; after = r?.sessions_after ? Date.parse(r.sessions_after) : 0; };
  try { await read('banned_until,ban_reason,sessions_after'); }
  catch (e) {
    if (!missing(e)) throw e;
    try { await read('banned_until,ban_reason'); } catch (e2) { if (!missing(e2)) throw e2; }   // an older database: bans must keep working
  }
  const out = { at: Date.now(), ban, after };
  banCache.set(pid, out);
  return out;
}
export const banOf = async pid => (await accessOf(pid)).ban;
export const forgetBan = pid => banCache.delete(pid);
export { missing };
