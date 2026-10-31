// Sky raiders: bands the game runs, shown with the BOT label. They hit an island about once a day (more surely if you have been away), so a
// village always has a story waiting. Losses are small, Dust only, and good defences beat them for a reward.
// They never touch Gems, and they only come for islands that have started building.
import { hash } from '../web/src/island/gen.js';
import { barnSafe, activeOf } from '../web/src/island/rules.js';
import { lootOf, villageName, SHIELD_MS } from '../web/src/island/raid.js';

const GAP = 10 * 3600e3, DAY = 24 * 3600e3, SHARE = 0.08, MAX_LOSS = 400, BEATEN_PAY = 60, LOG_KEEP = 10;

export const defenceOf = st => activeOf(st, 'tower') * 2 + activeOf(st, 'trap') + Math.floor(activeOf(st, 'wall') / 6);

export function npcRaid(st, seed, now) {
  st.npcAt ??= now;
  if (now - st.npcAt < GAP || st.shield > now) return null;
  if ((st.b || []).length < 4 || st.dust < 500) return null;   // brand-new islands are left alone
  const away = now - st.npcAt, roll = hash(seed, Math.floor(now / GAP), 4242);
  st.npcAt = now;
  if (away < DAY && roll > 0.45) return null;
  const id = (hash(seed, Math.floor(now / 3600e3), 4243) * 2 ** 31) | 0, level = 1 + (hash(id, 1, 7) * 3 | 0);
  const stars = Math.max(0, level + 1 - Math.floor(defenceOf(st) / 3)), pct = stars ? 0.3 + stars * 0.2 : 0.1;
  const safeStars = Math.min(3, stars), loot = safeStars ? Math.min(MAX_LOSS, lootOf(st.dust, barnSafe(st), pct, SHARE)) : 0;
  st.dust += safeStars ? -loot : BEATEN_PAY;
  if (safeStars) st.shield = now + SHIELD_MS;
  const e = { at: now - (hash(id, 2, 7) * Math.min(away, 8 * 3600e3) | 0), by: villageName(id), npc: id, level, stars: safeStars, pct: Math.round(pct * 100), loot };
  if (!safeStars) e.beaten = BEATEN_PAY;
  st.raidLog = [e, ...(st.raidLog || [])].slice(0, LOG_KEEP);
  return e;
}
