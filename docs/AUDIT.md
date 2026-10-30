# MINDS CLASH security and QA audit, round 2 (2026-10-31)

**Scope:** source code plus a local in-memory test database, simulated payments and simulated chain. No production data, real funds or real players were used, and nothing from this round is deployed. All fixes sit in local commits on `island`.

**Rerun the evidence:**
```
node tools/test_server.mjs
node tools/fuzz_server.mjs 300
node tools/mutation_check.mjs
```

## 1. Overall verdict

**Not release-ready until the fixes are deployed and the blocked items below are tested.** No CRITICAL finding was reproduced. Eight HIGH or MEDIUM findings were reproduced and fixed.

| Use | Readiness |
|---|---|
| Normal play and Dust rewards | Ready after deployment and a browser pass |
| Selling Gems | Only after one real wallet purchase on the deployed version |
| Gem cups | Acceptable with the limits below |
| Real-money prizes or cash-out | **Not ready.** Needs server-side play and legal advice |

## 2. Tests executed

| Test | Result |
|---|---|
| `tools/test_server.mjs` | 318 passed, 0 failed. Passed 6 runs in a row before the final tool changes, and again at the end |
| `tools/fuzz_server.mjs 300` | 9,000 hostile calls over 30 routes: 0 crashes, 0 server errors, island values stayed valid |
| `tools/mutation_check.mjs` | Baseline 0 failures. 30 of 30 reintroduced bugs caught by a named failing test |
| ESLint undefined-name scan | Clean |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `sim_duel`, `sim_raid`, `sim_economy` | Ran without errors |
| Reproduction script (before fixes) | Reproduced every finding marked "Reproduced" below |
| Local browser | App loads, Town and island open, no script errors. Signed chat, replay refusal and tamper refusal worked in browser crypto |

Three test problems were found and corrected during this audit. A random adventure test was flaky, which made 3 mutation results falsely "caught". The bot-name test was too weak. The first mutation runs had a broken baseline of -1. All three mutation runs that mattered were repeated after the fixes.

### What the suite does not prove
It uses an in-memory stand-in for the database. Real database locking, real Row Level Security and real network timing are not exercised by it. Its concurrency tests use overlapping requests, not true parallel database sessions.

## 3. Findings

| # | Severity | Finding | Reproduced | Status |
|---|---|---|---|---|
| 1 | HIGH | Paid Gem claim on a busy island kept the payment record, gave no Gems and refused retries | Yes: paid, 0 Gems, retry 409 | VERIFIED FIXED |
| 2 | HIGH | Revenge raids moved Dust between accounts without using the daily raid count | Yes: 12,000 Dust in 6 raids (log entries set up by the script) | PARTIALLY MITIGATED |
| 3 | MEDIUM | Island data carried the current raid snapshot, including hidden traps | Yes: snapshot present in the response | VERIFIED FIXED |
| 4 | MEDIUM | Raid and cup responses included hidden traps | Yes: 5 traps in a cup response | VERIFIED FIXED |
| 5 | MEDIUM | Storing and replacing a half-built building skipped its 600-second timer | Yes | VERIFIED FIXED |
| 6 | MEDIUM | An AI key without Gem permission could buy Gem-only decorations | Yes: 40 to 25 Gems | VERIFIED FIXED |
| 7 | MEDIUM | One cup try could be scored twice | Yes: two 200 responses | VERIFIED FIXED |
| 8 | MEDIUM | All cup tries used one village | Yes | PARTIALLY MITIGATED |
| 9 | MEDIUM | Live chat lines could be forged for 15 seconds | By code review | VERIFIED FIXED |
| 10 | LOW | Town Time paid twice from two requests | Yes: 80 Dust, 2 rewards | VERIFIED FIXED |
| 11 | LOW | Town activity was a client-side flag | Yes | PARTIALLY MITIGATED |
| 12 | LOW | Bot names could match real players, for example simple names like Luna | By code review, then test | VERIFIED FIXED |
| 13 | LOW | Malformed JSON and non-list Mind fields caused server errors | Yes: fuzzer | VERIFIED FIXED |
| 14 | LOW | Switched-off features showed a generic error instead of their message | Yes: fuzzer | VERIFIED FIXED |
| 15 | LOW | Only 2 payment confirmations | Simulated | VERIFIED FIXED (now 6) |
| 16 | INFORMATIONAL | Town positions and displayed Mind are not signed, so a player's avatar could be moved by a forged presence entry | By code review, not executed | CONFIRMED VULNERABLE |
| 17 | INFORMATIONAL | Login nonces can be overwritten by anyone repeatedly requesting one for a wallet (nuisance only, rate limited) | By code review | CONFIRMED VULNERABLE |
| 18 | INFORMATIONAL | Sessions last 14 days and cannot be revoked one by one. Bans still stop them | By code review | CONFIRMED VULNERABLE |

## 4. Known limits

| Item | Tests | Result | Status |
|---|---|---|---|
| **A. Offline cup planning** | Seed guess, repeat village, double scoring, instant finish, offline simulator | Village is secret until a try starts, and each try is new. The simulator still runs about 27 ms a run, so a try can be optimised during its 6-minute window. A second account can scout all 3 villages for 5 Gems | **Reduced**, PARTIALLY MITIGATED |
| **B. Adventure loot** | Instant boss, full clear on hardest island, forged ids, bad potion counts, repeat claims | All refused. Claims within physical limits are still believed | **Reduced**, PARTIALLY MITIGATED |
| **C. Instant chat** | Forged words, stolen and edited certificates, replay, stale lines, room moves, unsigned lines | All refused with real signatures. The 15-second trust gap is gone | **Resolved** in tests. Two wallets still need a live try |
| **D. Town Time** | Forged flag, idle, double requests, daily cap, next-day reset, reconnect | Flag ignored, one payment per window, cap held at 6. A script can still fake movement | **Reduced**, PARTIALLY MITIGATED. Maximum 240 Dust a day |
| **E. Raid snapshots** | API responses and island data | Hidden traps no longer reach the browser; the server fights with them and reports how many hit | **Resolved** for traps. Visible layout is public by design |
| **F. Alt accounts** | Revenge loop, repeat raids, same connection | Dust stops after 2 raids a day per target, and same-connection raids pay nothing. Different connections can still move up to about 4,000 Dust a day per pair. Gems can move slowly through cups | **Reduced**, PARTIALLY MITIGATED |
| **G. Bot names** | Name collisions, ranking, rewards | Bots cannot take a real name, stay off leaderboards, and cannot enter cups. Bot wins count at half value. Bots are still undisclosed to players | **Reduced**. Disclosure is a business and trust decision |

## 5. Earlier fixes, retested

| Item | Evidence | Status |
|---|---|---|
| Adventure validation | Cheat tests and mutation caught | VERIFIED FIXED |
| Duplicate duel results | Concurrent forfeit test and mutation caught | VERIFIED FIXED |
| Concurrent raid attacks | Concurrent test and mutation caught | VERIFIED FIXED |
| Forfeits and disconnects | Stale match test and mutation caught | VERIFIED FIXED |
| Cup secret seed | Test and mutation caught | VERIFIED FIXED |
| No-score cup refunds | Test and mutation caught | VERIFIED FIXED |
| Cup timing | Test and mutation caught | VERIFIED FIXED |
| Prototype lookups | Tests, fuzzer and mutation caught | VERIFIED FIXED |
| Key ids and malformed bodies | Tests and fuzzer | VERIFIED FIXED |
| Content policy | File check this round; live header confirmed in round 1 | VERIFIED FIXED |
| Dependencies | `npm audit`: 0 vulnerabilities | VERIFIED NOT VULNERABLE |
| Lobby and connection cleanup | Local browser pass only | PARTIALLY MITIGATED: no long-session test |

| Area | Evidence | Status |
|---|---|---|
| Session integrity | Forged, altered, expired and junk tokens refused | VERIFIED NOT VULNERABLE |
| Login nonces | Replay, expiry and wrong-site signatures refused | VERIFIED NOT VULNERABLE |
| Payment verification | Duplicate, concurrent, failed, underpaid, wrong chain, wrong wallet and wrong recipient refused, all simulated | VERIFIED NOT VULNERABLE in simulation |
| Admin and access control | Admin, mail, match, friend chat and AI key access refused for other players | VERIFIED NOT VULNERABLE |
| Duel rules | Bad cards, used cards, changed picks, unknown spells and outsider actions refused | VERIFIED NOT VULNERABLE |
| Duel hidden information | View has no seed, future prizes or rival pick | VERIFIED NOT VULNERABLE |
| Database permissions | File check: every table has row security and no function is public. Live probe with the public key was clean in round 1 and not repeated | PARTIALLY MITIGATED: no fresh live probe of the newest state |

## 6. Blocked

| Item | Why | Status |
|---|---|---|
| Real wallet login and purchase | Needs a real wallet and funds | NOT TESTED — BLOCKED |
| Real chain reorganisation | Only confirmation depth can be simulated | NOT TESTED — BLOCKED |
| Real Supabase locking and live Row Level Security | Forbidden on production; no isolated Supabase copy exists | NOT TESTED — BLOCKED |
| Two real clients in Town, friend and duel chat with the new signing | Needs a deployment and two wallets | NOT TESTED — BLOCKED |
| Full raid, adventure and duel play in a browser | The test browser ran at about 3 frames a second | NOT TESTED — BLOCKED |
| Load and denial-of-service limits | Must not be run against production. Single-request cost measured: full raid replay about 150 ms, 40 island actions about 6 ms | NOT TESTED — BLOCKED |
| Long-session memory and phone hardware | Needs real devices | NOT TESTED — BLOCKED |

## 7. Files changed

- **New:** `lib/chatcert.js`, `lib/names.js`, `lib/routes/chat_cert.js`, `web/src/chatsign.js`, `tools/fuzz_server.mjs`, `tools/mutation_check.mjs`
- **Server:** `api/router.js`, `lib/game.js`, `lib/http.js`, `lib/matchmaking.js`, `lib/routes/agent.js`, `lib/routes/cup.js`, `lib/routes/gems.js`, `lib/routes/island.js`, `lib/routes/queue_join.js`, `lib/routes/raid.js`, `lib/routes/town.js`
- **Shared rules:** `web/src/island/raid.js`, `web/src/island/rules.js`
- **Client:** `web/src/app.js`, `web/src/net.js`, `web/src/town.js`, `web/style.css`
- **Tests:** `tools/test_server.mjs` grew from 238 to 318 checks

No database migration is needed for this round.

## 8. Remaining work, by priority

1. Deploy, then do one real Gem purchase and a two-wallet chat test.
2. Repeat the read-only public-key database probe after deployment.
3. Create an isolated Supabase project for real locking, permission and load tests.
4. Before any real-money prize: run cup attacks and adventure fights on the server, and get legal advice.
5. Decide whether to disclose bots.
6. Sign Town positions if impersonating a player's location becomes a real problem.
