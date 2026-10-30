# HANDOFF — read this first (next AI session: continue from the top of "NEXT TASKS")

Owner: Mindclash game owner. Hates long text: short replies, decide for them, build/test/ship without asking
(stop only for Supabase SQL, Vercel settings, money/payments, OpenArt credits). Everything is drawn in CODE (no OpenArt).

## Project
- Repo https://github.com/jbtdc24/Minds3d (local D:\ANIMOCA MINDS\MINDS.GAMES\Minds3d). Live https://minds3d.vercel.app
- Work on branch `island`, then `git checkout main && git merge --ff-only island && git push origin main island` (Vercel deploys main).
- Branch `pets` = abandoned Mind Summoners duel (owner hated it). Don't bring it back.
- Test: `node tools/test_server.mjs` (103+ tests, must pass), `node tools/sim_raid.mjs` (raid balance), `node tools/sim_duel.mjs`.
- Local: no-cache static server `python -I <scratchpad>/nocache_server.py "<repo>/web" 5181` then open http://localhost:5181/?debug
  ("Practice offline vs bots" → lobby → Mind Island). `?debug` exposes window.__island / window.__adv step helpers.
- Server = one Vercel function api/router.js → lib/routes/*.js; DB = Supabase via lib/db.js; islands.state is jsonb (no SQL needed
  for new island features). Shared rules run in browser + server: web/src/island/rules.js (act()), raid.js, adventure.js.

## Game today (all live)
- Duel: original crown Prize Duel. Prizes = 7 random of 1-15 (hidden, next LOW/MID/HIGH hint). Ranked stake: points × Minds on win/loss.
  Filler bots in ranked/classic have player names + think 1.5-10 s (owner asked to hide bots; stats count them half).
- Mind Island (web/src/island/): floating sky island 64×48 tiles (gen.js v2: old 48×36 island centred + islets + plank bridges;
  saves migrate v1→v2→v3 in rules.normalize). Home + well are movable buildings. Build: cottage, mill, barn, wall, tower, trap,
  decorations (flowers, lamp, fence, bench, banner; gem-only lantern, crystal, fountain). Storage stash (12).
- Raids (raid.js sim, raidview.js screen, lib/routes/raid.js): troops trained with Dust in Shop→Army (inv troop_*), army cap 10 (+1/Mind, max 13),
  hero (your Mind, Battle Cry) or Captain, spells Rage/Heal/Bolt, 2 min, stars, capped loot, shields, raid log. Server replays inputs.
  Targets: real players (~55%) or game villages with player-style names (botVillage, villageName).
- Adventure (adventure.js content, advview.js screen, lib/routes/adventure.js): hero walks a wild island, gathers nodes + cuts
  grass/trees/rocks (40/hour cap), fights slimes/boars/bandits/Ogre, potions only (no regen), loot checked by server.
  CURRENT world map = popup with 4 AREAS (unlock by beating previous Ogre, Sky Fuel cost) — owner wants it replaced (task 1).
- Economy: Dust ✨, Gems 💎 (st.gems, server-only; Ogres drop 2), Shop tabs Seeds/Army/Supplies/Gems/Sell/Land (SHOP + RECIPES in rules.js).
- Audio: web/src/audio.js synth (SFX + songs menu/battle/title/raid/adventure).

## NEXT TASKS (in order)
1. [DONE 2026-10-30] World map screen (web/src/island/worldmap.js, #s-map): 12 SPOTS + home, airships SHIPS (adventure.js) /
   SHIP_COSTS + act 'ship' (rules.js), server checks ship tier + fuel. Possible polish: richer island art (bigger undersides,
   mushrooms/portals like the refs), zoom buttons, show which islands you've beaten.
   (original brief:) **World map as its own full screen (not a popup), drawn in code like the owner's references**: sky with clouds, many floating
   islands with rocky undersides, waterfalls, rope bridges, mushrooms, portals/crystals. Islands = travel points grouped in tiers.
   **Airships gate travel**: st.ship tier 0-3 (0 = Balloon raft: home cluster only; 1 Sky Skiff; 2 Cloud Galleon; 3 Storm Cruiser).
   Buy/upgrade in Shop (Dust+wood/stone, or Gems). A point needs ship tier ≥ its tier; flying costs ⛽ fuel = tier.
   Your airship sprite flies across the map to the picked island, then the adventure starts. Replace AREAS gating (st.au) with ship tier
   (keep st.au harmless). Server must check ship tier + fuel in lib/routes/adventure.js start.
2. Gems for real money: WAITING on owner (crypto on Robinhood Chain to a treasury wallet vs card provider). Then: SQL table
   `payments(id text primary key, player_id, gems, amount, created_at)` (owner runs SQL), verify tx/webhook server-side, credit st.gems once.
3. More island detail (owner: "boring"): mushrooms, rocks clusters, waterfalls off island edges, floating crystals, butterflies, birds.
4. Building upgrades (levels), raid replays + revenge button, more adventure bosses per tier.
5. Polish: phone layouts (check 740×360), sound everywhere.
