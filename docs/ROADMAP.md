# Mindclash roadmap (live task list — update the status after every step)

Owner direction (2026-10-30): **everything drawn in code** (like Mind Island): UI, arena, creatures ("pets"),
effects. No OpenArt art in the game. Smooth, lively animation like a Pokémon game. Duel must look and feel exciting.
OpenArt credits: never spend without asking (always quality "low", check `openart_model_cost` first).

Design reference: `docs/MIND_SUMMONERS.md` (rules, numbers, Wilds, raids, bonding, economy).
Balance: `node tools/sim_summon.mjs 4` (families 45-55%, skills 45-55%). Server tests: `node tools/test_server.mjs`.
Branch flow: work on `island`, test locally (python no-cache server on web/, port 5181), then fast-forward `main` (Vercel auto-deploys).

## Status legend: [x] done · [~] in progress · [ ] todo

### A. Duel look & feel (code-drawn, landscape)
- [x] Live-feel rounds engine (secret deploy → 6 s server-simulated battle, timeline playback)
- [x] Landscape layout (lanes left→right, gates left/right, tray at bottom, "turn your phone" in portrait)
- [~] Canvas battle renderer: code-drawn landscape island arena (animated water, swaying trees, flowers)
- [ ] Code-drawn creatures v2: bigger, nicer pixel art per family/stage, outlines, highlights
- [ ] Smooth procedural animation: idle breathing, walk bob + squash/stretch, attack wind-up → lunge → recoil,
      hurt flash + knockback, faint (spin/fade + sparkle), summon pop with dust, element-coloured hit particles,
      projectiles for ranged, damage numbers, screen shake, hit-stop on big hits
- [ ] Summoners at the gates: Mind chibi with idle/cast/hurt/win animations; gate crystal glows/cracks with HP
- [ ] UI pass (code-drawn): name plates, tray, cards with code-drawn portraits, spacing check desktop + phone
- [ ] Remove OpenArt sprites from the duel (keep files in art/ only)

### B. Collection (design §6)
- [ ] Creature DB tables (bonded to Mind token ids + account Barn), SQL migration
- [ ] Starter decks stay free; custom deck builder from owned creatures; codex

### C. The Wilds (Pokémon-like exploration, design §7)
- [ ] Wilds map next to the island (code-drawn, walk with your Mind, tall grass)
- [ ] Encounters with wild creatures → 1v1 battle scene (Pokémon-style presentation) → capture chance
- [ ] Trail stamina per Mind, KO + heal with crops, loot (Dust, wood/stone, Mindstone), zones by Explorer Rank

### D. Growing creatures (§6): feed, merge, evolve, sell, shinies
### E. Raids (§8): guards at 3 gates, raid battles, loot caps, burn/repair, shields, revenge
### F. Town (§9): live plaza, friendly duels
### G. Seasons: ranked season reset SQL (owner runs), new families, weekly bosses

## Notes for the next session
- Island farming is live (clear/regrow, plots, crops, shop, inventory). Minds work jobs on the island.
- `web/src/summon/` = duel (cards.js data, engine.js live battle, match.js server wrapper, bot.js, art.js code sprites,
  arena.js old top-down arena). `web/src/island/` = island (gen, art, rules, store, chibi).
