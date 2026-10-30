// Hostile-input and race testing on the in-memory database. Run: node tools/fuzz_server.mjs [rounds]
// Every route gets malformed bodies from every kind of caller. Pass = no 500s, no crashes, no value invented from nothing.
process.env.SUPABASE_SECRET_KEY = 'test-secret'; process.env.ADMIN_ADDRESSES = '0x00000000000000000000000000000000000000ad';
const ROUNDS = +process.argv[2] || 400;
import { randomUUID } from 'node:crypto';
const { db } = await import('../lib/db.js');
const { signSession } = await import('../lib/auth.js');
const T = new Proxy({}, { get: (o, k) => (o[k] ||= []) });
const parse = q => {
  const f = [];
  for (const part of q.split('&').filter(Boolean)) {
    const [k, v = ''] = part.split(/=(.*)/s);
    if (['limit', 'order', 'select'].includes(k) || k === 'or') continue;
    const [op, ...rest] = v.split('.'), val = decodeURIComponent(rest.join('.'));
    if (op === 'eq') f.push(r => String(r[k]) === val);
    else if (op === 'neq') f.push(r => String(r[k]) !== val);
    else if (op === 'is') f.push(r => r[k] == null);
    else if (op === 'in') { const s = val.slice(1, -1).split(','); f.push(r => s.includes(String(r[k]))); }
  }
  return r => f.every(fn => fn(r));
};
const clone = x => JSON.parse(JSON.stringify(x));
db.select = async (t, q = '') => clone(T[t].filter(parse(q)));
db.one = async (t, q) => clone(T[t].find(parse(q)) || null);
db.insert = async (t, row) => { const r = { id: randomUUID(), created_at: new Date().toISOString(), version: 0, rating: 1000, points: 0, wins: 0, losses: 0, draws: 0, bot_wins: 0, bot_losses: 0, streak: 0, best_streak: 0, tries: 0, best: 0, stars: 0, pct: 0, ...row }; T[t].push(r); return clone(r); };
db.update = async (t, q, patch) => { const rows = T[t].filter(parse(q)); rows.forEach(r => Object.assign(r, clone(patch))); return clone(rows); };
db.remove = async (t, q) => { const keep = T[t].filter(r => !parse(q)(r)); T[t].length = 0; T[t].push(...keep); return []; };
db.upsert = async (t, row) => { const k = t === 'nonces' ? 'address' : 'player_id', ex = T[t].find(r => r[k] === row[k]); if (ex) Object.assign(ex, row); else T[t].push({ ...row }); return clone(row); };
db.rpc = async () => true; db.count = async (t, q = '') => T[t].filter(parse(q)).length;

const chain = await import('../lib/chain.js');
chain.client.multicall = async ({ contracts }) => contracts.map(() => ({ status: 'failure' }));
const R = await import('../web/src/island/rules.js');
const names = ['me', 'profile', 'queue_join', 'queue_poll', 'queue_leave', 'match_view', 'match_act', 'match_forfeit', 'match_chat', 'leaderboard', 'player', 'friends', 'friend', 'messages', 'island', 'raid', 'adventure', 'admin', 'gems', 'energy', 'mail', 'report', 'cup', 'town', 'agent', 'chat_cert', 'auth_nonce', 'auth_guest', 'auth_verify'];
const routes = Object.fromEntries(await Promise.all(names.map(async n => [n, (await import(`../lib/routes/${n}.js`)).default])));
routes.agent_keys = (await import('../lib/routes/agent.js')).agentKeys;

const mk = async (name, address, is_guest = false) => {
  const p = await db.insert('players', { name, name_key: name.toLowerCase(), address, is_guest, showcase: [] });
  const st = R.newIsland(T.islands.length + 3, Date.now()); st.dust = 5000; st.gems = 50;
  T.islands.push({ player_id: p.id, seed: T.islands.length + 3, state: st, minds: 1, minds_at: new Date().toISOString(), rev: 0, updated_at: new Date().toISOString() });
  return p;
};
const P = await mk('Plain', '0x' + '1'.repeat(40)), G = await mk('Trial', null, true), A = await mk('Admin', '0x00000000000000000000000000000000000000ad');
const tokens = [signSession({ id: P.id, address: P.address }), signSession({ id: G.id, is_guest: true }), signSession({ id: A.id, address: A.address }), signSession({ id: P.id, address: P.address }, { agent: true }), 'garbage', '', 'a.b', 'mk_nope'];
let seed = 12345;
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const WEIRD = [null, undefined, 0, -1, 1, 1.5, NaN, 1e308, -1e308, 2 ** 53, '', ' ', 'x', 'constructor', '__proto__', 'toString', "' OR 1=1 --", '1&id=neq.0', '<img src=x onerror=1>', '%00', '../../etc/passwd', 'a'.repeat(5000), true, false, [], [[]], [null], {}, { a: 1 }, { __proto__: null }, new Array(300).fill(1), P.id, '0x' + 'a'.repeat(64), '🤖'];
const pick = () => WEIRD[rnd(WEIRD.length)];
const OPS = ['find', 'attack', 'start', 'end', 'auto', 'map', 'claim', 'join', 'score', 'info', 'new', 'off', 'gems', 'list', 'give', 'ban', 'unban', 'mail', 'stats', 'reports', 'add', 'accept', 'remove', 'state', 'do', 'job', 'raid', 'adventure', 'duel_join', 'help'];
const TYPES = ['clear', 'till', 'untill', 'plant', 'harvest', 'buy', 'sell', 'build', 'move', 'store', 'place', 'demolish', 'craft', 'shop', 'ship', 'rush', 'upgrade', 'well', 'tutorial', 'job'];
const KEYS = ['op', 'id', 'to', 'text', 'phrase', 'name', 'pfp', 'showcase', 'minds', 'mode', 'bot', 'army', 'inputs', 'claim', 'revenge', 'spot', 'potions', 'mind', 'pay', 'got', 'beat', 'cover', 'ko', 'potionsLeft', 'tx', 'pack', 'pid', 'q', 'dust', 'items', 'hours', 'title', 'body', 'gift', 'kind', 'target', 'place', 'x', 'y', 'say', 'after', 'pub', 'actions', 'job', 'address', 'signature', 'card', 'spell'];
const body = () => {
  const b = { op: OPS[rnd(OPS.length)] };
  for (let i = rnd(6); i > 0; i--) b[KEYS[rnd(KEYS.length)]] = pick();
  if (rnd(3) === 0) b.acts = Array.from({ length: rnd(5) }, () => ({ type: rnd(4) ? TYPES[rnd(TYPES.length)] : pick(), item: pick(), crop: pick(), tiles: pick(), n: pick(), id: pick(), k: pick(), mind: pick(), job: pick(), gems: pick() }));
  return rnd(12) === 0 ? pick() : b;
};
const call = async (fn, tok, b, method) => {
  let o = null;
  const res = { statusCode: 200, headersSent: false, setHeader() {}, end(t) { this.headersSent = true; o = { code: this.statusCode, t }; } };
  await fn({ method, url: '/api/x', headers: { authorization: 'Bearer ' + tok, 'x-forwarded-for': '2.2.2.' + rnd(9) }, body: b, query: { id: rnd(2) ? pick() : P.id, with: pick(), by: pick() } }, res);
  return o;
};
process.env.TREASURY_ADDRESS = '0x48C61f0Ca53259938F5B215ECf4f6b5246f3eA37';
const quiet = console.error; const seen = new Map(); console.error = e => { const k = String(e?.stack || e).split('\n').slice(0, 3).join(' | ').slice(0, 240); seen.set(k, (seen.get(k) || 0) + 1); };
let calls = 0; const codes = {}; let crashes = 0;
const list = Object.entries(routes), t0 = Date.now();
for (let i = 0; i < ROUNDS; i++) for (const [name, fn] of list) {
  const tok = tokens[rnd(tokens.length)], method = rnd(5) ? 'POST' : 'GET';
  try { const r = await call(fn, tok, body(), method); calls++; codes[r?.code] = (codes[r?.code] || 0) + 1; if (r?.code === 500) seen.set('500 ' + name, (seen.get('500 ' + name) || 0) + 1); }
  catch (e) { crashes++; seen.set('THROW ' + name + ' ' + e.message.slice(0, 120), 1); }
}
console.error = quiet;
const money = T.islands.map(i => ({ dust: i.state.dust, gems: i.state.gems }));
console.log(JSON.stringify({ calls, ms: Date.now() - t0, codes, crashes, money }));
for (const [k, v] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(v, k);
const bad = T.islands.some(i => !Number.isFinite(i.state.dust) || i.state.dust < 0 || !Number.isFinite(i.state.gems || 0) || i.state.gems < 0 || Object.values(i.state.inv).some(n => !Number.isFinite(n) || n < 0));
console.log(bad ? 'FAIL corrupted island values' : 'OK island values stayed valid');
process.exit(crashes || seen.size || bad ? 1 : 0);
