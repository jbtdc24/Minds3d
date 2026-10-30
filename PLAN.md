# Mindclash — locked design + task list (updated 2026-10-29)

## Game design: Prize Duel (locked)
- **1v1, best of 3 rounds.** Bring 1–3 Minds; they take turns, one per round. Every Mind plays the same (traits = looks only).
- **A round:** 7 prizes drawn at random from 1–15 (values hidden until they come up; the next one shows LOW 1-5 / MID 6-10 / HIGH 11-15), one per turn. Both players hold cards 1–7. (2026-10-30, owner: make it less predictable)
- **A turn:** both secretly play one card (+ optional spell). Cards are shown first: higher card takes the crown.
  Tie = the crown carries over to the next turn (pot). Every card is used once per round.
- **Spells** (revealed after the cards, in this order). Same spell on both sides cancels, except Double + Double = crown x3.
  - Boost: +2 to your card (once per round)
  - Reverse: the lower card wins (once per MATCH)
  - Trap: if the rival wins this crown with a 7, you steal it (once per round)
  - Double: crown x2 if you win, and you win ties (once per round)
- **Round winner:** most points (tie-break: crowns won, then biggest crown). Unused round spells are lost.
- **Timer:** 20 s per turn (+ reveal time). No pick in time = you lose that round. Both late = drawn round.
- **Balance** (`node tools/sim_duel.mjs`, real engine + bot): random vs random 50/50; easy/normal/hard bot vs random 82/89/90%;
  hard vs hard 47.3/47.3 (5% draws); ~16–23 turns per match.
- **Stake:** every Mind brought is staked: 1 ⚡ each, win +10 per Mind (+ rarity), loss −5 per Mind (floor 0); bot games half.
- **Leaderboard points:** 10 per Mind brought, per ranked win + rarity bonus (Uncommon +5%, Rare +10%, Epic +15%, Legendary +20%). Rating = Elo.
- **Bot:** if no human in 20 s, a bot clearly labelled BOT; bot games count half.

## Done
- NFT accuracy: all 3,333 on-chain IDs mapped to the art by trait set; 60/60 random sample pixel-identical, full check 864/864 identical (rest = IPFS gateway timeouts, 0 mismatches).
- Wallet login (sign-only), owned Minds read from Robinhood Chain, demo Minds for the free trial.
- Server-authoritative matches (Vercel + Supabase), hidden picks, rate limits, signed sessions, optimistic locking. 28 server tests pass.
- Matchmaking + bot fallback, live updates (Supabase Realtime + polling), ratings, points, streaks, history, live leaderboard, profiles.
- Prize Duel engine + bot + balance sim.
- Art (OpenArt GPT Image 2.5): 3 arena backdrops, 4 mode banners, card back, crown + 4 spell icons (`tools/process_art.py`).
- Pixel UI rewrite: hub with modes, Coming Soon (Train Your Mind, Auto Battle), card table, reveal sequence, codex, settings.

- 2D rewrite (no 3D library): canvas stage with NFT sprites (same rig, 1:1 with the NFTs), particles, camera punches, screen FX; chiptune music + SFX composed in code.
- 7 battlegrounds: Sunny Meadow, Crystal Peaks, Night Market, Sunset Beach, Sky Arena, Moonlit Arena, Blossom Arena (`?stage=<name>` previews one). Arena floor sits above the card tray so Minds are never hidden.
- Lobby (Mind Plaza) with your showcase Minds, always-visible leaderboard with a top-3 podium, Jersey 10 pixel font, text sized to fit its boxes.
- Interactive tutorial (coach-guided scripted duel), quick chat (preset lines, in-match + friends), friends list, profile showcase (pick up to 3 Minds).

- Popup windows (profile, leaderboard, settings, rules, Mind picker) over the lobby; collapsible leaderboard tab; Nunito + Lilita One fonts.
- Backdrops are anchored to the world origin (platform always under the Minds, never blank edges).
- Fair play: trial accounts practice only; ranked bots always Hard (bot games count half); two accounts on the same connection are never paired;
  the same two players are rated max 3 times per 24 h; matches with fewer than 3 real turns (idle / instant forfeit) give no rating or points.
  Stale or old-version live matches are closed automatically. Ownership checks fall back to the cached chain scan when the RPC is slow.

- Classic mode: real-player duels open to everyone (trial accounts + holders together), unrated, Normal bot after 20 s. Unranked games (classic, practice) don't change wins/losses.
- Fonts: Nunito for everything you read; Lilita One (no pixel font) on the logo, big titles and big numbers.
- Mind Energy: daily ranked energy per Mind (Common/Uncommon 3, Rare/Epic 4, Legendary 5), refills 00:00 UTC, belongs to the NFT.
  A ranked match uses 1 per Mind brought (spent atomically for both players at match start); win points = 10 per Mind + rarity bonus.
  Classic / Practice / Tutorial free. `supabase/003_energy.sql` applied.
- Inventory window (🎒 in the lobby): every Mind with its own energy bar, set profile picture / showcase; Items tab ready for future items.
- `supabase/002_social.sql` applied in Supabase (2026-10-29): friends, messages, showcase, match chat live.

## Next
- Custom domain `play.minds.games` (CNAME from the domain owner) → then report the Coinbase/Blockaid false positive.
- Train Your Mind / Auto Battle modes.
