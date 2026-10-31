// Game-run opponents use player-style names. They must never match a real player, or a bot's actions would look like theirs.
import { db } from './db.js';
import { villageName } from '../web/src/island/raid.js';

// every bot name a player can see carries this; player names can't start with "bot", so it can't be copied or removed
export const BOT_TAG = 'BOT · ';
export async function freeBotName(seed) {
  for (let i = 0; i < 4; i++) {
    const name = villageName(seed + i * 7919);
    if (!(await db.one('players', `name_key=eq.${encodeURIComponent(name.toLowerCase())}&select=id`))) return name;
  }
  return `${villageName(seed)}_${(seed >>> 0) % 1000}`;
}
