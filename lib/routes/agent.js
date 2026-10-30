// The Mind Player API: an outside AI plays a player's account with a private key (docs/MIND_API.md).
// Every call goes through the same server routes a human uses, so rules, prices, energy and daily limits are identical.
// An AI can never: move Gems unless the player allowed it, buy with crypto, use admin, chat, change the profile, or enter cups.
import { randomBytes, createHash } from 'node:crypto';
import { route, fail, send } from '../http.js';
import { db } from '../db.js';
import { signSession } from '../auth.js';
import { gen, TW, TH } from '../../web/src/island/gen.js';
import { SHOP, coverAt, DROPS, ripe, wellShards, campCount, campLevels, CROPS, BUILD } from '../../web/src/island/rules.js';
import { JOBS, jobSlots } from '../../web/src/island/jobs.js';
import { raidsPerDay, armyCap, autoPlan, DEFAULT_ARMY } from '../../web/src/island/raid.js';
import { advPerDay, SPOTS } from '../../web/src/island/adventure.js';
import island from './island.js';
import raid from './raid.js';
import adventure from './adventure.js';
import energy from './energy.js';
import queue_join from './queue_join.js';
import queue_poll from './queue_poll.js';
import queue_leave from './queue_leave.js';
import match_view from './match_view.js';
import match_act from './match_act.js';
import match_forfeit from './match_forfeit.js';
import me from './me.js';

const KEYS_MAX = 5, LOG_KEEP = 30, PER_MIN = 120;
const hashOf = k => createHash('sha256').update(k).digest('hex');
const utcDay = () => new Date().toISOString().slice(0, 10);

export const HELP = {
  name: 'MINDS CLASH Mind Player API', docs: 'docs/MIND_API.md', how: 'POST /api/agent with header "authorization: Bearer mk_..." and JSON { "op": "...", ... }',
  ops: {
    state: 'See the island, limits and what can be done now', do: '{ actions: [ { type: "harvest", tiles: [..] } ] } any island action',
    job: '{ mind, job, crop? } give a Mind a job: ' + Object.keys(JOBS).join(', '),
    raid: '{ army?, mind? } one full raid planned and played by the server', raid_find: '{ army, mind } pick a target', raid_attack: '{ id, inputs } play it your way',
    adventure: '{ spot, potions?, mind? } one full adventure run by the server', energy: '{ mind, pay: "shard" | "dust" } refill a Mind',
    duel_join: '{ mode: "ranked" | "classic", minds }', duel_poll: 'wait for a rival', duel_view: '{ id }', duel_act: '{ id, card, spell? }', duel_forfeit: '{ id }',
  },
};

// run one of the normal game routes as the player
function inner(fn, player, method, url, body = {}, query = {}) {
  const token = signSession(player, { agent: true });
  return new Promise((done, no) => {
    const res = { statusCode: 200, headersSent: false, setHeader() {}, end(t) { this.headersSent = true; done({ code: this.statusCode, body: t ? JSON.parse(t) : {} }); } };
    fn({ method, url, headers: { authorization: 'Bearer ' + token }, body, query }, res).catch(no);
  });
}
const must = r => { if (r.code >= 400) fail(r.code, r.body?.error || 'that did not work'); return r.body; };

async function view(player) {
  const data = must(await inner(island, player, 'POST', '/api/island', { acts: [] })), { seed, state: st, minds } = data.island, now = data.now, w = gen(seed);
  const tiles = Object.entries(st.tiles).map(([k, t]) => [+k, t]);
  const wild = [];
  for (let k = 0; k < TW * TH && wild.length < 30; k++) if (w.land[k] && DROPS[coverAt(st, w, k)]) wild.push(k);
  const day = utcDay(), raids = raidsPerDay(minds, campCount(st)) - (st.rd?.day === day ? st.rd.n : 0), advs = advPerDay(minds) - (st.ad?.day === day ? st.ad.n : 0);
  const out = {
    dust: st.dust, gems: st.gems || 0, inv: st.inv, ship: st.ship || 0, minds,
    ripe: tiles.filter(([, t]) => t.s === 'p' && ripe(t, now, minds)).map(([k]) => k), emptyPlots: tiles.filter(([, t]) => t.s === 'p' && !t.c).map(([k]) => k), wild,
    shards: wellShards(st, now), raidsLeft: Math.max(0, raids), adventuresLeft: Math.max(0, advs), armyCap: armyCap(minds, campLevels(st)),
    buildings: (st.b || []).map(b => ({ id: b.id, type: b.type, k: b.k, lv: b.lv || 1, ...(b.done ? { doneAt: b.done } : {}) })),
    jobs: st.jobs || {}, jobSlots: jobSlots(minds), jobLog: (st.jobLog || []).slice(0, 8), raidLog: (st.raidLog || []).slice(0, 5),
    prices: { crops: Object.fromEntries(Object.entries(CROPS).map(([k, c]) => [k, c.seed])), shop: Object.fromEntries(Object.entries(SHOP).filter(([, s]) => !s.gem).map(([k, s]) => [k, s.price])), build: Object.fromEntries(Object.entries(BUILD).filter(([, b]) => !b.fixed).map(([k, b]) => [k, b.cost])) },
    spots: SPOTS.map((s, i) => ({ i, name: s.name, tier: s.tier })), now,
  };
  out.suggest = [out.ripe.length && 'harvest', out.emptyPlots.length && 'plant', out.shards && 'well', out.raidsLeft && 'raid', out.adventuresLeft && 'adventure', Object.keys(out.jobs).length < out.jobSlots && 'job'].filter(Boolean);
  return out;
}

function checkAction(a, key) {
  if (key.gems) return;
  if (a?.gems || a?.type === 'rush' || SHOP[a?.item]?.gem || (a?.type === 'build' && BUILD[a.item]?.cost?.gems)) fail(403, 'This AI is not allowed to spend Gems. The player can allow it in Settings → Connect an AI.');
}
async function runOp(body, player, key) {
  const lead = Number(body.mind) || 0;
  switch (body.op) {
    case 'state': return view(player);
    case 'do': {
      const acts = Array.isArray(body.actions) ? body.actions.slice(0, 40) : [];
      if (!acts.length) fail(400, 'send actions: [ ... ]');
      acts.forEach(a => checkAction(a, key));
      const r = must(await inner(island, player, 'POST', '/api/island', { acts }));
      return { results: r.results, dust: r.island.state.dust };
    }
    case 'job': {
      const r = must(await inner(island, player, 'POST', '/api/island', { acts: [{ type: 'job', mind: lead, job: body.job, crop: body.crop }] }));
      if (r.results[0].error) fail(400, r.results[0].error);
      return { ok: true, jobs: r.island.state.jobs };
    }
    case 'raid': {
      const army = body.army || DEFAULT_ARMY;
      const found = must(await inner(raid, player, 'POST', '/api/raid', { op: 'find', army, minds: lead ? [lead] : [] }));
      const inputs = autoPlan(found.snap, { troops: found.army, hero: found.hero });
      const res = must(await inner(raid, player, 'POST', '/api/raid', { op: 'attack', id: found.id, inputs }));
      return { target: found.name, fee: found.fee, raidsLeft: found.raidsLeft, stars: res.stars, percent: Math.round(res.pct * 100), loot: res.loot };
    }
    case 'raid_find': return must(await inner(raid, player, 'POST', '/api/raid', { op: 'find', army: body.army, minds: lead ? [lead] : [] }));
    case 'raid_attack': return must(await inner(raid, player, 'POST', '/api/raid', { op: 'attack', id: body.id, inputs: body.inputs }));
    case 'adventure': {
      must(await inner(adventure, player, 'POST', '/api/adventure', { op: 'start', spot: body.spot, potions: body.potions, mind: lead }));
      return must(await inner(adventure, player, 'POST', '/api/adventure', { op: 'auto' }));
    }
    case 'energy': {
      if (body.pay === 'gems' && !key.gems) fail(403, 'This AI is not allowed to spend Gems.');
      return must(await inner(energy, player, 'POST', '/api/energy', { mind: lead, pay: body.pay }));
    }
    case 'duel_join': {
      await db.update('players', `id=eq.${player.id}`, { ai_until: new Date(Date.now() + 15 * 60e3).toISOString() }).catch(() => {});
      return must(await inner(queue_join, player, 'POST', '/api/queue/join', { mode: body.mode === 'classic' ? 'classic' : 'ranked', minds: body.minds }));
    }
    case 'duel_poll': return must(await inner(queue_poll, player, 'POST', '/api/queue/poll', {}));
    case 'duel_leave': return must(await inner(queue_leave, player, 'POST', '/api/queue/leave', {}));
    case 'duel_view': return must(await inner(match_view, player, 'GET', '/api/match/view', {}, { id: body.id }));
    case 'duel_act': return must(await inner(match_act, player, 'POST', '/api/match/act', { id: body.id, card: body.card, spell: body.spell ?? null }));
    case 'duel_forfeit': return must(await inner(match_forfeit, player, 'POST', '/api/match/forfeit', { id: body.id }));
    case 'me': return must(await inner(me, player, 'GET', '/api/me'));
  }
  fail(400, 'unknown op. Send { "op": "help" }.');
}

export default route(async ({ req, res, body }) => {
  if (req.method === 'GET' || body.op === 'help') return HELP;
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!raw.startsWith('mk_')) fail(401, 'send your Mind key: authorization: Bearer mk_...');
  const key = await db.one('agent_keys', `hash=eq.${hashOf(raw)}&revoked=eq.false`);
  if (!key) fail(401, 'this key does not work (it may have been turned off)');
  if (!(await db.rpc('hit_rate', { k: 'agent:' + key.id, max_hits: PER_MIN, window_s: 60 }))) return send(res, 429, { error: 'slow down: 120 calls a minute' });
  const player = await db.one('players', `id=eq.${key.player_id}`);
  if (!player) fail(401, 'account not found');
  let out, error = null;
  try { out = await runOp(body, player, key); } catch (e) { error = e.message; throw e; }
  finally {
    if (body.op !== 'state') db.update('agent_keys', `id=eq.${key.id}`, { last_used: new Date().toISOString(), log: [{ at: Date.now(), op: String(body.op).slice(0, 20), ...(error ? { error: error.slice(0, 80) } : {}) }, ...(key.log || [])].slice(0, LOG_KEEP) }).catch(() => {});
  }
  return out;
}, { methods: ['GET', 'POST'], auth: false, limit: false });

// the player's own keys (from the game, with their normal session)
export const agentKeys = route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  if (p.is_guest) fail(403, 'Connect a wallet to connect an AI.');
  if (body.id !== undefined && !/^[0-9a-f-]{36}$/.test(String(body.id))) fail(400, 'bad key id');
  const mine = `player_id=eq.${p.id}`, list = async () => (await db.select('agent_keys', `${mine}&revoked=eq.false&order=created_at.desc&limit=${KEYS_MAX}`)).map(k => ({ id: k.id, name: k.name, gems: k.gems, log: k.log || [], lastUsed: k.last_used }));
  if (body.op === 'new') {
    if ((await list()).length >= KEYS_MAX) fail(400, `You can have ${KEYS_MAX} keys. Turn one off first.`);
    const key = 'mk_' + randomBytes(24).toString('base64url');
    await db.insert('agent_keys', { player_id: p.id, name: String(body.name || 'My AI').slice(0, 30), hash: hashOf(key) });
    return { key, keys: await list() };   // shown this one time only; only the hash is stored
  }
  if (body.op === 'off') await db.update('agent_keys', `id=eq.${body.id}&${mine}`, { revoked: true });
  else if (body.op === 'gems') await db.update('agent_keys', `id=eq.${body.id}&${mine}`, { gems: !!body.on });
  else if (body.op !== 'list') fail(400, 'unknown action');
  return { keys: await list() };
}, { limit: [30, 60] });
