# MINDS CLASH: full QA + security report (2026-11-05)

Tested on live https://www.mindsclash.games with the owner's Chrome (wallet + Hello Minds signed in), fresh trial accounts, and the code. No code was changed for this report. No money was spent.

## A. Tools: all pass
test_server 651/651 · fuzz 13,600 calls, 0 crashes, money stayed valid · economy audit: no free-money loop · mutation check: every planted bug caught · duel and raid sims balanced.

## B. Login / account
| Check | Result |
|---|---|
| Owner wallet session loads (lobby, Minds, Loaner) | OK |
| Trial account: made, plays a duel, red "progress not saved" notes | OK |
| Log out everywhere: old token refused right after | OK (tested on a trial account) |
| Bad or edited token | 401 OK |
| No token | 401 OK |
| Refresh during load (no demo-Mind flash, AI panel on Loaner 1) | OK (fixed in 27e/27f) |

## C. Hello Minds / AI
| Check | Result |
|---|---|
| AI panel tabs #1317 / #1848 / Loaner 1 / + Loaner | OK |
| Proof reads the AI's real conversation from Hello Minds | OK, matches |
| Out-of-cognition warning (Clash-L1-yf6l) | OK, shown top and in the panel |
| Job plan running (Clash-1317, 7 jobs, Adventure step) | OK |
| Away play on (328 rounds) | OK |
| AI limit = NFTs + Loaners (3 slots) | OK |

## D. Gameplay
| Check | Result |
|---|---|
| Ranked with Loaner 1, played to the end | OK: LOANER badge on the plate, games 5→4, rating −7 |
| Team picker: Loaner picked, 0-energy NFTs shown RESTING | OK |
| Practice duel (trial) | OK |
| Lobby line-up #1317 + #1848 + grey LOANER 5/5 | OK |
| Buy-Loaner window (120 💎 / $10) + payment info (USDG + ETH on) | OK (not bought) |
| Phone 375 px duel layout | OK |
| No console errors in the owner's tab | OK |

## E. Security / cheats (all refused)
| Attack | Result |
|---|---|
| Play an NFT you don't own (#1) | 403 |
| Play someone else's Loaner (L9) | 403 |
| Trial plays ranked | 403 |
| Fake tx hash / unknown pack | 400 |
| Trial buys a Loaner with Gems | 403 |
| Admin actions as a player (send mail) | 403 |
| Cron route without the secret | 401 |
| Profile picture of a Mind you don't own (also trial using 0) | 403 |
| Refill a Mind you don't own / a negative id / as a trial | 403 |
| Island buy with −100, 1e9, 2.7, "x", `__proto__`, sell −50 | clamped or refused, no free Dust |
| 10 buys at the same moment (race) | each charged once, totals exact |
| Other player's match / mail | 404 |
| Trade a Loaner | refused (Loaners aren't tradeable items) |
| Trial gifts Gems / makes an AI key | 403 |
| XSS: names, chat, toasts | all escaped or plain text (code check); trials can't set names |
| CORS from another site | no access header (blocked) |
| Page in an iframe / script injection | X-Frame-Options DENY + strict CSP |
| Rate limit | 429 after 60 calls a minute |

## Problems found
1. **FIXED (2026-11-05): junk payment records.** The intent is now saved only for a real tx from the player's own wallet (2 tests added). Was: A claim with a random but valid-looking tx hash saves a "payment intent" row. The daily check deletes it later, but anyone can add junk rows (rate-limited to 30 a minute). `lib/routes/gems.js:49`. Fix idea: save the intent only after the chain read finds the tx.
2. **LOW (by design): Hello Minds sign-in is kept in the browser.** localStorage holds `minds_oauth_session` (the Hello Minds SDK) and the WalletLink session. This is normal for those libraries; the strict CSP limits the risk.
3. **INFO: owner action.** Clash-L1-yf6l (Loaner 1 AI) has 0 cognition.

No critical or high problems found.

## Not tested (and why)
- Connect wallet / log in again on the owner account: needs a wallet signature that only the owner can make. Log out was tested on a trial account only, so the owner stays signed in.
- Real Gem or Loaner purchase, real USDG/ETH (no money spent).
- Awaken a new AI and "Talk to AI": these use the owner's Hello Minds cognition.
- Two real players (duel invite, trade, gift between wallets) and Mind Town chat with another person.
- Safari / iPhone / Android hardware.
