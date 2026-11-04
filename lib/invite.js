// 🎟️ Early access: a NEW account (wallet or trial) needs an invite code; existing players are never asked.
// On by default; Vercel env INVITE_ONLY=0 opens sign-ups to everyone. Codes live in the invites table (supabase/013_invites.sql).
import { db } from './db.js';
import { fail } from './http.js';

export const inviteOnly = () => process.env.INVITE_ONLY !== '0';
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
const missing = e => /PGRST20[245]|42P01|42883/.test(e?.body || e?.message || '');

// uses one go of the code (or fails with 403 'INVITE: …', which the browser turns into the code box). Returns the code.
export async function useInvite(raw) {
  if (!inviteOnly()) return null;
  const code = cleanCode(raw);
  if (!code) fail(403, 'INVITE: MINDS CLASH is in early access. Enter your invite code to join.');
  let ok;
  try { ok = await db.rpc('use_invite', { c: code }); } catch (e) { if (missing(e)) fail(503, 'Early access sign-ups are being set up. Try again soon.'); throw e; }
  if (!ok) fail(403, 'INVITE: That invite code is not valid or has been used up.');
  return code;
}
