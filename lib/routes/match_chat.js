// Send a quick-chat line (preset lines only) in your match.
import { route, fail } from '../http.js';
import { chatLine } from '../game.js';

export default route(async ({ session, body }) => {
  if (!/^[0-9a-f-]{36}$/.test(body.id || '')) fail(400, 'bad match id');
  return chatLine(body.id, session.pid, Number(body.phrase));
}, { limit: [30, 60] });
