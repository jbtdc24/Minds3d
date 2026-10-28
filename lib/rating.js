// Ratings (Elo) and leaderboard points. Rarity only adds points on WINS; it never changes gameplay.
export const RARITY_BONUS = { Common: 0, Uncommon: 0.05, Rare: 0.10, Epic: 0.15, Legendary: 0.20 };
export const BOT_FACTOR = 0.5;            // games vs bots move rating half as much

export function eloDelta(ra, rb, score, k = 32) {
  const expected = 1 / (1 + 10 ** ((rb - ra) / 400));
  return Math.round(k * (score - expected));
}
// points for a win: 10 base + rarity bonus of the Minds you brought (average)
export function winPoints(rarities, vsBot) {
  const bonus = rarities.length ? rarities.reduce((s, r) => s + (RARITY_BONUS[r] || 0), 0) / rarities.length : 0;
  return Math.round(10 * (1 + bonus) * (vsBot ? BOT_FACTOR : 1));
}
// bot rating used for Elo + to pick its level
export function botFor(rating) {
  if (rating < 950) return { level: 'easy', rating: 900 };
  if (rating < 1150) return { level: 'normal', rating: 1050 };
  return { level: 'hard', rating: Math.max(1250, rating) };
}
