// Refill ranked energy: +1 on one of your Minds, paid with island shards (Energy Well), Dust or Gems.
// Max 3 refills per Mind per day. Energy belongs to the Mind (mind_energy), the payment comes out of your island.
import { route, fail } from '../http.js';
import { db } from '../db.js';
import { stillOwns } from '../owned.js';
import { energyLeft, capFor } from '../energy.js';
import { normalize, ENERGY_PRICE, SHARDS_PER_ENERGY, REFILLS_PER_DAY } from '../../web/src/island/rules.js';
import { utcDay } from '../../web/src/energy.js';

export default route(async ({ body, session }) => {
  const p = await db.one('players', `id=eq.${session.pid}`);
  if (!p) fail(401, 'account not found');
  if (p.is_guest || !p.address) fail(403, 'Connect a wallet: energy is for ranked Minds.');
  const mind = Number(body.mind), pay = body.pay;
  if (!['shard', 'dust', 'gems'].includes(pay)) fail(400, 'pick how to pay');
  if (!(mind >= 1 && mind <= 3333) || !(await stillOwns(p.address, [mind]).catch(() => false))) fail(403, 'That is not your Mind.');
  const left = (await energyLeft([mind]))[mind], cap = capFor(mind), day = utcDay();
  if (left >= cap) fail(400, 'That Mind is already full of energy.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await db.one('islands', `player_id=eq.${p.id}`);
    if (!row) fail(400, 'Open your island first.');
    const st = normalize(row.state, Number(row.seed), Date.now());
    st.er = st.er?.day === day ? st.er : { day, m: {} };
    if ((st.er.m[mind] || 0) >= REFILLS_PER_DAY) fail(403, `Mind #${mind} already got ${REFILLS_PER_DAY} refills today.`);
    if (pay === 'shard') { if ((st.inv.shard || 0) < SHARDS_PER_ENERGY) fail(403, `You need ${SHARDS_PER_ENERGY} ⚡ shards. Collect them at the Energy Well on your island.`); st.inv.shard -= SHARDS_PER_ENERGY; if (!st.inv.shard) delete st.inv.shard; }
    else if (pay === 'dust') { if (st.dust < ENERGY_PRICE.dust) fail(403, `That costs ${ENERGY_PRICE.dust} ✨ Dust.`); st.dust -= ENERGY_PRICE.dust; }
    else { if ((st.gems || 0) < ENERGY_PRICE.gems) fail(403, `That costs ${ENERGY_PRICE.gems} 💎.`); st.gems -= ENERGY_PRICE.gems; }
    st.er.m[mind] = (st.er.m[mind] || 0) + 1;
    const saved = await db.update('islands', `player_id=eq.${p.id}&rev=eq.${row.rev}`, { state: st, rev: row.rev + 1, updated_at: new Date().toISOString() });
    if (!saved.length) continue;
    const e = await db.one('mind_energy', `token_id=eq.${mind}`);
    if (e && e.day === day) await db.update('mind_energy', `token_id=eq.${mind}`, { used: Math.max(0, e.used - 1) });
    return { ok: true, mind, energy: Math.min(cap, left + 1) };
  }
  fail(409, 'your island is busy, try again');
}, { limit: [30, 60] });
