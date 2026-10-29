// Which Minds a wallet owns, cached briefly per server instance. Guests get the demo Minds.
import { ownersOf, balanceOf, SUPPLY } from './chain.js';
import { getAddress } from 'viem';

const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('rpc timeout')), ms))]);
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
// Fast path (well under a second): the client sends the Minds it saw last time; if the wallet still owns all of
// them AND holds exactly that many, the list is complete. Anything else (bought / sold a Mind) = full scan.
export async function ownedMinds(address, known = []) {
  const me = getAddress(address);
  try {
    const [count, now] = await within(Promise.all([balanceOf(me), known.length ? ownersOf(known) : {}]), 5000);
    if (count === 0) return [];
    if (known.length === count && known.every(id => now[id] === me)) return [...known].sort((a, b) => a - b);
  } catch { /* RPC trouble: use the scan below (it falls back to the last good scan) */ }
  const owners = await allOwners();
  return Object.entries(owners).filter(([, o]) => o === me).map(([id]) => +id).sort((a, b) => a - b);
}
// fresh, uncached check of just these ids (one small multicall): used when joining a match
// the public RPC is sometimes slow or drops calls: then fall back to the last full scan instead of failing
export async function stillOwns(address, ids) {
  const me = getAddress(address);
  try {
    const now = await within(ownersOf(ids), 6000);
    if (ids.every(id => now[id])) return ids.every(id => now[id] === me);
  } catch { /* fall back below */ }
  const owners = await allOwners();
  return ids.every(id => owners[id] === me);
}
