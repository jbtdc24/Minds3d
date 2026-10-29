// Server logic test with an in-memory database (no Supabase needed). Run: node tools/test_server.mjs
process.env.SUPABASE_SECRET_KEY = 'test-secret';
const { db } = await import('../lib/db.js');
const { signSession, readSession, loginMessage, checkSignature, checkName } = await import('../lib/auth.js');
const { startMatch, act, getView, forfeit, chatLine } = await import('../lib/game.js');
const { privateKeyToAccount } = await import('viem/accounts');
import { randomUUID } from 'node:crypto';

// ---- tiny PostgREST-ish in-memory db ----
const T = { players: [], matches: [], queue: [], nonces: [], ratelimit: [], mind_energy: [], islands: [] };
function parse(q) {
  const f = [];
  for (const part of q.split('&').filter(Boolean)) {
    const [k, v] = part.split(/=(.*)/s);
    if (['limit', 'order', 'select'].includes(k)) continue;
    if (k === 'or') { const alts = v.slice(1, -1).split(',').map(x => x.split('.eq.')); f.push(r => alts.some(([c, val]) => String(r[c]) === val)); continue; }
    const [op, ...rest] = v.split('.'), val = decodeURIComponent(rest.join('.'));
    if (op === 'eq') f.push(r => String(r[k]) === val);
    else if (op === 'neq') f.push(r => String(r[k]) !== val);
    else if (op === 'is') f.push(r => r[k] == null);
    else if (op === 'in') { const set = val.slice(1, -1).split(','); f.push(r => set.includes(String(r[k]))); }
  }
  return r => f.every(fn => fn(r));
}
const clone = x => JSON.parse(JSON.stringify(x));
db.select = async (t, q = '') => clone(T[t].filter(parse(q)));
db.one = async (t, q) => clone(T[t].find(parse(q)) || null);
db.insert = async (t, row) => { const r = { id: randomUUID(), created_at: new Date().toISOString(), version: 0, rating: 1000, points: 0, wins: 0, losses: 0, draws: 0, bot_wins: 0, bot_losses: 0, streak: 0, best_streak: 0, is_guest: false, idle0: 0, idle1: 0, status: 'live', ...row }; T[t].push(r); return clone(r); };
db.update = async (t, q, patch) => { const rows = T[t].filter(parse(q)); rows.forEach(r => Object.assign(r, clone(patch))); return clone(rows); };
db.remove = async (t, q) => { T[t] = T[t].filter(r => !parse(q)(r)); return []; };
db.upsert = async (t, row) => { const k = t === 'queue' ? 'player_id' : 'address'; const ex = T[t].find(r => r[k] === row[k]); if (ex) Object.assign(ex, row); else T[t].push({ ...row }); return clone(ex || row); };
db.rpc = async () => true;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };

// ---- auth ----
const acct = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const msg = loginMessage(acct.address, 'abc123', 'mindclash.test');
const sig = await acct.signMessage({ message: msg });
ok(await checkSignature(acct.address, msg, sig), 'valid signature accepted');
ok(!(await checkSignature(acct.address, msg.replace('abc123', 'zzz'), sig)), 'tampered message rejected');
ok(!(await checkSignature('0x0000000000000000000000000000000000000001', msg, sig)), 'wrong wallet rejected');
const tok = signSession({ id: 'p1', address: acct.address });
ok(readSession({ headers: { authorization: `Bearer ${tok}` } })?.pid === 'p1', 'session round-trips');
ok(readSession({ headers: { authorization: `Bearer ${tok.slice(0, -2)}xx` } }) === null, 'forged session rejected');
const forged = Buffer.from(JSON.stringify({ pid: 'admin', exp: Date.now() + 1e9 })).toString('base64url') + '.' + tok.split('.')[1];
ok(readSession({ headers: { authorization: `Bearer ${forged}` } }) === null, 'edited session body rejected');
ok(checkName('ab') && checkName('bad name!') && checkName('fuck_you') && checkName('N1gg3r') && !checkName('Satoshi_42'), 'name filter');

// ---- bot match, full game ----
const A = await db.insert('players', { name: 'Alice', name_key: 'alice', address: acct.address });
const { CARD } = await import('../web/src/summon/cards.js');
// summon the cheapest cards that fit into empty lanes (a simple legal move)
const easyMove = view => {
  const me = view.me, lanes = me.board.map((c, l) => c ? -1 : l).filter(l => l >= 0), play = [];
  let focus = me.focus;
  me.hand.map((id, card) => ({ id, card })).sort((a, b) => CARD[a.id].cost - CARD[b.id].cost).forEach(h => {
    if (lanes.length && CARD[h.id].cost <= focus) { focus -= CARD[h.id].cost; play.push({ card: h.card, lane: lanes.shift() }); }
  });
  return { play };
};
let m = await startMatch({ player: A, minds: [1], deck: 'storm_shade' }, null, { ranked: true, botLevel: 'normal' });
let v = await getView(m.id, A.id), turns = 0;
ok(v.view.rival.locked === true, 'bot locks in right away');
ok(!JSON.stringify(v.view.rival).includes('"hand"') && !('play' in v.view.rival) && typeof v.view.rival.handCount === 'number', "the rival's hand and move are never sent");
ok(v.view.me.hand.length === 4 && v.view.me.hp === 20 && v.view.me.skill && v.view.me.el, 'you see your hand, HP, Hero Skill and element');
while (v.status === 'live' && turns < 40) { v = await act(m.id, A.id, easyMove(v.view)); turns++; }
ok(v.status === 'done', `bot match finishes (${turns} turns)`);
const A2 = await db.one('players', `id=eq.${A.id}`);
ok(A2.bot_wins + A2.bot_losses === 1 && A2.wins + A2.losses === 0, 'bot result recorded separately');
ok(Math.abs(A2.rating - 1000) <= 16, `vs-bot rating change is halved (${A2.rating})`);
let err = null;
try { await act(m.id, A.id, { play: [] }); } catch (e) { err = e.message; }
ok(err === 'match is over', 'cannot act after the match ends');

// ---- PvP match, cheating attempts ----
const B = await db.insert('players', { name: 'Bob', name_key: 'bob', address: '0x000000000000000000000000000000000000dEaD' });
const C = await db.insert('players', { name: 'Eve', name_key: 'eve', address: '0x000000000000000000000000000000000000bEEF' });
m = await startMatch({ player: A, minds: [1], deck: 'ember_sprout' }, { player: B, minds: [5], deck: 'bubble_bloom' }, { ranked: true });
err = null; try { await getView(m.id, C.id); } catch (e) { err = e.status; }
ok(err === 403, 'outsider cannot view a match');
v = await getView(m.id, A.id);
err = null; try { await act(m.id, A.id, { play: [{ card: 9, lane: 0 }] }); } catch (e) { err = e.message; }
ok(err === 'pick cards from your hand', 'card you do not have rejected');
const big = v.view.me.hand.findIndex(id => CARD[id].cost > 1), cheap = v.view.me.hand.findIndex(id => CARD[id].cost === 1);
err = null; try { await act(m.id, A.id, { play: [{ card: big, lane: 0 }] }); } catch (e) { err = e.message; }
ok(err === 'not enough focus', 'cannot summon more than your Focus');
err = null; try { await act(m.id, A.id, { play: [{ card: cheap, lane: 7 }] }); } catch (e) { err = e.message; }
ok(err === 'pick an empty lane', 'lane outside the board rejected');
err = null; try { await act(m.id, A.id, { play: [], skill: { id: 'bolt' } }); } catch (e) { err = e.message; }
ok(err === 'hero skill not available' || v.view.me.skill === 'bolt', "someone else's Hero Skill rejected");
v = await act(m.id, A.id, { play: [{ card: cheap, lane: 1 }] });
ok(v.view.me.locked && !v.view.lastEvent, 'first lock waits for the rival');
const bView = await getView(m.id, B.id);
ok(bView.view.rival.locked === true && !('play' in bView.view.rival) && bView.view.rival.board.every(c => !c), "rival can't see Alice's summon before the reveal");
err = null; try { await act(m.id, A.id, { play: [] }); } catch (e) { err = e.message; }
ok(err === 'already locked in', 'cannot change a locked move');
v = await act(m.id, B.id, { play: [] });
const ev = v.view.lastEvent;
ok(ev && ev.events.some(e => e.t === 'hit' && e.p === 0 && e.n >= 1) && v.view.me.hp < 20, 'an open lane hits the enemy Mind (resolved on the server; this view is Bob)');
// play it out
let n = 0;
while (v.status === 'live' && n < 60) {
  const a = await getView(m.id, A.id), b = await getView(m.id, B.id);
  if (!a.view.me.locked) await act(m.id, A.id, easyMove(a.view));
  if (!b.view.me.locked && b.status === 'live') await act(m.id, B.id, easyMove(b.view));
  v = await getView(m.id, A.id); n++;
}
ok(v.status === 'done', 'PvP match finishes');
const [Af, Bf] = await Promise.all([db.one('players', `id=eq.${A.id}`), db.one('players', `id=eq.${B.id}`)]);
ok(Af.wins + Af.losses + Af.draws === 1 && Bf.wins + Bf.losses + Bf.draws === 1, 'PvP result recorded for both');
ok(Af.rating + Bf.rating === A2.rating + 1000, `Elo is zero-sum (${Af.rating}+${Bf.rating})`);
// timer: no move in time = summon nothing; twice in a row = forfeit
m = await startMatch({ player: A, minds: [1] }, { player: B, minds: [5] }, { ranked: true });
await act(m.id, B.id, { play: [] });
T.matches.find(x => x.id === m.id).deadline = new Date(Date.now() - 1000).toISOString();
v = await getView(m.id, A.id);
ok(v.status === 'live' && v.view.turn === 2 && v.view.lastEvent?.timeout?.includes(0), 'no move before the timer = you summon nothing that turn');
await act(m.id, B.id, { play: [] });
T.matches.find(x => x.id === m.id).deadline = new Date(Date.now() - 1000).toISOString();
v = await getView(m.id, A.id);
ok(v.status === 'done' && v.winner === 1, 'missing 2 turns in a row = forfeit');
// forfeit
m = await startMatch({ player: A, minds: [1] }, null, { ranked: false, botLevel: 'easy' });
v = await forfeit(m.id, A.id);
ok(v.status === 'abandoned' && v.winner === 1, 'forfeit works');
// ---- quick chat ----
{
  const C = await db.insert('players', { name: 'Chatty', name_key: 'chatty', address: '0x00000000000000000000000000000000000000c1' });
  const cm = await startMatch({ player: C, minds: [1] }, null, { ranked: false, botLevel: 'easy' });
  const r1 = await chatLine(cm.id, C.id, 0);
  ok(r1.chat.length >= 1 && r1.chat[0].phrase === 0 && r1.chat[0].seat === 0, 'chat line stored with seat');
  let bad = null; try { await chatLine(cm.id, C.id, 999); } catch (e) { bad = e.status; }
  ok(bad === 400, 'unknown chat line rejected');
  let spam = null; try { await chatLine(cm.id, C.id, 1); await chatLine(cm.id, C.id, 2); } catch (e) { spam = e.status; }
  ok(spam === 429, 'chat spam limited');
  let outsider = null; try { await chatLine(cm.id, A.id, 0); } catch (e) { outsider = e.status; }
  ok(outsider === 403, 'cannot chat in a match you are not in');
  const v = await getView(cm.id, C.id);
  ok(Array.isArray(v.chat) && v.chat.length >= 1, 'chat is part of the match view');
}
// ---- classic pool: trial + holder accounts together, unrated; same connection never paired ----
{
  const { tryPair } = await import('../lib/matchmaking.js');
  db.rpc = async (fn, a) => {
    if (fn !== 'claim_opponent') return true;
    const i = T.queue.findIndex(q => q.player_id !== a.me && !q.match_id && q.is_guest === a.my_guest && Math.abs(q.rating - a.my_rating) <= a.max_gap);
    return i < 0 ? [] : T.queue.splice(i, 1);
  };
  const G1 = await db.insert('players', { name: 'Trial1', name_key: 'trial1', is_guest: true });
  const G2 = await db.insert('players', { name: 'Trial2', name_key: 'trial2', is_guest: true });
  T.queue.push({ player_id: G1.id, rating: 1000, is_guest: true, minds: [49], loadout: ['ip:aaa'], joined_at: new Date().toISOString(), match_id: null });
  ok(await tryPair(G2, { minds: [14] }, 150, 'ip:aaa', true) === null && T.queue.length === 1, 'same connection is never paired (put back in queue)');
  ok(await tryPair(G2, { minds: [14] }, 150, 'ip:bbb', false) === null, 'ranked search never takes a classic player');
  T.queue.unshift({ player_id: randomUUID(), rating: 1000, is_guest: true, minds: [8], loadout: [], joined_at: new Date(Date.now() - 600_000).toISOString(), match_id: null });
  const id = await tryPair(G2, { minds: [14] }, 150, 'ip:bbb', true);
  ok(!T.queue.some(q => Date.now() - Date.parse(q.joined_at) > 300_000), 'players who left long ago are dropped, not matched');
  const cm = T.matches.find(x => x.id === id);
  ok(cm && cm.ranked === false && cm.p0 === G1.id && cm.p1 === G2.id, 'classic pairs two players, unrated');
  ok(T.queue.find(q => q.player_id === G1.id)?.match_id === id, 'waiting classic player is told the match');
}
// ---- Mind Energy + points per Mind ----
{
  const { spendEnergy, energyLeft, emptyOf, capFor } = await import('../lib/energy.js');
  const { winPoints } = await import('../lib/rating.js');
  const { utcDay } = await import('../web/src/energy.js');
  const prevRpc = db.rpc;
  db.rpc = async (fn, a) => {           // same all-or-nothing logic as the SQL function
    if (fn !== 'spend_energy') return prevRpc(fn, a);
    const d = utcDay(), rows = a.ids.map(id => { let r = T.mind_energy.find(x => x.token_id === id); if (!r) T.mind_energy.push(r = { token_id: id, day: d, used: 0 }); if (r.day !== d) Object.assign(r, { day: d, used: 0 }); return r; });
    if (rows.some((r, i) => r.used >= a.caps[i])) return false;
    rows.forEach(r => r.used++); return true;
  };
  ok(capFor(1) === 3 && capFor(4) === 4, 'energy cap by rarity (Common 3, Epic 4)');
  ok((await energyLeft([1]))[1] === 3, 'a fresh Mind has full energy');
  ok(await spendEnergy([1, 2]) && (await energyLeft([1, 2]))[1] === 2, 'a ranked match spends 1 energy per Mind');
  await spendEnergy([1]); await spendEnergy([1]);
  ok((await emptyOf([1, 2])).join() === '1', 'empty Mind detected');
  ok(!(await spendEnergy([2, 1])) && (await energyLeft([2]))[2] === 2, 'all or nothing: nothing spent if one Mind is empty');
  T.mind_energy.find(r => r.token_id === 1).day = '2000-01-01';
  ok((await energyLeft([1]))[1] === 3, 'energy refills on a new UTC day');
  ok(winPoints(['Common'], false) === 10 && winPoints(['Common', 'Common', 'Legendary'], false) === 32 && winPoints(['Common', 'Common'], true) === 10, 'win points are paid per Mind brought (bots half)');
  db.rpc = prevRpc;
}

// ---- Mind Island ----
{
  const { gen, COVER, TW } = await import('../web/src/island/gen.js');
  const R = await import('../web/src/island/rules.js');
  const islandRoute = (await import('../lib/routes/island.js')).default;
  const call = async (pid, body) => {
    const token = signSession({ id: pid, address: null, is_guest: true });
    const req = { method: 'POST', url: '/api/island', headers: { authorization: 'Bearer ' + token }, body, query: {} };
    let out = null;
    const res = { setHeader() {}, end(t) { out = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false };
    await islandRoute(req, res);
    return out;
  };
  const w = gen(12345);
  ok(w.land.some(Boolean) && w.cover.some(c => c === COVER.TREE) && w.starter.length === 6, 'island has land, trees and 6 starter plots');
  ok(gen(12345).cover.join() === w.cover.join(), 'same seed, same island');
  const now = Date.now(), st = R.newIsland(12345, now);
  const weed = [...w.cover.keys()].find(k => w.cover[k] === COVER.WEEDS && !st.tiles[k]);
  let r = R.act(st, { type: 'clear', tiles: [weed] }, { seed: 12345, now, minds: 0 });
  ok(r.done === 1 && st.dust === 101 && st.tiles[weed].s === 'c', 'clearing weeds gives 1 Dust');
  r = R.act(st, { type: 'till', tiles: [weed] }, { seed: 12345, now, minds: 0 });
  ok(r.error && /plots/i.test(r.error), 'starter island is at its 6 plot limit');
  r = R.act(st, { type: 'till', tiles: [weed] }, { seed: 12345, now, minds: 2 });
  ok(r.done === 1 && st.dust === 91, 'owning Minds gives more plots; a plot costs 10 Dust');
  const plot = w.starter[0];
  r = R.act(st, { type: 'plant', tiles: [plot], crop: 'bean' }, { seed: 12345, now, minds: 0 });
  ok(r.done === 1 && st.inv.seed_bean === 5, 'planting uses a seed');
  r = R.act(st, { type: 'harvest', tiles: [plot] }, { seed: 12345, now: now + 60e3, minds: 0 });
  ok(r.done === 0, 'cannot harvest before it is ripe');
  r = R.act(st, { type: 'harvest', tiles: [plot] }, { seed: 12345, now: now + 31 * 60e3, minds: 0 });
  ok(r.done === 1 && st.inv.crop_bean === 1, 'harvest after 30 min');
  r = R.act(st, { type: 'sell', item: 'crop_bean', n: 5 }, { seed: 12345, now, minds: 0 });
  ok(r.done === 1 && st.dust === 106 && !st.inv.crop_bean, 'sell crops for Dust (only what you have)');
  R.normalize(st, 12345, now + 40 * 3600e3);
  ok(!st.tiles[weed] || st.tiles[weed].s !== 'c', 'weeds grow back on ground left alone');
  r = R.act(st, { type: 'buy', item: 'seed_star', n: 5 }, { seed: 12345, now, minds: 0 });
  ok(r.error, 'cannot buy what you cannot afford');
  // server route: guest gets an island, actions are saved, no leaderboard points for guests
  const g = await db.insert('players', { name: 'IslandGuest', is_guest: true });
  let out = await call(g.id, {});
  ok(out.code === 200 && out.body.island.state.dust === 100, 'route creates a new island');
  const gw = gen(out.body.island.seed), gweed = [...gw.cover.keys()].find(k => gw.cover[k] === COVER.WEEDS);
  out = await call(g.id, { acts: [{ type: 'clear', tiles: [gweed] }, { type: 'buy', item: 'seed_bean', n: 2 }] });
  ok(out.body.island.state.dust === 91 && out.body.island.state.inv.seed_bean === 8 && out.body.island.rev === 1, 'route applies and saves actions');
  out = await call(g.id, { acts: [{ type: 'sell', item: 'seed_bean', n: 1 }] });
  ok(out.body.results[0].error && out.body.points === 0, 'seeds cannot be sold; guests earn no points');
}
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
