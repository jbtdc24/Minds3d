// Mind Energy (shared by browser and server): each Mind has daily ranked energy by rarity, refilled at 00:00 UTC.
// A ranked match uses 1 energy from every Mind you bring. Classic, practice and the tutorial are free.
export const ENERGY_CAP = { Common: 3, Uncommon: 3, Rare: 4, Epic: 4, Legendary: 5 };
export const capOf = rarity => ENERGY_CAP[rarity] || 3;
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
// ms until the next refill
export function msToReset(now = Date.now()) {
  const d = new Date(now); d.setUTCHours(24, 0, 0, 0);
  return d - now;
}
