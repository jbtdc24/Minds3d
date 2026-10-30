// Load, failure and memory test on the real server code, with a stand-in database that behaves like the real one on timing:
// each database call waits a set time, and failures can be injected. It measures OUR server's limits and counts database
// calls per request. It does NOT prove what Supabase or Vercel can carry: that needs a separate test project.
// Run: node --expose-gc tools/load_test.mjs
process.env.SUPABASE_SECRET_KEY = 'test-secret'; process.env.TREASURY_ADDRESS = '0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37';
import { randomUUID } from 'node:crypto';
const { db } = await import('../lib/db.js'), { signSession } = await import('../lib/auth.js');
const LAT = +process.env.DB_MS || 25;
let dbCalls = 0, failRate = 0, slowRate = 0;
const T = new Proxy({}, { get: (o, k) => (o[k] ||= []) });
const parse = q => { const f = []; for (const part of q.split('&').filter(Boolean)) { const [k, v = ''] = part.split(/=(.*)/s); if (['limit', 'order', 'select', 'or'].includes(k)) continue; const [op, ...r] = v.split('.'), val = decodeURIComponent(r.join('.')); if (op === 'eq') f.push(x => String(x[k]) === val); else if (op === 'neq') f.push(x => String(x[k]) !== val); else if (op === 'is') f.push(x => x[k] == null); } return x => f.every(fn => fn(x)); };
const clone = x => JSON.parse(JSON.stringify(x));
const wait = async () => { dbCalls++; if (Math.random() < failRate) throw Object.assign(new Error('db down'), { status: 500, body: 'timeout' }); await new Promise(r => setTimeout(r, Math.random() < slowRate ? LAT * 40 : LAT)); };
const idx = new Map();   // players and islands are looked up by key, like an indexed table
const find = (t, q) => { const m = /^(id|player_id)=eq\.([0-9a-f-]{36})/.exec(q); if (m) { const hit = idx.get(t + m[2]); return hit ? (parse(q)(hit) ? [hit] : []) : []; } return T[t].filter(parse(q)); };
db.select = async (t, q = '') => { await wait(); return clone(find(t, q).slice(0, 80)); };
db.one = async (t, q) => { await wait(); return clone(find(t, q)[0] || null); };
db.insert = async (t, row) => { await wait(); const r = { id: randomUUID(), created_at: new Date().toISOString(), version: 0, ...row }; T[t].push(r); return clone(r); };
db.update = async (t, q, p) => { await wait(); const rows = find(t, q); rows.forEach(r => Object.assign(r, clone(p))); return clone(rows); };
db.remove = async (t, q) => { await wait(); return []; };
db.upsert = async (t, row) => { await wait(); const ex = idx.get(t + row.player_id); if (ex) Object.assign(ex, row); else { T[t].push({ ...row }); idx.set(t + row.player_id, T[t].at(-1)); } return clone(row); };
db.rpc = async () => { await wait(); return true; }; db.count = async () => { await wait(); return 1; };
const chain = await import('../lib/chain.js'); chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'failure' }));
const R = await import('../web/src/island/rules.js'), AV = await import('../web/src/island/adventure.js');
const load = n => import(`../lib/routes/${n}.js`).then(m => m.default);
const [island, town, raid, adventure, messages] = await Promise.all(['island', 'town', 'raid', 'adventure', 'messages'].map(load));
const people = [];
function addPlayers(n) {
  for (let i = people.length, end = i + n; i < end; i++) {
    const p = { id: randomUUID(), name: 'P' + i, name_key: 'p' + i, address: '0x' + String(i + 1).padStart(40, '0'), rating: 1000, points: 0, last_seen: new Date().toISOString() };
    T.players.push(p); idx.set('players' + p.id, p);
    const st = R.newIsland(i + 5, Date.now()); st.dust = 1e6; st.inv.troop_brawler = 60;
    const row = { player_id: p.id, seed: i + 5, state: st, minds: 0, minds_at: new Date().toISOString(), rev: 0, updated_at: new Date().toISOString() };
    T.islands.push(row); idx.set('islands' + p.id, row);
    people.push({ ...p, tok: signSession({ id: p.id, address: p.address }) });
  }
}
const call = (fn, p, body) => new Promise(done => { const t0 = performance.now(), res = { statusCode: 200, headersSent: false, setHeader() {}, end(t) { done({ code: this.statusCode, ms: performance.now() - t0, t }); } }; fn({ method: 'POST', url: '/api/x', headers: { authorization: 'Bearer ' + p.tok, 'x-forwarded-for': '1.2.3.4' }, body, query: {} }, res).catch(e => done({ code: 599, ms: 0, t: e.message })); });
const pct = (a, q) => (a.length ? Math.round(a.slice().sort((x, y) => x - y)[Math.floor(a.length * q)]) : 0);
async function perCall(name, fn, p, body) { const d0 = dbCalls, r = await call(fn, p, body); console.log(name.padEnd(26), 'db calls', String(dbCalls - d0).padEnd(3), 'time', Math.round(r.ms) + ' ms', 'code', r.code); }
console.log(`stand-in database delay ${LAT} ms per call\n-- one request --`);
addPlayers(2);
await perCall('island load', island, people[0], { acts: [] });
await perCall('island 40 actions', island, people[0], { acts: Array.from({ length: 40 }, () => ({ type: 'buy', item: 'seed_bean', n: 1 })) });
await perCall('town beat', town, people[0], { x: 5, y: 5, mind: 1 });
await perCall('town chat', town, people[0], { x: 5, y: 5, mind: 1, say: 'hi' });
await perCall('raid find', raid, people[0], { op: 'find', army: { brawler: 6 } });
await perCall('adventure start', adventure, people[1], { op: 'start', spot: 0 });
T.islands.find(i => i.player_id === people[1].id).state.adv.at = Date.now() - 170e3;
await perCall('adventure full replay', adventure, people[1], { op: 'end', inputs: [{ t: 0, go: 900 }], end: 3400 });
// a realistic mix: every player does something every few seconds
async function wave(n, secs) {
  if (people.length < n) addPlayers(n - people.length);
  const lat = [], until = Date.now() + secs * 1000, c = {}; let done = 0;
  await Promise.all(people.slice(0, n).map(async p => {
    await new Promise(r => setTimeout(r, Math.random() * 3000));
    while (Date.now() < until) {
      const x = Math.random(), r = x < 0.5 ? await call(town, p, { x: 5, y: 5, mind: 1 }) : x < 0.9 ? await call(island, p, { acts: [{ type: 'buy', item: 'seed_bean', n: 1 }] }) : await call(messages, p, { to: 'x' });
      lat.push(r.ms); c[r.code] = (c[r.code] || 0) + 1; done++;
      await new Promise(rr => setTimeout(rr, 2000 + Math.random() * 3000));
    }
  }));
  console.log(String(n).padStart(5), 'players', String(Math.round(done / secs)).padStart(5), 'req/s  p50', pct(lat, 0.5), 'ms  p95', pct(lat, 0.95), 'ms  p99', pct(lat, 0.99), 'ms ', JSON.stringify(c));
}
console.log('-- growing crowd, in one process --');
for (const n of [50, 200, 500, 1000, 2000]) await wave(n, 10);
console.log('-- failures --');
failRate = 0.1; await wave(200, 6); failRate = 0;
const ok = T.islands.every(i => Number.isFinite(i.state.dust) && i.state.dust >= 0);
console.log('10% database failures: island values valid =', ok);
slowRate = 0.05; await wave(200, 6); slowRate = 0;
console.log('-- memory: 30,000 requests --');
global.gc?.(); const m0 = process.memoryUsage().heapUsed;
for (let i = 0; i < 300; i++) await Promise.all(Array.from({ length: 100 }, (_, k) => call(town, people[k], { x: 5, y: 5, mind: 1 })));
global.gc?.(); const m1 = process.memoryUsage().heapUsed;
console.log('heap', Math.round(m0 / 1e6), 'MB to', Math.round(m1 / 1e6), 'MB');
process.exit(0);
