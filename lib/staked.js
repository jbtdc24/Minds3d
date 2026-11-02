// Staked Minds still count for the player who staked them. Staking moves the NFT into a staking contract, so
// ownerOf() shows the contract, not the player. The chain still knows who it came from: if a Mind now sits in a
// contract and the last time it left this wallet it went to exactly that contract, it is this player's staked Mind.
// STAKING_CONTRACTS (Vercel, comma list) limits it to known staking contracts; without it any contract counts.
// MINDS_FROM_BLOCK (optional) is where the log search starts (the collection's first block).
import { getAddress, parseAbiItem } from 'viem';
import { client, CONTRACT, ownersOf } from './chain.js';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)');
const TTL = 10 * 60_000, cache = new Map(), code = new Map();
const allowList = () => (process.env.STAKING_CONTRACTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
async function isContract(a) {
  if (!code.has(a)) code.set(a, client.getCode({ address: a }).then(c => !!c && c !== '0x').catch(() => { code.delete(a); return false; }));
  return code.get(a);
}
export async function stakedBy(address) {
  const me = getAddress(address), hit = cache.get(me);
  if (hit && Date.now() - hit.at < TTL) return hit.ids;
  try {
    const logs = await client.getLogs({ address: CONTRACT, event: TRANSFER, args: { from: me }, fromBlock: BigInt(process.env.MINDS_FROM_BLOCK || 0), toBlock: 'latest' });
    const last = new Map();   // token → where it went the last time it left this wallet
    for (const l of [...logs].sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex)) last.set(Number(l.args.tokenId), getAddress(l.args.to));
    const ids = [...last.keys()].filter(id => id >= 1 && id <= 3333);
    const now = ids.length ? await ownersOf(ids) : {}, allow = allowList(), out = [];
    for (const id of ids) {
      const holder = now[id];
      if (!holder || holder === me || holder !== last.get(id)) continue;   // sold on, came back, or burned
      if (allow.length ? allow.includes(holder.toLowerCase()) : await isContract(holder)) out.push(id);
    }
    out.sort((a, b) => a - b);
    cache.set(me, { at: Date.now(), ids: out });
    return out;
  } catch {
    return hit?.ids || [];   // chain trouble: keep the last good answer, never fail a login over this
  }
}
