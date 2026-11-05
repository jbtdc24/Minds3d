# QA report: Round 27 / 27b (Loaner Minds + AI slots), 2026-11-05

Method: code audit of every Round 27 path, plus `node tools/test_server.mjs` (**646 passed, 0 failed**). No code was changed.
I could not do a live wallet login in the browser pane (it needs the owner's wallet and Hello Minds sign-in), so every live flow is in "Not tested" below.

## Bugs

### 1. HIGH: Loaners with Uncommon art earn Uncommon ranked rewards
- Steps: buy L2 (art #14) or L3 (art #8), then win a ranked duel with it.
- Expected: a Loaner always counts as Common (spec).
- Actual: `lib/game.js:230` reads `rarityOf(art id)`, and #14 and #8 are Uncommon, so the win gets the +5% Uncommon bonus. L1, L4, L7… (art #49) are correct.
- Fix: map the ids in `state.p[i].loaner` to 'Common' before calling `winPoints`.

### 2. LOW: Resuming a Loaner payment shows "+0 💎"
- Steps: pay for a Loaner with USDG or ETH, close the tab before it confirms, then reopen the game.
- Actual: `web/src/app.js:1911` shows `+${r.added} 💎 from your last payment.`, and `added` is 0 for a Loaner. The Loaner itself is credited.
- Fix: show "🪪 New Loaner Mind is yours" when `r.loaner` is set, and call refreshMe.

### 3. LOW: A Loaner's games left goes stale after a ranked match
- `loaners[].left` only updates on refreshMe (`/me`), so after a duel the team picker can still show 5/5 for a short time. The server is correct and still refuses the 6th game.
- Fix: call refreshEnergy() after a ranked match ends (or check that it already runs there).

### 4. LOW: The AI panel doesn't show a new Loaner right away
- After buying from the "🪪 + Loaner" tab, the new "Loaner N" tab only appears the next time the panel repaints.
- Fix: repaint the dock after buyLoaner() succeeds.

### 5. LOW: AI-key (agent) tool schema accepts integer Minds only
- `lib/routes/agent.js:53` says `minds: items integer`, so agent clients can't send 'L1'. AI keys are for the game team only, so this has little impact.

### 6. INFO (by design, worth knowing)
- An owner of NFT #49 (or #14 / #8) can't team that NFT with a Loaner that uses the same art ("same picture" refusal).
- The free Loaner is only created once the player has an island. It appears on the first `/me` after the island exists.
- The LOANER badge is still missing on the leaderboard, the Mind Town name tag and the player card.

## Checked in code and working
- Free Loaner once per wallet (rev-guarded, two tabs can't make two), none for guests; old Rank Pass AI moves from slot '0' to L1 with its job and away slot (test).
- Unknown or someone else's Loaner refused (test); same art twice refused; 5 ranked games a day then refused (test); queue/poll/bot fallback spend the Loaner's games once; refund on a failed pairing.
- Energy caps 5/6/7/8/10 (test); refills have no daily limit, including 4 refills on a Loaner with Dust (test).
- 120 Gems buys exactly one Loaner and 119 is refused (test); the same tx can never be credited twice (st.paid mark + payments primary key); reconcile and admin recovery understand the 'loaner' key.
- AI slots = NFTs + Loaners; Awaken names it Clash-L1-…; away ranked and the browser ranked job play a Loaner alone.
- Loaners can't be traded or gifted (trades only move resources).

## Not tested (needs a live session)
- Real wallet login on live: free L1 appears, ranked with L1, L1 + NFT, 2 Loaners.
- Buying through the shop card and the dock tab in the UI; the USDG/ETH wallet popups (no real money).
- Awaken on a Loaner tab with a real Hello Minds account; away play over a few hours.
- Visual check at 375 px (phone), Safari/iPhone/Android, and regressions in classic, practice, trial, island, adventure and Siege Cup in the live UI. The tests cover their server rules.

## Round 27c fixes (same day) + re-audit
- **Owner decision: every Loaner is the same grey Loaner Mind (game id 0).** A grey-lavender copy of #49: web/data/thumbs/0.webp, and the in-game pixel character is drawn grey (nft2d tokens[0] with Loaner: true). Same picture in one team is fine now; the "same picture" rule is gone.
- Bug 1 FIXED: a Loaner is id 0, so its rarity is always Common (rewards correct). Test added.
- Bug 2 FIXED: a resumed Loaner payment says "🪪 Your new Loaner Mind… is here!" and refreshes.
- Bug 3 FIXED: energy and Loaner games refresh when a ranked match ends.
- Bug 4 FIXED: the AI panel repaints after a buy from the "🪪 + Loaner" tab.
- Bug 5 FIXED: the AI-key schema accepts "L1".
- Badges DONE: leaderboard row + player card (pfp 0 = LOANER), Mind Town name tag ("Name · LOANER"; Loaner-only players walk as the grey Mind), duel plates, profile. The profile picture can be the Loaner Mind (server allows pfp 0 for wallets); the invite card renders it (card.js allows 0).
- Re-audit: 649 tests pass; in the browser buildRig(0) draws grey pixels, rarityOf(0) = Common, the 3,333-Mind lists (tokenIds, Mind Town residents, bots) never include 0, thumbs/0.webp loads, no new console errors (the only 404 is /api locally, as before).
- Still needs a live session: wallet login, buying for real, Awaken on a Loaner, phone and Safari.

## Round 27g full QA sweep (fixed)
- AI on a Loaner never refilled its games (browser ranked job, away play, op refill, agent energy all turned "L1" into 0): now refills like any Mind (shards, Dust, allowed Gems).
- Siege Cup: one entry per Mind held now counts Loaners (maxEntries(minds, loaners)).
- Inventory (⚡ bag): Loaners are listed with their games, LOANER tag, tap = refill / use as profile picture / buy another.
- Profile picture 0 (Loaner) kept by every `pfp || 49` fallback (changed to ??), lobby mind name says "Loaner Mind".
- Earlier today: demo Minds 49/14/8 no longer flash on refresh; AI panel never opens the old Rank Pass slot.
- 651 tests pass. Left as is (by design): island farm plot bonus stays +1 per NFT held (holder perk).
- Not tested (needs a live session): real wallet login, a real purchase, Awaken on a Loaner, phone and Safari.
