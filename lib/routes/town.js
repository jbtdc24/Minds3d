// Mind Town: who is here, town chat, the Town Board news and the rewards for hanging out.
// Each visit sends a heartbeat. Stay 10 minutes in a row for Town Time (6 a day), and meet new players for a small gift.
import { route, fail, touch } from '../http.js';
import { db } from '../db.js';
import { normalize } from '../../web/src/island/rules.js';

export const TOWN_W = 2400, TOWN_H = 1600, TOWN_PAY = 40, TOWN_MEET = 20;
const STAY_MS = 10 * 60e3, DAY_MAX = 6, MEET_MAX = 5, GONE_MS = 45e3, BREAK_MS = 90e3, NEAR = 70;
const utcDay = () => new Date().toISOString().slice(0, 10);
const num = (v, max) => Math.max(0, Math.min(max, v | 0));

async function reward(pid, fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) return null;
    const st = normalize(isl.state, Number(isl.seed), Date.now()), day = utcDay();
    if (st.tn?.day !== day) st.tn = { day, n: 0, met: [] };
    const out = fn(st);
    if (!out) return null;
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return { ...out, n: st.tn.n };
  }
  return null;
}
export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  touch(p);
  const now = Date.now(), iso = new Date(now).toISOString(), was = await db.one('town_now', `player_id=eq.${p.id}`);
  const fresh = !was || now - Date.parse(was.at) > BREAK_MS;
  const row = { player_id: p.id, name: p.name, mind: num(body.mind, 3333), x: num(body.x, TOWN_W), y: num(body.y, TOWN_H), since: fresh ? iso : was.since, at: iso };
  await db.upsert('town_now', row, 'player_id');
  const say = typeof body.say === 'string' ? body.say.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '';
  if (say) {
    if (p.is_guest) fail(403, 'Connect a wallet to chat in town.');
    await db.insert('town_chat', { player_id: p.id, name: p.name, text: say, kind: 'chat' });
    if (Math.random() < 0.05) db.remove('town_chat', `created_at=lt.${new Date(now - 864e5).toISOString()}`).catch(() => {});
  }
  const live = await db.select('town_now', `at=gt.${new Date(now - GONE_MS).toISOString()}&order=at.desc&limit=80`);
  const near = live.find(o => o.player_id !== p.id && Math.hypot(o.x - row.x, o.y - row.y) < NEAR);
  let got = null;
  if (now - Date.parse(row.since) >= STAY_MS) {
    got = await reward(p.id, st => { if (st.tn.n >= DAY_MAX) return null; st.tn.n++; st.dust += TOWN_PAY; return { dust: TOWN_PAY, kind: 'time' }; });
    await db.update('town_now', `player_id=eq.${p.id}`, { since: iso });
  } else if (near) {
    got = await reward(p.id, st => { if (st.tn.met.length >= MEET_MAX || st.tn.met.includes(near.player_id)) return null; st.tn.met.push(near.player_id); st.dust += TOWN_MEET; return { dust: TOWN_MEET, kind: 'meet', who: near.name }; });
  }
  const after = Number(body.after) | 0, online = await db.count('players', `last_seen=gt.${new Date(now - 5 * 60e3).toISOString()}`).catch(() => 0);
  const chat = await db.select('town_chat', `id=gt.${after}&order=id.desc&limit=30`);
  return { people: live.filter(o => o.player_id !== p.id).map(o => ({ id: o.player_id, name: o.name, mind: o.mind, x: o.x, y: o.y })), count: live.length, online, chat: chat.reverse().map(c => ({ id: c.id, name: c.name, text: c.text, kind: c.kind })), stay: Math.max(0, STAY_MS - (now - Date.parse(row.since))), got };
}, { limit: [40, 60] });
