// Public leaderboard by rating or points. Guests are never listed.
import { route, publicPlayer } from '../http.js';
import { db } from '../db.js';

export default route(async ({ query }) => {
  const by = query.by === 'points' ? 'points' : 'rating';
  const rows = await db.select('players', `is_guest=eq.false&order=${by}.desc,wins.desc&limit=100`);
  return { by, players: rows.map(publicPlayer) };
}, { methods: ['GET'], auth: false, limit: [60, 60] });
