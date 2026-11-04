// 🤝 Referrals: every player has a link (?ref=<code>); a NEW WALLET account made after opening it counts for them.
// Trial accounts never count. Same connection as the inviter = flagged for the admin (it may be one person's two wallets).
// Columns come from supabase/014_referrals.sql; until it is run, sign-up simply works without referrals.
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { flag, missing } from './admin.js';

export const cleanRef = r => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
const A = 'abcdefghjkmnpqrstuvwxyz23456789';
const newCode = () => Array.from(randomBytes(7), b => A[b % A.length]).join('');

// the player's own code (made the first time they ask for their link)
export async function refCodeOf(p) {
  if (p.ref_code) return p.ref_code;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try { await db.update('players', `id=eq.${p.id}&ref_code=is.null`, { ref_code: code }); }
    catch (e) { if (missing(e)) return null; if (/23505|duplicate/.test(e.body || '')) continue; throw e; }
    const row = await db.one('players', `id=eq.${p.id}&select=ref_code`);
    if (row?.ref_code) return row.ref_code;
  }
  return null;
}

// a brand-new wallet account: remember where it signed up from and who invited it (never throws: sign-up must work)
export async function onNewWallet(player, ref, ipKey) {
  const set = { ip_key: ipKey, last_ip_key: ipKey };
  const code = cleanRef(ref);
  let inviter = null;
  if (code) {
    try { inviter = await db.one('players', `ref_code=eq.${code}&select=id,address,is_guest,ip_key,last_ip_key`); } catch { inviter = null; }
    if (inviter && (inviter.id === player.id || inviter.is_guest)) inviter = null;
    if (inviter) Object.assign(set, { referred_by: inviter.id, ref_void: false });
  }
  try { await db.update('players', `id=eq.${player.id}`, set); } catch { return; }
  if (inviter && ipKey && (inviter.ip_key === ipKey || inviter.last_ip_key === ipKey)) await flag(inviter.id, 'ref_same_ip', { invited: player.id });
}
// a returning wallet: the latest connection, for the multi-account check
export async function onLogin(player, ipKey) {
  if (!ipKey || player.last_ip_key === ipKey) return;
  try { await db.update('players', `id=eq.${player.id}`, { last_ip_key: ipKey }); } catch { /* 014 not run yet */ }
}

// someone the player invited is real if they played: a game, or came back a day later
export const isActive = p => (p.wins || 0) + (p.losses || 0) + (p.bot_wins || 0) + (p.bot_losses || 0) + (p.draws || 0) > 0
  || (p.last_seen && p.created_at && Date.parse(p.last_seen) - Date.parse(p.created_at) > 24 * 3600e3);
