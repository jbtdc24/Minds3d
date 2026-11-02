// Leaderboard points from the island side, so climbing means playing everything: Ranked stays the main way,
// and adventures, raids and selling crops add some each day (capped, so nobody farms the board with one thing).
// Buying Gems also gives points once per payment (owner's choice), plus bonus Dust and supplies.
import { db } from './db.js';

export const ISLAND_POINTS = { adventure: { each: 5, cap: 25 }, raid: { each: 2, cap: 30 } };   // raid: per star
export const GEM_BONUS = { pointsPerGem: 1, dustPerGem: 20, resPerGem: 2 };
const utcDay = () => new Date().toISOString().slice(0, 10);

// how many points this island action may still give today; st.pd = { day, adventure, raid } is changed in place
export function pointsFor(st, kind, n = 1) {
  const r = ISLAND_POINTS[kind]; if (!r) return 0;
  const day = utcDay();
  if (st.pd?.day !== day) st.pd = { day };
  const give = Math.max(0, Math.min(r.cap - (st.pd[kind] || 0), r.each * n));
  st.pd[kind] = (st.pd[kind] || 0) + give;
  return give;
}
export async function addPoints(pid, n) {
  if (!(n > 0)) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = await db.one('players', `id=eq.${pid}&select=points,is_guest`);
    if (!p || p.is_guest) return;
    const saved = await db.update('players', `id=eq.${pid}&points=eq.${p.points}`, { points: p.points + n });
    if (saved.length) return;
  }
}
