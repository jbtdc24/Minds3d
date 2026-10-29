# Mind Summoners — full design

> **Update (live-feel rounds, shipped):** duels now run in rounds: a secret deploy (30 s), then a **6-second live
> battle** simulated on the server. Creatures walk down their lane (speed and reach by family), trade hits when they
> meet (HP = 4 × power + 2, hit = power about once a second, counters 1.5×, affinity 1.75×, tough −25%, guard −40%,
> storm family is ranged) and hit the summoner at the end of the lane (half power per hit). Summoners have **30 HP**.
> Hero Skills: Mend heal 10 + block 2 · Battle Cry +2 power this round · Focus +2 · Rage +2 and −40% damage taken ·
> Hex −4 power · Bolt 12 damage · Ward block 12 · Curse 4 damage and −1 power for good. Creature stats were re-tuned;
> `web/src/summon/cards.js` is the source of truth. Re-balanced with the simulator: families 46–53%, skills 45–55%,
> starter decks 48–59%, ~10 rounds a game (`tools/sim_summon_report.txt`). The tables below are the first, turn-based
> version and are kept for history where numbers differ.

Status: **design only, nothing built yet.** Battle numbers are tuned with the bot simulator
(`node tools/sim_summon.mjs 12` and `--hero`, results in `tools/sim_summon_report.txt`).
Everything else (economy, Wilds, raids) is set on paper here and gets re-checked in playtests.

---

## 1. The idea in one line
**Catch creatures in the Wilds. They live on your island, guard it, raid other islands, and become
the cards you summon in duels. Your Mind is the summoner.** Players grow in *skill and choices*, not stats.

### Pillars (every rule below must respect these)
1. **Skill beats wallet.** In duels a card is always a card: levels, gear and shinies never change duel numbers.
2. **Free players can compete on day 1.** Four complete starter decks for everyone.
3. **Minds matter.** Each Mind is a different summoner (element + Hero Skill), holds its own creatures, and is worth more when trained.
4. **Grind is for collection, looks and PvE.** Levels and evolutions help in the Wilds and raids, not in ranked.
5. **Nothing is ever wiped.** Raids steal a little, burn things that can be repaired, and are capped.

---

## 2. The duel (Ranked, Classic, Practice, Wilds battles, raid gates)
| Rule | Value |
|---|---|
| Mind HP | 20 |
| Lanes | 3 |
| Deck | 12 cards · max 2 copies of a card · max 4 stage-3 cards |
| Starting hand | 3 cards, +1 card every turn |
| Focus (summon budget) | turn number, max 6 · unused Focus is lost |
| Turn | both players secretly summon into their **empty** lanes (+ Hero Skill once per match), then reveal |
| Turn timer | 30 s (no move = summon nothing; 2 missed turns in a row = forfeit) |
| Game length | max 12 turns, then higher HP wins (equal = draw) |
| Empty deck | you take 1, 2, 3… damage for each card you can't draw |

**Resolve order each turn:** 1) summons appear → 2) "on summon" effects (both sides) → 3) Hero Skills →
4) creatures at 0 power vanish → 5) each lane fights → 6) end of turn (grow, temporary effects end).

**Lane fight:** each creature's power (+2 if its element beats the other's, +3 if that element is also your
Mind's element). Higher power wins: the loser is destroyed and the winner loses power equal to the loser's
power (never below 1). Tie: both destroyed (a **tough** creature survives a tie). A creature with no enemy in
front hits the enemy Mind for its power. Creatures stay on the board until destroyed.

**Elements:** 🔥 Fire beats 🌿 Nature · 🌿 Nature beats 💧 Water · 💧 Water beats 🔥 Fire · ✨ Light and 🌑 Shadow beat each other.

**Why it isn't predictable:** random draws, hidden simultaneous summons, 3 lanes, counters, abilities, a
different Hero Skill and element per Mind, and different decks per player. The rules fit on one page; the
depth is in reading your opponent.

### Keywords
| Keyword | Effect |
|---|---|
| burn N | on summon: N damage to the enemy Mind |
| heal N | on summon: heal your Mind N |
| shield N | on summon: your Mind blocks the next N damage |
| spark N | on summon: the enemy creature in front gets −N power (for good) |
| splash | on summon: every enemy creature −1 power (for good) |
| draw | on summon: draw a card |
| rally | on summon: your other creatures +1 power (for good) |
| tough | survives ties |
| guard | loses no power when it wins a fight |
| pierce | when it wins a fight, the extra power hits the enemy Mind |
| grow | +1 power at the end of each turn it survives (max +3) |
| leech | heals your Mind 1 each time it hits the enemy Mind |

## 3. The 24 creatures (8 families × 3 stages)
| Family | Element | Stage 1 | Stage 2 | Stage 3 | Plays like |
|---|---|---|---|---|---|
| Ember | Fire | **Emberpup** 1⚡ 2💪 | **Cinderhound** 3⚡ 3💪 burn 1 | **Blazewolf** 5⚡ 5💪 burn 2 | aggressive damage |
| Magma | Fire | **Magmite** 2⚡ 2💪 tough | **Lavashell** 4⚡ 3💪 tough | **Volcanox** 6⚡ 5💪 guard | sturdy wall |
| Bubble | Water | **Bubblin** 1⚡ 1💪 heal 1 | **Tidefin** 3⚡ 2💪 heal 2 | **Leviathorn** 5⚡ 3💪 splash | heal & control |
| Storm | Water | **Driplet** 2⚡ 2💪 pierce | **Mistwisp** 4⚡ 3💪 pierce | **Stormray** 6⚡ 5💪 pierce | break through |
| Sprout | Nature | **Sproutling** 1⚡ 1💪 grow | **Thornback** 3⚡ 3💪 grow | **Elderoak** 5⚡ 5💪 grow, tough | slow, gets huge |
| Bloom | Nature | **Pollenix** 1⚡ 2💪 draw, rally | **Bloomwing** 3⚡ 3💪 draw, rally | **Floravyn** 5⚡ 7💪 rally | team boost |
| Glow | Light | **Glimmit** 1⚡ 2💪 | **Lumeon** 3⚡ 3💪 shield 2 | **Solarion** 5⚡ 5💪 heal 2 | protect |
| Shade | Shadow | **Shadowmite** 1⚡ 1💪 leech | **Duskfang** 3⚡ 3💪 spark 1, leech | **Umbraxis** 5⚡ 5💪 spark 1, leech | drain |

(⚡ = Focus cost, 💪 = power.) Each creature also has a **shiny** version (1 in 256): same numbers, rare colours and sparkle, only for flexing.
New families arrive each season (2 per season), always tested in the simulator first.

## 4. Your Mind = your summoner
Every Mind brings two things to a duel, both read from its NFT traits:

**Element affinity (from Skin):** your creatures of that element counter for +3 instead of +2.
Rose, Peach → Fire (1,140 Minds) · Sky, Periwinkle → Water (888) · Mint, Lime, Emerald → Nature (1,170) ·
Gold → Light (87) · Monochrome → Shadow (38). Legendaries: their own element.

**Hero Skill (from Face), once per match:**
| Skill | Effect | Faces (Minds) |
|---|---|---|
| Mend | Heal your Mind 6 and block the next 2 damage | Happy, Blushing (710) |
| Battle Cry | All your creatures +1 power this turn | Neutral, Glasses (563) |
| Focus | +2 Focus this turn | Wink (472) |
| Rage | One creature +3 power this turn and loses no power when it wins | Tongue Out (240) |
| Hex | One enemy creature −3 power this turn | Side Eye, Sad (473) |
| Bolt | 6 damage to the enemy Mind | Crying (264) |
| Ward | Your Mind blocks the next 5 damage | Blank, Silenced (511) |
| Curse | One enemy creature −2 power this turn and −1 for good | Knocked Out (90) |
Legendaries: fire Bolt · ice Ward · angel Mend · bones Hex · glitch Curse · joker Rage · monkey Focus · robot Battle Cry · void Hex · error Bolt.

**Free players** (no Mind) get the **Wanderer** summoner: pick any element once, skill Mend. Wanderers play Classic and Practice; Ranked needs a Mind (as today).

## 5. Balance results (bot simulator, 4,536 games + 2,688 hero tests)
| Check | Result | Target |
|---|---|---|
| Win rate of each family (in any deck) | 47.5% – 55.6% | 45–55% |
| Hero Skills head-to-head | 48.5% – 51.5% | 45–55% |
| Hero Skill vs no skill | 62% – 71% (every Mind has one, so real games are skill vs skill) | all useful, none dominant |
| Element affinity vs none (same deck) | 52% | small edge |
| Seat (who is player 1) | 49.6% | 50% |
| Average game | 9.9 turns (~5–7 min) · 2.9% draws · winner ends with ~7 HP | 8–11 turns |
| Best / worst 2-family deck | 67% / 32% | deck choice matters, none unbeatable |

Starter decks (§6) land at 46.5%–54.5%, so new players start with mid-to-strong decks.
Bot balance is a starting point: after launch we watch real win rates per card and tune each season.

## 6. Cards, collection and decks
- **4 free starter decks for everyone** (complete, with stage-3 creatures): **Ember + Sprout**, **Magma + Glow**, **Bubble + Bloom**, **Storm + Shade**. Together they cover all 8 families. Starter cards can't be levelled, sold or bonded, and can only be played as the preset deck.
- **Custom decks** use creatures you own (caught, evolved or bought in a Mind). Any mix of families, same deck rules. Customising gives *choice*, not bigger numbers.
- **Classic:** starter decks only, for everyone (pure skill, no collection needed).
- **Ranked:** your Mind + a starter deck or your custom deck. Energy as today (1 per Mind per ranked match).
- **Practice:** anything vs bots.

### Ownership: creatures belong to Minds
- Each caught creature is **bonded to one Mind** (saved on the token id, like Energy). Whoever owns the NFT owns its creatures.
- **Slots per Mind:** Common 4 · Uncommon 5 · Rare 6 · Epic 7 · Legendary 8, +1 at Bond level 10, 20 and 30.
- **Barn (account storage):** 10 unbonded creatures (not transferable), +1 slot per 500 Dust up to 20. Free players use the Barn only.
- **Move a creature** between your own Minds or the Barn: 50 Dust.
- **Selling a Mind:** its bonded creatures, Bond level and history go to the buyer. A warning shows before selling. Barn creatures stay with you.
- **Transfer lock:** for 24 h after a Mind changes wallet, its creatures can't be used in Ranked or raids (stops passing one Mind between wallets).
- Decks are re-checked on-chain when a ranked match starts (the server already does this for Minds).

### Growing creatures (Wilds and raids only, never duels)
| | Rule |
|---|---|
| Level | 1–10. XP from Wilds wins (+20 each creature in the winning deck) and feeding crops (Bean 10, Carrot 30, Melon 90, Star Fruit 250 XP) |
| XP per level | 100 × level (L1→2 = 100 … L9→10 = 900; 4,500 total) |
| Level bonus | in Wilds and raids: +1 power at L4, +2 at L7, +3 at L10 |
| Merge | feed a duplicate into a creature: +150 XP |
| Evolve | stage 1→2 or 2→3: level 10 + 1 duplicate + Mindstone (5 for stage 2, 15 for stage 3). Starts again at L1. Stage 3 can't be caught, only evolved |
| Sell | stage 1: 20 Dust · stage 2: 60 · stage 3: 180 · shiny ×5 |

## 7. The Wilds (next to your island)
- A **big map made by code** (like the island), new layout each week, walked by your Mind. Creatures are **visible on the map** (no random encounters).
- **4 zones**, unlocked by Explorer Rank (account XP from Wilds wins):

| Zone | Unlock | Wild creatures | Loot per win |
|---|---|---|---|
| Greenwood | start | stage 1 Sprout, Bloom, Bubble, Ember | 10–20 Dust, wood |
| Ember Hills | Explorer 5 | stage 1–2 Ember, Magma, Storm | 15–30 Dust, stone, 1 Mindstone (20%) |
| Tide Caves | Explorer 10 | stage 1–2 Bubble, Storm, Glow | 20–40 Dust, stone, Mindstone (30%) |
| Twilight Ruins | Explorer 15 | stage 1–2 Glow, Shade (+ all) | 30–60 Dust, Mindstone (50%), rare seeds |
- **Battle:** the normal duel vs the wild creature's pack (its HP 10 instead of 20, 8-card pack). You use your starter or custom deck.
- **Capture after a win:** stage 1 50%, stage 2 25%. **Snare** item +20% (crafted: 3 wood + 1 Carrot). Mind rarity bonus: Rare +5%, Epic +10%, Legendary +15%.
- **Shiny chance:** 1/256 (Rare Mind 1/200, Epic 1/160, Legendary 1/100).
- **Trail stamina:** each Mind gets 6 Wilds battles a day (refills 1 every 4 h). Wanderer: 4. More Minds = more trips (the NFT perk, no stat edge).
- **KO:** lose a Wilds battle and that Mind is knocked out for 2 h (can't go to the Wilds; Ranked and the island are fine). Heal faster with meals cooked at home: Bean Stew (2 Beans) −30 min, Carrot Soup (2 Carrots) −1 h, Melon Feast (1 Melon) full heal.
- **Weekly boss** at the end of each zone: a 3-phase fight, best loot (guaranteed Mindstone, shiny-chance egg). Leaderboard for fastest clears.

## 8. Raids
**Attack (3 raids a day):**
1. Get 3 islands near your **Island Level** (±3; Island Level comes from buildings). Scouting is free.
2. Bring a raid team: 1 Mind + up to 6 bonded creatures (levels count here). Uses 1 Trail stamina.
3. Break **3 gates** (Farm, Vault, House). Each gate is a short duel (HP 10, max 6 turns) vs the AI playing that gate's guards.
4. Loot per gate won:

| Gate | Loot |
|---|---|
| 🌾 Farm | 1 ripe crop per 2 ripe plots (max 3) |
| 💰 Vault | 10% of loose Dust (max 300) |
| 🏠 House | 25% chance of 1 Mindstone |
| 🔥 All 3 gates | **burn**: one building stops working, or one growing plot pauses 4 h. Repaired with 10 wood + 5 stone, or by itself in 12 h. Nothing is ever destroyed |
Losing a gate costs the raider nothing but the stamina; the raid team rests 1 h.

**Defend:** place up to 2 guards per gate (they fight with your levels). **Towers** (+1 guard power, 40 wood + 20 stone) and **Walls** (one extra duel at that gate, 30 stone). **Vault** keeps Dust safe (300 / 1,200 / 4,000 by level). Each gate you hold: +20 Dust and guard XP.

**Protection rules:**
- 8 h shield after you lose any gate. New players: 3 days protected.
- The same attacker can hit you once a day. Total loss is capped at 15% of loose Dust a day.
- Accounts on the same device or connection can't raid each other (stops feeding alt accounts).
- Targets are always chosen by matchmaking. You can't pick a player, except **Revenge**: one free raid back within 24 h.

## 9. Town (public square)
- A shared plaza: everyone's Minds walk around live (up to 40 per room, more rooms open automatically).
- Preset chat and emotes (as today), friendly duel challenges (no rating), the notice board (events, top players), and shortcuts to Shop, Ranked and Wilds.
- **Trading** between players comes later (v2), with fees and limits, after we see the economy running.

## 10. Economy (Dust)
| Per day | Casual (1 Mind) | Active (3 Minds) | Big holder (10 Minds) |
|---|---|---|---|
| Island farming | ~500 | ~1,400 | ~3,500 |
| Wilds (6 battles per Mind) | ~90 | ~270 + better zones | ~900 |
| Raids (3) | ~0–300 | ~0–600 | ~0–900 |
| **Sinks** | seeds, plots, snares, meals, repairs, Barn slots, buildings, moving creatures | | |
**Leaderboards:** Ranked rating (main) · Points (ranked + max 20/day from selling crops) · Collection (codex %) · Island Level · Raid trophies. Selling crops never gives more than 20 points a day.
The shop never sells creatures, levels or anything that changes a duel. Only looks, seeds, plots and convenience.

## 11. Why own more Minds / rarer Minds
| | Effect |
|---|---|
| More Minds | more creature slots · more summoners to pick (element + skill) · more Wilds trips · more ranked energy · more island workers · more raid teams |
| Rarer Minds | more slots (4 → 8) · better capture and shiny luck · more energy (3 → 5) · Legendary auras |
| Trained Minds | carry their creatures, Bond level and history when sold, so they're worth more |
None of these change duel numbers.

## 12. Loopholes we close
| Loophole | Fix |
|---|---|
| Alt accounts farming and feeding a main via raids | same device/connection can't raid each other · targets picked by matchmaking · daily loss cap · 3-day new-account protection |
| Passing one Mind between wallets to share creatures | 24 h transfer lock for Ranked/raids · ownership checked on-chain at match start |
| Selling a Mind mid-match or mid-raid | ownership checked at start; match results only count if you still owned it when it began |
| Duplicating creatures (two tabs) | every change is a versioned save on the server (same as the island today) |
| Bots grinding the Wilds | Trail stamina caps (6/Mind/day) · rate limits · server-side battles |
| Stalling or quitting duels | 30 s timer · 2 missed turns = forfeit · leaving = forfeit |
| Win-trading in Ranked | existing rule: max 3 rated games per pair per day; same device can't match |
| Buying power | shop sells no power; creatures only from the Wilds, evolving or buying a Mind |
| Raid wipes a player | max 10% per raid, 15% per day, shields, repairs only (nothing deleted) |
| Free players left behind | 4 complete starter decks (46–55% win rate) · Classic uses starter decks only |

## 13. Build plan (each step goes live on its own)
1. **Duel engine + UI** (replaces the crown duel in Ranked/Classic/Practice) · starter decks · Hero Skills · new tutorial · ranked season reset.
2. **Collection:** creature database, bonding to Minds, Barn, deck builder, codex.
3. **The Wilds:** map, creatures on the map, PvE battles, capture, stamina, KO and meals, loot, Explorer Rank.
4. **Growing creatures:** feed, merge, evolve, sell, shinies.
5. **Raids:** guards, gates, loot, burn/repair, shields, revenge, notifications.
6. **Town:** live plaza, friendly duels.
7. **Seasons:** new families, weekly bosses, leaderboards, events.

**Art:** 24 creature sprites (+ shiny colour swaps made by code), card frames and the Wilds tiles. Creatures from OpenArt in one consistent style; frames, tiles and effects drawn by code like the island.

**Tutorial (new):** 1) summon into lanes and win a lane, 2) elements and counters, 3) your Mind's Hero Skill and element, 4) win a full practice duel, 5) visit the island (farm), 6) first Wilds battle and capture, 7) set a guard. Each step gives a small reward.
