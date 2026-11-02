// Mind Town: who is here, town chat, the Town Board news and the rewards for hanging out.
// Each visit sends a heartbeat. Ten minutes of taking part earns Town Time (6 a day), and meeting new players pays a small gift.
import { route, fail, touch } from '../http.js';
import { db } from '../db.js';
import { looksOf, forget } from '../looks.js';
import { maybePrune } from '../retention.js';
import { normalize } from '../../web/src/island/rules.js';

export const TOWN_W = 2400, TOWN_H = 1600, TOWN_PAY = 40, TOWN_MEET = 20, MEGA_GEMS = 1, MEGA_MS = 3600e3;
const MOVED = 16, ACT_CREDIT = 50e3, BEAT_MAX = 15e3, STAY_MS = 10 * 60e3, DAY_MAX = 6, MEET_MAX = 5, GONE_MS = 45e3, BREAK_MS = 90e3, NEAR = 70;
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
  const now = Date.now(), iso = new Date(now).toISOString();
  const [p, was] = await Promise.all([db.one('players', `id=eq.${session.pid}`), db.one('town_now', `player_id=eq.${session.pid}`)]);
  if (!p) fail(401, 'account not found');
  touch(p);
  if (body.op === 'mega') {   // 📣 Megaphone: a message over your head for an hour, for 1 Gem
    if (p.is_guest) fail(403, 'Connect a wallet to use the Megaphone.');
    const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) : '';
    if (!text) fail(400, 'Type a message first.');
    let short = false;
    const done = await reward(p.id, st => { if ((st.gems || 0) < MEGA_GEMS) { short = true; return null; } st.gems -= MEGA_GEMS; st.mega = { text, until: now + MEGA_MS }; return { gems: st.gems }; });
    if (short) fail(403, `The Megaphone costs ${MEGA_GEMS} 💎.`);
    if (!done) fail(409, 'your island is busy, try again');
    forget(p.id);
    await db.insert('town_chat', { player_id: p.id, name: p.name, text: `📣 ${text}`, kind: 'chat' });
    return { ok: true, gems: done.gems, mega: { text, until: now + MEGA_MS } };
  }
  const say = typeof body.say === 'string' ? body.say.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '';
  if (say && p.is_guest) fail(403, 'Connect a wallet to chat in town.');
  const fresh = !was || now - Date.parse(was.at) > BREAK_MS;
  // standing still does not earn: the server sees if you moved or spoke; each such moment keeps the clock going for a minute
  const x = num(body.x, TOWN_W), y = num(body.y, TOWN_H), acted = !!say || (was && Math.hypot(x - was.x, y - was.y) >= MOVED);
  const gap = was ? Math.min(BEAT_MAX, now - Date.parse(was.at)) : 0, since = fresh ? iso : new Date(Math.min(now, Date.parse(was.since) + (acted ? -ACT_CREDIT : gap))).toISOString();
  const row = { player_id: p.id, name: p.name, mind: num(body.mind, 3333), x, y, since, at: iso };
  await Promise.all([db.upsert('town_now', row, 'player_id'), say ? db.insert('town_chat', { player_id: p.id, name: p.name, text: say, kind: 'chat' }) : null]);
  maybePrune();   // town chat older than 7 days, old mail and chat go (lib/retention.js)
  // town chat starts fresh each time you walk in (owner 2026-11-03): you only see what was said while you are here.
  // The first beat of a visit (after = 0) gets no old chat, only the Town Board news, and where to start reading.
  const after = Number(body.after) | 0;
  const [live, recent] = await Promise.all([db.select('town_now', `at=gt.${new Date(now - GONE_MS).toISOString()}&order=at.desc&limit=80`), db.select('town_chat', `id=gt.${after}&order=id.desc&limit=30`)]);
  const lastId = recent.reduce((m, c) => Math.max(m, c.id), after);
  const chat = after ? recent : recent.filter(c => c.kind === 'news').slice(0, 5);
  const near = live.find(o => o.player_id !== p.id && Math.hypot(o.x - row.x, o.y - row.y) < NEAR);
  let got = null;
  if (now - Date.parse(row.since) >= STAY_MS) {
    // restart the clock first: of two requests at once, only one gets past this
    const claimed = await db.update('town_now', `player_id=eq.${p.id}&since=eq.${encodeURIComponent(row.since)}`, { since: iso });
    if (claimed.length) got = await reward(p.id, st => { if (st.tn.n >= DAY_MAX) return null; st.tn.n++; st.dust += TOWN_PAY; return { dust: TOWN_PAY, kind: 'time' }; });
  } else if (near) {
    got = await reward(p.id, st => { if (st.tn.met.length >= MEET_MAX || st.tn.met.includes(near.player_id)) return null; st.tn.met.push(near.player_id); st.dust += TOWN_MEET; return { dust: TOWN_MEET, kind: 'meet', who: near.name }; });
  }
  const looks = await looksOf(live.map(o => o.player_id));
  return { people: live.filter(o => o.player_id !== p.id).map(o => ({ id: o.player_id, name: o.name, mind: o.mind, x: o.x, y: o.y, cos: looks[o.player_id] || null })), count: live.length, chat: chat.reverse().map(c => ({ id: c.id, name: c.name, text: c.text, kind: c.kind })), lastId, stay: Math.max(0, STAY_MS - (now - Date.parse(row.since))), got };
}, { limit: [60, 60] });
