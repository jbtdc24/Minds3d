// Gem packs sold for ETH on Robinhood Chain (shared by the shop screen and the server).
// Prices are in ETH; the server checks the payment on-chain before adding Gems. Change prices here.
export const GEM_PACKS = [
  { id: 'pouch', name: 'Pouch of Gems', gems: 50, eth: '0.0004', icon: '💎' },
  { id: 'bag', name: 'Bag of Gems', gems: 120, eth: '0.0009', icon: '💎💎', tag: '+20% bonus' },
  { id: 'chest', name: 'Chest of Gems', gems: 300, eth: '0.002', icon: '🧰', tag: '+50% bonus' },
  { id: 'vault', name: 'Vault of Gems', gems: 800, eth: '0.005', icon: '🏦', tag: 'Best value' },
];
export const CHAIN_ID = 4663;   // Robinhood Chain
