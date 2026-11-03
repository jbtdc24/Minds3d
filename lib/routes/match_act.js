// Lock in this turn's move (+ optional skill). The server checks every rule.
import { route, fail } from '../http.js';
import { act } from '../game.js';
import { db } from '../db.js';

export default route(async ({ session, body }) => {
  if (!/^[0-9a-f-]{36}$/.test(body.id || '')) fail(400, 'bad match id');
  // a duel the player's Hello Minds AI is playing: only the AI plays it (the server plays its cards), never a hand move
  const isl = await db.one('islands', `player_id=eq.${session.pid}&select=state`).catch(() => null);
  if (isl?.state?.ap?.aiDuel === body.id) fail(403, 'Your AI is playing this duel. Stop the AI to play yourself.');
  return act(body.id, session.pid, body);
}, { limit: [60, 60] });
