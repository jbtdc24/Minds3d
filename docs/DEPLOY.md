# Deployment checklist and rollback

The game deploys when `main` is pushed: Vercel builds it. Work happens on `island`.

## Before deploying
```
node tools/test_server.mjs
node tools/fuzz_server.mjs 300
node tools/mutation_check.mjs
node tools/economy_audit.mjs
npm audit --omit=dev
npx --yes eslint@8 --no-eslintrc --env browser,es2022,node --parser-options=sourceType:module,ecmaVersion:latest --rule '{"no-undef":"error"}' web/src lib api
```
All must pass. Then `git checkout main && git merge --ff-only island && git push origin main island`.

## Environment variables (Vercel, never in the repo)
| Name | Needed | Purpose |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Yes | Database. Also signs sessions and chat if `SESSION_SECRET` is unset |
| `SESSION_SECRET` | Recommended | Keeps sessions and the cup seed independent of the database key |
| `SUPABASE_URL` | Optional | Has a default |
| `TREASURY_ADDRESS` | For Gem sales | Receives ETH |
| `ADMIN_ADDRESSES`, `ADMIN_PLAYER_IDS` | For admin | Who can use the admin screen |
| `ROBINHOOD_RPC` | Optional | Own chain RPC, for reliability |

Changing the database key or `SESSION_SECRET` signs everyone out and changes the chat signing key.

## Database migrations
| File | Status |
|---|---|
| `007_community.sql` | Run by the owner, confirmed by live checks |
| `008_sessions.sql` | **Owner must run.** Until then, "Log out everywhere" says it is being set up. Everything else works, and bans keep working |

Every migration only adds things, so old code keeps working with the new database.

## Backups
Confirm Supabase backups in the dashboard before launch: **Database → Backups**. The free plan may not include them. No restore has been tested.

## Rollback
1. **Fastest:** Vercel dashboard → Deployments → the last good one → Promote to Production. Takes under a minute.
2. **In git:** `git revert` the bad commits on `island`, fast-forward `main`, push.
3. Migrations do not need undoing, because they only add columns and tables.

Saved island data is not changed by this release, apart from small added fields (`dk`, `pl`) that old code ignores.

## Breaking changes this release
- A player mid-adventure on an old browser tab gets "Please refresh", and that trip's loot is lost. Potions come back on the next start.
- Duels, raids, cups and island saves are unaffected.
- Sessions made before this release keep working until the owner uses "Log out everywhere".
- Game rule changes: 2 paying raids a day per target, no loot between accounts on one connection, 6,000 Dust a day from real players, cup tries are 3 different villages with a 3.5-minute window.

## After deploying
1. Confirm `/src/island/advsim.js` is served and the content policy header is present.
2. Run a smoke test with a new trial account: island, adventure, raid, Town, mail, cup list.
3. Confirm the public database key still reads nothing.
4. Test a real Gem purchase and two-wallet chat.
