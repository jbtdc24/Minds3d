# Security and QA audit (2026-10-31)

Run: `node tools/test_server.mjs`. The "cheat tests" block attempts each attack below, so a regression fails the build.

## Fixed
| Severity | Problem | Fix |
|---|---|---|
| High | Adventure loot was trusted: a cheater could claim bosses and chests for free Gems | Server checks walk and fight time and damage against hero and potions; impossible claims are refused and flagged (`adv_impossible`) |
| High | Two result requests at once could pay duel points and Dust twice | Only one request can close a match (`ended_at` claim) |
| High | Two attack requests at once could take a defender's Dust twice | The raid is closed in one saved step before loot moves |
| Medium | Closing the tab avoided a duel loss | A match left for 30 minutes is a forfeit |
| Medium | The cup village could be worked out in advance from the date | The seed now uses a server secret |
| Medium | A cup with players but no scores kept their Gems | Every entry is refunded |
| Medium | A cup attack could be planned offline and finished instantly | Inputs cannot be later than real elapsed time; refused and flagged (`cup_fast`) |
| Low | Text like `constructor` matched built-in properties in lookups | Tables have no prototype |
| Low | Key ids were not checked; an empty body could crash a route | Validated |
| Low | No browser content policy | CSP added in `vercel.json` |
| Low | viem pulled in a vulnerable `ws` | Updated; `npm audit` is clean |
| Low | Lobby kept drawing behind Town; leaving Town while connecting left a live channel open | Fixed |

## Checked and sound
Public database key reads no rows and cannot call server functions. Secret and source files are not served. Forged or altered sessions are refused. Payment claims check treasury, sender, amount, chain, confirmations and single use. Login nonces are single use. Players cannot use admin actions or read another player's match or mail. Duel views hide the seed, future prizes and the rival's pick.

## Known limits (accepted for now)
- **Offline planning:** after a first try, a cup player can rehearse the same village offline. Skill is still the score, but a very determined cheat could gain an edge. Do not use real-money prizes until this is reviewed.
- **Instant chat lines** are unverified for up to 15 seconds. They show faint until the server confirms them, and names come from the server list.
- **Adventure checks are plausibility checks,** not a full replay. A careful cheat can still claim the best loot that is physically possible.
- **Town Time** trusts the client's "active" flag. The cost is capped at 240 Dust a day.
- **Raid snapshots** include hidden traps, because the browser runs the same battle. A modified client could see them.
- **Alt accounts** can move Dust by raiding each other (capped, Dust only, never Gems).
- **Bot opponents and raiders** still use player-style names.
