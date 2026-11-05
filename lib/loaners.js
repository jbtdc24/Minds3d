// 🪪 Loaner Minds on the server (Round 27). A Loaner lives on the player's island (st.loaners) and plays like a Common Mind:
// 5 ranked games a day kept on the island (never the shared art token's energy), unlimited refills, fixed to the account.
// In a match a Loaner plays with its art id (49/14/8), so one team can never hold two Minds with the same art.
import { db } from './db.js';
import { normalize, ensureLoaner, addLoaner, loanerOf, loanerLeft, isLoanerId, LOANER_GAMES } from '../web/src/island/rules.js';

const day = now => new Date(now).toISOString().slice(0, 10);
async function edit(pid, fn, now = Date.now()) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) return { none: true };
    const st = normalize(isl.state, Number(isl.seed), now);
    const out = fn(st);
    if (out === false) return false;
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return out ?? true;
  }
  return false;
}
// the player's Loaners with today's games left: [{ id, art, left, cap, free }]
export async function loanersOf(pid, now = Date.now()) {
  const isl = await db.one('islands', `player_id=eq.${pid}`).catch(() => null);
  if (!isl) return [];
  const st = normalize(isl.state, Number(isl.seed), now);
  return (st.loaners || []).map(l => ({ id: l.id, art: l.art, left: loanerLeft(st, l.id, now), cap: LOANER_GAMES, ...(l.free ? { free: true } : {}) }));
}
// give a wallet player the free Loaner once (and move an old Rank Pass AI onto it)
export const giveFreeLoaner = (pid, now = Date.now()) => edit(pid, st => ensureLoaner(st, now) ? true : false, now);
export const buyLoaner = (pid, now = Date.now(), extra) => edit(pid, st => { const l = addLoaner(st, now); extra?.(st, l); return l; }, now);
// turn picked ids ('L2') into { art, loans } with checks; throws a message string on a bad pick
export function resolveLoaners(st, ids) {
  const out = [];
  for (const id of ids) { const l = loanerOf(st, id); if (!l) throw 'That Loaner is not yours.'; out.push(l.art); }
  return out;
}
// 1 game off each Loaner today; false (nothing spent) if any is empty
export function spendLoaners(pid, ids, now = Date.now()) {
  if (!ids.length) return Promise.resolve(true);
  return edit(pid, st => {
    if (ids.some(id => !loanerOf(st, id) || loanerLeft(st, id, now) < 1)) return false;
    for (const id of ids) { const l = loanerOf(st, id), d = day(now); l.used = (l.day === d ? l.used || 0 : 0) + 1; l.day = d; }
  }, now);
}
export function refundLoaners(pid, ids, now = Date.now()) {
  if (!ids.length) return Promise.resolve(true);
  return edit(pid, st => { for (const id of ids) { const l = loanerOf(st, id); if (l && l.day === day(now) && l.used > 0) l.used--; } }, now);
}
export const emptyLoaners = async (pid, ids, now = Date.now()) => { const all = await loanersOf(pid, now); return ids.filter(id => !(all.find(l => l.id === id)?.left > 0)); };
export { isLoanerId };
