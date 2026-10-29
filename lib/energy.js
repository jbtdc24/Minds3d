// Mind Energy on the server: read what's left today and spend it (all or nothing) when a ranked match starts.
// Energy belongs to the Mind (token id), so moving a Mind to another wallet never refills it.
import { db } from './db.js';
import RARITY from './rarity.js';
import { capOf, utcDay } from '../web/src/energy.js';

export const capFor = id => capOf(RARITY[id] || 'Common');

// { id: energy left today }
export async function energyLeft(ids) {
  const out = Object.fromEntries(ids.map(id => [id, capFor(id)]));
  if (!ids.length) return out;
  const today = utcDay();
  try {
    for (const r of await db.select('mind_energy', `token_id=in.(${ids.join(',')})&select=token_id,day,used`))
      if (r.day === today) out[r.token_id] = Math.max(0, capFor(r.token_id) - r.used);
  } catch (e) { if (!/PGRST205|42P01/.test(e.body || '')) throw e; }   // table not created yet: everyone is full
  return out;
}

// spend 1 energy from each Mind; false (nothing spent) if any of them is empty
export async function spendEnergy(ids) {
  if (!ids.length) return true;
  try { return !!(await db.rpc('spend_energy', { ids, caps: ids.map(capFor) })); }
  catch (e) { if (/PGRST202|42883/.test(e.body || '')) return true; throw e; }  // function not created yet: free
}

export const emptyOf = async ids => { const left = await energyLeft(ids); return ids.filter(id => left[id] <= 0); };
export const outOfEnergy = ids => `Mind ${ids.map(id => '#' + id).join(', ')} ${ids.length > 1 ? 'are' : 'is'} out of energy today. Energy refills at 00:00 UTC, or bring other Minds.`;
