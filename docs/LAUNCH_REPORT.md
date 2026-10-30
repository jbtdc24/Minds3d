# MINDS CLASH launch report (2026-10-31)

**Deployed:** yes, on the owner's instruction. Live version: commit `a597fc2`, confirmed by serving `src/island/advsim.js` and a live smoke test.

| Question | Answer |
|---|---|
| Ready for public launch? | **Soft launch: yes, after 3 owner checks below.** Full public launch: not until real database load is tested |
| Ready for real-money prizes? | **No.** See `docs/REAL_MONEY.md` |

## Owner checks before inviting players
1. Run `supabase/008_sessions.sql`.
2. Make one real Gem purchase and one wallet login.
3. Test chat with two wallets, and play one raid, adventure and duel.

## Checklist

### Phase 1: security
| Item | Status | Evidence |
|---|---|---|
| Fabricated cup results | VERIFIED COMPLETE | Server replays every attack |
| Cup rehearsal and scouting | PARTIALLY COMPLETE | 3 villages a day, secret seed, secret damage roll, hidden traps, 3.5-minute window. A try can still be studied while it runs, and a second account can scout |
| Fabricated adventures | FIXED AND VERIFIED | Combat moved to `advsim.js`; the server replays taps and ignores claims. Browser and server matched exactly in Chromium |
| Alt-account farming | PARTIALLY COMPLETE | 2 paying raids per target a day, 6,000 Dust a day ceiling, same-connection raids pay nothing, cup winners on one connection are flagged. VPNs still get around connection checks |
| Town rewards | PARTIALLY COMPLETE | **Not changed.** The owner said "no rewards", then "not yet". Options below |
| Player positions | FIXED AND VERIFIED | Positions are signed. Unit tests pass; not tried by two real clients |
| Wallet login | FIXED AND VERIFIED | Challenges can't be replaced, a bad signature can't cancel a login, 20 tries per wallet per 10 minutes |
| Log out everywhere | PARTIALLY COMPLETE | Code live and tested. Needs `008_sessions.sql`; returns 503 until then |

### Phase 2: earlier fixes
| Item | Status |
|---|---|
| Gem purchases and payment recovery | FIXED AND VERIFIED in simulation; real purchase BLOCKED / NOT TESTED |
| Hidden traps | FIXED AND VERIFIED, also live |
| Fake chat | FIXED AND VERIFIED in tests; two wallets BLOCKED / NOT TESTED |
| Build timers | FIXED AND VERIFIED |
| AI spending | FIXED AND VERIFIED |
| Duplicate cup scoring, Town Time | FIXED AND VERIFIED |
| Duel, raid, adventure duplication | FIXED AND VERIFIED |
| Malformed requests | FIXED AND VERIFIED, also live |
| Authentication and authorization | VERIFIED COMPLETE |
| Database permissions | VERIFIED COMPLETE for the public key on 9 tables, live |
| Bot disclosure | PARTIALLY COMPLETE: bots can't take real names, but players aren't told. Owner decision |

### Phase 3: complete game
| Area | Status |
|---|---|
| Island, buildings, timers, Dust, Gems | VERIFIED COMPLETE (server rules) |
| Raids, cups, adventures, AI permissions, duplicates, concurrency | VERIFIED COMPLETE (server rules) |
| Adventure screen in a browser | VERIFIED COMPLETE, scripted |
| Lobby, Town, island, shop, mail, friends layouts on phones | FIXED AND VERIFIED: 2 portrait bugs fixed at 375×812 |
| Wallet login and Gem purchase | BLOCKED / NOT TESTED: needs a real wallet |
| Full raid and duel playthrough by hand | BLOCKED / NOT TESTED: test browser runs at about 3 frames a second |
| Safari, Firefox, real phones | BLOCKED / NOT TESTED |
| Audio levels | BLOCKED / NOT TESTED: needs ears |
| Cup payout on a real day | BLOCKED / NOT TESTED: tested with time faked |

### Phase 4: economy
**VERIFIED COMPLETE:** `tools/economy_audit.mjs` found no money-from-nothing loop in buy-and-sell, build-and-demolish or crafting.

Balance notes, nothing changed:
- Short crops pay best per hour: beans 20, carrots 15, melons 11, star fruit 10 Dust. This rewards active players. Slow crops are still useful for long absences.
- A level 1 raid nets only about 80 Dust if the whole army dies.
- Gems convert to 120 Dust each. Dust cannot become Gems, so this is not a loop.

### Phase 5: performance
| Test | Result |
|---|---|
| One process, 25 ms simulated database | 500 players: p95 838 ms. 1,000: p95 2.1 s. 2,000: p95 4.9 s |
| 10% database failures | Clean errors, island values stayed valid |
| 5% very slow database calls | p99 2.2 s, no failures |
| Memory, 30,000 requests | 20 MB to 21 MB, no leak seen |
| Hostile input | 6,000 calls: 0 crashes |
| **Real capacity** | **BLOCKED / NOT TESTED.** Needs a separate Supabase project. The figures above are not a capacity claim |

**Biggest bottleneck:** live requests take 1 to 2 seconds. Most requests make 4 to 7 database calls, and the server runs in the US (`iad1`). If the database is in Asia, each call crosses the Pacific. See owner action below.

### Phase 6: deployment
| Item | Status |
|---|---|
| All tests before deploy | VERIFIED COMPLETE |
| Dependency and secret checks | VERIFIED COMPLETE: 0 vulnerabilities, no secrets in the repo |
| Rollback plan | VERIFIED COMPLETE as a document: `docs/DEPLOY.md`. Not rehearsed |
| Migrations | PARTIALLY COMPLETE: 008 waiting for the owner |
| Backups | BLOCKED / NOT TESTED: owner must confirm in Supabase |
| Live smoke test | FIXED AND VERIFIED: found one bug, fixed, redeployed, all checks passed |

### Phase 7: real money
**FAILED by design:** not ready. `docs/REAL_MONEY.md` lists the requirements.

## Tests executed (final)
| Test | Result |
|---|---|
| `tools/test_server.mjs` | 344 passed, 0 failed |
| `tools/fuzz_server.mjs` | 6,000 hostile calls, 0 crashes, 0 server errors |
| `tools/mutation_check.mjs` | 38 of 38 reintroduced bugs caught from a clean baseline |
| `tools/economy_audit.mjs` | No exploit found |
| `tools/load_test.mjs` | Results above |
| `npm audit`, undefined-name scan | Clean |
| Live smoke test | All checks passed on the deployed version |

## Bugs found in this phase
- Adventure rewrite made gathering stop after a fight. Found by testing, fixed before deploy.
- Lobby buttons and the island toolbar were cut off on portrait phones.
- Broken JSON returned a server error on Vercel only. Found by the live smoke test.
- Test tool faults: flaky test, broken baseline, weak bot-name test. All corrected and rerun.

## Files changed
- **New:** `web/src/island/advsim.js`, `web/src/chatsign.js`, `lib/chatcert.js`, `lib/names.js`, `lib/routes/chat_cert.js`, `lib/routes/logout_all.js`, `supabase/008_sessions.sql`, `tools/fuzz_server.mjs`, `tools/mutation_check.mjs`, `tools/economy_audit.mjs`, `tools/load_test.mjs`, `docs/DEPLOY.md`, `docs/REAL_MONEY.md`
- **Changed:** `web/src/island/advview.js`, `adventure.js`, `raid.js`, `rules.js`, `web/src/app.js`, `town.js`, `net.js`, `web/index.html`, `web/style.css`, `lib/admin.js`, `auth.js`, `game.js`, `http.js`, `matchmaking.js`, `chatcert.js`, `lib/routes/adventure.js`, `agent.js`, `auth_nonce.js`, `auth_verify.js`, `cup.js`, `gems.js`, `island.js`, `queue_join.js`, `raid.js`, `town.js`, `api/router.js`, `tools/test_server.mjs`

## Remaining issues
| Issue | Risk | Needed | Blocks launch? |
|---|---|---|---|
| Real wallet and Gem purchase untested on this version | Payment flow could fail | One real purchase | **Yes** |
| `008_sessions.sql` not run | Log out everywhere unavailable | Owner runs it | No |
| Backups unconfirmed | Data loss | Check Supabase plan | **Yes for full launch** |
| Real database capacity unknown | Slowdowns under a crowd | Separate Supabase project | **Yes for full launch** |
| 1 to 2 second requests | Game feels slow | Match Vercel region to Supabase | No, but high value |
| Adventure replay on Safari and Firefox | Maths could differ slightly from the server, so loot on screen could differ from what is paid. The server stays correct | Test on those browsers | No |
| Cup rehearsal inside a try, scouting by alts | Unfair edge for Gems only | Live server-driven raids (a large rewrite) | No; **yes for real money** |
| Alts on VPNs | Up to 6,000 Dust a day | Identity checks | No |
| Town Time can be scripted | 240 Dust a day | Decide below | No |
| Bots not disclosed | Trust and legal risk if prizes or a partner pitch depend on it | Owner decision | No; **yes for real money** |

## Decisions for the owner
**Town rewards.** Safest default: remove Town Time and keep the small reward for meeting players, or remove both. Rewards attract scripts, and Town works as a social place without them. Nothing was changed, because this affects the economy.

**Bots.** Recommendation: label them before pitching Animoca.
