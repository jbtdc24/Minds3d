// Daily Siege Cup: pay a Gem entry, attack the SAME village with the SAME army as everyone else, 3 tries, best score
// counts. Next day the entry Gems go to the winners, minus a 10% house fee. Real players only: no bots and no AI keys, and your Minds
// give no edge. The server replays every attack, so the score cannot be faked. Gems stay in the game: there is no cash-out.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { normalize, logBuy } from '../../web/src/island/rules.js';
import { bossFortress, publicSnap, replay, MAX_TICKS, TROOPS, SPELLS } from '../../web/src/island/raid.js';
import { hashStr } from '../../web/src/island/gen.js';
import { giveGift } from './mail.js';
import { feed } from '../feed.js';
import { flag } from '../admin.js';

export const CUP_FEE = 0.10;   // the house keeps 10% of each paid-out pool; refunds are never charged
export const prizePool = pool => pool - Math.ceil(pool * CUP_FEE);
export const CUP_ENTRY = 5, CUP_TRIES = 3, CUP_ARMY = { brawler: 4, archer: 3, bomber: 1, giant: 0 }, CUP_LEVEL = 5, CUP_BUDGET = 9;   // tuned so a full clear is rare with any mix: see the difficulty test
const CUP_HERO = 'captain', RAID_MS = 5 * 60_000, SPLITS = { 1: [1], 2: [0.7, 0.3], 3: [0.6, 0.3, 0.1] };
const utcDay = (d = 0) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
// everyone gets the same budget (camp space) and picks any mix: strategy decides, not who trained or paid more.
// Troop levels and Minds never count here.
export function cupArmy(raw) {
  if (!raw || typeof raw !== 'object') return { ...CUP_ARMY };
  const out = {};   // every kind listed, 0 included (a missing kind would get the default count in the sim)
  let used = 0;
  for (const k of Object.keys(TROOPS)) { const n = Math.max(0, Math.min(CUP_BUDGET, raw[k] | 0)); out[k] = n; used += TROOPS[k].cost * n; }
  if (used > CUP_BUDGET) fail(400, `That army is over the budget (${used}/${CUP_BUDGET}).`);
  return used ? out : { ...CUP_ARMY };
}
const army = raw => ({ troops: cupArmy(raw), hero: CUP_HERO });
// three villages a day, the same three for everyone: a look at one does not help on the next
const village = (cup, attempt) => ({ ...bossFortress((Number(cup.seed) + attempt * 2654435761) >>> 0, CUP_LEVEL), theme: 'boss', noise: (Number(cup.seed) * 31 + attempt + 1) >>> 0 || 1 });
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
// entries: one per Mind you hold (at least 1), each costs the entry fee and adds 3 tries. The count lives on the
// island (st.cupe = { day, n }), so no table change is needed; the pool counts every paid entry
export const maxEntries = minds => Math.max(1, minds | 0);
async function entriesOf(day, rows) {
  if (!rows.length) return {};
  const isl = await db.select('islands', `player_id=in.(${rows.map(e => e.player_id).join(',')})&select=player_id,cupe:state->cupe`).catch(() => []);
  const got = Object.fromEntries(isl.map(r => { const c = r.cupe ?? r.state?.cupe; return [r.player_id, c?.day === day ? Math.max(1, c.n | 0) : 1]; }));
  return Object.fromEntries(rows.map(e => [e.player_id, got[e.player_id] || 1]));
}
const paidCount = n => Object.values(n).reduce((s, x) => s + x, 0);
// pay out finished cups: whoever looks first does it; the settled flag makes sure it happens once
export async function settle() {
  const old = await db.select('cups', `settled=eq.false&day=lt.${utcDay()}&limit=5`);
  for (const c of old) {
    const claimed = await db.update('cups', `day=eq.${c.day}&settled=eq.false`, { settled: true });
    if (!claimed.length) continue;
    const entries = await db.select('cup_entries', `day=eq.${c.day}&limit=1000`), n = await entriesOf(c.day, entries), pool = paidCount(n) * c.entry;
    const ranked = entries.filter(e => e.best > 0).sort((a, b) => b.best - a.best).slice(0, 3);
    let winners = [];
    if (entries.length < 2 || !ranked.length) winners = entries.map(e => ({ pid: e.player_id, name: e.name, gems: c.entry * n[e.player_id], refund: true }));   // nobody to beat: money back
    else { const prize = prizePool(pool), split = SPLITS[ranked.length]; winners = ranked.map((e, i) => ({ pid: e.player_id, name: e.name, gems: i ? Math.floor(prize * split[i]) : prize - ranked.slice(1).reduce((s, _, j) => s + Math.floor(prize * split[j + 1]), 0), score: e.best })); }
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
    await db.update('cups', `day=eq.${c.day}`, { winners });   // the fee (pool minus what winners got) stays with the house
    if (winners[0] && !winners[0].refund) feed(`🏆 ${winners[0].name} won the Daily Siege Cup: ${winners[0].gems} 💎!`);
  }
}
// pay one entry; first: the first entry of the day (else one more, up to one per Mind held). Returns the new count
async function pay(pid, gems, day, first) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) fail(400, 'Open your island first.');
    const st = normalize(isl.state, Number(isl.seed), Date.now());
    const had = first ? 0 : st.cupe?.day === day ? Math.max(1, st.cupe.n | 0) : 1;
    if (had >= maxEntries(isl.minds)) fail(403, `You have ${had} entr${had === 1 ? 'y' : 'ies'}: one per Mind you hold.`);
    if ((st.gems || 0) < gems) fail(403, `The entry is ${gems} 💎. You have ${st.gems || 0}.`);
    st.gems -= gems; st.cupe = { day, n: had + 1 };
    logBuy(st, { what: `🏆 Siege Cup entry ${had + 1}`, paid: { gems } });
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return had + 1;
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
    const n = await entriesOf(day, all), pool = paidCount(n) * cup.entry, isl = await db.one('islands', `player_id=eq.${p.id}&select=minds`).catch(() => null);
    return { day, entry: cup.entry, tries: CUP_TRIES, pool, prize: prizePool(pool), fee: CUP_FEE, players: all.length, entries: mine ? n[p.id] || 1 : 0, maxEntries: maxEntries(isl?.minds), top: all.filter(e => e.best > 0).slice(0, 10).map(e => ({ name: e.name, stars: e.stars, pct: e.pct, score: e.best })), me: mine && { tries: mine.tries, best: mine.best, stars: mine.stars, pct: mine.pct }, last: last && { day: last.day, winners: (last.winners || []).filter(w => !w.refund).map(w => ({ name: w.name, gems: w.gems })) }, endsAt: Date.parse(day + 'T00:00:00Z') + 864e5 };
  }
  if (p.is_guest) fail(403, 'Connect a wallet to enter the cup.');
  if (body.op === 'join') {
    if (mine) return { ok: true, entries: await pay(p.id, cup.entry, day, false) };   // one more entry (3 more tries)
    try { await db.insert('cup_entries', { day, player_id: p.id, name: p.name }); }
    catch (e) { if (e.dbStatus === 409) return { ok: true }; throw e; }
    try { return { ok: true, entries: await pay(p.id, cup.entry, day, true) }; } catch (e) { await db.remove('cup_entries', q).catch(() => {}); throw e; }
  }
  if (!mine) fail(403, 'Enter the cup first.');
  if (body.op === 'start') {
    const n = (await entriesOf(day, [mine]))[p.id] || 1;
    if (mine.tries >= CUP_TRIES * n) fail(403, `You used all ${CUP_TRIES * n} tries today. Each Mind you hold can buy one more entry.`);
    const saved = await db.update('cup_entries', `${q}&tries=eq.${mine.tries}`, { tries: mine.tries + 1, started: new Date().toISOString() });
    if (!saved.length) fail(409, 'try again');
    return { snap: publicSnap(village(cup, mine.tries)), army: army(), budget: CUP_BUDGET, triesLeft: CUP_TRIES * n - mine.tries - 1 };
  }
  if (body.op === 'score') {
    if (!mine.started || Date.now() - Date.parse(mine.started) > RAID_MS) fail(400, 'That try has ended.');
    const open = await db.update('cup_entries', `${q}&started=eq.${encodeURIComponent(mine.started)}`, { started: null });   // one score per try, even with two requests at once
    if (!open.length) fail(400, 'That try has ended.');
    const inputs = clean(body.inputs), r = replay(village(cup, mine.tries - 1), army(body.army), inputs), score = cupScore(r);
    if (inputs.length && inputs.at(-1).t / 10 > (Date.now() - Date.parse(mine.started)) / 1000 + 5) { await flag(p.id, 'cup_fast', { ticks: inputs.at(-1).t }); fail(400, 'That try did not add up.'); }
    if (body.claim != null && Math.abs((body.claim | 0) - r.stars) > 1) await flag(p.id, 'cup_mismatch', { claimed: body.claim | 0, real: r.stars });
    if (score > mine.best) await db.update('cup_entries', q, { best: score, stars: r.stars, pct: Math.round(r.pct * 100) });
    return { score, best: Math.max(score, mine.best), stars: r.stars, pct: r.pct };
  }
  fail(400, 'unknown cup action');
}, { methods: ['GET', 'POST'], limit: [40, 60] });
