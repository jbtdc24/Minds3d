# Loaner Minds + AI slots (owner approved 2026-11-05) — replaces the Rank Pass

## The idea in one line
Every wallet player gets **1 free Loaner Mind** on top of the NFTs they hold. Every Mind (real or Loaner) can have **one Hello Minds AI**. Want more AIs? **Buy another Loaner Mind ($10)**: it comes with its AI.

## Who gets what
| Wallet holds | Minds in the game | Free AIs | Can buy |
|---|---|---|---|
| 0 NFTs | 1 Loaner | 1 | up to 2 more Loaners |
| 1 NFT | 1 real + 1 Loaner | 2 | up to 2 more Loaners |
| 5 NFTs | 5 real + 1 Loaner | 6 | up to 2 more Loaners |

- Max **3 Loaners** per player (1 free + 2 bought): one per loaner artwork (#49 Common, #14 and #8 Uncommon), so a team never has the same Mind twice.
- The free Loaner is **#49 (Common)**. Bought Loaners are #14, then #8.
- Guests (no wallet) stay as they are now (trial mode).

## Price of an extra Loaner (comes with its AI)
**$10 = 10 USDG, or 0.0045 ETH, or 120 💎** (same as the $10 "Bag of Gems"). One place in code: `LOANER_PRICE` in `web/src/gems.js`.

## Loaner rules (so holding an NFT is always better)
| | Real NFT Mind | Loaner Mind |
|---|---|---|
| Ranked | yes, normal energy by rarity | yes, **5 ranked games a day** each |
| Rarity bonus | yes | **no** |
| Trade / gift / Pot duels | yes | **no** |
| AI | free (one per NFT) | free for the first Loaner, bought ones include their AI |
| Label | its number | **LOANER** badge everywhere |

So a 1-NFT holder always beats a 0-NFT player: one more Mind, a stronger one (rarity bonus, more energy), one more free AI.

## LOANER label: shown on
Mind picture (badge corner), AI panel tabs ("Loaner #49"), duel screen, team picker, profile, leaderboard, Mind Town name tag, player card.

## Rank Pass goes away
- The free Loaner IS the way into Ranked for everyone. Remove the Rank Pass from the shop and the lobby.
- Players with a pass still running: it keeps working until it ends (no refund needed); after that they use their Loaner.
- Zero-holders no longer see 3 loaner Minds: only the Loaners they have (1 at first).

## Moving old players over (one-time, on load)
- Every wallet player gets the free Loaner (#49) automatically.
- An AI linked to the old Rank Pass slot (`'0'`) moves to the Loaner #49 slot, with its job.
- AI slots: free AIs = real Minds + Loaners. Awaken (Round 26) keeps working: spares first, then a new AI.

## Build notes (for the coding session)
- Store `st.loaners = [49, …]` on the island (bought ones added by payment). Loaner energy like `st.rp` (5 ranked/day each).
- Payment: reuse `claimPayment` checks in `lib/routes/gems.js` with product keys `loaner` / `loaner:usd`; Gems path = server op taking 120 `st.gems`. `lib/reconcile.js` + admin recovery must understand the new key. Log with `logBuy` (real: true for money).
- Client slots (`web/src/autopilot.js` `slots()`): owned Minds + `st.loaners`; `slotName` = "Loaner #49".
- Ranked/queue (`queue_join.js`, `matchmaking.js`, `rankpass.js`): pick may mix real + Loaners; Loaners spend their own daily games, no rarity bonus.
- Tests in `tools/test_server.mjs`, then the owner does one small real USDG and ETH purchase.

## Still to confirm with the owner
1. Is 5 ranked games a day per Loaner right?
2. Do Loaners earn the same Dust/points per win as real Minds (minus the rarity bonus)?
