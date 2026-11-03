// Mind Autopilot: the player's Mind plays their account from the game tab (web/src/autopilot.js runs the plan).
// Each step is played here through the same routes and rules a human uses (via the Mind Player API's runOp), so energy,
// daily limits, prices and work times are identical, and ranked duels it plays are labelled as AI games.
// Gems: OFF unless the player turned them on with a daily cap and typed CONFIRM; every Gem spent is counted and logged.
// One AI per Mind NFT (slot = the NFT id, '0' for a wallet with no Mind): st.ap.ai[slot] = { hm, name, steps, preset, loop },
// where hm is the player's own Hello Minds Mind that plays it. The log says which Mind did what.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { runOp, inner } from './agent.js';
import island from './island.js';
import { normalize, SHOP, CROPS, energyPrice, refillsToday } from '../../web/src/island/rules.js';
import { gen } from '../../web/src/island/gen.js';
import { SPOTS } from '../../web/src/island/adventure.js';
import { cleanTraining, stepQuestion, readStep, readDetails, duelQuestion, readCard } from '../../web/src/island/training.js';
import { mindsOf, balance, decide } from '../hmserver.js';
import { energyLeft } from '../energy.js';
import { act as matchAct } from '../game.js';
import { cleanPlan, farmActs, sellActs, wellActs, trainActs, decorActs, advSpot, STEPS } from '../../web/src/island/autoplay.js';

export const GEM_CAP_MAX = 1000, LOG_MAX = 200;
const utcDay = () => new Date().toISOString().slice(0, 10);
const SERVER_STEPS = new Set(['farm', 'sell', 'well', 'train', 'decorate', 'raid', 'adventure']);
const DUEL_OPS = new Set(['duel_join', 'duel_poll', 'duel_view', 'duel_leave', 'duel_forfeit']);   // cards are played only by duel_think
// the AI must have really thought (a Hello Minds answer, checked here) in the last 15 minutes before it may play
export const THINK_MS = 15 * 60e3, FRESH_AI_MS = 30 * 60e3;

// change the autopilot part of the island state (st.ap), safe against a second request at the same time
async function mutate(pid, fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const isl = await db.one('islands', `player_id=eq.${pid}`);
    if (!isl) fail(400, 'Open your island first.');
    const st = normalize(isl.state, Number(isl.seed), Date.now());
    st.ap ||= {};
    const out = fn(st.ap, st, isl);
    const saved = await db.update('islands', `player_id=eq.${pid}&rev=eq.${isl.rev}`, { state: st, rev: isl.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return out;
  }
  fail(409, 'your island is busy, try again');
}
const gemsToday = ap => { const g = ap.gems || {}; return g.day === utcDay() ? g.spent || 0 : 0; };
const gemRoom = ap => ap.gems?.on ? Math.max(0, (ap.gems.cap || 0) - gemsToday(ap)) : 0;
const slotOf = v => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 3333 ? String(n) : null; };
const pubAi = a => ({ hm: a.hm || null, name: a.name || null, steps: a.steps || [], preset: a.preset || null, loop: a.loop !== false, train: cleanTraining(a.train) });
const publicAp = ap => ({ ai: Object.fromEntries(Object.entries(ap.ai || {}).map(([k, a]) => [k, pubAi(a)])), gems: { on: !!ap.gems?.on, cap: ap.gems?.cap || 0, spent: gemsToday(ap) }, log: (ap.log || []).slice(0, LOG_MAX) });
const logLine = (ap, text, mind = null) => { ap.log = [{ at: Date.now(), text: String(text).slice(0, 400), ...(mind != null ? { mind: String(mind) } : {}) }, ...(ap.log || [])].slice(0, LOG_MAX); };
async function spendGems(pid, n, why, mind = null) {
  return mutate(pid, ap => {
    if (gemRoom(ap) < n) return false;
    const day = utcDay();
    ap.gems = { ...ap.gems, day, spent: gemsToday(ap) + n };
    logLine(ap, `💎 spent ${n} Gem${n > 1 ? 's' : ''}: ${why}`, mind);
    return true;
  });
}
const islandActs = async (player, acts) => {
  const r = await inner(island, player, 'POST', '/api/island', { acts });
  if (r.code >= 400) fail(r.code, r.body?.error || 'that did not work');
  return r.body;
};
const done = results => (results || []).reduce((s, x) => s + (x?.done || 0), 0);
// one server step; returns what the Mind did, in words
// d = the details the AI chose for this step (crop, sell, troops, spot, potions, army, decor)
async function step(player, what, lead = 0, train = cleanTraining(), d = {}) {
  const data = await islandActs(player, []), { seed, state: st, minds } = data.island, now = data.now;
  const key = { gems: false };   // the Mind never spends Gems by itself; the steps below ask spendGems first
  switch (what) {
    case 'farm': {
      const acts = farmActs(st, now, minds, d.crop);
      if (!acts.length) return 'nothing to farm right now';
      const r = await islandActs(player, acts), got = acts.map((a, i) => [a.type, r.results[i]?.done || 0]).filter(([, n]) => n);
      return got.length ? got.map(([t, n]) => `${{ harvest: 'harvesting', plant: 'planting', buy: 'bought seeds for' }[t] || t} ${n}`).join(', ') + ' plots' : (r.results.find(x => x?.error)?.error || 'nothing to farm right now');
    }
    case 'sell': {
      const mode = d.sell || (train.farm.sell === 'none' ? 'none' : train.farm.sell === 'keep' ? 'half' : 'all');
      if (mode === 'none') return 'kept the crops (the AI chose not to sell)';
      const acts = sellActs(st).map(a => mode === 'half' && a.n > 1 ? { ...a, n: Math.ceil(a.n / 2) } : a);
      if (!acts.length) return 'no crops in the bag to sell';
      const before = st.dust, r = await islandActs(player, acts);
      return `sold ${done(r.results)} crops for ${(r.island.state.dust - before).toLocaleString()} ✨`;
    }
    case 'well': {
      const acts = wellActs(st, now);
      if (!acts.length) return 'the Energy Well is still filling';
      const r = await islandActs(player, acts);
      return `collected ${done(r.results)} ⚡ shards`;
    }
    case 'train': {
      const acts = trainActs(st, d.troops);
      if (!acts.length) return 'the camp is full enough, or Dust is low';
      const r = await islandActs(player, acts);
      return `trained ${done(r.results)} troops`;
    }
    case 'decorate': {
      const acts = decorActs(st, gen(Number(seed)), d.decor);
      if (!acts.length) return 'no spare Dust or room for decorations';
      const r = await islandActs(player, acts);
      return `placed ${done(r.results)} decorations around your home`;
    }
    case 'raid': {
      const go = () => runOp({ op: 'raid', mind: lead, ...(d.army ? { army: d.army } : {}) }, player, key);
      try { const r = await go(); return `raided ${r.target}: ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} ${r.percent}%, +${r.loot} ✨`; }
      catch (e) {
        if (!/raids today|no raids/i.test(e.message) || !(await spendGems(player.id, SHOP.gem_raid.price.gems, 'Raid Ticket', lead))) throw e;
        await islandActs(player, [{ type: 'shop', item: 'gem_raid', n: 1 }]);
        const r = await go(); return `used a Raid Ticket and raided ${r.target}: ${'★'.repeat(r.stars)} ${r.percent}%, +${r.loot} ✨`;
      }
    }
    case 'adventure': {
      const spot = d.spot ?? advSpot(st, SPOTS, now / 864e5 | 0), potions = Math.min(d.potions ?? (Number(train.explore.potions) || 0), st.inv.potion || 0);
      const go = () => runOp({ op: 'adventure', spot, potions, mind: lead }, player, key);
      const say = r => `explored ${SPOTS[spot].name}${r?.loot ? `: ${Object.entries(r.loot).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ')}` : ''}`;
      try { return say(await go()); }
      catch (e) {
        if (!/adventures today|no adventures/i.test(e.message) || !(await spendGems(player.id, SHOP.gem_adv.price.gems, 'Adventure Ticket', lead))) throw e;
        await islandActs(player, [{ type: 'shop', item: 'gem_adv', n: 1 }]);
        return 'used an Adventure Ticket and ' + say(await go());
      }
    }
  }
  fail(400, 'unknown step');
}

// this Mind's AI, checked against the player's own Hello Minds account (token from their browser, not stored)
async function realAi(player, slot, token) {
  const isl = await db.one('islands', `player_id=eq.${player.id}&select=state,minds`);
  const ai = isl?.state?.ap?.ai?.[slot];
  if (!ai?.hm) fail(403, 'Give this Mind an AI first.');
  const minds = await mindsOf(token).catch(e => fail(401, e.message));
  if (!minds.has(ai.hm)) fail(403, 'That AI is not on your Hello Minds account.');
  return { ai, st: isl.state };
}
const thought = (pid, slot, extra = {}) => mutate(pid, ap => { if (ap.ai?.[slot]) Object.assign(ap.ai[slot], { ok: Date.now() }, extra); return true; });
const recent = (st, slot) => Date.now() - (st?.ap?.ai?.[slot]?.ok || 0) < THINK_MS;

export default route(async ({ body, session }) => {
  const player = await db.one('players', `id=eq.${session.pid}`);
  if (!player) fail(401, 'account not found');
  if (session.agent) fail(403, 'An AI key cannot run the autopilot.');
  const op = body.op;
  if (op === 'get') return mutate(player.id, ap => publicAp(ap));
  const slot = slotOf(body.mind);
  // give a Mind its AI (the player's own Hello Minds Mind), or take it away; one AI per Mind held
  if (op === 'link') {
    if (slot == null) fail(400, 'Which Mind?');
    const hm = String(body.hm || '').slice(0, 80);
    if (!hm) fail(400, 'Pick an AI.');
    // a real AI on the player's own Hello Minds account, awakened just now for this Mind (never one used elsewhere)
    const m = (await mindsOf(body.token).catch(e => fail(401, e.message))).get(hm);
    if (!m) fail(403, 'That AI is not on your Hello Minds account.');
    if (m.createdAt && Date.now() - Date.parse(m.createdAt) > FRESH_AI_MS) fail(403, 'Each Mind needs its own new AI: awaken one for it.');
    const name = String(m.name || body.name || 'AI Mind').slice(0, 40);
    return mutate(player.id, (ap, st, isl) => {
      ap.ai ||= {};
      if (!ap.ai[slot] && Object.keys(ap.ai).length >= Math.max(1, isl.minds | 0)) fail(403, 'One AI per Mind you hold.');
      if (Object.entries(ap.ai).some(([k, a]) => k !== slot && a.hm === hm)) fail(409, 'That AI already plays another Mind.');
      ap.ai[slot] = { ...(ap.ai[slot] || {}), hm, name };
      logLine(ap, `🧠 ${name} now plays ${slot === '0' ? 'your Rank Pass Mind' : `Mind #${slot}`}`, slot);
      return publicAp(ap);
    });
  }
  if (op === 'unlink') {
    if (slot == null) fail(400, 'Which Mind?');
    return mutate(player.id, ap => { if (ap.ai?.[slot]) { logLine(ap, `🧠 ${ap.ai[slot].name || 'the AI'} stopped playing this Mind`, slot); delete ap.ai[slot]; } return publicAp(ap); });
  }
  if (op === 'train') {   // how this Mind's AI should play (training.js): known choices only
    if (slot == null) fail(400, 'Which Mind?');
    return mutate(player.id, ap => {
      if (!ap.ai?.[slot]) fail(403, 'Give this Mind an AI first.');
      ap.ai[slot].train = cleanTraining(body.train);
      logLine(ap, '🎯 training updated', slot);
      return publicAp(ap);
    });
  }
  if (op === 'save') {   // a Mind's plan: a preset or what its AI suggested
    const steps = cleanPlan(body.steps);
    if (!steps.length) fail(400, 'Pick a plan or tell your Mind what to do.');
    if (slot == null) fail(400, 'Which Mind?');
    return mutate(player.id, ap => {
      if (!ap.ai?.[slot]) fail(403, 'Give this Mind an AI first.');
      Object.assign(ap.ai[slot], { steps, preset: typeof body.preset === 'string' ? body.preset.slice(0, 20) : null, loop: body.loop !== false });
      logLine(ap, `📋 new plan: ${steps.map(s => STEPS[s.do].name + (s.n > 1 ? ` ×${s.n}` : '') + (s.min ? ` ${s.min} min` : '')).join(' → ')}`, slot);
      return publicAp(ap);
    });
  }
  if (op === 'gems') {   // layer after layer: the browser asks twice, then the server wants the cap and the typed word
    if (!body.on) return mutate(player.id, ap => { ap.gems = { ...ap.gems, on: false }; logLine(ap, '💎 Gem spending turned OFF'); return publicAp(ap); });
    if (player.is_guest) fail(403, 'Connect a wallet first.');
    const cap = body.cap | 0;
    if (cap < 1 || cap > GEM_CAP_MAX) fail(400, `Pick a daily limit from 1 to ${GEM_CAP_MAX} Gems.`);   // the player types their own number
    if (body.confirm !== 'CONFIRM') fail(400, 'Type CONFIRM to let your Mind spend Gems.');
    return mutate(player.id, ap => { ap.gems = { ...ap.gems, on: true, cap }; logLine(ap, `💎 Gem spending ON, up to ${cap} a day`); return publicAp(ap); });
  }
  if (op === 'log') return mutate(player.id, ap => { logLine(ap, body.text || '', slot); return publicAp(ap); });
  if (op === 'next') {   // the AI picks the next step: the server asks it (and checks its cognition) itself
    if (slot == null) fail(400, 'Which Mind?');
    const { ai, st } = await realAi(player, slot, body.token);
    if (!ai.steps?.length) fail(400, 'Pick a plan first.');
    const cog = await balance(body.token, ai.hm);
    if (cog != null && cog <= 0) return { out: true, cog };
    const planned = ai.steps[(body.at | 0) % ai.steps.length].do, train = cleanTraining(ai.train);
    const energy = Number(slot) ? (await energyLeft([Number(slot)]).catch(() => ({})))[Number(slot)] : null;
    const spots = SPOTS.map((s, i) => ({ ...s, i })).filter(s => s.tier <= (st.ship || 0) && s.tier <= (st.inv?.fuel || 0));   // islands it can fly to now
    const reply = await decide(body.token, ai.hm, stepQuestion({ steps: ai.steps, planned, st, energy, train, crops: CROPS, spots }), 20e3).catch(() => null);
    if (reply == null) return { do: planned, ai: false, cog };
    const r = readStep(reply, ai.steps), det = readDetails(reply, { crops: CROPS, spots });
    if (det.spot != null) det.spot = spots[det.spot].i;
    await thought(player.id, slot, { pick: { do: r.pick || planned, d: det, at: Date.now() } });   // the step uses exactly what the AI chose
    if (r.pick && r.pick !== planned) await mutate(player.id, ap => { logLine(ap, `🧠 chose ${STEPS[r.pick].name} instead of ${STEPS[planned].name}: ${r.why}`, slot); return true; });
    return { do: r.pick || planned, why: r.why, details: det, ai: true, cog };
  }
  if (op === 'duel_think') {   // one duel turn: the server asks the AI and plays its card (a browser cannot pick for it)
    if (slot == null || !/^[0-9a-f-]{36}$/.test(body.id || '')) fail(400, 'Which duel?');
    const { ai } = await realAi(player, slot, body.token);
    const v = await runOp({ op: 'duel_view', id: body.id }, player, { gems: false });
    if (v.status !== 'live' || v.view.over || v.view.me.locked || !v.view.crown) return { ...v, think: null };
    const cog = await balance(body.token, ai.hm);
    if (cog != null && cog <= 0) return { ...v, out: true, cog };
    const left = Date.parse(v.deadline) - Date.now() - 1500, reply = await decide(body.token, ai.hm, duelQuestion(v.view, ai.train), Math.max(3e3, Math.min(17e3, left))).catch(() => null);   // as long as the turn allows
    const d = reply != null && readCard(reply, v.view);
    if (!d) return { ...v, think: { ai: false, crown: v.view.crown, why: reply == null ? 'no answer in time: played nothing' : 'its answer was not a card it has: played nothing' }, cog };   // only the AI plays: no answer, no move
    await thought(player.id, slot);
    const after = await matchAct(body.id, player.id, { card: d.card, spell: d.spell });
    return { ...after, think: { card: d.card, spell: d.spell, why: d.why, ai: true, crown: v.view.crown }, cog };
  }
  if (op === 'step') {
    if (!SERVER_STEPS.has(body.do)) fail(400, 'unknown step');
    { const isl = await db.one('islands', `player_id=eq.${player.id}&select=state`); if (!recent(isl?.state, slot)) fail(403, 'Your AI has not thought for a while: it needs Hello Minds and cognition to play.'); }
    let text, ok = true;
    try {
      const isl = await db.one('islands', `player_id=eq.${player.id}&select=state`), a = isl?.state?.ap?.ai?.[slot], pick = a?.pick?.do === body.do && Date.now() - a.pick.at < 10 * 60e3 ? a.pick.d : {};
      text = await step(player, body.do, Number(slot) || 0, cleanTraining(a?.train), pick || {});
    } catch (e) { ok = false; text = e.message || 'that did not work'; }
    const line = `${STEPS[body.do].icon} ${ok ? '' : 'could not ' + STEPS[body.do].name.toLowerCase() + ': '}${text}`;
    return { ok, text: line, ...(await mutate(player.id, ap => { logLine(ap, line, slot); return publicAp(ap); })) };
  }
  if (op === 'refill') {   // out of ranked energy: shards first, then Dust (keeps 1,000), then Gems if allowed
    const mind = Number(body.mind) | 0, data = await islandActs(player, []), st = data.island.state;
    const ways = body.only === 'shard' ? ['shard', 'gems'] : ['shard', 'dust', 'gems'];   // training: shards only (Gems only if allowed)
    for (const pay of ways) {
      if (pay === 'dust' && st.dust < 4000) continue;   // keeps a safe amount: a refill costs 3,000 Dust
      if (pay === 'gems' && !(await spendGems(player.id, energyPrice(refillsToday(st, mind, utcDay())).gems, `energy for Mind #${mind}`, mind))) continue;
      try { return { ok: true, pay, ...(await runOp({ op: 'energy', mind, pay }, player, { gems: pay === 'gems' })) }; } catch { /* try the next way */ }
    }
    return { ok: false };
  }
  if (op === 'duel_join') { const isl = await db.one('islands', `player_id=eq.${player.id}&select=state`); if (!recent(isl?.state, slot)) fail(403, 'Your AI has not thought for a while: it needs Hello Minds and cognition to play.'); }
  if (DUEL_OPS.has(op)) {
    const out = await runOp({ ...body, mind: body.mind }, player, { gems: false });
    if ((op === 'duel_join' || op === 'duel_poll') && out?.match) await mutate(player.id, ap => { ap.aiDuel = out.match; return true; });   // this duel is the AI's: no hand moves in it
    if (op === 'duel_leave' || op === 'duel_forfeit') await mutate(player.id, ap => { delete ap.aiDuel; return true; });
    return out;
  }
  fail(400, 'unknown autopilot action');
}, { limit: [120, 60] });
