// Gem packs sold for ETH on Robinhood Chain (shared by the shop screen and the server).
// Prices are in ETH; the server checks the payment on-chain before adding Gems. Change prices here.
// usd: the price in a dollar stablecoin (owner set 2026-11-02). A pack bought with the stablecoin is recorded as 'id:usd'.
export const GEM_PACKS = [
  { id: 'pouch', name: 'Pouch of Gems', gems: 50, eth: '0.002', usd: 5, icon: '💎' },
  { id: 'bag', name: 'Bag of Gems', gems: 120, eth: '0.0045', usd: 10, icon: '💎💎', tag: '+20% bonus' },
  { id: 'chest', name: 'Chest of Gems', gems: 300, eth: '0.01', usd: 20, icon: '🧰', tag: '+50% bonus' },
  { id: 'vault', name: 'Vault of Gems', gems: 800, eth: '0.025', usd: 50, icon: '🏦', tag: 'Best value' },
];
// 'bag' → { pack, usd: false } · 'bag:usd' → { pack, usd: true }
export const packOf = key => { const [id, cur] = String(key || '').split(':'); const pack = GEM_PACKS.find(x => x.id === id) || (id === 'loaner' ? { ...LOANER_PRICE, gems: 0, loaner: true } : null); return pack && (!cur || cur === 'usd') ? { pack, usd: cur === 'usd' } : null; };
// 🪪 one Loaner Mind (comes with its AI): product keys 'loaner' (ETH) / 'loaner:usd', or 120 Gems (server op)
export const LOANER_PRICE = { id: 'loaner', name: 'Loaner Mind', eth: '0.0045', usd: 10, gems: 120 };
export const CHAIN_ID = 4663;   // Robinhood Chain
