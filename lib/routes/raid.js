// Island raids. op 'find': pick an island to raid (a real player's, or a village the game runs, which looks the
// same) and remember a snapshot of it in your island. op 'attack': the client sends its army and what it did
// (drops / spells / Battle Cry with tick numbers); the server replays the same sim on the snapshot, moves the loot,
// gives a real defender a shield and a log entry. Raids per day: 6 (+1 per Mind owned, max +3).
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { stillOwns } from '../owned.js';
import { flag } from '../admin.js';
import { normalize, countOf, barnSafe } from '../../web/src/island/rules.js';
import { TROOPS as T_ } from '../../web/src/island/raid.js';
import { snapshotOf, replay, lootOf, SHIELD_MS, MAX_TICKS, SPELLS, TROOPS, botVillage, guardsFor, armyCap, cleanArmy, raidsPerDay, raidFee, botLoot } from '../../web/src/island/raid.js';

const MIN_DUST = 300, ACTIVE_DAYS = 14, RAID_MS = 6 * 60_000, LOG_KEEP = 10, REAL_CHANCE = 0.55;
const utcDay = () => new Date().toISOString().slice(0, 10);

async function save(row, st) {
  const saved = await db.update('islands', `player_id=eq.${row.player_id}&rev=eq.${row.rev}`, { state: st, rev: row.rev + 1, updated_at: new Date().toISOString() });
  return saved.length ? saved[0] : null;
}
const cleanInputs = list => (Array.isArray(list) ? list : []).slice(0, 60).map(a => {
  const t = Math.max(0, Math.min(MAX_TICKS, a?.t | 0)), k = a?.k | 0;
  if (a?.cry) return { t, cry: 1 };
  if (a?.drop === 'hero' || TROOPS[a?.drop]) return { t, drop: a.drop, k };
  if (SPELLS[a?.spell]) return { t, spell: a.spell, k };
  return null;
}).filter(Boolean);

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  const mine = await db.one('islands', `player_id=eq.${p.id}`);
  if (!mine) fail(400, 'Open your island first.');
  const now = Date.now(), minds = p.is_guest ? 0 : mine.minds || 0;

  if (body.op === 'find') {
    const st0 = normalize(mine.state, Number(mine.seed), now), day = utcDay(), used = st0.rd?.day === day ? st0.rd.n : 0, max = raidsPerDay(minds);
    let ticket = false;
    if (used >= max) { if (st0.inv.raid_ticket > 0) ticket = true; else fail(403, `You've used all ${max} raids today. More at 00:00 UTC, or use a Raid Ticket.${minds < 3 ? ' Owning Minds gives extra raids.' : ''}`); }
    // an old raid you never finished: its troops come back
    if (st0.raid?.army) for (const [k, n] of Object.entries(st0.raid.army)) st0.inv['troop_' + k] = (st0.inv['troop_' + k] || 0) + n;
    delete st0.raid;
    // your army: the trained troops you bring (they fit your camp, and you must have them)
    const want = cleanArmy(body.army, armyCap(minds)), army = {};
    for (const k of Object.keys(T_)) army[k] = Math.min(want[k] || 0, st0.inv['troop_' + k] || 0);
    if (!Object.values(army).some(n => n > 0)) fail(403, 'Train some troops first (Shop → Army). You buy them with Dust from farming, adventures and raids.');
    const fee = raidFee(army);
    if (st0.dust < fee) fail(403, `This raid needs ${fee} ✨ Dust for army supplies (5 per camp space). Sell crops or go on an adventure.`);
    st0.dust -= fee;
    for (const [k, n] of Object.entries(army)) { if (!n) continue; st0.inv['troop_' + k] -= n; if (!st0.inv['troop_' + k]) delete st0.inv['troop_' + k]; }
    if (ticket) { st0.inv.raid_ticket--; if (!st0.inv.raid_ticket) delete st0.inv.raid_ticket; }
    // your hero: one of your own Minds (checked on-chain), otherwise a Captain
    const lead = Number((body.minds || [])[0]);
    const hero = !p.is_guest && lead >= 1 && lead <= 3333 && (await stillOwns(p.address, [lead]).catch(() => false)) ? 'hero' : 'captain';
    let target = null;
    // revenge: hit back at someone from your raid log (once per raid on you; their shield does not stop it)
    const rev = body.revenge ? (st0.raidLog || []).find(e => e.at === Number(body.revenge) && e.pid && !e.avenged) : null;
    if (body.revenge && !rev) fail(400, 'That revenge is not available any more.');
    if (rev) {
      const t = await db.one('islands', `player_id=eq.${rev.pid}`), tp = await db.one('players', `id=eq.${rev.pid}`);
      if (!t || !tp) fail(404, 'That player has no island any more.');
      rev.avenged = true;
      const guardIds = [...(tp.showcase || []), tp.pfp].filter(Boolean).slice(0, 4);
      target = { target: t.player_id, name: tp.name, revenge: true, snap: snapshotOf(Number(t.seed), normalize(t.state, Number(t.seed), now), guardsFor(t.minds || 0), { guardIds }), loot: lootOf(t.state.dust, barnSafe(t.state), 1) };
    }
    if (!target && !p.is_guest && Math.random() < REAL_CHANCE) {
      const since = new Date(now - ACTIVE_DAYS * 86400e3).toISOString();
      const rows = await db.select('islands', `player_id=neq.${p.id}&updated_at=gt.${since}&select=player_id,seed,state,minds&order=updated_at.desc&limit=60`);
      const ids = rows.map(r => r.player_id);
      const players = ids.length ? await db.select('players', `id=in.(${ids.join(',')})&is_guest=eq.false&select=id,name,pfp,showcase`) : [];
      const pool = rows.filter(r => players.some(x => x.id === r.player_id) && (r.state?.dust || 0) >= MIN_DUST && !(r.state?.shield > now) && r.state?.b?.length);
      if (pool.length) {
        const t = pool[(Math.random() * pool.length) | 0], tp = players.find(x => x.id === t.player_id);
        const guardIds = [...(tp.showcase || []), tp.pfp].filter(Boolean).slice(0, 4);
        target = { target: t.player_id, name: tp.name, snap: snapshotOf(Number(t.seed), normalize(t.state, Number(t.seed), now), guardsFor(t.minds || 0), { guardIds }), loot: lootOf(t.state.dust, barnSafe(t.state), 1) };
      }
    }
    if (!target) {   // a village the game runs: shown exactly like a player's island
      const wins = st0.rw || 0, level = Math.max(1, Math.min(3, 1 + Math.floor(wins / 3) + (Math.random() < 0.25 ? 1 : 0) - (Math.random() < 0.15 ? 1 : 0)));
      const snap = botVillage((Math.random() * 2 ** 31) | 0, level);
      target = { target: null, bot: true, name: snap.name, snap, loot: botLoot(level) };
    }
    const raid = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, ...target, hero, cap: armyCap(minds), army, at: now };
    const st = { ...st0, raid, rd: ticket ? st0.rd : { day, n: used + 1 } };
    delete st.shield;                                  // attacking ends your own shield
    if (!(await save(mine, st))) fail(409, 'your island is busy, try again');
    return { id: raid.id, name: raid.name, snap: raid.snap, loot: raid.loot, hero, cap: raid.cap, army, fee, raidsLeft: Math.max(0, max - used - 1) };
  }

  if (body.op === 'attack') {
    const raid = mine.state?.raid;
    if (!raid || raid.id !== body.id) fail(400, 'That raid is over.');
    if (now - raid.at > RAID_MS) fail(400, 'That raid took too long and was cancelled.');
    const army = { troops: raid.army || cleanArmy(body.army, raid.cap), hero: raid.hero };
    const r = replay(raid.snap, army, cleanInputs(body.inputs));
    if (body.claim != null && (body.claim | 0) !== r.stars) await flag(p.id, 'raid_mismatch', { claimed: body.claim | 0, real: r.stars });
    let loot = 0;
    if (raid.bot) loot = Math.floor(raid.loot * r.pct);
    else for (let attempt = 0; attempt < 4; attempt++) {   // take it from the real defender (never more than shown)
      const dr = await db.one('islands', `player_id=eq.${raid.target}`);
      if (!dr) break;
      const ds = dr.state;
      loot = Math.min(raid.loot, lootOf(ds.dust, barnSafe(ds), r.pct));
      ds.dust -= loot;
      if (r.stars > 0) ds.shield = now + SHIELD_MS;
      ds.raidLog = [{ at: now, by: p.name, pid: p.id, stars: r.stars, pct: Math.round(r.pct * 100), loot }, ...(ds.raidLog || [])].slice(0, LOG_KEEP);
      if (await save(dr, ds)) break;
      loot = 0;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = attempt ? await db.one('islands', `player_id=eq.${p.id}`) : mine;
      const st = row.state;
      if (st.raid?.id !== raid.id) break;
      st.dust += loot; delete st.raid;
      for (const [k, n] of Object.entries(r.S.left || {})) if (n > 0 && raid.army) st.inv['troop_' + k] = (st.inv['troop_' + k] || 0) + n;   // troops you did not send come home
      if (r.stars >= 2) st.rw = (st.rw || 0) + 1;
      if (await save(row, st)) break;
    }
    return { stars: r.stars, pct: r.pct, home: r.home, loot };
  }
  fail(400, 'unknown raid action');
}, { limit: [30, 60] });
