// Free trial: a guest account with demo Minds. Guests never appear on the leaderboard.
import { route, publicPlayer } from '../http.js';
import { db } from '../db.js';
import { signSession } from '../auth.js';
import { DEMO_MINDS } from '../owned.js';
import { randomBytes } from 'node:crypto';

export default route(async () => {
  const tag = randomBytes(3).toString('hex');
  const player = await db.insert('players', { is_guest: true, name: `Guest_${tag}`, name_key: `guest_${tag}_${randomBytes(4).toString('hex')}`, pfp: DEMO_MINDS[0] });
  return { token: signSession(player), player: publicPlayer(player), minds: DEMO_MINDS, guest: true };
}, { auth: false, limit: [10, 600] });
