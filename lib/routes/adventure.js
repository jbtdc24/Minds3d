// Adventure: op 'start' flies you to an area of the world map (it must be unlocked; far areas cost Sky Fuel),
// takes the potions you bring and remembers the island in your save. op 'end' gets the taps you made and replays
// them in the shared simulation: the server alone decides what was beaten, gathered and cut, and adds the loot. Knocked out = half. Unused potions come back. 5 adventures a day (+1 per Mind, max +3; tickets for more).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { stillOwns } from '../owned.js';
import { COVER } from '../../web/src/island/gen.js';
import { DROPS, normalize } from '../../web/src/island/rules.js';
import { flag } from '../admin.js';
import { autoAdventure, advMap, advLoot, advPerDay, SPOTS, SHIPS, spotLevel, GATHER_PER_HOUR, POTIONS_MAX, MONSTERS } from '../../web/src/island/adventure.js';
import { advReplay, cleanAdvInputs, STEP } from '../../web/src/island/advsim.js';

const utcDay = () => new Date().toISOString().slice(0, 10);
const hourKey = () => new Date().toISOString().slice(0, 13);
const ids = a => [...new Set((Array.isArray(a) ? a : []).map(Number).filter(Number.isInteger))].slice(0, 80);
const COVERS = { weeds: COVER.WEEDS, bush: COVER.BUSH, rock: COVER.ROCK, tree: COVER.TREE };
const give = (st, loot) => { for (const [k, n] of Object.entries(loot)) { if (k === 'dust') st.dust += n; else if (k === 'gems') st.gems = (st.gems || 0) + n; else st.inv[k] = (st.inv[k] || 0) + n; } };

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await db.one('islands', `player_id=eq.${p.id}`);
    if (!row) fail(400, 'Open your island first.');
    const st = normalize(row.state, Number(row.seed), Date.now()), now = Date.now(), minds = p.is_guest ? 0 : row.minds || 0;
    let out;
    if (body.op === 'start') {
      // where you fly: your airship must reach it, and far flights burn fuel
      const area = Math.max(0, Math.min(SPOTS.length - 1, body.spot | 0)), S = SPOTS[area], A = { name: S.name, fuel: S.tier, level: spotLevel(area) };
      if (S.tier > (st.ship || 0)) fail(403, `${S.name} is too far for your ${SHIPS[st.ship || 0].name}. Upgrade to the ${SHIPS[S.tier].name}.`);
      if ((st.inv.fuel || 0) < A.fuel) fail(403, `Flying to ${A.name} needs ${A.fuel} ⛽ Sky Fuel (Shop).`);
      const day = utcDay(), used = st.ad?.day === day ? st.ad.n : 0, max = advPerDay(minds);
      let ticket = false;
      if (used >= max) { if (st.inv.adv_ticket > 0) ticket = true; else fail(403, `You have been on all ${max} adventures today. More at 00:00 UTC, or use an Adventure Ticket.`); }
      if (st.adv?.potions) st.inv.potion = (st.inv.potion || 0) + st.adv.potions;   // an adventure you left: its potions come back
      const lead = Number(body.mind);
      const heroKind = !p.is_guest && lead >= 1 && lead <= 3333 && (await stillOwns(p.address, [lead]).catch(() => false)) ? 'hero' : 'captain';
      const potions = Math.max(0, Math.min(POTIONS_MAX, body.potions | 0, st.inv.potion || 0));
      st.inv.potion = (st.inv.potion || 0) - potions; if (!st.inv.potion) delete st.inv.potion;
      if (A.fuel) { st.inv.fuel -= A.fuel; if (!st.inv.fuel) delete st.inv.fuel; }
      if (ticket) { st.inv.adv_ticket--; if (!st.inv.adv_ticket) delete st.inv.adv_ticket; } else st.ad = { day, n: used + 1 };
      const gh = st.gh?.h === hourKey() ? st.gh.n : 0;
      st.adv = { seed: (Math.random() * 2 ** 31) | 0, level: A.level, area, heroKind, potions, at: now, gather: GATHER_PER_HOUR - gh };
      out = { seed: st.adv.seed, level: A.level, area, heroKind, potions, gatherLeft: GATHER_PER_HOUR - gh, left: Math.max(0, max - used - 1) };
    } else if (body.op === 'auto' && session.agent) {   // AI player: the whole trip is worked out here
      const adv = st.adv;
      if (!adv) fail(400, 'Start an adventure first.');
      const map = advMap(adv.seed, adv.level), run = autoAdventure(map, adv.heroKind, adv.potions || 0), loot = advLoot(map, run.got, run.beat);
      give(st, loot);
      if (run.potionsLeft) st.inv.potion = (st.inv.potion || 0) + run.potionsLeft;
      if (map.monsters.some(m => ['ogre', 'golem', 'drake', 'titan'].includes(m.type) && run.beat.includes(m.id))) st.aw = (st.aw || 0) + 1;
      delete st.adv;
      out = { loot, beat: run.beat.length, gathered: run.got.length, potionsLeft: run.potionsLeft };
    } else if (body.op === 'end') {
      const adv = st.adv;
      if (!adv) fail(400, 'That adventure is over.');
      if (!Array.isArray(body.inputs)) fail(400, 'Please refresh the game to finish this adventure.');
      const secs = (now - adv.at) / 1000, end = Math.max(0, body.end | 0);
      // the client only says what was tapped and when; it can never run faster than real time
      if (end * STEP > secs + 5) { await flag(p.id, 'adv_fast', { secs: Math.round(secs), ticks: end }); fail(400, 'That adventure did not add up.'); }
      const map = advMap(adv.seed, adv.level);
      const S = advReplay(map, { heroKind: adv.heroKind, potions: adv.potions || 0, gatherLeft: Math.max(0, adv.gather ?? GATHER_PER_HOUR), seed: adv.seed }, cleanAdvInputs(body.inputs), end);
      const loot = advLoot(map, S.got, S.beat);
      for (const [k, n] of Object.entries(S.cover)) for (const [item, m] of Object.entries(DROPS[COVERS[k]] || {})) loot[item] = (loot[item] || 0) + m * n;
      if (S.ko) for (const k of Object.keys(loot)) loot[k] = Math.floor(loot[k] / 2);
      give(st, loot);
      if (S.potions) st.inv.potion = (st.inv.potion || 0) + S.potions;
      const cutN = Object.values(S.cover).reduce((a, n) => a + n, 0), hk = hourKey();
      st.gh = { h: hk, n: (st.gh?.h === hk ? st.gh.n : 0) + cutN };
      if (map.monsters.some(m => MONSTERS[m.type].boss && S.beat.includes(m.id))) st.aw = (st.aw || 0) + 1;
      delete st.adv;
      out = { loot, ship: st.ship || 0, ko: S.ko, beat: S.beat.length, gathered: S.got.length };
    } else if (body.op === 'map') {
      out = { ship: st.ship || 0, fuel: st.inv.fuel || 0, potions: st.inv.potion || 0 };
    } else fail(400, 'unknown adventure action');
    if (body.op === 'map') return out;
    const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${row.rev}`, { state: st, rev: row.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return out;
  }
  fail(409, 'your island is busy, try again');
}, { limit: [30, 60] });
