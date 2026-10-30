// Log out everywhere: every session made before now stops working and every AI key is turned off.
import { route } from '../http.js';
import { db } from '../db.js';
import { forgetBan } from '../admin.js';

export default route(async ({ session }) => {
  await db.update('players', `id=eq.${session.pid}`, { sessions_after: new Date().toISOString() });
  await db.update('agent_keys', `player_id=eq.${session.pid}&revoked=eq.false`, { revoked: true }).catch(() => {});
  forgetBan(session.pid);
  return { ok: true };
}, { limit: [5, 60] });
