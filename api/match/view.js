// Your view of a match. The rival's locked-in pick is never sent.
import { route, fail } from '../../lib/http.js';
import { getView } from '../../lib/game.js';

export default route(async ({ session, query }) => {
  if (!/^[0-9a-f-]{36}$/.test(query.id || '')) fail(400, 'bad match id');
  return getView(query.id, session.pid);
}, { methods: ['GET'], limit: [240, 60] });
