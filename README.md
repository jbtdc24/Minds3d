# Mindclash

A 1v1 card duel for the 3,333 minds.games (MDG) NFTs on Robinhood Chain. Both players play a secret card for each crown, then spells flip the result. Fighters are built in 3D (or 2D) straight from the NFT layer art, so they match the NFTs 1:1. Rules: see `PLAN.md` or the in-game "How to play".

## Play locally
```bash
python -m http.server 5173 --directory web
```
Open http://localhost:5173. Without the API the game runs offline: practice vs bots with demo Minds.

## Code
- `web/src/duel/engine.js` — Prize Duel rules (pure, deterministic, shared by browser and server). `web/src/duel/bot.js` — bot levels.
- `web/src/app.js` — screens, card table, reveal sequence. `web/src/net.js` — API, wallet sign-in, live updates, offline match.
- `web/src/nft2d.js`, `fighter2d.js`, `stage2d.js`, `audio.js`, `chat.js` — NFT sprites, 2D fighters, stages (painted backdrops, particles, FX), synth audio, preset chat lines.
- `api/router.js` + `lib/` — Vercel serverless API (one function), Supabase via PostgREST, on-chain ownership (`lib/chain.js`).
- `supabase/schema.sql` — database (RLS on, no public access).
- `tools/` — `sim_duel.mjs` (balance), `test_server.mjs` (server tests), `build_tokens.py` / `verify_all.py` (on-chain ID mapping + checks), `process_art.py` (OpenArt renders → `web/assets`).

## Deploy
Vercel imports the repo; `vercel.json` serves `web/` and rewrites `/api/*` to the router. Set `SUPABASE_SECRET_KEY` in Vercel env vars.
