// 🌙 The away-play timer (GitHub Actions every 5 min, see .github/workflows/ai-tick.yml): runs the due rounds of AIs
// whose players turned on away play. No secret is needed: it only does work that is already due, at most twice a minute
// in total, and every round follows the game's rules, the player's Gem limit and their cognition.
import { route } from '../http.js';
import { db } from '../db.js';
import { awayTick } from './autopilot.js';

export default route(async () => {
  if (!(await db.rpc('hit_rate', { k: 'ai-tick', max_hits: 2, window_s: 60 }))) return { skipped: true };
  const rows = await db.select('islands', 'state->ap->away->>on=eq.true&select=player_id&order=updated_at.asc&limit=40');
  const t0 = Date.now();
  let players = 0, rounds = 0;
  for (const r of rows) {
    if (Date.now() - t0 > 40e3) break;   // stay well inside the function time; the rest go first next time
    try { rounds += await awayTick(r.player_id); players++; } catch { /* one player's error never stops the others */ }
  }
  return { players, rounds };
}, { methods: ['GET', 'POST'], auth: false, limit: [30, 60] });
