// 🔨 Busy Minds (owner 2026-11-05): a Mind that builds or upgrades on the island can't play anything until it is done.
import { db } from './db.js';
import { normalize, builderOf, busyText } from '../web/src/island/rules.js';

// the first busy Mind among these ids (numbers = NFTs, 'L1' = Loaners; 0 = "any Loaner": busy only if every Loaner is), or null
export async function busyMsg(pid, ids, now = Date.now()) {
  if (!ids?.length) return null;
  const isl = await db.one('islands', `player_id=eq.${pid}`).catch(() => null);
  if (!isl) return null;
  const st = normalize(isl.state, Number(isl.seed), now), map = builderOf(st, now);
  if (!map.size) return null;
  for (const id of ids) {
    if (id === 0) { const lo = (st.loaners || []).map(l => l.id); if (lo.length && lo.every(l => map.has(l))) return busyText(lo[0], map.get(lo[0]), now); continue; }
    if (map.has(id)) return busyText(id, map.get(id), now);
  }
  return null;
}
