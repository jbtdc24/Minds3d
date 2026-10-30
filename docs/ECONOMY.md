# Mindclash economy (run `node tools/sim_economy.mjs` for live numbers)

1 Gem ≈ 100 Dust of value. Wood ≈ 5 Dust, stone ≈ 6 Dust.

## How the game loop connects
Ranked needs ⚡ energy → the island's Energy Well makes shards (3 = +1 energy) → Ranked wins pay Dust to the island →
Dust grows the island, trains troops and buys airships → raids and adventures earn more Dust, herbs and Gems.
Ranked stays fair: the island gives more games, never more power in a duel.

## Income per day (active player)
| Source | Dust / day |
|---|---|
| Farming, 12 plots (best crop for 3 sessions: melons) | ~3,200 |
| Farming, 24 plots | ~6,500 |
| Adventures, 5 runs at ~40% of a level 1-2 island | ~1,000-1,500 |
| Raids on game villages, 6 × 2 stars | ~500-3,000 |
| Ranked, 3 games per Mind | +60 win / +15 loss per Mind |
| Energy Well | 6 shards = 2 ranked energy, free |

## Costs
| Thing | Price | About |
|---|---|---|
| Cottage / Barn / Tower | 500 / 1,000 / 600 Dust + materials | hours of farming |
| Mill | 1,500 + materials | half a day |
| Sky Skiff / Cloud Galleon / Storm Cruiser | 2,000 / 10,000 / 30,000 | 1 day / 3-4 days / 1-2 weeks |
| Army (10 space) | ~215 Dust; you only lose what you send | |
| Raid supplies | 5 Dust per camp space | |
| Energy refill | 3 shards, 300 Dust or 3 Gems (max 3 per Mind per day) | |

## Raid profit on game villages (2 stars, about 70% destroyed, full army lost)
Level 1: +90 · Level 2: +300 · Level 3: +510. Before this pass raids LOST 140-215 Dust each.

## Gem packs (ETH on Robinhood Chain)
50 = 0.002 · 120 = 0.0045 · 300 = 0.01 · 800 = 0.025. The 50 pack is about 1.5 days of farming.
Prices are in `web/src/gems.js`.
