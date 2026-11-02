// What Ranked gives your island besides Dust (shared by the server, which pays it, and the browser, which shows it):
//  - win streak chests at 3, 5 and 10 wins in a row
//  - the daily chest for 3 ranked wins: supplies + a 2-hour Builder Boost (builds and upgrades take half the time)
//  - a weekly tier chest on your first ranked game of the week, by rating, with an 8-hour raid shield
export const STREAK_CHESTS = {
  3: { name: 'Streak Chest', items: { wood: 60, stone: 60, potion: 2 } },
  5: { name: 'Big Streak Chest', items: { wood: 150, stone: 150, fuel: 2, troop_archer: 5 } },
  10: { name: 'Legend Streak Chest', items: { wood: 400, stone: 400, troop_giant: 2 }, gems: 3 },
};
export const DAILY_WINS = 3, DAILY_CHEST = { name: 'Daily Ranked Chest', items: { wood: 100, stone: 100, potion: 3 } }, BOOST_MS = 2 * 3600e3;
export const TIERS = [
  { name: 'Bronze', icon: '🥉', min: 0, dust: 500, res: 0, gems: 0 },
  { name: 'Silver', icon: '🥈', min: 1100, dust: 1000, res: 100, gems: 0 },
  { name: 'Gold', icon: '🥇', min: 1250, dust: 2000, res: 200, gems: 0 },
  { name: 'Platinum', icon: '💠', min: 1400, dust: 3500, res: 300, gems: 2 },
  { name: 'Legend', icon: '👑', min: 1600, dust: 6000, res: 500, gems: 5 },
];
export const SHIELD_MS = 8 * 3600e3;
export const tierOf = rating => [...TIERS].reverse().find(t => (rating | 0) >= t.min) || TIERS[0];
// ISO-ish week id (UTC): changes every Monday 00:00 UTC
export const weekOf = now => { const d = new Date(now), day = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10); };
// a ranked game finished: what lands on the island (st is changed in place); returns the list to show the player
export function rankedRewards(st, { won, streak, rating, now }) {
  const got = [], give = (name, items = {}, gems = 0, dust = 0) => {
    for (const [k, n] of Object.entries(items)) st.inv[k] = (st.inv[k] || 0) + n;
    if (gems) st.gems = (st.gems || 0) + gems;
    if (dust) st.dust += dust;
    got.push({ name, items, ...(gems ? { gems } : {}), ...(dust ? { dust } : {}) });
  };
  const wk = weekOf(now);
  if (st.wk !== wk) {   // first ranked game this week
    const t = tierOf(rating);
    st.wk = wk;
    give(`${t.icon} ${t.name} weekly chest`, t.res ? { wood: t.res, stone: t.res } : {}, t.gems, t.dust);
    st.shield = Math.max(st.shield || 0, now + SHIELD_MS); got.at(-1).shield = SHIELD_MS;
  }
  if (!won) return got;
  const c = STREAK_CHESTS[streak];
  if (c) give(`🔥 ${c.name} (${streak} wins in a row)`, c.items, c.gems || 0);
  const day = new Date(now).toISOString().slice(0, 10);
  if (st.rk?.day !== day) st.rk = { day, wins: 0 };
  st.rk.wins++;
  if (st.rk.wins === DAILY_WINS) { give(`📦 ${DAILY_CHEST.name}`, DAILY_CHEST.items); st.boost = Math.max(st.boost || 0, now) + BOOST_MS; got.at(-1).boost = BOOST_MS; }
  return got;
}
