// Server logic test with an in-memory database (no Supabase needed). Run: node tools/test_server.mjs
process.env.SUPABASE_SECRET_KEY = 'test-secret';
const { db } = await import('../lib/db.js');
const { signSession, readSession, loginMessage, checkSignature, checkName } = await import('../lib/auth.js');
const { startMatch, act, getView, forfeit } = await import('../lib/game.js');
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
const loadout = ['peek', 'heal', 'freeze', 'overcharge'];
let m = await startMatch({ player: A, minds: [1, 2], loadout }, null, { ranked: true, botLevel: 'normal' });
let v = await getView(m.id, A.id), turns = 0;
ok(v.view.rival.locked === true, 'bot locks in right away');
ok(JSON.stringify(v).includes('"pending"') === false, 'hidden picks never sent to the client');
while (v.status === 'live' && turns < 200) {
  const moves = v.view.allowed;
  v = await act(m.id, A.id, { move: moves[turns % moves.length] });
  turns++;
}
ok(v.status === 'done', `bot match finishes (${turns} turns)`);
const A2 = await db.one('players', `id=eq.${A.id}`);
ok(A2.bot_wins + A2.bot_losses === 1 && A2.wins + A2.losses === 0, 'bot result recorded separately');
ok(Math.abs(A2.rating - 1000) <= 16, `vs-bot rating change is halved (${A2.rating})`);
// errors
let err = null;
try { await act(m.id, A.id, { move: 'strike' }); } catch (e) { err = e.message; }
ok(err === 'match is over', 'cannot act after the match ends');

// ---- PvP match, cheating attempts ----
const B = await db.insert('players', { name: 'Bob', name_key: 'bob', address: '0x000000000000000000000000000000000000dEaD' });
const C = await db.insert('players', { name: 'Eve', name_key: 'eve', address: '0x000000000000000000000000000000000000bEEF' });
m = await startMatch({ player: A, minds: [1], loadout }, { player: B, minds: [5, 6, 7], loadout: ['counter', 'chaos', 'drain', 'mirror'] }, { ranked: true });
err = null; try { await getView(m.id, C.id); } catch (e) { err = e.status; }
ok(err === 403, 'outsider cannot view a match');
err = null; try { await act(m.id, A.id, { move: 'laser' }); } catch (e) { err = e.message; }
ok(err === 'pick strike, guard or trick', 'invalid move rejected');
err = null; try { await act(m.id, A.id, { move: 'strike', skill: 'counter', target: 'guard' }); } catch (e) { err = e.message; }
ok(err === 'skill not in your loadout', 'skill outside loadout rejected');
err = null; try { await act(m.id, A.id, { move: 'strike', skill: 'overcharge' }); } catch (e) { err = e.message; }
ok(err === 'not enough Focus', 'skill without Focus rejected');
v = await act(m.id, A.id, { move: 'strike' });
ok(v.view.me.locked && !v.view.lastEvent, 'first lock waits for the rival');
const bView = await getView(m.id, B.id);
ok(bView.view.rival.locked === true && !JSON.stringify(bView).includes('"pending"') && !('move' in bView.view.rival), "rival can't see Alice's locked move");
err = null; try { await act(m.id, A.id, { move: 'guard' }); } catch (e) { err = e.message; }
ok(err === 'already locked in', 'cannot change a locked move');
v = await act(m.id, B.id, { move: 'guard' });
ok(v.view.lastEvent?.win === 1, 'guard beats strike resolved on the server');
// play it out
let n = 0;
while (v.status === 'live' && n < 300) {
  const a = await getView(m.id, A.id), b = await getView(m.id, B.id);
  if (!a.view.me.locked && !a.view.mustWait) await act(m.id, A.id, { move: a.view.allowed[n % a.view.allowed.length] });
  else if (!b.view.me.locked) v = await act(m.id, B.id, { move: b.view.allowed[(n * 7 + 1) % b.view.allowed.length] });
  v = await getView(m.id, A.id); n++;
}
ok(v.status === 'done', 'PvP match finishes');
const [Af, Bf] = await Promise.all([db.one('players', `id=eq.${A.id}`), db.one('players', `id=eq.${B.id}`)]);
ok(Af.wins + Af.losses + Af.draws === 1 && Bf.wins + Bf.losses + Bf.draws === 1, 'PvP result recorded for both');
ok(Af.rating + Bf.rating === A2.rating + 1000 || v.winner === null, `Elo is zero-sum (${Af.rating}+${Bf.rating})`);
// timeouts -> auto move, 3 idles -> forfeit
m = await startMatch({ player: A, minds: [1], loadout }, { player: B, minds: [5], loadout }, { ranked: true });
for (let k = 0; k < 3; k++) {
  T.matches.find(x => x.id === m.id).deadline = new Date(Date.now() - 1000).toISOString();
  await act(m.id, B.id, { move: 'trick' }).catch(() => {});
  v = await getView(m.id, B.id);
}
ok(v.status === 'abandoned' && v.winner === v.seat, 'idle player forfeits after 3 timeouts');
// forfeit
m = await startMatch({ player: A, minds: [1], loadout }, null, { ranked: false, botLevel: 'easy' });
v = await forfeit(m.id, A.id);
ok(v.status === 'abandoned' && v.winner === 1, 'forfeit works');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
