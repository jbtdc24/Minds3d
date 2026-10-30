// Report a bug or a player. The owner reads these in the admin screen.
import { route, fail } from '../http.js';
import { db } from '../db.js';

const isId = s => /^[0-9a-f-]{36}$/.test(s || '');
export default route(async ({ body, session }) => {
  const text = String(body.text || '').trim().slice(0, 1000);
  if (text.length < 5) fail(400, 'Please say a little more.');
  const kind = body.kind === 'player' ? 'player' : 'bug';
  await db.insert('reports', { player_id: session.pid, kind, target: isId(body.target) ? body.target : null, text, place: String(body.place || '').slice(0, 60) });
  return { ok: true };
}, { limit: [6, 3600] });
