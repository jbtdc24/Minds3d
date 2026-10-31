// Daily Siege Cup: pay a Gem entry, attack the SAME village with the SAME army as everyone else, 3 tries, best score
// counts. Next day all the entry Gems go to the winners. Real players only: no bots and no AI keys, and your Minds
// give no edge. The server replays every attack, so the score cannot be faked. Gems stay in the game: there is no cash-out.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { normalize } from '../../web/src/island/rules.js';
import { botVillage, publicSnap, replay, MAX_TICKS, TROOPS, SPELLS } from '../../web/src/island/raid.js';
import { hashStr } from '../../web/src/island/gen.js';
import { giveGift } from './mail.js';
import { feed } from '../feed.js';
import { flag } from '../admin.js';

export const CUP_ENTRY = 5, CUP_TRIES = 3, CUP_ARMY = { brawler: 4, archer: 3, bomber: 1, giant: 1 }, CUP_LEVEL = 4;   // tuned so a full clear is rare: see the difficulty test
const CUP_HERO = 'captain', RAID_MS = 3.5 * 60_000, SPLITS = { 1: [1], 2: [0.7, 0.3], 3: [0.6, 0.3, 0.1] };
const utcDay = (d = 0) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const army = () => ({ troops: { ...CUP_ARMY }, hero: CUP_HERO });
// three villages a day, the same three for everyone: a look at one does not help on the next
const village = (cup, attempt) => ({ ...botVillage((Number(cup.seed) + attempt * 2654435761) >>> 0, CUP_LEVEL), noise: (Number(cup.seed) * 31 + attempt + 1) >>> 0 || 1 });
export const cupScore = r => !r.pct ? 0 : r.stars * 10000 + Math.round(r.pct * 100) * 90 + Math.round((MAX_TICKS - r.S.tick) / 13);
const clean = list => (Array.isArray(list) ? list : []).slice(0, 60).map(a => {
  const t = Math.max(0, Math.min(MAX_TICKS, a?.t | 0)), k = a?.k | 0;
  if (a?.drop === 'hero' || TROOPS[a?.drop]) return { t, drop: a.drop, k };
  if (SPELLS[a?.spell]) return { t, spell: a.spell, k };
  return null;
}).filter(Boolean);

async function today() {
  const day = utcDay(), row = await db.one('cups', `day=eq.${day}`);
  if (row) return row;
  try { return await db.insert('cups', { day, seed: hashStr('cup' + day + (process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || '')), entry: CUP_ENTRY }); }
  catch (e) { if (e.dbStatus === 409) return db.one('cups', `day=eq.${day}`); throw e; }
}
// pay out finished cups: whoever looks first does it; the settled flag makes sure it happens once
export async function settle() {
  const old = await db.select('cups', `settled=eq.false&day=lt.${utcDay()}&limit=5`);
  for (const c of old) {
    const claimed = await db.update('cups', `day=eq.${c.day}&settled=eq.false`, { settled: true });
    if (!claimed.length) continue;
    const entries = await db.select('cup_entries', `day=eq.${c.day}&limit=1000`), pool = entries.length * c.entry;
    const ranked = entries.filter(e => e.best > 0).sort((a, b) => b.best - a.best).slice(0, 3);
    let winners = [];
    if (entries.length < 2 || !ranked.length) winners = entries.map(e => ({ pid: e.player_id, name: e.name, gems: c.entry, refund: true }));   // nobody to beat: money back
    else { const split = SPLITS[ranked.length]; winners = ranked.map((e, i) => ({ pid: e.player_id, name: e.name, gems: i ? Math.floor(pool * split[i]) : pool - ranked.slice(1).reduce((s, _, j) => s + Math.floor(pool * split[j + 1]), 0), score: e.best })); }
    // same connection among the winners: the owner looks at it, nothing is taken automatically
    const conns = await Promise.all(winners.map(w => db.one('islands', `player_id=eq.${w.pid}&select=state`).catch(() => null)));
    const dk = conns.map(r => r?.state?.dk).filter(Boolean);
    if (new Set(dk).size < dk.length) await flag(winners[0].pid, 'cup_same_connection', { day: c.day, players: winners.map(w => w.name) });
    for (const w of winners) {
      try {
        await giveGift(w.pid, { gems: w.gems });
        await db.insert('mail', { to_id: w.pid, title: w.refund ? '🏆 Cup entry returned' : `🏆 You won ${w.gems} Gems!`, body: w.refund ? `The ${c.day} cup had no result, so your entry came back.` : `You placed in the Daily Siege Cup of ${c.day}. Your Gems are on your island.` });
      } catch (e) { w.failed = true; console.error('cup payout', c.day, w.pid, e); }
    }
    await db.update('cups', `day=eq.${c.day}`, { winners });
    if (winners[0] && !winners[0].refund) feed(`🏆 ${winners[0].name} won the Daily Siege Cup: ${winners[0].gems} 💎!`);
  }
}
async function pay(pid, gems) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) fail(400, 'Open your island first.');
    const st = normalize(isl.state, Number(isl.seed), Date.now());
    if ((st.gems || 0) < gems) fail(403, `The entry is ${gems} 💎. You have ${st.gems || 0}.`);
    st.gems -= gems;
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return;
  }
  fail(409, 'your island is busy, try again');
}
export default route(async ({ req, body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  if (session.agent) fail(403, 'The cup is for human players only.');
  await settle();
  const cup = await today(), day = cup.day, q = `day=eq.${day}&player_id=eq.${p.id}`;
  let mine = await db.one('cup_entries', q);
  if (req.method === 'GET') {
    const all = await db.select('cup_entries', `day=eq.${day}&order=best.desc&limit=1000`), last = await db.one('cups', `settled=eq.true&order=day.desc`);
    return { day, entry: cup.entry, tries: CUP_TRIES, pool: all.length * cup.entry, players: all.length, top: all.filter(e => e.best > 0).slice(0, 10).map(e => ({ name: e.name, stars: e.stars, pct: e.pct, score: e.best })), me: mine && { tries: mine.tries, best: mine.best, stars: mine.stars, pct: mine.pct }, last: last && { day: last.day, winners: (last.winners || []).filter(w => !w.refund).map(w => ({ name: w.name, gems: w.gems })) }, endsAt: Date.parse(day + 'T00:00:00Z') + 864e5 };
  }
  if (p.is_guest) fail(403, 'Connect a wallet to enter the cup.');
  if (body.op === 'join') {
    if (mine) return { ok: true };
    try { await db.insert('cup_entries', { day, player_id: p.id, name: p.name }); }
    catch (e) { if (e.dbStatus === 409) return { ok: true }; throw e; }
    try { await pay(p.id, cup.entry); } catch (e) { await db.remove('cup_entries', q).catch(() => {}); throw e; }
    return { ok: true };
  }
  if (!mine) fail(403, 'Enter the cup first.');
  if (body.op === 'start') {
    if (mine.tries >= CUP_TRIES) fail(403, `You used all ${CUP_TRIES} tries today.`);
    const saved = await db.update('cup_entries', `${q}&tries=eq.${mine.tries}`, { tries: mine.tries + 1, started: new Date().toISOString() });
    if (!saved.length) fail(409, 'try again');
    return { snap: publicSnap(village(cup, mine.tries)), army: army(), triesLeft: CUP_TRIES - mine.tries - 1 };
  }
  if (body.op === 'score') {
    if (!mine.started || Date.now() - Date.parse(mine.started) > RAID_MS) fail(400, 'That try has ended.');
    const open = await db.update('cup_entries', `${q}&started=eq.${encodeURIComponent(mine.started)}`, { started: null });   // one score per try, even with two requests at once
    if (!open.length) fail(400, 'That try has ended.');
    const inputs = clean(body.inputs), r = replay(village(cup, mine.tries - 1), army(), inputs), score = cupScore(r);
    if (inputs.length && inputs.at(-1).t / 10 > (Date.now() - Date.parse(mine.started)) / 1000 + 5) { await flag(p.id, 'cup_fast', { ticks: inputs.at(-1).t }); fail(400, 'That try did not add up.'); }
    if (body.claim != null && Math.abs((body.claim | 0) - r.stars) > 1) await flag(p.id, 'cup_mismatch', { claimed: body.claim | 0, real: r.stars });
    if (score > mine.best) await db.update('cup_entries', q, { best: score, stars: r.stars, pct: Math.round(r.pct * 100) });
    return { score, best: Math.max(score, mine.best), stars: r.stars, pct: r.pct };
  }
  fail(400, 'unknown cup action');
}, { methods: ['GET', 'POST'], limit: [40, 60] });
