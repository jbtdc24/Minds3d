# Real-money prize readiness

**Status: NOT READY. Do not enable real-money prizes.** Passing game tests does not change this.

Gems can be bought with ETH but cannot be cashed out. That keeps today's cups in-game only. Turning prizes into money changes the legal nature of the game, because paid entry plus a prize can count as gambling or a regulated contest.

| Requirement | Today | Needed before real money |
|---|---|---|
| Server decides outcomes | Yes: raids, cups and adventures replay on the server | Same, plus independent review |
| Fair competition | Partly: a player can still optimise inside a 3.5-minute try, and a second account can scout villages | Identity checks, one account per person, reveal-free or live-streamed attacks |
| Payout integrity | Gem payouts happen once (`settled` claim), tested on a stand-in database | Payouts through an audited process, not the game server's hot wallet |
| Interrupted payouts | A failed Gem payout is logged and marked, but has no automatic retry | Durable payout queue with retries and alerts |
| Reconciliation | `payments` table and admin log exist | Daily match of chain, database and ledger, with an append-only ledger |
| Abuse and bots | Cheat meter, connection flags, AI keys barred from cups | Device and identity signals, manual review before payout |
| Legal | Not reviewed | Lawyer review per market: gambling, contest, money transmission, consumer law, age limits |
| Tax | Not reviewed | Winner reporting duties per market |
| Sanctions and KYC | None | Screening and identity checks on payouts |
| Terms | None found in the game | Terms of service, contest rules, privacy policy, refund policy |

## Recommendation
Keep Gem-only cups. If you want real prizes later, start with sponsor-funded prizes with no paid entry, after legal advice.
