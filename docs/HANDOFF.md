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

## NEXT TASKS — round 6 (owner 2026-10-30), do in this order
1. [x] Kill the annoying pulsing/thunder sound (world-map lightning boom + adventure footsteps) → soft rare rumble, quiet steps.
2. [x] Inventory vs 📦 storage are duplicates → 📦 = island storage drawer with Place buttons; Inventory only lists resources.
3. [x] Everything buyable with Gems too (seeds, supplies, troops, buildings, permits, airships): gemPrice(cost) in rules.js.
4. [x] Adventure islands must look different per biome (volcano, snow, crystal, mushroom, ruins, garden, dragon, storm):
   recolored ground + trees, biome nodes, monsters themed + show their level; level = spot tier+1 (already scales HP).
5. [x] Building upgrades (levels 1-3: more HP/effect), raid revenge button from the raid log, bosses per tier in adventures.
6. [ ] Cinematic light/particles in island/raid/adventure (task D). 7. Gems real-money payments (owner choice).
8. Later: Train Mind / Auto Battle modes ("coming soon" tiles), custom domain play.minds.games.

## Round 5 (owner 2026-10-30)
Remaining now: D (cinematic light/particles in island/raid/adventure scenes), richer world-map detail, Gems payments (owner choice),
building upgrades, raid replays/revenge. OWNER TODO: run supabase/005_admin.sql, set Vercel env ADMIN_ADDRESSES.
A. [x] (code done; OWNER MUST: run supabase/005_admin.sql + set Vercel env ADMIN_ADDRESSES=<wallet>) Admin/dev tools only the owner can use: server checks ADMIN_ADDRESSES (Vercel env, comma list of wallets) — not in the repo.
   Hidden admin screen (open with a secret code in Settings): give Dust/Gems/items, ban / suspend / unsuspend, player lookup,
   cheat meter (flags table: suspicious adventure/raid submits, rate-limit hits). Needs supabase/005_admin.sql (owner runs).
B. [x] Home island: remove the plank bridges; each islet gets a portal, main island has a portal; Minds teleport between them.
C. [x] (v1 done: worldmap.js pixel buffer, biomes, smoke/lightning/birds/clouds; can get more detail) World map in detailed PIXEL ART like the refs (pixel buffer scaled up): different biome/boss islands (volcano with lava +
   smoke, crystal, ice, giant mushroom, ruins/portal, dragon nest), baked shadows on clouds, particles (smoke, sparkles, birds, wind).
E. [x] (fixed: old islands had 0 troops → v4 starter army) Raid button "doesn't work" (reported twice) — check live with an OLD account (no troops? modal? error?).
F. [x] Building takes time like CoC: a free Mind walks over and builds (timer by building), builders = Minds you own (min 1),
   Gems finish instantly. Show timers/progress bars on the island.
G. [x] Island inventory/storage must be visible: stored buildings in the Inventory window (Items tab) + a 📦 button on the island.
H. [x] (pixel airship sprites + cloud trail) Airship flight + world map must look pixel-art/cinematic (sprite ship, parallax clouds, no smooth vector shapes).
I. [x] (echo bus, new hooks, wind whoosh, fanfare horn; owner may want more) Audio: catchier music, better SFX (the flying/whoosh sounds are bad).
D. [ ] Same treatment for the island/raid/adventure scenes: cinematic light, baked shadows, wind, particles.
(older list below)
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
