// Lock in this turn's move (+ optional skill). The server checks every rule.
import { route, fail } from '../../lib/http.js';
import { act } from '../../lib/game.js';

export default route(async ({ session, body }) => {
  if (!/^[0-9a-f-]{36}$/.test(body.id || '')) fail(400, 'bad match id');
  return act(body.id, session.pid, body);
}, { limit: [60, 60] });
