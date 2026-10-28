// Which Minds a wallet owns, cached briefly per server instance. Guests get the demo Minds.
import { ownersOf, SUPPLY } from './chain.js';
import { getAddress } from 'viem';

export const DEMO_MINDS = [49, 14, 8];       // free-trial Minds (on-chain ids): a Common + two Uncommons
let cache = { at: 0, owners: null };
async function allOwners() {
  if (cache.owners && Date.now() - cache.at < 60_000) return cache.owners;
  cache = { at: Date.now(), owners: await ownersOf(Array.from({ length: SUPPLY }, (_, i) => i + 1)) };
  return cache.owners;
}
export async function ownedMinds(address) {
  const me = getAddress(address), owners = await allOwners();
  return Object.entries(owners).filter(([, o]) => o === me).map(([id]) => +id).sort((a, b) => a - b);
}
// fresh, uncached check right before a ranked match starts
export async function stillOwns(address, ids) {
  const me = getAddress(address), now = await ownersOf(ids);
  return ids.every(id => now[id] === me);
}
