// Server logic test with an in-memory database (no Supabase needed). Run: node tools/test_server.mjs
process.env.SUPABASE_SECRET_KEY = 'test-secret';
const { db } = await import('../lib/db.js');
const { signSession, readSession, loginMessage, checkSignature, checkName } = await import('../lib/auth.js');
const { startMatch, act, getView, forfeit, chatLine } = await import('../lib/game.js');
const { privateKeyToAccount } = await import('viem/accounts');
import { randomUUID } from 'node:crypto';

// ---- tiny PostgREST-ish in-memory db ----
const T = { players: [], matches: [], queue: [], nonces: [], ratelimit: [] };
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
let v = await getView(m.id, A.id), turns = 0;
ok(v.view.rival.locked === true, 'bot locks in right away');
ok(!JSON.stringify(v).includes('"pending"') && !('play' in v.view.rival), 'hidden picks never sent to the client');
while (v.status === 'live' && turns < 60) {
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
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
