# The game's real name is MINDS CLASH (internal keys still say mindclash so nobody gets signed out)
# HANDOFF — read this first (next AI session: continue from the top of "NEXT TASKS")

## >>> START AT "NEXT" BELOW <<<
## CURRENT STATUS (2026-11-03, late night)
EVERYTHING IS LIVE on main: Round 12, Rank Pass, trading + gifts, Round 13, chat retention, and round 14 below. Tests, fuzz, mutation check, economy audit and raid sims pass.
ROUND 14 (owner 2026-11-03) DONE:
- Rank Pass bug: a wallet with no Minds was logged out and turned into a trial guest. Now it stays a wallet account (Classic/Practice use loaner Minds 49/14/8, Rank Pass buyable). Server: queue_join `loan` (marked 'pass' in the queue row), profile allows loaner pfp. Old affected players must sign out and Connect wallet again.
- Troop upgrades take time (rules TL_SECS 10 min → 2 days, one at a time, st.tlq, settles in normalize), act 'troopnow' rushes with Gems (1 💎 / 5 min left). AI keys cannot rush.
- Cosmetics shown in Mind Town + duels: auras (aura_*, glow in town, glow on duel/profile pictures), titles (title_*, above name in town, under name in duel/profile/leaderboard/player card), trails (trail_*, pixel hearts/stars/petals/gems while walking in town). Style shop lists them first.
- Style shop opens at once (loading note only on first load).
- Edit mode: ⬆ Upgrade N · X 💎 button (Gems pay the cost, builders/time same as the building menu).
- Giants only go for a defence within 4 tiles, else the nearest building (other troops already hit the nearest).
- New defences (rules DEFENSE + defMult, raid.js shared loop): 💥 Cannon (TH2, heavy, close), 🎇 Mortar (TH3, long range splash, not up close), ⚡ Spark Spire (TH4, chain lightning x3). Code sprites in buildings.js, Lv1-10 looks via leveled(); raidview shots per kind; game villages build half their TH allowance. Not in TH_KEY (do not block old players' Town Hall).
ROUND 22 (owner 2026-11-04) — 🌙 AWAY PLAY (AIs grind with the game closed, 1-90 days, player's consent):
- lib/aiaway.js: a SECOND Hello Minds sign-in only for the server (browser keeps its own; MemStore in hellominds.js awaySignIn, state {away:days}); refresh token sealed AES-256-GCM in st.aiAuth (key from AI_TOKEN_KEY or SESSION_SECRET/SUPABASE_SECRET_KEY), never sent to browsers (island.js strips it), renewed + rotated by the server, revoked on Turn off.
- Timer: .github/workflows/ai-tick.yml every 5 min → GET /api/cron/ai-tick (lib/routes/cron_ai.js, no secret, max 2 runs/min globally, 40 players/run). awayTick(pid) in autopilot.js: per away AI, tick 1 sends the job question, a later tick reads it and doJob(); skips when the browser played it in the last 3 min (liveAt); stops at the end date, 0 cognition or a lost sign-in; daily letter + final letter.
- Ranked away: AI writes its duel rules (strategyQuestion → duelPlan; players can edit them in ⚙️ Settings → Duel rules, or tap ✨ Let my AI write them); the server plays the whole duel vs a ranked bot that answers at once (startMatch auto:{0:plan}, fastBot; game.js autoMoves + playOut). Energy: shards → Dust → Gems within the limit (refillFor).
- Siege Cup job: enters every new day; when tries run out and the player holds more Minds, buys the next entry (one per Mind) inside the Gem limit.
- Minds lookup fix: owner's Minds are STAKED (held by 0x71a92a…); a failed staking check returned none → now retries one piece at a time, and remembered Minds (seenMinds + Minds with an AI) are re-checked when a lookup comes back empty.
OWNER: GitHub → repo → Actions must be enabled (it is by default); the timer starts by itself. Check "ai-tick" runs under Actions.
ROUND 21 (owner 2026-11-04) — AI JOBS (the simple design the owner approved), TESTED LIVE IN THE OWNER'S CHROME:
- Each Mind's AI has ONE job: 🃏 Ranked, 🏆 Siege Cup, 🧺 Farming, 🪓 Clean island, 🧭 Adventure, 🏹 Train troops, ⚔️ Raid (training.js JOBS, PACE fast/10 min/hour, cleanJob, jobQuestion, readJob). Dock = job buttons + status (last result + countdown) + the AI's reason + Start/Follow/History + ⚙️ settings (pace, tip, Gems) + optional coach chat. Plans/presets are no longer shown.
- Server: op 'job' (kind, pace, tip) and op 'work' (one round: asks the AI with the short-call pattern, then doJob() by the normal rules). Ranked uses duel_plan/duel_think per duel. Siege Cup: the AI may enter (signSession hm:true; cup allows session.hm; entry name marked 🧠), pays the entry with Gems inside the limit, picks the army (any mix), attacks with autoPlan. Clean: queues clear work on the chosen cover nearest the Town Hall. Train: the AI's mix may use the camp and Dust (keeps 50), troop upgrade falls back to Gems when ON. Failed Gem actions refundGems(). Job switch mid-round ends the old round (work returns switched). maxDuration 60.
- Live results: Farming (AI chose star; nothing to farm: all plots growing), Clean (40 weeds queued), Siege Cup (★★☆ 50%, 24,528), Adventure (Bandit Perch: 126 Dust, 15 stone), Train (Dust too low: fixed reserve), Ranked (no energy and 3 refills used today: now waits 30 min instead of retrying; a duel was played in an earlier session). Raid not run live (it attacks real players' islands; covered by tests).
- UI: small buttons wrap instead of cutting text; shop buttons share the row; troop upgrade buttons on their own lines; seeds "Buy 10" says how much Dust is missing.
NEXT: Ranked job live when energy is back; Follow during a job; phone size of the new dock; consider showing "AI is thinking" on the Mind in the lobby.
ROUND 20 (owner 2026-11-04) — TESTED LIVE IN THE OWNER'S CHROME (Claude in Chrome, wallet Julz + Hello Minds): the AI took "upgrade everything with diamonds only, non-stop, don't farm", made the plan "🏗️ Upgrade buildings with 💎", the owner-approved plan ran, the AI decided each step itself (reasons shown) and upgraded + rushed with Gems inside the 1,000/day limit. Hello Minds answers take ~60-100 s per question: that is the main slowness (not a game bug).
Done this round: plan from the player's own words when the AI forgets the PLAN line (autoplay.js parsePlan understands don't/no/never, "non-stop", diamonds/gems only → build step {gems:1}); the player's request always shapes the AI plan (gems flag, no farming, no rests unless asked); presets and AI plans have no rest steps; a round with nothing done waits 2 min by itself; step 'build' with gems pays each upgrade with Gems (gemPrice, spendGems first, refundGems if it fails) and rushes it at once; the next decision is asked ahead while a step runs (ap.ai[slot].ans by key, picks by step number); slow answers never stop the AI (only cognition/login do); duels need the AI's own strategy first; dock clamped on screen; Shop header fixed; bigger AI Minds bubble (corner when folded, small in windows/fights); trial players see the AI Minds invite; admin 👥 All players (op 'players': filter/sort/page, TH, Minds, Dust, Gems, status); title previews wrap.
NEXT: keep testing in the owner's Chrome (it is connected now): Follow on a duel and on the island, Train, History, Siege Cup with 2 Minds, Mind Town (trade/stake duel need a 2nd account), raids, adventures, admin All players. Consider fewer AI questions per loop (e.g. one decision per round) if Hello Minds stays this slow.
QA DONE 2026-11-04: docs/QA_REPORT.md (see "Fix status"). All code findings fixed and shipped. OWNER MUST: (011_island_snaps.sql RUN by owner 2026-11-03), backups: owner stays on Supabase Free (no paid backups) → .github/workflows/db-backup.yml dumps public schema daily, gpg-encrypted, Actions artifact 30 days; secrets SUPABASE_DB_URL (Session pooler) + BACKUP_PASSWORD added, first run green 2026-11-03 (open: gpg -d file | gunzip), Vercel Firewall checked active (Hobby; Bot Protection left OFF: it would challenge the ai-tick curl and /api/agent clients), CRON_SECRET already set in Vercel, ALERT_WEBHOOK_URL optional (Discord), FIRST REAL GEM PURCHASE OK 2026-11-03 23:36 (50 Gems, credited, logged, payment check 0 findings; still do the other token), Vercel Firewall + spend alerts, ALERT_WEBHOOK_URL, lawyer sign-off (pages still say Draft), then a signed-in browser pass (Claude in Chrome was not connected).
Changes: AI questions are short calls (askStart/askPoll in lib/hmserver.js, pending question in ap.ai[slot].q, browser re-calls next/duel_plan/duel_think until answered; maxDuration 30); lib/http.js caller (AsyncLocalStorage) passes x-forwarded-for into inner() calls + in-memory 600/min/IP flood guard; auth fails closed without a secret; agent IP limit; supabase-js in web/vendor/supabase.js (CSP script-src 'self'); loot LOOT_SHARE 0.18 / cap 1,200 / botLoot (200+250×lv); wood/stone ×0.5 from Lv5, TH Dust/40, SHOP res_crate; act 'tos' + 18+ checkbox; publicPlayer merges bot wins/losses; retention deletes island_snaps > 7 days and trial accounts unused 30 days.
NEXT (owner 2026-11-04): PUBLIC LAUNCH QA. The owner will give another AI (Claude in Chrome, signed in with wallet + Hello Minds) the audit prompt in docs/QA_PROMPT.md. It writes docs/QA_REPORT.md and waits; then fix what the owner picks, top blockers first.
OWNER TODO BEFORE PUBLIC: Supabase daily backups + point-in-time restore (test one restore); Vercel Firewall on (Attack Challenge Mode if flooded); CRON_SECRET + ALERT_WEBHOOK_URL in Vercel; check ADMIN_ADDRESSES / TREASURY_ADDRESS / STABLE_TOKEN; one small real Gem purchase; legal review (Terms, Privacy, Siege Cup prizes + stake duels may count as gambling); custom domain before launch; load test only on a separate Supabase copy.
ROUND 19 (owner 2026-11-04): Hello Minds answers are SLOW (up to ~1 min). Chat waits 2 min (shows "is thinking…"), step decisions wait 50 s (server, maxDuration 60). Every chat message carries [Game now] (Town Hall, building levels, Dust/Gems, Gem limit, plan, last actions) so the AI knows the island; old history hides the game's instructions (cut before "Human says:"). If a chat reply has no PLAN line for an action request, the AI is asked once more for just the PLAN. Duels: before each duel op 'duel_plan' makes the AI write its OWN strategy (training.js strategyQuestion/readStrategy → ap.ai[slot].duelPlan); a turn whose live answer is too slow plays strategyMove(its plan); log says live / own strategy / not played.
ROUND 18 (owner 2026-11-04): AI replies come as HTML (<p>…</p>): hellominds.js plain() + lib/hmserver.js plain() strip tags before showing/parsing, so PLAN lines are found; prompts ask for plain text. A plan from chat shows "📋 I made a plan…" + the preview (replaces the current plan; "Switch to this plan" while running). New step 'build' (🏗️ Upgrade buildings: AI order via UPGRADE:, Gem rush via RUSH: yes only within the Gem limit). Words upgrade/max/rush/base/town hall → build.
ROUND 17 (owner 2026-11-03/04) DONE — FULLY HELLO MINDS:
- No game bots play for the player any more: island Mind jobs removed (st.jobs cleared on load, act 'job' refused; tapping an island Mind opens the AI dock). No training fallback: an AI that does not answer plays nothing (duel turn times out). Training = instructions in the AI's question only.
- The SERVER talks to the AI (lib/hmserver.js, player's Hello Minds token sent per request, never stored): link checks the AI is on the player's account and was created < 30 min ago (no reused AIs); op 'next' asks the step + details (CROP/SELL/TROOPS/SPOT/POTIONS/ARMY/DECOR, training.js readDetails), stored as ap.ai[slot].pick and used by 'step'; op 'duel_think' asks the card and plays it with game.act. 'step'/'duel_join' need a real AI answer in the last 15 min (THINK_MS). duel_act is not an autopilot op; match/act refuses hand moves in ap.aiDuel. vercel.json maxDuration 60.
- Cognition: checked every 45 s for every running AI (also in Mind Town/rest), server 'next'/'duel_think' return out at <= 0; the AI stops; big banner (#mcog) + dock warning + ➕ Add cognition → https://hellominds.ai/pricing ("Top up a Mind"). 4 unanswered questions in a row = it stops.
- Follow = watch the real game: the real duel screen in watch mode (hand locked, menu = stop watching) and your real island refreshing after each AI step; switches by itself; raid/adventure/town/rest show the live card.
- Stake duels: refused when both sides share a connection (dk saved on island at open/agree, only when x-forwarded-for exists), flagged; big Gem stake wins flagged (duel_gems).
- Refills: one flat price 3,000 Dust / 8 Gems, 3 per Mind per day.
- 🧾 Purchase history: rules logBuy/buyLabel → st.buys (30 days, 300 max): shop, seeds, builds, upgrades, looks, Rank Pass, rushes, troop upgrades, airship, repairs, energy refills, cup entries, Gem packs (real, with tx). Players: Shop → 🧾 Purchases, Settings → 🧾. Admin player view shows purchases + the payments table (tx ids).
- Text no longer cut: full AI reasons (400 chars, word cut), wrapping in dock/Follow/history.
ROUND 16 (owner 2026-11-03 late) DONE:
- The Hello Minds AI now DECIDES: before every step it is asked "DO: <step> WHY:" (hellominds.js decide(), own conversation alias mindsclash-play-<id>), and in duels it picks every card + spell ("CARD: n SPELL: x WHY:", 13 s). Too slow / bad answer = the player's training move (island/training.js trainedMove), logged ("the AI chose N of M moves itself").
- 🎯 Train per AI (training.js TRAINING: duel style/big/small crowns/each spell/next-high, raid target/army/spells, farm crop/sell, adventure spot/potions, energy refill). Server op 'train' (cleanTraining); sell + potions + refill follow it on the server.
- No "use an existing AI" / "Change AI": every Mind gets a fresh awakened AI only.
- Dock: drag by the title (position saved), ⤢ bigger mode, chat loaded from Hello Minds history (getHistory), the AI's latest thought shown.
- Follow: duel board (crown, score, hand with the picked card, last turn win/lose, spells), animated actions, thought bubble.
- Ranked prep: a Mind its AI is playing shows a notice (stop the AI to use it) and is never picked by default.
- Mind Town chat moved to the LEFT, bigger, times, All/Chat/News filter, fold.
- Leaving a duel: 3 missed turns or 45 s unseen = gone; one gone forfeits, both gone = abandoned tie (lib/game.js applyTimeouts); reload asks "Go back in / Leave" (never auto-joins; an AI's own duel is left alone).
- Balance: energy refills 1,500/3,000/6,000 Dust or 5/8/12 Gems per Mind per day (rules energyPrice); raid loot LOOT_SHARE 0.12, cap 800 (TH1) to 4,400 (TH10), game villages 250/400/550 at TH1, real-player loot 3,000 a day.
ROUND 15 (owner 2026-11-03 night) DONE:
- Hello Minds sign-in LIVE (client dcae7792-2a81-416b-aa96-0137b29191d7, SDK vendored in web/vendor/, web/src/hellominds.js; CSP allows api.build/api.oauth.hellominds.ai). The built-in Claude browser cannot pass Hello Minds' Cloudflare check: test in real Chrome.
- 🧠 AI Minds dock (web/src/autopilot.js): floats on every screen, minimizes to a bubble (auto-min in duel/raid/adventure), opens itself the first time. One AI per Mind NFT (slot = NFT id, '0' = Rank Pass Mind): player picks "✨ New AI" (clean slate, awaken Clash-<id>) or an existing Hello Minds AI. Each AI has its own plan + chat; all running AIs take steps in turn (town/rest on their own clocks). Plans and AI-suggested plans open a preview with the steps → "▶ Start this plan". 👁 Follow = live card (scene by activity, duel score, log). 📜 History = all lines, filter per Mind (server log 200, each line has mind). Gems: player types the daily amount (1-1000) + CONFIRM. Server st.ap.ai[slot] {hm,name,steps,preset,loop}; ops link/unlink/save(mind)/step(mind).
- Siege Cup: one entry per Mind held (5 💎, 3 tries each), count in st.cupe {day,n} (no SQL); pool = all paid entries.
- ⚔️ Stake duels in Mind Town: player card → Duel; same screen as trades (both stake, both agree on the same version), stakes go into escrow, an unrated private duel starts, the winner gets both, tie/abandoned = each gets their own back. trades kind 'duel', status open→locked→paying→starting→playing(note m:<match>)→done. Daily send limits apply.
NOT CHECKED WITH REAL PLAYERS: Hello Minds list/awaken/chat replies, dock with several Minds, stake duel between two phones.
OWNER DECIDED 2026-11-03: Hello Minds is the ONLY way for the Mind AI. Flow: wallet login → required "Connect Hello Minds" (their own account, made on the spot if new) → their own AI Minds and their own cognition/credits. NO built-in-planner fallback for Autopilot: remove it when Connect is built (no Hello Minds = no Autopilot). The owner's Builder API key is not used by the game (only the owner's test) and can be deleted.
OWNER TODO: create the OAuth client in https://build.hellominds.ai/en/console (OAuth Client tab; redirect https://minds3d.vercel.app/ + http://localhost:5173/; origins the same without the slash), send the client ID + a screenshot of Available scopes (need minds:awaken, minds:list, conversations:create, messaging:send, messaging:history). SDK: npm @animocabrands/minds-connect (browser; MindsOAuth, signIn, handleRedirect, oauth.client); docs https://build.hellominds.ai/en/docs/get-started/connect. Same tab only (sessionStorage). Test with a wallet: Rank Pass buy (wallet with no Minds), trade, gift, Autopilot Start, ranked chests.
NEXT ideas: more defences (air units?), troop training time (training is still instant), Mind Town look test with 2 players.
Live on main (latest 201902d): everything below through ROUND 11, plus village helpers. 465 tests pass; fuzz, economy audit and full mutation check pass.
Done 2026-11-02/03: all saved tasks 0-14, round 10 (staked Minds, island edit mode, boss fortress, Giants, helpers), round 11 (cosmetics: 4 card backs, 4 frames, 3 skies, 3 name colours, rival sees looks; victory confetti; 2 new duel arenas; painted loading sky; warmer Mind Town).
STABLE_TOKEN is set in Vercel (owner, 2026-11-02) and redeployed.
OWNER TODO: (1) one small real USDG purchase and one ETH purchase; (2) ask Animoca for Minds API access (send https://minds3d.vercel.app/api/agent?format=tools); (3) launch list below.
Not checked with real players yet: burning village + restore, edit-mode group moves, cup army picker, staked Minds at login, rivals seeing cosmetics, two-player duel timing.
Owner rules: keep going in the same chat, no questions, short plain replies, update this file after every task. OpenArt allowed for art, QUALITY ALWAYS LOW.
Minds Builder API (2026-11-03): owner got a Builder API key (JWT, role builder, expires 2027-11). Checked: works. Base https://api.build.hellominds.ai, header `X-Api-Key: <key>` (OAuth tokens use Bearer). Docs https://build.hellominds.ai/docs/api, npm @animocabrands/minds-client-lib. GET /v1/humans/{humanId}/minds lists the owner's 7 Minds; messaging = POST /v1/messaging/conversation + /message, replies via /histories/{alias} or /events. NEVER commit the key: it goes in Vercel env MINDS_API_KEY (owner adds). Next: decide what to build (real Mind talk in mindtalk.js, or Minds Connect sign-in).
If a table is added to the prototype-lock line in rules.js, also update tools/mutation_check.mjs line 56.

## ROUND 13 (owner 2026-11-03) — BUILT on `island` (owner said build it)
Our own take on the base-builder progression the owner asked for (genre mechanics, own numbers and art, not a copy of one game):
1. [x] rules.js: home is named Town Hall; thLv(), UNLOCK counts per TH, upgradeBlock() (nothing above TH; TH needs TH_KEY buildings at its level), UP_MULT/TH_DUST costs, UP_SECS 5 min → 24 h, boostOf(). Town Hall = the Home, levels 1-10. Every other building's max level = Town Hall level (all 1-10). Next Town Hall level needs your key buildings at the current level ("all aligned"). Each TH level unlocks more of each building (walls, towers, traps, camps, houses).
2. [x] raid.js TH_ARMY [20..60] caps army; rules troopMax = 40 + 10/TH level; MAX_TL 10 (troopMult +20%/lv to 3 then +10%); hpMult +60%/lv after 3; towerMult. Sim (TH-matched, hardest game village): 1-2.4 stars from TH3 to TH10. Army camp space and troop levels grow with Town Hall + camp level (TH1 10 → TH10 ~60). Troop levels 1-10 (lab-style upgrades, gated by TH).
3. [x] buildings.js leveled(): TIER table 2-10 (stone, iron, gold, crystal, legendary glow + crown). Building looks change every level (code-drawn: wood → stone → iron → gold → crystal tiers, extra parts, glow at 8-10).
4. [x] Costs/times grow per level (minutes at Lv2 → about a day at Lv10), Gems can rush; economy audit + raid sims redone for 10 levels; old saves migrate (Lv1-3 stay, cap rises).
5. [x] raid.js lootCap(th) 2,000 → 11,000, resLootOf() 20% unprotected wood/stone (Barn protects 100/level, cap 150×TH), botRes; raid targets within ±2 TH first; game villages built at the raider's TH with more towers/traps/inner wall. Raid losses: today 25% of unprotected Dust (max 2,000), barns protect 1,000 each, burning village. Proposal: also 20% of unprotected wood/stone and crops in storage, cap scales with TH; Storage/Barn protects more per level.
6. [x] web/src/island/rankrewards.js (streak chests 3/5/10, daily 3-wins chest + 2 h Builder Boost, weekly tier chest Bronze→Legend + 8 h shield) paid in lib/game.js giveDust, shown on the result screen (view.chests); raid route: rating gives up to +20% game-village loot. 7. [x] lib/points.js: leaderboard points also from adventures (5 each, 25/day), raids (2/star, 30/day); Gem purchases give points = Gems, +20 ✨ and +2 wood/stone per Gem (creditGems, once per payment). Ranked → island rewards. Today only 60 ✨ win / 15 ✨ loss per Mind. Proposal: win streak chests (wood, stone, potions, fuel, troop tickets), a daily "3 ranked wins" chest with a builder-speed boost, rank tiers (Bronze→Legend) that give weekly island rewards + a raid shield, and ranked rating gives a small loot bonus in raids.
## ROUND 12 (owner 2026-11-03) — NEXT TASKS, do top to bottom (quick fixes first, big Mind Autopilot last)
1. [x] Opening screen (logo top, Tap to Play bottom; style.css .boot): title text covers the characters; Start/Enter button covers the 3 legendary Minds. Move them.
2. [x] Island build menu scrolls (.isl-seeds max-height + overflow) (list of things to build).
3. [x] DONE: gold ✨ button in the lobby top bar + "Change my looks" in your profile + Style is the 2nd shop tab. Was: owner can't see them. Make the ✨ Style shop obvious (lobby/profile entry, not only Shop tab).
4. [x] Arena = hash of match id (app.js arenaFor), same on both phones. Was: two phones dueling see different backgrounds. Arena (and sky) must come from match state so both see the same.
4b. [x] lib/looks.js looksOf/withLooks (20 s cache) adds cos to profile, leaderboard, friends, Mind Town (name colour + frame-coloured tag); duels/raids already had it. Was: Paid cosmetics visible to other players EVERYWHERE (duel, town, raid, profile, friends); paid looks win over defaults.
4c. [x] CSS: coloured pixel frame, side gems, glow, diamond pattern on hand cards and reveal faces (no OpenArt needed). Was: decorate the default card back/front (OpenArt LOW allowed).
5. [x] cup.js CUP_FEE 0.10, prizePool(); GET shows prize + fee. Was: house keeps 10% of the prize pool, winner gets 90%. Show it on the cup screen.
6. [x] raid.js BOT_FUN 0.15, real pool limit 150. Was: real player villages first, bot villages only as fill (still some for fun). Game raiders on players stay.
7. [x] OWNER CHANGED 2026-11-03: chat + mail + finished duels 30 days, reports/flags 60 days, raid logs 20, Mind Town chat starts fresh for every visitor (town route: first beat returns only news + lastId; server copy kept 1 day). lib/retention.js prune() (daily cron + maybePrune on chat routes); raid logs 50; privacy page updated. Was (AI decided): all chat (friend, duel, private) deleted after 90 days; Mind Town public chat 7 days; mail 90 days; raid/attack logs keep newest 50 per player; reports 180 days. Daily cron cleans.
8. [x] town.js tap → app.js playerCard (stats, Add friend, Message, Profile, Report, Block); residents show Mind # + rarity. messages.js: anyone with a wallet can DM unless blocked (friend op 'block'); friends route returns chats. 📣 town op 'mega' (st.mega, 1 💎, 1 h). Was: Mind Town: tap ANY Mind → card with owner name, rating, wins, island level, looks; Add friend, Private chat (allowed before friends, blockable/reportable), Duel invite. 📣 Megaphone: 1 💎 puts a message over your head for 1 hour (server-checked, filtered, reportable).
9. [x] audio.js babble/squeak: high sine blips with a hop, wobble, cute syllables. Was: higher, softer gibberish (audio.js), little chirps; same for raid screams.
11. [x] 🎟️ Rank Pass (owner 2026-11-03): wallet players with no Mind play Ranked with loaner Minds (DEMO_MINDS). rules.js RANK_PASS (7 days, 5 ranked games/day, 5,000 ✨ or 30 💎), act 'rankpass' (adds days); st.rp {until, day, used}. lib/rankpass.js passOf/spendPass/refundPass; queue_join {pass:true}; queue row loadout gets 'pass'; matchmaking skips ownership + token energy for pass sides and spends the pass instead; /api/me returns rankPass. Client: Ranked tile offers it, prep screen shows loaner Minds, Shop → Supplies card. Autopilot uses the pass too.
13. [x] 🤝 Trading + 🎁 gifts (owner 2026-11-03): lib/routes/trade.js + web/src/trade.js. Trade only in Mind Town (tap a Mind → Trade, both in town_now < 60 s); gift to accepted friends (friend chat 🎁 / player card). Resources only (rules.js canTrade). Both agree to the same `ver`; any offer change resets both. Escrow steps with per-island markers st.tx[id] {took, got, back}; status open → locked → paying → done, or → cancelled (gives back). Daily send limit 200 💎 / 100,000 ✨ (st.sent); ≥50 💎 flagged (trade_gems). OWNER MUST RUN supabase/010_trades.sql or trading errors.
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
