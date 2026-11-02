// How long the game keeps chat and history (owner asked: chat goes after 90 days, AI picked the rest).
// Friend, duel and private chat: 90 days. Mind Town chat + Town Board: 7 days. Mail: 90 days.
// Finished duels (with their chat): 90 days. Reports and cheat-meter flags: 180 days. Raid logs: newest 50 (in the island).
// Runs from the daily cron, and now and then from busy routes so it still happens without the cron.
import { db } from './db.js';

export const KEEP = { messages: 90, town_chat: 7, mail: 90, matches: 90, reports: 180, flags: 180 };
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
