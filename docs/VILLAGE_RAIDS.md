# Village + Raids (live task list — update status after every step)

Owner OK'd 2026-10-30: farming-game village (more crops, houses, mill, barn) + Clash-of-Clans-style defend/attack.
No SQL needed: buildings, shields and raid snapshots live in `islands.state` (jsonb).

## Buildings (`st.b = [{ id, type, k }]`, k = top-left tile; their tiles get `{ s: 'b' }` so weeds never grow there)
| type | size | cost | effect |
|---|---|---|---|
| house | 2×2 | 200✨ 15🪵 | +2 farm plots (max 4) |
| mill | 2×2 | 400✨ 25🪵 10🪨 | crops sell +25% (max 1) |
| barn | 2×2 | 300✨ 20🪵 | protects 1,000✨ from raids each (max 2) |
| wall | 1×1 | 3🪨 | blocks raiders, HP 60 (max 80) |
| tower | 1×1 | 150✨ 10🪵 15🪨 | shoots raiders 4.5 tiles, 8 dmg/s, HP 120 (max 2 + 1 per Mind, ≤6) |
| trap | 1×1 | 40✨ 4🪵 | hidden, 35 dmg once per raid (max 6) |
Guards: each Mind you own (max 4, at least 1) defends near the house: HP 140, 10 dmg/s melee.
Demolish refunds 50%.

## Raid (deterministic sim `web/src/island/raid.js`, 0.1 s ticks, 90 s)
- Find: server picks a target (other holder, not shielded, ≥ 300✨, active in 14 days) and stores a snapshot in the
  attacker's state; guests / offline / nobody found → practice raid vs a generated bot village (no loot).
- Attack: up to 3 of your Minds (1⚡ each, ranked energy) + spells Rage (+60% dmg 6 s), Heal (+60 HP area), Bolt (90 dmg).
  Drop on land ≥ 3 tiles from any building. Raiders go for the nearest building, break walls in the way.
- Client sends drops/spells with tick numbers; the server re-runs the same sim on the snapshot = real result.
- Stars: ★ 50% destroyed, ★ house destroyed, ★ 100%. Loot = destroyed% × 25% of unprotected Dust (barns protect),
  max 2,000. Defender gets an 8 h shield after any raid with ≥ 1 star. Log of raids on your island.

## Status
- [x] rules: buildings in rules.js + art (island/buildings.js) + build mode UI (🔨 Build, tap building = move/remove)
- [ ] raid sim + raid screen (practice vs bot village first)
- [ ] server: find/attack route, loot, shields, raid log
- [ ] test + ship
