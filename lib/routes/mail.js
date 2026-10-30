// Mail: announcements for everyone + personal letters, newest first. A gift can only be taken once (mail_claims key).
import { route, fail, touch } from '../http.js';
import { db } from '../db.js';
import { normalize } from '../../web/src/island/rules.js';

const KEEP = 50;
export async function giveGift(pid, gift) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) fail(400, 'Open your island first, then take the gift.');
    const st = normalize(isl.state, Number(isl.seed), Date.now());
    st.dust += Math.max(0, gift.dust | 0); st.gems = (st.gems || 0) + Math.max(0, gift.gems | 0);
    for (const [k, n] of Object.entries(gift.items || {})) if (/^[a-z_]{2,30}$/.test(k) && n > 0) st.inv[k] = (st.inv[k] || 0) + (n | 0);
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return;
  }
  fail(409, 'your island is busy, try again');
}
export default route(async ({ req, body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  touch(p);
  if (req.method === 'GET') {
    const rows = await db.select('mail', `or=(to_id.is.null,to_id.eq.${p.id})&order=created_at.desc&limit=${KEEP}`);
    const claims = await db.select('mail_claims', `player_id=eq.${p.id}&select=mail_id&limit=500`), got = new Set(claims.map(c => c.mail_id));
    return { mail: rows.map(m => ({ id: m.id, title: m.title, body: m.body, gift: m.gift || null, taken: got.has(m.id), at: m.created_at, personal: !!m.to_id })) };
  }
  if (body.op !== 'claim') fail(400, 'unknown mail action');
  const m = await db.one('mail', `id=eq.${Number(body.id) | 0}`);
  if (!m || (m.to_id && m.to_id !== p.id)) fail(404, 'That letter is gone.');
  if (!m.gift) fail(400, 'This letter has no gift.');
  try { await db.insert('mail_claims', { mail_id: m.id, player_id: p.id }); }
  catch (e) { if (e.dbStatus === 409) fail(400, 'You already took this gift.'); throw e; }
  try { await giveGift(p.id, m.gift); }
  catch (e) { await db.remove('mail_claims', `mail_id=eq.${m.id}&player_id=eq.${p.id}`).catch(() => {}); throw e; }
  return { ok: true, gift: m.gift };
}, { methods: ['GET', 'POST'], limit: [30, 60] });
