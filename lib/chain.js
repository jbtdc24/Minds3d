// Read Mind ownership straight from the contract on Robinhood Chain (no third-party APIs).
import { createPublicClient, http, defineChain, getAddress } from 'viem';

export const CONTRACT = '0x947c1501fdeb97d2aa0642c14afbd8a99427d227';
export const SUPPLY = 3333;
export const robinhood = defineChain({
  id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ROBINHOOD_RPC || 'https://rpc.mainnet.chain.robinhood.com'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
});
const client = createPublicClient({ chain: robinhood, transport: http(undefined, { retryCount: 2, retryDelay: 300 }) });
const ABI = [{ name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] }];

// owners of the given token ids -> { id: checksummed address | null }
export async function ownersOf(ids, chunk = 400) {
  const out = {}, parts = [];
  for (let i = 0; i < ids.length; i += chunk) parts.push(ids.slice(i, i + chunk));
  // a few multicalls in parallel keeps the full scan well under the serverless time limit
  for (let i = 0; i < parts.length; i += 3) {
    await Promise.all(parts.slice(i, i + 3).map(async part => {
      const res = await client.multicall({ allowFailure: true, contracts: part.map(id => ({ address: CONTRACT, abi: ABI, functionName: 'ownerOf', args: [BigInt(id)] })) });
      res.forEach((r, k) => { out[part[k]] = r.status === 'success' ? getAddress(r.result) : null; });
    }));
  }
  return out;
}
// how many Minds a wallet holds (one call)
export async function balanceOf(address) {
  return Number(await client.readContract({ address: CONTRACT, abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }], functionName: 'balanceOf', args: [getAddress(address)] }));
}
// every Mind a wallet owns (scans all 3,333 in ~9 multicalls)
export async function mindsOwnedBy(address) {
  const me = getAddress(address), all = await ownersOf(Array.from({ length: SUPPLY }, (_, i) => i + 1));
  return Object.entries(all).filter(([, o]) => o === me).map(([id]) => +id);
}
export { client };
