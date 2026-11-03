// Trades (in Mind Town, tap another player's Mind) and gifts (to a friend). Resources only: Dust, Gems, wood, stone,
// seeds, crops, potions, fuel, tickets. Never Minds, buildings, troops or looks.
// Safe by design:
//  - both players must agree to the SAME version of both offers; any change to an offer clears both agreements
//  - once both agree the trade locks (one request wins), then the goods move in exactly-once steps: each side's goods
//    are taken into escrow (a marker in that island, written in the same save), then each side receives the other's.
//    If one side cannot pay, everything taken is given back. A step cut off half-way is finished on the next look.
//  - daily send limits, wallets only (no guests, no AI keys), and big Gem moves are flagged for the owner to look at.
// ⚔️ Stake duels (kind 'duel', Mind Town): both put stakes in like a trade and agree; the stakes go into escrow, a
// private unrated duel starts, and the winner gets both stakes (a tie or an abandoned duel gives each their own back).
// open → locked → paying (escrow) → starting → playing (note = 'm:<match id>') → done | cancelled
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { flag } from '../admin.js';
import { startMatch } from '../game.js';
import { stillOwns, DEMO_MINDS } from '../owned.js';
import { normalize, canTrade, tradeHave, TRADE_DAY, TRADE_KINDS_MAX } from '../../web/src/island/rules.js';

const OPEN_MS = 10 * 60e3, TOWN_MS = 60e3, BIG_GEMS = 50, TX_KEEP = 30, LOG_KEEP = 30;
const isId = s => /^[0-9a-f-]{36}$/.test(s || '');
const utcDay = () => new Date().toISOString().slice(0, 10);

export function cleanGive(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {}).slice(0, 40)) {
    const n = Math.floor(Number(v));
    if (!canTrade(k) || !(n > 0)) continue;
    out[k] = Math.min(1e6, n);
  }
  if (Object.keys(out).length > TRADE_KINDS_MAX) fail(400, `Up to ${TRADE_KINDS_MAX} kinds of things per trade.`);
  return out;
}
const sideOf = (t, pid) => (t.a === pid ? 'a' : t.b === pid ? 'b' : null);
const other = s => (s === 'a' ? 'b' : 'a');

// change one island, exactly once per trade step: fn(st, mark) returns false to stop without saving
async function onIsland(pid, fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) return { ok: false, why: 'no island' };
    const st = normalize(isl.state, Number(isl.seed), Date.now());
    const r = fn(st);
    if (r === true) return { ok: true, same: true };
    if (!r?.ok) return r || { ok: false };
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return r;
  }
  return { ok: false, why: 'busy' };
}
const marks = (st, id) => { st.tx ||= {}; const m = (st.tx[id] ||= { at: Date.now() }); const ids = Object.keys(st.tx); if (ids.length > TX_KEEP) for (const k of ids.sort((x, y) => st.tx[x].at - st.tx[y].at).slice(0, ids.length - TX_KEEP)) if (k !== id) delete st.tx[k]; return m; };
const add = (st, k, n) => { if (k === 'dust') st.dust += n; else if (k === 'gems') st.gems = (st.gems || 0) + n; else { st.inv[k] = (st.inv[k] || 0) + n; if (!st.inv[k]) delete st.inv[k]; } };
const sentToday = st => (st.sent?.day === utcDay() ? st.sent : { day: utcDay(), gems: 0, dust: 0 });
const words = give => Object.entries(give).map(([k, n]) => `${n.toLocaleString()} ${k === 'dust' ? '✨' : k === 'gems' ? '💎' : k.replace(/_/g, ' ')}`).join(', ') || 'nothing';
const logTo = (st, line) => { st.tradeLog = [{ at: Date.now(), ...line }, ...(st.tradeLog || [])].slice(0, LOG_KEEP); };

// take one side's goods into escrow
const take = (t, s) => onIsland(t[s], st => {
  const m = marks(st, t.id);
  if (m.back) return { ok: false, why: 'the trade was cancelled' };
  if (m.took) return true;
  const give = t[`give_${s}`], sent = sentToday(st);
  for (const [k, n] of Object.entries(give)) if (tradeHave(st, k) < n) return { ok: false, why: `not enough ${k === 'dust' ? 'Dust' : k === 'gems' ? 'Gems' : k.replace(/_/g, ' ')}` };
  if (sent.gems + (give.gems || 0) > TRADE_DAY.gems) return { ok: false, why: `${TRADE_DAY.gems} Gems a day can be sent` };
  if (sent.dust + (give.dust || 0) > TRADE_DAY.dust) return { ok: false, why: `${TRADE_DAY.dust.toLocaleString()} Dust a day can be sent` };
  for (const [k, n] of Object.entries(give)) add(st, k, -n);
  st.sent = { day: sent.day, gems: sent.gems + (give.gems || 0), dust: sent.dust + (give.dust || 0) };
  m.took = 1; return { ok: true };
});
// give one side what the other side put in
const receive = (t, s, names) => onIsland(t[s], st => {
  const m = marks(st, t.id);
  if (m.got) return true;
  for (const [k, n] of Object.entries(t[`give_${other(s)}`])) add(st, k, n);
  m.got = 1;
  logTo(st, { kind: t.kind, with: names[other(s)], gave: words(t[`give_${s}`]), got: words(t[`give_${other(s)}`]) });
  return { ok: true };
});
// give back what was taken (the trade fell through)
const giveBack = (t, s) => onIsland(t[s], st => {
  const m = marks(st, t.id);
  if (!m.took || m.back || m.got) return true;
  for (const [k, n] of Object.entries(t[`give_${s}`])) add(st, k, n);
  const sent = sentToday(st);
  st.sent = { day: sent.day, gems: Math.max(0, sent.gems - (t[`give_${s}`].gems || 0)), dust: Math.max(0, sent.dust - (t[`give_${s}`].dust || 0)) };
  m.back = 1; return { ok: true };
});

// a stake duel: each side plays the Minds on show in their profile if they still hold them (else their picture's
// Mind, else the loaner Minds); the duel is unrated
async function duelMinds(p) {
  const want = [...new Set([...(p.showcase || []), p.pfp].map(Number).filter(n => n >= 1 && n <= 3333))].slice(0, 3);
  if (!p.is_guest && want.length && (await stillOwns(p.address, want).catch(() => false))) return want;
  return DEMO_MINDS;
}
const matchOf = t => (/^m:([0-9a-f-]{36})/.exec(t.note || '') || [])[1] || null;
// the winner (seat 0 = a) gets both stakes into their island, once
const winBoth = (t, s, names) => onIsland(t[s], st => {
  const m = marks(st, t.id);
  if (m.won) return true;
  for (const x of ['a', 'b']) for (const [k, n] of Object.entries(t[`give_${x}`])) add(st, k, n);
  m.won = 1; m.got = 1;
  logTo(st, { kind: 'duel', with: names[other(s)], gave: words(t[`give_${s}`]), got: `won ${words(t[`give_${other(s)}`])}` });
  return { ok: true };
});
async function duelStep(t) {
  const stamp = () => new Date().toISOString();
  if (t.status === 'paying') {   // escrow done: one request claims the start, makes the match, then marks it playing
    const [mine] = await db.update('trades', `id=eq.${t.id}&status=eq.paying`, { status: 'starting', updated_at: stamp() });
    if (!mine) return db.one('trades', `id=eq.${t.id}`);
    const [pa, pb] = await Promise.all([db.one('players', `id=eq.${t.a}`), db.one('players', `id=eq.${t.b}`)]);
    try {
      const m = await startMatch({ player: pa, minds: await duelMinds(pa) }, { player: pb, minds: await duelMinds(pb) }, { ranked: false });
      const [row] = await db.update('trades', `id=eq.${t.id}&status=eq.starting`, { status: 'playing', note: `m:${m.id}`, updated_at: stamp() });
      return row || db.one('trades', `id=eq.${t.id}`);
    } catch {
      await db.update('trades', `id=eq.${t.id}&status=eq.starting`, { status: 'cancelled', note: 'the duel could not start', updated_at: stamp() });
      return finish(await db.one('trades', `id=eq.${t.id}`));
    }
  }
  if (t.status === 'starting') {   // cut off while starting: after a minute, call it off and give everything back
    if (Date.now() - Date.parse(t.updated_at) < 60e3) return t;
    await db.update('trades', `id=eq.${t.id}&status=eq.starting`, { status: 'cancelled', note: 'the duel could not start', updated_at: stamp() });
    return finish(await db.one('trades', `id=eq.${t.id}`));
  }
  if (t.status === 'playing') {   // the duel ended: pay the winner both stakes, or give each their own back
    const id = matchOf(t), m = id && (await db.one('matches', `id=eq.${id}&select=id,status,winner`));
    if (m && m.status === 'live') return t;
    const names = Object.fromEntries((await db.select('players', `id=in.(${t.a},${t.b})&select=id,name`)).map(p => [p.id === t.a ? 'a' : 'b', p.name]));
    const seat = m && m.status === 'done' && m.winner != null ? Number(m.winner) : null;
    if (seat === 0 || seat === 1) {
      const s = seat === 0 ? 'a' : 'b', r = await winBoth(t, s, names);
      if (!r.ok) return t;
      const [row] = await db.update('trades', `id=eq.${t.id}&status=eq.playing`, { status: 'done', note: `m:${id} won:${s}`, updated_at: stamp() });
      return row || db.one('trades', `id=eq.${t.id}`);
    }
    for (const x of ['a', 'b']) { const r = await giveBack(t, x); if (!r.ok) return t; }
    const [row] = await db.update('trades', `id=eq.${t.id}&status=eq.playing`, { status: 'done', note: `m:${id} tie`, updated_at: stamp() });
    return row || db.one('trades', `id=eq.${t.id}`);
  }
  return t;
}

// move the goods of a locked trade; safe to call again and again, from both players at once.
// locked → (both sides taken into escrow) → paying → (both sides receive) → done. A side that cannot pay turns
// locked → cancelled, and a cancelled trade always gives back whatever was taken. paying and cancelled exclude each other.
export async function finish(t) {
  if (t.kind === 'duel' && ['paying', 'starting', 'playing'].includes(t.status)) return duelStep(t);
  if (!['locked', 'paying', 'cancelled'].includes(t.status)) return t;
  const names = Object.fromEntries((await db.select('players', `id=in.(${t.a},${t.b})&select=id,name`)).map(p => [p.id === t.a ? 'a' : 'b', p.name]));
  const stamp = () => new Date().toISOString();
  const undo = async row => { for (const x of ['a', 'b']) await giveBack(t, x); return row; };
  if (t.status === 'cancelled') return undo(t);
  if (t.status === 'locked') {
    for (const s of ['a', 'b']) {
      const r = await take(t, s);
      if (r.ok) continue;
      if (r.why === 'busy') return t;   // try again on the next look
      const why = `${names[s] || 'A player'}: ${r.why}`;
      await db.update('trades', `id=eq.${t.id}&status=eq.locked`, { status: 'cancelled', note: why.slice(0, 120), updated_at: stamp() });
      const now = await db.one('trades', `id=eq.${t.id}`);
      return now.status === 'cancelled' ? undo(now) : finish(now);
    }
    await db.update('trades', `id=eq.${t.id}&status=eq.locked`, { status: 'paying', updated_at: stamp() });
    t = await db.one('trades', `id=eq.${t.id}`);
    if (t.status === 'cancelled') return undo(t);   // someone else cancelled while we were taking: give it all back
    if (t.kind === 'duel') return duelStep(t);       // stakes are in escrow: start the duel
  }
  if (t.status !== 'paying') return t;
  for (const s of ['a', 'b']) { const r = await receive(t, s, names); if (!r.ok) return t; }
  const [row] = await db.update('trades', `id=eq.${t.id}&status=eq.paying`, { status: 'done', updated_at: stamp() });
  const gems = Math.max(t.give_a.gems || 0, t.give_b.gems || 0);
  if (row && gems >= BIG_GEMS) await flag(gems === (t.give_a.gems || 0) ? t.a : t.b, 'trade_gems', { id: t.id, kind: t.kind, a: names.a, b: names.b, give_a: t.give_a, give_b: t.give_b });
  return row || (await db.one('trades', `id=eq.${t.id}`));
}

const view = (t, me) => t && ({ id: t.id, kind: t.kind, status: t.status, ver: t.ver, note: t.note || null, mine: sideOf(t, me) === 'a' ? t.give_a : t.give_b, theirs: sideOf(t, me) === 'a' ? t.give_b : t.give_a,
  meOk: sideOf(t, me) === 'a' ? t.ok_a : t.ok_b, themOk: sideOf(t, me) === 'a' ? t.ok_b : t.ok_a, started: t.a === me, updatedAt: t.updated_at,
  ...(t.kind === 'duel' ? { match: matchOf(t), result: / won:/.test(t.note || '') ? (t.note.endsWith(`won:${sideOf(t, me)}`) ? 'won' : 'lost') : / tie$/.test(t.note || '') ? 'tie' : null } : {}) });
async function current(me) {
  // a cancelled trade cut off before it gave everything back: finish the giving back now (does nothing if already done)
  for (const t of await db.select('trades', `or=(a.eq.${me},b.eq.${me})&status=eq.cancelled&updated_at=gt.${new Date(Date.now() - 30 * 60e3).toISOString()}&limit=3`)) await finish(t);
  const rows = await db.select('trades', `or=(a.eq.${me},b.eq.${me})&kind=in.(trade,duel)&status=in.(open,locked,paying,starting,playing)&order=created_at.desc&limit=5`);
  const now = Date.now();
  for (const t of rows) {
    if (t.status === 'open' && now - Date.parse(t.updated_at || t.created_at) > OPEN_MS) { await db.update('trades', `id=eq.${t.id}&status=eq.open`, { status: 'cancelled', note: 'timed out', updated_at: new Date().toISOString() }); continue; }
    return t.status === 'open' ? t : finish(t);
  }
  return null;
}
const inTown = async pid => { const r = await db.one('town_now', `player_id=eq.${pid}`); return !!r && Date.now() - Date.parse(r.at) < TOWN_MS; };

export default route(async ({ body, session }) => {
  if (session.agent) fail(403, 'Only players can trade.');
  const me = await db.one('players', `id=eq.${session.pid}`);
  if (!me) fail(401, 'account not found');
  if (me.is_guest) fail(403, 'Connect a wallet to trade and send gifts.');
  const op = body.op;
  const withName = async t => { if (!t) return null; const o = await db.one('players', `id=eq.${t.a === me.id ? t.b : t.a}&select=id,name,pfp`); return { ...view(t, me.id), with: o }; };
  if (op === 'get') return { trade: await withName(await current(me.id)) };
  if (op === 'log') { const isl = await db.one('islands', `player_id=eq.${me.id}`); return { log: isl?.state?.tradeLog || [], sent: isl ? sentToday(isl.state) : null, limits: TRADE_DAY }; }
  if (op === 'see') {   // one trade or stake duel of yours, by id (to learn how a stake duel ended)
    if (!isId(body.id)) fail(400, 'bad trade id');
    let t = await db.one('trades', `id=eq.${body.id}`);
    if (!t || !sideOf(t, me.id)) fail(404, 'trade not found');
    t = await finish(t);
    return { trade: await withName(t) };
  }
  if (op === 'open') {   // start a trade (or a stake duel) with a player who is in Mind Town with you
    const kind = body.kind === 'duel' ? 'duel' : 'trade';
    if (!isId(body.with) || body.with === me.id) fail(400, 'Pick another player.');
    const o = await db.one('players', `id=eq.${body.with}`);
    if (!o || o.is_guest) fail(404, 'That player cannot trade.');
    const blocked = await db.select('friends', `or=(and(a.eq.${me.id},b.eq.${o.id}),and(a.eq.${o.id},b.eq.${me.id}))&status=eq.blocked&limit=1`);
    if (blocked.length) fail(403, 'You cannot trade with this player.');
    if (!(await inTown(me.id)) || !(await inTown(o.id))) fail(403, kind === 'duel' ? 'Stake duels happen in Mind Town: you both need to be there.' : 'Trading happens in Mind Town: you both need to be there.');
    const mine = await current(me.id);
    if (mine) { if ([mine.a, mine.b].includes(o.id) && mine.kind === kind) return { trade: await withName(mine) }; fail(409, 'Finish or cancel your other trade or duel first.'); }
    if (await current(o.id)) fail(409, 'That player is busy with another trade or duel right now.');
    const t = await db.insert('trades', { kind, a: me.id, b: o.id, give_a: {}, give_b: {}, ok_a: false, ok_b: false, ver: 0, status: 'open', updated_at: new Date().toISOString() });
    return { trade: await withName(t) };
  }
  if (op === 'gift') {   // a one-way gift to a friend: no trade, the sender confirms twice in the game
    if (!isId(body.to) || body.to === me.id) fail(400, 'Pick a friend.');
    const fr = await db.select('friends', `or=(and(a.eq.${me.id},b.eq.${body.to}),and(a.eq.${body.to},b.eq.${me.id}))&status=eq.accepted&limit=1`);
    if (!fr.length) fail(403, 'You can send gifts to friends only.');
    const give = cleanGive(body.give);
    if (!Object.keys(give).length) fail(400, 'Pick something to send.');
    const t = await db.insert('trades', { kind: 'gift', a: me.id, b: body.to, give_a: give, give_b: {}, ok_a: true, ok_b: true, ver: 0, status: 'locked', updated_at: new Date().toISOString() });
    const done = await finish(t);
    if (done.status !== 'done') fail(400, done.status === 'cancelled' ? `Not sent: ${done.note}` : 'Not sent yet: try again in a moment.');
    await db.insert('mail', { to_id: body.to, title: `🎁 ${me.name} sent you a gift`, body: `${words(give)} is on your island now.` }).catch(() => {});
    return { ok: true, sent: give };
  }
  if (!isId(body.id)) fail(400, 'bad trade id');
  let t = await db.one('trades', `id=eq.${body.id}`);
  const s = t && sideOf(t, me.id);
  if (!s || !['trade', 'duel'].includes(t.kind)) fail(404, 'trade not found');
  if (['locked', 'paying'].includes(t.status)) t = await finish(t);
  if (op === 'cancel') {
    if (t.status === 'open') { const [row] = await db.update('trades', `id=eq.${t.id}&status=eq.open`, { status: 'cancelled', note: `${me.name} cancelled`, updated_at: new Date().toISOString() }); t = row || (await db.one('trades', `id=eq.${t.id}`)); }
    return { trade: await withName(t) };
  }
  if (t.status !== 'open') return { trade: await withName(t) };
  if (op === 'offer') {   // change what you give: both agreements reset, so nobody agrees to something that changed
    const give = cleanGive(body.give);
    const isl = await db.one('islands', `player_id=eq.${me.id}`), st = isl && normalize(isl.state, Number(isl.seed), Date.now());
    for (const [k, n] of Object.entries(give)) if (!st || tradeHave(st, k) < n) fail(400, `You do not have ${n.toLocaleString()} ${k === 'dust' ? 'Dust' : k === 'gems' ? 'Gems' : k.replace(/_/g, ' ')}.`);
    const [row] = await db.update('trades', `id=eq.${t.id}&status=eq.open&ver=eq.${t.ver}`, { [`give_${s}`]: give, ver: t.ver + 1, ok_a: false, ok_b: false, updated_at: new Date().toISOString() });
    if (!row) fail(409, 'The trade just changed. Look again.');
    return { trade: await withName(row) };
  }
  if (op === 'agree') {   // agree to exactly the version you saw
    if ((body.ver | 0) !== t.ver) fail(409, 'The trade changed after you looked. Check it again before agreeing.');
    let [row] = await db.update('trades', `id=eq.${t.id}&status=eq.open&ver=eq.${t.ver}`, { [`ok_${s}`]: true, updated_at: new Date().toISOString() });
    if (!row) fail(409, 'The trade just changed. Look again.');
    if (row.ok_a && row.ok_b) {
      const [locked] = await db.update('trades', `id=eq.${t.id}&status=eq.open&ver=eq.${t.ver}&ok_a=eq.true&ok_b=eq.true`, { status: 'locked', updated_at: new Date().toISOString() });
      row = locked ? await finish(locked) : await db.one('trades', `id=eq.${t.id}`);
    }
    return { trade: await withName(row) };
  }
  fail(400, 'unknown trade action');
}, { limit: [90, 60] });
