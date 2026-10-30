// Server logic test with an in-memory database (no Supabase needed). Run: node tools/test_server.mjs
process.env.SUPABASE_SECRET_KEY = 'test-secret';
const { db } = await import('../lib/db.js');
const { signSession, readSession, loginMessage, checkSignature, checkName } = await import('../lib/auth.js');
const { startMatch, act, getView, forfeit, chatLine } = await import('../lib/game.js');
const { privateKeyToAccount } = await import('viem/accounts');
import { randomUUID } from 'node:crypto';

// ---- tiny PostgREST-ish in-memory db ----
const T = { players: [], matches: [], queue: [], nonces: [], ratelimit: [], mind_energy: [], islands: [], payments: [], flags: [], mail: [], mail_claims: [], reports: [], agent_keys: [], cups: [], cup_entries: [], town_now: [], town_chat: [], messages: [], friends: [], admin_log: [] };
function parse(q) {
  const f = [];
  for (const part of q.split('&').filter(Boolean)) {
    const [k, v] = part.split(/=(.*)/s);
    if (['limit', 'order', 'select'].includes(k)) continue;
    if (k === 'or' && v.includes('and(')) { const groups = [...v.matchAll(/and\(([^)]*)\)/g)].map(m => m[1].split(',').map(x => x.split('.eq.'))); f.push(r => groups.some(g => g.every(([c, val]) => String(r[c]) === val))); continue; }
    if (k === 'or' && v.includes('.is.null')) { const alts = v.slice(1, -1).split(','); f.push(r => alts.some(x => x.endsWith('.is.null') ? r[x.split('.')[0]] == null : String(r[x.split('.eq.')[0]]) === x.split('.eq.')[1])); continue; }
    if (k === 'or') { const alts = v.slice(1, -1).split(',').map(x => x.split('.eq.')); f.push(r => alts.some(([c, val]) => String(r[c]) === val)); continue; }
    const [op, ...rest] = v.split('.'), val = decodeURIComponent(rest.join('.'));
    if (op === 'eq') f.push(r => String(r[k]) === val);
    else if (op === 'neq') f.push(r => String(r[k]) !== val);
    else if (op === 'is') f.push(r => r[k] == null);
    else if (op === 'gt' || op === 'lt') f.push(r => { const a = r[k], n = !isNaN(+a) && !isNaN(+val), x = n ? +a : String(a), y = n ? +val : val; return op === 'gt' ? x > y : x < y; });
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
db.upsert = async (t, row) => { const k = t === 'queue' || t === 'town_now' ? 'player_id' : 'address'; const ex = T[t].find(r => r[k] === row[k]); if (ex) Object.assign(ex, row); else T[t].push({ ...row }); return clone(ex || row); };
db.rpc = async () => true;
db.count = async (t, q = '') => T[t].filter(parse(q)).length;
const PK = { mail_claims: ['mail_id', 'player_id'], cup_entries: ['day', 'player_id'], cups: ['day'] }, rawInsert = db.insert;
db.insert = async (t, row) => {
  if (PK[t] && T[t].some(r => PK[t].every(k => r[k] === row[k]))) throw Object.assign(new Error('dup'), { dbStatus: 409 });
  return rawInsert(t, t === 'cup_entries' ? { tries: 0, best: 0, stars: 0, pct: 0, ...row } : t === 'town_chat' ? { ...row } : t === 'agent_keys' ? { revoked: false, gems: false, log: [], ...row } : t === 'cups' ? { settled: false, ...row } : row);
};

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
let m = await startMatch({ player: A, minds: [1, 2] }, null, { ranked: true, botLevel: 'normal' });
ok(m.state.botAt > Date.now() && !/bot/i.test(m.state.p[1].name) && !m.state.p[1].pending, 'a filler rival has a player name and takes its time to pick');
const ready = () => { for (const r of T.matches) if (r.state?.botAt) r.state.botAt = 0; };
ready();
let v = await getView(m.id, A.id), turns = 0;
ok(v.view.rival.locked === true && v.vsBot === false && v.botLevel === null, 'once it has thought, it locks in; the client is not told it is a bot');
ok(!JSON.stringify(v).includes('"pending"') && !('play' in v.view.rival), 'hidden picks never sent to the client');
while (v.status === 'live' && turns < 60) {
  ready();
  v = await act(m.id, A.id, { card: v.view.me.cards[0], spell: v.view.me.spells[0] || null });
  turns++;
}
ok(v.status === 'done', `bot match finishes (${turns} turns)`);
const A2 = await db.one('players', `id=eq.${A.id}`);
ok(A2.bot_wins + A2.bot_losses === 1 && A2.wins + A2.losses === 0, 'bot result recorded separately');
ok(Math.abs(A2.rating - 1000) <= 16, `vs-bot rating change is halved (${A2.rating})`);
let err = null;
try { await act(m.id, A.id, { card: 1 }); } catch (e) { err = e.message; }
ok(err === 'match is over', 'cannot act after the match ends');

// ---- PvP match, cheating attempts ----
const B = await db.insert('players', { name: 'Bob', name_key: 'bob', address: '0x000000000000000000000000000000000000dEaD' });
const C = await db.insert('players', { name: 'Eve', name_key: 'eve', address: '0x000000000000000000000000000000000000bEEF' });
m = await startMatch({ player: A, minds: [1] }, { player: B, minds: [5, 6, 7] }, { ranked: true });
err = null; try { await getView(m.id, C.id); } catch (e) { err = e.status; }
ok(err === 403, 'outsider cannot view a match');
err = null; try { await act(m.id, A.id, { card: 9 }); } catch (e) { err = e.message; }
ok(err === 'pick one of your cards', 'card you do not have rejected');
err = null; try { await act(m.id, A.id, { card: 3, spell: 'nuke' }); } catch (e) { err = e.message; }
ok(err === 'that spell is not available', 'unknown spell rejected');
v = await act(m.id, A.id, { card: 7, spell: 'double' });
ok(v.view.me.locked && !v.view.lastEvent, 'first lock waits for the rival');
const bView = await getView(m.id, B.id);
ok(bView.view.rival.locked === true && !('play' in bView.view.rival) && !JSON.stringify(bView).includes('"pending"'), "rival can't see Alice's card or spell");
err = null; try { await act(m.id, A.id, { card: 1 }); } catch (e) { err = e.message; }
ok(err === 'already locked in', 'cannot change a locked card');
v = await act(m.id, B.id, { card: 1, spell: 'trap' });
const ev = v.view.lastEvent;
ok(ev && ev.win === 1 && ev.spells[0] === 'double' && ev.steps.some(s => s.k === 'trap'), 'Trap catches a 7 + Double (resolved on the server, spells revealed after)');
// a used card and a used spell cannot be played again this round
err = null; try { await act(m.id, A.id, { card: 7 }); } catch (e) { err = e.message; }
ok(err === 'pick one of your cards', 'used card cannot be replayed');
err = null; try { await act(m.id, A.id, { card: 6, spell: 'double' }); } catch (e) { err = e.message; }
ok(err === 'that spell is not available', 'used spell cannot be replayed this round');
// play it out
let n = 0;
while (v.status === 'live' && n < 200) {
  const a = await getView(m.id, A.id), b = await getView(m.id, B.id);
  if (!a.view.me.locked) await act(m.id, A.id, { card: a.view.me.cards[a.view.me.cards.length - 1] });
  if (!b.view.me.locked) await act(m.id, B.id, { card: b.view.me.cards[0] });
  v = await getView(m.id, A.id); n++;
}
ok(v.status === 'done', 'PvP match finishes');
const [Af, Bf] = await Promise.all([db.one('players', `id=eq.${A.id}`), db.one('players', `id=eq.${B.id}`)]);
ok(Af.wins + Af.losses + Af.draws === 1 && Bf.wins + Bf.losses + Bf.draws === 1, 'PvP result recorded for both');
ok(Af.rating + Bf.rating === A2.rating + 1000, `Elo is zero-sum (${Af.rating}+${Bf.rating})`);
// timer: no pick in time = lose the round
m = await startMatch({ player: A, minds: [1] }, { player: B, minds: [5] }, { ranked: true });
await act(m.id, B.id, { card: 4 });
T.matches.find(x => x.id === m.id).deadline = new Date(Date.now() - 1000).toISOString();
v = await getView(m.id, A.id);
ok(v.view.round === 2 && v.view.rival.rounds === 1 && v.view.me.rounds === 0, 'no pick before the timer = you lose the round');
T.matches.find(x => x.id === m.id).deadline = new Date(Date.now() - 1000).toISOString();
await act(m.id, B.id, { card: 4 }).catch(() => {});
T.matches.find(x => x.id === m.id).deadline = new Date(Date.now() - 1000).toISOString();
v = await getView(m.id, A.id);
ok(v.status === 'done' && v.winner === 1, 'idle player loses the match after 2 timed-out rounds');
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
  const v1 = { dust: 5, inv: {}, tiles: { 100: { s: 'p', t: 1 } }, b: [{ id: 1, type: 'wall', k: 49 }] };
  R.migrate(v1);
  ok(v1.v === 2 && v1.tiles[(2 + 6) * 64 + 8 + 4] && v1.b[0].k === (1 + 6) * 64 + 8 + 1, 'old saves move into the middle of the bigger sky map');
  ok(w.land.some(Boolean) && w.cover.some(c => c === COVER.TREE) && w.starter.length === 6, 'island has land, trees and 6 starter plots');
  ok(gen(12345).cover.join() === w.cover.join(), 'same seed, same island');
  const now = Date.now(), st = R.newIsland(12345, now);
  const weed = [...w.cover.keys()].find(k => w.cover[k] === COVER.WEEDS && !st.tiles[k]);
  let r = R.act(st, { type: 'clear', tiles: [weed] }, { seed: 12345, now, minds: 0 });
  ok(r.done === 1 && st.dust === 101 && st.tiles[weed].s === 'c', 'clearing weeds gives 1 Dust');
  for (let i = 0; i < 6; i++) st.tiles[100000 + i] = { s: 'p', t: now };   // pretend 6 more plots exist: 12 = the free limit
  r = R.act(st, { type: 'till', tiles: [weed] }, { seed: 12345, now, minds: 0 });
  ok(r.error && /plots/i.test(r.error), 'a new island allows 12 plots');
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

// ---- village buildings + raids ----
{
  const { gen, TW, TH } = await import('../web/src/island/gen.js');
  const R = await import('../web/src/island/rules.js');
  const RD = await import('../web/src/island/raid.js');
  const seed = 777, now = Date.now(), st = R.newIsland(seed, now), w = gen(seed), ctx = { seed, now, minds: 0, instant: true };
  st.dust = 5000; st.inv.wood = 500; st.inv.stone = 500;
  const spot = type => { for (let k = 0; k < TW * TH; k++) if (R.fits(st, w, type, k)) return k; return -1; };
  let r = R.act(st, { type: 'build', item: 'house', k: spot('house') }, ctx);
  ok(r.done === 1 && st.dust === 4500 && R.maxPlots(st, 0) === 14, 'a cottage costs 500 Dust + wood and gives +2 plots');
  const hk = st.b[0].k;
  ok(R.act(st, { type: 'build', item: 'barn', k: hk }, ctx).error, 'buildings cannot overlap');
  ok(R.coverAt(st, w, hk) === 5, 'building tiles count as fixed ground (no weeds, no plots)');
  r = R.act(st, { type: 'build', item: 'mill', k: spot('mill') }, ctx);
  ok(r.done === 1 && R.act(st, { type: 'build', item: 'mill', k: spot('mill') }, ctx).error, 'only one mill');
  st.inv.crop_bean = 2;
  r = R.act(st, { type: 'sell', item: 'crop_bean', n: 1 }, ctx);
  ok(r.gain.dust === Math.round(15 * 1.25), 'the mill makes crops sell for 25% more');
  const t3 = [spot('tower')]; R.act(st, { type: 'build', item: 'tower', tiles: t3 }, ctx);
  R.act(st, { type: 'build', item: 'tower', tiles: [spot('tower')] }, ctx);
  ok(R.act(st, { type: 'build', item: 'tower', tiles: [spot('tower')] }, ctx).error, 'tower limit: 2 + 1 per Mind owned');
  const before = st.inv.stone;
  r = R.act(st, { type: 'demolish', id: st.b.find(b => b.type === 'tower').id }, ctx);
  ok(r.done === 1 && st.inv.stone === before + 20, 'removing a building refunds half');
  // raid sim: deterministic, and the server replay = what the client saw
  const snap = RD.botVillage(4242, 1);
  const army = { troops: { brawler: 4, archer: 3, bomber: 1, giant: 0 }, hero: 'captain' };
  const S = RD.createRaid(snap, army), spots = [];
  for (let k = 0; k < TW * TH; k++) if (RD.dropOk(S, k)) spots.push(k);
  ok(spots.length > 50 && !RD.dropOk(S, S.structs[0].tiles[0]), 'drops only on open land away from buildings');
  const inputs = [{ t: 0, drop: 'bomber', k: spots[0] }, ...[1, 2, 3, 4].map(i => ({ t: i * 3, drop: 'brawler', k: spots[0] })), ...[5, 6, 7].map(i => ({ t: i * 3, drop: 'archer', k: spots[5] })), { t: 30, drop: 'hero', k: spots[0] }, { t: 60, spell: 'rage', k: spots[0] }];
  const a = RD.replay(snap, army, inputs), b = RD.replay(JSON.parse(JSON.stringify(snap)), army, inputs);
  ok(a.stars === b.stars && a.pct === b.pct && a.S.tick === b.S.tick, 'raid replay is deterministic');
  ok(RD.input(RD.createRaid(snap, army), { t: 0, drop: 'brawler', k: S.structs[0].tiles[0] }), 'cannot drop on a building');
  const S2 = RD.createRaid(snap, { troops: { brawler: 1, archer: 0, bomber: 0, giant: 0 } });
  ok(!RD.input(S2, { t: 0, drop: 'brawler', k: spots[0] }) && RD.input(S2, { t: 0, drop: 'brawler', k: spots[0] }), 'you can only drop the troops you brought');
  ok(RD.armyUsed(RD.cleanArmy({ brawler: 9, giant: 9 }, RD.armyCap(0))) <= 10 && RD.armyCap(9) === 13 && RD.guardsFor(0) === 2 && RD.guardsFor(9) === 4, 'army cap 10 (+1 per Mind, max 13); guards 2-4');
  ok(RD.villageName(1) !== RD.villageName(2) && !/bot/i.test(RD.villageName(5)), 'game villages get player-style names');
  ok(RD.lootOf(5000, 2, 1) === 750 && RD.lootOf(1500, 2, 1) === 0 && RD.lootOf(1e6, 0, 1) === RD.LOOT_MAX, 'barns protect Dust, loot is capped');
  // raid route: loot moves, defender gets a shield and a log entry
  const raidRoute = (await import('../lib/routes/raid.js')).default;
  const atk = await db.insert('players', { name: 'Raider', address: '0x0000000000000000000000000000000000000abc' });
  const def = await db.insert('players', { name: 'Defender', address: '0x0000000000000000000000000000000000000def' });
  T.islands.push({ player_id: def.id, seed: 4242, state: { ...R.newIsland(4242, now), dust: 4000, b: snap.b }, minds: 1, rev: 0, updated_at: new Date().toISOString() });
  T.islands.push({ player_id: atk.id, seed: 99, state: { ...R.newIsland(99, now), raid: { id: 'r1', target: def.id, name: 'Defender', snap, loot: RD.lootOf(4000, 1, 1), hero: 'captain', cap: 10, at: now } }, minds: 1, rev: 0, updated_at: new Date().toISOString() });
  const callRaid = async body => {
    const token = signSession({ id: atk.id, address: atk.address });
    let out = null;
    const res = { setHeader() {}, end(t) { out = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false };
    await raidRoute({ method: 'POST', url: '/api/raid', headers: { authorization: 'Bearer ' + token }, body, query: {} }, res);
    return out;
  };
  let out = await callRaid({ op: 'attack', id: 'r1', inputs, army: army.troops });
  const dI = T.islands.find(x => x.player_id === def.id), aI = T.islands.find(x => x.player_id === atk.id);
  ok(out.code === 200 && out.body.stars === a.stars, 'server raid result = client result');
  ok(dI.state.dust === 4000 - out.body.loot && aI.state.dust === 100 + out.body.loot && !aI.state.raid, 'loot moves from defender to raider');
  ok(dI.state.raidLog?.[0]?.by === 'Raider' && (out.body.stars ? dI.state.shield > now : true), 'defender gets a log entry (and a shield)');
  out = await callRaid({ op: 'attack', id: 'r1', inputs, army: army.troops });
  ok(out.code === 400, 'a raid can only be cashed in once');
}

// ---- adventure ----
{
  const AD = await import('../web/src/island/adventure.js');
  const R = await import('../web/src/island/rules.js');
  const map = AD.advMap(4321, 1), chest = map.nodes.find(n => n.type === 'chest'), guard = map.monsters.find(m => m.guards === chest.id);
  ok(map.nodes.length > 20 && map.monsters.some(m => m.type === 'ogre') && JSON.stringify(AD.advMap(4321, 1)) === JSON.stringify(map), 'wild island content comes from the seed');
  ok(!AD.advLoot(map, [chest.id], []).dust && AD.advLoot(map, [chest.id], [guard.id]).dust > 0, 'a guarded chest only pays after its guard is beaten');
  const advRoute = (await import('../lib/routes/adventure.js')).default;
  const hiker = await db.insert('players', { name: 'Hiker', is_guest: true });
  T.islands.push({ player_id: hiker.id, seed: 5, state: R.newIsland(5, Date.now()), minds: 0, rev: 0, updated_at: new Date().toISOString() });
  const callAdv = async body => {
    const token = signSession({ id: hiker.id, address: null, is_guest: true });
    let out = null;
    const res = { setHeader() {}, end(t) { out = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false };
    await advRoute({ method: 'POST', url: '/api/adventure', headers: { authorization: 'Bearer ' + token }, body, query: {} }, res);
    return out;
  };
  let out = await callAdv({ op: 'start', mind: 49 });
  ok(out.code === 200 && out.body.heroKind === 'captain' && out.body.left === 4, 'trial accounts adventure with a Captain, 5 a day');
  const m2 = AD.advMap(out.body.seed, out.body.level);
  out = await callAdv({ op: 'end', got: m2.nodes.map(n => n.id), beat: m2.monsters.map(x => x.id) });
  ok(out.code === 400, 'grabbing everything in 0 seconds is rejected');
  const isl = T.islands.find(x => x.player_id === hiker.id);
  isl.state.adv.at = Date.now() - 120e3;
  const dust0 = isl.state.dust, berry = m2.nodes.filter(n => n.type === 'berry').slice(0, 3).map(n => n.id);
  out = await callAdv({ op: 'end', got: berry, beat: [], ko: false });
  const exp = AD.advLoot(m2, berry, []).dust;
  ok(out.code === 200 && isl.state.dust === dust0 + exp && !isl.state.adv, 'adventure loot is added to the island');
  out = await callAdv({ op: 'end', got: berry, beat: [] });
  ok(out.code === 400, 'an adventure pays out once');
}

// ---- economy: shop, gems, storage, army, adventure areas ----
{
  const R = await import('../web/src/island/rules.js');
  const { gen, TW, TH } = await import('../web/src/island/gen.js');
  const now = Date.now(), seed = 31337, ctx = { seed, now, minds: 0, instant: true };
  const st = R.newIsland(seed, now);
  ok(st.b.some(b => b.type === 'home') && st.b.some(b => b.type === 'well') && st.inv.troop_brawler > 0, 'a new island starts with its home, well and a few troops');
  st.dust = 1000;
  let r = R.act(st, { type: 'shop', item: 'troop_giant', n: 2 }, ctx);
  ok(r.done === 2 && st.inv.troop_giant === 2 && st.dust === 700, 'train troops with Dust');
  ok(R.act(st, { type: 'shop', item: 'gem_army', n: 1 }, ctx).error, 'gem items need gems');
  st.gems = 20;
  r = R.act(st, { type: 'shop', item: 'gem_potions', n: 1 }, ctx);
  ok(r.done === 1 && st.gems === 15 && st.inv.potion >= 6, 'gems buy potion crates');
  st.inv.herb = 4;
  r = R.act(st, { type: 'craft', item: 'potion', n: 5 }, ctx);
  ok(r.done === 2 && !st.inv.herb, 'craft potions from herbs');
  const home = st.b.find(b => b.type === 'home');
  ok(R.act(st, { type: 'demolish', id: home.id }, ctx).error && R.act(st, { type: 'store', id: home.id }, ctx).error, 'the home cannot be removed or stored');
  const w = gen(seed);
  let spot = -1; for (let k = 0; k < TW * TH && spot < 0; k++) if (R.fits(st, w, 'home', k, home) && Math.abs(k - home.k) > 200) spot = k;
  r = R.act(st, { type: 'move', id: home.id, k: spot }, ctx);
  ok(r.done === 1 && st.b.find(b => b.type === 'home').k === spot, 'the home can be moved anywhere it fits');
  st.inv.wood = 50;
  let fk = -1; for (let k = 0; k < TW * TH && fk < 0; k++) if (R.fits(st, w, 'bench', k)) fk = k;
  R.act(st, { type: 'build', item: 'bench', tiles: [fk] }, ctx);
  const bench = st.b.find(b => b.type === 'bench');
  r = R.act(st, { type: 'store', id: bench.id }, ctx);
  ok(r.done === 1 && st.stash.bench === 1 && !st.b.includes(bench), 'buildings go into storage');
  const wood = st.inv.wood;
  r = R.act(st, { type: 'place', item: 'bench', tiles: [fk] }, ctx);
  ok(r.done === 1 && !st.stash.bench && st.inv.wood === wood, 'placing from storage is free');
  let ck = -1; for (let k = 0; k < TW * TH && ck < 0; k++) if (R.fits(st, w, 'crystal', k)) ck = k;
  ok(R.act(st, { type: 'build', item: 'crystal', tiles: [ck] }, ctx).done === 1 && st.gems === 0, 'gem-exclusive decorations cost gems');
  const v2 = { v: 2, dust: 0, inv: {}, tiles: {} };
  R.normalize(v2, seed, now);
  ok(v2.v === 5 && v2.b.filter(b => b.type === 'home').length === 1 && v2.inv.troop_brawler === 6, 'older islands get their home as a movable building and a starter army');
  // raid: you bring troops you own; the ones you don't send come back
  const raidRoute = (await import('../lib/routes/raid.js')).default, RD = await import('../web/src/island/raid.js');
  const pl = await db.insert('players', { name: 'Trainer', is_guest: true });
  const isl = { player_id: pl.id, seed: 4242, state: { ...R.newIsland(4242, now), dust: 500 }, minds: 0, rev: 0, updated_at: new Date().toISOString() };
  isl.state.inv = { troop_brawler: 5, troop_archer: 2 };
  T.islands.push(isl);
  const call = async body => { const token = signSession({ id: pl.id, address: null, is_guest: true }); let out = null; const res = { setHeader() {}, end(t) { out = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await raidRoute({ method: 'POST', url: '/api/raid', headers: { authorization: 'Bearer ' + token }, body, query: {} }, res); return out; };
  let out = await call({ op: 'find', minds: [], army: { brawler: 9, archer: 1, giant: 3 } });
  ok(out.code === 200 && out.body.army.brawler === 5 && out.body.army.giant === 0 && !isl.state.inv.troop_brawler && isl.state.inv.troop_archer === 1, 'a raid takes only troops you own (and they leave the camp)');
  const S = RD.createRaid(out.body.snap, { troops: out.body.army }), spots = [];
  for (let k = 0; k < TW * TH; k++) if (RD.dropOk(S, k)) spots.push(k);
  out = await call({ op: 'attack', id: out.body.id, inputs: [{ t: 0, drop: 'brawler', k: spots[0] }, { t: 2, drop: 'brawler', k: spots[0] }] });
  ok(out.code === 200 && isl.state.inv.troop_brawler === 3 && isl.state.inv.troop_archer === 2, 'troops you did not send come home');
  out = await call({ op: 'find', army: {} });
  ok(out.code === 403 || out.body.army, 'no troops = train first');
  // adventure areas: locked until the Ogre before is beaten; far areas cost fuel
  const advRoute = (await import('../lib/routes/adventure.js')).default;
  const callA = async body => { const token = signSession({ id: pl.id, address: null, is_guest: true }); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await advRoute({ method: 'POST', url: '/api/adventure', headers: { authorization: 'Bearer ' + token }, body, query: {} }, res); return o; };
  out = await callA({ op: 'start', spot: 4 });
  ok(out.code === 403 && /Skiff/.test(out.body.error), 'far islands need a better airship');
  isl.state.dust = 2100; isl.state.inv.wood = 80;
  ok(R.act(isl.state, { type: 'ship' }, { seed: 4242, now: Date.now(), minds: 0 }).done === 1 && isl.state.ship === 1 && isl.state.dust === 100, 'upgrade the airship with Dust + wood');
  isl.state.inv.fuel = 0;
  out = await callA({ op: 'start', spot: 4 });
  ok(out.code === 403 && /Fuel/.test(out.body.error), 'flying far needs Sky Fuel');
  isl.state.inv.fuel = 2; isl.state.inv.potion = 3;
  out = await callA({ op: 'start', spot: 4, potions: 9 });
  ok(out.code === 200 && out.body.potions === 3 && !isl.state.inv.potion && isl.state.inv.fuel === 1, 'you bring the potions you have (max 5) and fuel is used');
  isl.state.adv.at = Date.now() - 100e3;
  out = await callA({ op: 'end', got: [], beat: [], cover: { tree: 60, weeds: 5 }, potionsLeft: 2 });
  ok(out.code === 200 && out.body.loot.wood === 3 * 35 && out.body.loot.dust === 5 && isl.state.inv.potion === 2, 'cutting trees on adventures is capped per hour; unused potions come back');
}

// ---- admin tools ----
{
  const R = await import('../web/src/island/rules.js');
  const adminRoute = (await import('../lib/routes/admin.js')).default, islandRoute = (await import('../lib/routes/island.js')).default;
  const boss = await db.insert('players', { name: 'Owner' }), joe = await db.insert('players', { name: 'Joe', name_key: 'joe' });
  T.islands.push({ player_id: joe.id, seed: 9, state: R.newIsland(9, Date.now()), minds: 0, rev: 0, updated_at: new Date().toISOString() });
  const call = async (fn, pid, body, url) => { const token = signSession({ id: pid, address: null }); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method: 'POST', url, headers: { authorization: 'Bearer ' + token }, body, query: {} }, res); return o; };
  let out = await call(adminRoute, boss.id, { op: 'give', pid: joe.id, gems: 50 }, '/api/admin');
  ok(out.code === 403, 'nobody is an admin unless the env var says so');
  process.env.ADMIN_PLAYER_IDS = boss.id;
  out = await call(adminRoute, boss.id, { op: 'me' }, '/api/admin');
  ok(out.body.admin === true, 'the owner is recognised from the env var');
  out = await call(adminRoute, joe.id, { op: 'give', pid: joe.id, gems: 999 }, '/api/admin');
  ok(out.code === 403, 'players cannot give themselves anything');
  out = await call(adminRoute, boss.id, { op: 'give', pid: joe.id, gems: 50, dust: 300, items: { potion: 3 } }, '/api/admin');
  const js = T.islands.find(x => x.player_id === joe.id).state;
  ok(out.code === 200 && js.gems === 50 && js.dust === 400 && js.inv.potion >= 3, 'admin gives Gems, Dust and items');
  out = await call(adminRoute, boss.id, { op: 'find', q: 'jo' }, '/api/admin');
  ok(out.body.players.some(p => p.id === joe.id), 'admin finds players by name');
  out = await call(adminRoute, boss.id, { op: 'ban', pid: joe.id, hours: 2, reason: 'testing' }, '/api/admin');
  out = await call(islandRoute, joe.id, {}, '/api/island');
  ok(out.code === 403 && /suspended/.test(out.body.error), 'a suspended player is blocked');
  await call(adminRoute, boss.id, { op: 'unban', pid: joe.id }, '/api/admin');
  out = await call(islandRoute, joe.id, {}, '/api/island');
  ok(out.code === 200, 'unsuspended players can play again');
  delete process.env.ADMIN_PLAYER_IDS;
}

// ---- building takes time ----
{
  const R = await import('../web/src/island/rules.js'), { gen, TW, TH } = await import('../web/src/island/gen.js');
  const seed = 2024, now = Date.now(), st = R.newIsland(seed, now), w = gen(seed);
  st.dust = 5000; st.inv.wood = 200; st.inv.stone = 200;
  const spot = type => { for (let k = 0; k < TW * TH; k++) if (R.fits(st, w, type, k)) return k; return -1; };
  let r = R.act(st, { type: 'build', item: 'house', k: spot('house') }, { seed, now, minds: 0 });
  const h = st.b.find(b => b.type === 'house');
  ok(r.done === 1 && h.done > now && R.maxPlots(st, 0) === 12, 'a cottage takes time; it only counts once finished');
  ok(R.act(st, { type: 'build', item: 'barn', k: spot('barn') }, { seed, now, minds: 0 }).error, 'no Minds = 1 builder: one build at a time');
  ok(R.act(st, { type: 'build', item: 'barn', k: spot('barn') }, { seed, now, minds: 2 }).done === 1, 'more Minds = more builders');
  ok(R.act(st, { type: 'build', item: 'wall', tiles: [spot('wall')] }, { seed, now, minds: 0 }).done === 1, 'walls are instant');
  st.gems = 1;
  ok(R.act(st, { type: 'rush', id: h.id }, { seed, now, minds: 0 }).done === 1 && !h.done && st.gems === 0, 'Gems finish a building now');
  R.normalize(st, seed, now + 3600e3);
  ok(!st.b.some(b => b.done), 'buildings finish when their time is up');
}

// ---- gems buy everything ----
{
  const R = await import('../web/src/island/rules.js'), { gen, TW, TH } = await import('../web/src/island/gen.js');
  const seed = 55, now = Date.now(), st = R.newIsland(seed, now), w = gen(seed), ctx = { seed, now, minds: 0, instant: true };
  st.dust = 0; st.gems = 100;
  let r = R.act(st, { type: 'buy', item: 'seed_star', n: 2, gems: true }, ctx);
  ok(r.done === 2 && st.gems === 98 && st.inv.seed_star === 2, 'seeds with Gems');
  r = R.act(st, { type: 'shop', item: 'troop_giant', n: 1, gems: true }, ctx);
  ok(r.done === 1 && st.gems === 96, 'troops with Gems');
  let k = -1; for (let t = 0; t < TW * TH && k < 0; t++) if (R.fits(st, w, 'mill', t)) k = t;
  r = R.act(st, { type: 'build', item: 'mill', k, gems: true }, ctx);
  ok(r.done === 1 && st.gems === 96 - R.gemPrice(R.BUILD.mill.cost), 'buildings with Gems');
  r = R.act(st, { type: 'buy', item: 'permit', gems: true }, ctx);
  ok(r.done === 1 && st.inv.permit === 1, 'land permits with Gems');
}

// ---- upgrades, revenge, bosses ----
{
  const R = await import('../web/src/island/rules.js'), RD = await import('../web/src/island/raid.js'), AD = await import('../web/src/island/adventure.js');
  const { gen, TW, TH } = await import('../web/src/island/gen.js');
  ok(RD.botLoot(1) === 500 && RD.botLoot(3) === 1100, 'game village loot grows with level');
  const v = RD.botVillage(777, 3);
  ok(v.b.filter(b => b.type === 'tower').length >= 3, 'game villages are finished (towers ready to shoot)');
  const seed = 66, now = Date.now(), st = R.newIsland(seed, now), w = gen(seed);
  st.dust = 9000; st.inv.wood = 500; st.inv.stone = 500;
  let k = -1; for (let t = 0; t < TW * TH && k < 0; t++) if (R.fits(st, w, 'barn', t)) k = t;
  R.act(st, { type: 'build', item: 'barn', k }, { seed, now, minds: 0, instant: true });
  const barn = st.b.find(b => b.type === 'barn');
  let r = R.act(st, { type: 'upgrade', id: barn.id }, { seed, now, minds: 0 });
  ok(r.done === 1 && barn.done && barn.uplv === 2 && R.barnSafe(st) === 1, 'upgrading takes time; the barn keeps working at Lv1 meanwhile');
  R.normalize(st, seed, now + 1e8);
  ok(barn.lv === 2 && R.barnSafe(st) === 2, 'a Lv2 barn protects twice as much');
  const snap = RD.snapshotOf(seed, st, 2), S = RD.createRaid(snap, {});
  ok(S.structs.find(x => x.type === 'barn').max === Math.round(R.BUILD.barn.hp * 1.5), 'higher levels have more HP in raids');
  ok(AD.advMap(5, 1).monsters.some(m => m.type === 'ogre') && AD.advMap(5, 4).monsters.some(m => m.type === 'titan'), 'each tier has its own boss');
}

// ---- gem purchases (chain calls faked) ----
{
  const R = await import('../web/src/island/rules.js'), gemsRoute = (await import('../lib/routes/gems.js')).default, chain = await import('../lib/chain.js');
  const buyer = await db.insert('players', { name: 'Buyer', address: '0x00000000000000000000000000000000000000b1' });
  T.islands.push({ player_id: buyer.id, seed: 3, state: R.newIsland(3, Date.now()), minds: 0, rev: 0, updated_at: new Date().toISOString() });
  T.payments = [];
  const call = async body => { const token = signSession({ id: buyer.id, address: buyer.address }); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await gemsRoute({ method: 'POST', url: '/api/gems', headers: { authorization: 'Bearer ' + token }, body, query: {} }, res); return o; };
  let out = await call({ op: 'info' });
  ok(out.body.enabled === false, 'gem sales are off until the owner sets TREASURY_ADDRESS');
  process.env.TREASURY_ADDRESS = '0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37';
  const fake = { from: buyer.address, to: process.env.TREASURY_ADDRESS, value: 2000000000000000n, chainId: 4663 };
  chain.client.getTransaction = async () => fake;
  chain.client.getTransactionReceipt = async () => ({ status: 'success', blockNumber: 100n });
  chain.client.getBlockNumber = async () => 105n;
  const h1 = '0x' + 'a'.repeat(64);
  out = await call({ op: 'claim', tx: h1, pack: 'pouch' });
  const gst = T.islands.find(x => x.player_id === buyer.id).state;
  ok(out.code === 200 && out.body.added === 50 && gst.gems === 50, 'a verified payment adds the Gems');
  out = await call({ op: 'claim', tx: h1, pack: 'pouch' });
  ok(out.code === 409 && gst.gems === 50, 'the same payment can never be used twice');
  out = await call({ op: 'claim', tx: '0x' + 'b'.repeat(64), pack: 'vault' });
  ok(out.code === 400 && /less than/.test(out.body.error), 'paying less than the pack price is refused');
  fake.from = '0x00000000000000000000000000000000000000c2';
  out = await call({ op: 'claim', tx: '0x' + 'c'.repeat(64), pack: 'pouch' });
  ok(out.code === 400 && /different wallet/.test(out.body.error), "someone else's payment cannot be claimed");
  fake.from = buyer.address; fake.to = '0x000000000000000000000000000000000000dEaD';
  out = await call({ op: 'claim', tx: '0x' + 'd'.repeat(64), pack: 'pouch' });
  ok(out.code === 400 && /treasury/.test(out.body.error), 'payments to other addresses do not count');
  delete process.env.TREASURY_ADDRESS;
}

// ---- v5: no islets / portals; things built on old islets go to storage ----
{
  const R = await import('../web/src/island/rules.js'), { gen } = await import('../web/src/island/gen.js');
  const w = gen(808);
  ok(w.islets.length === 0 && w.portals.length === 0, 'the home island is one island again (no islets, no portals)');
  const st = { v: 4, dust: 0, gems: 0, inv: {}, tiles: { 0: { s: 'b', t: 0 }, 1: { s: 'p', t: 0 } }, b: [{ id: 1, type: 'bench', k: 0 }], nb: 2 };
  R.normalize(st, 808, Date.now());
  ok(st.v === 5 && !st.b.some(b => b.type === 'bench') && st.stash.bench === 1 && !st.tiles[1], 'buildings on old islets move to storage; farm tiles there are dropped');
}

// ---- every song a screen asks for exists; every name in the client code is defined elsewhere (see docs/HANDOFF.md lint) ----
{
  const fs = await import('node:fs'), path = await import('node:path');
  const dir = path.resolve('web/src'), files = [];
  const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(dir);
  const audio = fs.readFileSync(path.join(dir, 'audio.js'), 'utf8');
  const want = new Set(files.flatMap(f => [...fs.readFileSync(f, 'utf8').matchAll(/\bmusic\('([a-z0-9]+)'\)/g)].map(m => m[1])));
  ok(want.size >= 3 && [...want].every(n => audio.includes(`  ${n}: {`)), `every song exists (${[...want].join(', ')})`);
}

// ---- island ↔ ranked ----
{
  const R = await import('../web/src/island/rules.js'), { duelDust } = await import('../lib/rating.js');
  const now = Date.now(), st = R.newIsland(9, now);
  ok(R.act(st, { type: 'well' }, { seed: 9, now, minds: 0 }).error, 'the Energy Well starts empty');
  let r = R.act(st, { type: 'well' }, { seed: 9, now: now + 9 * 3600e3, minds: 0 });
  ok(r.done === 2 && st.inv.shard === 2, 'the well makes 1 shard every 4 hours');
  ok(R.wellShards({ wellAt: 0 }, 1e12) === R.SHARD_CAP, 'the well holds at most 6 shards');
  ok(duelDust(true, 3, false) === 180 && duelDust(false, 1, false) === 15 && duelDust(true, 1, true) === 30, 'ranked duels pay Dust by stake (bots half)');
  const alice = await db.insert('players', { name: 'Duelist', address: acct.address });
  T.islands.push({ player_id: alice.id, seed: 9, state: R.newIsland(9, now), minds: 0, rev: 0, updated_at: new Date().toISOString() });
  const m2 = await startMatch({ player: alice, minds: [1, 2] }, null, { ranked: true, botLevel: 'normal' });
  await forfeit(m2.id, alice.id);
  const isl = T.islands.find(x => x.player_id === alice.id);
  ok(isl.state.dust === 100 + duelDust(false, 2, true), 'a ranked duel sends Dust to your island');
}

// ---- wallet (holder) accounts: the paths guests never reach ----
{
  const R = await import('../web/src/island/rules.js'), RD = await import('../web/src/island/raid.js'), chain = await import('../lib/chain.js');
  const raidRoute = (await import('../lib/routes/raid.js')).default, advRoute = (await import('../lib/routes/adventure.js')).default, energyRoute = (await import('../lib/routes/energy.js')).default;
  const { TW, TH } = await import('../web/src/island/gen.js');
  const addr = '0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37';
  const holder = await db.insert('players', { name: 'Holder', address: addr, pfp: 49, showcase: [49] });
  const now = Date.now(), st = R.newIsland(11, now); st.dust = 2000; st.inv.shard = 3;
  T.islands.push({ player_id: holder.id, seed: 11, state: st, minds: 2, rev: 0, updated_at: new Date().toISOString() });
  const mc = chain.client.multicall;
  chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'success', result: addr }));
  const call = async (fn, body, url) => { const token = signSession({ id: holder.id, address: addr }); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method: 'POST', url, headers: { authorization: 'Bearer ' + token }, body, query: {} }, res); return o; };
  const isl = T.islands.find(x => x.player_id === holder.id);
  let out = await call(raidRoute, { op: 'find', minds: [49], army: { brawler: 4, archer: 3 } }, '/api/raid');
  ok(out.code === 200 && out.body.hero === 'hero' && out.body.cap === 12 && out.body.fee === 35, 'a holder raids with their Mind as hero, a bigger camp, and pays supplies');
  ok(isl.state.dust === 2000 - 35, 'raid supplies are paid in Dust');
  const S = RD.createRaid(out.body.snap, { troops: out.body.army, hero: out.body.hero }), spots = [];
  for (let k = 0; k < TW * TH; k++) if (RD.dropOk(S, k)) spots.push(k);
  ok(!RD.input(S, { t: 0, drop: 'hero', k: spots[0] }) && !RD.input(S, { t: 1, cry: 1 }), 'the hero drops and shouts Battle Cry');
  out = await call(raidRoute, { op: 'attack', id: out.body.id, inputs: [{ t: 0, drop: 'hero', k: spots[0] }, { t: 1, cry: 1 }], claim: 0 }, '/api/raid');
  ok(out.code === 200, 'the holder raid finishes');
  out = await call(advRoute, { op: 'start', spot: 0, mind: 49 }, '/api/adventure');
  ok(out.code === 200 && out.body.heroKind === 'hero', 'a holder adventures with their Mind');
  T.mind_energy.push({ token_id: 49, day: new Date().toISOString().slice(0, 10), used: 3 });
  out = await call(energyRoute, { mind: 49, pay: 'shard' }, '/api/energy');
  ok(out.code === 200 && !isl.state.inv.shard && T.mind_energy.find(e => e.token_id === 49).used === 2, '3 shards buy +1 energy');
  out = await call(energyRoute, { mind: 49, pay: 'gems' }, '/api/energy');
  ok(out.code === 403, 'energy with Gems needs Gems');
  isl.state.gems = 20;
  await call(energyRoute, { mind: 49, pay: 'gems' }, '/api/energy');
  await call(energyRoute, { mind: 49, pay: 'gems' }, '/api/energy');
  out = await call(energyRoute, { mind: 49, pay: 'gems' }, '/api/energy');
  ok(out.code === 403 || out.code === 400, 'max 3 refills per Mind per day');
  chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'success', result: '0x000000000000000000000000000000000000dEaD' }));
  out = await call(energyRoute, { mind: 50, pay: 'dust' }, '/api/energy');
  ok(out.code === 403, "you cannot refill someone else's Mind");
  chain.client.multicall = mc;
}

// ---- round 8: community + AI players ----
{
  const R = await import('../web/src/island/rules.js'), RD = await import('../web/src/island/raid.js'), J = await import('../web/src/island/jobs.js'), chain = await import('../lib/chain.js');
  const { npcRaid } = await import('../lib/raiders.js');
  const rt = n => import(`../lib/routes/${n}.js`).then(m => m.default);
  const [mail, report, messages, admin, cup, town, agent, island, friend] = await Promise.all(['mail', 'report', 'messages', 'admin', 'cup', 'town', 'agent', 'island', 'friend'].map(rt));
  const { agentKeys } = await import('../lib/routes/agent.js');
  const { settle } = await import('../lib/routes/cup.js');
  const addr = '0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37', addr2 = '0x0000000000000000000000000000000000000abc', addr3 = '0x0000000000000000000000000000000000000abd';
  const A = await db.insert('players', { name: 'Ann', address: addr, showcase: [] }), B = await db.insert('players', { name: 'Bob', address: addr2, showcase: [] }), C = await db.insert('players', { name: 'Cid', address: addr3, showcase: [] });
  const now0 = Date.now();
  for (const [p, seed] of [[A, 21], [B, 22], [C, 23]]) { const st = R.newIsland(seed, now0); st.dust = 3000; st.gems = 20; T.islands.push({ player_id: p.id, seed, state: st, minds: 2, minds_at: new Date().toISOString(), rev: 0, updated_at: new Date().toISOString() }); }
  const isl = p => T.islands.find(x => x.player_id === p.id);
  const hit = async (fn, p, body, method = 'POST', query = {}, auth) => { const token = auth || signSession({ id: p.id, address: p.address }); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method, url: '/api/x', headers: { authorization: 'Bearer ' + token }, body, query }, res); return o; };

  // Army Camp + raids
  ok(RD.armyCap(2, 0) === 12 && RD.armyCap(2, 3) === 21 && RD.raidsPerDay(2, 3) === 11, 'Army Camps add 3 space per level and +1 raid a day');
  let st = isl(A).state, ctx = { seed: 21, now: now0, minds: 2, instant: true };
  ok(R.BUILD.camp && R.UPGRADABLE.camp, 'the Army Camp is a building you can upgrade');

  // Mind jobs
  let r = R.act(st, { type: 'job', mind: 49, job: 'scout' }, ctx);
  ok(r.done === 1 && st.jobs[49].job === 'scout', 'a Mind takes a job');
  ok(R.act(st, { type: 'job', mind: 50, job: 'farmer', crop: 'carrot' }, ctx).done === 1, 'a second Mind takes another job');
  ok(R.act(st, { type: 'job', mind: 51, job: 'scout' }, ctx).error, 'work slots follow Minds owned');
  ok(R.act(st, { type: 'job', mind: 49, job: 'nope' }, ctx).error, 'unknown jobs are refused');
  const d0 = st.dust; st.jobs[49].at = now0 - 100 * J.JOB_MS;
  ok(J.runJobs(st, { seed: 21, now: now0, minds: 2 }) === J.JOB_SHIFT && st.dust > d0 && st.jobLog[0].id === 49, 'a Mind works up to 8 hours away, then stops');
  ok(J.runJobs(st, { seed: 21, now: now0, minds: 2 }) === 0, 'finished rounds are not paid twice');
  ok(J.parseTask('please go chop some trees').job === 'woodcutter' && J.parseTask('plant melons').crop === 'melon' && J.parseTask('hello').talk === 'hello' && J.parseTask('zzz').talk === 'confused', 'Minds understand plain words');
  delete st.jobs;

  // sky raiders
  const s2 = R.newIsland(5, now0); s2.dust = 2000; s2.npcAt = now0 - 30 * 3600e3;
  ok(!npcRaid(s2, 5, now0) && s2.dust === 2000, 'brand-new islands are left alone');
  for (let i = 0; i < 3; i++) s2.b.push({ id: 90 + i, type: 'lamp', k: 1 });
  const e = npcRaid(s2, 5, now0);
  ok(e && e.loot <= 400 && s2.dust === 2000 - e.loot && s2.gems === 0 && s2.raidLog[0].npc, 'raiders take a little Dust, never Gems');
  ok(!npcRaid(s2, 5, now0), 'raiders do not come twice in a row');

  // friend chat + unfriend + reports
  T.friends.push({ a: A.id, b: B.id, status: 'accepted' });
  let out = await hit(messages, A, { to: B.id, text: 'hello <b>there</b>' });
  ok(out.code === 200, 'friends can type anything');
  out = await hit(messages, B, null, 'GET', { with: A.id });
  ok(out.body.messages[0].text === 'hello <b>there</b>', 'typed messages arrive');
  ok((await hit(messages, C, { to: A.id, text: 'hi' })).code === 403, 'strangers cannot message you');
  T.messages[0].created_at = new Date(Date.now() - 31 * 864e5).toISOString();
  ok(!(await hit(messages, B, null, 'GET', { with: A.id })).body.messages.length, 'messages over 30 days old are gone');
  ok((await hit(friend, A, { op: 'remove', id: B.id })).code === 200 && !T.friends.length, 'unfriend removes the friendship');
  ok((await hit(report, A, { kind: 'player', text: 'He was rude to me', target: B.id })).code === 200 && T.reports.length === 1, 'reports are saved');

  // mail + admin
  process.env.ADMIN_ADDRESSES = addr;
  ok((await hit(admin, B, { op: 'stats' })).code === 403, 'only the owner sees stats');
  out = await hit(admin, A, { op: 'stats' });
  ok(out.code === 200 && out.body.players >= 3 && out.body.wallets >= 3, 'admin sees player numbers');
  ok((await hit(admin, A, { op: 'reports' })).body.reports[0].about === 'Bob', 'admin reads reports');
  ok((await hit(admin, B, { op: 'mail', title: 'x' })).code === 403, 'only the owner sends mail');
  T.mail.push({ id: 7, to_id: null, title: 'Update', body: 'Hi all', gift: { gems: 2 }, created_at: new Date().toISOString() });
  out = await hit(mail, B, null, 'GET');
  ok(out.body.mail[0].title === 'Update' && !out.body.mail[0].taken, 'everyone gets announcements');
  const g0 = isl(B).state.gems;
  ok((await hit(mail, B, { op: 'claim', id: 7 })).code === 200 && isl(B).state.gems === g0 + 2, 'a mail gift arrives');
  ok((await hit(mail, B, { op: 'claim', id: 7 })).code === 400 && isl(B).state.gems === g0 + 2, 'a mail gift can only be taken once');

  // AI keys
  out = await hit(agentKeys, A, { op: 'new', name: 'Bot' });
  const key = out.body.key;
  ok(key.startsWith('mk_') && !JSON.stringify(T.agent_keys).includes(key), 'the key is shown once and only its hash is stored');
  const ai = body => hit(agent, A, body, 'POST', {}, key);
  ok((await hit(agent, A, { op: 'state' }, 'POST', {}, 'mk_wrong')).code === 401, 'a wrong key is refused');
  out = await ai({ op: 'state' });
  ok(out.code === 200 && out.body.raidsLeft > 0 && out.body.adventuresLeft > 0 && Array.isArray(out.body.suggest), 'an AI can read the game');
  out = await ai({ op: 'do', actions: [{ type: 'buy', item: 'seed_bean', n: 2 }] });
  ok(out.code === 200 && out.body.results[0].done === 2, 'an AI can act on the island');
  ok((await ai({ op: 'do', actions: [{ type: 'shop', item: 'gem_dust' }] })).code === 403 && (await ai({ op: 'do', actions: [{ type: 'buy', item: 'seed_bean', n: 1, gems: true }] })).code === 403, 'an AI cannot spend Gems unless allowed');
  ok((await ai({ op: 'job', mind: 49, job: 'woodcutter' })).code === 200, 'an AI can give a Mind a job');
  const mc = chain.client.multicall;
  chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'success', result: addr }));
  out = await ai({ op: 'adventure', spot: 0, mind: 49 });
  ok(out.code === 200 && out.body.gathered + out.body.beat > 0 && Object.keys(out.body.loot).length, 'an AI finishes a whole adventure on the server');
  const dailyAdv = isl(A).state.ad.n;
  ok(dailyAdv === 1, 'an AI adventure uses a normal daily adventure');
  isl(A).state.inv.troop_brawler = 8; isl(A).state.inv.troop_archer = 6;
  out = await ai({ op: 'raid', mind: 49, army: { brawler: 6, archer: 4 } });
  ok(out.code === 200 && out.body.stars >= 0 && out.body.percent >= 0 && isl(A).state.rd.n === 1, 'an AI finishes a whole raid with the normal limits');
  isl(A).state.rd = { day: new Date().toISOString().slice(0, 10), n: 99 };
  ok((await ai({ op: 'raid' })).code === 403, 'an AI hits the same daily raid limit');
  ok((await hit(cup, A, { op: 'join' }, 'POST', {}, signSession(A, { agent: true }))).code === 403, 'AI players cannot enter the cup');
  await hit(agentKeys, A, { op: 'off', id: T.agent_keys[0].id });
  ok((await ai({ op: 'state' })).code === 401, 'turning a key off stops it at once');
  ok((await hit(agent, A, { op: 'help' }, 'POST', {}, 'x')).body.ops.raid, 'the API explains itself');
  chain.client.multicall = mc;

  // Siege Cup
  const dayNow = new Date().toISOString().slice(0, 10), gA = isl(A).state.gems;
  ok((await hit(cup, A, { op: 'start' })).code === 403, 'you must enter the cup first');
  ok((await hit(cup, A, { op: 'join' })).code === 200 && isl(A).state.gems === gA - 5, 'the entry is paid in Gems');
  ok((await hit(cup, A, { op: 'join' })).code === 200 && isl(A).state.gems === gA - 5, 'entering twice pays once');
  out = await hit(cup, A, { op: 'start' });
  ok(out.code === 200 && out.body.army.hero === 'captain', 'everyone gets the same army');
  const SC = RD.createRaid(out.body.snap, out.body.army), spots = [];
  for (let k = 0; k < 64 * 48; k++) if (RD.dropOk(SC, k)) spots.push(k);
  const plan = RD.autoPlan(out.body.snap, out.body.army);
  out = await hit(cup, A, { op: 'score', inputs: plan });
  ok(out.code === 200 && out.body.score > 0, 'the server scores the attack');
  ok((await hit(cup, A, { op: 'score', inputs: plan })).code === 400, 'one score per try');
  await hit(cup, B, { op: 'join' }); await hit(cup, B, { op: 'start' }); await hit(cup, B, { op: 'score', inputs: [] });
  await hit(cup, A, { op: 'start' }); await hit(cup, A, { op: 'start' });
  ok((await hit(cup, A, { op: 'start' })).code === 403, 'three tries a day');
  out = await hit(cup, A, null, 'GET');
  ok(out.body.pool === 10 && out.body.players === 2, 'the pool is every entry');
  const gNow = isl(A).state.gems, gB = isl(B).state.gems;
  T.cups[0].day = '2000-01-01'; T.cup_entries.forEach(x => { x.day = '2000-01-01'; });
  await settle(); await settle();
  ok(isl(A).state.gems === gNow + 10 && isl(B).state.gems === gB, 'the winners get all the Gems, once');
  ok(T.mail.some(m => m.to_id === A.id && /won/.test(m.title)), 'winners get a letter');
  T.cups.push({ day: '2000-01-02', seed: 9, entry: 5, settled: false }); T.cup_entries.push({ day: '2000-01-02', player_id: C.id, name: 'Cid', best: 0 });
  const gC = isl(C).state.gems; await settle();
  ok(isl(C).state.gems === gC + 5, 'alone in a cup: the entry comes back');

  // Mind Town
  out = await hit(town, A, { x: 100, y: 100, mind: 49 });
  ok(out.code === 200 && out.body.count === 1, 'you can walk into town');
  await hit(town, B, { x: 110, y: 100, mind: 50 });
  const dA = isl(A).state.dust;
  out = await hit(town, A, { x: 100, y: 100, mind: 49 });
  ok(out.body.people[0].name === 'Bob' && out.body.got?.kind === 'meet' && isl(A).state.dust === dA + 20, 'you see other players and meeting one pays');
  out = await hit(town, A, { x: 100, y: 100, mind: 49 });
  ok(!out.body.got, 'meeting the same player again pays nothing');
  T.town_now.find(x => x.player_id === A.id).since = new Date(Date.now() - 11 * 60e3).toISOString();
  out = await hit(town, A, { x: 100, y: 100, mind: 49, say: 'hi all' });
  ok(out.body.got?.kind === 'time' && out.body.chat.some(c => c.text === 'hi all'), 'staying in town pays, and chat works');
  const rowA = T.town_now.find(x => x.player_id === A.id);
  rowA.since = new Date(Date.now() - 5 * 60e3).toISOString(); rowA.at = new Date(Date.now() - 10e3).toISOString();
  const s0 = Date.parse(rowA.since);
  await hit(town, A, { x: 100, y: 100, mind: 49 });
  ok(Date.parse(T.town_now.find(x => x.player_id === A.id).since) > s0, 'standing still pauses Town Time');
  rowA.since = T.town_now.find(x => x.player_id === A.id).since; const s1 = rowA.since;
  await hit(town, A, { x: 120, y: 100, mind: 49, active: true });
  ok(T.town_now.find(x => x.player_id === A.id).since === s1, 'taking part keeps the Town Time clock running');
}

// ---- cheat tests: each one really tries the attack ----
{
  const R = await import('../web/src/island/rules.js'), RD = await import('../web/src/island/raid.js'), AV = await import('../web/src/island/adventure.js'), chain = await import('../lib/chain.js');
  const rt = n => import(`../lib/routes/${n}.js`).then(m => m.default);
  const [raid, adventure, cup, island, mail, admin, match_view] = await Promise.all(['raid', 'adventure', 'cup', 'island', 'mail', 'admin', 'match_view'].map(rt));
  const { settle } = await import('../lib/routes/cup.js');
  const { liveMatchOf } = await import('../lib/matchmaking.js');
  const mk = async (name, n) => { const p = await db.insert('players', { name, address: '0x00000000000000000000000000000000000000' + n, showcase: [] }); const st = R.newIsland(100 + +n, Date.now()); st.dust = 5000; st.gems = 30; st.b.push({ id: 80, type: 'tower', k: 5 }); T.islands.push({ player_id: p.id, seed: 100 + +n, state: st, minds: 0, minds_at: new Date().toISOString(), rev: 0, updated_at: new Date().toISOString() }); return p; };
  const X = await mk('Xavier', 41), V = await mk('Vera', 42), W = await mk('Wren', 43);
  const isl = p => T.islands.find(x => x.player_id === p.id);
  const hit = async (fn, p, body, method = 'POST', query = {}, tok) => { const token = tok || signSession({ id: p.id, address: p.address }); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method, url: '/api/x', headers: { authorization: 'Bearer ' + token }, body, query }, res); return o; };

  // island tampering
  for (const a of [{ type: 'shop', item: 'constructor' }, { type: 'shop', item: '__proto__' }, { type: 'build', item: 'constructor', k: 5 }, { type: 'place', item: '__proto__' }, { type: 'craft', item: 'toString' }, { type: 'plant', crop: 'constructor', tiles: [1] }, { type: 'job', mind: 49, job: 'constructor' }, { type: 'sell', item: 'crop_constructor' }, { type: 'nonsense' }]) {
    let threw = false, r = null;
    try { r = R.act(isl(X).state, a, { seed: 141, now: Date.now(), minds: 0 }); } catch { threw = true; }
    ok(!threw && r.error, `island refuses ${a.type} ${a.item || a.crop || a.job || ''}`);
  }
  const before = JSON.stringify(isl(X).state.inv), d0 = isl(X).state.dust;
  isl(X).state.inv.crop_carrot = 2;
  let out = await hit(island, X, { acts: [{ type: 'sell', item: 'crop_carrot', n: -500 }, { type: 'sell', item: 'crop_carrot', n: 999999 }] });
  ok(out.code === 200 && !isl(X).state.inv.crop_carrot && isl(X).state.dust < d0 + 500, 'selling cannot go negative or sell more than you have');
  out = await hit(island, X, { acts: [{ type: 'buy', item: 'seed_bean', n: -5 }] });
  ok(out.code === 200 && isl(X).state.dust <= d0 + 500, 'a negative purchase never pays you');
  ok((await hit(island, X, { acts: [{ type: 'shop', item: 'gem_dust', gems: true, n: 50 }] })).code === 200 && (isl(X).state.gems || 0) >= 0, 'Gems never go below zero');
  void before;
  ok((await hit(island, X, null)).code === 200 && (await hit(island, X, 'null')).code === 200, 'an empty request does not crash the server');

  // forged sessions
  const good = signSession({ id: X.id, address: X.address }), [b, sig] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ pid: V.id, addr: V.address, exp: Date.now() + 1e9 })).toString('base64url') + '.' + sig;
  ok((await hit(island, X, { acts: [] }, 'POST', {}, forged)).code === 401, 'a forged session is refused');
  ok((await hit(island, X, { acts: [] }, 'POST', {}, b + '.AAAA')).code === 401, 'a bad signature is refused');
  ok(!readSession({ headers: { authorization: 'Bearer ' + good + 'x.y.z' } }), 'a mangled token is refused');
  ok((await hit(admin, X, { op: 'give', pid: X.id, gems: 999 })).code === 403 && (await hit(admin, X, { op: 'ban', pid: V.id })).code === 403, 'players cannot use admin actions');

  // adventures: claims must be physically possible
  const start = async () => { isl(X).state.ad = null; return hit(adventure, X, { op: 'start', spot: 0, potions: 0 }); };
  const boss = m => m.monsters.find(x => AV.MONSTERS[x.type].boss);
  await start();
  let adv = isl(X).state.adv, map = AV.advMap(adv.seed, adv.level), gems0 = isl(X).state.gems;
  adv.at = Date.now() - 8e3;
  out = await hit(adventure, X, { op: 'end', got: [], beat: [boss(map).id] });
  ok(out.code === 400 && isl(X).state.gems === gems0, 'nobody beats a boss in 8 seconds for free Gems');
  ok(T.flags.some(f => f.kind === 'adv_impossible'), 'an impossible adventure reaches the cheat meter');
  adv = isl(X).state.adv; adv.at = Date.now() - 170e3; adv.level = 4;
  const hard = AV.advMap(adv.seed, 4);
  out = await hit(adventure, X, { op: 'end', got: hard.nodes.map(n => n.id), beat: hard.monsters.map(m => m.id), potionsLeft: 0 });
  ok(out.code === 400, 'no hero clears the hardest island without potions');
  adv = isl(X).state.adv; adv.level = 1;
  adv = isl(X).state.adv; adv.at = Date.now() - 150e3;
  out = await hit(adventure, X, { op: 'end', got: map.nodes.slice(0, 6).map(n => n.id), beat: [map.monsters.reduce((a, m) => (m.hp < a.hp ? m : a)).id] });
  ok(out.code === 200, 'a normal adventure still pays');
  await start(); adv = isl(X).state.adv; adv.at = Date.now() - 90e3;
  ok((await Promise.all([hit(adventure, X, { op: 'end', got: [], beat: [] }), hit(adventure, X, { op: 'end', got: [], beat: [] })])).filter(r => r.code === 200).length === 1, 'an adventure can only be finished once');

  // raids: one attack, one payout
  const mc = chain.client.multicall;
  chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'failure' }));
  const vSt = isl(V).state; vSt.dust = 10000;
  const snap = RD.snapshotOf(142, R.normalize(vSt, 142, Date.now()), 2, {});
  isl(X).state.raid = { id: 'dup', target: V.id, name: 'Vera', snap, loot: 2000, hero: 'captain', cap: 10, army: { brawler: 6, archer: 4, bomber: 0, giant: 0 }, at: Date.now() };
  const plan = RD.autoPlan(snap, { troops: { brawler: 6, archer: 4, bomber: 0, giant: 0 }, hero: 'captain' });
  const two = await Promise.all([hit(raid, X, { op: 'attack', id: 'dup', inputs: plan }), hit(raid, X, { op: 'attack', id: 'dup', inputs: plan })]);
  ok(two.filter(r => r.code === 200).length === 1 && (isl(V).state.raidLog || []).length === 1, 'two attacks at once only count once');
  ok((await hit(raid, X, { op: 'attack', id: 'dup', inputs: plan })).code === 400, 'a finished raid cannot be replayed');
  chain.client.multicall = mc;

  // duels
  const m = await startMatch({ player: { ...X, ...T.players.find(p => p.id === X.id) }, minds: [49] }, null, { ranked: true, botLevel: 'normal' });
  const v0 = await getView(m.id, X.id);
  ok(!JSON.stringify(v0).includes('"seed"') && !('play' in v0.view.rival) && !('crowns' in v0.view), 'a duel view hides the seed, future prizes and the rival pick');
  ok((await hit(match_view, V, null, 'GET', { id: m.id })).code === 403, 'you cannot read someone else\'s match');
  const px0 = T.players.find(p => p.id === X.id), pts0 = px0.bot_losses, dust0 = isl(X).state.dust;
  await Promise.allSettled([forfeit(m.id, X.id), forfeit(m.id, X.id)]);
  ok(T.players.find(p => p.id === X.id).bot_losses === pts0 + 1 && isl(X).state.dust === dust0 + 8, 'a result pays out exactly once');
  const m2 = await startMatch({ player: T.players.find(p => p.id === V.id), minds: [49] }, null, { ranked: true, botLevel: 'normal' });
  Object.assign(T.matches.find(r => r.id === m2.id), { deadline: new Date(Date.now() - 31 * 60e3).toISOString(), v: 4 });
  const lost0 = T.players.find(p => p.id === V.id).bot_losses;
  await liveMatchOf(V.id);
  ok(T.players.find(p => p.id === V.id).bot_losses === lost0 + 1, 'walking away from a match counts as a loss');

  // the cup
  const today = new Date().toISOString().slice(0, 10);
  T.cups.length = 0; T.cup_entries.length = 0;
  for (const p of [X, V, W]) { isl(p).state.gems = 30; await hit(cup, p, { op: 'join' }); }
  const secret = T.cups[0].seed;
  process.env.SUPABASE_SECRET_KEY = 'different';
  const { hashStr } = await import('../web/src/island/gen.js');
  ok(secret !== hashStr('cup' + today), 'the cup village cannot be worked out in advance');
  process.env.SUPABASE_SECRET_KEY = 'test-secret';
  await hit(cup, X, { op: 'start' });
  out = await hit(cup, X, { op: 'score', inputs: [{ t: 900, drop: 'brawler', k: 5 }] });
  ok(out.code === 400 && T.flags.some(f => f.kind === 'cup_fast'), 'a cup attack cannot finish faster than real time');
  const gemsNow = [X, V, W].map(p => isl(p).state.gems);
  T.cups[0].day = '2001-01-01'; T.cup_entries.forEach(x => { x.day = '2001-01-01'; });
  await settle();
  ok([X, V, W].every((p, i) => isl(p).state.gems === gemsNow[i] + 5), 'if nobody scores, every entry comes back');

  // gifts
  T.mail.push({ id: 99, to_id: V.id, title: 'For Vera', body: '', gift: { gems: 5 }, created_at: new Date().toISOString() });
  ok((await hit(mail, X, { op: 'claim', id: 99 })).code === 404, 'you cannot take someone else\'s mail gift');
  ok(!(await hit(mail, X, null, 'GET')).body.mail.some(x => x.id === 99), 'you cannot read someone else\'s mail');
}
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
