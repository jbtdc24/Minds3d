# MINDS CLASH: pre-launch QA and security report

Date: 2026-11-04 · Live site: https://minds3d.vercel.app · Code: branch `island` (main = 38f9b35)

## Fix status (2026-11-04, after the owner said "fix everything")
Fixed in code: #4 (AI waits in short calls, function limit 30 s), #5 (inner calls carry the real connection),
#6 (no fixed key: fails closed), #7 (raid loot: lv1 +45, lv2 +219), #8 (wood/stone halved from Lv5, Town Hall
Dust/40, 📦 Builder Crate 4,000 Dust = 300 wood + 300 stone), #9 (IP limit before key lookup), #10 (supabase-js
bundled in web/vendor, jsdelivr out of the CSP), #11 (daily island copies, 7 days, admin Restore: run
supabase/011_island_snaps.sql), #12 (trial accounts unused 30 days deleted), #13 (refill screen explains),
#15 (unknown AI age refused), #16 (extra cup entry only on its own button), #17 (no bot numbers in public data),
#18 (Permissions-Policy), #19 (privacy page updated, still marked Draft), #20, plus an 18+ / Terms step at sign-up
and before the first payment, and a per-IP flood guard in memory before any database work (part of #3).
#14 was a false alarm (match ids are checked). Still OWNER: #1 legal sign-off, #2 backups, #3 Vercel Firewall +
spend alerts, run supabase/011_island_snaps.sql, ALERT_WEBHOOK_URL, the signed-in browser pass.

## Summary: NOT READY for a public launch yet

The game code is in good shape: 573 automated tests, 13,600 hostile fuzz calls with no crash, all reintroduced
cheating bugs caught, and no money-from-nothing loop. Every result (duels, raids, adventures, timers, loot) is
decided on the server. What blocks a public launch is mostly outside the code: legal, backups, cost control
and protection against floods, plus a few code fixes and a balance pass.

### Top 10 blockers
1. **Legal not done** (Critical): Terms and Privacy are drafts with blanks; Siege Cup prizes and stake duels
   can count as gambling; no age gate; nothing about Hello Minds or stake duels in the Privacy page.
2. **Backups not confirmed** (Critical): no proof that Supabase backups / point-in-time restore are on, or that
   a restore was ever tested. One bad bug or attack could wipe player progress.
3. **Flood / cost protection** (High): every request costs 2-3 database calls (rate-limit check + ban check),
   and AI steps keep a server function open up to 50 s. A flood or a viral day can run up Vercel and Supabase
   bills or hit plan limits. The Vercel Firewall is not set up.
4. **Same-connection checks can be dodged through the AI-key API and Autopilot** (High): those requests reach
   the game without the player's IP, so "two accounts on one connection" rules see a fake, shared connection.
5. **Session key fallback** (High if mis-set): if `SESSION_SECRET` and `SUPABASE_SECRET_KEY` were both missing,
   login tokens would be signed with a fixed key that anyone could forge. Today it is set (logins work), but the
   code should refuse to start instead of falling back.
6. **Raids are not worth doing at low levels** (High, balance): after the loot cut, raiding a level-1 game
   village loses about 85-95 Dust; level 2 earns about 10-20.
7. **Wood and stone run out long before Dust** (High, balance): Town Hall 9→10 needs 3,000 wood + 3,000 stone,
   but adventures give about 20-60 of each per run. Upgrades past Lv5-6 stall.
8. **The AI-key API has no request limit before the key check** (Medium): unauthenticated calls each cost a
   database lookup. Good for floods, not for us.
9. **The whole jsdelivr CDN may run scripts on our page** (Medium): only the Supabase library is loaded from
   there, but any script on that CDN is allowed, which weakens the protection against injected scripts.
10. **Signed-in browser QA not done** (Medium): Claude in Chrome was not connected, so the wallet + Hello Minds
    screens were not clicked through in this pass (see "Still to check" below).

## Findings

| # | Sev | Where | Problem | How to see it | What someone gains | Fix |
|---|---|---|---|---|---|---|
| 1 | Critical | web/terms.html, web/privacy.html, docs/LEGAL_REVIEW.md | Drafts with `[blanks]`; no age gate; no acceptance step; Siege Cup paid entries + prizes and stake duels (Gems can be bought) may be gambling; bots look like players | Open the pages | Legal and app-store / payment-provider risk | Lawyer review; age 18+ gate; accept-terms step before first payment; consider making stake duels Dust-only and cups free-entry where needed |
| 2 | Critical | Supabase settings | Backups / point-in-time restore not confirmed, restore never tested | Supabase → Database → Backups | A lost database = every player's progress gone | Turn on daily backups + PITR (Pro plan), do one test restore into a copy |
| 3 | High | lib/http.js:18-21, all routes | Each request does a `hit_rate` write + ban read in the database before anything else; no edge limits | Read the code | A flood makes every request cost DB time and money | Vercel Firewall rate-limit rules on `/api/*` (by IP), Attack Challenge Mode ready; set spend limits/alerts on Vercel and Supabase |
| 4 | High | lib/routes/autopilot.js (`next`, `duel_think`), lib/hmserver.js | AI questions keep a function open up to 50 s each; many players with Autopilot = long-running functions all day | Read the code | Big Vercel function bill, possible concurrency limits | Move the wait to the browser or a queue/worker; or lower to ~20 s and let the browser retry; watch Vercel usage after launch |
| 5 | High | lib/routes/agent.js:60 (`inner`) | Inner calls carry no `x-forwarded-for`, so `deviceKey()` is the same fake value for every AI-key / Autopilot request | Raid a friend's island via the AI-key API from the same Wi-Fi | Moving Dust between own accounts past the same-connection rules | Pass the caller's `x-forwarded-for` (and user-agent) into `inner()` headers |
| 6 | High | lib/auth.js:6 | Falls back to a fixed signing key if no secret is set | Read the code | Forged logins as any player, if the secret is ever missing | Throw at start-up when `SESSION_SECRET` is missing; set a long random `SESSION_SECRET` in Vercel |
| 7 | High | web/src/island/raid.js:376, botLoot | Raid loot cut too far: level 1 village nets −85..−95 Dust, level 2 +10..+20 (troops 215 + fee 45) | `node tools/sim_economy.mjs` | Players stop raiding (a core loop) | LOOT_SHARE ~0.18 and game-village loot ~+40%, or cheaper troops; re-run sims |
| 8 | High | rules upgradeCost (Town Hall wood/stone = Dust/20) | Wood/stone needs grow to 3,000 per upgrade, income stays ~20-60 per adventure | Upgrade table below | Progress stalls mid-game; pushes players to Gems | Lower the wood/stone share at high levels, or add a wood/stone source (Mill/Barn production, adventure scaling, a Gem → wood/stone pack) |
| 9 | Medium | lib/routes/agent.js:155 | `limit: false`; bad keys cost a DB lookup each, no IP limit | POST /api/agent with random keys | Cheap DB load | Add an IP rate limit before the key lookup |
| 10 | Medium | vercel.json CSP, web/src/net.js:51 | `script-src` allows all of cdn.jsdelivr.net | Read the header | An injected script could load any jsdelivr file | Bundle supabase-js into `web/vendor/` (like the Hello Minds SDK) and drop jsdelivr from the CSP |
| 11 | Medium | Owner | No way to restore one player's island from an older copy | Admin screen | Support cannot fix "I lost my base" | Keep daily island snapshots (or rely on PITR + a documented "restore one row" step) |
| 12 | Medium | lib/routes/auth_guest.js:12 | 10 trial accounts per 10 min per IP, forever | Script trial logins | Database bloat over time | Clean up trial accounts unused for 30 days (cron) |
| 13 | Medium | docs/ECONOMY tools | A Dust refill (3,000) is worth far more than a ranked win pays (60 Dust per Mind) | Numbers below | Refills only make sense for rating/chests; players may feel cheated | Fine if intended; say "for rating and chests" on the refill screen |
| 14 | Low | lib/routes/match_forfeit.js:5, agent duel ops | Match id not format-checked before the query | Send `id: "x"` | Only an error (no data), but noisy logs | Same `/^[0-9a-f-]{36}$/` check as match_act |
| 15 | Low | lib/routes/autopilot.js:169 | An AI with no `createdAt` from Hello Minds skips the "new AI" check | Depends on the Hello Minds reply | Re-using an old AI | Refuse when `createdAt` is missing |
| 16 | Low | lib/routes/cup.js:110 | A second "Enter" tap while the first is still saving buys a second entry (if you hold 2+ Minds) | Double-tap Enter | Spends 5 Gems by accident | Ask before buying an extra entry (the button already says "+1 entry") and disable while busy |
| 17 | Low | public `/api/leaderboard`, `/api/player` | Shows short wallet (0x1234…abcd), online status, bot wins/losses to anyone | Open the URL | Mild privacy; reveals that bot games exist | Drop botWins/botLosses from public data if bots stay hidden |
| 18 | Low | vercel.json | No `Permissions-Policy` header | Read headers | Nothing today | Add `camera=(), microphone=(), geolocation=()` |
| 19 | Low | web/privacy.html | Purchase history (30 days), Hello Minds link, AI messages, stake duels not described | Read the page | Policy does not match reality | Update with the lawyer |
| 20 | Low | tools/economy_audit.mjs | Still lists "Scout job" ceilings (jobs are gone) | Run it | Confusing numbers | Remove the old line |

What was checked and is fine: sessions are HMAC-signed and compared in constant time; wallet login uses a one-time
nonce; admin needs `ADMIN_ADDRESSES`; every table has row-level security; no secrets in browser code; player text
is escaped before HTML (test enforced); prototype-key tricks are refused; island actions, raids, adventures, duels
and cup tries are replayed or decided on the server; Gem payments are credited once per transaction; trades and
stake duels move goods exactly once with escrow; the Hello Minds token is only used per request and never stored or
logged; the AI cannot buy Gems or spend over the player's typed daily limit; nobody can hand-play a duel the AI is
playing; leaving a duel forfeits / both gone = tie; the cron route needs its secret (401 without); HSTS, frame
blocking and nosniff are on.

## Balance numbers

| Thing | Number |
|---|---|
| Farming, 24 plots, beans ×6 a day / carrots ×6 / melons ×3 | 1,440 / 4,320 / 6,480 Dust a day |
| Adventure full clear (lv1 → lv4), real runs ≈ 40% | 504 → 1,685 Dust, 2-5 Gems, 28-62 wood/stone |
| Raid on a game village (lv1 / lv2 / lv3), after troops + fee | −85 / +20 / +125 Dust |
| Real-player raids | capped at 3,000 Dust a day, 2 a day on the same island |
| Ranked duel | win 60 / loss 15 Dust per Mind; refill 3,000 Dust or 8 Gems (3 per Mind a day) |
| Town Hall 1→2 … 9→10 | 1,500 → 60,000 Dust and 75 → 3,000 wood + stone each; 6 min → 29 h |
| Cottage 9→10 | 17,000 Dust + 1,020 wood, 24 h (rush ≈ 288 Gems) |
| Gem packs | 50 / 120 / 300 / 800 Gems for $5 / $10 / $20 / $50 (or ETH); 1 Gem ≈ 100-120 Dust |
| Rank Pass | 5,000 Dust or 30 Gems for 7 days × 5 games |
| Duel bots | hard bot beats random play 88%; hard vs hard ≈ 50/50 |
| Raid sims | Town-Hall-matched villages: about 1.1-2.9 stars depending on army and Minds |

New player vs Gem buyer: a free player gets to Town Hall 5 in roughly 1-2 weeks of daily play, then wood/stone
becomes the wall. Maxing everything costs well over a million Dust plus tens of thousands of wood/stone, months
for a free player. $50 of Gems (800 Gems ≈ 80,000 Dust value) speeds up a few mid levels or rushes about 3 top
upgrades. Not pay-to-win in duels (skill + cards), but island progress leans on Gems after Lv6 until finding #8
is fixed.

Gems come from: purchases, Ogres and adventure clears (2-5), Siege Cup prizes, stake duels, trades/gifts
(200/day send limit), admin gifts. Gems go to: rushes, tickets, refills, Rank Pass, cup entries, Gem decorations,
cosmetics, Gem-priced shop items.

## Pre-launch checklist

| Item | Status |
|---|---|
| Automated tests (573), fuzz, mutation check, economy audit, eslint scan | ✅ all pass |
| Server decides every result; anti-cheat tests | ✅ |
| Row-level security on every table, no secrets in the browser | ✅ |
| HSTS, CSP, frame blocking, nosniff | ✅ (tighten CSP: #10, add Permissions-Policy: #18) |
| CRON_SECRET | ✅ set (cron answers 401 without it) |
| SESSION_SECRET set and fail-closed | ⚠️ set, but the code still falls back (#6) |
| Supabase backups + point-in-time restore, test restore | ❌ owner to confirm |
| Vercel Firewall / attack mode, spend limits and usage alerts | ❌ owner |
| ALERT_WEBHOOK_URL / error alerts | ❓ not checked from outside: owner to confirm in Vercel |
| Rollback plan for a bad deploy | ⚠️ Vercel "Instant Rollback" exists: write the 3-step note in docs/DEPLOY.md |
| Restore one player's island | ❌ (#11) |
| Status / incident plan (who checks, where players are told) | ❌ |
| Legal: Terms, Privacy, age gate, gambling review, refunds | ❌ (#1) |
| One small real Gem purchase (ETH and USDG) | ❓ owner |
| Load test on a separate Supabase copy | ❌ not done (never on live) |
| Custom domain | ❌ (do it before launch so nobody has to sign in again) |
| Balance pass: raids (#7), wood/stone (#8) | ❌ |

## Still to check (needs your signed-in Chrome)
Claude in Chrome was not connected, so these screens were not clicked through with your wallet and Hello Minds:
lobby, every shop tab, island build/edit/upgrades/restore, raid, adventure, world map, ranked/classic/practice,
Rank Pass, Siege Cup with 2 Minds, Mind Town (chat, megaphone, player card, trade, stake duel needs a second
account), friends, mail, profile, leaderboard, cosmetics, purchase history, settings, and the AI dock (connect,
awaken, train, plan approval, chat, Follow on a duel and the island, History, Gem limit, cognition warnings) at
phone size and desktop. The logged-out start screen loads fine at phone size, with no errors in the console.
