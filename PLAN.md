# Mindclash (Mind Duel) — locked design + task list (2026-10-28)

## Game design (locked)
- **1v1 duels, one queue.** Bring 1–3 Minds. Best of 3 rounds; pick which Mind fights each round (1 Mind = it fights every round).
- **Every Mind has the same stats and skills.** Traits = looks, victory pose, emote, legendary aura only. No pay-to-win.
- **Each turn (~10 s):** both secretly pick ⚔️ Strike / 🛡️ Guard / 🌀 Trick (+ optional 1 skill), then reveal.
  Strike > Trick > Guard > Strike. Winner deals 20 dmg; tie = both take 5. 100 HP per round.
- **Focus ⚡:** 0 at round start, +1 per turn, +1 extra when you lose a clash (comeback). Skills cost 1–3 ⚡.
- **Loadout:** pick 4 of 12 shared skills before the match; each usable 2× per match.
  - 1 ⚡: Peek, Bluff, Heal (+10 HP), Drain (steal 2 ⚡; replaced Swap, which acted as a free heal) · 2 ⚡: Freeze, Mirror, Quick Draw, Iron Mind · 3 ⚡: Overcharge, Counter (2.5x), Mind Lock, Chaos
  - Balance (tools/sim_duel.mjs, 6,000 bot matches): every skill 47–55% win rate, seat 1 49.6%, ~26 turns / 2.6 rounds per match.
  - Bots: easy / normal / hard (hard reads habits 3 levels deep; beats human-like habits ~90%, easy ~70%).
- **Leaderboard points:** rating from wins; rarity bonus on wins only (Common +0%, Uncommon +5%, Rare +10%, Epic +15%, Legendary +20%).
- **Bot:** if no human in ~20 s, a rating-matched bot, clearly labelled BOT; bot wins count less.

## Tasks
### A. NFT accuracy
1. Read the collection on-chain (token IDs, tokenURI metadata, images).
2. Map game IDs to the real on-chain / OpenSea IDs.
3. Auto-check all 3,333: render each Mind and pixel-compare with its OpenSea image; report mismatches.

### B. Wallet + accounts
4. Wallet login (sign-a-message, no gas, no transactions) — MetaMask / WalletConnect.
5. Read which Minds the wallet owns + how many; only owned Minds are playable (re-checked on the server).
6. Profile: custom name (filtered, unique), owned Mind as profile picture.

### C. Backend + anti-cheat
7. Vercel serverless API + Supabase database.
8. Server-authoritative matches: the server runs every turn; clients only send their secret pick (commit → reveal), so no peeking or faking.
9. Signed sessions, rate limits, input validation, ownership checks, replay protection.
10. Matchmaking queue by rating + bot fallback.
11. Live PvP over realtime channel (Supabase Realtime), turn timer, disconnect = auto-pick / forfeit.

### D. Game
12. ✅ Rewrite the engine for Mind Duel (moves, Focus, 12 skills, rounds, swap).
13. ✅ Bot AI (pattern-reading, rating-scaled).
14. ✅ Balance: thousands of simulated matches; no skill/move dominant.
15. Battle presentation: 3D/2D face-off, secret-pick UI, reveal cinematic per clash (Strike vs Guard, etc.), skill FX.
16. Skill codex + tooltips + How to Play / tutorial match vs bot.

### E. Leaderboard + history
17. Rating, wins, losses, win rate, streaks, match history — stored server-side only (tamper-proof).
18. Live leaderboard page (global, weekly), player profile pages with history.

### F. Polish
19. Professional start flow: splash → wallet login → profile → main menu.
20. Real settings: audio, graphics, view 2D/3D, battle speed, account, sign out.
21. Clean UI pass everywhere, loading progress bar, mobile layout.
22. SFX + music for the new mechanics.
23. Deploy + final test on Vercel.

## Needed from the owner before starting
- [x] Contract 0x947c1501fdeb97d2aa0642c14afbd8a99427d227 on Robinhood Chain · https://opensea.io/collection/mindsdotgames
- [~] Supabase: publishable key received (web/src/config.js). Still needed: Project URL + secret key in Vercel env var SUPABASE_SECRET_KEY
- [x] Free trial: YES — demo Minds for non-holders, playable vs bots/players, not on the leaderboard
