// Give up the current match (counts as a loss).
import { route, fail } from '../../lib/http.js';
import { forfeit } from '../../lib/game.js';

export default route(async ({ session, body }) => {
  if (!/^[0-9a-f-]{36}$/.test(body.id || '')) fail(400, 'bad match id');
  return forfeit(body.id, session.pid);
});
