// Server-authoritative match service (Mind Summoners). The match state (hands, decks, both secret moves)
// only lives in the database; players only ever receive viewFor() of their own side.
import { createMatch, submit, viewFor, timeout, forfeitMatch, playedTurns, V, DECK_IDS } from '../web/src/summon/match.js';
import { botAct } from '../web/src/summon/bot.js';
import { db, broadcast } from './db.js';
import { eloDelta, winPoints, botFor, BOT_FACTOR } from './rating.js';
import RARITY from './rarity.js';
import { phraseOk, BOT_REPLIES } from '../web/src/chat.js';

export const TURN_SECONDS = 30;          // no move in time = you summon nothing; 2 missed turns in a row = forfeit
const deadline = (extra = 0) => new Date(Date.now() + (TURN_SECONDS + extra) * 1000).toISOString();
export const BOT_NOISE = { easy: 4, normal: 1.2, hard: 0.3 };   // how far a bot's moves stray from its best
const pickDeck = d => DECK_IDS.includes(d) ? d : DECK_IDS[(Math.random() * DECK_IDS.length) | 0];

export const rarityOf = id => RARITY[id] || 'Common';

// a / b = { player row, minds }; b null -> bot
export async function startMatch(a, b, { ranked, botLevel }) {
  const seed = (Math.random() * 2 ** 31) | 0;
  const players = [
    { name: a.player.name, minds: a.minds, deck: pickDeck(a.deck) },
    b ? { name: b.player.name, minds: b.minds, deck: pickDeck(b.deck) } : { name: `BOT · ${botLevel}`, minds: botMinds(), deck: pickDeck() },
  ];
  const state = createMatch({ seed, players });
  const row = {
    p0: a.player.id, p1: b ? b.player.id : null, bot_level: b ? null : botLevel, ranked,
    state, bot: null, deadline: deadline(3),
  };
  if (!b) await botMove(row);            // the bot locks in its first move before the match is saved
  return db.insert('matches', row);
}
function botMinds() {
  const ids = Object.keys(RARITY);
  return [+ids[(Math.random() * ids.length) | 0]];
}

// let the bot lock in if it is allowed to right now
async function botMove(row) {
  const s = row.state;
  if (s.over || s.pending[1]) return;
  let r = submit(s, 1, botAct(s.g, 1, { noise: BOT_NOISE[row.bot_level] ?? 1.2 }));
  if (r.error) r = submit(s, 1, { play: [] });
  if (r.resolved) afterResolve(row, r.resolved);
}
// the next turn's clock starts after the replay of this one (longer turns get a longer replay)
function afterResolve(row, ev) {
  row.deadline = deadline(Math.min(12, 3 + (ev.events?.length || 0) * 0.5));
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

// whoever hasn't locked in when the timer runs out summons nothing (twice in a row = forfeit)
function applyTimeouts(row) {
  const s = row.state;
  if (row.status !== 'live' || s.over || new Date(row.deadline) > new Date()) return false;
  const late = [0, 1].filter(i => !s.pending[i]);
  if (!late.length) return false;
  late.forEach(i => { row[`idle${i}`]++; });
  const ev = timeout(s, late);
  if (ev) afterResolve(row, ev);
  return true;
}

export async function getView(id, pid) {
  const { row } = await mutate(id, async r => {
    if (seatOf(r, pid) < 0) throw httpError(403, 'not your match');
    if (r.state?.v !== V) {                // made with older rules: close it without a result
      if (r.status === 'live') await db.update('matches', `id=eq.${id}`, { status: 'abandoned', ended_at: new Date().toISOString() });
      throw httpError(410, 'that match is from an old version and was closed');
    }
    if (!applyTimeouts(r)) return undefined;
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
    const res = submit(r.state, seat, { play: action.play, skill: action.skill });
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
    const rar = r.state.minds[i].map(rarityOf);
    const patch = {
      rating: Math.max(100, p.rating + d), last_seen: new Date().toISOString(),
      points: p.points + (won && ranked ? winPoints(rar, vsBot) : 0),
      streak: won ? p.streak + 1 : lost ? 0 : p.streak,
    };
    patch.best_streak = Math.max(p.best_streak, patch.streak);
    if (vsBot) { if (won) patch.bot_wins = p.bot_wins + 1; if (lost) patch.bot_losses = p.bot_losses + 1; }
    else { if (won) patch.wins = p.wins + 1; else if (lost) patch.losses = p.losses + 1; else patch.draws = p.draws + 1; }
    await db.update('players', `id=eq.${p.id}`, patch);
  }
  broadcast('leaderboard');
}

// fair-play limits for player vs player: a match where fewer than 3 turns were really played (idle or instant
// forfeit) gives no rating or points, and the same two players only get rated 3 times per 24 h
const SAME_PAIR_PER_DAY = 3;
async function countsForRating(r, vsBot) {
  if (vsBot) return true;
  if (Math.min(playedTurns(r.state, 0), playedTurns(r.state, 1)) < 3) return false;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const prev = await db.select('matches', `or=(and(p0.eq.${r.p0},p1.eq.${r.p1}),and(p0.eq.${r.p1},p1.eq.${r.p0}))&ranked=eq.true&status=neq.live&ended_at=gt.${since}&id=neq.${r.id}&select=id,delta0`);
  return prev.filter(m => m.delta0).length < SAME_PAIR_PER_DAY;
}

function present(row, seat) {
  const v = viewFor(row.state, seat);
  return {
    id: row.id, seat, status: row.status, ranked: row.ranked, vsBot: !row.p1, botLevel: row.bot_level,
    deadline: row.deadline, serverTime: new Date().toISOString(), delta: row[`delta${seat}`], winner: row.winner,
    view: v, chat: (row.chat || []).slice(-12),
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
  if (!row.p1 && Math.random() < 0.6) {
    const pool = BOT_REPLIES[replyGroup(phrase)];
    chat.push({ seat: 1, phrase: pool[(Math.random() * pool.length) | 0], at: new Date(now + 1400).toISOString() });
  }
  await db.update('matches', `id=eq.${id}`, { chat });
  broadcast(`match:${id}`);
  return { chat: chat.slice(-12), serverTime: new Date().toISOString() };
}
