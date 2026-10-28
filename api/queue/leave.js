// Leave the queue (only if not already matched).
import { route } from '../../lib/http.js';
import { db } from '../../lib/db.js';

export default route(async ({ session }) => {
  await db.remove('queue', `player_id=eq.${session.pid}&match_id=is.null`);
  return { ok: true };
});
