# The game's real name is MINDS CLASH (internal keys still say mindclash so nobody gets signed out)
# HANDOFF — read this first (next AI session: continue from the top of "NEXT TASKS")

## >>> START AT "ROUND 12" BELOW <<<
## CURRENT STATUS (2026-11-03, late)
ROUND 12 SHIPPED to main (all tasks below). Only open part: real Minds AI chat per player needs Minds Connect = OWNER gives the OAuth client ID (see task 10).
Live on main (latest 201902d): everything below through ROUND 11, plus village helpers. 465 tests pass; fuzz, economy audit and full mutation check pass.
Done 2026-11-02/03: all saved tasks 0-14, round 10 (staked Minds, island edit mode, boss fortress, Giants, helpers), round 11 (cosmetics: 4 card backs, 4 frames, 3 skies, 3 name colours, rival sees looks; victory confetti; 2 new duel arenas; painted loading sky; warmer Mind Town).
STABLE_TOKEN is set in Vercel (owner, 2026-11-02) and redeployed.
OWNER TODO: (1) one small real USDG purchase and one ETH purchase; (2) ask Animoca for Minds API access (send https://minds3d.vercel.app/api/agent?format=tools); (3) launch list below.
Not checked with real players yet: burning village + restore, edit-mode group moves, cup army picker, staked Minds at login, rivals seeing cosmetics, two-player duel timing.
Owner rules: keep going in the same chat, no questions, short plain replies, update this file after every task. OpenArt allowed for art, QUALITY ALWAYS LOW.
Minds Builder API (2026-11-03): owner got a Builder API key (JWT, role builder, expires 2027-11). Checked: works. Base https://api.build.hellominds.ai, header `X-Api-Key: <key>` (OAuth tokens use Bearer). Docs https://build.hellominds.ai/docs/api, npm @animocabrands/minds-client-lib. GET /v1/humans/{humanId}/minds lists the owner's 7 Minds; messaging = POST /v1/messaging/conversation + /message, replies via /histories/{alias} or /events. NEVER commit the key: it goes in Vercel env MINDS_API_KEY (owner adds). Next: decide what to build (real Mind talk in mindtalk.js, or Minds Connect sign-in).
If a table is added to the prototype-lock line in rules.js, also update tools/mutation_check.mjs line 56.

## ROUND 12 (owner 2026-11-03) — NEXT TASKS, do top to bottom (quick fixes first, big Mind Autopilot last)
1. [x] Opening screen (logo top, Tap to Play bottom; style.css .boot): title text covers the characters; Start/Enter button covers the 3 legendary Minds. Move them.
2. [x] Island build menu scrolls (.isl-seeds max-height + overflow) (list of things to build).
3. [x] DONE: gold ✨ button in the lobby top bar + "Change my looks" in your profile + Style is the 2nd shop tab. Was: owner can't see them. Make the ✨ Style shop obvious (lobby/profile entry, not only Shop tab).
4. [x] Arena = hash of match id (app.js arenaFor), same on both phones. Was: two phones dueling see different backgrounds. Arena (and sky) must come from match state so both see the same.
4b. [x] lib/looks.js looksOf/withLooks (20 s cache) adds cos to profile, leaderboard, friends, Mind Town (name colour + frame-coloured tag); duels/raids already had it. Was: Paid cosmetics visible to other players EVERYWHERE (duel, town, raid, profile, friends); paid looks win over defaults.
4c. [x] CSS: coloured pixel frame, side gems, glow, diamond pattern on hand cards and reveal faces (no OpenArt needed). Was: decorate the default card back/front (OpenArt LOW allowed).
5. [x] cup.js CUP_FEE 0.10, prizePool(); GET shows prize + fee. Was: house keeps 10% of the prize pool, winner gets 90%. Show it on the cup screen.
6. [x] raid.js BOT_FUN 0.15, real pool limit 150. Was: real player villages first, bot villages only as fill (still some for fun). Game raiders on players stay.
7. [x] lib/retention.js prune() (daily cron + maybePrune on chat routes); raid logs 50; privacy page updated. Was (AI decided): all chat (friend, duel, private) deleted after 90 days; Mind Town public chat 7 days; mail 90 days; raid/attack logs keep newest 50 per player; reports 180 days. Daily cron cleans.
8. [x] town.js tap → app.js playerCard (stats, Add friend, Message, Profile, Report, Block); residents show Mind # + rarity. messages.js: anyone with a wallet can DM unless blocked (friend op 'block'); friends route returns chats. 📣 town op 'mega' (st.mega, 1 💎, 1 h). Was: Mind Town: tap ANY Mind → card with owner name, rating, wins, island level, looks; Add friend, Private chat (allowed before friends, blockable/reportable), Duel invite. 📣 Megaphone: 1 💎 puts a message over your head for 1 hour (server-checked, filtered, reportable).
9. [x] audio.js babble/squeak: high sine blips with a hop, wobble, cute syllables. Was: higher, softer gibberish (audio.js), little chirps; same for raid screams.
11. [x] 🎟️ Rank Pass (owner 2026-11-03): wallet players with no Mind play Ranked with loaner Minds (DEMO_MINDS). rules.js RANK_PASS (7 days, 5 ranked games/day, 5,000 ✨ or 30 💎), act 'rankpass' (adds days); st.rp {until, day, used}. lib/rankpass.js passOf/spendPass/refundPass; queue_join {pass:true}; queue row loadout gets 'pass'; matchmaking skips ownership + token energy for pass sides and spends the pass instead; /api/me returns rankPass. Client: Ranked tile offers it, prep screen shows loaner Minds, Shop → Supplies card. Autopilot uses the pass too.
12. [ ] Minds AI review (2026-11-03, docs read): Minds Connect is the right path. Advice to owner: 1 AI Mind per player at sign-in + "Awaken" per NFT on tap (cognition costs per Mind, unknown limits) instead of auto per NFT; ask Animoca if MINDS CLASH can be a Bazaar Skill/App (players' Minds play via our mk_ keys in "My Connections"); CSP must allow api.build.hellominds.ai; sign-in must finish in the same tab. Owner to decide.
10. [~] BUILT: lobby panel 🧠 Your Mind (web/src/autopilot.js), plans + chat-to-plan + moves in web/src/island/autoplay.js, server steps lib/routes/autopilot.js (uses agent.js runOp, so same rules; ranked by the Mind is AI-labelled via ai_until). Runs while the lobby tab is open, pauses while you play; Mind jobs farm when closed. Gems: 3 layers (warning, daily cap 3/10/25, type CONFIRM), server cap + log; only Raid/Adventure Tickets and energy. LEFT: real AI talk via Minds Connect (blocked on client ID). Was: REAL MIND TALK + MIND AUTOPILOT (showcase: "your Mind plays the game for you"):
   - Lobby side panel "🧠 Your Mind": presets (Farmer, Raider, Ranked grinder, Explorer, Balanced daily loop, Decorator) + a chat box to train it manually after a preset.
   - Mind can do everything through the existing /api/agent ops: plant/harvest, decorate, build, raid, adventure, ranked duels, visit Mind Town for rewards, then loop (e.g. farm → adventure → duel → town few hours → farm → raid).
   - OWNER DECIDED 2026-11-03: every player signs in with Minds Connect (or makes a Minds account in the flow), and the game AWAKENS ONE AI MIND PER MINDS NFT they own (POST /v1/minds/awaken, scope minds:awaken; names checked with /v1/minds/check/name, e.g. Clash-1234). Each AI Mind chats/trains/plays for its NFT (messaging:send). One at a time with progress; stop cleanly if Minds refuses (per-account limit and credit cost unknown). Sold NFT = AI Mind stops playing it in game. BLOCKER for this part: owner registers an OAuth client in https://build.hellominds.ai/console (redirects https://minds3d.vercel.app/ + http://localhost:5173/, scopes minds:awaken, messaging:send, read minds) and gives the client ID (no secret).
   - Real talk via Minds Builder API (api.build.hellominds.ai, X-Api-Key, key in Vercel env MINDS_API_KEY). Plan: server turns chat into a plan of game ops; the Mind runs the plan on the server (cron/steps), with a live log the player can watch and stop.
   - Gems: OFF by default. Turning on needs several confirmations (toggle + daily gem cap + type CONFIRM), every gem spend logged, one-tap stop.
   - Same game limits as a player; ranked games by the Mind are labelled.

## ROUND 10 (owner 2026-11-02): staked Minds, island edit mode, harder boss
- [x] Siege Cup boss fortress: raid.js bossFortress(): closed inner wall Lv3, outer wall Lv2 with one trapped gate, 4-5 Lv3 towers, 5-6 Mind guards, no farms, dark keep sprite (buildings.js bossKeepSprite), scorched land. Budget 9: simple plans average ~1 star, rare clears.
- [x] Staked Minds still count: lib/staked.js stakedBy() reads the Minds Transfer logs from the wallet; a Mind held by a contract that it last went to from this wallet = staked by this player. Used in ownedMinds (login, /api/me), stillOwns (duels, adventures, energy) and the island Mind count. Optional Vercel env: STAKING_CONTRACTS (only those contracts count), MINDS_FROM_BLOCK (log search start). Checked on the live chain 2026-11-02: RPC allows 10M blocks per search, so it searches in pieces from block 88,000,000 (first Minds transfer 88,181,971); real stakers found (34 / 1 / 4 Minds, ~1 s). The contract 0x71a92aDc34BAa4c87079840E01aF4b24A4bA6FD4 holds 603 Minds (likely the staking contract).
- [x] Island edit mode (✏️ Edit tool, key 7): tap or drag over buildings to select (drag along a wall grabs the line), "All Walls · N" chips per type, then ⬆ Upgrade all (shows total cost), ↔ Move as a group (rules.js act 'moveMany': all or nothing, ghosts show where they land), 📦 Store, 🗑 Remove. island.js paintEdit/onEditBar; the bar is created in code so old cached pages do not break.

## ROUND 11 (owner 2026-11-02): looks + cosmetics (owner: keep improving, OpenArt LOW ok, no questions)
- [x] Cosmetics (looks only): rules.js COSMETICS + act 'cosmetic' (buy once, wear, take off; st.cos). 4 card backs (web/assets/back_*.webp, OpenArt Grok Imagine 2 LOW): Ember Dragon, Frost Crystal, Moon Night (3,000 ✨), Golden Sun (15 💎). 4 CSS profile frames: Gold, Ice, Flame (5,000 ✨), Prism (20 💎). Shop → ✨ Style tab. web/src/cosmetics.js wear().
- [x] Duels show both sides' card back + frame (lib/game.js reads each island's cos once at match start; filler bots sometimes wear some so they look human). AI API cannot spend Gems on premium looks.
- [x] Loading screen uses the painted sunset sky with warm pixel clouds.
- [x] Mind Town: warm light/rays/pollen/vignette (drawCinema) + soft building shadows.
- [x] Sky looks (cosmetic kind 'sky'): Aurora Night, Blossom Dawn (6,000 ✨), Golden Storm (25 💎); web/assets/sky_aurora|sakura|storm.webp (OpenArt LOW). Shown around your island and to raiders (snapshot.sky).
- [x] Duel wins rain pixel confetti and crowns.
- [x] Name colours (cosmetic kind 'name'): Gold, Neon (4,000 ✨), Rainbow (15 💎). Shown on your lobby name, your profile, and your duel nameplate (rival sees it via match state cos).
- [x] 2 new duel arenas (OpenArt LOW): Volcano Forge (stage_forge.webp, new 'embers' ambient) and Sky Citadel (stage_castle.webp); added to BATTLE_STAGES. Preview with ?stage=forge / ?stage=castle.
- Note: adding a table to the prototype-lock line in rules.js means updating tools/mutation_check.mjs line 56 too.

## REMAINING (saved for later)
Owner to do:
1. [~] Vercel: STABLE_TOKEN ADDED by owner 2026-11-02 (redeployed by a push). Still to do: add env STABLE_TOKEN = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 (USDG), redeploy, then one small real USDG purchase (and one ETH).
2. [ ] Ask Animoca for Minds API access; give them https://minds3d.vercel.app/api/agent?format=tools (task 2).
Before public launch (owner): confirm Supabase backups, legal review of Terms/Privacy (docs/LEGAL_REVIEW.md), CRON_SECRET in Vercel, capacity test on a separate Supabase project, Safari/Firefox/real phones, two-wallet chat test.
Next for the AI when the owner says go:
3. [ ] Test with real players/wallets: burning village + restore, cup army picker, troop upgrades, raid history, two-player duel prize timing.
4. [x] Done: boss keep sprite; island work has at least 3 workers. Players with fewer than 3 Minds see village helpers in straw hats filling the gap (island.js openIsland, m.helper; tap = 'village helper' note, never opens Mind talk).
5. [x] Giants rebalanced: cost 3 (was 4), 1000 HP (was 760), 26 damage (was 14). Sims: as good as other mixes vs the boss; still Brawlers best for lazy one-spot plans.
6. [ ] Ideas on hold (below) when the owner picks one.
Owner decided 2026-11-02: Siege Cup = same budget, any mix. USDC prices = 50/$5, 120/$10, 300/$20, 800/$50, and ETH stays too (anything on Robinhood Chain). Keep Town rewards.
Before public launch: confirm Supabase backups, fill in Terms and Privacy and get legal review (docs/LEGAL_REVIEW.md), add CRON_SECRET in Vercel, test capacity on a separate Supabase project, test Safari, Firefox and real phones, one real Gem purchase, two-wallet chat test.
Ideas on hold: Mind Office, Season Pass, cosmetics, referrals, Town moderation, pitch deck, AI demo, trailer, Train Mind and Auto Battle, play.minds.games domain, Minds Investment Programme application.
Checks before any deploy: node tools/test_server.mjs, tools/fuzz_server.mjs, tools/mutation_check.mjs, tools/economy_audit.mjs (see docs/DEPLOY.md). The owner wants short plain replies.

## SAVED TASKS (owner parked these, do not forget)
0. [x] **Island timer bugs** SHIPPED 2026-11-02. Hand work (clear/till/plant/harvest) now goes into st.q with real finish times (rules.js queueWork/settleWork, WORK_MS ~2-3 s per tile, 1 lane per Mind, max 12). Server settles it on every island load; client island.js Minds work from st.q; leaving no longer finishes jobs. Build menu + upgrade button show ⏱ time. Buildings already used absolute done-times, so they keep running while away. Original report: (a) Exploit: queue clean-up jobs, go to lobby, come back = all done instantly. Jobs must take their real time (server-checked). (b) Building: show how long each build takes before you build. (c) Timers keep running while the player is away; on return, only what had time to finish is done. Check every island timer (build, clean, crops, upgrades) for the same bug.
1. [x] **Gem payments on Robinhood Chain, ETH or dollar stablecoin.** BUILT 2026-11-02. Robinhood Chain has NO Circle USDC (docs.robinhood.com/chain/contracts lists only WETH + USDG). Built for USDG 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 (any ERC-20 works): lib/stable.js, packs 'id:usd' ($5/$10/$20/$50), server checks the Transfer log (player → treasury, exact token, ≥ price, decimals read on-chain), daily check covers it. OFF until OWNER sets Vercel env STABLE_TOKEN (and optional STABLE_SYMBOL). Do one small real test purchase first. Original: The owner corrected this: Robinhood, not Base. ETH already works there. Add USDC: first confirm the official USDC contract on Robinhood Chain (id 4663). It is an ERC-20, so verify the Transfer log in the receipt, and extend the ledger and daily check to it. Prices CONFIRMED: 50 Gems $5, 120 $10, 300 $20, 800 $50; keep ETH as a choice.
2. [~] **AI connects to animocaminds.** OUR SIDE DONE 2026-11-02: GET /api/agent?format=tools gives every op as a JSON-Schema tool (lib/routes/agent.js TOOLS); docs/MIND_API.md has the setup steps for a Minds agent. BLOCKED on Animoca: Minds has no public API/SDK yet (only a $10M developer programme). OWNER: apply to the Minds developer programme / ask Animoca for API access; then the link is configured on their side.
3. [x] **Duel: prize timing.** Fixed: app.js handle() keeps newer views in D.pending while a reveal runs, so live pushes no longer repaint the prize mid-animation.
4. [x] **Duel: round change.** Done: roundScreen() in app.js = dimmed screen with ROUND 2 / FINAL ROUND, both Minds, round crowns and score (2.6 s); duel HUD hides meanwhile.
5. [x] **Duel: clear result.** Done: big "YOU WIN +N 👑 / RIVAL WINS / TIE" box with where the points came from, WIN/LOSE/TIE stamps on the cards, prize box grows on Double so it matches the points.
6. [x] **Raid: loading screen.** Done: web/src/loader.js `loading({title, sub, tips, tier})` = airship (worldmap shipSprite) in pixel clouds + card with tips; says "Lots of players online" after 6 s, "Taking longer" after 15 s. Used for raid find + raid result. Can be reused for other waits (adventure start next if needed).
7. [x] **Buildings: show what upgrades do.** Done: rules.levelStats(type, lv); building menu shows e.g. "❤️ HP 520 → 780 · 🌱 Farm plots 2 → 3" (test checks numbers match raid.js). Trap desc fixed to 45 damage.
8. [x] **Buildings: looks change with level.** Done: buildings.js leveled(spr, lv, type): Lv2 stone foundation + blue pennant, Lv3 gold trim + gold pennant + sparkles; walls get blue/gold caps. Used on the island and in raids.
9. [x] **Troop upgrades.** Done: st.tl troop levels 1-3 (+20% HP/damage each), act 'troopup' (Dust+stone or Gems), Lv2 needs an Army Camp, Lv3 a Lv2 camp. raid.js troopStats; server stores raid.lv at find and replays with it. Shop → Army shows Lv, stats now → next, upgrade buttons. Siege Cup ignores troop levels.
10. [x] **Siege Cup: boss look.** Done: cup villages carry theme 'boss'; raidview draws scorched ground with lava cracks, red sky, embers, dark fortress buildings, no crops, battle music, "BOSS FORTRESS" banner. Possible polish: a real keep sprite for the home.
11. [x] **Siege Cup: choose your army.** Done: CUP_BUDGET 9 camp space, any mix (cupArmy in lib/routes/cup.js validates; picker in app.js pickCupArmy). CUP_LEVEL raised to 5 so no mix makes it easy (test checks 5 mixes). Troop levels/Minds never count. Original: Strategy should decide it, not the game. Owner's concern: it can become pay-to-win or grind-to-win. Suggestion: everyone gets the same budget and picks any mix. Owner to confirm.

12. [x] **Pixel clouds + background environment** DONE: web/assets/sky_island.webp + sky_adventure.webp (OpenArt Grok Imagine 2, quality LOW, ~70 KB each). art.js drawSky(g, W, H, t, kind) draws the backdrop with a slow drift plus code pixel clouds in two layers (falls back to the code sky). Island cloud shadows are blocky now. Was: Owner allows OpenArt for these backgrounds (2026-11-02): any/auto model, QUALITY ALWAYS LOW.
13. [x] **Raid damage:** Done: rules.js burnVillage/burning/restore. A starred raid (player or game raiders) sets broken buildings on fire (st.burn). While burning: no harvest, no selling, Mind jobs stand still; after 3 h crops are lost. Restore: 80 Dust + 6 wood per building, or Gems, or free Minds repair (10 min per building, max 2 h). Island shows charred buildings, flames, smoke and a 🔥 Restore button. Original: a raided village is left burning/broken; the player must restore it to keep earning. While broken: crops are lost, no income.
14. [x] **Raid history:** Done: 📜 button on the island → raids on you / your raids (st.raidLog + new st.atkLog), raids won; tap a raider's name → their own history (raid op 'history', names/stars/loot only); ⚔️ Revenge per entry. Original: see all raids on you, look at the raider's own history, then revenge (or other actions).

Owner said GO (2026-11-02): work top to bottom.

Owner: Mindclash game owner. Hates long text: short replies, decide for them, build/test/ship without asking
(stop only for Supabase SQL, Vercel settings, money/payments). Drawn in CODE, except backgrounds: OpenArt allowed there, QUALITY ALWAYS LOW.

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

## Owner notes 2026-10-31: (1) LAST STEP after everything is final: the AI part must connect to animocaminds. (2) Gem payments with USDC: see SAVED TASKS. (3) Bots stay unlabelled and look human everywhere except Practice and Training (owner confirmed 2026-10-31). They must never use a real player name, and cups stay real players only. Round: terms/privacy drafts need docs/LEGAL_REVIEW.md items. supabase/009_monitoring.sql and CRON_SECRET, ALERT_WEBHOOK_URL pending.
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
