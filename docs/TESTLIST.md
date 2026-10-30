# Mindclash — everything in the game (retest checklist)

Test each item on BOTH a **wallet account** and a **trial account** where it says so: several bugs only appeared on wallet accounts.
Tick when it works. Write down anything odd (a screenshot helps).

## 1. Start + accounts
- [ ] Title screen, tap to play, music starts
- [ ] Connect wallet / sign in
- [ ] Try free (trial account)
- [ ] Stay signed in after reloading the page
- [ ] Sign out
- [ ] Change display name / profile picture

## 2. Lobby
- [ ] Ranked tile, big Mind Island tile (live chips: crops ready, shards, builds, Dust), Classic, Practice, Tutorial
- [ ] Island tile glows when something is ready
- [ ] Leaderboard: Rating + Points tabs, open a player's profile, hide/show
- [ ] Shop, Inventory, Leaderboard, Friends, Rules, Settings buttons
- [ ] Your Minds stand on the plaza
- [ ] Phone sideways: nothing cut off or overlapping

## 3. Duels
- [ ] Tutorial duel (guided)
- [ ] Practice vs bot: Easy / Normal / Hard
- [ ] Classic (real player, or stand-in after 20 s)
- [ ] Ranked (wallet only): pick 1-3 Minds, STAKE banner shows win/lose/energy
- [ ] Prizes are hidden 1-15, next shows LOW/MID/HIGH
- [ ] Cards 1-7 used once per round; ties carry the prize over
- [ ] Spells: Boost, Double, Trap, Reverse
- [ ] Timer: running out loses the round
- [ ] Quick chat
- [ ] Forfeit
- [ ] Result screen: rating, points, stake, "+Dust sent to your island" (ranked)
- [ ] Rejoin a live match after reloading
- [ ] Out of energy: tired Minds can't be picked, tapping one offers a refill

## 4. Energy
- [ ] Energy bars per Mind in Inventory
- [ ] Daily refill at 00:00 UTC
- [ ] Refill: 3 shards / 300 Dust / 3 Gems; max 3 per Mind per day

## 5. Mind Island
- [ ] First visit: island tour starts (8 steps), each step waits for the action, gift at the end (200 ✨, 3 💎, 4 carrot seeds), only once
- [ ] Skip tour works (no gift, never comes back)
- [ ] Drag to look around, wheel/pinch zoom, 🏠 back to the house
- [ ] Hand: tap weeds/rocks/trees/ripe crops
- [ ] Clear tool: Minds walk over and chop; gives Dust/wood/stone
- [ ] Plot tool: 10 Dust each; 12 free plots
- [ ] Plant: pick a seed, drag across plots
- [ ] Harvest; crops grow while you are away
- [ ] Wild grass grows back on ground left alone
- [ ] Day/night, smoke, lamps, fireflies, wind in the grass, light rays
- [ ] Saved after reload ("☁ Saved")
- [ ] Changes from outside show up by themselves (admin gift, raid on you)

## 6. Building
- [ ] Build menu lists everything with cost and count
- [ ] Pay with Gems switch
- [ ] Cottage, Mill, Barn, Tower, Trap: timer + scaffold + a Mind hammering
- [ ] Walls, fences, flowers: instant, drag a line
- [ ] Builders = Minds owned (min 1): "builders busy" message
- [ ] Finish now with Gems
- [ ] Tap a building: Move, Store, Remove (half back), Upgrade Lv2/Lv3
- [ ] Home and Well can move, can't be removed or stored
- [ ] 📦 storage drawer: place stored buildings for free (12 slots)
- [ ] Energy Well: tap it, shards ready, Collect
- [ ] Decorations + Gem-only decorations

## 7. Raids (test on a wallet account!)
- [ ] Raid button opens the army screen: raids left, supplies cost, troops owned
- [ ] Your Mind is the hero (wallet) / Captain (trial)
- [ ] No troops: "Train troops" is the main button
- [ ] Attack: fee paid, banner, music
- [ ] Red no-drop zone; tap and hold to drop troops
- [ ] Brawler, Archer, Bomber, Giant all behave differently
- [ ] Hero + Battle Cry; spells Rage, Heal, Bolt
- [ ] Towers, traps and guards fight back
- [ ] Stars, % destroyed, coins flying, timer, End raid
- [ ] Result shows loot; troops you didn't send come home
- [ ] Out of raids: offers a Raid Ticket
- [ ] Being raided: notice, Dust lost, 8 h shield, ⚔️ Revenge button

## 8. Adventure + world map
- [ ] World map screen: 12 islands, biomes, fog on far ones
- [ ] Pick potions (max 5), Fly: airship flight animation
- [ ] Airship upgrades from the map and Shop → Supplies; far islands locked until then
- [ ] Sky Fuel is used on far flights
- [ ] Each biome looks different (volcano lava + embers, snow ice + snowfall, storm rain + lightning, crystal, garden petals, dragon)
- [ ] Tap to walk; tap monsters to fight; tap loot to gather; cut grass/trees/rocks (40 per hour)
- [ ] Monsters show level; bosses per tier (Ogre, Golem, Drake, Titan)
- [ ] Guarded chests need the guard beaten
- [ ] No free healing: Potion button; ability button
- [ ] Go home / timer / knocked out (half loot); unused potions return
- [ ] 5 adventures a day (+1 per Mind), Adventure Ticket

## 9. Shop + money
- [ ] Tabs: Seeds, Army, Supplies, Gems, Sell, Land
- [ ] Dust, ×5 and 💎 buttons work; disabled when you can't afford
- [ ] Craft potions from herbs
- [ ] Selling crops gives leaderboard points (max 20 a day)
- [ ] **Buy Gems (wallet):** pick pack → wallet switches to Robinhood Chain → pay → Gems arrive

## 10. Inventory, friends, settings
- [ ] Inventory: Minds tab, Items tab (resources, army, storage count)
- [ ] Friends: add, chat lines, online dot
- [ ] Settings: Music, SFX sliders, Graphics, Animation speed, Rules, Account, Code
- [ ] Rules page explains the game + island

## 11. Admin (owner wallet only)
- [ ] Settings → Code opens Admin; other accounts get "code does not work"
- [ ] Find a player; give Dust/Gems/items/points (shows up within seconds)
- [ ] Suspend, Ban (player sees the reason), Unban
- [ ] Cheat meter lists flagged players

## 12. Sound
- [ ] Lo-fi: lobby + island; lo-fi 2: map + adventures; lo-fi beat: raids; battle music: duels
- [ ] Sound effects on actions; flying wind, fanfare
- [ ] Music/SFX sliders work

## 13. Round 8 (run supabase/007_community.sql first)
- [ ] Lobby title fits; Friends never shows the null error; "Tap where..." message is small
- [ ] Each mode has its own music, no overlap: lobby, island, town, map, adventure, raid, duel
- [ ] Minds babble on the island and in town; raids have small squeaks
- [ ] Friends: type freely, Unfriend, Report. Mail: announcement, take a gift once
- [ ] Settings: Report a problem, Connect an AI. Admin: Players, Send mail, Reports
- [ ] Build an Army Camp: more camp space and +1 raid; War Horn in Shop; revenge uses no raid
- [ ] Sky raiders hit after time away; good defences beat them; revenge works
- [ ] Tap a Mind or 🧠: give a job, type an order; come back later to "While you were away"
- [ ] Mind Town: walk, chat, Find my Mind, Town Time after 10 minutes, meet a player
- [ ] Siege Cup: enter for 5 Gems, 3 tries, leaderboard, payout next day
