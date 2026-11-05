# Loaner Minds + AI slots (owner approved 2026-11-05) — replaces the Rank Pass

## The idea in one line
Every wallet player gets **1 free Loaner Mind** on top of the NFTs they hold. A Loaner **plays exactly like a real Mind NFT**. Every Mind (real or Loaner) can have **one Hello Minds AI**. Want more? **Buy more Loaners, as many as you like.**

The only perk of holding Mind NFTs: you already have those Minds, so you don't need to buy them.

## Who gets what
| Wallet holds | Minds in the game | Free AIs |
|---|---|---|
| 0 NFTs | 1 Loaner | 1 |
| 1 NFT | 1 real + 1 Loaner | 2 |
| 5 NFTs | 5 real + 1 Loaner | 6 |

- **No limit** on bought Loaners.
- Guests (no wallet) stay as they are now (trial mode).
- New accounts start with **0 Gems** (already true in code: `newIsland` gems 0). Check nothing else gives starter Gems (tutorial, mail, quests).

## Buying a Loaner (comes with its AI)
**$10 = 10 USDG, or 0.0045 ETH, or 120 💎.** Only these three (no Dust). One place in code: `LOANER_PRICE` in `web/src/gems.js`.

## Loaners play like real Minds
| | Real NFT Mind | Loaner Mind |
|---|---|---|
| Ranked games a day | **5** | **5** |
| Refill | new 5 at 00:00 UTC, or buy a refill (3,000 Dust or 8 💎, max 3 a day per Mind) | same |
| Rarity, rewards, jobs, AI | normal | same as a real Mind (by its artwork's rarity) |
| Label | its number | **LOANER** badge |

- Energy is **per Mind**: 5 Loaners = 25 ranked games a day, 3 NFTs + 1 Loaner = 20.
- This changes real NFTs too: today their daily energy is 3-5 by rarity (`ENERGY_CAP` in `web/src/energy.js`); it becomes a flat 5 for every Mind.
- Assumption (confirm): Loaners cannot be traded or gifted, because they are not on-chain NFTs.

## LOANER label: shown on
Mind picture (badge corner), AI panel tabs ("Loaner 1"), duel screen, team picker, profile, leaderboard, Mind Town name tag, player card.

## Rank Pass goes away
- Remove the Rank Pass from the store and the lobby. The free Loaner is the way into Ranked.
- A pass still running keeps working until it ends; then the player uses their Loaner.
- Zero-holders no longer see 3 loaner Minds: only the Loaners they own (1 at first).

## Moving old players over (one-time, on load)
- Every wallet player gets their free Loaner automatically.
- An AI linked to the old Rank Pass slot (`'0'`) moves to the free Loaner's slot, with its job.

## Build notes (for the coding session)
- Unlimited Loaners means they can't use the 3 on-chain loaner ids as identity. Give each its own game id (e.g. `L1`, `L2` per player, or a global sequence) and an artwork picked from the loaner art set (#49, #14, #8, cycled or random). Its rarity = its artwork's rarity. Store `st.loaners = [{ id, art, at }]` on the island.
- Energy per Mind = 5, refills as today; Loaner energy kept on the island like `st.rp`.
- Ranked/queue (`queue_join.js`, `matchmaking.js`, `rankpass.js`, `owned.js`): a pick may mix real Minds and Loaners; one team never has the same Loaner twice.
- AI: free AIs = real Minds + 1; each bought Loaner adds one AI (Round 26 Awaken: spares first, then a new AI). Client `slots()` in `web/src/autopilot.js` = owned Minds + Loaners.
- Payment: reuse `claimPayment` checks in `lib/routes/gems.js` with product keys `loaner` / `loaner:usd`; Gems path = server op taking 120 `st.gems`. `lib/reconcile.js` + admin recovery must understand the key. Log with `logBuy` (real: true for money).
- Tests in `tools/test_server.mjs`, then the owner does one small real USDG and one ETH purchase.

## Still to confirm with the owner
1. Loaners can't be traded or gifted: OK?
2. Energy refills can still be bought with Dust (3,000) as well as Gems (8): keep that?
