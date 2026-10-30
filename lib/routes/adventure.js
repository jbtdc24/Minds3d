// Adventure: op 'start' flies you to an area of the world map (it must be unlocked; far areas cost Sky Fuel),
// takes the potions you bring and remembers the island in your save. op 'end' gets the ids of what you gathered
// and beat plus how much grass/trees/rocks you cut (capped per hour), checks them against the same seed and adds
// the loot. Knocked out = half. Unused potions come back. 5 adventures a day (+1 per Mind, max +3; tickets for more).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { stillOwns } from '../owned.js';
import { COVER } from '../../web/src/island/gen.js';
import { DROPS, normalize } from '../../web/src/island/rules.js';
import { flag } from '../admin.js';
import { advMap, advLoot, advPerDay, ADV_TIME, AREAS, SPOTS, SHIPS, spotLevel, GATHER_PER_HOUR, POTIONS_MAX } from '../../web/src/island/adventure.js';

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
    } else if (body.op === 'end') {
      const adv = st.adv;
      if (!adv) fail(400, 'That adventure is over.');
      const secs = (now - adv.at) / 1000;
      const map = advMap(adv.seed, adv.level), got = ids(body.got), beat = ids(body.beat);
      const cut = Object.fromEntries(Object.keys(COVERS).map(k => [k, Math.max(0, Math.min(99, body.cover?.[k] | 0))]));
      const cutN = Object.values(cut).reduce((s, n) => s + n, 0);
      // nobody gathers or beats more than about one thing per second out there
      if (got.length + beat.length + cutN > secs * 1.2 + 5 || secs > ADV_TIME + 120) { await flag(p.id, 'adv_reject', { secs: Math.round(secs), got: got.length, beat: beat.length, cut: cutN }); fail(400, 'That adventure did not add up.'); }
      if (got.length + beat.length > secs * 0.6) await flag(p.id, 'adv_fast', { secs: Math.round(secs), got: got.length, beat: beat.length });
      const loot = advLoot(map, got, beat);
      let left = Math.max(0, adv.gather ?? GATHER_PER_HOUR);
      for (const [k, n] of Object.entries(cut)) {
        const take = Math.min(n, left); left -= take;
        for (const [item, m] of Object.entries(DROPS[COVERS[k]] || {})) loot[item] = (loot[item] || 0) + m * take;
      }
      if (body.ko) for (const k of Object.keys(loot)) loot[k] = Math.floor(loot[k] / 2);
      give(st, loot);
      const potionsBack = Math.max(0, Math.min(adv.potions || 0, body.potionsLeft | 0));
      if (potionsBack) st.inv.potion = (st.inv.potion || 0) + potionsBack;
      const hk = hourKey(), used = (st.gh?.h === hk ? st.gh.n : 0) + Math.min(cutN, adv.gather ?? GATHER_PER_HOUR);
      st.gh = { h: hk, n: used };
      const ogre = map.monsters.some(m => m.type === 'ogre' && beat.includes(m.id));
      if (ogre) st.aw = (st.aw || 0) + 1;
      delete st.adv;
      out = { loot, ship: st.ship || 0 };
    } else if (body.op === 'map') {
      out = { ship: st.ship || 0, fuel: st.inv.fuel || 0, potions: st.inv.potion || 0 };
    } else fail(400, 'unknown adventure action');
    if (body.op === 'map') return out;
    const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${row.rev}`, { state: st, rev: row.rev + 1, updated_at: new Date().toISOString() });
    if (saved.length) return out;
  }
  fail(409, 'your island is busy, try again');
}, { limit: [30, 60] });
