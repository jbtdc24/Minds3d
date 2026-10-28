// Read Mind ownership straight from the contract on Robinhood Chain (no third-party APIs).
import { createPublicClient, http, defineChain, getAddress } from 'viem';

export const CONTRACT = '0x947c1501fdeb97d2aa0642c14afbd8a99427d227';
export const SUPPLY = 3333;
export const robinhood = defineChain({
  id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ROBINHOOD_RPC || 'https://rpc.mainnet.chain.robinhood.com'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
});
const client = createPublicClient({ chain: robinhood, transport: http(undefined, { retryCount: 4, retryDelay: 400 }) });
const ABI = [{ name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] }];

// owners of the given token ids -> { id: checksummed address | null }
export async function ownersOf(ids, chunk = 400) {
  const out = {};
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const res = await client.multicall({ allowFailure: true, contracts: part.map(id => ({ address: CONTRACT, abi: ABI, functionName: 'ownerOf', args: [BigInt(id)] })) });
    res.forEach((r, k) => { out[part[k]] = r.status === 'success' ? getAddress(r.result) : null; });
  }
  return out;
}
// every Mind a wallet owns (scans all 3,333 in ~9 multicalls)
export async function mindsOwnedBy(address) {
  const me = getAddress(address), all = await ownersOf(Array.from({ length: SUPPLY }, (_, i) => i + 1));
  return Object.entries(all).filter(([, o]) => o === me).map(([id]) => +id);
}
export { client };
