// Which Minds a wallet owns, cached briefly per server instance. Guests get the demo Minds.
import { ownersOf, SUPPLY } from './chain.js';
import { getAddress } from 'viem';

export const DEMO_MINDS = [49, 14, 8];       // free-trial Minds (on-chain ids): a Common + two Uncommons
// full scan of all 3,333 owners: cached 2 min; if the RPC fails we fall back to the last good scan
let cache = { at: 0, owners: null }, pending = null;
async function allOwners() {
  if (cache.owners && Date.now() - cache.at < 120_000) return cache.owners;
  pending ||= ownersOf(Array.from({ length: SUPPLY }, (_, i) => i + 1))
    .then(owners => { cache = { at: Date.now(), owners }; return owners; })
    .catch(e => { if (cache.owners) return cache.owners; throw e; })
    .finally(() => { pending = null; });
  return pending;
}
export async function ownedMinds(address) {
  const me = getAddress(address), owners = await allOwners();
  return Object.entries(owners).filter(([, o]) => o === me).map(([id]) => +id).sort((a, b) => a - b);
}
// fresh, uncached check of just these ids (one small multicall): used when joining a match
export async function stillOwns(address, ids) {
  const me = getAddress(address), now = await ownersOf(ids);
  return ids.every(id => now[id] === me);
}
