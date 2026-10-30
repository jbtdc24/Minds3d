// Island raids. op 'find': pick someone to raid (spends 1 energy from your lead Mind) and remember a snapshot of
// their island in yours. op 'attack': the client sends what it did (drops / spells with tick numbers); the server
// replays the same sim on the snapshot, moves the loot and gives the defender a shield.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { stillOwns } from '../owned.js';
import { spendEnergy, emptyOf, outOfEnergy } from '../energy.js';
import { normalize, countOf } from '../../web/src/island/rules.js';
import { snapshotOf, replay, lootOf, SHIELD_MS, MAX_TICKS, SPELLS } from '../../web/src/island/raid.js';

const MIN_DUST = 300, ACTIVE_DAYS = 14, RAID_MS = 5 * 60_000, LOG_KEEP = 10;

async function save(row, st, extra = {}) {
  const saved = await db.update('islands', `player_id=eq.${row.player_id}&rev=eq.${row.rev}`, { state: st, rev: row.rev + 1, updated_at: new Date().toISOString(), ...extra });
  return saved.length ? saved[0] : null;
}
const cleanInputs = list => (Array.isArray(list) ? list : []).slice(0, 12).map(a => {
  const t = Math.max(0, Math.min(MAX_TICKS, a?.t | 0)), k = a?.k | 0;
  if (a?.drop != null) return { t, drop: a.drop | 0, k };
  if (SPELLS[a?.spell]) return { t, spell: a.spell, k };
  return null;
}).filter(Boolean);

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  if (p.is_guest) fail(403, 'Connect a wallet to raid other islands. Practice raids are free.');
  const mine = await db.one('islands', `player_id=eq.${p.id}`);
  if (!mine) fail(400, 'Open your island first.');
  const now = Date.now();

  if (body.op === 'find') {
    const lead = Number((body.minds || [])[0]);
    if (!(lead >= 1 && lead <= 3333) || !(await stillOwns(p.address, [lead]).catch(() => false))) fail(403, 'Pick one of your own Minds to lead the raid.');
    if ((await emptyOf([lead])).length) fail(403, outOfEnergy([lead]));
    // someone active, not shielded, with something worth taking
    const since = new Date(now - ACTIVE_DAYS * 86400e3).toISOString();
    const rows = await db.select('islands', `player_id=neq.${p.id}&updated_at=gt.${since}&select=player_id,seed,state,minds&order=updated_at.desc&limit=60`);
    const ids = rows.map(r => r.player_id);
    const players = ids.length ? await db.select('players', `id=in.(${ids.join(',')})&is_guest=eq.false&select=id,name,pfp,showcase`) : [];
    const pool = rows.filter(r => players.some(x => x.id === r.player_id) && (r.state?.dust || 0) >= MIN_DUST && !(r.state?.shield > now) && r.state?.b?.length);
    if (!pool.length) fail(404, 'Nobody to raid right now.');
    const t = pool[(Math.random() * pool.length) | 0], tp = players.find(x => x.id === t.player_id);
    if (!(await spendEnergy([lead]))) fail(403, outOfEnergy([lead]));
    const guardIds = [...(tp.showcase || []), tp.pfp].filter(Boolean).slice(0, 4);
    const snap = snapshotOf(Number(t.seed), normalize(t.state, Number(t.seed), now), Math.max(1, Math.min(4, t.minds || 1)), { guardIds });
    const loot = lootOf(t.state.dust, countOf(t.state, 'barn'), 1);
    const raid = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, target: t.player_id, name: tp.name, snap, loot, at: now };
    const st = { ...mine.state, raid };
    delete st.shield;                                  // attacking ends your own shield
    if (!(await save(mine, st))) fail(409, 'your island is busy, try again');
    return { id: raid.id, name: tp.name, snap, loot };
  }

  if (body.op === 'attack') {
    const raid = mine.state?.raid;
    if (!raid || raid.id !== body.id) fail(400, 'That raid is over.');
    if (now - raid.at > RAID_MS) fail(400, 'That raid took too long and was cancelled.');
    const r = replay(raid.snap, 3, cleanInputs(body.inputs));
    let loot = 0;
    // take the loot from the defender (their current Dust; never more than shown at the start)
    for (let attempt = 0; attempt < 4; attempt++) {
      const dr = await db.one('islands', `player_id=eq.${raid.target}`);
      if (!dr) break;
      const ds = dr.state;
      loot = Math.min(raid.loot, lootOf(ds.dust, countOf(ds, 'barn'), r.pct));
      ds.dust -= loot;
      if (r.stars > 0) ds.shield = now + SHIELD_MS;
      ds.raidLog = [{ at: now, by: p.name, stars: r.stars, pct: Math.round(r.pct * 100), loot }, ...(ds.raidLog || [])].slice(0, LOG_KEEP);
      if (await save(dr, ds)) break;
      loot = 0;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = attempt ? await db.one('islands', `player_id=eq.${p.id}`) : mine;
      const st = row.state;
      if (st.raid?.id !== raid.id) break;
      st.dust += loot; delete st.raid;
      if (await save(row, st)) break;
    }
    return { stars: r.stars, pct: r.pct, home: r.home, loot };
  }
  fail(400, 'unknown raid action');
}, { limit: [30, 60] });
