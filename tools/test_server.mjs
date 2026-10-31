// Server logic test with an in-memory database (no Supabase needed). Run: node tools/test_server.mjs
process.env.SUPABASE_SECRET_KEY = 'test-secret';
const { db } = await import('../lib/db.js');
const { signSession, readSession, loginMessage, checkSignature, checkName } = await import('../lib/auth.js');
const { startMatch, act, getView, forfeit, chatLine } = await import('../lib/game.js');
const { privateKeyToAccount } = await import('viem/accounts');
import { randomUUID } from 'node:crypto';

// ---- tiny PostgREST-ish in-memory db ----
const T = { players: [], matches: [], queue: [], nonces: [], ratelimit: [], mind_energy: [], islands: [], payments: [], flags: [], mail: [], mail_claims: [], reports: [], agent_keys: [], cups: [], cup_entries: [], town_now: [], town_chat: [], messages: [], friends: [], admin_log: [], errors: [], recon_findings: [], recon_runs: [], payment_intents: [] };
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
db.upsert = async (t, row) => { const k = t === 'queue' || t === 'town_now' ? 'player_id' : t === 'recon_findings' ? 'key' : t === 'payment_intents' ? 'tx' : 'address'; const ex = T[t].find(r => r[k] === row[k]); if (ex) Object.assign(ex, row); else T[t].push({ ...(t === 'recon_findings' ? { status: 'open' } : {}), ...row }); return clone(ex || row); };
db.rpc = async () => true;
db.count = async (t, q = '') => T[t].filter(parse(q)).length;
const PK = { payment_intents: ['tx'], payments: ['tx'], mail_claims: ['mail_id', 'player_id'], cup_entries: ['day', 'player_id'], cups: ['day'] }, rawInsert = db.insert;
db.insert = async (t, row) => {
  if (PK[t] && T[t].some(r => PK[t].every(k => r[k] === row[k]))) throw Object.assign(new Error('dup'), { dbStatus: 409 });
  return rawInsert(t, t === 'cup_entries' ? { tries: 0, best: 0, stars: 0, pct: 0, ...row } : t === 'town_chat' ? { ...row } : t === 'agent_keys' ? { revoked: false, gems: false, log: [], ...row } : t === 'cups' ? { settled: false, ...row } : row);
};

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };


// plays an adventure the way a browser does: taps, then waits; returns what the server should be sent
const { createAdv, advInput, advStep, advReplay, cleanAdvInputs, MAX_ADV_TICKS, STEP } = await import('../web/src/island/advsim.js');
function playAdv(map, opts, taps) {
  const S = createAdv(map, opts), inputs = [];
  for (const a of taps) {
    if (S.over) break;
    inputs.push({ t: S.tick, ...a }); advInput(S, a);
    for (let i = 0; i < 900 && !S.over && (S.hero.path.length || S.hero.gather || S.hero.target || S.hero.act === 'hit'); i++) advStep(S);
    S.fx.length = 0;
  }
  return { S, inputs, end: S.tick };
}
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
ok(m.state.botAt > Date.now() && /^BOT · /.test(m.state.p[1].name) && !m.state.p[1].pending, 'a filler rival takes its time to pick, and its name carries the BOT label');
const ready = () => { for (const r of T.matches) if (r.state?.botAt) r.state.botAt = 0; };
ready();
let v = await getView(m.id, A.id), turns = 0;
ok(v.view.rival.locked === true && v.vsBot === true && v.botLevel === null, 'once it has thought, it locks in; the view says it is a bot');
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
  T.islands.find(x => x.player_id === hiker.id).state.adv.seed = 4321;
  const m2 = AD.advMap(4321, out.body.level);
  out = await callAdv({ op: 'end', got: m2.nodes.map(n => n.id), beat: m2.monsters.map(x => x.id) });
  ok(out.code === 400, 'a list of claimed loot is refused');
  const isl = T.islands.find(x => x.player_id === hiker.id), o2 = { heroKind: 'captain', potions: 0, gatherLeft: 40, seed: m2.seed };
  const berries = m2.nodes.filter(n => n.type === 'berry').slice(0, 3), run = playAdv(m2, o2, berries.map(n => ({ node: n.id })));
  out = await callAdv({ op: 'end', inputs: run.inputs, end: 1000 });
  ok(out.code === 400, 'an adventure cannot finish faster than real time');
  isl.state.adv.at = Date.now() - 170e3;
  const dust0 = isl.state.dust, exp = AD.advLoot(m2, run.S.got, run.S.beat).dust || 0;
  out = await callAdv({ op: 'end', inputs: run.inputs, end: run.end, got: m2.nodes.map(n => n.id), beat: m2.monsters.map(x => x.id) });
  ok(out.code === 200 && out.body.beat === run.S.beat.length && out.body.gathered === run.S.got.length && isl.state.dust === dust0 + (run.S.ko ? Math.floor(exp / 2) : exp) && !isl.state.adv, 'the loot comes from the replay, and extra claims are ignored');
  out = await callAdv({ op: 'end', inputs: run.inputs, end: run.end });
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
  const AD2 = await import('../web/src/island/adventure.js'), GN = await import('../web/src/island/gen.js');
  isl.state.adv.seed = 4322;
  const adv2 = isl.state.adv, map3 = AD2.advMap(adv2.seed, adv2.level), wg = GN.gen(adv2.seed);
  adv2.at = Date.now() - 170e3; adv2.gather = 2;
  const near = [...wg.cover.keys()].filter(k => wg.land[k] && wg.cover[k] === GN.COVER.WEEDS).sort((a, b) => Math.hypot(a % 64 - map3.start % 64, (a / 64 | 0) - (map3.start / 64 | 0)) - Math.hypot(b % 64 - map3.start % 64, (b / 64 | 0) - (map3.start / 64 | 0))).slice(0, 4);
  const cutRun = playAdv(map3, { heroKind: adv2.heroKind, potions: adv2.potions, gatherLeft: 2, seed: adv2.seed }, near.map(k => ({ cut: k })));
  const gh0 = isl.state.gh?.n || 0;
  out = await callA({ op: 'end', inputs: cutRun.inputs, end: cutRun.end });
  ok(out.code === 200 && isl.state.gh.n === gh0 + 2 && isl.state.inv.potion === 3, 'gathering stops at the hourly limit; unused potions come back');
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
  await hit(town, A, { x: 100, y: 100, mind: 49, active: true });
  ok(Date.parse(T.town_now.find(x => x.player_id === A.id).since) >= Date.parse(s1), 'a forged active flag earns nothing');
  const sBefore = T.town_now.find(x => x.player_id === A.id).since;
  await hit(town, A, { x: 140, y: 100, mind: 49 });
  ok(Date.parse(T.town_now.find(x => x.player_id === A.id).since) < Date.parse(sBefore), 'really walking keeps the Town Time clock running');
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

  // adventures: the server replays the taps, nothing can be claimed
  const start = async () => { isl(X).state.ad = null; return hit(adventure, X, { op: 'start', spot: 0, potions: 0 }); };
  const boss = m => m.monsters.find(x => AV.MONSTERS[x.type].boss);
  await start();
  let adv = isl(X).state.adv, map = AV.advMap(adv.seed, adv.level), gems0 = isl(X).state.gems;
  adv.at = Date.now() - 8e3;
  out = await hit(adventure, X, { op: 'end', inputs: [], end: 100, got: [], beat: [boss(map).id], ko: false });
  ok(out.code === 200 && out.body.beat === 0 && isl(X).state.gems === gems0, 'claiming a boss pays nothing: only the replay counts');
  await start(); adv = isl(X).state.adv; adv.at = Date.now() - 8e3;
  out = await hit(adventure, X, { op: 'end', inputs: [], end: 3000 });
  ok(out.code === 400 && T.flags.some(f => f.kind === 'adv_fast'), 'a run faster than real time is refused and reaches the cheat meter');
  adv = isl(X).state.adv; adv.at = Date.now() - 175e3; adv.level = 4; adv.seed = 777;
  const hard = AV.advMap(777, 4), brawl = playAdv(hard, { heroKind: 'captain', potions: 0, gatherLeft: 40, seed: 777 }, hard.monsters.map(m => ({ hit: m.id })));
  out = await hit(adventure, X, { op: 'end', inputs: brawl.inputs, end: brawl.end });
  ok(out.code === 200 && out.body.ko === true && out.body.beat < hard.monsters.length, 'fighting everything on the hardest island gets you knocked out');
  await start(); adv = isl(X).state.adv; adv.at = Date.now() - 170e3; adv.seed = 4323; map = AV.advMap(adv.seed, adv.level);
  const fair = playAdv(map, { heroKind: 'captain', potions: 0, gatherLeft: 40, seed: adv.seed }, map.nodes.filter(n => n.type !== 'chest' && n.type !== 'bigchest').slice(0, 4).map(n => ({ node: n.id })));
  out = await hit(adventure, X, { op: 'end', inputs: fair.inputs, end: fair.end });
  ok(out.code === 200 && out.body.gathered === fair.S.got.length && fair.S.got.length > 0, 'a normal adventure still pays');
  const opt = { heroKind: 'captain', potions: 1, gatherLeft: 40, seed: 777 }, tapsA = [{ t: 5, go: 900 }, { t: 40, potion: 1 }, { t: 90, hit: hard.monsters[0].id }];
  const r1 = advReplay(hard, opt, tapsA), r2 = advReplay(hard, opt, tapsA);
  ok(r1.hero.hp === r2.hero.hp && r1.tick === r2.tick && JSON.stringify(r1.beat) === JSON.stringify(r2.beat) && r1.rng === r2.rng, 'the same taps always give the same result');
  ok(cleanAdvInputs([null, 'x', { t: -1, go: 1 }, { t: 1.5, go: 1 }, { t: 2, go: 'a' }, { t: 3, hit: 1 }, { t: 1, potion: true }]).length === 2, 'broken taps are thrown away');
  ok(cleanAdvInputs(new Array(5000).fill({ t: 1, go: 1 })).length === 1500, 'a trip cannot carry endless taps');
  const noPot = advReplay(hard, { ...opt, potions: 0 }, [{ t: 0, potion: 1 }]);
  ok(noPot.potions === 0, 'potions you did not bring cannot be drunk');
  const dup = advReplay(map, { heroKind: 'captain', potions: 0, gatherLeft: 40, seed: adv?.seed ?? 1 }, []);
  ok(dup.tick === MAX_ADV_TICKS && !dup.got.length, 'a trip stops at the time limit');
  await start(); adv = isl(X).state.adv; adv.at = Date.now() - 90e3;
  ok((await Promise.all([hit(adventure, X, { op: 'end', inputs: [], end: 10 }), hit(adventure, X, { op: 'end', inputs: [], end: 10 })])).filter(r => r.code === 200).length === 1, 'an adventure can only be finished once');

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

// ---- round 2 audit: confirmed holes, each tried for real ----
{
  const R = await import('../web/src/island/rules.js'), RD = await import('../web/src/island/raid.js'), chain = await import('../lib/chain.js'), G = await import('../web/src/island/gen.js');
  const { chatSigner } = await import('../web/src/chatsign.js'), { certify, chatServerKey } = await import('../lib/chatcert.js');
  const { freeBotName } = await import('../lib/names.js');
  const rt = n => import(`../lib/routes/${n}.js`).then(m => m.default);
  const [raid, cup, island, town, agent, gems, chatCert, friend, messages, match_chat, match_act] = await Promise.all(['raid', 'cup', 'island', 'town', 'agent', 'gems', 'chat_cert', 'friend', 'messages', 'match_chat', 'match_act'].map(rt));
  const { agentKeys } = await import('../lib/routes/agent.js');
  let n = 500;
  const mk = async (name, st0 = {}) => { n++; const p = await db.insert('players', { name, name_key: name.toLowerCase(), address: '0x' + String(n).padStart(40, '0'), showcase: [] }); const st = R.newIsland(n, Date.now()); Object.assign(st, { dust: 5000, gems: 40 }, st0); st.inv.wood = 500; st.inv.stone = 500; T.islands.push({ player_id: p.id, seed: n, state: st, minds: 0, minds_at: new Date().toISOString(), rev: 0, updated_at: new Date().toISOString() }); return p; };
  const isl = p => T.islands.find(x => x.player_id === p.id);
  const hit = async (fn, p, body, { method = 'POST', query = {}, tok, ip = '1.1.1.' + (p.id.charCodeAt(0) % 200) } = {}) => { const token = tok || signSession({ id: p.id, address: p.address }); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method, url: '/api/x', headers: { authorization: 'Bearer ' + token, 'x-forwarded-for': ip }, body, query }, res); return o; };
  const openLand = p => { const s = isl(p).state, w = G.gen(isl(p).seed); for (let i = 0; i < 64 * 48; i++) if (w.land[i] && R.coverAt(s, w, i)) s.tiles[i] = { s: 'c', t: Date.now() }; return w; };
  const mc = chain.client.multicall; chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'failure' }));

  // hidden traps
  const Att = await mk('TrapAtt'), Def = await mk('TrapDef');
  const fullSnap = RD.botVillage(777, 3); isl(Att).state.raid = { id: 'r1', snap: fullSnap, army: {}, at: Date.now() };
  ok(fullSnap.b.some(b => b.type === 'trap'), 'the test village really has traps');
  let out = await hit(island, Att, { acts: [] });
  ok(!JSON.stringify(out.body).includes('"trap"') && !out.body.island.state.raid, 'island data never carries the raid snapshot');
  ok(!RD.publicSnap(fullSnap).b.some(b => b.type === 'trap') && RD.publicSnap(fullSnap).b.length > 3, 'the raider gets the village without hidden traps');
  delete isl(Att).state.raid;
  out = await hit(raid, Att, { op: 'find', army: { brawler: 4 } });
  ok(out.code === 200 && !JSON.stringify(out.body).includes('"trap"') && isl(Att).state.raid.snap.b, 'a raid target arrives with no traps in it');
  const drops = RD.autoPlan(fullSnap, { troops: { brawler: 6 }, hero: 'captain' }), real = RD.replay(fullSnap, { troops: { brawler: 6 }, hero: 'captain' }, drops), seen = RD.replay(RD.publicSnap(fullSnap), { troops: { brawler: 6 }, hero: 'captain' }, drops);
  ok(real.S.traps.length > 0 && seen.S.traps.length === 0, 'the server still fights with the real traps');

  // build timer
  const Bd = await mk('Timer'), wB = openLand(Bd), sB = isl(Bd).state; let spot = -1;
  for (let i = 0; i < 64 * 48 && spot < 0; i++) if (R.fits(sB, wB, 'barn', i)) spot = i;
  const cx = { seed: isl(Bd).seed, now: Date.now(), minds: 0 };
  R.act(sB, { type: 'build', item: 'barn', k: spot }, cx);
  ok(R.act(sB, { type: 'store', id: sB.b.at(-1).id }, cx).error && sB.b.at(-1).done, 'storing a half-built building cannot skip its timer');

  // AI key and Gems
  const Ai = await mk('AiOwner'), Other = await mk('AiOther'), key = (await hit(agentKeys, Ai, { op: 'new' })).body.key, wA = openLand(Ai); let kk = -1;
  for (let i = 0; i < 64 * 48 && kk < 0; i++) if (R.fits(isl(Ai).state, wA, 'crystal', i)) kk = i;
  out = await hit(agent, Ai, { op: 'do', actions: [{ type: 'build', item: 'crystal', tiles: [kk] }] }, { tok: key });
  ok(out.code === 403 && isl(Ai).state.gems === 40, 'an AI cannot buy Gem-only decorations without permission');
  const kid = T.agent_keys.find(k => k.player_id === Ai.id).id;
  await hit(agentKeys, Other, { op: 'off', id: kid }); await hit(agentKeys, Other, { op: 'gems', id: kid, on: true });
  ok(!T.agent_keys.find(k => k.id === kid).revoked && !T.agent_keys.find(k => k.id === kid).gems, 'another player cannot touch your AI key');
  ok((await hit(agentKeys, Ai, { op: 'off', id: "x&revoked=eq.true" })).code === 400, 'a key id cannot carry extra database filters');

  // Town Time
  const Tn = await mk('Twin'); await hit(town, Tn, { x: 10, y: 10, mind: 1 });
  const row = () => T.town_now.find(x => x.player_id === Tn.id), dT = isl(Tn).state.dust;
  row().since = new Date(Date.now() - 11 * 60e3).toISOString(); row().at = new Date(Date.now() - 5e3).toISOString();
  const pair = await Promise.all([hit(town, Tn, { x: 10, y: 10, mind: 1 }), hit(town, Tn, { x: 10, y: 10, mind: 1 })]);
  ok(pair.filter(p => p.body.got).length === 1 && isl(Tn).state.dust === dT + 40, 'two requests at once pay one Town Time');
  for (let i = 0; i < 9; i++) { row().since = new Date(Date.now() - 11 * 60e3).toISOString(); row().at = new Date(Date.now() - 5e3).toISOString(); await hit(town, Tn, { x: 10, y: 10, mind: 1 }); }
  ok(isl(Tn).state.tn.n === 6 && isl(Tn).state.dust === dT + 240, 'Town Time stops at 6 a day, however many requests');
  isl(Tn).state.tn.day = '2000-01-01'; row().since = new Date(Date.now() - 11 * 60e3).toISOString(); row().at = new Date(Date.now() - 5e3).toISOString();
  ok((await hit(town, Tn, { x: 10, y: 10, mind: 1 })).body.got?.n === 1, 'the Town Time count starts again the next day');

  // the cup
  T.cups.length = 0; T.cup_entries.length = 0;
  const Cp = await mk('Cupper'), Cq = await mk('Cupper2');
  await hit(cup, Cp, { op: 'join' }); await hit(cup, Cq, { op: 'join' });
  const v1 = await hit(cup, Cp, { op: 'start' }), v1b = await hit(cup, Cq, { op: 'start' });
  ok(JSON.stringify(v1.body.snap.b) === JSON.stringify(v1b.body.snap.b), 'everyone gets the same village on the same try');
  ok(!JSON.stringify(v1.body).includes('"trap"'), 'cup villages arrive without hidden traps');
  const planA = RD.autoPlan(v1.body.snap, v1.body.army);
  const both = await Promise.all([hit(cup, Cp, { op: 'score', inputs: planA }), hit(cup, Cp, { op: 'score', inputs: planA })]);
  ok(both.filter(x => x.code === 200).length === 1, 'one try gives one score, even with two requests at once');
  const v2 = await hit(cup, Cp, { op: 'start' });
  ok(JSON.stringify(v1.body.snap.b) !== JSON.stringify(v2.body.snap.b), 'each try is a new village, so a rehearsal of one does not help the next');

  // moving Dust between your own accounts
  const Main = await mk('MainAcc', { dust: 100 }), Alt = await mk('AltAcc', { dust: 50000 });
  let got = 0, raids = 0;
  for (let i = 0; i < 6; i++) {
    isl(Main).state.raidLog = [{ at: 1000 + i, by: 'AltAcc', pid: Alt.id, stars: 1, pct: 30, loot: 0 }];
    Object.assign(isl(Main).state.inv, { troop_brawler: 10, troop_archer: 10 }); isl(Main).state.dust += 100;
    const f = await hit(raid, Main, { op: 'find', revenge: 1000 + i, army: { brawler: 6, archer: 4 } }, { ip: '9.9.9.1' });
    if (f.code !== 200) continue;
    const a = await hit(raid, Main, { op: 'attack', id: f.body.id, inputs: RD.autoPlan(isl(Main).state.raid.snap, { troops: f.body.army, hero: f.body.hero }) }, { ip: '9.9.9.1' });
    if (a.code === 200) { got += a.body.loot; raids++; }
  }
  ok(raids === 6 && got <= 4000, 'one player can only take Dust from one island twice a day');
  const Rich = await mk('RichTarget', { dust: 90000 });
  isl(Main).state.pl = { day: new Date().toISOString().slice(0, 10), got: 5900, m: {} }; isl(Main).state.raidLog = [{ at: 1500, by: 'RichTarget', pid: Rich.id, stars: 1, pct: 30, loot: 0 }]; Object.assign(isl(Main).state.inv, { troop_brawler: 10, troop_archer: 10 });
  const ceiling = await hit(raid, Main, { op: 'find', revenge: 1500, army: { brawler: 6, archer: 4 } }, { ip: '9.9.9.2' });
  ok(ceiling.code === 200 && isl(Main).state.raid.loot <= 100, 'Dust taken from real players stops at the daily ceiling');
  delete isl(Main).state.raid;
  isl(Alt).state.dk = (await import('../lib/http.js')).deviceKey({ headers: { 'x-forwarded-for': '7.7.7.7' } });
  isl(Main).state.pl = null; isl(Main).state.raidLog = [{ at: 2000, by: 'AltAcc', pid: Alt.id, stars: 1, pct: 30, loot: 0 }]; Object.assign(isl(Main).state.inv, { troop_brawler: 10, troop_archer: 10 });
  const sd = await hit(raid, Main, { op: 'find', revenge: 2000, army: { brawler: 6, archer: 4 } }, { ip: '7.7.7.7' });
  ok(sd.code === 200 && sd.body.loot === 0, 'raids between accounts on one connection pay nothing');
  chain.client.multicall = mc;

  // payments
  process.env.TREASURY_ADDRESS = '0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37';
  const Pay = await mk('Payer'), hash = '0x' + 'f'.repeat(64), tre = process.env.TREASURY_ADDRESS;
  chain.client.getTransaction = async () => ({ to: tre, from: Pay.address, value: 10n ** 16n, chainId: 4663 });
  chain.client.getTransactionReceipt = async () => ({ status: 'success', blockNumber: 96n }); chain.client.getBlockNumber = async () => 100n;
  ok((await hit(gems, Pay, { op: 'claim', tx: hash, pack: 'pouch' })).body.pending, 'a payment waits for 6 confirmations');
  chain.client.getBlockNumber = async () => 101n;
  const upd = db.update; db.update = async (t, q, p) => (t === 'islands' ? [] : upd(t, q, p));
  const g0 = isl(Pay).state.gems, busy = await hit(gems, Pay, { op: 'claim', tx: hash, pack: 'pouch' });
  db.update = upd;
  ok(busy.body.pending && !T.payments.some(x => x.tx === hash), 'a busy island never swallows a payment');
  ok((await hit(gems, Pay, { op: 'claim', tx: hash, pack: 'pouch' })).body.ok && isl(Pay).state.gems === g0 + 50, 'the retry delivers the Gems');
  ok((await hit(gems, Pay, { op: 'claim', tx: hash, pack: 'pouch' })).code === 409 && isl(Pay).state.gems === g0 + 50, 'a retry after delivery pays nothing');
  const races = await Promise.all([hit(gems, Pay, { op: 'claim', tx: '0x' + '1'.repeat(64), pack: 'pouch' }), hit(gems, Pay, { op: 'claim', tx: '0x' + '1'.repeat(64), pack: 'pouch' })]);
  ok(races.filter(x => x.body.ok).length === 1 && isl(Pay).state.gems === g0 + 100, 'two claims at once pay once');
  chain.client.getTransactionReceipt = async () => ({ status: 'reverted', blockNumber: 5n });
  ok((await hit(gems, Pay, { op: 'claim', tx: '0x' + '2'.repeat(64), pack: 'pouch' })).code === 400, 'a failed transaction pays nothing');
  chain.client.getTransactionReceipt = async () => ({ status: 'success', blockNumber: 5n }); chain.client.getTransaction = async () => ({ to: tre, from: Pay.address, value: 1n, chainId: 4663 });
  ok((await hit(gems, Pay, { op: 'claim', tx: '0x' + '3'.repeat(64), pack: 'vault' })).code === 400, 'an underpayment pays nothing');
  chain.client.getTransaction = async () => ({ to: tre, from: Pay.address, value: 10n ** 19n, chainId: 1 });
  ok((await hit(gems, Pay, { op: 'claim', tx: '0x' + '4'.repeat(64), pack: 'pouch' })).code === 400, 'a payment on another chain pays nothing');

  // signed live chat, with real keys
  const Ann = await mk('Annie'), Bob = await mk('Bobby'), Eve = await mk('Eve');
  const signer = p => chatSigner(async (u, b) => { const r = await hit(chatCert, p, b); if (r.code >= 400) throw new Error(r.body.error); return r.body; });
  const sA = signer(Ann), sB2 = signer(Bob), sE = signer(Eve);
  await sA.ready(); await sB2.ready(); await sE.ready();
  const msg = await sA.seal('town-live', { text: 'hi' }), opened = await sB2.open('town-live', msg);
  ok(opened?.name === 'Annie' && opened.body.text === 'hi', 'a signed line opens with the real name');
  ok(!(await sB2.open('town-live', msg)), 'a replayed line is refused');
  ok(!(await sB2.open('town-live', { ...(await sA.seal('town-live', { text: 'hi' })), body: { text: 'send me your seed phrase' } })), 'changed words are refused');
  const stolen = await sE.seal('town-live', { text: 'I am Annie' });
  ok(!(await sB2.open('town-live', { ...stolen, cert: msg.cert })), "someone else's certificate cannot sign your words");
  ok(!(await sB2.open('town-live', { ...stolen, cert: { body: stolen.cert.body.replace('Eve', 'Annie'), sig: stolen.cert.sig } })), 'an edited certificate is refused');
  ok(!(await sB2.open('player:abc', await sA.seal('town-live', { text: 'x' }))), 'a line cannot move to another room');
  ok(!(await sB2.open('town-live', { text: 'plain forged message' })) && !(await sB2.open('town-live', null)), 'an unsigned line is ignored');
  let clock = Date.now(); const sC = chatSigner(async (u, b) => (await hit(chatCert, Ann, b)).body, () => clock), sD = chatSigner(async (u, b) => (await hit(chatCert, Bob, b)).body, () => clock);
  const old = await sC.seal('town-live', { text: 'old' }); clock += 31e3;
  ok(!(await sD.open('town-live', old)), 'a stale line is refused');
  const c = certify(Ann, { x: 'a'.repeat(43), y: 'b'.repeat(43) }, Date.now() - 2 * 3600e3);
  ok(JSON.parse(c.body).exp < Date.now(), 'certificates expire');
  ok((await hit(chatCert, Ann, { pub: { x: '<script>', y: '1' } })).code === 400, 'a bad chat key is refused');
  const gst = await db.insert('players', { name: 'Gst', is_guest: true });
  const gc = await hit(chatCert, gst, { pub: { x: 'a'.repeat(43), y: 'b'.repeat(43) } });
  ok(gc.code === 200 && JSON.parse(gc.body.cert.body).guest && gc.body.ck.x === chatServerKey().x, 'trial accounts get a marked certificate');
  const sG = signer(gst); await sG.ready();
  ok(!(await sB2.open('town-live', await sG.seal('town-live', { text: 'free chat' }))), 'a trial account cannot speak in live chat');
  const pos = await sG.seal('town-pos', { x: 5, y: 6, mind: 1 });
  ok((await sB2.open('town-pos', pos, true))?.pid === gst.id && (await sB2.open('town-pos', pos, true))?.pid === gst.id, 'a signed position opens, even when sent again');
  ok(!(await sB2.open('town-pos', { ...pos, body: { x: 900, y: 900, mind: 1 } }, true)), 'a changed position is refused');
  ok(!(await sB2.open('town-live', pos, true)), 'a position cannot be moved to another room');
  ok(!(await sB2.open('town-pos', { ...(await sE.seal('town-pos', { x: 1, y: 1 })), cert: pos.cert }, true)), "nobody can move someone else's character");

  // bot names
  const { villageName } = await import('../web/src/island/raid.js');
  for (const i of [0, 1, 2, 3, 4, 5]) await mk(villageName(i * 31));
  const taken = T.players.filter(p => p.name_key).map(p => p.name_key);
  const names = await Promise.all(Array.from({ length: 200 }, (_, i) => freeBotName(i * 31)));
  ok(names.every(x => !taken.includes(x.toLowerCase())), 'a game-run opponent never uses a real player name');
}

// ---- round 2 audit: login, sessions, limits and duel rules ----
{
  const http = await import('../lib/http.js'), adm = await import('../lib/admin.js');
  const R = await import('../web/src/island/rules.js');
  const rt = n => import(`../lib/routes/${n}.js`).then(m => m.default);
  const [nonce, verify, island, match_act, match_chat, match_forfeit, leaderboard, queue_join, friend] = await Promise.all(['auth_nonce', 'auth_verify', 'island', 'match_act', 'match_chat', 'match_forfeit', 'leaderboard', 'queue_join', 'friend'].map(rt));
  const { default: gemsRoute } = await import('../lib/routes/gems.js');
  const raw = async (fn, { body, tok, method = 'POST', host = 'mindsclash.test', query = {} }) => { let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method, url: '/api/x', headers: { host, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body, query }, res); return o; };
  const wallet = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
  T.nonces.length = 0;
  const m1 = (await raw(nonce, { body: { address: wallet.address } })).body.message, sig1 = await wallet.signMessage({ message: m1 });
  T.nonces[0].created_at = T.nonces[0].created_at || new Date().toISOString();
  const bad = await raw(verify, { body: { address: wallet.address, signature: sig1 }, host: 'evil.example' });
  ok(bad.code === 401 || bad.code === 400, 'a signature made for another site is refused');
  const m2 = (await raw(nonce, { body: { address: wallet.address } })).body.message, sig2 = await wallet.signMessage({ message: m2 });
  const good = await raw(verify, { body: { address: wallet.address, signature: sig2 } });
  ok(good.code === 200 && good.body.token, 'a correct wallet signature logs in');
  ok((await raw(verify, { body: { address: wallet.address, signature: sig2 } })).code === 400, 'a login signature cannot be replayed');
  await raw(nonce, { body: { address: wallet.address } });
  T.nonces[0].created_at = new Date(Date.now() - 11 * 60e3).toISOString();
  const old = await wallet.signMessage({ message: loginMessage(wallet.address, T.nonces[0].nonce, 'mindsclash.test') });
  ok((await raw(verify, { body: { address: wallet.address, signature: old } })).code === 400, 'an expired login is refused');
  const me = T.players.find(p => p.address === wallet.address);
  const body = Buffer.from(JSON.stringify({ pid: me.id, exp: Date.now() - 1000 })).toString('base64url');
  const { createHmac, createHash } = await import('node:crypto');
  const stale = `${body}.${createHmac('sha256', createHash('sha256').update('mindclash-session:test-secret').digest()).update(body).digest('base64url')}`;
  ok(readSession({ headers: { authorization: 'Bearer ' + stale } }) === null, 'an expired session is refused');
  ok((await raw(island, { body: { acts: [] }, tok: 'x.y' })).code === 401, 'a junk session is refused');
  // bans reach every route
  T.players.find(p => p.id === me.id).banned_until = '2999-01-01T00:00:00Z'; adm.forgetBan(me.id);
  ok((await raw(island, { body: { acts: [] }, tok: good.body.token })).code === 403, 'a banned player is locked out');
  T.players.find(p => p.id === me.id).banned_until = null; adm.forgetBan(me.id);
  // rate limit
  const rpc = db.rpc; db.rpc = async () => false;
  ok((await raw(island, { body: { acts: [] }, tok: good.body.token })).code === 429, 'the rate limit refuses extra calls');
  db.rpc = rpc;
  // a feature that is switched off says so
  const tre = process.env.TREASURY_ADDRESS; delete process.env.TREASURY_ADDRESS;
  const off = await raw(gemsRoute, { body: { op: 'claim', tx: '0x' + 'a'.repeat(64), pack: 'pouch' }, tok: good.body.token });
  ok(off.code === 503 && /not switched on/.test(off.body.error), 'a switched-off feature gives a clear message');
  process.env.TREASURY_ADDRESS = tre;
  ok((await raw(island, { body: '{not json', tok: good.body.token })).code === 400, 'broken JSON is a clean refusal');
  ok((await raw(queue_join, { body: { minds: 'abc' }, tok: good.body.token })).code < 500, 'a bad Mind list is a clean refusal');
  let thrown = null; const res = { setHeader() {}, end(t) { thrown = { code: this.statusCode, t }; }, headersSent: false };
  await island({ method: 'POST', url: '/api/island', headers: { authorization: 'Bearer ' + good.body.token }, get body() { throw new Error('Invalid JSON'); }, query: {} }, res);
  ok(thrown.code === 400, 'broken JSON on the live platform is a clean refusal');
  // duel rules
  const Ga = await db.insert('players', { name: 'DuelA', address: '0x' + 'a'.repeat(40) }), Gb = await db.insert('players', { name: 'DuelB', address: '0x' + 'b'.repeat(40) }), Gc = await db.insert('players', { name: 'DuelC', address: '0x' + 'c'.repeat(40) });
  const tk = p => signSession({ id: p.id, address: p.address }), m = await startMatch({ player: Ga, minds: [1] }, { player: Gb, minds: [2] }, { ranked: true });
  const play = (p, a) => raw(match_act, { body: { id: m.id, ...a }, tok: tk(p) });
  ok((await play(Gc, { card: 1 })).code === 403, 'an outsider cannot play in your match');
  ok((await raw(match_forfeit, { body: { id: m.id }, tok: tk(Gc) })).code === 403, 'an outsider cannot forfeit your match');
  ok((await raw(match_chat, { body: { id: m.id, phrase: 1 }, tok: tk(Gc) })).code === 403, 'an outsider cannot chat in your match');
  for (const card of [99, -1, 'x', null, 1.5]) ok((await play(Ga, { card })).code >= 400, `an impossible card is refused (${card})`);
  ok((await play(Ga, { card: 1, spell: 'nuke' })).code >= 400, 'an unknown spell is refused');
  ok((await play(Ga, { card: 1 })).code === 200, 'a real card is accepted');
  ok((await play(Ga, { card: 2 })).code >= 400, 'you cannot change your pick after locking in');
  await play(Gb, { card: 2 });
  const hand = (await getView(m.id, Ga.id)).view.me.cards;
  ok(!hand.includes(1), 'a played card is gone from your hand');
  ok((await play(Ga, { card: 1 })).code >= 400, 'a used card cannot be played twice');
  // the leaderboard
  const lb = await raw(leaderboard, { method: 'GET' });
  ok(lb.body.players.every(p => !p.guest), 'trial accounts never appear on the leaderboard');
  ok(!JSON.stringify(lb.body).includes('0x' + 'a'.repeat(40)), 'the leaderboard shows no full wallet address');
  ok((await raw(friend, { body: { op: 'add', id: Ga.id }, tok: tk(Ga) })).code === 400, 'you cannot friend yourself');
}

// ---- round 2 audit: more races, plus checks on the files themselves ----
{
  const fs = await import('node:fs'), R = await import('../web/src/island/rules.js'), chain = await import('../lib/chain.js');
  const rt = n => import(`../lib/routes/${n}.js`).then(m => m.default);
  const [mail, cup, energy, island, agent, messages] = await Promise.all(['mail', 'cup', 'energy', 'island', 'agent', 'messages'].map(rt));
  const { agentKeys } = await import('../lib/routes/agent.js');
  let n = 800;
  const mk = async name => { n++; const p = await db.insert('players', { name, name_key: name.toLowerCase(), address: '0x' + String(n).padStart(40, '0'), showcase: [] }); const st = R.newIsland(n, Date.now()); Object.assign(st, { dust: 5000, gems: 40 }); T.islands.push({ player_id: p.id, seed: n, state: st, minds: 1, minds_at: new Date().toISOString(), rev: 0, updated_at: new Date().toISOString() }); return p; };
  const isl = p => T.islands.find(x => x.player_id === p.id);
  const hit = async (fn, p, body, method = 'POST', query = {}, tok) => { const token = tok || signSession({ id: p.id, address: p.address }); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method, url: '/api/x', headers: { authorization: 'Bearer ' + token }, body, query }, res); return o; };

  const P = await mk('Racer');
  T.mail.push({ id: 700, to_id: null, title: 'Gift', body: '', gift: { gems: 7 }, created_at: new Date().toISOString() });
  const g0 = isl(P).state.gems;
  await Promise.all(Array.from({ length: 5 }, () => hit(mail, P, { op: 'claim', id: 700 })));
  ok(isl(P).state.gems === g0 + 7, 'five gift claims at once pay once');
  T.cups.length = 0; T.cup_entries.length = 0;
  const g1 = isl(P).state.gems;
  await Promise.all(Array.from({ length: 5 }, () => hit(cup, P, { op: 'join' })));
  ok(isl(P).state.gems === g1 - 5 && T.cup_entries.filter(e => e.player_id === P.id).length === 1, 'five cup entries at once charge once');
  const starts = await Promise.all(Array.from({ length: 6 }, () => hit(cup, P, { op: 'start' })));
  ok(starts.filter(s => s.code === 200).length <= 3 && T.cup_entries[0].tries <= 3, 'six cup starts at once give at most three tries');
  const d0 = isl(P).state.dust;
  await Promise.all(Array.from({ length: 4 }, () => hit(island, P, { acts: [{ type: 'buy', item: 'seed_bean', n: 1 }] })));
  ok(isl(P).state.dust === d0 - 4 * R.CROPS.bean.seed && isl(P).rev >= 4, 'four tabs saving at once lose nothing');
  const mc = chain.client.multicall; chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'success', result: P.address }));
  T.mind_energy.push({ token_id: 900, day: new Date().toISOString().slice(0, 10), used: 3 });
  const s0 = isl(P).state; s0.inv.shard = 3;
  await Promise.all([hit(energy, P, { mind: 900, pay: 'shard' }), hit(energy, P, { mind: 900, pay: 'shard' })]);
  ok(isl(P).state.inv.shard === undefined && T.mind_energy.find(e => e.token_id === 900).used === 2, 'two refills at once spend the shards once');
  const key = (await hit(agentKeys, P, { op: 'new' })).body.key;
  await hit(agent, P, { op: 'duel_join', mode: 'classic', minds: [900] }, 'POST', {}, key);
  ok(T.players.find(p => p.id === P.id).ai_until && Date.parse(T.players.find(p => p.id === P.id).ai_until) > Date.now(), 'an AI duel marks the player as AI-played');
  const am = await startMatch({ player: T.players.find(p => p.id === P.id), minds: [900] }, null, { ranked: false, botLevel: 'easy', practice: true });
  ok(/🤖/.test(am.state.p[0].name), 'an AI duel shows the robot label');
  chain.client.multicall = mc;
  const longText = await hit(messages, P, { to: 'nope', text: 'x' });
  ok(longText.code === 400, 'a bad friend id is refused');

  // the files themselves
  const sql = fs.readdirSync('supabase').map(f => fs.readFileSync('supabase/' + f, 'utf8')).join('\n');
  const tables = [...sql.matchAll(/create table if not exists (\w+)/g)].map(m => m[1]);
  ok(tables.length >= 15 && tables.every(t => new RegExp(`alter table ${t}\\s+enable row level security`).test(sql)), 'every database table has row security turned on');
  ok([...sql.matchAll(/create or replace function (\w+)/g)].every(m => new RegExp(`revoke all on function ${m[1]}`).test(sql)), 'no database function is open to the public');
  const csp = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
  ok(!/script-src[^;]*unsafe/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp), 'the content policy allows no inline or eval scripts');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const client = walk('web/src').filter(f => f.endsWith('.js')), text = client.map(f => fs.readFileSync(f, 'utf8')).join('\n');
  ok(!/sb_secret|service_role|PRIVATE_KEY|SUPABASE_SECRET|ADMIN_ADDRESSES\s*=/.test(text), 'no secret appears in the browser code');
  ok(!/\beval\(|new Function\(|document\.write\(/.test(text + walk('lib').map(f => fs.readFileSync(f, 'utf8')).join('\n')), 'no code runs text as a program');
  const unsafe = client.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(l => /(innerHTML|insertAdjacentHTML|modal\(|tag\()/.test(l) && /\$\{[^}]*\b(\w+\.name|\.text|\.title|\.body|\.by|\.reason|\.message)\b[^}]*\}/.test(l.replace(/esc\([^)]*\)/g, '').replace(/\bd\.name\b|\bg\.name\b|\bab\.name\b|\bpk\.name\b|\bs\.name\b|\bsh\.name\b|\bCROPS\[[^\]]*\]\.name\b|TROOPS\[[^\]]*\]\.name\b|BUILD\[[^\]]*\]\.name\b/g, ''))));
  if (unsafe.length) console.log(unsafe.slice(0, 6).map(l => l.trim().slice(0, 150)).join('\n'));
  ok(!unsafe.length, 'player text is always escaped before it reaches the page');
}

// ---- launch audit: cup dice, Dust ceiling, login, sessions ----
{
  const R = await import('../web/src/island/rules.js'), RD = await import('../web/src/island/raid.js'), chain = await import('../lib/chain.js');
  const rt = n => import(`../lib/routes/${n}.js`).then(m => m.default);
  const [nonce, verify, raid, island, logoutAll, agent] = await Promise.all(['auth_nonce', 'auth_verify', 'raid', 'island', 'logout_all', 'agent'].map(rt));
  const { agentKeys } = await import('../lib/routes/agent.js'), adm = await import('../lib/admin.js');
  const raw = async (fn, { body, tok, host = 'mindsclash.test', ip = '3.3.3.3' }) => { let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method: 'POST', url: '/api/x', headers: { host, 'x-forwarded-for': ip, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body, query: {} }, res); return o; };
  // the secret roll
  const base = RD.botVillage(4242, 3), army = { troops: { brawler: 6, archer: 5, bomber: 2, giant: 1 }, hero: 'captain' }, plan = RD.autoPlan(base, army);
  const open = RD.replay(base, army, plan), a = RD.replay({ ...base, noise: 11 }, army, plan), b = RD.replay({ ...base, noise: 77 }, army, plan);
  const hp = r => JSON.stringify(r.S.structs.map(x => Math.round(x.hp)));
  ok(hp(a) !== hp(open) && hp(a) !== hp(b), 'the secret roll changes the fight, so a rehearsal cannot predict it');
  ok(!('noise' in RD.publicSnap({ ...base, noise: 5 })), 'the secret roll never reaches the browser');
  ok(hp(RD.replay({ ...base, noise: 11 }, army, plan)) === hp(a), 'the server gets the same result every time');
  // login
  const wallet = privateKeyToAccount('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6');
  T.nonces.length = 0;
  const m1 = (await raw(nonce, { body: { address: wallet.address } })).body.message, m2 = (await raw(nonce, { body: { address: wallet.address }, ip: '6.6.6.6' })).body.message;
  ok(m1 === m2, 'a stranger asking again cannot knock out your login');
  const sig = await wallet.signMessage({ message: m1 }), other = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'), badSig = await other.signMessage({ message: m1 });
  ok((await raw(verify, { body: { address: wallet.address, signature: badSig }, ip: '6.6.6.6' })).code === 401, 'a wrong signature is refused');
  const good = await raw(verify, { body: { address: wallet.address, signature: sig } });
  ok(good.code === 200, "a stranger's bad try does not cancel your login");
  const rpc = db.rpc; db.rpc = async (f, a2) => !String(a2?.k).startsWith('login:');
  ok((await raw(verify, { body: { address: wallet.address, signature: sig } })).code === 429, 'too many tries on one wallet are stopped from any address');
  db.rpc = rpc;
  // log out everywhere
  const pid = good.body.player.id, tok = good.body.token, p = T.players.find(x => x.id === pid);
  const st = R.newIsland(60, Date.now()); T.islands.push({ player_id: pid, seed: 60, state: st, minds: 0, minds_at: new Date().toISOString(), rev: 0, updated_at: new Date().toISOString() });
  const key = (await raw(agentKeys, { body: { op: 'new' }, tok })).body.key;
  adm.forgetBan(pid);
  ok((await raw(island, { body: { acts: [] }, tok })).code === 200, 'a session works before logging out');
  await new Promise(r => setTimeout(r, 5));
  ok((await raw(logoutAll, { body: {}, tok })).code === 200 && p.sessions_after, 'log out everywhere is recorded');
  ok((await raw(island, { body: { acts: [] }, tok })).code === 401, 'old sessions stop working at once');
  ok((await raw(agent, { body: { op: 'state' }, tok: key })).code === 401, 'log out everywhere also turns off AI keys');
  await new Promise(r => setTimeout(r, 5));
  ok((await raw(island, { body: { acts: [] }, tok: signSession({ id: pid, address: p.address }) })).code === 200, 'a new login works afterwards');
  // an older database without the new column keeps enforcing bans
  const one = db.one; let tried = 0;
  db.one = async (t, q) => { if (t === 'players' && q.includes('sessions_after')) { tried++; throw Object.assign(new Error('x'), { body: '42703' }); } return one(t, q); };
  p.banned_until = '2999-01-01T00:00:00Z'; adm.forgetBan(pid);
  ok((await raw(island, { body: { acts: [] }, tok: signSession({ id: pid, address: p.address }) })).code === 403 && tried === 1, 'bans still work before the new database column exists');
  db.one = one; p.banned_until = null; adm.forgetBan(pid);
}

// ---- monitoring, payment ledger and check, bot labels, legal pages ----
{
  const fs = await import('node:fs'), R = await import('../web/src/island/rules.js'), RD = await import('../web/src/island/raid.js'), chain = await import('../lib/chain.js');
  const M = await import('../lib/monitor.js'), { runReconcile } = await import('../lib/reconcile.js'), { creditGems } = await import('../lib/routes/gems.js');
  const rt = n => import(`../lib/routes/${n}.js`).then(m => m.default);
  const [admin, gems, cron, errRoute, island, raid, player] = await Promise.all(['admin', 'gems', 'cron_reconcile', 'errors_report', 'island', 'raid', 'player'].map(rt));
  let n = 900;
  const mk = async (name, st0 = {}, guest = false) => { n++; const p = await db.insert('players', { name, name_key: name.toLowerCase(), address: guest ? null : '0x' + String(n).padStart(40, '0'), is_guest: guest, showcase: [] }); const st = R.newIsland(n, Date.now()); Object.assign(st, { dust: 5000, gems: 0 }, st0); T.islands.push({ player_id: p.id, seed: n, state: st, minds: 0, minds_at: new Date().toISOString(), rev: 0, updated_at: new Date().toISOString() }); return p; };
  const isl = p => T.islands.find(x => x.player_id === p.id);
  const hit = async (fn, p, body, { method = 'POST', tok, auth, query = {} } = {}) => { const token = tok ?? (p ? signSession({ id: p.id, address: p.address }) : ''); let o = null; const res = { setHeader() {}, end(t) { o = { code: this.statusCode, body: JSON.parse(t) }; }, headersSent: false }; await fn({ method, url: '/api/island?x=1', headers: { authorization: auth ?? 'Bearer ' + token }, body, query }, res); return o; };
  const hx = c => '0x' + c.repeat(64);

  // scrubbing
  const dirty = `Bearer abc.def key mk_secretkey123 sb_secret_xyz wallet 0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37 tx ${hx('a')} mail me@x.com id 123e4567-e89b-12d3-a456-426614174000 password=hunter2`;
  const clean = M.scrub(dirty);
  ok(!/abc\.def|mk_secret|sb_secret|48C61f|aaaaaaaa|me@x|123e4567|hunter2/.test(clean), 'error text never keeps tokens, keys, wallets, ids or emails');
  ok(M.scrub('a'.repeat(9000)).length <= 400, 'error text is cut short');
  // reporting
  T.errors.length = 0;
  const real = globalThis.fetch, sent = []; globalThis.fetch = async (u, o) => { sent.push(o.body); return { ok: true }; };
  await M.report({ feature: 'test', severity: 'error', code: 'X', message: 'plain failure 123' });
  await M.report({ feature: 'test', severity: 'error', code: 'X', message: 'plain failure 456' });
  ok(T.errors.length === 1 && T.errors[0].count === 1, 'one repeated error is one row, without a write per failure');
  T.errors[0].count = 3; await M.report({ feature: 'other', severity: 'warning', message: 'different' });
  ok(T.errors.length === 2, 'different errors get their own rows');
  process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.test/x';
  await M.report({ feature: 'payments', severity: 'critical', code: 'c1', message: `failed for ${hx('b')} 0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37` });
  await M.report({ feature: 'payments', severity: 'critical', code: 'c1', message: `failed for ${hx('b')} 0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37` });
  ok(sent.length === 1 && !/48C61f|bbbbbbbb/.test(sent[0]), 'a critical failure alerts once, with nothing private in it');
  await M.report({ feature: 'x', severity: 'error', message: 'not critical' });
  ok(sent.length === 1, 'ordinary errors do not alert');
  globalThis.fetch = async () => { throw new Error('webhook down'); };
  ok(await M.alert('x') === false, 'a broken webhook is harmless');
  globalThis.fetch = real; delete process.env.ALERT_WEBHOOK_URL;
  const ins = db.insert, one0 = db.one; db.one = async () => { throw new Error('db down'); };
  let threw = false; try { await M.report({ feature: 'z', message: 'db is down' }); } catch { threw = true; }
  db.one = one0; ok(!threw, 'reporting with the database down never throws');
  // a real server failure lands in the log
  const Boom = await mk('Boomer'), countBefore = T.errors.length;
  const sel = db.select, oneBoom = db.one; db.one = async (t, q) => { if (t === 'islands') throw new Error('kaboom in island 1'); return oneBoom(t, q); };
  const quiet = console.error; console.error = () => {};
  const crash = await hit(island, Boom, { acts: [] });
  console.error = quiet; db.one = oneBoom; void sel; void ins;
  ok(crash.code === 500 && crash.body.error === 'server error, try again' && T.errors.length === countBefore + 1 && /kaboom/.test(T.errors.at(-1).message), 'a server failure is logged, and the player sees no details');
  ok((await hit(errRoute, null, { message: `boom ${hx('c')}`, stack: 'at x', place: 'hub' }, { auth: '' })).code === 200 && T.errors.some(e => e.feature.startsWith('browser') && !/cccccccc/.test(e.message)), 'browser errors arrive scrubbed');

  // the ledger
  process.env.TREASURY_ADDRESS = '0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37';
  const tre = process.env.TREASURY_ADDRESS, chainTx = {};
  const P = await mk('PayerOne'), now = () => new Date().toISOString(), PACK = 2000000000000000n;
  chain.client.getBlockNumber = async () => 1000n;
  chain.client.getTransaction = async ({ hash }) => { if (!chainTx[hash]) throw Object.assign(new Error('Transaction could not be found'), { name: 'TransactionNotFoundError' }); return chainTx[hash]; };
  chain.client.getTransactionReceipt = async ({ hash }) => { if (!chainTx[hash]) throw Object.assign(new Error('Transaction receipt could not be found'), { name: 'TransactionReceiptNotFoundError' }); return { status: chainTx[hash].status || 'success', blockNumber: 900n }; };
  const payTx = (c, p, extra = {}) => { chainTx[hx(c)] = { to: tre, from: p.address, value: PACK, chainId: 4663, ...extra }; return hx(c); };
  const rowOf = (c, p, extra = {}) => T.payments.push({ tx: hx(c), player_id: p.id, address: p.address, pack: 'pouch', gems: 50, wei: PACK.toString(), created_at: now(), ...extra });
  T.payments.length = 0; T.recon_findings.length = 0; T.recon_runs.length = 0; T.payment_intents.length = 0;
  const good = payTx('1', P);
  ok((await hit(gems, P, { op: 'claim', tx: good, pack: 'pouch' })).body.ok && isl(P).state.paid[good].g === 50 && isl(P).state.gems === 50, 'a purchase leaves a ledger mark with the Gems');
  ok(!T.payment_intents.some(i => i.tx === good), 'a finished claim clears its record');
  let run = await runReconcile();
  ok(run.findings === 0 && run.checked === 1 && !run.partial, 'a clean payment raises nothing');
  // each kind of problem
  const kinds = {};
  const bad = async (kind, build) => { await build(); kinds[kind] = true; };
  const Q = await mk('PayerTwo'), Other = await mk('PayerThree');
  await bad('missing_credit', () => { payTx('2', Q); rowOf('2', Q); });
  await bad('wrong_gems', () => { payTx('3', Q); rowOf('3', Q, { gems: 500 }); isl(Q).state.paid = { [hx('3')]: { g: 500 } }; });
  await bad('underpaid', () => { payTx('4', Q, { value: 1n }); rowOf('4', Q, { wei: '1' }); isl(Q).state.paid[hx('4')] = { g: 50 }; });
  await bad('double_credit', () => { payTx('5', Q); rowOf('5', Q); isl(Q).state.paid[hx('5')] = { g: 50, n: 2 }; });
  await bad('chain_failed', () => { payTx('6', Q, { status: 'reverted' }); rowOf('6', Q); isl(Q).state.paid[hx('6')] = { g: 50 }; });
  await bad('chain_missing', () => { rowOf('7', Q); isl(Q).state.paid[hx('7')] = { g: 50 }; });
  await bad('wrong_recipient', () => { payTx('8', Q, { to: Other.address }); rowOf('8', Q); isl(Q).state.paid[hx('8')] = { g: 50 }; });
  await bad('wrong_sender', () => { payTx('9', Q, { from: Other.address }); rowOf('9', Q); isl(Q).state.paid[hx('9')] = { g: 50 }; });
  await bad('wrong_chain', () => { payTx('a', Q, { chainId: 1 }); rowOf('a', Q); isl(Q).state.paid[hx('a')] = { g: 50 }; });
  await bad('overpaid', () => { payTx('b', Q, { value: PACK * 5n }); rowOf('b', Q, { wei: (PACK * 5n).toString() }); isl(Q).state.paid[hx('b')] = { g: 50 }; });
  await bad('unclaimed_payment', () => { payTx('c', Other); T.payment_intents.push({ tx: hx('c'), player_id: Other.id, pack: 'pouch', at: new Date(Date.now() - 3600e3).toISOString() }); });
  T.payment_intents.push({ tx: hx('d'), player_id: Other.id, pack: 'pouch', at: new Date(Date.now() - 3600e3).toISOString() });   // a made-up hash
  payTx('e', Q); rowOf('e', Q, { legacy: true });
  const gBefore = JSON.stringify(T.islands.map(i => [i.state.gems, i.state.dust]));
  run = await runReconcile();
  for (const k of Object.keys(kinds)) ok(T.recon_findings.some(f => f.kind === k && f.status === 'open'), `the check finds: ${k}`);
  ok(!T.recon_findings.some(f => f.tx === hx('e') && f.kind === 'missing_credit') && T.recon_findings.some(f => f.kind === 'burst'), 'older payments are not accused of a missing credit, and bursts are flagged');
  ok(!T.payment_intents.some(i => i.tx === hx('d')) && !T.recon_findings.some(f => f.tx === hx('d')), 'a made-up transaction hash is dropped');
  ok(T.recon_findings.every(f => f.action && f.tx && f.severity), 'every finding has a reference, severity and advice');
  ok(JSON.stringify(T.islands.map(i => [i.state.gems, i.state.dust])) === gBefore, 'the check never changes anyone\'s Gems');
  const count = T.recon_findings.length;
  await runReconcile(); await runReconcile();
  ok(T.recon_findings.length === count && JSON.stringify(T.islands.map(i => [i.state.gems, i.state.dust])) === gBefore && T.recon_runs.length === 4, 'running the check again adds nothing');
  // a chain outage must not hide problems
  const gb = chain.client.getBlockNumber; chain.client.getBlockNumber = async () => { throw new Error('rpc down'); };
  const open0 = T.recon_findings.filter(f => f.status === 'open').length;
  run = await runReconcile();
  ok(run.partial && T.recon_findings.filter(f => f.status === 'open').length >= open0 - 0 && T.errors.some(e => e.code === 'reconcile_partial'), 'a chain outage is reported and clears nothing');
  chain.client.getBlockNumber = gb;
  // recovery, by the owner only
  process.env.ADMIN_ADDRESSES = '0x00000000000000000000000000000000000000ee';
  const Boss = await mk('BossOwner'); T.players.find(p => p.id === Boss.id).address = process.env.ADMIN_ADDRESSES; Boss.address = process.env.ADMIN_ADDRESSES;
  const key = `${hx('2')}:missing_credit`;
  for (const op of ['recon', 'recon_run', 'recon_fix', 'recon_mark', 'errors', 'error_done']) ok((await hit(admin, Q, { op, key })).code === 403, `players cannot use admin ${op}`);
  ok((await hit(admin, Boss, { op: 'recon' })).body.findings.length > 0 && (await hit(admin, Boss, { op: 'errors' })).body.errors.length > 0, 'the owner sees findings and errors');
  const gQ = isl(Q).state.gems;
  const fixes = await Promise.all([hit(admin, Boss, { op: 'recon_fix', key }), hit(admin, Boss, { op: 'recon_fix', key })]);
  ok(fixes.every(f => f.code === 200) && isl(Q).state.gems === gQ + 50 && isl(Q).state.paid[hx('2')].g === 50, 'two presses of Credit Gems credit once');
  ok((await hit(admin, Boss, { op: 'recon_fix', key })).body.already === true && isl(Q).state.gems === gQ + 50, 'pressing it again adds nothing');
  ok((await hit(admin, Boss, { op: 'recon_fix', key: `${hx('6')}:chain_failed` })).code === 400, 'only safe problems have a button');
  const gO = isl(Other).state.gems;
  ok((await hit(admin, Boss, { op: 'recon_fix', key: `${hx('c')}:unclaimed_payment` })).body.ok && isl(Other).state.gems === gO + 50, 'a payment the browser lost is credited after a fresh check');
  ok((await hit(gems, Other, { op: 'claim', tx: hx('c'), pack: 'pouch' })).code === 409 && isl(Other).state.gems === gO + 50, 'the player cannot then claim it again');
  await runReconcile();
  ok(T.recon_findings.find(f => f.key === `${hx('2')}:missing_credit`).status !== 'open', 'a fixed problem stays closed');
  T.errors.length = 0;
  ok((await hit(cron, null, null, { method: 'GET', auth: 'Bearer x' })).code === 503, 'the daily check refuses to run without its secret set');
  process.env.CRON_SECRET = 'cron-secret-value';
  ok((await hit(cron, null, null, { method: 'GET', auth: 'Bearer wrong-secret-value' })).code === 401, 'a wrong secret cannot start the check');
  ok((await hit(cron, null, null, { method: 'GET', auth: 'Bearer cron-secret-value' })).code === 200, 'the right secret starts the check');
  delete process.env.CRON_SECRET;
  const noIsl = await mk('NoIsland'); T.islands.splice(T.islands.findIndex(i => i.player_id === noIsl.id), 1);
  ok((await creditGems(noIsl.id, hx('f'), 50)).noIsland, 'credit with no island adds nothing and says so');

  // bots
  const human = await mk('HumanDuel'), m = await startMatch({ player: human, minds: [1] }, null, { ranked: true, botLevel: 'hard' }), v = await getView(m.id, human.id);
  ok(/^BOT · /.test(v.view.rival.name) && v.vsBot === true, 'a bot rival is labelled by the server');
  ok(['BOT', 'bot_x', 'B0T_1', 'Bots4Life', 'botty'].every(x => checkName(x)), 'players cannot take a name that looks like a bot label');
  ok(!checkName('Abbot_9') && !checkName('Robot99'), 'ordinary names with those letters inside are fine');
  ok(/·/.test('BOT · x') && checkName('BOT · x'), 'the label character cannot be typed into a name');
  const hist = await hit(player, null, null, { method: 'GET', query: { id: human.id }, auth: '' });
  await forfeit(m.id, human.id);
  const hist2 = await hit(player, null, null, { method: 'GET', query: { id: human.id }, auth: '' });
  ok(hist.code === 200 && hist2.code === 200, 'profiles still load');
  const mc = chain.client.multicall; chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'failure' }));
  const Rd = await mk('RaidHuman'); Object.assign(isl(Rd).state.inv, { troop_brawler: 10 });
  const rnd = Math.random; Math.random = () => 0.99;   // always a game village, not a real target
  const f1 = await hit(raid, Rd, { op: 'find', army: { brawler: 4 } });
  Math.random = rnd;
  ok(f1.code === 200 && f1.body.bot === true && /^BOT · /.test(f1.body.name) && !T.players.some(p => p.name === f1.body.name), 'a game village is labelled as a bot');
  chain.client.multicall = mc;
  const { npcRaid } = await import('../lib/raiders.js');
  const Nr = await mk('NpcTarget', { dust: 3000 }); isl(Nr).state.npcAt = Date.now() - 30 * 3600e3; for (let i = 0; i < 4; i++) isl(Nr).state.b.push({ id: 90 + i, type: 'lamp', k: 1 });
  await hit(island, Nr, { acts: [] });
  ok(/^BOT · /.test(isl(Nr).state.raidLog?.[0]?.by || ''), 'a raider in your log is labelled as a bot');
  void npcRaid; void RD;

  // the cup must stay hard: only a rare plan may clear a whole village
  const { CUP_ARMY, CUP_LEVEL } = await import('../lib/routes/cup.js');
  let clears = 0, runs = 0;
  for (const seedV of [11, 22, 33, 44]) {
    const army = { troops: { ...CUP_ARMY }, hero: 'captain' }, snap = { ...RD.botVillage(seedV * 2654435761 >>> 0, CUP_LEVEL), noise: seedV + 1 }, S = RD.createRaid(RD.publicSnap(snap), army), sp = [];
    for (let k = 0; k < 64 * 48; k++) if (RD.dropOk(S, k)) sp.push(k);
    for (let i = 0; i < 25; i++) { const k = sp[(i * 131 + 7) % sp.length], inp = [{ t: 0, drop: 'hero', k }]; let t = 2; for (const [d, c] of Object.entries(S.left)) for (let j = 0; j < c; j++) inp.push({ t: t += 2, drop: d, k }); runs++; if (RD.replay(snap, army, inp).stars === 3) clears++; }
  }
  ok(clears / runs < 0.15, `the Siege Cup stays hard: ${clears} of ${runs} simple plans cleared it`);

  // legal pages
  const terms = fs.readFileSync('web/terms.html', 'utf8'), priv = fs.readFileSync('web/privacy.html', 'utf8'), idx = fs.readFileSync('web/index.html', 'utf8');
  ok(/no cash value/.test(terms) && /Draft/.test(terms) && /Draft/.test(priv), 'the pages state what Gems are, and that they are drafts');
  ok((idx.match(/href="terms\.html"/g) || []).length >= 2 && (idx.match(/href="privacy\.html"/g) || []).length >= 2, 'terms and privacy are linked from sign-in and Settings');
  ok(!/complies with|fully compliant|GDPR compliant|guarantee/i.test(terms + priv), 'the pages make no compliance promises');
  const crons = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).crons;
  ok(crons?.[0]?.path === '/api/cron/reconcile', 'the daily check is scheduled');
}
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
