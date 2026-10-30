// Ratings (Elo) and leaderboard points. Rarity only adds points on WINS; it never changes gameplay.
export const RARITY_BONUS = { Common: 0, Uncommon: 0.05, Rare: 0.10, Epic: 0.15, Legendary: 0.20 };
export const BOT_FACTOR = 0.5;            // games vs bots move rating half as much

export function eloDelta(ra, rb, score, k = 32) {
  const expected = 1 / (1 + 10 ** ((rb - ra) / 400));
  return Math.round(k * (score - expected));
}
// points for a ranked win: 10 per Mind you brought (each Mind also spent 1 energy) + that Mind's rarity bonus
export function winPoints(rarities, vsBot) {
  const sum = rarities.reduce((s, r) => s + 10 * (1 + (RARITY_BONUS[r] || 0)), 0);
  return Math.round(sum * (vsBot ? BOT_FACTOR : 1));
}
// points lost on a ranked loss: 5 per Mind you staked (the stake works both ways; points never go below 0)
export const LOSS_PER_MIND = 5;
export function lossPoints(n, vsBot) { return Math.round(LOSS_PER_MIND * n * (vsBot ? BOT_FACTOR : 1)); }
// ranked duels feed your island: Dust per Mind staked (win / loss); bot games half
export const DUEL_DUST = { win: 60, loss: 15 };
export const duelDust = (won, n, vsBot) => Math.round((won ? DUEL_DUST.win : DUEL_DUST.loss) * n * (vsBot ? BOT_FACTOR : 1));
// bot rating used for Elo + to pick its level
export function botFor(rating) {
  if (rating < 950) return { level: 'easy', rating: 900 };
  if (rating < 1150) return { level: 'normal', rating: 1050 };
  return { level: 'hard', rating: Math.max(1250, rating) };
}
