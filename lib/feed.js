// The Town Board: short public news lines (big raids, cup winners). Best effort, never blocks the game.
import { db } from './db.js';
export async function feed(text) {
  try { await db.insert('town_chat', { name: '', text: String(text).slice(0, 140), kind: 'news' }); } catch { /* table may be missing */ }
}
