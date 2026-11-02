// How long the game keeps chat and history (owner asked: chat goes after 90 days, AI picked the rest).
// Owner set 2026-11-03: friend, duel and private chat 30 days; mail 30 days; reports 60 days; raid logs newest 20 (in the island).
// Mind Town chat starts fresh for each visitor (town.js); the server copy is kept 1 day only, for reports. Finished duels 30 days.
// Runs from the daily cron, and now and then from busy routes so it still happens without the cron.
import { db } from './db.js';

export const KEEP = { messages: 30, town_chat: 1, mail: 30, matches: 30, reports: 60, flags: 60 };
const ago = days => new Date(Date.now() - days * 864e5).toISOString();
let lastRun = 0;

export async function prune() {
  lastRun = Date.now();
  const jobs = [
    ['messages', `created_at=lt.${ago(KEEP.messages)}`],
    ['town_chat', `created_at=lt.${ago(KEEP.town_chat)}`],
    ['mail', `created_at=lt.${ago(KEEP.mail)}`],
    ['matches', `status=neq.live&created_at=lt.${ago(KEEP.matches)}`],
    ['reports', `created_at=lt.${ago(KEEP.reports)}`],
    ['flags', `at=lt.${ago(KEEP.flags)}`],
  ];
  const out = {};
  for (const [table, q] of jobs) {
    try { await db.remove(table, q); out[table] = 'ok'; } catch (e) { out[table] = e.message || 'failed'; }
  }
  return out;
}
// at most once an hour per server instance, and only on a few requests, so it never slows the game down
export function maybePrune() {
  if (Date.now() - lastRun < 3600e3 || Math.random() > 0.02) return;
  prune().catch(() => {});
}
