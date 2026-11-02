// Gem packs paid in a dollar stablecoin on Robinhood Chain (an ERC-20). Robinhood Chain has no Circle USDC; its
// official dollar token is USDG (docs.robinhood.com/chain/contracts). Off until the owner sets STABLE_TOKEN in Vercel.
// A token payment is a call to the token contract, so the proof is the Transfer log in the receipt: from the player's
// wallet, to the treasury, on that exact token, for at least the price. Decimals are read from the token itself.
import { getAddress, parseAbi, parseEventLogs } from 'viem';
import { client } from './chain.js';

export const DEFAULT_STABLE = { symbol: 'USDG', address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' };   // official list, 2026-11
const ERC20 = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)', 'function decimals() view returns (uint8)']);
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

export function stableToken() {
  try { return process.env.STABLE_TOKEN ? { address: getAddress(process.env.STABLE_TOKEN), symbol: process.env.STABLE_SYMBOL || DEFAULT_STABLE.symbol } : null; }
  catch { return null; }
}
let dec = null;
export async function stableDecimals(token) {
  if (dec?.address === token.address) return dec.n;
  const n = Number(await client.readContract({ address: token.address, abi: ERC20, functionName: 'decimals' }));
  if (!Number.isInteger(n) || n < 0 || n > 36) throw new Error('bad token decimals');
  dec = { address: token.address, n };
  return n;
}
// price in the token's smallest unit, from a whole-dollar price ("5" → 5 × 10^decimals)
export const toUnits = (usd, decimals) => BigInt(Math.round(Number(usd) * 100)) * 10n ** BigInt(decimals) / 100n;
// how much of the token this receipt moved from → to (0n if none)
export function paidIn(receipt, token, from, to) {
  const logs = parseEventLogs({ abi: ERC20, logs: receipt.logs || [], eventName: 'Transfer', strict: false });
  return logs.filter(l => same(l.address, token) && same(l.args?.from, from) && same(l.args?.to, to)).reduce((s, l) => s + BigInt(l.args.value || 0), 0n);
}
