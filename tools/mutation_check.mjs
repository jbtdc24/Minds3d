// Do the tests really catch these bugs? Each fix is undone, one at a time, in a throwaway copy, and the suite must fail.
// Run: node tools/mutation_check.mjs
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TMP = '.mutants';
const M = [
  ['build timer skip', 'web/src/island/rules.js', "      if (b.done) return { error: 'Finish building it before you store it.' };\n", ''],
  ['AI spends Gems on decorations', 'lib/routes/agent.js', " || (a?.type === 'build' && BUILD[a.item]?.cost?.gems)", ''],
  ['raid snapshot in island data', 'lib/routes/island.js', 'const { raid: _secret, ...shown } = st;', 'const shown = st;'],
  ['traps sent to the raider', 'lib/routes/raid.js', 'snap: publicSnap(raid.snap), loot:', 'snap: raid.snap, loot:'],
  ['traps sent in the cup', 'lib/routes/cup.js', 'snap: publicSnap(village(cup, mine.tries))', 'snap: village(cup, mine.tries)'],
  ['one cup try scored twice', 'lib/routes/cup.js', "    if (!open.length) fail(400, 'That try has ended.');\n", ''],
  ['same cup village each try', 'lib/routes/cup.js', '(Number(cup.seed) + attempt * 2654435761) >>> 0', 'Number(cup.seed) >>> 0'],
  ['guessable cup seed', 'lib/routes/cup.js', "hashStr('cup' + day + (process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || ''))", "hashStr('cup' + day)"],
  ['cup with no scores keeps Gems', 'lib/routes/cup.js', 'if (entries.length < 2 || !ranked.length)', 'if (entries.length < 2)'],
  ['cup timing check', 'lib/routes/cup.js', "fail(400, 'That try did not add up.'); }", '}'],
  ['payment swallowed when busy', 'lib/routes/gems.js', "  await db.remove('payments', `tx=eq.${hash}`);\n  await report({ feature: 'payments'", "  await report({ feature: 'payments'"],
  ['too few confirmations', 'lib/routes/gems.js', 'const CONFIRMATIONS = 6n;', 'const CONFIRMATIONS = 2n;'],
  ['Town Time paid twice', 'lib/routes/town.js', 'if (claimed.length) got = await reward(', 'got = await reward('],
  ['client decides Town activity', 'lib/routes/town.js', 'acted = !!say || (was && Math.hypot(x - was.x, y - was.y) >= MOVED);', 'acted = !!say || !!body.active || (was && Math.hypot(x - was.x, y - was.y) >= MOVED);'],
  ['raid paid twice', 'lib/routes/raid.js', "    if (!row) fail(409, 'your island is busy, try again');\n    let loot = 0;", '    row ||= mine;\n    let loot = 0;'],
  ['endless Dust from one account', 'lib/routes/raid.js', 'const PAIR_PER_DAY = 2,', 'const PAIR_PER_DAY = 99,'],
  ['no daily ceiling on stolen Dust', 'lib/routes/raid.js', 'raid.loot = Math.min(raid.loot, lootLeft);', ''],
  ['same-connection raid pays', 'lib/routes/raid.js', '< PAIR_PER_DAY && state?.dk !== dev', '< PAIR_PER_DAY'],
  ['duel paid twice', 'lib/game.js', "  if (!first.length) throw httpError(409, 'busy, try again');\n", ''],
  ['walking away escapes a loss', 'lib/matchmaking.js', 'await forfeit(m.id, pid).catch(() => {}); continue;', ''],
  ['adventure trusts claims', 'lib/routes/adventure.js', 'const loot = advLoot(map, S.got, S.beat);', 'const loot = advLoot(map, body.got || S.got, body.beat || S.beat);'],
  ['adventure faster than real time', 'lib/routes/adventure.js', 'if (end * STEP > secs + 5) {', 'if (false) {'],
  ['secret cup roll sent to the browser', 'web/src/island/raid.js', 'export const publicSnap = ({ noise, ...s }) => ({ ...s,', 'export const publicSnap = s => ({ ...s,'],
  ['secret roll does nothing', 'web/src/island/raid.js', 'if (S.nz) {', 'if (false) {'],
  ['trial accounts speak', 'web/src/chatsign.js', ' || (who.guest && !presence)', ''],
  ['login challenge can be replaced', 'lib/routes/auth_nonce.js', 'if (open && Date.now() - new Date(open.created_at) < NONCE_MS) return', 'if (false) return'],
  ['bad signature cancels login', 'lib/routes/auth_verify.js', "  if (!ok) fail(401, 'signature did not match this wallet');", "  if (!ok) { await db.remove('nonces', `address=eq.${address}`); fail(401, 'signature did not match this wallet'); }"],
  ['logout does nothing', 'lib/http.js', "if (after && (session.iat || 0) < after) return send(res, 401, { error: 'please sign in again' }); ", ''],
  ['forged chat certificate', 'web/src/chatsign.js', 'if (!(await crypto.subtle.verify(SIG, serverKey, unb64(m.cert.sig), enc.encode(m.cert.body)))) return null;', ''],
  ['forged chat words', 'web/src/chatsign.js', 'if (!(await crypto.subtle.verify(SIG, who.key, unb64(m.sig), line(topic, m.ts, m.n, m.body)))) return null;', ''],
  ['chat replay', 'web/src/chatsign.js', 'if (!presence && seen.has(id)) return null;', ''],
  ['stale chat', 'web/src/chatsign.js', ' || Math.abs(now() - m.ts) > MAX_AGE', ''],
  ['reading others\' mail', 'lib/routes/mail.js', 'if (!m || (m.to_id && m.to_id !== p.id))', 'if (!m)'],
  ['anyone sends mail', 'lib/routes/admin.js', "if (!isAdmin(me)) fail(403, 'not allowed');", ''],
  ['strangers can message', 'lib/routes/messages.js', "if (!(await friends(session.pid, body.to))) fail(403, 'you can only chat with friends');", ''],
  ['outsider plays your match', 'lib/game.js', "    if (seat < 0) throw httpError(403, 'not your match');\n    if (r.status !== 'live') throw httpError(400, 'match is over');", "    if (r.status !== 'live') throw httpError(400, 'match is over');"],
  ['bot takes a real name', 'lib/names.js', "if (!(await db.one('players', `name_key=eq.${encodeURIComponent(name.toLowerCase())}&select=id`))) return name;", 'return name;'],
  ['no ledger mark', 'lib/routes/gems.js', "    (st.paid ||= {})[hash] = { g: gems, at: Date.now() };\n", ''],
  ['credit button pays twice', 'lib/routes/gems.js', "    if (st.paid?.[hash]) return { already: true, gems: st.gems || 0 };\n", ''],
  ['check closes problems during an outage', 'lib/reconcile.js', 'if (!partial) for (const o of open)', 'for (const o of open)'],
  ['anyone starts the daily check', 'lib/routes/cron_reconcile.js', "if (a.length !== b.length || !timingSafeEqual(a, b)) fail(401, 'not allowed');", ''],
  ['daily check runs with no secret', 'lib/routes/cron_reconcile.js', "if (!want) fail(503, 'daily check is not set up');", ''],
  ['wallets reach the error log', 'lib/monitor.js', ".replace(/0x[a-fA-F0-9]{40}/g, '[wallet]')", ''],
  ['tokens reach the error log', 'lib/monitor.js', ".replace(/Bearer\s+\S+/gi, 'Bearer [hidden]')", ''],
  ['alerts repeat without limit', 'lib/monitor.js', "if (severity === 'critical' && now - (alerted.get(f) || 0) > ALERT_GAP_MS) {", "if (severity === 'critical') {"],
  ['failures not logged', 'lib/http.js', 'if (!setup && status === 500) await', 'if (false) await'],
  ['players can use payment admin', 'lib/routes/admin.js', "case 'recon_fix': {", "case 'recon_fix_off': {"],
  ['ranked bot revealed to the client', 'lib/game.js', 'vsBot: !row.p1 && !!row.state.practice, botLevel:', 'vsBot: !row.p1, botLevel:'],
  ['prototype lookups', 'web/src/island/rules.js', 'for (const table of [CROPS, BUILD, SHOP, RECIPES, RAW, UPGRADABLE]) Object.setPrototypeOf(table, null);\n', ''],
];
const only = process.argv[2];
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP);
for (const d of ['lib', 'api', 'web/src', 'tools', 'supabase']) cpSync(d, `${TMP}/${d}`, { recursive: true, filter: f => !f.includes('assets') });
cpSync('package.json', `${TMP}/package.json`); cpSync('vercel.json', `${TMP}/vercel.json`); for (const f of ['terms.html', 'privacy.html', 'index.html']) cpSync(`web/${f}`, `${TMP}/web/${f}`);
const run = () => { const r = spawnSync('node', ['tools/test_server.mjs'], { cwd: TMP, encoding: 'utf8', timeout: 60000 }); const m = /(\d+) passed, (\d+) failed/.exec(r.stdout || ''); return { fails: m ? +m[2] : -1, crashed: !m, first: (r.stdout || '').split('\n').find(l => l.startsWith('FAIL')) || (r.stderr || '').split('\n').find(l => /Error/.test(l)) || '' }; };
const base = run();
console.log('baseline failures:', base.fails);
if (base.fails !== 0) { console.log('BASELINE NOT CLEAN: results would mean nothing'); process.exit(2); }
let missed = 0;
for (const [name, file, from, to] of M) {
  if (only && !name.includes(only)) continue;
  const p = `${TMP}/${file}`, src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  if (!src.includes(from)) { console.log('SKIPPED (text not found)', name); missed++; continue; }
  writeFileSync(p, src.replace(from, to));
  const r = run();
  const caught = r.fails > 0 || r.first.startsWith('FAIL');   // a bare crash is not a catch: a named test must fail
  if (!caught) missed++;
  console.log(caught ? 'CAUGHT' : 'MISSED', name, '→', r.first.slice(0, 80));
  writeFileSync(p, src);
}
rmSync(TMP, { recursive: true, force: true });
console.log(missed ? `${missed} NOT CAUGHT` : 'all reintroduced bugs were caught');
process.exit(missed ? 1 : 0);
