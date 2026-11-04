// 🤝 The player's own invite link and how many friends joined with it (wallet sign-ups only).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { refCodeOf } from '../referral.js';
import { missing } from '../admin.js';

export default route(async ({ session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  if (p.is_guest || !p.address) fail(403, 'Connect a wallet to get your invite link.');
  const code = await refCodeOf(p);
  if (!code) fail(503, 'Invite links are being set up. Try again soon.');
  let joined = 0;
  try { joined = await db.count('players', `referred_by=eq.${p.id}&ref_void=eq.false`); } catch (e) { if (!missing(e)) throw e; }
  return { code, joined };
}, { methods: ['GET', 'POST'], limit: [30, 60] });
