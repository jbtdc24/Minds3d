// Server-authoritative match service. The engine state (including both secret picks) only lives in
// the database; players only ever receive viewFor() of their own side.
import { createMatch, submit, viewFor, timeout, forfeitMatch } from '../web/src/duel/engine.js';
import { Bot } from '../web/src/duel/bot.js';
import { db, broadcast } from './db.js';
import { eloDelta, winPoints, lossPoints, duelDust, botFor, BOT_FACTOR } from './rating.js';
import RARITY from './rarity.js';
import { phraseOk, BOT_REPLIES } from '../web/src/chat.js';
import { freeBotName } from './names.js';

export const TURN_SECONDS = 20;          // no pick in time = you lose the round
const REVEAL_SECONDS = 6;                // time for the reveal animation before the next turn's clock really starts
const deadline = (extra = 0) => new Date(Date.now() + (TURN_SECONDS + extra) * 1000).toISOString();
const reviveBot = (data, level) => Object.assign(new Bot(level), data || {});

export const rarityOf = id => RARITY[id] || 'Common';

// a / b = { player row, minds }; b null -> bot
// practice = a bot match the player asked for (labelled as such); any other bot fills in as a normal-looking rival
// a duel played by a player's AI is always labelled
const shown = p => (p.ai_until && Date.parse(p.ai_until) > Date.now() ? `${p.name} 🤖` : p.name);
export async function startMatch(a, b, { ranked, botLevel, practice = false }) {
  const seed = (Math.random() * 2 ** 31) | 0, botName = b || practice ? null : await freeBotName(seed);
  const players = [
    { name: shown(a.player), minds: a.minds },
    b ? { name: shown(b.player), minds: b.minds } : { name: practice ? `BOT · ${botLevel}` : botName, minds: botMinds() },
  ];
  const state = createMatch({ seed, players });
  if (!b) { state.practice = practice; state.botAt = Date.now() + thinkMs(3); }
  const bot = b ? null : new Bot(botLevel, seed ^ 0x5bd1e995);
  const row = {
    p0: a.player.id, p1: b ? b.player.id : null, bot_level: b ? null : botLevel, ranked,
    state, bot: bot ? { ...bot } : null, deadline: deadline(3),
  };
  if (bot) await botMove(row);           // the bot locks in its first move before the match is saved
  return db.insert('matches', row);
}
function botMinds() {
  const ids = Object.keys(RARITY);
  return [0, 1, 2].map(() => +ids[(Math.random() * ids.length) | 0]);
}

// a filler rival takes a human-ish moment to pick (practice bots answer at once)
const thinkMs = (extra = 0) => (extra + 1.5 + Math.random() * Math.random() * 9) * 1000;
// let the bot lock in if it is allowed to right now
async function botMove(row) {
  const s = row.state;
  if (s.over || s.p[1].pending) return;
  if (!s.practice && Date.now() < (s.botAt || 0) && new Date(row.deadline) - Date.now() > 4000) return;
  const bot = reviveBot(row.bot, row.bot_level);
  let r = submit(s, 1, bot.decide(viewFor(s, 1)));
  if (r.error) r = submit(s, 1, { card: s.p[1].cards[0] });
  row.bot = { ...bot };
  if (r.resolved) afterResolve(row, r.resolved);
}
function afterResolve(row, ev) {
  if (row.bot) { const bot = reviveBot(row.bot, row.bot_level); bot.observe(ev, 1); row.bot = { ...bot }; }
  row.deadline = deadline(REVEAL_SECONDS + (ev.roundOver ? 3 : 0));
  if (row.bot) row.state.botAt = Date.now() + thinkMs(REVEAL_SECONDS + (ev.roundOver ? 3 : 0));
}

// load, apply fn(row) -> result, save with optimistic locking (retry on conflict)
async function mutate(id, fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await db.one('matches', `id=eq.${id}`);
    if (!row) throw httpError(404, 'match not found');
    const before = row.version;
    const out = await fn(row);
    if (out === undefined) return { row };
    row.version = before + 1;
    const saved = await db.update('matches', `id=eq.${id}&version=eq.${before}`, {
      state: row.state, bot: row.bot, status: row.status, winner: row.winner, version: row.version, deadline: row.deadline,
      idle0: row.idle0, idle1: row.idle1, delta0: row.delta0, delta1: row.delta1, ended_at: row.ended_at,
    });
    if (saved.length) {
      broadcast(`match:${id}`);
      return { row: saved[0], out };
    }
  }
  throw httpError(409, 'busy, try again');
}
export const httpError = (status, message) => Object.assign(new Error(message), { status });
const seatOf = (row, pid) => row.p0 === pid ? 0 : row.p1 === pid ? 1 : -1;

// whoever hasn't locked in when the timer runs out loses the round
function applyTimeouts(row) {
  const s = row.state;
  if (row.status !== 'live' || s.over || new Date(row.deadline) > new Date()) return false;
  const late = [0, 1].filter(i => !s.p[i].pending);
  if (!late.length) return false;
  late.forEach(i => { row[`idle${i}`]++; });
  timeout(s, late);
  row.deadline = deadline(REVEAL_SECONDS);
  return true;
}

export async function getView(id, pid) {
  const { row } = await mutate(id, async r => {
    if (seatOf(r, pid) < 0) throw httpError(403, 'not your match');
    if (r.state?.v !== 4) {                // made with older rules: close it without a result
      if (r.status === 'live') await db.update('matches', `id=eq.${id}`, { status: 'abandoned', ended_at: new Date().toISOString() });
      throw httpError(410, 'that match is from an old version and was closed');
    }
    const timedOut = applyTimeouts(r);
    // a filler rival that has finished "thinking" locks in now
    const botDue = !r.p1 && r.status === 'live' && !r.state.over && !r.state.p[1].pending && Date.now() >= (r.state.botAt || 0);
    if (!timedOut && !botDue) return undefined;
    if (!r.p1) await botMove(r);
    await finishIfOver(r);
    return true;
  });
  return present(row, seatOf(row, pid));
}

export async function act(id, pid, action) {
  const { row, out } = await mutate(id, async r => {
    const seat = seatOf(r, pid);
    if (seat < 0) throw httpError(403, 'not your match');
    if (r.status !== 'live') throw httpError(400, 'match is over');
    applyTimeouts(r);
    const clean = { card: Number(action.card), spell: action.spell ? String(action.spell) : null };
    const res = submit(r.state, seat, clean);
    if (res.error) throw httpError(400, res.error);
    r[`idle${seat}`] = 0;
    if (res.resolved) afterResolve(r, res.resolved);
    if (!r.p1) await botMove(r);
    await finishIfOver(r);
    return true;
  });
  return present(row, seatOf(row, pid));
}

export async function forfeit(id, pid) {
  const { row } = await mutate(id, async r => {
    const seat = seatOf(r, pid);
    if (seat < 0) throw httpError(403, 'not your match');
    if (r.status !== 'live') return undefined;
    forfeitMatch(r.state, seat); r.status = 'abandoned';
    await finishIfOver(r);
    return true;
  });
  return present(row, seatOf(row, pid));
}

// ratings, points, streaks; runs once when a match ends
async function finishIfOver(r) {
  if (!r.state.over || r.ended_at) return;
  r.ended_at = new Date().toISOString();
  // only one request may pay out: two polls can both see the last round end
  const first = await db.update('matches', `id=eq.${r.id}&ended_at=is.null`, { ended_at: r.ended_at });
  if (!first.length) throw httpError(409, 'busy, try again');
  if (r.status === 'live') r.status = 'done';
  r.winner = r.state.winner;
  const ids = [r.p0, r.p1].filter(Boolean);
  const rows = await db.select('players', `id=in.(${ids.join(',')})`);
  const P = ids.map(id => rows.find(x => x.id === id));
  const vsBot = !r.p1, bot = vsBot ? botFor(P[0].rating) : null;
  const ratings = [P[0].rating, vsBot ? bot.rating : P[1].rating];
  const score = r.winner === null ? [0.5, 0.5] : r.winner === 0 ? [1, 0] : [0, 1];
  const ranked = r.ranked && !P[0].is_guest && await countsForRating(r, vsBot);
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    let d = ranked ? eloDelta(ratings[i], ratings[1 - i], score[i]) : 0;
    if (vsBot) d = Math.round(d * BOT_FACTOR);
    r[`delta${i}`] = d;
    if (p.is_guest) continue;
    if (!ranked) { await db.update('players', `id=eq.${p.id}`, { last_seen: new Date().toISOString() }); continue; }   // practice / classic: no stats
    const won = score[i] === 1, lost = score[i] === 0;
    const rar = r.state.p[i].minds.map(rarityOf);
    // the stake: every Mind brought multiplies the win AND the loss
    const gain = won ? winPoints(rar, vsBot) : lost ? -Math.min(p.points, lossPoints(rar.length, vsBot)) : 0;
    (r.state.pts ||= [0, 0])[i] = gain;
    const patch = {
      rating: Math.max(100, p.rating + d), last_seen: new Date().toISOString(),
      points: p.points + gain,
      streak: won ? p.streak + 1 : lost ? 0 : p.streak,
    };
    patch.best_streak = Math.max(p.best_streak, patch.streak);
    if (vsBot) { if (won) patch.bot_wins = p.bot_wins + 1; if (lost) patch.bot_losses = p.bot_losses + 1; }
    else { if (won) patch.wins = p.wins + 1; else if (lost) patch.losses = p.losses + 1; else patch.draws = p.draws + 1; }
    await db.update('players', `id=eq.${p.id}`, patch);
    if (won || lost) { const dust = duelDust(won, rar.length, vsBot); (r.state.dustWon ||= [0, 0])[i] = dust; await giveDust(p.id, dust); }
  }
  broadcast('leaderboard');
}

// ranked duels pay Dust into your island (the link from Ranked to the island)
async function giveDust(pid, n) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) return;
    isl.state.dust += n;
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: isl.state, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return;
  }
}

// fair-play limits for player vs player: a match where fewer than 3 turns were really played (idle or instant
// forfeit) gives no rating or points, and the same two players only get rated 3 times per 24 h
const SAME_PAIR_PER_DAY = 3;
async function countsForRating(r, vsBot) {
  if (vsBot) return true;
  if (r.state.log.filter(e => e.cards?.[0] != null && !e.timeout).length < 3) return false;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const prev = await db.select('matches', `or=(and(p0.eq.${r.p0},p1.eq.${r.p1}),and(p0.eq.${r.p1},p1.eq.${r.p0}))&ranked=eq.true&status=neq.live&ended_at=gt.${since}&id=neq.${r.id}&select=id,delta0`);
  return prev.filter(m => m.delta0).length < SAME_PAIR_PER_DAY;
}

function present(row, seat) {
  const v = viewFor(row.state, seat);
  return {
    id: row.id, seat, status: row.status, ranked: row.ranked, vsBot: !row.p1 && !!row.state.practice, botLevel: row.state.practice ? row.bot_level : null,
    deadline: row.deadline, serverTime: new Date().toISOString(), delta: row[`delta${seat}`], pts: row.state.pts?.[seat] ?? null, dustWon: row.state.dustWon?.[seat] ?? 0, winner: row.winner,
    view: v, log: row.state.log.slice(-1), chat: (row.chat || []).slice(-12),
  };
}

// quick chat: preset lines only (validated by index). Bots sometimes answer.
const replyGroup = i => [0, 1, 2, 3].includes(i) ? 'greet' : i >= 10 && i <= 17 ? 'tease' : [4, 8, 9, 18, 21].includes(i) ? 'nice' : 'default';
export async function chatLine(id, pid, phrase) {
  if (!phraseOk(phrase)) throw httpError(400, 'pick one of the chat lines');
  const row = await db.one('matches', `id=eq.${id}`);
  if (!row) throw httpError(404, 'match not found');
  const seat = seatOf(row, pid);
  if (seat < 0) throw httpError(403, 'not your match');
  const now = Date.now(), chat = (row.chat || []).slice(-19);
  if (chat.filter(c => c.seat === seat && now - Date.parse(c.at) < 6000).length >= 2) throw httpError(429, 'easy on the chat 🙂');
  chat.push({ seat, phrase, at: new Date(now).toISOString() });
  if (!row.p1 && Math.random() < 0.6) {      // filler rivals sometimes answer, like people do
    const pool = BOT_REPLIES[replyGroup(phrase)];
    chat.push({ seat: 1, phrase: pool[(Math.random() * pool.length) | 0], at: new Date(now + 1400).toISOString() });
  }
  await db.update('matches', `id=eq.${id}`, { chat });
  await broadcast(`match:${id}`);
  return { chat: chat.slice(-12), serverTime: new Date().toISOString() };
}
