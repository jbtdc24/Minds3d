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
  const seed = 777, now = Date.now(), st = R.newIsland(seed, now), w = gen(seed), ctx = { seed, now, minds: 0 };
  st.dust = 5000; st.inv.wood = 500; st.inv.stone = 500;
  const spot = type => { for (let k = 0; k < TW * TH; k++) if (R.fits(st, w, type, k)) return k; return -1; };
  let r = R.act(st, { type: 'build', item: 'house', k: spot('house') }, ctx);
  ok(r.done === 1 && st.dust === 4800 && R.maxPlots(st, 0) === 14, 'a cottage costs 200 Dust + wood and gives +2 plots');
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
  ok(r.done === 1 && st.inv.stone === before + 7, 'removing a building refunds half');
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
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
