// The looks other players see: frame, name colour and card back each player wears (island state cos).
// One query for many players. Looks only, never power; a failed read just shows the default look.
import { db } from './db.js';

// mega = a 📣 Megaphone message over the player's head in Mind Town (1 💎, 1 hour)
const clean = (c, mega) => {
  const m = mega && mega.until > Date.now() && typeof mega.text === 'string' ? { text: mega.text.slice(0, 80), until: mega.until } : null;
  return c && (c.back || c.frame || c.name || c.sky) || m ? { back: c?.back || null, frame: c?.frame || null, name: c?.name || null, sky: c?.sky || null, ...(m ? { mega: m } : {}) } : null;
};

// a short per-instance cache, so busy lists (Mind Town beats every few seconds) do not read every island each time
const cache = new Map(), TTL = 20e3;
export async function looksOf(ids) {
  const now = Date.now(), list = [...new Set(ids.filter(id => /^[0-9a-f-]{36}$/.test(id || '')))], out = {};
  const need = list.filter(id => { const c = cache.get(id); if (c && now - c.at < TTL) { if (c.cos) out[id] = c.cos; return false; } return true; });
  if (!need.length) return out;
  try {
    const rows = await db.select('islands', `player_id=in.(${need.join(',')})&select=player_id,cos:state->cos,mega:state->mega`);
    const got = Object.fromEntries(rows.map(r => [r.player_id, clean(r.cos ?? r.state?.cos, r.mega ?? r.state?.mega)]));
    for (const id of need) { cache.set(id, { at: now, cos: got[id] || null }); if (got[id]) out[id] = got[id]; }
    if (cache.size > 5000) cache.clear();
  } catch { /* default looks */ }
  return out;
}
// a list of public players with the looks they wear (p.cos)
export const forget = id => cache.delete(id);   // after a change the player made, so it shows at once
export async function withLooks(players) {
  const looks = await looksOf(players.map(p => p?.id));
  return players.map(p => p && (looks[p.id] ? { ...p, cos: looks[p.id] } : p));
}
