# The game's real name is MINDS CLASH (internal keys still say mindclash so nobody gets signed out)
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

## Notes 2026-10-30 late: islets + portals REMOVED from the home island (owner: not functional). Admin gifts now show (refreshIsland). Live smoke test: scratchpad smoke.mjs pattern (guest → island/shop/raid/adventure/gems/admin) all OK.

## Round 7 status (2026-10-30): DONE = raid fix (chibi import), raid fee, lo-fi music, centred messages, Energy Well + energy refills, ranked Dust,
lobby island tile, island tour, economy pass (docs/ECONOMY.md), retest list (docs/TESTLIST.md). Remaining ideas: richer world-map/island detail, Train Mind / Auto Battle, custom domain.
RULES FOR NEXT SESSION: (1) test wallet-account paths, guests hide bugs; (2) run the undefined-name scan before shipping:
`npx --yes eslint@8 --no-eslintrc --env browser,es2022,node --parser-options=sourceType:module,ecmaVersion:latest --rule '{"no-undef":"error"}' web/src lib api`
(3) python patch scripts must assert every replacement (a silent miss cost us all the music); (4) never push with a failing test.

## Supabase is eu-west-2 (London), so vercel.json regions = lhr1.
## Launch audit (2026-10-31): DEPLOYED, live commit a597fc2+. Read docs/LAUNCH_REPORT.md first; also docs/AUDIT.md, DEPLOY.md, REAL_MONEY.md. Adventures run on web/src/island/advsim.js and the server replays taps. OWNER TODO: run supabase/008_sessions.sql, one real Gem purchase, two-wallet chat test, confirm backups, tell us the Supabase region so vercel.json `regions` can match it. Open decisions: Town rewards, bot disclosure.

## Round 9 notes (2026-10-31): live chat = words sent directly over Supabase broadcast the moment you press Send, server copy confirms (unconfirmed lines vanish after 15 s). One socket may join a topic once: send on a watched topic via the watch() handle, never a second channel. Player counts are hidden from players (admin only).
OWNER IDEA FOR SOON: an office in town (not designed yet: ask what it is for).

## Round 8 status (2026-10-30): ALL 10 TASKS BELOW BUILT AND SHIPPED. OWNER MUST RUN supabase/007_community.sql (chat text, mail, reports, AI keys, cup, town need it; until then those say "being set up").
Town rebuilt 2026-10-31: web/src/town.js (logic) + townart.js (art). Live via Supabase presence channel town-live; names and chat text always come from the server, pings carry nothing. Friends and duel chat ping + poll every 2.5-4 s. Original map, do not copy a specific game's map.
New files: web/src/island/jobs.js (Mind jobs, parseTask), web/src/mindtalk.js (talk panel), web/src/town.js + lib/routes/town.js (Mind Town), lib/raiders.js (sky raiders), lib/routes/agent.js + docs/MIND_API.md (AI players), lib/routes/cup.js (Daily Siege Cup, real players only), lib/routes/mail.js, report.js, lib/feed.js (Town Board).
Talking to a Mind is a word parser, not a real AI: connecting a real model needs an API key/cost decision from the owner. HelloMinds still has no confirmed public API.
Not checked yet with real players: town with 2+ people, cup payout day, gibberish and music by ear. Raiders use game-made names and the log does not say they are game-run; Cups must stay real-players-only.
Later: town owner lookup for tapped Minds, town chat moderation tools, Season Pass.

## NEXT TASKS — round 8 (owner 2026-10-30) — do top to bottom
1. [ ] Bugs: lobby title cropped; Friends error "Cannot read properties of null (reading 'player')"; huge "Tap where..." message box; explain/remove unclear messages.
2. [ ] Music: never overlaps; different music per mode; softer catchy duel song.
3. [ ] Minds talk cute gibberish (town/island, when working); small cute screams in raids.
4. [ ] Mail (announcements, updates, admin can send). Free friend chat, deleted after 30 days. Unfriend. Report bug/player; admin can read reports.
5. [ ] Admin stats: registered, active, playing.
6. [ ] More camp space + more ways to raid. NPC raiders attack inactive/any villages sometimes.
7. [ ] Mind tasks: give each Mind a preset or custom job to grind, tap and talk to a Mind (one account, every Mind it owns).
8. [ ] Mind Player API: private keys so an outside AI can play the whole game (same limits, log, Ranked labelled). Server-run adventure.
9. [ ] Gem entry tournaments: entry pool, winners take it. REAL PLAYERS ONLY, no disguised bots. No real-money cash-out without legal advice.
10. [ ] Mind Town: all 3k Minds live there, walk around, interact; a place to keep open even AFK; something other games don't have.

## NEXT TASKS — round 7 (owner 2026-10-30)
1. [ ] Raid button "doesn't work again" — never fail silently: show every error, loading feedback; find root cause.
2. [ ] Raids cost a Dust fee (entry fee) — part of the economy.
3. [ ] Audio: soft lofi/relaxing music everywhere except PvP duels (keep battle there).
4. [ ] Connect PvP to the island: duel wins pay Dust to your island (stake-scaled), small consolation for losses.
5. [ ] Buy more ranked energy (Dust or Gems, max 3 refills per Mind per day).
6. [ ] Economy math pass: income vs costs (farming, adventures, raids, buildings, airships, gems) → docs/ECONOMY.md + rebalance.

## NEXT TASKS — round 6 (owner 2026-10-30), do in this order
1. [x] Kill the annoying pulsing/thunder sound (world-map lightning boom + adventure footsteps) → soft rare rumble, quiet steps.
2. [x] Inventory vs 📦 storage are duplicates → 📦 = island storage drawer with Place buttons; Inventory only lists resources.
3. [x] Everything buyable with Gems too (seeds, supplies, troops, buildings, permits, airships): gemPrice(cost) in rules.js.
4. [x] Adventure islands must look different per biome (volcano, snow, crystal, mushroom, ruins, garden, dragon, storm):
   recolored ground + trees, biome nodes, monsters themed + show their level; level = spot tier+1 (already scales HP).
5. [x] Building upgrades (levels 1-3: more HP/effect), raid revenge button from the raid log, bosses per tier in adventures.
6. [x] (v1: island/cinema.js god rays, grade, motes, vignette, drop shadows, grass wind) Cinematic light/particles in island/raid/adventure (task D).
7. [x] Gems for ETH on Robinhood Chain (lib/routes/gems.js, web/src/gems.js packs, supabase/006_payments.sql). OWNER TODO: run 006 SQL + set Vercel env TREASURY_ADDRESS.
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
