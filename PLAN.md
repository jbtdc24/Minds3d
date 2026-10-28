# Mindclash — locked design + task list (updated 2026-10-29)

## Game design: Prize Duel (locked)
- **1v1, best of 3 rounds.** Bring 1–3 Minds; they take turns, one per round. Every Mind plays the same (traits = looks only).
- **A round:** 7 crowns worth 1–7 come up in a random order, one per turn. Both players hold cards 1–7.
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
- **Leaderboard points:** 10 per ranked win + rarity bonus (Uncommon +5%, Rare +10%, Epic +15%, Legendary +20%). Rating = Elo.
- **Bot:** if no human in 20 s, a bot clearly labelled BOT; bot games count half.

## Done
- NFT accuracy: all 3,333 on-chain IDs mapped to the art by trait set; 60/60 random sample pixel-identical, full check 864/864 identical (rest = IPFS gateway timeouts, 0 mismatches).
- Wallet login (sign-only), owned Minds read from Robinhood Chain, demo Minds for the free trial.
- Server-authoritative matches (Vercel + Supabase), hidden picks, rate limits, signed sessions, optimistic locking. 28 server tests pass.
- Matchmaking + bot fallback, live updates (Supabase Realtime + polling), ratings, points, streaks, history, live leaderboard, profiles.
- Prize Duel engine + bot + balance sim.
- Art (OpenArt GPT Image 2.5): 3 arena backdrops, 4 mode banners, card back, crown + 4 spell icons (`tools/process_art.py`).
- Pixel UI rewrite: hub with modes, Coming Soon (Train Your Mind, Auto Battle), card table, reveal sequence, codex, settings.

## Next
- Custom domain `play.minds.games` (CNAME from the domain owner) → then report the Coinbase/Blockaid false positive.
- Train Your Mind / Auto Battle modes.
